import {
  Controller,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Res,
  Headers,
  Logger,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { McpService } from './mcp.service';
import { McpProxyService } from './mcp-proxy.service';
import { AgentAllowed } from '../auth/agent-allowed.decorator';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const BUILT_IN_SLUG = 'codepods';

/**
 * Per-slug MCP endpoint. The agent posts JSON-RPC to `/api/mcp/<slug>` with an
 * `Authorization: Bearer <agentId>` header. The built-in `codepods` server is
 * handled locally; every other slug is forwarded to the remote server (see
 * {@link McpProxyService.proxyExternalRequest}).
 */
@ApiExcludeController()
@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(
    private readonly mcpService: McpService,
    private readonly mcpProxy: McpProxyService,
  ) {}

  @Post(':slug')
  @AgentAllowed()
  @HttpCode(HttpStatus.OK)
  async handleJsonRpc(
    @Param('slug') slug: string,
    @Body() body: JsonRpcRequest | JsonRpcRequest[],
    @Headers('authorization') auth: string | undefined,
    @Headers('x-agent-id') xAgentId: string | undefined,
    @Res() res: Response,
  ) {
    // X-Agent-Id from the egress proxy (ADR-036) takes priority;
    // fall back to the Bearer token for backward compatibility.
    const agentId = xAgentId ?? this.extractAgentId(auth);

    if (slug === BUILT_IN_SLUG) {
      if (Array.isArray(body)) {
        const responses = await Promise.all(
          body.map((req) => this.handleBuiltInSingle(req, agentId)),
        );
        res.json(responses.filter((r) => r !== null));
        return;
      }
      const response = await this.handleBuiltInSingle(body, agentId);
      if (response === null) {
        res.status(HttpStatus.ACCEPTED).end();
        return;
      }
      res.json(response);
      return;
    }

    // External server — transparent JSON-RPC pass-through.
    const result = await this.mcpProxy.proxyExternalRequest(slug, body);
    if (result === null) {
      res.status(HttpStatus.ACCEPTED).end();
      return;
    }
    res.json(result);
  }

  /** Handle a single JSON-RPC request against the built-in CodePods MCP. */
  private async handleBuiltInSingle(
    req: JsonRpcRequest,
    agentId: string | null,
  ): Promise<JsonRpcResponse | null> {
    try {
      switch (req.method) {
        case 'initialize':
        case 'initialized':
          return { jsonrpc: '2.0', id: req.id ?? null, result: this.mcpService.getServerInfo() };

        case 'notifications/initialized':
          return null;

        case 'ping':
          return { jsonrpc: '2.0', id: req.id ?? null, result: {} };

        case 'tools/list':
          return { jsonrpc: '2.0', id: req.id ?? null, result: this.mcpService.listTools() };

        case 'tools/call': {
          if (!agentId) {
            return {
              jsonrpc: '2.0',
              id: req.id ?? null,
              error: { code: -32602, message: 'Missing agent identity (Authorization header)' },
            };
          }
          const params = req.params ?? {};
          const toolName = params.name as string;
          const args = (params.arguments as Record<string, unknown>) ?? {};
          const result = await this.mcpService.callTool(toolName, args, agentId);
          return { jsonrpc: '2.0', id: req.id ?? null, result };
        }

        default:
          return {
            jsonrpc: '2.0',
            id: req.id ?? null,
            error: { code: -32601, message: `Method not found: ${req.method}` },
          };
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal error';
      this.logger.error(`Built-in MCP error: ${message}`);
      return {
        jsonrpc: '2.0',
        id: req.id ?? null,
        error: { code: -32603, message: 'Internal error', data: message },
      };
    }
  }

  private extractAgentId(auth: string | undefined): string | null {
    if (!auth) return null;
    const m = auth.match(/^Bearer\s+(.+)$/i);
    return m ? m[1].trim() : null;
  }
}