import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsObject,
  IsInt,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PortBindingDto {
  @IsInt()
  @Min(1)
  @Max(65535)
  containerPort!: number;

  @IsInt()
  @Min(1)
  @Max(65535)
  hostPort!: number;

  @IsString()
  @IsOptional()
  protocol?: 'tcp' | 'udp' = 'tcp';
}

export class CreateAgentDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  @IsNotEmpty()
  image?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  imageTemplateId?: number;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  updateImageIfOutdated?: boolean = false;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  allowOutdatedImage?: boolean = false;

  @IsInt()
  @Min(1)
  @IsOptional()
  codepodId?: number = 1;

  @IsArray()
  @IsOptional()
  @Type(() => PortBindingDto)
  ports?: PortBindingDto[] = [];

  @IsObject()
  @IsOptional()
  env?: Record<string, string> = {};

  @IsInt()
  @Min(1)
  @IsOptional()
  workspaceId?: number;
}
