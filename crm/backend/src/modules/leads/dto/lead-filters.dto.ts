import { IsOptional, IsEnum, IsString, IsBoolean, IsInt, Min, Max, IsDateString } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { LeadStatus } from '../../../shared/enums';

export class LeadFiltersDto {
  @IsOptional() @IsEnum(LeadStatus)         status?: LeadStatus;
  @IsOptional() @IsString()                  procedureId?: string;
  @IsOptional() @IsString()                  campaignId?: string;
  @IsOptional() @IsString()                  branchId?: string;
  @IsOptional() @IsString()                  operatorId?: string;
  @IsOptional() @IsString()                  search?: string;
  @IsOptional() @IsDateString()              dateFrom?: string;
  @IsOptional() @IsDateString()              dateTo?: string;
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean() isDuplicate?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)        page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
