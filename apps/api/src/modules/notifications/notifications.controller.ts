import { Controller, Get, Patch, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  getMyNotifications(
    @CurrentUser('sub') userId: number,
    @Query('page') page = 1,
  ) {
    return this.notificationsService.getMyNotifications(userId, Number(page));
  }

  @Get('unread-count')
  getUnreadCount(@CurrentUser('sub') userId: number) {
    return this.notificationsService.getUnreadCount(userId).then((count) => ({ count }));
  }

  @Patch(':id/read')
  markRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') userId: number,
  ) {
    return this.notificationsService.markRead(id, userId);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser('sub') userId: number) {
    return this.notificationsService.markAllRead(userId);
  }
}
