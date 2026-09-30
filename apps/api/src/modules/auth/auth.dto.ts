import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '@fakhri/prisma';

const ROLES = Object.values(UserRole);

export class AdminLoginDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}

export class RefreshTokenDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  refreshToken!: string;
}

export class CreateAdminUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsString()
  @MaxLength(200)
  password!: string;

  @IsIn(ROLES)
  role!: UserRole;
}

export class UpdateAdminUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: UserRole;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string;

  @IsOptional()
  isActive?: boolean;
}
