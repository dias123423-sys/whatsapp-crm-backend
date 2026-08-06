import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProcedureDto } from './dto/create-procedure.dto';

@Injectable()
export class ProceduresService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateProcedureDto) {
    return this.prisma.procedure.create({
      data: { companyId, ...dto, keywords: dto.keywords ?? [] },
    });
  }

  async findAll(companyId: string) {
    return this.prisma.procedure.findMany({
      where: { companyId },
      include: { _count: { select: { leads: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async update(id: string, dto: Partial<CreateProcedureDto>) {
    const exists = await this.prisma.procedure.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Procedure not found');
    return this.prisma.procedure.update({ where: { id }, data: dto });
  }

  async delete(id: string) {
    return this.prisma.procedure.delete({ where: { id } });
  }
}
