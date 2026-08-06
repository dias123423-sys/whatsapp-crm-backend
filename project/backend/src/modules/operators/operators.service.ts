import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OperatorsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.operator.findMany({
      include: {
        user: { select: { email: true, isActive: true } },
        _count: { select: { leads: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const op = await this.prisma.operator.findUnique({
      where: { id },
      include: { user: { select: { email: true, isActive: true } } },
    });
    if (!op) throw new NotFoundException('Оператор не найден');
    return op;
  }

  async findByUserId(userId: string) {
    return this.prisma.operator.findUnique({ where: { userId } });
  }

  async getStats(id: string) {
    const operator = await this.findById(id);
    const leads = await this.prisma.lead.groupBy({
      by: ['status'],
      where: { operatorId: id },
      _count: true,
    });

    const totalLeads = await this.prisma.lead.count({ where: { operatorId: id } });
    const calledLeads = await this.prisma.call.count({
      where: { lead: { operatorId: id } },
    });
    const bookedLeads = await this.prisma.lead.count({
      where: { operatorId: id, status: 'BOOKED' },
    });

    return {
      operator,
      stats: {
        totalLeads,
        calledLeads,
        bookedLeads,
        byStatus: leads,
      },
    };
  }

  async getActiveOperators() {
    return this.prisma.operator.findMany({
      where: { status: 'ACTIVE', user: { isActive: true } },
      include: { _count: { select: { leads: true } } },
    });
  }

  async updateStatus(id: string, status: 'ACTIVE' | 'INACTIVE') {
    return this.prisma.operator.update({ where: { id }, data: { status } });
  }
}
