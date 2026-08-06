import { IsString, IsOptional, IsBoolean, MinLength } from 'class-validator';

export class CreateNoteDto {
  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}
