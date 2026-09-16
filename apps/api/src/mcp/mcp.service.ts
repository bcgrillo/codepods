import { Injectable, NotFoundException } from '@nestjs/common';
import { AgentsService } from '../agents/agents.service';
import { AgentRequestsService } from '../agents/agent-requests.service';
import { ConfigService } from '../config/config.service';
import { ManagedApisService } from '../managed-apis/managed-apis.service';
import type { AgentServiceType } from '@codepods/shared-types';

interface OpenServiceArgs {
  name: string;
  port: number;
  type?: AgentServiceType;
}

interface CloseServiceArgs {
  name: string;
}

interface CallApiArgs {
  apiName: string;
  method: string;
  path: string;
  queryParams?: Record<string, string>;
  headers?: Record<string, string>;
  body?: string;
}

interface RequestAccessArgs {
  url: string;
  reason?: string;
  duration?: number;
}

interface CheckRequestArgs {
  requestId: number;
}

export interface McpToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

const MCP_PROTOCOL_VERSION = '2024-11-05';

@Injectable()
export class McpService {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly config: ConfigService,
    private readonly managedApis: ManagedApisService,
    private readonly agentRequests: AgentRequestsService,
  ) {}

  getServerInfo() {
    return {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: 'codepods-mcp', version: '1.0.0' },
    };
  }

  listTools() {
    return {
      tools: [
        {
          name: 'open_service',
          description:
            'Open a new service port accessible from outside the agent container. ' +
            'Returns the public proxy URL that can be used to reach this service from a browser or other services.',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Unique service name (used in the proxy URL path)',
              },
              port: {
                type: 'number',
                description: 'Container-internal port the service listens on',
              },
              type: {
                type: 'string',
                enum: ['web', 'terminal'],
                description: 'Service type. "web" for HTTP, "terminal" for shell access.',
                default: 'web',
              },
            },
            required: ['name', 'port'],
          },
        },
        {
          name: 'close_service',
          description: 'Close and remove a previously opened service by name.',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Name of the service to close',
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'get_available_apis',
          description:
            'List all APIs configured by the CodePods administrator that you can call ' +
            'with credentials managed by the server (you never see the actual keys). ' +
            'Returns the API name and base URL for each available API.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'call_api_with_credentials',
          description:
            'Make an HTTP request to a managed API. The server injects the ' +
            'authentication header automatically — you provide the API name, method, ' +
            'path, and optional query params / body. Returns the HTTP status, ' +
            'response headers, and response body.',
          inputSchema: {
            type: 'object',
            properties: {
              apiName: {
                type: 'string',
                description: 'Name of the managed API (see get_available_apis)',
              },
              method: {
                type: 'string',
                enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
                description: 'HTTP method',
              },
              path: {
                type: 'string',
                description: 'Path after the base URL (e.g. "/repos/owner/repo")',
              },
              queryParams: {
                type: 'object',
                description: 'Optional query parameters as key-value pairs',
              },
              headers: {
                type: 'object',
                description: 'Optional extra headers (auth header is injected automatically)',
              },
              body: {
                type: 'string',
                description: 'Optional request body (JSON string)',
              },
            },
            required: ['apiName', 'method', 'path'],
          },
        },
        {
          name: 'request_access',
          description:
            'Request access to a URL that is blocked by the network egress whitelist. ' +
            'The user will be notified and can approve (temporarily or permanently) or reject. ' +
            'This call waits up to 120 seconds for the user to respond. ' +
            'If approved, retry the original request. ' +
            'If the timeout is reached, the status will be "pending" and you can ' +
            'check later with check_request.',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'The full URL you want to access (e.g. "https://registry.npmjs.org/package")',
              },
              reason: {
                type: 'string',
                description: 'Brief explanation of why you need access to this URL',
              },
              duration: {
                type: 'number',
                description: 'Requested duration in minutes for temporary access (optional, default 5)',
              },
            },
            required: ['url'],
          },
        },
        {
          name: 'check_request',
          description:
            'Check the status of a previously submitted request_access call. ' +
            'Returns the current status (pending, approved, rejected, or expired).',
          inputSchema: {
            type: 'object',
            properties: {
              requestId: {
                type: 'number',
                description: 'The request ID returned by request_access',
              },
            },
            required: ['requestId'],
          },
        },
      ],
    };
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    agentId: string,
  ): Promise<McpToolResult> {
    switch (toolName) {
      case 'open_service':
        return this.openService(args as unknown as OpenServiceArgs, agentId);
      case 'close_service':
        return this.closeService(args as unknown as CloseServiceArgs, agentId);
      case 'get_available_apis':
        return this.getAvailableApis(agentId);
      case 'call_api_with_credentials':
        return this.callApiWithCredentials(args as unknown as CallApiArgs, agentId);
      case 'request_access':
        return this.requestAccess(args as unknown as RequestAccessArgs, agentId);
      case 'check_request':
        return this.checkRequest(args as unknown as CheckRequestArgs, agentId);
      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
          isError: true,
        };
    }
  }

  private async openService(args: OpenServiceArgs, agentId: string): Promise<McpToolResult> {
    const { name, port, type = 'web' } = args;
    if (!name || !port) {
      return {
        content: [{ type: 'text', text: 'Missing required parameters: name and port' }],
        isError: true,
      };
    }

    const agent = await this.agentsService.findOne(agentId);
    if (!agent) {
      return {
        content: [{ type: 'text', text: `Agent "${agentId}" not found` }],
        isError: true,
      };
    }

    try {
      const service = await this.agentsService.createService(agent.id, {
        name,
        port,
        type,
      });
      const proxyPath = `/api/proxy/${encodeURIComponent(agent.name)}/${encodeURIComponent(service.name)}/`;
      const internalUrl = `http://host.docker.internal:3000${proxyPath}`;
      const publicBaseUrl = (this.config.get('publicUrl')).replace(/\/$/, '');
      const publicUrl = `${publicBaseUrl}${proxyPath}`;

      const lines = [
        `Service "${service.name}" opened on port ${service.port} (${service.type}).`,
        `Internal URL (from inside the container): ${internalUrl}`,
        `Public URL (from a browser or external services): ${publicUrl}`,
      ];
      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text', text: `Failed to open service: ${msg}` }],
        isError: true,
      };
    }
  }

  private async closeService(args: CloseServiceArgs, agentId: string): Promise<McpToolResult> {
    const { name } = args;
    if (!name) {
      return {
        content: [{ type: 'text', text: 'Missing required parameter: name' }],
        isError: true,
      };
    }

    const agent = await this.agentsService.findOne(agentId);
    if (!agent) {
      return {
        content: [{ type: 'text', text: `Agent "${agentId}" not found` }],
        isError: true,
      };
    }

    try {
      const service = await this.agentsService.findServiceByName(agent.id, name);
      if (!service) {
        throw new NotFoundException(`Service "${name}" not found`);
      }
      await this.agentsService.removeService(agent.id, service.id);
      return {
        content: [{ type: 'text', text: `Service "${name}" closed.` }],
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text', text: `Failed to close service: ${msg}` }],
        isError: true,
      };
    }
  }

  private async getAvailableApis(agentId: string): Promise<McpToolResult> {
    try {
      const agent = await this.agentsService.findOne(agentId);
      if (!agent) {
        return {
          content: [{ type: 'text', text: `Agent "${agentId}" not found` }],
          isError: true,
        };
      }
      const apis = await this.managedApis.listAvailable(agent.codepodId);
      const lines = apis.length === 0
        ? 'No managed APIs are currently available.'
        : apis.map((a) => {
            const desc = a.description ? ` — ${a.description}` : '';
            return `- ${a.name} (${a.baseUrl})${desc}`;
          }).join('\n');
      return { content: [{ type: 'text', text: lines }] };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { content: [{ type: 'text', text: `Failed to list APIs: ${msg}` }], isError: true };
    }
  }

  private async callApiWithCredentials(args: CallApiArgs, agentId: string): Promise<McpToolResult> {
    const { apiName, method, path, queryParams, headers, body } = args;
    if (!apiName || !method || !path) {
      return {
        content: [{ type: 'text', text: 'Missing required parameters: apiName, method, path' }],
        isError: true,
      };
    }
    try {
      const agent = await this.agentsService.findOne(agentId);
      if (!agent) {
        return {
          content: [{ type: 'text', text: `Agent "${agentId}" not found` }],
          isError: true,
        };
      }
      const result = await this.managedApis.callApi(
        { apiName, method, path, queryParams, headers, body },
        agent.codepodId,
      );
      const text = [
        `Status: ${result.status}`,
        ...Object.entries(result.headers).map(([k, v]) => `${k}: ${v}`),
        '',
        result.body,
      ].join('\n');
      return { content: [{ type: 'text', text }] };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { content: [{ type: 'text', text: `API call failed: ${msg}` }], isError: true };
    }
  }

  private async requestAccess(args: RequestAccessArgs, agentId: string): Promise<McpToolResult> {
    const { url, reason, duration } = args;
    if (!url) {
      return {
        content: [{ type: 'text', text: 'Missing required parameter: url' }],
        isError: true,
      };
    }

    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      return {
        content: [{ type: 'text', text: `Invalid URL: ${url}` }],
        isError: true,
      };
    }

    try {
      const agent = await this.agentsService.findOne(agentId);
      if (!agent) {
        return {
          content: [{ type: 'text', text: `Agent "${agentId}" not found` }],
          isError: true,
        };
      }

      const request = await this.agentRequests.create(
        agentId,
        'whitelist',
        { url, host, duration },
        reason || `Agent needs access to ${host}`,
      );

      // Wait up to 120s for user response
      const status = await this.agentRequests.waitForResolution(request.id, 120_000);

      if (status === 'approved') {
        return {
          content: [{
            type: 'text',
            text: `Access to "${host}" has been approved (request #${request.id}). You can now retry your request to ${url}.`,
          }],
        };
      }
      if (status === 'rejected') {
        return {
          content: [{
            type: 'text',
            text: `Access to "${host}" was rejected by the user (request #${request.id}).`,
          }],
          isError: true,
        };
      }
      // Still pending after timeout
      return {
        content: [{
          type: 'text',
          text: `Request #${request.id} is still pending. The user has not responded yet. You can check the status later with check_request (requestId: ${request.id}).`,
        }],
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { content: [{ type: 'text', text: `Failed to create request: ${msg}` }], isError: true };
    }
  }

  private async checkRequest(args: CheckRequestArgs, agentId: string): Promise<McpToolResult> {
    const { requestId } = args;
    if (!requestId) {
      return {
        content: [{ type: 'text', text: 'Missing required parameter: requestId' }],
        isError: true,
      };
    }

    try {
      const request = await this.agentRequests.getStatus(agentId, requestId);
      let text = `Request #${request.id}: status="${request.status}"`;
      if (request.expiresAt) {
        text += `, expires at ${request.expiresAt}`;
      }
      if (request.status === 'approved') {
        text += `. You can retry your request.`;
      }
      return { content: [{ type: 'text', text }] };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { content: [{ type: 'text', text: `Failed to check request: ${msg}` }], isError: true };
    }
  }
}