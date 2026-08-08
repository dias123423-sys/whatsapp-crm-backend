import { IsString, IsNotEmpty, IsNumber, IsArray, IsOptional, IsBoolean, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProcedureDto {
  @ApiProperty({ example: 'RF-лифтинг' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'RF-лифтинг' })
  @IsString()
  @IsOptional()
  nameKz?: string;

  @ApiProperty({ example: 25000 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ example: ['rf', 'лифтинг', 'lifting', 'омоложение'] })
  @IsArray()
  @IsString({ each: true })
  keywords: string[];

  @ApiPropertyOptional({ example: 'Радиочастотный лифтинг лица' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class UpdateProcedureDto {
  @ApiPropertyOptional({ example: 'RF-лифтинг' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'RF-лифтинг' })
  @IsString()
  @IsOptional()
  nameKz?: string;

  @ApiPropertyOptional({ example: 25000 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({ example: ['rf', 'лифтинг', 'lifting', 'омоложение'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  keywords?: string[];

  @ApiPropertyOptional({ example: 'Радиочастотный лифтинг лица' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
