import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { AdminRole } from '@prisma/client';
import { DonationsService } from './donations.service';
import { CreateDonationDto, UpdateDonationStatusDto, DonationQueryDto } from './dto/donation.dto';
import { Roles, Public } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Donations')
@Controller({ path: 'donations', version: '1' })
export class DonationsController {
  constructor(private donationsService: DonationsService) {}

  @Get()
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List donations (filtered by role)' })
  findAll(@Query() query: DonationQueryDto, @CurrentUser() user: JwtPayload) {
    return this.donationsService.findAll(
      query,
      user.role,
      user.referenceId,
      user.referenceId,
    );
  }

  @Get(':id')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get donation by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.donationsService.findById(id);
  }

  @Public()
  @Get('token/:token')
  @ApiOperation({ summary: 'Verify donation by QR token' })
  findByToken(@Param('token') token: string) {
    return this.donationsService.findByToken(token);
  }

  @Get(':token/qr')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get QR code data URL for a donation' })
  async getQr(@Param('token') token: string) {
    return this.donationsService.getQrCode(token, 'dataurl');
  }

  @Get(':token/qr/download')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Download QR code as PNG image' })
  async downloadQr(@Param('token') token: string, @Res() res: Response) {
    const buffer = await this.donationsService.getQrCode(token, 'buffer') as Buffer;
    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="qr-${token}.png"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Post()
  @Roles('participant')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create a new donation request (participant only)' })
  create(@Body() dto: CreateDonationDto, @CurrentUser() user: JwtPayload) {
    return this.donationsService.create(dto, user.referenceId);
  }

  @Patch(':id/status')
  @Roles(AdminRole.administrator, AdminRole.employee, AdminRole.financial_officer)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update donation status (approve/reject)' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDonationStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.donationsService.updateStatus(id, dto, user.referenceId, user.role);
  }

  @Patch(':id/cancel')
  @Roles('participant')
  @ApiBearerAuth('JWT')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pending donation (participant only)' })
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.donationsService.cancelDonation(id, user.referenceId);
  }
}
