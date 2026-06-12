import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { ContactController } from './contact.controller';

@Global()
@Module({
  controllers: [ContactController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
