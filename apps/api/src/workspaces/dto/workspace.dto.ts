import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { CreateWorkspaceDto, UpdateWorkspaceDto } from '@codepods/shared-types';

export class InlineWorkspaceCredentialDto {
  @IsString() @IsNotEmpty() username!: string;
  @IsString() @IsNotEmpty() token!: string;
  @IsString() @IsOptional() label?: string;
}

export class CreateWorkspaceBodyDto implements CreateWorkspaceDto {
  @IsString() @IsOptional() name?: string;
  @IsString() @IsOptional() slug?: string;
  @IsIn(['local', 'remote']) type!: 'local' | 'remote';
  @IsString() @IsOptional() remoteUrl?: string;
  @IsInt() @IsOptional() credentialId?: number | null;
  @IsObject() @IsOptional() @ValidateNested() @Type(() => InlineWorkspaceCredentialDto) credential?: InlineWorkspaceCredentialDto;
  @IsInt() @IsOptional() codepodId?: number;

  /** New-remote: git provider type (github, etc.) */
  @IsIn(['github', 'gitlab']) @IsOptional() gitProvider?: 'github' | 'gitlab';
  /** New-remote: repo name (use `org/name` for organizations) */
  @IsString() @IsOptional() repoName?: string;
  /** New-remote: whether the repo should be private */
  @IsOptional() repoPrivate?: boolean;

  /** Copy the default AGENTS.md into the workspace after creation. */
  @IsBoolean() @IsOptional() copyAgentsMd?: boolean;
  /** Specific AGENTS.md version to copy (defaults to the default version when omitted). */
  @IsInt() @IsOptional() agentsMdId?: number | null;
}

export class UpdateWorkspaceBodyDto implements UpdateWorkspaceDto {
  @IsString() @IsOptional() name?: string;
  @IsIn(['local', 'remote']) @IsOptional() type?: 'local' | 'remote';
  @IsString() @IsOptional() remoteUrl?: string | null;
  @IsInt() @IsOptional() credentialId?: number | null;

  /** New-remote conversion: create a new repo on the provider and push. */
  @IsIn(['github', 'gitlab']) @IsOptional() gitProvider?: 'github' | 'gitlab';
  @IsString() @IsOptional() repoName?: string;
  @IsOptional() repoPrivate?: boolean;
}