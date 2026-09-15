import { Test } from '@nestjs/testing';
import { McpServerToolsController } from './mcp-server-tools.controller';
import { McpProxyService } from './mcp-proxy.service';

describe('McpServerToolsController', () => {
  let controller: McpServerToolsController;
  const mcpProxy = { listServerTools: jest.fn(), syncServerTools: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [McpServerToolsController],
      providers: [{ provide: McpProxyService, useValue: mcpProxy }],
    }).compile();
    controller = module.get(McpServerToolsController);
  });

  it('listTools delegates to the proxy service', async () => {
    mcpProxy.listServerTools.mockResolvedValue({ serverId: 1, tools: [], reachable: true });
    const res = await controller.listTools(1);
    expect(mcpProxy.listServerTools).toHaveBeenCalledWith(1);
    expect(res.serverId).toBe(1);
  });

  it('syncTools delegates to the proxy service', async () => {
    mcpProxy.syncServerTools.mockResolvedValue({ serverId: 2, tools: [], reachable: true });
    const res = await controller.syncTools(2);
    expect(mcpProxy.syncServerTools).toHaveBeenCalledWith(2);
    expect(res.serverId).toBe(2);
  });
});