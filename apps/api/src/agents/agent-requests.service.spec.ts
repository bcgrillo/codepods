import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AgentRequestsService } from './agent-requests.service';
import { AgentRequestEntity } from './agent-request.entity';
import { EgressProxyService } from '../egress-proxy/egress-proxy.service';
import { ConfigService } from '../config/config.service';

describe('AgentRequestsService', () => {
  let service: AgentRequestsService;

  const repo = {
    create: jest.fn((dto) => ({ ...dto, id: undefined })),
    save: jest.fn(async (e) => ({ ...e, id: e.id ?? 1 })),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const egressProxy = {
    addTempException: jest.fn(),
    removeTempException: jest.fn(),
  };

  const configService = {
    get: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AgentRequestsService,
        { provide: getRepositoryToken(AgentRequestEntity), useValue: repo },
        { provide: EgressProxyService, useValue: egressProxy },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
    service = module.get(AgentRequestsService);
  });

  describe('create', () => {
    it('creates a pending request and returns the DTO', async () => {
      repo.create.mockReturnValue({ id: 42, agentId: 'a1', type: 'whitelist', status: 'pending', payload: { url: 'https://example.com', host: 'example.com' }, reason: 'need access', createdAt: new Date('2026-01-01T00:00:00Z') });
      repo.save.mockResolvedValue({ id: 42, agentId: 'a1', type: 'whitelist', status: 'pending', payload: { url: 'https://example.com', host: 'example.com' }, reason: 'need access', createdAt: new Date('2026-01-01T00:00:00Z') });

      const result = await service.create('a1', 'whitelist', { url: 'https://example.com', host: 'example.com' }, 'need access');

      expect(result.id).toBe(42);
      expect(result.status).toBe('pending');
      expect(result.agentId).toBe('a1');
      expect(repo.create).toHaveBeenCalledWith({
        agentId: 'a1',
        type: 'whitelist',
        status: 'pending',
        payload: { url: 'https://example.com', host: 'example.com' },
        reason: 'need access',
      });
    });

    it('uses empty string when reason is not provided', async () => {
      repo.create.mockReturnValue({ id: 1, agentId: 'a1', type: 'whitelist', status: 'pending', payload: { url: '', host: '' }, reason: '', createdAt: new Date() });
      repo.save.mockResolvedValue({ id: 1, agentId: 'a1', type: 'whitelist', status: 'pending', payload: { url: '', host: '' }, reason: '', createdAt: new Date() });

      await service.create('a1', 'whitelist', { url: '', host: '' }, undefined as never);
      expect(repo.create).toHaveBeenCalledWith({
        agentId: 'a1',
        type: 'whitelist',
        status: 'pending',
        payload: { url: '', host: '' },
        reason: '',
      });
    });
  });

  describe('list', () => {
    it('returns requests sorted by createdAt DESC', async () => {
      const entities = [
        { id: 2, agentId: 'a1', type: 'whitelist', status: 'pending', payload: { url: 'https://b.com', host: 'b.com' }, reason: '', createdAt: new Date('2026-01-02'), resolvedAt: null, resolvedBy: null, expiresAt: null },
        { id: 1, agentId: 'a1', type: 'whitelist', status: 'approved', payload: { url: 'https://a.com', host: 'a.com' }, reason: '', createdAt: new Date('2026-01-01'), resolvedAt: new Date('2026-01-01'), resolvedBy: 'user', expiresAt: null },
      ];
      repo.find.mockResolvedValue(entities);

      const result = await service.list('a1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(2);
      expect(result[1].id).toBe(1);
      expect(repo.find).toHaveBeenCalledWith({ where: { agentId: 'a1' }, order: { createdAt: 'DESC' }, take: 20 });
    });

    it('expires approved requests past their expiresAt', async () => {
      const entity = {
        id: 1, agentId: 'a1', type: 'whitelist', status: 'approved',
        payload: { url: 'https://expired.com', host: 'expired.com' }, reason: '',
        createdAt: new Date('2026-01-01'), resolvedAt: new Date('2026-01-01'),
        resolvedBy: 'user', expiresAt: new Date('2025-12-31'),
      };
      repo.find.mockResolvedValue([entity]);
      repo.save.mockResolvedValue({ ...entity, status: 'expired' });

      const result = await service.list('a1');

      expect(result[0].status).toBe('expired');
      expect(egressProxy.removeTempException).toHaveBeenCalledWith('expired.com');
    });

    it('does not expire permanent approvals without expiresAt', async () => {
      const entity = {
        id: 1, agentId: 'a1', type: 'whitelist', status: 'approved',
        payload: { url: 'https://perm.com', host: 'perm.com' }, reason: '',
        createdAt: new Date('2026-01-01'), resolvedAt: new Date('2026-01-01'),
        resolvedBy: 'user', expiresAt: null,
      };
      repo.find.mockResolvedValue([entity]);

      const result = await service.list('a1');

      expect(result[0].status).toBe('approved');
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('throws NotFoundException when request does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.approve('a1', 999)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when request is already resolved', async () => {
      repo.findOne.mockResolvedValue({ id: 1, status: 'approved', payload: { url: '', host: 'x.com' }, type: 'whitelist' });
      await expect(service.approve('a1', 1)).rejects.toThrow(BadRequestException);
    });

    it('temporary approval adds egress temp exception', async () => {
      const entity = { id: 1, agentId: 'a1', status: 'pending', type: 'whitelist', payload: { url: 'https://temp.com', host: 'temp.com' }, reason: '', createdAt: new Date() };
      repo.findOne.mockResolvedValue(entity);
      repo.save.mockResolvedValue({ ...entity, status: 'approved', resolvedAt: new Date(), expiresAt: new Date(Date.now() + 5 * 60 * 1000) });

      const result = await service.approve('a1', 1, 5, 'user1');

      expect(result.status).toBe('approved');
      expect(egressProxy.addTempException).toHaveBeenCalledWith('temp.com', 5 * 60 * 1000, 'a1');
      expect(configService.update).not.toHaveBeenCalled();
    });

    it('permanent approval adds host to egress whitelist config', async () => {
      const entity = { id: 1, agentId: 'a1', status: 'pending', type: 'whitelist', payload: { url: 'https://perm.com', host: 'perm.com' }, reason: '', createdAt: new Date() };
      repo.findOne.mockResolvedValue(entity);
      repo.save.mockResolvedValue({ ...entity, status: 'approved', resolvedAt: new Date() });
      configService.get.mockReturnValue({ egressWhitelist: ['existing.com'] });

      const result = await service.approve('a1', 1, undefined, 'user1');

      expect(result.status).toBe('approved');
      expect(egressProxy.addTempException).not.toHaveBeenCalled();
      expect(configService.update).toHaveBeenCalledWith({
        networkSecurity: { egressWhitelist: ['existing.com', 'perm.com'] },
      });
    });

    it('permanent approval does not add duplicate host', async () => {
      const entity = { id: 1, agentId: 'a1', status: 'pending', type: 'whitelist', payload: { url: 'https://dup.com', host: 'dup.com' }, reason: '', createdAt: new Date() };
      repo.findOne.mockResolvedValue(entity);
      repo.save.mockResolvedValue({ ...entity, status: 'approved', resolvedAt: new Date() });
      configService.get.mockReturnValue({ egressWhitelist: ['dup.com'] });

      await service.approve('a1', 1, undefined, 'user1');

      expect(configService.update).not.toHaveBeenCalled();
    });

    it('notifies a waiter if one is waiting', async () => {
      const entity = { id: 1, agentId: 'a1', status: 'pending', type: 'whitelist', payload: { url: 'https://w.com', host: 'w.com' }, reason: '', createdAt: new Date() };
      repo.findOne.mockResolvedValue(entity);
      repo.save.mockResolvedValue({ ...entity, status: 'approved', resolvedAt: new Date() });
      configService.get.mockReturnValue({ egressWhitelist: [] });

      // Set up a waiter
      const waitPromise = service.waitForResolution(1, 1000);
      // Approve should resolve the waiter
      await service.approve('a1', 1, undefined, 'user1');
      const status = await waitPromise;
      expect(status).toBe('approved');
    });
  });

  describe('reject', () => {
    it('throws NotFoundException when request does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.reject('a1', 999)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when request is already resolved', async () => {
      repo.findOne.mockResolvedValue({ id: 1, status: 'rejected', payload: { url: '', host: '' }, type: 'whitelist' });
      await expect(service.reject('a1', 1)).rejects.toThrow(BadRequestException);
    });

    it('sets status to rejected and notifies waiter', async () => {
      const entity = { id: 1, agentId: 'a1', status: 'pending', type: 'whitelist', payload: { url: 'https://r.com', host: 'r.com' }, reason: '', createdAt: new Date() };
      repo.findOne.mockResolvedValue(entity);
      repo.save.mockResolvedValue({ ...entity, status: 'rejected', resolvedAt: new Date(), resolvedBy: 'user1' });

      const waitPromise = service.waitForResolution(1, 1000);
      const result = await service.reject('a1', 1, 'user1');
      const status = await waitPromise;

      expect(result.status).toBe('rejected');
      expect(result.resolvedBy).toBe('user1');
      expect(status).toBe('rejected');
    });
  });

  describe('getStatus', () => {
    it('throws NotFoundException when request does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.getStatus('a1', 999)).rejects.toThrow(NotFoundException);
    });

    it('returns the request as DTO', async () => {
      const entity = { id: 1, agentId: 'a1', type: 'whitelist', status: 'pending', payload: { url: 'https://s.com', host: 's.com' }, reason: 'x', createdAt: new Date('2026-01-01'), resolvedAt: null, resolvedBy: null, expiresAt: null };
      repo.findOne.mockResolvedValue(entity);

      const result = await service.getStatus('a1', 1);
      expect(result.id).toBe(1);
      expect(result.status).toBe('pending');
      expect(result.createdAt).toBe(entity.createdAt.toISOString());
    });

    it('expires approved requests past their expiresAt', async () => {
      const entity = { id: 1, agentId: 'a1', type: 'whitelist', status: 'approved', payload: { url: 'https://exp.com', host: 'exp.com' }, reason: '', createdAt: new Date(), resolvedAt: new Date(), resolvedBy: 'user', expiresAt: new Date('2025-01-01') };
      repo.findOne.mockResolvedValue(entity);
      repo.save.mockResolvedValue({ ...entity, status: 'expired' });

      const result = await service.getStatus('a1', 1);
      expect(result.status).toBe('expired');
      expect(egressProxy.removeTempException).toHaveBeenCalledWith('exp.com');
    });
  });

  describe('waitForResolution', () => {
    it('returns immediately if already resolved', async () => {
      repo.findOne.mockResolvedValue({ id: 1, status: 'approved' });
      const status = await service.waitForResolution(1, 1000);
      expect(status).toBe('approved');
    });

    it('returns pending after timeout', async () => {
      repo.findOne.mockResolvedValue({ id: 1, status: 'pending' });
      const status = await service.waitForResolution(1, 50);
      expect(status).toBe('pending');
    });

    it('returns the status when waiter is notified', async () => {
      repo.findOne.mockResolvedValue({ id: 1, status: 'pending' });
      const waitPromise = service.waitForResolution(1, 5000);

      // Simulate a notification (as approve/reject would do)
      // We need to call the private method via a workaround:
      // create a request then approve it
      const entity = { id: 1, agentId: 'a1', status: 'pending', type: 'whitelist', payload: { url: 'https://w2.com', host: 'w2.com' }, reason: '', createdAt: new Date() };
      repo.findOne.mockResolvedValue(entity);
      repo.save.mockResolvedValue({ ...entity, status: 'approved', resolvedAt: new Date() });
      configService.get.mockReturnValue({ egressWhitelist: [] });

      await service.approve('a1', 1, undefined, 'user1');
      const status = await waitPromise;
      expect(status).toBe('approved');
    });
  });
});