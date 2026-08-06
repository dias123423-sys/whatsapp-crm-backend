import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import { JwtPayload } from '../../shared/types/request.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ── Validate user credentials (used by LocalStrategy) ────────────────────
  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { operator: true },
    });
    if (!user || !user.isActive) return null;

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return null;

    return user;
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.email, dto.password);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokens(user);
  }

  // ── Register first SUPER_ADMIN ────────────────────────────────────────────
  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (exists) throw new ConflictException('Email already registered');

    // Upsert company
    const company = await this.prisma.company.upsert({
      where: { slug: dto.companySlug },
      create: {
        name: dto.companyName,
        slug: dto.companySlug,
      },
      update: {},
    });

    const hash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        companyId: company.id,
        email: dto.email.toLowerCase(),
        passwordHash: hash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: 'SUPER_ADMIN',
      },
      include: { operator: true },
    });

    return this.issueTokens(user);
  }

  // ── Refresh token ─────────────────────────────────────────────────────────
  async refresh(token: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token },
      include: { user: { include: { operator: true } } },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired or invalid');
    }

    await this.prisma.refreshToken.delete({ where: { token } });

    return this.issueTokens(stored.user);
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private async issueTokens(user: {
    id: string;
    email: string;
    role: string;
    companyId: string;
    operator: { id: string } | null;
  }) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role as import('../../shared/enums').UserRole,
      companyId: user.companyId,
      operatorId: user.operator?.id,
    };

    const accessToken = this.jwt.sign(payload);

    const refreshSecret  = this.config.get<string>('jwt.refreshSecret')!;
    const refreshExpires = this.config.get<string>('jwt.refreshExpiresIn')!;
    const refreshToken   = this.jwt.sign(payload, {
      secret: refreshSecret,
      expiresIn: refreshExpires,
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: { userId: user.id, token: refreshToken, expiresAt },
    });

    return { accessToken, refreshToken };
  }
}
