import { IsIn, IsNotEmpty, IsOptional, IsString, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AI_PROVIDER_TYPES } from '@codepods/shared-types';

class CreateAiModelInlineDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  displayName?: string | null;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class CreateAiProviderDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  baseUrl!: string;

  @IsString()
  @IsOptional()
  @IsIn(AI_PROVIDER_TYPES)
  type?: string;

  @IsString()
  @IsOptional()
  apiKeyEnvVar?: string | null;

  /** Linked unified credential id (FK → credentials.id). */
  @IsOptional()
  credentialId?: number | null;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsOptional()
  fallbackModelId?: number | null;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateAiModelInlineDto)
  models?: CreateAiModelInlineDto[];

  @IsString()
  @IsOptional()
  iconUrl?: string | null;

  @IsString()
  @IsOptional()
  iconDarkUrl?: string | null;
}

export class UpdateAiProviderDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  baseUrl?: string;

  @IsString()
  @IsOptional()
  @IsIn(AI_PROVIDER_TYPES)
  type?: string;

  @IsString()
  @IsOptional()
  apiKeyEnvVar?: string | null;

  /** Linked unified credential id (FK → credentials.id). */
  @IsOptional()
  credentialId?: number | null;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsOptional()
  fallbackModelId?: number | null;

  @IsString()
  @IsOptional()
  iconUrl?: string | null;

  @IsString()
  @IsOptional()
  iconDarkUrl?: string | null;
}

export class CreateAiModelDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  displayName?: string | null;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class UpdateAiModelDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  displayName?: string | null;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}