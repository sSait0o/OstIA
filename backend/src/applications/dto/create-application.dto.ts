import { IsString, IsNotEmpty, IsEnum, IsOptional, IsUrl, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationStatus, ApplicationSource } from '../entities/application.entity';

export class CreateApplicationDto {
  @ApiProperty({ example: 'Google' })
  @IsString()
  @IsNotEmpty()
  company: string;

  @ApiProperty({ example: 'Data Engineer' })
  @IsString()
  @IsNotEmpty()
  jobTitle: string;

  @ApiPropertyOptional({ enum: ApplicationStatus, default: ApplicationStatus.APPLIED })
  @IsEnum(ApplicationStatus)
  @IsOptional()
  status?: ApplicationStatus;

  @ApiPropertyOptional({ enum: ApplicationSource, default: ApplicationSource.MANUAL })
  @IsEnum(ApplicationSource)
  @IsOptional()
  source?: ApplicationSource;

  @ApiPropertyOptional()
  @IsUrl()
  @IsOptional()
  jobUrl?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  salary?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  appliedAt?: string;
}
