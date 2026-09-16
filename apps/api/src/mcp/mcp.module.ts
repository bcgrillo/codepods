import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { McpServersModule } from '../mcp-servers/mcp-servers.module';
import { ManagedApisModule } from '../managed-apis/managed-apis.module';
import { McpCacheModule } from './mcp-cache.module';
import { McpController } from './mcp.controller';
import { AgentMcpToolsController } from './mcp-agent-tools.controller';
import { McpServerToolsController } from './mcp-server-tools.controller';
import { McpService } from './mcp.service';
import { McpProxyService } from './mcp-proxy.service';

@Module({
  imports: [AgentsModule, McpServersModule, CredentialsModule, ManagedApisModule, McpCacheModule],
  controllers: [McpController, AgentMcpToolsController, McpServerToolsController],
  providers: [McpService, McpProxyService],
  exports: [],
})
export class McpModule {}