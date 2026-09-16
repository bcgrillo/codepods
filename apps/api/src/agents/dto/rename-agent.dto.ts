import { IsString, IsNotEmpty } from 'class-validator';

export class RenameAgentDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}