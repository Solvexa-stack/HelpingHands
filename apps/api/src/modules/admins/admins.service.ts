import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAdminDto, UpdateAdminDto } from './dto/admin.dto';
import { AdminRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PaginationDto, paginate, paginatedResponse } from '../../common/dto/pagination.dto';

@Injectable()
export class AdminsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: PaginationDto, role?: AdminRole) {
    const { page = 1, limit = 15, search } = query;
    const { skip, take } = paginate(page, limit);

    const where: any = {};
    if (role) where.role = role;
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.admin.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, email: true, isActive: true, avatar: true, joiningDate: true } } },
      }),
      this.prisma.admin.count({ where }),
    ]);

    return paginatedResponse(data, total, page, limit);
  }

  async findById(id: number) {
    const admin = await this.prisma.admin.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, isActive: true, avatar: true, joiningDate: true } },
        assignedProjects: {
          include: { block: { include: { translations: true } } },
        },
      },
    });
    if (!admin) throw new NotFoundException(`Admin #${id} not found`);
    return admin;
  }

  async create(dto: CreateAdminDto, creatorRole: AdminRole) {
    if (creatorRole !== AdminRole.administrator) {
      throw new ForbiddenException('Only administrators can create admin accounts');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const admin = await this.prisma.admin.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
      },
    });

    const user = await this.prisma.user.create({
      data: {
        referenceId: admin.id,
        referenceType: 'admin',
        email: dto.email,
        password: hashedPassword,
        isActive: true,
        joiningDate: new Date(),
      },
    });

    return { ...admin, user: { id: user.id, email: user.email, isActive: user.isActive } };
  }

  async update(id: number, dto: UpdateAdminDto, updaterRole: AdminRole) {
    const admin = await this.findById(id);

    if (admin.role === AdminRole.administrator && updaterRole !== AdminRole.administrator) {
      throw new ForbiddenException('Cannot modify administrator accounts');
    }

    const { password, email, ...adminData } = dto;

    if (email || password) {
      const updates: any = {};
      if (email) {
        const existing = await this.prisma.user.findFirst({
          where: { email, NOT: { referenceId: id, referenceType: 'admin' } },
        });
        if (existing) throw new ConflictException('Email already in use');
        updates.email = email;
      }
      if (password) updates.password = await bcrypt.hash(password, 12);

      await this.prisma.user.updateMany({
        where: { referenceId: id, referenceType: 'admin' },
        data: updates,
      });
    }

    return this.prisma.admin.update({ where: { id }, data: adminData });
  }

  async toggleActive(id: number) {
    const admin = await this.findById(id);
    if (admin.role === AdminRole.administrator) {
      throw new ForbiddenException('Cannot deactivate administrator accounts');
    }
    const user = await this.prisma.user.findFirst({
      where: { referenceId: id, referenceType: 'admin' },
    });
    if (!user) throw new NotFoundException('User account not found');

    return this.prisma.user.update({
      where: { id: user.id },
      data: { isActive: !user.isActive },
      select: { id: true, email: true, isActive: true },
    });
  }

  async findFinancialOfficers() {
    return this.prisma.admin.findMany({
      where: { role: AdminRole.financial_officer },
      include: {
        user: { select: { id: true, email: true, isActive: true } },
        assignedProjects: { select: { id: true } },
      },
    });
  }
}
