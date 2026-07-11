import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActorContext } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateInvoiceInput {
  invoiceNumber: string;
  invoiceDate: string;
  recipientId?: number;
}

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  async create(actor: ActorContext, file: Express.Multer.File, dto: CreateInvoiceInput) {
    if (!file) throw new BadRequestException('An invoice file is required');
    if (dto.recipientId != null) {
      const recipient = await this.prisma.recipient.findFirst({ where: { id: dto.recipientId, deletedAt: null } });
      if (!recipient) throw new NotFoundException(`Recipient #${dto.recipientId} not found`);
    }

    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber: dto.invoiceNumber,
        invoiceDate: new Date(dto.invoiceDate),
        recipientId: dto.recipientId,
        fileUrl: `/uploads/${file.filename}`,
        fileName: file.originalname,
        fileMimeType: file.mimetype,
        fileSize: file.size,
        createdByUserId: actor.userId!,
      },
    });
    this.eventBus.publish({
      event: 'invoice.uploaded',
      actor,
      subject: { type: 'invoice', id: invoice.id },
      data: { invoiceNumber: invoice.invoiceNumber, recipientId: dto.recipientId ?? null },
    });
    return invoice;
  }

  async detail(id: number) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      include: { recipient: { select: { id: true, name: true, type: true } } },
    });
    if (!invoice) throw new NotFoundException(`Invoice #${id} not found`);
    return invoice;
  }
}
