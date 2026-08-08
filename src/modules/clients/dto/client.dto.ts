import { IsString, IsNotEmpty, IsOptional, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateClientDto {
  @ApiProperty({ example: '+77001234567' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ example: 'Анна' })
  @IsString()
  @IsOptional()
  whatsappName?: string;

  @ApiPropertyOptional({ example: 'Анна Иванова' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'anna@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: 'VIP клиент' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateClientDto {
  @ApiPropertyOptional({ example: '+77001234567' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'Анна' })
  @IsString()
  @IsOptional()
  whatsappName?: string;

  @ApiPropertyOptional({ example: 'Анна Иванова' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'anna@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: 'VIP клиент' })
  @IsString()
  @IsOptional()
  notes?: string;
}
