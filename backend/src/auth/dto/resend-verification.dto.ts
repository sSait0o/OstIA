import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResendVerificationDto {
  @ApiProperty({ example: 'quentin.leboucher@example.com' })
  @IsEmail()
  email: string;
}
