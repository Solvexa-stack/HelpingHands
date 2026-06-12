import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate, paginatedResponse } from '../../common/dto/pagination.dto';
import { NotificationEvent } from './notification-event.type';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('notifications') private notifQueue: Queue,
    @InjectQueue('email') private emailQueue: Queue,
  ) {}

  async notify(event: NotificationEvent): Promise<void> {
    await this.notifQueue.add('handle_event', event, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
    });
  }

  async getMyNotifications(userId: number, page = 1) {
    const limit = 20;
    const { skip, take } = paginate(page, limit);

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);

    return paginatedResponse(data, total, page, limit);
  }

  async markRead(notificationId: number, userId: number): Promise<void> {
    const notif = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notif) throw new NotFoundException(`Notification #${notificationId} not found`);
    if (notif.userId !== userId) throw new NotFoundException(`Notification #${notificationId} not found`);

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: number): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async getUnreadCount(userId: number): Promise<number> {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }

  // Used by processor to create records and dispatch emails
  async dispatchEmailJob(jobName: string, payload: Record<string, unknown>): Promise<void> {
    await this.emailQueue.add(jobName, payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
    });
  }

  async createNotificationRecord(data: {
    userId: number;
    type: string;
    title: string;
    body: string;
    referenceId?: number;
    referenceType?: string;
  }): Promise<void> {
    await this.prisma.notification.create({ data });
  }
}
