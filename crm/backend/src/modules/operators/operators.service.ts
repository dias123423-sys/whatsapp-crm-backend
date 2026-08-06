import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import { CreateOperatorDto } from './dto/create-operator.dto';
import { UpdateOperatorDto } from './dto/update-operator.dto';

@Injectable()
export class OperatorsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateOperatorDto) {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (exists) throw new ConflictException('Email already registered');

    const hash = await bcrypt.hash(dto.password, 12);

    return this.prisma.user.create({
      data: {
        companyId,
        email: dto.email.toLowerCase(),
        passwordHash: hash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: 'OPERATOR',
        operator: {
          create: {
            companyId,
            branchId: dto.branchId,
            displayName: `${dto.firstName} ${dto.lastName}`,
            maxLeads: dto.maxLeads ?? 20,
            skills: dto.skills ?? [],
          },
        },
      },
      include: { operator: true },
    });
  }

  async findAll(companyId: string) {
    return this.prisma.operator.findMany({
      where: { companyId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true, avatarUrl: true } },
        branch: { select: { id: true, name: true } },
        _count: { select: { leads: true } },
      },
      orderBy: { displayName: 'asc' },
    });
  }

  async findOne(id: string) {
    const op = await this.prisma.operator.findUnique({
      where: { id },
      include: {
        user: true,
        branch: true,
        leads: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: { client: true, procedure: true },
        },
      },
    });
    if (!op) throw new NotFoundException('Operator not found');
    return op;
  }

  async update(id: string, dto: UpdateOperatorDto) {
    return this.prisma.operator.update({
      where: { id },
      data: {
        branchId: dto.branchId,
        maxLeads: dto.maxLeads,
        skills: dto.skills,
        isAvailable: dto.isAvailable,
        isVip: dto.isVip,
        ...(dto.displayName ? { displayName: dto.displayName } : {}),
      },
    });
  }

  async setOnline(id: string, isOnline: boolean) {
    return this.prisma.operator.update({
      where: { id },
      data: { isOnline, isAvailable: isOnline },
    });
  }

  async getKpi(companyId: string, dateFrom: Date, dateTo: Date) {
    const operators = await this.prisma.operator.findMany({
      where: { companyId },
      include: {
        user: { select: { firstName: true, lastName: true } },
        _count: { select: { leads: true, calls: true } },
      },
    });

    const kpi = await Promise.all(
      operators.map(async (op) => {
        const [total, booked, calls] = await Promise.all([
          this.prisma.lead.count({
            where: { operatorId: op.id, createdAt: { gte: dateFrom, lte: dateTo } },
          }),
          this.prisma.lead.count({
            where: { operatorId: op.id, status: 'BOOKED', bookedAt: { gte: dateFrom, lte: dateTo } },
          }),
          this.prisma.call.count({
            where: { operatorId: op.id, createdAt: { gte: dateFrom, lte: dateTo } },
          }),
        ]);
        return {
          operatorId: op.id,
          name: `${op.user.firstName} ${op.user.lastName}`,
          totalLeads: total,
          booked,
          calls,
          conversion: total > 0 ? Math.round((booked / total) * 100) : 0,
        };
      }),
    );

    return kpi;
  }
}
