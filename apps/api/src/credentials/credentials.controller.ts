import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CredentialsService } from './credentials.service';
import { CreateCredentialDto, UpdateCredentialDto } from './dto/credential.dto';

@Controller()
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  @ApiTags('Credentials')
  @Get('credentials')
  async findAll(@Query('codepodId') codepodId?: string) {
    return this.credentials.findAll(codepodId ? parseInt(codepodId, 10) : 1);
  }

  @ApiTags('Credentials')
  @Get('credentials/:id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.credentials.findOne(id);
  }

  @ApiTags('Credentials')
  @Post('credentials')
  async create(@Body() dto: CreateCredentialDto) {
    return this.credentials.create(dto);
  }

  @ApiTags('Credentials')
  @Patch('credentials/:id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCredentialDto) {
    return this.credentials.update(id, dto);
  }

  @ApiTags('Credentials')
  @Delete('credentials/:id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.credentials.remove(id);
    return { ok: true };
  }
}