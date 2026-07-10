import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationType, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ActorContext } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkflowService } from '../workflow/workflow.service';
import { RegisterOrganizationDto } from './dto/organization.dto';

/**
 * Default capability set granted at ACTIVATION, per org type (05: "type
 * determines the default capability set at onboarding; the Board can adjust
 * per organization"). Municipalities: government entity, Board oversight,
 * funded via agreements — public donation drives stay off by default.
 */
export const CAPABILITIES_BY_TYPE: Record<OrganizationType, Record<string, boolean>> = {
  ngo: { canExecuteProjects: true, canReceivePublicFunds: true, canOpenDonations: true, isGovernmentEntity: false, requiresBoardOversight: false },
  municipality: { canExecuteProjects: true, canReceivePublicFunds: true, canOpenDonations: false, isGovernmentEntity: true, requiresBoardOversight: true },
  youth_team: { canExecuteProjects: true, canReceivePublicFunds: false, canOpenDonations: true, isGovernmentEntity: false, requiresBoardOversight: false },
  initiative: { canExecuteProjects: true, canReceivePublicFunds: false, canOpenDonations: false, isGovernmentEntity: false, requiresBoardOversight: false },
  board: { canExecuteProjects: false, canReceivePublicFunds: false, canOpenDonations: false, isGovernmentEntity: false, requiresBoardOversight: false },
};

/** Org types that may enter through self-service registration. */
const SELF_REGISTRABLE: OrganizationType[] = ['municipality', 'youth_team'];

/**
 * W6-E3 — municipality (and youth-team) onboarding on the `org-verification`
 * workflow (authored Wave 4, activated this wave): submitted → under_review →
 * verified → active | rejected. Verification demands official registration
 * documents on file AND a Board approval decision (workflow guards — not
 * code). Registration is flag-gated:
 *   ORG_SELF_REGISTRATION = off (default) | allowlist | open
 *   ORG_REGISTRATION_ALLOWLIST = comma-separated admin emails (the pilot gate)
 */
