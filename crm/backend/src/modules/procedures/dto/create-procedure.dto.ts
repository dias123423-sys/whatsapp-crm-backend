import { IsString, IsOptional, IsArray, IsBoolean, Matches } from 'class-validator';

export class CreateProcedureDto {
  @IsString() name!: string;
  @IsString() @Matches(/^[a-z0-9-]+$/) slug!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) keywords?: string[];
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
