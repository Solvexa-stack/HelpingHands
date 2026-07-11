import { Injectable, NotFoundException } from '@nestjs/common';
import { ActorContext } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRecipientDto, UpdateRecipientDto } from './dto/recipient.dto';

@Injectable()
export class RecipientsService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  async create(actor: ActorContext, dto: CreateRecipientDto) {
    if (dto.organizationId != null) {
      const org = await this.prisma.organization.findUnique({ where: { id: dto.organizationId } });
      if (!org) throw new NotFoundException(`Organization #${dto.organizationId} not found`);
    }
    const recipient = await this.prisma.recipient.create({
      data: { ...dto, createdByUserId: actor.userId },
    });
    this.eventBus.publish({
      event: 'recipient.created',
      actor,
      subject: { type: 'recipient', id: recipient.id },
      data: { name: recipient.name, type: recipient.type },
    });
    return recipient;
  }

  async list() {
    return this.prisma.recipient.findMany({
      where: { deletedAt: null },
      orderBy: { id: 'desc' },
    });
  }

  async detail(id: number) {
    const recipient = await this.prisma.recipient.findFirst({ where: { id, deletedAt: null } });
    if (!recipient) throw new NotFoundException(`Recipient #${id} not found`);
    return recipient;
  }

  async update(actor: ActorContext, id: number, dto: UpdateRecipientDto) {
    await this.detail(id);
    if (dto.organizationId != null) {
      const org = await this.prisma.organization.findUnique({ where: { id: dto.organizationId } });
      if (!org) throw new NotFoundException(`Organization #${dto.organizationId} not found`);
    }
    const updated = await this.prisma.recipient.update({ where: { id }, data: dto });
    this.eventBus.publish({
      event: 'recipient.updated',
      actor,
      subject: { type: 'recipient', id },
      data: { changedFields: Object.keys(dto) },
    });
    return updated;
  }
}
