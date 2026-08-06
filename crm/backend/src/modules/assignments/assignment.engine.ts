import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AssignmentAlgorithm, LeadStatus } from '../../shared/enums';

@Injectable()
export class AssignmentEngine {
  private readonly logger = new Logger(AssignmentEngine.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Assign a lead to an operator.
   * Returns operatorId or null if no operator available.
   */
  async assign(params: {
    companyId: string;
    branchId?: string | null;
    procedureId?: string | null;
    isVipClient: boolean;
    algorithm: AssignmentAlgorithm;
  }): Promise<string | null> {
    const { companyId, branchId, procedureId, isVipClient, algorithm } = params;

    // ── VIP: always route to VIP operator ────────────────────────────────
    if (isVipClient) {
      const vip = await this.prisma.operator.findFirst({
        where: {
          companyId,
          isVip: true,
          isAvailable: true,
          isOnline: true,
          ...(branchId ? { branchId } : {}),
        },
      });
      if (vip) return vip.id;
    }

    // ── Get pool of available operators ──────────────────────────────────
    const baseWhere = {
      companyId,
      isAvailable: true,
      ...(branchId ? { branchId } : {}),
    };

    // Skill-based filter if procedure exists
    let skillFilter: object = {};
    if (procedureId) {
      const proc = await this.prisma.procedure.findUnique({
        where: { id: procedureId },
        select: { slug: true },
      });
      if (proc) {
        skillFilter = {
          OR: [
            { skills: { has: proc.slug } },
            { skills: { isEmpty: true } },
          ],
        };
      }
    }

    const candidates = await this.prisma.operator.findMany({
      where: { ...baseWhere, ...skillFilter },
      include: {
        _count: {
          select: {
            leads: {
              where: { status: { in: [LeadStatus.NEW, LeadStatus.CALLING, LeadStatus.FOLLOW_UP] } },
            },
          },
        },
      },
    });

    if (!candidates.length) {
      this.logger.warn(`No available operators for company ${companyId}`);
      return null;
    }

    switch (algorithm) {
      case AssignmentAlgorithm.ROUND_ROBIN:
        return this.roundRobin(candidates);

      case AssignmentAlgorithm.LEAST_BUSY:
        return this.leastBusy(candidates);

      case AssignmentAlgorithm.MANUAL:
        return null; // caller must provide operatorId

      default:
        return this.roundRobin(candidates);
    }
  }

  // ── Round Robin ───────────────────────────────────────────────────────────
  private roundRobin(
    operators: Array<{ id: string; assignmentOrder: number; totalAssigned: number }>,
  ): string {
    const sorted = [...operators].sort((a, b) => a.assignmentOrder - b.assignmentOrder);
    const chosen = sorted[0];

    // Update order for next assignment
    void this.prisma.operator.updateMany({
      where: { id: { in: operators.map((o) => o.id) } },
      data: { assignmentOrder: { increment: 1 } },
    });
    void this.prisma.operator.update({
      where: { id: chosen.id },
      data: {
        assignmentOrder: 0,
        totalAssigned: { increment: 1 },
      },
    });

    return chosen.id;
  }

  // ── Least Busy ────────────────────────────────────────────────────────────
  private leastBusy(
    operators: Array<{ id: string; _count: { leads: number }; totalAssigned: number }>,
  ): string {
    const sorted = [...operators].sort(
      (a, b) => a._count.leads - b._count.leads,
    );
    const chosen = sorted[0];

    void this.prisma.operator.update({
      where: { id: chosen.id },
      data: { totalAssigned: { increment: 1 } },
    });

    return chosen.id;
  }
}
