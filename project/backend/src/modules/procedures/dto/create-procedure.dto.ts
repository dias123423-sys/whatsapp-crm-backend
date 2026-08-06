import { IsString, IsNumber, IsArray, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProcedureDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsNumber()
  price: number;

  @ApiProperty({ type: [String] })
  @IsArray()
  keywords: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
