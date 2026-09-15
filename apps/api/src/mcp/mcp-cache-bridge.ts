import { Injectable } from '@nestjs/common';

/**
 * Decouples cache invalidation between McpProxyService (which owns the cache)
 * and McpServersService (which needs to invalidate on update/delete).
 *
 * Without this bridge, McpServersModule would need to import McpModule (or
 * vice-versa) creating a circular module dependency: McpModule → AgentsModule
 * → McpServersModule → McpModule.
 *
 * Instead, both modules import McpCacheModule (no dependencies of its own):
 * - McpProxyService registers its `invalidate` callback on init.
 * - McpServersService calls `bridge.invalidate(id)` after update/delete.
 */
@Injectable()
export class McpCacheBridge {
  private invalidateFn: ((serverId: number) => void) | null = null;

  /** Called by McpProxyService to register its cache invalidation handler. */
  registerInvalidate(fn: (serverId: number) => void): void {
    this.invalidateFn = fn;
  }

  /** Called by McpServersService to invalidate the cached tool list for a server. */
  invalidate(serverId: number): void {
    this.invalidateFn?.(serverId);
  }
}