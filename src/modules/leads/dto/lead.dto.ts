import { IsString, IsNotEmpty, IsOptional, IsEnum, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeadStatus, Period } from '@prisma/client';

export class CreateLeadDto {
  @ApiProperty({ example: 'client-uuid' })
  @IsString()
  @IsNotEmpty()
  clientId: string;

  @ApiPropertyOptional({ example: 'procedure-uuid' })
  @IsString()
  @IsOptional()
  procedureId?: string;

  @ApiPropertyOptional({ example: 'Хочу записаться на RF-лифтинг' })
  @IsString()
  @IsOptional()
  message?: string;

  @ApiPropertyOptional({ example: 'WHATSAPP' })
  @IsString()
  @IsOptional()
  source?: string;

  @ApiPropertyOptional({ enum: Period, example: Period.DAY })
  @IsEnum(Period)
  @IsOptional()
  period?: Period;

  @ApiPropertyOptional({ example: 'Важный клиент' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateLeadDto {
  @ApiPropertyOptional({ example: 'procedure-uuid' })
  @IsString()
  @IsOptional()
  procedureId?: string;

  @ApiPropertyOptional({ example: 'Хочу записаться на RF-лифтинг' })
  @IsString()
  @IsOptional()
  message?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsInt()
  @IsOptional()
  priority?: number;

  @ApiPropertyOptional({ example: 'Важный клиент' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateLeadStatusDto {
  @ApiProperty({ enum: LeadStatus, example: LeadStatus.CALLING })
  @IsEnum(LeadStatus)
  @IsNotEmpty()
  status: LeadStatus;

  @ApiPropertyOptional({ example: 'Клиент не отвечает, перезвоню позже' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class ReassignOperatorDto {
  @ApiProperty({ example: 'operator-uuid' })
  @IsString()
  @IsNotEmpty()
  operatorId: string;
}
