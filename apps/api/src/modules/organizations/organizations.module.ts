import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';

/** W1-E2 org management + W6-E3 onboarding/verification. */
@Module({
  imports: [EmailModule, WorkflowModule],
  controllers: [VerificationController, OrganizationsController],
  providers: [OrganizationsService, VerificationService],
  exports: [OrganizationsService, VerificationService],
})
export class OrganizationsModule {}
