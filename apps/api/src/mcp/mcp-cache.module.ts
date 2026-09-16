import { Module } from '@nestjs/common';
import { McpCacheBridge } from './mcp-cache-bridge';

@Module({
  providers: [McpCacheBridge],
  exports: [McpCacheBridge],
})
export class McpCacheModule {}