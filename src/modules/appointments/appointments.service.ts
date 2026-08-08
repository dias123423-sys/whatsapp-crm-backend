import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateAppointmentDto, UpdateAppointmentDto } from './dto/appointment.dto';
import { AppointmentStatus } from '@prisma/client';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Create appointment
   */
  async create(createDto: CreateAppointmentDto) {
    const appointment = await this.prisma.appointment.create({
      data: {
        leadId: createDto.leadId,
        clientId: createDto.clientId,
        date: new Date(createDto.date),
        time: createDto.time,
        doctor: createDto.doctor,
        branch: createDto.branch,
        notes: createDto.notes,
        status: AppointmentStatus.SCHEDULED,
      },
      include: {
        lead: {
          include: {
            procedure: true,
          },
        },
        client: true,
      },
    });

    this.logger.log(`Appointment created: ${appointment.id}`);

    return appointment;
  }

  /**
   * Find all appointments with filters
   */
  async findAll(
    page: number = 1,
    limit: number = 20,
    status?: AppointmentStatus,
    startDate?: Date,
    endDate?: Date,
  ) {
    const skip = (page - 1) * limit;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = startDate;
      if (endDate) where.date.lte = endDate;
    }

    const [appointments, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        skip,
        take: limit,
        include: {
          lead: {
            include: {
              procedure: true,
              operator: {
                include: {
                  user: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
          client: true,
        },
        orderBy: {
          date: 'asc',
        },
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return {
      data: appointments,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find appointment by ID
   */
  async findOne(id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        lead: {
          include: {
            procedure: true,
            operator: {
              include: {
                user: {
                  select: {
                    name: true,
                    email: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
        client: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    return appointment;
  }

  /**
   * Update appointment
   */
  async update(id: string, updateDto: UpdateAppointmentDto) {
    const appointment = await this.prisma.appointment.findUnique({ where: { id } });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    const data: any = { ...updateDto };

    if (updateDto.date) {
      data.date = new Date(updateDto.date);
    }

    const updated = await this.prisma.appointment.update({
      where: { id },
      data,
      include: {
        lead: {
          include: {
            procedure: true,
          },
        },
        client: true,
      },
    });

    this.logger.log(`Appointment updated: ${updated.id}`);

    return updated;
  }

  /**
   * Delete appointment
   */
  async remove(id: string) {
    const appointment = await this.prisma.appointment.findUnique({ where: { id } });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    await this.prisma.appointment.delete({ where: { id } });

    this.logger.log(`Appointment deleted: ${id}`);

    return { message: 'Appointment deleted successfully' };
  }

  /**
   * Get appointments by client
   */
  async findByClient(clientId: string) {
    return this.prisma.appointment.findMany({
      where: { clientId },
      include: {
        lead: {
          include: {
            procedure: true,
          },
        },
      },
      orderBy: {
        date: 'desc',
      },
    });
  }

  /**
   * Get upcoming appointments
   */
  async getUpcoming(days: number = 7) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + days);

    return this.prisma.appointment.findMany({
      where: {
        date: {
          gte: today,
          lte: endDate,
        },
        status: {
          in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED],
        },
      },
      include: {
        lead: {
          include: {
            procedure: true,
          },
        },
        client: true,
      },
      orderBy: {
        date: 'asc',
      },
    });
  }
}
