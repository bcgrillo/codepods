import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => {
  const mockAgent = {
    id: '1', name: 'test-agent', slug: 'test-agent', status: 'paused',
    template: 'default', workspaceId: 1,
    services: [{ id: 1, agentId: '1', codepodId: 1, type: 'terminal', name: 'ttyd', port: 7681, createdAt: 'x', updatedAt: 'x' }],
    sortOrder: 0, enabled: true,
    imageTemplate: { name: 'default', displayName: 'Default' },
    templateIcon: null, templateIconDark: null, templateName: 'Default',
    image: 'default', volumes: [], envVars: {},
  };
  return {
    agentsSdk: {
      listAgents: vi.fn().mockResolvedValue([mockAgent]),
      getAgent: vi.fn().mockResolvedValue(mockAgent),
      startAgent: vi.fn().mockResolvedValue(undefined),
      stopAgent: vi.fn().mockResolvedValue(undefined),
      restartAgent: vi.fn().mockResolvedValue(mockAgent),
      getAgentServiceProxyUrl: (name: string, service: string) =>
        `/api/proxy/${encodeURIComponent(name)}/${encodeURIComponent(service)}/`,
    },
  };
});

vi.mock('@codepods/sdk', () => ({
  AgentsClient: vi.fn().mockImplementation(() => mocks.agentsSdk),
}));

vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { changeLanguage: vi.fn(), language: 'en' },
  }),
}));

import { AgentList } from './AgentList';

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/agents']}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
};

describe('AgentList context menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts an agent from the context menu', async () => {
    render(<AgentList />, { wrapper });

    await screen.findByText('test-agent');

    // Right-click the agent card to open the context menu
    const card = screen.getByText('test-agent');
    fireEvent.contextMenu(card);

    // New-tab section renders first — the label prefix matches every item.
    await waitFor(() => {
      expect(screen.getAllByText(/agents\.openServiceInNewTab/).length).toBeGreaterThan(0);
    });
    const startItem = screen.getByText('agents.start');
    fireEvent.click(startItem);

    await waitFor(() => expect(mocks.agentsSdk.startAgent).toHaveBeenCalledWith('1'));
  });

  it('opens the console in a new tab from the context menu', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<AgentList />, { wrapper });

    await screen.findByText('test-agent');

    const card = screen.getByText('test-agent');
    fireEvent.contextMenu(card);

    await waitFor(() => {
      expect(screen.getAllByText(/agents\.openServiceInNewTab/).length).toBeGreaterThan(0);
    });
    const items = screen.getAllByText(/agents\.openServiceInNewTab/);
    expect(items.length).toBeGreaterThan(0);
    // console item is the last open-in-new-tab item → opens the agent WITH the frame
    fireEvent.click(items[items.length - 1]);

    expect(openSpy).toHaveBeenCalledWith('/agents/test-agent', '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();
  });

  it('opens a service with the frame by default and without it via the external icon', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<AgentList />, { wrapper });

    await screen.findByText('test-agent');

    const card = screen.getByText('test-agent');
    fireEvent.contextMenu(card);

    await waitFor(() => {
      expect(screen.getAllByText(/agents\.openServiceInNewTab/).length).toBeGreaterThan(0);
    });

    // Main click → in-app route WITH the frame
    const openItem = screen.getAllByText(/agents\.openServiceInNewTab/)[0];
    fireEvent.click(openItem);
    expect(openSpy).toHaveBeenCalledWith('/agents/test-agent/ttyd', '_blank', 'noopener,noreferrer');

    openSpy.mockClear();
    // Re-open the menu (the first click closed it), then click the external icon
    fireEvent.contextMenu(card);
    await waitFor(() => {
      expect(screen.getAllByText(/agents\.openServiceInNewTab/).length).toBeGreaterThan(0);
    });
    const external = screen.getAllByTitle(/agents\.openServiceExternal/)[0];
    fireEvent.click(external);
    expect(openSpy).toHaveBeenCalledWith(
      '/api/proxy/test-agent/ttyd/',
      '_blank',
      'noopener,noreferrer',
    );
    openSpy.mockRestore();
  });
});
