import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateImageTemplateDto {
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  name?: string;

  @IsString()
  @IsNotEmpty()
  repoUrl!: string;

  @IsString()
  @IsOptional()
  repoPath?: string = '.';

  @IsString()
  @IsOptional()
  @IsNotEmpty()
  branch?: string = 'main';

  @IsInt()
  @Min(1)
  @IsOptional()
  codepodId?: number = 1;
}
