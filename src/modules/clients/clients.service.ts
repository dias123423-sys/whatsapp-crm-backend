import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Normalize phone number (remove all non-digit characters)
   */
  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  /**
   * Create new client
   */
  async create(createClientDto: CreateClientDto) {
    const normalizedPhone = this.normalizePhone(createClientDto.phone);

    const client = await this.prisma.client.create({
      data: {
        phone: normalizedPhone,
        normalizedPhone,
        whatsappName: createClientDto.whatsappName,
        name: createClientDto.name,
        email: createClientDto.email,
        notes: createClientDto.notes,
      },
    });

    this.logger.log(`Client created: ${client.phone}`);

    return client;
  }

  /**
   * Find all clients with pagination
   */
  async findAll(page: number = 1, limit: number = 20, search?: string) {
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { phone: { contains: search } },
        { name: { contains: search, mode: 'insensitive' } },
        { whatsappName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [clients, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        skip,
        take: limit,
        include: {
          _count: {
            select: {
              leads: true,
              messages: true,
              appointments: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.client.count({ where }),
    ]);

    return {
      data: clients,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find client by ID
   */
  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        leads: {
          include: {
            operator: {
              include: {
                user: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
            },
            procedure: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        messages: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 50,
        },
        appointments: {
          orderBy: {
            date: 'desc',
          },
        },
      },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    return client;
  }

  /**
   * Find client by phone number
   */
  async findByPhone(phone: string) {
    const normalizedPhone = this.normalizePhone(phone);

    return this.prisma.client.findUnique({
      where: { phone: normalizedPhone },
    });
  }

  /**
   * Update client
   */
  async update(id: string, updateClientDto: UpdateClientDto) {
    const client = await this.prisma.client.findUnique({ where: { id } });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    const data: any = { ...updateClientDto };

    if (updateClientDto.phone) {
      data.phone = this.normalizePhone(updateClientDto.phone);
    }

    const updated = await this.prisma.client.update({
      where: { id },
      data,
    });

    this.logger.log(`Client updated: ${updated.phone}`);

    return updated;
  }

  /**
   * Delete client
   */
  async remove(id: string) {
    const client = await this.prisma.client.findUnique({ where: { id } });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    await this.prisma.client.delete({ where: { id } });

    this.logger.log(`Client deleted: ${client.phone}`);

    return { message: 'Client deleted successfully' };
  }

  /**
   * Get client history (all interactions)
   */
  async getHistory(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        leads: {
          include: {
            operator: {
              include: {
                user: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            procedure: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        messages: {
          orderBy: {
            createdAt: 'desc',
          },
        },
        appointments: {
          orderBy: {
            date: 'desc',
          },
        },
      },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    // Combine all events into timeline
    const timeline: any[] = [];

    // Add leads
    client.leads.forEach((lead) => {
      timeline.push({
        type: 'lead',
        date: lead.createdAt,
        data: lead,
      });
    });

    // Add messages
    client.messages.forEach((message) => {
      timeline.push({
        type: 'message',
        date: message.createdAt,
        data: message,
      });
    });

    // Add appointments
    client.appointments.forEach((appointment) => {
      timeline.push({
        type: 'appointment',
        date: appointment.createdAt,
        data: appointment,
      });
    });

    // Sort by date
    timeline.sort((a, b) => b.date.getTime() - a.date.getTime());

    return {
      client,
      timeline,
    };
  }

  /**
   * Get client statistics
   */
  async getStats(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            leads: true,
            messages: true,
            appointments: true,
          },
        },
      },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    const leadsStats = await this.prisma.lead.groupBy({
      by: ['status'],
      where: { clientId: id },
      _count: true,
    });

    const appointmentsStats = await this.prisma.appointment.groupBy({
      by: ['status'],
      where: { clientId: id },
      _count: true,
    });

    return {
      totalLeads: client._count.leads,
      totalMessages: client._count.messages,
      totalAppointments: client._count.appointments,
      leadsByStatus: leadsStats,
      appointmentsByStatus: appointmentsStats,
    };
  }
}
