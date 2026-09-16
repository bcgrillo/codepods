import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateManagedApiDto {
  @IsString() @MaxLength(120) name!: string;

  @IsOptional() @IsString() @MaxLength(500) description?: string;

  @IsString() @MaxLength(2048) baseUrl!: string;

  @IsOptional() @IsInt() credentialId?: number | null;

  @IsString() @MaxLength(500) headerPattern!: string;

  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class UpdateManagedApiDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;

  @IsOptional() @IsString() @MaxLength(500) description?: string;

  @IsOptional() @IsString() @MaxLength(2048) baseUrl?: string;

  @IsOptional() @IsInt() credentialId?: number | null;

  @IsOptional() @IsString() @MaxLength(500) headerPattern?: string;

  @IsOptional() @IsBoolean() enabled?: boolean;
}