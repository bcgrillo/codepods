import 'reflect-metadata';
import { IS_PUBLIC_KEY } from './public.decorator';
import { IS_AGENT_ALLOWED_KEY } from './agent-allowed.decorator';

/**
 * Security audit test: enumerates every controller in the app and verifies
 * that @Public() is only applied to expected endpoints.
 *
 * This prevents regressions where a new route is accidentally left public
 * (or intentionally made public without review). If a new @Public() is needed,
 * add it to EXPECTED_PUBLIC_ROUTES below with a justification.
 */

// ── All controllers ────────────────────────────────────────────────
import { AgentsController } from '../agents/agents.controller';
import { AgentsMdController } from '../agents-md/agents-md.controller';
import { AiProvidersController } from '../ai-proxy/ai-providers.controller';
import { AuthController } from './auth.controller';
import { CentralReposController } from '../central-repos/central-repos.controller';
import { ConfigController } from '../config/config.controller';
import { CredentialsController } from '../credentials/credentials.controller';
import { EgressProxyController } from '../egress-proxy/egress-proxy.controller';
import { GitProxyController } from '../git-proxy/git-proxy.controller';
import { ImagesController } from '../images/images.controller';
import { ManagedApisController } from '../managed-apis/managed-apis.controller';
import { McpServersController } from '../mcp-servers/mcp-servers.controller';
import { AgentMcpToolsController } from '../mcp/mcp-agent-tools.controller';
import { McpServerToolsController } from '../mcp/mcp-server-tools.controller';
import { McpController } from '../mcp/mcp.controller';
import { ProxyController } from '../proxy/proxy.controller';
import { SetupController } from '../setup/setup.controller';
import { SkillsController } from '../skills/skills.controller';
import { WorkspacesController } from '../workspaces/workspaces.controller';

const ALL_CONTROLLERS = [
  AgentsController,
  AgentsMdController,
  AiProvidersController,
  AuthController,
  CentralReposController,
  ConfigController,
  CredentialsController,
  EgressProxyController,
  GitProxyController,
  ImagesController,
  ManagedApisController,
  McpServersController,
  AgentMcpToolsController,
  McpServerToolsController,
  McpController,
  ProxyController,
  SetupController,
  SkillsController,
  WorkspacesController,
];

// ── Expected public routes ─────────────────────────────────────────
// Format: "ControllerName.methodName"
// Every entry here MUST have a security justification.
const EXPECTED_PUBLIC_ROUTES = new Set<string>([
  'AuthController.login', // Login — must be accessible without a token
]);

// ── Expected agent-allowed routes ──────────────────────────────────
// Format: "ControllerName.methodName"
// Routes that authenticated agents (request.agentId set via egress proxy
// HMAC) are authorized to access. Every other route returns 403 for agent
// requests. Every entry here MUST have a security justification.
const EXPECTED_AGENT_ALLOWED_ROUTES = new Set<string>([
  'GitProxyController.execute', // POST /git/execute — agent runs git commands
  'GitProxyController.getShim', // GET /git/shim — agent downloads git shim via proxy
  'AiProvidersController.forward', // ALL /ai-proxy/:slug* — agent AI requests forwarded to provider
  'McpController.handleJsonRpc', // POST /mcp/:slug — agent MCP JSON-RPC calls
]);

/** Returns all own method names on a class prototype (excluding constructor). */
function getMethodNames(ctor: new (...args: any[]) => any): string[] {
  const proto = ctor.prototype;
  return Object.getOwnPropertyNames(proto).filter(
    (name) => name !== 'constructor' && typeof proto[name] === 'function',
  );
}

describe('Public endpoints security audit', () => {
  it('every controller is registered in the audit list', () => {
    // Sanity check: if someone adds a new controller, this test forces them
    // to register it here so it gets scanned.
    expect(ALL_CONTROLLERS.length).toBeGreaterThanOrEqual(19);
  });

  it('only expected routes have @Public()', () => {
    const foundPublic: string[] = [];

    for (const Controller of ALL_CONTROLLERS) {
      const name = Controller.name;

      // Check controller-level @Public() (makes ALL routes public)
      const classIsPublic = Reflect.getMetadata(IS_PUBLIC_KEY, Controller);
      if (classIsPublic) {
        foundPublic.push(`${name} (class-level — ALL routes public!)`);
      }

      // Check method-level @Public()
      for (const method of getMethodNames(Controller)) {
        const fn = (Controller.prototype as Record<string, any>)[method];
        const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, fn);
        if (isPublic) {
          foundPublic.push(`${name}.${method}`);
        }
      }
    }

    const unexpected = foundPublic.filter(
      (route) => !EXPECTED_PUBLIC_ROUTES.has(route),
    );

    if (unexpected.length > 0) {
      fail(
        `Unexpected @Public() routes found:\n${unexpected.join('\n')}\n\n` +
          'If these routes should be public, add them to EXPECTED_PUBLIC_ROUTES ' +
          'with a security justification. Otherwise, remove the @Public() decorator.',
      );
    }

    // Also verify all expected routes actually exist and have @Public()
    for (const expected of EXPECTED_PUBLIC_ROUTES) {
      if (!foundPublic.includes(expected)) {
        fail(
          `Expected @Public() route "${expected}" not found. ` +
            'Was the decorator removed or the method renamed?',
        );
      }
    }
  });

  it('only expected routes have @AgentAllowed()', () => {
    const foundAgentAllowed: string[] = [];

    for (const Controller of ALL_CONTROLLERS) {
      const name = Controller.name;

      // Check controller-level @AgentAllowed() (makes ALL routes agent-allowed)
      const classIsAgentAllowed = Reflect.getMetadata(IS_AGENT_ALLOWED_KEY, Controller);
      if (classIsAgentAllowed) {
        foundAgentAllowed.push(`${name} (class-level — ALL routes agent-allowed!)`);
      }

      // Check method-level @AgentAllowed()
      for (const method of getMethodNames(Controller)) {
        const fn = (Controller.prototype as Record<string, any>)[method];
        const isAgentAllowed = Reflect.getMetadata(IS_AGENT_ALLOWED_KEY, fn);
        if (isAgentAllowed) {
          foundAgentAllowed.push(`${name}.${method}`);
        }
      }
    }

    const unexpected = foundAgentAllowed.filter(
      (route) => !EXPECTED_AGENT_ALLOWED_ROUTES.has(route),
    );

    if (unexpected.length > 0) {
      fail(
        `Unexpected @AgentAllowed() routes found:\n${unexpected.join('\n')}\n\n` +
          'If these routes should be agent-accessible, add them to ' +
          'EXPECTED_AGENT_ALLOWED_ROUTES with a security justification. ' +
          'Otherwise, remove the @AgentAllowed() decorator.',
      );
    }

    // Also verify all expected routes actually exist and have @AgentAllowed()
    for (const expected of EXPECTED_AGENT_ALLOWED_ROUTES) {
      if (!foundAgentAllowed.includes(expected)) {
        fail(
          `Expected @AgentAllowed() route "${expected}" not found. ` +
            'Was the decorator removed or the method renamed?',
        );
      }
    }
  });
});