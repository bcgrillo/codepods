import { Test } from '@nestjs/testing';
import { EgressProxyController } from './egress-proxy.controller';
import { EgressProxyService } from './egress-proxy.service';

describe('EgressProxyController', () => {
  let controller: EgressProxyController;

  const egressProxy = {
    listTempExceptions: jest.fn(),
    addTempException: jest.fn(),
    removeTempException: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        EgressProxyController,
        { provide: EgressProxyService, useValue: egressProxy },
      ],
    }).compile();
    controller = module.get(EgressProxyController);
  });

  describe('listTempExceptions', () => {
    it('returns temp exceptions with ISO expiresAt', () => {
      const ts = Date.now() + 5 * 60 * 1000;
      egressProxy.listTempExceptions.mockReturnValue([
        { host: 'example.com', expiresAt: ts, agentId: 'a1' },
        { host: 'test.com', expiresAt: ts, agentId: 'manual' },
      ]);

      const result = controller.listTempExceptions();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ host: 'example.com', expiresAt: new Date(ts).toISOString(), agentId: 'a1' });
      expect(result[1].host).toBe('test.com');
    });

    it('returns empty array when no exceptions', () => {
      egressProxy.listTempExceptions.mockReturnValue([]);
      expect(controller.listTempExceptions()).toEqual([]);
    });
  });

  describe('createTempException', () => {
    it('creates a temp exception and returns it', () => {
      const ts = Date.now() + 5 * 60 * 1000;
      egressProxy.listTempExceptions.mockReturnValue([
        { host: 'new.com', expiresAt: ts, agentId: 'manual' },
      ]);

      const result = controller.createTempException({ host: 'new.com', durationMinutes: 5 });

      expect(egressProxy.addTempException).toHaveBeenCalledWith('new.com', 5 * 60 * 1000, 'manual');
      expect(result.host).toBe('new.com');
      expect(result.agentId).toBe('manual');
      expect(result.expiresAt).toBe(new Date(ts).toISOString());
    });

    it('defaults to 5 minutes when durationMinutes is 0', () => {
      const ts = Date.now() + 5 * 60 * 1000;
      egressProxy.listTempExceptions.mockReturnValue([
        { host: 'def.com', expiresAt: ts, agentId: 'manual' },
      ]);

      controller.createTempException({ host: 'def.com', durationMinutes: 0 });

      expect(egressProxy.addTempException).toHaveBeenCalledWith('def.com', 5 * 60 * 1000, 'manual');
    });

    it('throws when host is missing', () => {
      expect(() => controller.createTempException({ host: '', durationMinutes: 5 })).toThrow('Host is required');
    });
  });

  describe('revokeTempException', () => {
    it('calls removeTempException', () => {
      controller.revokeTempException('example.com');
      expect(egressProxy.removeTempException).toHaveBeenCalledWith('example.com');
    });
  });
});