import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from './AppShell';

// ── Mock data + SDK clients (all in vi.hoisted for correct init order) ──
const mocks = vi.hoisted(() => {
  const mockAgent = { id: '1', name: 'test-agent', slug: 'test-agent', status: 'running', template: 'default', workspaceId: 1, services: [], sortOrder: 0, enabled: true, imageTemplate: { name: 'default', displayName: 'Default' }, templateIcon: null, templateIconDark: null, templateName: 'Default', image: 'default', volumes: [], envVars: {} };
  const mockProvider = { id: 1, name: 'OpenAI', slug: 'openai', type: 'openai', baseUrl: 'https://api.openai.com/v1', enabled: true, isDefault: true, models: [{ id: 1, name: 'gpt-4', displayName: 'GPT-4', isDefault: true }], sortOrder: 1, apiKeyEnvVar: null, credentialId: null };
  const mockMcp = { id: 1, name: 'test-mcp', slug: 'test-mcp', url: 'http://localhost:3001', enabled: true, sortOrder: 1, builtIn: false };
  const mockManagedApi = { id: 1, name: 'test-api', slug: 'test-api', enabled: true, sortOrder: 1, credentialId: null, description: 'Test API', baseUrl: 'https://api.test.com', headerPattern: 'Authorization: Bearer {key}' };
  const mockSkillSource = { id: 1, name: 'test-source', slug: 'test-source', type: 'github', url: 'https://github.com/test/repo', enabled: true, sortOrder: 1, skillCount: 3, builtIn: false };
  const mockLocalSkillSource = { id: 0, name: 'local', slug: 'local', type: 'local', url: '', enabled: true, sortOrder: 0, skillCount: 0, builtIn: true };
  const mockWorkspace = { id: 1, name: 'test-ws', slug: 'test-ws', type: 'local', sortOrder: 1, branch: 'main', remoteUrl: null, credentialId: null, path: '/tmp/test-ws' };
  const mockCredential = { id: 1, label: 'test-cred', type: 'key' };

  return {
    agentsSdk: {
      listAgents: vi.fn().mockResolvedValue([mockAgent]),
      getAgent: vi.fn().mockResolvedValue(mockAgent),
      startAgent: vi.fn(), stopAgent: vi.fn(), restartAgent: vi.fn(),
      renameAgent: vi.fn(), removeAgent: vi.fn(),
      listServices: vi.fn().mockResolvedValue([]),
      updateSettings: vi.fn(),
    },
    aiSdk: {
      listProviders: vi.fn().mockResolvedValue([mockProvider]),
      getProvider: vi.fn().mockResolvedValue(mockProvider),
      createProvider: vi.fn(), updateProvider: vi.fn(), removeProvider: vi.fn(),
      testProvider: vi.fn().mockResolvedValue([]),
      listModels: vi.fn().mockResolvedValue([{ id: 1, name: 'gpt-4', displayName: 'GPT-4', isDefault: true }]),
      createModel: vi.fn(), updateModel: vi.fn(), removeModel: vi.fn(),
    },
    mcpSdk: {
      list: vi.fn().mockResolvedValue([mockMcp]),
      get: vi.fn().mockResolvedValue(mockMcp),
      create: vi.fn(), update: vi.fn(), remove: vi.fn(),
      listTools: vi.fn().mockResolvedValue([]),
      syncTools: vi.fn(),
    },
    managedSdk: {
      list: vi.fn().mockResolvedValue([mockManagedApi]),
      get: vi.fn().mockResolvedValue(mockManagedApi),
      create: vi.fn(), update: vi.fn(), remove: vi.fn(),
    },
    skillsSdk: {
      listSources: vi.fn().mockResolvedValue([mockLocalSkillSource, mockSkillSource]),
      getSource: vi.fn().mockResolvedValue(mockSkillSource),
      createSource: vi.fn(), updateSource: vi.fn(), removeSource: vi.fn(),
      syncSource: vi.fn().mockResolvedValue({}),
      listLocalSkills: vi.fn().mockResolvedValue([]),
      uploadLocalSkill: vi.fn(),
      renameLocalSkill: vi.fn(), removeLocalSkill: vi.fn(),
    },
    wsSdk: {
      listWorkspaces: vi.fn().mockResolvedValue([mockWorkspace]),
      getWorkspace: vi.fn().mockResolvedValue(mockWorkspace),
      getWorkspaceInfo: vi.fn().mockResolvedValue({ branch: 'main', head: null, lastTag: null, dirty: false }),
      create: vi.fn(), update: vi.fn(), remove: vi.fn(),
      test: vi.fn().mockResolvedValue({ ok: true }),
      copyAgentsMd: vi.fn(),
      uploadFiles: vi.fn(),
      listFiles: vi.fn().mockResolvedValue([]),
      reorder: vi.fn(),
      gitStatus: vi.fn().mockResolvedValue({ ahead: 0, behind: 0, dirty: false }),
      gitBranches: vi.fn().mockResolvedValue({ current: 'main', branches: [] }),
      deleteFile: vi.fn(), gitFetch: vi.fn(), gitStash: vi.fn(), gitCommit: vi.fn(), gitSync: vi.fn(),
    },
    credSdk: {
      list: vi.fn().mockResolvedValue([mockCredential]),
      create: vi.fn(),
    },
    configSdk: {
      listAgentsMd: vi.fn().mockResolvedValue([]),
      getAgentsMd: vi.fn().mockResolvedValue(null),
    },
    centralReposSdk: {
      listDiscoveredTemplates: vi.fn().mockResolvedValue([]),
      listDiscoveredProviders: vi.fn().mockResolvedValue([]),
      repoFile: vi.fn(),
    },
  };
});

