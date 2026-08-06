import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, name: true, phone: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, phone: true, role: true, isActive: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('Пользователь не найден');
    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email уже используется');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email: dto.email, name: dto.name, phone: dto.phone, role: dto.role, passwordHash },
      select: { id: true, email: true, name: true, phone: true, role: true, isActive: true, createdAt: true },
    });

    if (dto.role === 'OPERATOR') {
      await this.prisma.operator.create({
        data: { userId: user.id, name: dto.name, phone: dto.phone },
      });
    }

    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findById(id);
    const data: any = { ...dto };
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
      delete data.password;
    }
    return this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, name: true, phone: true, role: true, isActive: true, updatedAt: true },
    });
  }

  async deactivate(id: string) {
    return this.prisma.user.update({ where: { id }, data: { isActive: false } });
  }
}
