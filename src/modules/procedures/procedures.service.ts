import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateProcedureDto, UpdateProcedureDto } from './dto/procedure.dto';

@Injectable()
export class ProceduresService {
  private readonly logger = new Logger(ProceduresService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Create new procedure
   */
  async create(createProcedureDto: CreateProcedureDto) {
    // Check if procedure with same name exists
    const existing = await this.prisma.procedure.findUnique({
      where: { name: createProcedureDto.name },
    });

    if (existing) {
      throw new ConflictException('Procedure with this name already exists');
    }

    const procedure = await this.prisma.procedure.create({
      data: {
        name: createProcedureDto.name,
        nameKz: createProcedureDto.nameKz,
        price: createProcedureDto.price,
        keywords: createProcedureDto.keywords,
        description: createProcedureDto.description,
        active: createProcedureDto.active ?? true,
      },
    });

    this.logger.log(`Procedure created: ${procedure.name}`);

    return procedure;
  }

  /**
   * Find all procedures
   */
  async findAll(activeOnly: boolean = false) {
    const where = activeOnly ? { active: true } : {};

    return this.prisma.procedure.findMany({
      where,
      include: {
        _count: {
          select: {
            leads: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  /**
   * Find procedure by ID
   */
  async findOne(id: string) {
    const procedure = await this.prisma.procedure.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            leads: true,
          },
        },
      },
    });

    if (!procedure) {
      throw new NotFoundException('Procedure not found');
    }

    return procedure;
  }

  /**
   * Update procedure
   */
  async update(id: string, updateProcedureDto: UpdateProcedureDto) {
    const procedure = await this.prisma.procedure.findUnique({ where: { id } });

    if (!procedure) {
      throw new NotFoundException('Procedure not found');
    }

    // Check if name is being changed and if new name already exists
    if (updateProcedureDto.name && updateProcedureDto.name !== procedure.name) {
      const existing = await this.prisma.procedure.findUnique({
        where: { name: updateProcedureDto.name },
      });

      if (existing) {
        throw new ConflictException('Procedure with this name already exists');
      }
    }

    const updated = await this.prisma.procedure.update({
      where: { id },
      data: updateProcedureDto,
    });

    this.logger.log(`Procedure updated: ${updated.name}`);

    return updated;
  }

  /**
   * Delete procedure
   */
  async remove(id: string) {
    const procedure = await this.prisma.procedure.findUnique({ where: { id } });

    if (!procedure) {
      throw new NotFoundException('Procedure not found');
    }

    // Check if procedure has leads
    const leadsCount = await this.prisma.lead.count({
      where: { procedureId: id },
    });

    if (leadsCount > 0) {
      throw new ConflictException(
        `Cannot delete procedure with ${leadsCount} associated leads. Deactivate instead.`,
      );
    }

    await this.prisma.procedure.delete({ where: { id } });

    this.logger.log(`Procedure deleted: ${procedure.name}`);

    return { message: 'Procedure deleted successfully' };
  }

  /**
   * Toggle procedure active status
   */
  async toggleActive(id: string) {
    const procedure = await this.prisma.procedure.findUnique({ where: { id } });

    if (!procedure) {
      throw new NotFoundException('Procedure not found');
    }

    const updated = await this.prisma.procedure.update({
      where: { id },
      data: { active: !procedure.active },
    });

    this.logger.log(`Procedure ${updated.active ? 'activated' : 'deactivated'}: ${updated.name}`);

    return updated;
  }

  /**
   * Detect procedure from message text using keywords
   */
  async detectProcedure(messageText: string): Promise<any | null> {
    if (!messageText) {
      return null;
    }

    const normalizedMessage = messageText.toLowerCase().trim();

    // Get all active procedures
    const procedures = await this.prisma.procedure.findMany({
      where: { active: true },
    });

    // Find procedure by matching keywords
    for (const procedure of procedures) {
      for (const keyword of procedure.keywords) {
        const normalizedKeyword = keyword.toLowerCase();

        if (normalizedMessage.includes(normalizedKeyword)) {
          this.logger.log(
            `Procedure detected: ${procedure.name} (keyword: ${keyword})`,
          );
          return procedure;
        }
      }
    }

    this.logger.log('No procedure detected from message');
    return null;
  }

  /**
   * Get procedure statistics
   */
  async getStats(id: string) {
    const procedure = await this.prisma.procedure.findUnique({
      where: { id },
    });

    if (!procedure) {
      throw new NotFoundException('Procedure not found');
    }

    const totalLeads = await this.prisma.lead.count({
      where: { procedureId: id },
    });

    const leadsByStatus = await this.prisma.lead.groupBy({
      by: ['status'],
      where: { procedureId: id },
      _count: true,
    });

    const bookedLeads = await this.prisma.lead.count({
      where: {
        procedureId: id,
        status: 'BOOKED',
      },
    });

    return {
      procedure,
      totalLeads,
      bookedLeads,
      conversionRate: totalLeads > 0 ? (bookedLeads / totalLeads) * 100 : 0,
      leadsByStatus,
    };
  }
}
