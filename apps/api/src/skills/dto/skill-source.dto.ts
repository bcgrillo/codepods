import { IsString, IsOptional, IsIn, IsBoolean, IsNotEmpty } from 'class-validator';
import { SkillSourceType, SKILL_SOURCE_TYPES } from '@codepods/shared-types';

export class CreateSkillSourceDto {
  @IsString() @IsNotEmpty() name!: string;

  @IsIn(SKILL_SOURCE_TYPES) type!: SkillSourceType;

  @IsOptional() @IsString() gitUrl?: string;

  @IsOptional() @IsString() subPath?: string;

  @IsOptional() @IsString() branch?: string;

  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class UpdateSkillSourceDto {
  @IsOptional() @IsString() name?: string;

  @IsOptional() @IsString() gitUrl?: string;

  @IsOptional() @IsString() subPath?: string;

  @IsOptional() @IsString() branch?: string;

  @IsOptional() @IsBoolean() enabled?: boolean;
}