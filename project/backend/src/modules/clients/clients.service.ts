import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  async findAll(search?: string) {
    const where: any = {};
    if (search) {
      where.OR = [
        { phone: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.client.findMany({
      where,
      include: { _count: { select: { leads: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    return this.prisma.client.findUnique({
      where: { id },
      include: {
        leads: {
          include: { operator: true, procedure: true },
          orderBy: { createdAt: 'desc' },
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
  }
}
