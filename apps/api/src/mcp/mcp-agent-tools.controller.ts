import { Controller, Get, Param } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { McpProxyService } from './mcp-proxy.service';

/**
 * Exposes the cached per-agent MCP tool inventory for the CodePods UI
 * (the "view an agent → see its MCP tools" panel). Lives in McpModule to avoid
 * a circular dependency with AgentsModule; the route is namespaced under
 * `/agents/:id/mcp-tools` to match the agents resource.
 */
@ApiExcludeController()
@Controller('agents')
export class AgentMcpToolsController {
  constructor(private readonly mcpProxy: McpProxyService) {}

  @Get(':id/mcp-tools')
  listMcpTools(@Param('id') id: string) {
    return this.mcpProxy.listAgentMcpTools(id);
  }
}