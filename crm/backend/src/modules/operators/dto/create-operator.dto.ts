import { IsEmail, IsString, MinLength, IsOptional, IsArray, IsInt, IsBoolean, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOperatorDto {
  @IsEmail()          email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsString()         firstName!: string;
  @IsString()         lastName!: string;
  @IsOptional() @IsString()  phone?: string;
  @IsOptional() @IsString()  branchId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) skills?: string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) maxLeads?: number;
}
