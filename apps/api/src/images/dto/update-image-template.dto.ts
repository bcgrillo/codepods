import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateImageTemplateDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
