import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
import { LeadStatus } from '../../../shared/enums';

export class UpdateLeadStatusDto {
  @IsEnum(LeadStatus)
  status!: LeadStatus;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsDateString()
  scheduledCallAt?: string;
}
