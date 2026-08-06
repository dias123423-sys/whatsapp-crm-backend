import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProcedureDto } from './dto/create-procedure.dto';
import { UpdateProcedureDto } from './dto/update-procedure.dto';

@Injectable()
export class ProceduresService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.procedure.findMany({ orderBy: { name: 'asc' } });
  }

  async findById(id: string) {
    const proc = await this.prisma.procedure.findUnique({ where: { id } });
    if (!proc) throw new NotFoundException('Процедура не найдена');
    return proc;
  }

  create(dto: CreateProcedureDto) {
    return this.prisma.procedure.create({ data: dto });
  }

  async update(id: string, dto: UpdateProcedureDto) {
    await this.findById(id);
    return this.prisma.procedure.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findById(id);
    return this.prisma.procedure.update({ where: { id }, data: { isActive: false } });
  }
}