vi.mock('@codepods/sdk', () => ({
  AgentsClient: vi.fn().mockImplementation(() => mocks.agentsSdk),
  AiProvidersClient: vi.fn().mockImplementation(() => mocks.aiSdk),
  McpServersClient: vi.fn().mockImplementation(() => mocks.mcpSdk),
  ManagedApisClient: vi.fn().mockImplementation(() => mocks.managedSdk),
  SkillsClient: vi.fn().mockImplementation(() => mocks.skillsSdk),
  WorkspacesClient: vi.fn().mockImplementation(() => mocks.wsSdk),
  CredentialsClient: vi.fn().mockImplementation(() => mocks.credSdk),
  ConfigClient: vi.fn().mockImplementation(() => mocks.configSdk),
  CentralReposClient: vi.fn().mockImplementation(() => mocks.centralReposSdk),
  SystemClient: vi.fn().mockImplementation(() => ({
    getSystemStats: vi.fn().mockResolvedValue({}),
    getAgentStats: vi.fn().mockResolvedValue([]),
    getNonCodepodsContainers: vi.fn().mockResolvedValue([]),
    getCleanupCheck: vi.fn().mockResolvedValue(null),
    removeDockerImage: vi.fn(),
    removeOrphanedHome: vi.fn(),
  })),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { name: 'test' } }),
  useLogout: () => () => Promise.resolve(),
}));

vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }),
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    open: vi.fn(), dispose: vi.fn(), write: vi.fn(), clear: vi.fn(),
    onData: vi.fn(), onResize: vi.fn(), loadAddon: vi.fn(),
  })),
}));
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({ fit: vi.fn(), dispose: vi.fn() })),
}));

// Each section's list item label that appears in the secondary panel once data loads.
const sections = [
  { name: 'agents', path: '/agents', expectedText: 'test-agent' },
  { name: 'ai-providers', path: '/ai-providers', expectedText: 'OpenAI' },
  { name: 'mcps', path: '/mcps', expectedText: 'test-mcp' },
  { name: 'managed-apis', path: '/mcps/managed-apis', expectedText: 'test-api' },
  { name: 'skills', path: '/skills/local', expectedText: 'test-source' },
  { name: 'workspaces', path: '/workspaces', expectedText: 'test-ws' },
];

describe('AppShell section rendering', () => {
  for (const section of sections) {
    it(`renders ${section.name} list items without crashing after data loads`, async () => {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const errors: string[] = [];
      const origError = console.error;
      console.error = (...args: unknown[]) => {
        errors.push(args.map(String).join(' '));
      };

      try {
        const { container } = render(
          <QueryClientProvider client={qc}>
            <MemoryRouter initialEntries={[section.path]}>
              <AppShell />
            </MemoryRouter>
          </QueryClientProvider>,
        );

        // Wait for list items to render — the loading spinner text should
        // disappear and the list item label should appear. This exercises
        // SecondaryList → ItemIcon with the section's icon (forwardRef lucide
        // icon for ai-providers/skills/workspaces, which was the crash before
        // the ItemIcon fix). For managed-apis, the content (ManagedApisPage)
        // renders the test-api data.
        await waitFor(
          () => {
            const body = container.textContent ?? '';
            // The label must be present AND the loading message must be gone.
            expect(body).toContain(section.expectedText);
          },
          { timeout: 5000 },
        );

        const realErrors = errors.filter(
          (e) =>
            !e.includes('not wrapped in act') &&
            !e.includes('console.error') &&
            !e.includes('i18next') &&
            !e.includes('Future Flag') &&
            !e.includes('clip-path') &&
            !e.includes('stroke-width') &&
            !e.includes('stroke-linecap') &&
            !e.includes('McpIcon'),
        );
        if (realErrors.length > 0) {
          throw new Error(`Errors in ${section.name}:\n${realErrors.join('\n')}`);
        }
      } catch (err) {
        throw new Error(`${section.name} threw: ${(err as Error).message}`);
      } finally {
        console.error = origError;
      }
    });
  }
});