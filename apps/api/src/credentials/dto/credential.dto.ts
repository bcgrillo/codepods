import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CredentialType } from '@codepods/shared-types';

export class CreateCredentialDto {
  @IsString() @MaxLength(120) label!: string;

  @IsEnum(['key', 'user_pass']) type!: CredentialType;

  @IsOptional() @IsString() @MaxLength(255) host?: string | null;

  @IsOptional() @IsString() @MaxLength(255) username?: string | null;

  /** Plaintext secret (key/token/password). Encrypted server-side. */
  @IsOptional() @IsString() secret?: string | null;
}

export class UpdateCredentialDto {
  @IsOptional() @IsString() @MaxLength(120) label?: string;

  @IsOptional() @IsEnum(['key', 'user_pass']) type?: CredentialType;

  @IsOptional() @IsString() @MaxLength(255) host?: string | null;

  @IsOptional() @IsString() @MaxLength(255) username?: string | null;

  /**
   * Optional new plaintext secret. If omitted, existing secret is preserved.
   * Send null/empty to clear.
   */
  @IsOptional() @IsString() secret?: string | null;
}