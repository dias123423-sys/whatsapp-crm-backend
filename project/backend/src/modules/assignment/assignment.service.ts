import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(private prisma: PrismaService) {}

  async getConfig() {
    let config = await this.prisma.assignmentConfig.findUnique({ where: { id: 'default' } });
    if (!config) {
      config = await this.prisma.assignmentConfig.create({
        data: { id: 'default', strategy: 'ROUND_ROBIN', lastIdx: 0 },
      });
    }
    return config;
  }

  async updateStrategy(strategy: 'ROUND_ROBIN' | 'LEAST_BUSY' | 'MANUAL') {
    return this.prisma.assignmentConfig.upsert({
      where: { id: 'default' },
      update: { strategy },
      create: { id: 'default', strategy, lastIdx: 0 },
    });
  }

  async assignOperator(): Promise<string | null> {
    const config = await this.getConfig();

    const operators = await this.prisma.operator.findMany({
      where: { status: 'ACTIVE', user: { isActive: true } },
      include: { _count: { select: { leads: true } } },
    });

    if (operators.length === 0) {
      this.logger.warn('No active operators available for assignment');
      return null;
    }

    if (config.strategy === 'ROUND_ROBIN') {
      const idx = config.lastIdx % operators.length;
      const operator = operators[idx];

      await this.prisma.assignmentConfig.update({
        where: { id: 'default' },
        data: { lastIdx: idx + 1 },
      });

      this.logger.log(`Round Robin → Operator: ${operator.name} (idx: ${idx})`);
      return operator.id;
    }

    if (config.strategy === 'LEAST_BUSY') {
      const sorted = operators.sort((a, b) => a._count.leads - b._count.leads);
      const operator = sorted[0];
      this.logger.log(`Least Busy → Operator: ${operator.name} (${operator._count.leads} leads)`);
      return operator.id;
    }

    return null; // MANUAL
  }
}
