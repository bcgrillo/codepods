import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ManagedApisService } from './managed-apis.service';
import { CreateManagedApiDto, UpdateManagedApiDto } from './dto/managed-api.dto';

@Controller()
export class ManagedApisController {
  constructor(private readonly apis: ManagedApisService) {}

  @ApiTags('Managed APIs')
  @Get('managed-apis')
  async findAll(@Query('codepodId') codepodId?: string) {
    return this.apis.findAll(codepodId ? parseInt(codepodId, 10) : 1);
  }

  @ApiTags('Managed APIs')
  @Get('managed-apis/:id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.apis.findOne(id);
  }

  @ApiTags('Managed APIs')
  @Post('managed-apis')
  async create(@Body() dto: CreateManagedApiDto) {
    return this.apis.create(dto);
  }

  @ApiTags('Managed APIs')
  @Patch('managed-apis/:id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateManagedApiDto) {
    return this.apis.update(id, dto);
  }

  @ApiTags('Managed APIs')
  @Delete('managed-apis/:id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.apis.remove(id);
    return { ok: true };
  }
}