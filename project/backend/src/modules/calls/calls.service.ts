import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CallsService {
  constructor(private prisma: PrismaService) {}

  async logCall(leadId: string, data: { result?: string; notes?: string; duration?: number }) {
    const call = await this.prisma.call.create({
      data: { leadId, ...data },
    });

    // Add to history
    await this.prisma.leadHistory.create({
      data: {
        leadId,
        event: 'Звонок совершён',
        details: data.result || data.notes,
      },
    });

    // Update lead status to CALLING if it's NEW
    await this.prisma.lead.updateMany({
      where: { id: leadId, status: 'NEW' },
      data: { status: 'CALLING' },
    });

    return call;
  }

  async getCallsByLead(leadId: string) {
    return this.prisma.call.findMany({
      where: { leadId },
      orderBy: { calledAt: 'desc' },
    });
  }
}
