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
import { ReorderDto } from '@codepods/shared-types';
import { McpServersService } from './mcp-servers.service';
import { CreateMcpServerDto, UpdateMcpServerDto } from './dto/mcp-server.dto';

@Controller()
export class McpServersController {
  constructor(private readonly servers: McpServersService) {}

  @ApiTags('MCP Servers')
  @Get('mcp-servers')
  async findAll(@Query('codepodId') codepodId?: string) {
    return this.servers.findAll(codepodId ? parseInt(codepodId, 10) : 1);
  }

  @ApiTags('MCP Servers')
  @Get('mcp-servers/:id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.servers.findOne(id);
  }

  @ApiTags('MCP Servers')
  @Post('mcp-servers')
  async create(@Body() dto: CreateMcpServerDto) {
    return this.servers.create(dto);
  }

  @ApiTags('MCP Servers')
  @Patch('mcp-servers/:id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMcpServerDto) {
    return this.servers.update(id, dto);
  }

  @ApiTags('MCP Servers')
  @Delete('mcp-servers/:id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.servers.remove(id);
    return { ok: true };
  }

  @ApiTags('MCP Servers')
  @Post('mcp-servers/reorder')
  async reorder(@Body() dto: ReorderDto) {
    await this.servers.reorder(dto.ids as number[]);
    return { ok: true };
  }
}