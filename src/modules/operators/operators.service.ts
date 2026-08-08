import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LeadStatus } from '@prisma/client';

@Injectable()
export class OperatorsService {
  private readonly logger = new Logger(OperatorsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Find all operators
   */
  async findAll(activeOnly: boolean = false) {
    const where = activeOnly ? { active: true } : {};

    return this.prisma.operator.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            active: true,
          },
        },
        _count: {
          select: {
            leads: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  /**
   * Find operator by ID
   */
  async findOne(id: string) {
    const operator = await this.prisma.operator.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            active: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            leads: true,
          },
        },
      },
    });

    if (!operator) {
      throw new NotFoundException('Operator not found');
    }

    return operator;
  }

  /**
   * Find operator by user ID
   */
  async findByUserId(userId: string) {
    return this.prisma.operator.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });
  }

  /**
   * Toggle operator active status
   */
  async toggleActive(id: string) {
    const operator = await this.prisma.operator.findUnique({ where: { id } });

    if (!operator) {
      throw new NotFoundException('Operator not found');
    }

    const updated = await this.prisma.operator.update({
      where: { id },
      data: { active: !operator.active },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    this.logger.log(`Operator ${updated.active ? 'activated' : 'deactivated'}: ${id}`);

    return updated;
  }

  /**
   * Get operator statistics
   */
  async getStats(id: string) {
    const operator = await this.prisma.operator.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!operator) {
      throw new NotFoundException('Operator not found');
    }

    // Get leads by status
    const leadsByStatus = await this.prisma.lead.groupBy({
      by: ['status'],
      where: { operatorId: id },
      _count: true,
    });

    // Get today's stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayLeads = await this.prisma.lead.count({
      where: {
        operatorId: id,
        createdAt: {
          gte: today,
        },
      },
    });

    const todayCalls = 0; // Call tracking removed

    // Calculate conversion rate
    const totalLeads = operator.totalLeads || 0;
    const conversionRate = totalLeads > 0 ? (operator.totalBooked / totalLeads) * 100 : 0;

    return {
      operator: {
        id: operator.id,
        name: operator.user.name,
        currentLeads: operator.currentLeads,
        totalLeads: operator.totalLeads,
        totalCalls: operator.totalCalls,
        totalBooked: operator.totalBooked,
        conversionRate: Math.round(conversionRate * 100) / 100,
        active: operator.active,
      },
      leadsByStatus,
      today: {
        leads: todayLeads,
        calls: todayCalls,
      },
    };
  }

  /**
   * Get operator performance
   */
  async getPerformance(id: string, startDate?: Date, endDate?: Date) {
    const operator = await this.prisma.operator.findUnique({
      where: { id },
    });

    if (!operator) {
      throw new NotFoundException('Operator not found');
    }

    const where: any = { operatorId: id };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [totalLeads, bookedLeads] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.count({ where: { ...where, status: LeadStatus.BOOKED } }),
    ]);
    
    const calls = 0; // Call tracking removed

    const conversionRate = totalLeads > 0 ? (bookedLeads / totalLeads) * 100 : 0;
    const callsPerLead = totalLeads > 0 ? calls / totalLeads : 0;

    return {
      totalLeads,
      bookedLeads,
      totalCalls: calls,
      conversionRate: Math.round(conversionRate * 100) / 100,
      callsPerLead: Math.round(callsPerLead * 100) / 100,
    };
  }

  /**
   * Increment current leads count
   */
  async incrementCurrentLeads(id: string) {
    await this.prisma.operator.update({
      where: { id },
      data: {
        currentLeads: { increment: 1 },
        totalLeads: { increment: 1 },
      },
    });
  }

  /**
   * Decrement current leads count
   */
  async decrementCurrentLeads(id: string) {
    const operator = await this.prisma.operator.findUnique({ where: { id } });

    if (operator && operator.currentLeads > 0) {
      await this.prisma.operator.update({
        where: { id },
        data: {
          currentLeads: { decrement: 1 },
        },
      });
    }
  }

  /**
   * Increment total calls count
   */
  async incrementTotalCalls(id: string) {
    await this.prisma.operator.update({
      where: { id },
      data: {
        totalCalls: { increment: 1 },
      },
    });
  }

  /**
   * Increment total booked count
   */
  async incrementTotalBooked(id: string) {
    await this.prisma.operator.update({
      where: { id },
      data: {
        totalBooked: { increment: 1 },
      },
    });
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(startDate?: Date, endDate?: Date) {
    const operators = await this.findAll(true);

    const leaderboard = await Promise.all(
      operators.map(async (operator) => {
        const performance = await this.getPerformance(operator.id, startDate, endDate);

        return {
          id: operator.id,
          name: operator.user.name,
          ...performance,
        };
      }),
    );

    // Sort by booked leads
    leaderboard.sort((a, b) => b.bookedLeads - a.bookedLeads);

    return leaderboard;
  }
}
