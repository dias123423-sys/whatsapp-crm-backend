import { IsString, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeadSource } from '@prisma/client';

export class CreateLeadDto {
  @ApiProperty()
  @IsString()
  clientId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  operatorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  procedureId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiPropertyOptional({ enum: LeadSource })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;
}
