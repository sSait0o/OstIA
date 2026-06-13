import { IsEmail, IsString, MinLength, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'quentin.leboucher@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Quentin' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Leboucher' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'password123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}
