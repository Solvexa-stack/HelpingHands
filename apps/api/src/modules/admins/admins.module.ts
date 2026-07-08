import { Module } from '@nestjs/common';
import { AdminsController } from './admins.controller';
import { AdminsService } from './admins.service';
import { RoleParityService } from './role-parity.service';

@Module({
  controllers: [AdminsController],
  providers: [AdminsService, RoleParityService],
  exports: [AdminsService],
})
export class AdminsModule {}
