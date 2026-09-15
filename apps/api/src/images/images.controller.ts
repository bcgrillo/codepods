import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ReorderDto } from '@codepods/shared-types';
import { CreateImageTemplateDto } from './dto/create-image-template.dto';
import { UpdateImageTemplateDto } from './dto/update-image-template.dto';
import { ImagesService } from './images.service';

@ApiTags('Templates')
@Controller('images')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Get()
  findAll(@Query('codepodId') codepodId?: string) {
    return this.imagesService.findAll(codepodId ? parseInt(codepodId, 10) : 1);
  }

  @Post('reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorder(@Body() dto: ReorderDto) {
    return this.imagesService.reorder(dto.ids as number[]);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.imagesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateImageTemplateDto) {
    return this.imagesService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateImageTemplateDto,
  ) {
    return this.imagesService.update(id, dto);
  }

  @Post(':id/ensure')
  ensure(
    @Param('id', ParseIntPipe) id: number,
    @Query('update') update?: string,
    @Query('checkOnly') checkOnly?: string,
  ) {
    return this.imagesService.ensureImage(id, update === 'true', undefined, undefined, false, checkOnly === 'true');
  }

  @Post(':id/ensure-stream')
  async ensureStream(
    @Param('id', ParseIntPipe) id: number,
    @Query('update') update: string | undefined,
    @Query('checkOnly') checkOnly: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await this.imagesService.ensureImage(
        id,
        update === 'true',
        undefined,
        (line) => sendEvent('progress', { line }),
        false,
        checkOnly === 'true',
      );
      sendEvent('done', result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const response =
        error instanceof Error && 'response' in error
          ? (error as Error & { response?: unknown }).response
          : undefined;
      const payload =
        typeof response === 'object' && response !== null
          ? { message, ...response }
          : { message };
      sendEvent('error', payload);
    } finally {
      res.end();
    }
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.imagesService.remove(id);
  }
}
