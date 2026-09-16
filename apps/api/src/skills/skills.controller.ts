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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { SkillsService } from './skills.service';
import { CreateSkillSourceDto, UpdateSkillSourceDto } from './dto/skill-source.dto';
import { ReorderDto } from '@codepods/shared-types';

@Controller()
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  // ---- sources --------------------------------------------------------------

  @ApiTags('Skill Sources')
  @Get('skill-sources')
  async findAll(@Query('codepodId') codepodId?: string) {
    return this.skills.findAll(codepodId ? parseInt(codepodId, 10) : 1);
  }

  @ApiTags('Skill Sources')
  @Get('skill-sources/:id')
  async findOneSource(@Param('id', ParseIntPipe) id: number) {
    return this.skills.findOneSource(id);
  }

  @ApiTags('Skill Sources')
  @Post('skill-sources')
  async createSource(@Body() dto: CreateSkillSourceDto) {
    return this.skills.createSource(dto);
  }

  @ApiTags('Skill Sources')
  @Patch('skill-sources/:id')
  async updateSource(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSkillSourceDto) {
    return this.skills.updateSource(id, dto);
  }

  @ApiTags('Skill Sources')
  @Delete('skill-sources/:id')
  async removeSource(@Param('id', ParseIntPipe) id: number) {
    await this.skills.removeSource(id);
    return { ok: true };
  }

  @ApiTags('Skill Sources')
  @Post('skill-sources/reorder')
  async reorderSources(@Body() dto: ReorderDto) {
    await this.skills.reorderSources(dto.ids as number[]);
    return { ok: true };
  }

  @ApiTags('Skill Sources')
  @Post('skill-sources/:id/sync')
  async syncSource(@Param('id', ParseIntPipe) id: number) {
    return this.skills.syncSource(id);
  }

  @ApiTags('Skill Sources')
  @Get('skill-sources/:id/skills')
  async listSkillsBySource(@Param('id', ParseIntPipe) id: number) {
    return this.skills.listSkillsBySource(id);
  }

  // ---- local skills ---------------------------------------------------------

  @ApiTags('Skills')
  @Get('skills')
  async listAllSkills() {
    return this.skills.listAllSkills();
  }

  @ApiTags('Skills')
  @Get('skills/local')
  async listLocalSkills() {
    return this.skills.listLocalSkills();
  }

  @ApiTags('Skills')
  @Post('skills/local/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadLocalSkill(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('name') name: string,
  ) {
    if (!file) throw new Error('file is required');
    return this.skills.uploadLocalSkill(name, { buffer: file.buffer, mimetype: file.mimetype });
  }

  // ---- skills (generic) -----------------------------------------------------

  @ApiTags('Skills')
  @Get('skills/:id')
  async findOneSkill(@Param('id', ParseIntPipe) id: number) {
    return this.skills.findOneSkill(id);
  }

  @ApiTags('Skills')
  @Patch('skills/:id/rename')
  async renameSkill(@Param('id', ParseIntPipe) id: number, @Body('name') name: string) {
    return this.skills.renameLocalSkill(id, name);
  }

  @ApiTags('Skills')
  @Delete('skills/:id')
  async removeSkill(@Param('id', ParseIntPipe) id: number) {
    await this.skills.deleteLocalSkill(id);
    return { ok: true };
  }

  @ApiTags('Skills')
  @Get('skills/:id/zip')
  async streamZip(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    await this.skills.streamSkillZip(id, res);
  }
}