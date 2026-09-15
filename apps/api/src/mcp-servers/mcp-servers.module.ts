import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { McpServerEntity } from './mcp-server.entity';
import { AgentMcpServerEntity } from './agent-mcp-server.entity';
import { McpServersService } from './mcp-servers.service';
import { McpServersController } from './mcp-servers.controller';
import { McpCacheModule } from '../mcp/mcp-cache.module';

@Module({
  imports: [TypeOrmModule.forFeature([McpServerEntity, AgentMcpServerEntity]), McpCacheModule],
  providers: [McpServersService],
  controllers: [McpServersController],
  exports: [McpServersService],
})
export class McpServersModule {}