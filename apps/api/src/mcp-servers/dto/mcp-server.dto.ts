import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateMcpServerDto {
  @IsString() @MaxLength(120) name!: string;

  @IsOptional() @IsString() @MaxLength(120) slug?: string;

  @IsOptional() @IsEnum(['http', 'stdio']) transport?: 'http' | 'stdio';

  @IsOptional() @IsString() @MaxLength(2048) url?: string | null;

  @IsOptional() @IsInt() credentialId?: number | null;

  @IsOptional() @IsBoolean() enabled?: boolean;

  @IsOptional() @IsBoolean() connectAllAgents?: boolean;
}

export class UpdateMcpServerDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;

  @IsOptional() @IsString() @MaxLength(120) slug?: string;

  @IsOptional() @IsEnum(['http', 'stdio']) transport?: 'http' | 'stdio';

  @IsOptional() @IsString() @MaxLength(2048) url?: string | null;

  @IsOptional() @IsInt() credentialId?: number | null;

  @IsOptional() @IsBoolean() enabled?: boolean;

  @IsOptional() @IsBoolean() connectAllAgents?: boolean;
}