import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsEmail, MinLength } from 'class-validator';
import { EmailService } from './email.service';
import { Public } from '../../common/decorators/roles.decorator';

class ContactDto {
  @IsString() @MinLength(2) name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(2) subject: string;
  @IsString() @MinLength(10) message: string;
}

@ApiTags('Contact')
@Controller({ path: 'contact', version: '1' })
export class ContactController {
  constructor(private emailService: EmailService) {}

  @Post()
  @Public()
  @ApiOperation({ summary: 'Submit contact form' })
  async submit(@Body() dto: ContactDto) {
    await this.emailService.sendContactEmail(dto.name, dto.email, dto.subject, dto.message);
    return { success: true, message: 'Message sent successfully' };
  }
}
