import { Controller, Get, Post, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { McpProxyService } from './mcp-proxy.service';

/**
 * Per-server MCP tools endpoints for the CodePods UI (MCP server detail page).
 * Lives in McpModule alongside the proxy service to avoid circular deps.
 * Routes are namespaced under `/mcp-servers/:id/tools` to match the
 * mcp-servers resource.
 */
@ApiTags('MCP Servers')
@Controller('mcp-servers')
export class McpServerToolsController {
  constructor(private readonly mcpProxy: McpProxyService) {}

  @Get(':id/tools')
  async listTools(@Param('id', ParseIntPipe) id: number) {
    return this.mcpProxy.listServerTools(id);
  }

  @Post(':id/tools/sync')
  async syncTools(@Param('id', ParseIntPipe) id: number) {
    return this.mcpProxy.syncServerTools(id);
  }
}