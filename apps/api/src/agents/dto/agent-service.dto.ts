import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import type { AgentServiceType } from '@codepods/shared-types';

export class CreateAgentServiceDto {
  @IsString()
  @IsIn(['terminal', 'web'])
  type!: AgentServiceType;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;
}

export class UpdateAgentServiceDto {
  @IsString()
  @IsIn(['terminal', 'web'])
  @IsOptional()
  type?: AgentServiceType;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  port?: number;
}
