import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConnectWhatsAppDto {
  @ApiProperty({ example: 'lead-automation' })
  @IsString()
  @IsNotEmpty()
  instanceName: string;

  @ApiPropertyOptional({ example: 'https://your-backend.com/api/v1/whatsapp/webhook' })
  @IsString()
  @IsOptional()
  webhookUrl?: string;
}

export class SendMessageDto {
  @ApiProperty({ example: '+77001234567' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: 'Здравствуйте! Спасибо за ваше обращение.' })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({ example: 'lead-automation' })
  @IsString()
  @IsOptional()
  instanceName?: string;
}

export class SetWebhookDto {
  @ApiProperty({ example: 'lead-automation' })
  @IsString()
  @IsNotEmpty()
  instanceName: string;

  @ApiProperty({ example: 'https://your-backend.com/api/v1/whatsapp/webhook' })
  @IsString()
  @IsNotEmpty()
  webhookUrl: string;
}
