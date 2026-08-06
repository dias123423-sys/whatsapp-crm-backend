import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateNoteDto } from './dto/create-note.dto';

@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(leadId: string, operatorId: string, dto: CreateNoteDto) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');

    return this.prisma.note.create({
      data: { leadId, operatorId, body: dto.body, isPinned: dto.isPinned ?? false },
    });
  }

  async delete(noteId: string) {
    return this.prisma.note.delete({ where: { id: noteId } });
  }
}
