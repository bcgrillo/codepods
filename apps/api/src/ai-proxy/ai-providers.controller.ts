import {
  All,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ReorderDto } from '@codepods/shared-types';
import { AiProvidersService } from './ai-providers.service';
import { AiProxyService } from './ai-proxy.service';
import {
  CreateAiProviderDto,
  UpdateAiProviderDto,
  CreateAiModelDto,
  UpdateAiModelDto,
} from './dto/ai-provider.dto';
import { AgentAllowed } from '../auth/agent-allowed.decorator';

@Controller()
export class AiProvidersController {
  constructor(
    private readonly providers: AiProvidersService,
    private readonly proxy: AiProxyService,
  ) {}

  // ---- Providers -------------------------------------------------------

  @ApiTags('AI Providers')
  @Get('ai-providers')
  async findAll(@Query('codepodId') codepodId?: string) {
    const list = await this.providers.findAll(codepodId ? parseInt(codepodId, 10) : 1);
    return list.map((p) => this.providers.toSafe(p));
  }

  @ApiTags('AI Providers')
  @Post('ai-providers/reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorder(@Body() dto: ReorderDto) {
    return this.providers.reorder(dto.ids as number[]);
  }

  @ApiTags('AI Providers')
  @Get('ai-providers/:id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const provider = await this.providers.findOne(id);
    return this.providers.toSafe(provider);
  }

  @ApiTags('AI Providers')
  @Post('ai-providers')
  async create(@Body() dto: CreateAiProviderDto) {
    const provider = await this.providers.create(dto);
    return this.providers.toSafe(provider);
  }

  @ApiTags('AI Providers')
  @Patch('ai-providers/:id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAiProviderDto) {
    const provider = await this.providers.update(id, dto);
    return this.providers.toSafe(provider);
  }

  @ApiTags('AI Providers')
  @Delete('ai-providers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.providers.remove(id);
  }

  @ApiTags('AI Providers')
  @Post('ai-providers/:id/test')
  test(@Param('id', ParseIntPipe) id: number, @Query('modelId') modelId?: string) {
    return this.proxy.testProvider(id, modelId ? parseInt(modelId, 10) : undefined);
  }

  // ---- Models ----------------------------------------------------------

  @ApiTags('AI Models')
  @Get('ai-providers/:id/models')
  listModels(@Param('id', ParseIntPipe) id: number) {
    return this.providers.listModels(id);
  }

  @ApiTags('AI Models')
  @Post('ai-providers/:id/models')
  createModel(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateAiModelDto) {
    return this.providers.createModel(id, dto);
  }

  @ApiTags('AI Models')
  @Patch('ai-providers/:id/models/:modelId')
  updateModel(
    @Param('id', ParseIntPipe) id: number,
    @Param('modelId', ParseIntPipe) modelId: number,
    @Body() dto: UpdateAiModelDto,
  ) {
    return this.providers.updateModel(id, modelId, dto);
  }

  @ApiTags('AI Models')
  @Delete('ai-providers/:id/models/:modelId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeModel(
    @Param('id', ParseIntPipe) id: number,
    @Param('modelId', ParseIntPipe) modelId: number,
  ) {
    return this.providers.removeModel(id, modelId);
  }

  // ---- Proxy forward ---------------------------------------------------

  // All traffic under /ai-proxy/:slug/* is forwarded to the resolved
  // upstream provider. The `:slug*` pattern matches the slug plus any
  // trailing path so streaming and non-JSON bodies pass through.
  @ApiTags('AI Proxy')
  @AgentAllowed()
  @All('ai-proxy/:slug*')
  forward(@Req() req: Request, @Res() res: Response, @Param('slug') slug: string) {
    return this.proxy.forward(req, res, slug);
  }
}