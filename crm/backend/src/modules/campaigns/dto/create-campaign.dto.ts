import { IsString, IsOptional, IsArray, IsEnum, Matches } from 'class-validator';
import { AssignmentAlgorithm } from '../../../shared/enums';

export class CreateCampaignDto {
  @IsString() name!: string;
  @IsString() @Matches(/^[a-z0-9-]+$/) slug!: string;
  @IsString() waAccountId!: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() utmSource?: string;
  @IsOptional() @IsString() utmMedium?: string;
  @IsOptional() @IsString() utmCampaign?: string;
  @IsOptional() @IsEnum(AssignmentAlgorithm) assignAlgo?: AssignmentAlgorithm;
  @IsOptional() @IsArray() @IsString({ each: true }) procedureIds?: string[];
}
