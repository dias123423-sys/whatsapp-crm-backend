import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentStatus } from '@prisma/client';

export class CreateAppointmentDto {
  @ApiProperty({ example: 'lead-uuid' })
  @IsString()
  @IsNotEmpty()
  leadId: string;

  @ApiProperty({ example: 'client-uuid' })
  @IsString()
  @IsNotEmpty()
  clientId: string;

  @ApiProperty({ example: '2026-08-10' })
  @IsDateString()
  @IsNotEmpty()
  date: string;

  @ApiProperty({ example: '14:00' })
  @IsString()
  @IsNotEmpty()
  time: string;

  @ApiPropertyOptional({ example: 'Доктор Иванова' })
  @IsString()
  @IsOptional()
  doctor?: string;

  @ApiPropertyOptional({ example: 'Филиал на Абая' })
  @IsString()
  @IsOptional()
  branch?: string;

  @ApiPropertyOptional({ example: 'Клиент попросил перезвонить за день' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateAppointmentDto {
  @ApiPropertyOptional({ example: '2026-08-10' })
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional({ example: '14:00' })
  @IsString()
  @IsOptional()
  time?: string;

  @ApiPropertyOptional({ example: 'Доктор Иванова' })
  @IsString()
  @IsOptional()
  doctor?: string;

  @ApiPropertyOptional({ example: 'Филиал на Абая' })
  @IsString()
  @IsOptional()
  branch?: string;

  @ApiPropertyOptional({ enum: AppointmentStatus, example: AppointmentStatus.CONFIRMED })
  @IsEnum(AppointmentStatus)
  @IsOptional()
  status?: AppointmentStatus;

  @ApiPropertyOptional({ example: 'Клиент подтвердил' })
  @IsString()
  @IsOptional()
  notes?: string;
}
