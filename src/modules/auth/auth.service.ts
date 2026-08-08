import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Role } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        operator: true,
      },
    });

    if (!user) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return null;
    }

    if (!user.active) {
      throw new UnauthorizedException('User account is disabled');
    }

    const { password: _, ...result } = user;
    return result;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    // Log login action
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        metadata: {
          ip: loginDto.ip,
          userAgent: loginDto.userAgent,
        },
      },
    });

    this.logger.log(`User logged in: ${user.email}`);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        operator: user.operator,
      },
    };
  }

  async register(registerDto: RegisterDto) {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email,
        password: hashedPassword,
        name: registerDto.name,
        phone: registerDto.phone,
        role: registerDto.role || Role.OPERATOR,
        active: true,
      },
    });

    // If role is OPERATOR, create operator record
    if (user.role === Role.OPERATOR) {
      await this.prisma.operator.create({
        data: {
          userId: user.id,
          currentLeads: 0,
          totalLeads: 0,
          totalCalls: 0,
          totalBooked: 0,
          active: true,
        },
      });
    }

    // Log registration
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'REGISTER',
        metadata: {
          role: user.role,
        },
      },
    });

    this.logger.log(`New user registered: ${user.email} (${user.role})`);

    const { password: _, ...result } = user;
    return result;
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        active: true,
        createdAt: true,
        operator: {
          select: {
            id: true,
            currentLeads: true,
            totalLeads: true,
            totalCalls: true,
            totalBooked: true,
            active: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  async logout(userId: string) {
    // Log logout action
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'LOGOUT',
      },
    });

    this.logger.log(`User logged out: ${userId}`);

    return { message: 'Logged out successfully' };
  }
}
