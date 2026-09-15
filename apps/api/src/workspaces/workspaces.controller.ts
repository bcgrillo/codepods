import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Res, HttpCode, HttpStatus, ParseIntPipe, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ReorderDto } from '@codepods/shared-types';
import type { UploadOverwriteMode } from '@codepods/shared-types';
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceBodyDto, UpdateWorkspaceBodyDto } from './dto/workspace.dto';

@Controller()
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  // --- Workspaces ---

  @ApiTags('Workspaces')
  @Get('workspaces')
  async findAll(@Query('codepodId') codepodId?: string) {
    return this.workspaces.findAll(codepodId ? parseInt(codepodId, 10) : 1);
  }

  @ApiTags('Workspaces')
  @Post('workspaces/reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorder(@Body() dto: ReorderDto) {
    return this.workspaces.reorder(dto.ids as number[]);
  }

  @ApiTags('Workspaces')
  @Get('workspaces/:id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.workspaces.findOne(id);
  }

  @ApiTags('Workspaces')
  @Post('workspaces')
  async create(@Body() dto: CreateWorkspaceBodyDto) {
    return this.workspaces.create(dto, dto.codepodId ?? 1);
  }

  @ApiTags('Workspaces')
  @Patch('workspaces/:id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateWorkspaceBodyDto) {
    return this.workspaces.update(id, dto);
  }

  @ApiTags('Workspaces')
  @Delete('workspaces/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.workspaces.remove(id);
  }

  @ApiTags('Workspaces')
  @Get('workspaces/:id/info')
  async getInfo(@Param('id', ParseIntPipe) id: number) {
    return this.workspaces.getInfo(id);
  }

  @ApiTags('Workspaces')
  @Post('workspaces/:id/test')
  async testRemote(@Param('id', ParseIntPipe) id: number) {
    return this.workspaces.testRemote(id);
  }

  @ApiTags('Workspaces')
  @Post('workspaces/:id/copy-agents-md')
  async copyAgentsMd(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { agentsMdId?: number | null },
  ) {
    return this.workspaces.copyAgentsMd(id, body.agentsMdId ?? null);
  }

  @ApiTags('Workspaces')
  @Post('workspaces/:id/upload')
  @UseInterceptors(FilesInterceptor('files', 20, { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadFiles(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: { originalname: string; buffer: Buffer }[],
    @Body('path') path?: string,
    @Body('overwrite') overwrite?: string,
  ) {
    return this.workspaces.uploadFilesEx(id, files, 1, path, (overwrite as UploadOverwriteMode) ?? 'backup');
  }

  // --- File management ---

  @ApiTags('Workspaces')
  @Get('workspaces/:id/files')
  async listFiles(
    @Param('id', ParseIntPipe) id: number,
    @Query('path') relPath?: string,
  ) {
    return this.workspaces.listFiles(id, 1, relPath ?? '');
  }

  @ApiTags('Workspaces')
  @Get('workspaces/:id/files/content')
  async readFile(
    @Param('id', ParseIntPipe) id: number,
    @Query('path') relPath: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.workspaces.readFile(id, 1, relPath);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(result.filename)}"`);
    res.setHeader('Content-Length', result.size);
    res.end(result.buffer);
  }

  @ApiTags('Workspaces')
  @Post('workspaces/:id/folder')
  async createFolder(
    @Param('id', ParseIntPipe) id: number,
    @Body('path') relPath: string,
  ) {
    return this.workspaces.createFolder(id, 1, relPath);
  }

  @ApiTags('Workspaces')
  @Delete('workspaces/:id/files')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteFile(
    @Param('id', ParseIntPipe) id: number,
    @Query('path') relPath: string,
  ) {
    await this.workspaces.deleteFile(id, 1, relPath);
  }

  // --- Git management ---

  @ApiTags('Workspaces')
  @Get('workspaces/:id/git/status')
  async gitStatus(@Param('id', ParseIntPipe) id: number) {
    return this.workspaces.gitStatus(id, 1);
  }

  @ApiTags('Workspaces')
  @Get('workspaces/:id/git/branches')
  async gitBranches(@Param('id', ParseIntPipe) id: number) {
    return this.workspaces.gitBranches(id, 1);
  }

  @ApiTags('Workspaces')
  @Post('workspaces/:id/git/fetch')
  async gitFetch(@Param('id', ParseIntPipe) id: number) {
    return this.workspaces.gitFetch(id, 1);
  }

  @ApiTags('Workspaces')
  @Post('workspaces/:id/git/stash')
  async gitStash(
    @Param('id', ParseIntPipe) id: number,
    @Body('action') action: 'push' | 'pop',
  ) {
    return this.workspaces.gitStash(id, 1, action ?? 'push');
  }

  @ApiTags('Workspaces')
  @Post('workspaces/:id/git/commit')
  async gitCommit(
    @Param('id', ParseIntPipe) id: number,
    @Body('message') message: string,
  ) {
    return this.workspaces.gitCommit(id, 1, message);
  }

  @ApiTags('Workspaces')
  @Post('workspaces/:id/git/sync')
  async gitSync(@Param('id', ParseIntPipe) id: number) {
    return this.workspaces.gitSync(id, 1);
  }
}