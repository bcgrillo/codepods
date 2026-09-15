import { EgressProxyService } from './egress-proxy.service';
import { ConfigService } from '../config/config.service';
import { DockerService } from '../docker/docker.service';
import { InternalTokenService } from '../auth/internal-token.service';

function makeConfigService(net: {
  filterInternetEgress: boolean;
  egressWhitelist: string[];
  proxyPort: number;
  port?: number;
}): ConfigService {
  return {
    get: jest.fn((key: string) => {
      if (key === 'networkSecurity') return net;
      if (key === 'port') return net.port ?? 3000;
      return undefined;
    }),
  } as unknown as ConfigService;
}

function makeDockerService(): DockerService {
  return {
    getAgentIdByIp: jest.fn(() => 'test-agent-id'),
  } as unknown as DockerService;
}

function makeInternalTokenService(): InternalTokenService {
  return {
    getToken: jest.fn(() => 'test-secret-token'),
  } as unknown as InternalTokenService;
}

describe('EgressProxyService', () => {
  let service: EgressProxyService;

  beforeEach(() => {
    const configService = makeConfigService({
      filterInternetEgress: true,
      egressWhitelist: ['api.anthropic.com', '*.npmjs.org'],
      proxyPort: 8888,
    });
    service = new EgressProxyService(configService, makeDockerService(), makeInternalTokenService());
  });

  describe('isAllowed', () => {
    it('allows exact whitelist entries', () => {
      expect(service.isAllowed('api.anthropic.com')).toBe(true);
    });

    it('denies unknown domains', () => {
      expect(service.isAllowed('evil.com')).toBe(false);
    });

    it('matches wildcard suffixes', () => {
      expect(service.isAllowed('registry.npmjs.org')).toBe(true);
      expect(service.isAllowed('api.anthropic.com')).toBe(true);
    });

    it('does not match the bare base of a wildcard as a prefix', () => {
      // *.npmjs.org should not match "npmjs.org.attacker.com"
      expect(service.isAllowed('npmjs.org.attacker.com')).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(service.isAllowed('API.ANTHROPIC.COM')).toBe(true);
    });

    it('matches the wildcard base itself', () => {
      // *.npmjs.org also allows npmjs.org (the base domain)
      expect(service.isAllowed('npmjs.org')).toBe(true);
    });
  });

  describe('onModuleInit', () => {
    it('always starts the proxy (even when internet filtering is off)', () => {
      const configService = makeConfigService({
        filterInternetEgress: false,
        egressWhitelist: [],
        proxyPort: 0, // ephemeral
      });
      const svc = new EgressProxyService(configService, makeDockerService(), makeInternalTokenService());
      svc.onModuleInit();
      // Proxy should be listening — reload should work.
      expect(() => svc.reload()).not.toThrow();
      svc.onModuleDestroy();
    });
  });

  describe('reload', () => {
    it('restarts the proxy', (done) => {
      const configService = makeConfigService({
        filterInternetEgress: true,
        egressWhitelist: ['github.com'],
        proxyPort: 0, // ephemeral port
      });
      const svc = new EgressProxyService(configService, makeDockerService(), makeInternalTokenService());
      svc.onModuleInit();
      // Give the server a tick to listen.
      setTimeout(() => {
        svc.reload();
        svc.onModuleDestroy();
        done();
      }, 50);
    });
  });
});