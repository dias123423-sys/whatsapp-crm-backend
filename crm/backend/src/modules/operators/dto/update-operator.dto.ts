import { IsOptional, IsString, IsArray, IsInt, IsBoolean, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateOperatorDto {
  @IsOptional() @IsString()  displayName?: string;
  @IsOptional() @IsString()  branchId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) skills?: string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) maxLeads?: number;
  @IsOptional() @IsBoolean() isAvailable?: boolean;
  @IsOptional() @IsBoolean() isVip?: boolean;
}