@Injectable()
export class VerificationService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private workflow: WorkflowService,
  ) {}

  // ─── Self-service registration (flag-gated, W6-E3-S1) ───────────────────────

  async registerOrganization(actor: ActorContext, dto: RegisterOrganizationDto) {
    this.assertRegistrationAllowed(dto);

    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.adminEmail } });
    if (existingUser) throw new BadRequestException('Email already registered');

    // The org's content block doubles as the anchor for official documents
    // (File.referenceId carries a hard FK to blocks).
    const block = await this.prisma.block.create({
      data: {
        category: 'about_us',
        isActive: false,
        translations: {
          create: [
            {
              languageCode: 'en',
              name: dto.name,
              slug: `org-${Date.now()}-${dto.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`,
              brief: `${dto.type} registration`,
              description: `Registration profile for ${dto.name}`,
            },
          ],
        },
      },
    });

    const organization = await this.prisma.organization.create({
      data: {
        type: dto.type,
        name: dto.name,
        registrationNumber: dto.registrationNumber,
        status: 'pending_verification',
        contentBlockId: block.id,
        // capabilities arrive at ACTIVATION — a pending org can do nothing
        capabilities: {},
      },
    });

    const admin = await this.prisma.admin.create({
      data: { firstName: dto.adminFirstName, lastName: dto.adminLastName, role: 'employee' },
    });
    const user = await this.prisma.user.create({
      data: {
        referenceId: admin.id,
        referenceType: 'admin',
        email: dto.adminEmail,
        password: await bcrypt.hash(dto.adminPassword, 12),
        isActive: true,
        joiningDate: new Date(),
      },
    });
    await this.prisma.organizationMembership.create({
      data: { organizationId: organization.id, userId: user.id },
    });
    await this.prisma.roleAssignment.create({
      data: { userId: user.id, role: 'org_admin', scopeType: 'organization', scopeId: organization.id },
    });

    await this.workflow.start(
      actor,
      { subjectType: 'organization', subjectId: organization.id },
      'org-verification',
    );

    this.eventBus.publish({
      event: 'organization.registered',
      actor,
      subject: { type: 'organization', id: organization.id },
      data: { name: dto.name, orgType: dto.type, adminUserId: user.id },
    });

    return {
      organizationId: organization.id,
      documentsBlockId: block.id,
      adminUserId: user.id,
      message:
        'Registration received. Upload your official registration documents, then the Board will review your application.',
    };
  }

  private assertRegistrationAllowed(dto: RegisterOrganizationDto): void {
    const mode = process.env.ORG_SELF_REGISTRATION ?? 'off';
    if (mode === 'off') {
      throw new ForbiddenException('Self-service organization registration is not open yet');
    }
    if (!SELF_REGISTRABLE.includes(dto.type)) {
      throw new BadRequestException(`Organization type "${dto.type}" cannot self-register`);
    }
    if (mode === 'allowlist') {
      const allowlist = (process.env.ORG_REGISTRATION_ALLOWLIST ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      if (!allowlist.includes(dto.adminEmail.toLowerCase())) {
        throw new ForbiddenException(
          'Registration is currently limited to the pilot program — contact the platform team',
        );
      }
    }
  }

  // ─── Board verification actions (workflow-driven, W6-E3-S1) ─────────────────

  async beginReview(actor: ActorContext, organizationId: number) {
    await this.orgOr404(organizationId);
    // manually created orgs (W1/W2 path) join the workflow lazily
    await this.workflow.ensurePositionedInstance(
      { subjectType: 'organization', subjectId: organizationId },
      'submitted',
      'org-verification',
    );
    await this.workflow.execute(actor, { subjectType: 'organization', subjectId: organizationId }, 'begin_review');
    return this.status(organizationId);
  }

  /** Guards on the transition demand documents on file + a Board approval decision. */
  async verify(actor: ActorContext, organizationId: number) {
    const organization = await this.orgOr404(organizationId);
    await this.workflow.execute(actor, { subjectType: 'organization', subjectId: organizationId }, 'verify', {
      sync: async (tx) => {
        await tx.organization.update({
          where: { id: organizationId },
          data: { verifiedAt: new Date(), verifiedBy: actor.userId },
        });
      },
      note: `verified ${organization.name}`,
    });
    return this.status(organizationId);
  }

  async reject(actor: ActorContext, organizationId: number) {
    await this.orgOr404(organizationId);
    await this.workflow.execute(actor, { subjectType: 'organization', subjectId: organizationId }, 'reject', {
      sync: async (tx) => {
        await tx.organization.update({ where: { id: organizationId }, data: { status: 'archived' } });
      },
    });
    return this.status(organizationId);
  }

  /** Terminal step: the org goes live with its type's default capabilities. */
  async activate(actor: ActorContext, organizationId: number) {
    const organization = await this.orgOr404(organizationId);
    const capabilities = CAPABILITIES_BY_TYPE[organization.type];
    const before = organization.capabilities;
    await this.workflow.execute(actor, { subjectType: 'organization', subjectId: organizationId }, 'activate', {
      sync: async (tx) => {
        await tx.organization.update({
          where: { id: organizationId },
          data: { status: 'active', capabilities: capabilities as Prisma.InputJsonValue },
        });
      },
    });
    this.eventBus.publish({
      event: 'capability.changed',
      actor,
      subject: { type: 'organization', id: organizationId },
      data: { before, after: capabilities, reason: 'org-verification activation defaults' },
    });
    return this.status(organizationId);
  }

  /** Verification state for the Board queue / onboarding screens. */
  async status(organizationId: number) {
    const organization = await this.orgOr404(organizationId);
    const instance = await this.workflow.instanceFor({
      subjectType: 'organization',
      subjectId: organizationId,
    });
    const documents = organization.contentBlockId
      ? await this.prisma.file.count({
          where: { referenceType: 'organization', referenceId: organization.contentBlockId, isActive: true },
        })
      : 0;
    const decisions = await this.prisma.boardDecision.findMany({
      where: { subjectType: 'organization', subjectId: organizationId },
      orderBy: { decidedAt: 'desc' },
    });
    return {
      organization,
      workflowState: instance?.currentStateKey ?? null,
      documentsOnFile: documents,
      decisions,
    };
  }

  private async orgOr404(id: number) {
    const organization = await this.prisma.organization.findFirst({ where: { id, deletedAt: null } });
    if (!organization) throw new NotFoundException(`Organization #${id} not found`);
    return organization;
  }
}
