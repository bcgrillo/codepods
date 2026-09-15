import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { CredentialsService } from './credentials.service';
import { CredentialEntity } from './credential.entity';
import { CryptoService } from '../secrets/crypto.service';

describe('CredentialsService', () => {
  let service: CredentialsService;
  const repo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const crypto = { encrypt: jest.fn(), decrypt: jest.fn() };

  const entity = (over: Partial<CredentialEntity> = {}): CredentialEntity =>
    ({
      id: 1,
      codepodId: 1,
      label: 'GitHub PAT',
      type: 'key',
      host: 'github.com',
      username: null,
      secret: 'enc:::ciphertext',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
      ...over,
    }) as unknown as CredentialEntity;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        CredentialsService,
        { provide: getRepositoryToken(CredentialEntity), useValue: repo },
        { provide: CryptoService, useValue: crypto },
      ],
    }).compile();
    service = module.get(CredentialsService);
  });

  describe('findAll', () => {
    it('lists credentials ordered by label, secrets stripped', async () => {
      repo.find.mockResolvedValue([entity({ id: 2, label: 'b' }), entity({ id: 1, label: 'a' })]);
      const result = await service.findAll(1);
      expect(repo.find).toHaveBeenCalledWith({ where: { codepodId: 1 }, order: { label: 'ASC' } });
      expect(result).toHaveLength(2);
      expect(result[0]).not.toHaveProperty('secret');
      expect(result[0].hasSecret).toBe(true);
    });
  });

  describe('findOne', () => {
    it('returns safe credential by id', async () => {
      repo.findOne.mockResolvedValue(entity());
      const result = await service.findOne(1);
      expect(result.id).toBe(1);
      expect(result.hasSecret).toBe(true);
    });

    it('throws NotFound when missing', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getSecret', () => {
    it('decrypts the stored secret', async () => {
      repo.findOne.mockResolvedValue(entity());
      crypto.decrypt.mockReturnValue('ghp_xxx');
      const secret = await service.getSecret(1);
      expect(secret).toBe('ghp_xxx');
      expect(crypto.decrypt).toHaveBeenCalledWith('enc:::ciphertext');
    });

    it('returns null when no secret stored', async () => {
      repo.findOne.mockResolvedValue(entity({ secret: null }));
      const secret = await service.getSecret(1);
      expect(secret).toBeNull();
    });
  });

  describe('create', () => {
    it('encrypts the provided secret', async () => {
      const created = entity({ id: 0, secret: null });
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(entity());
      crypto.encrypt.mockReturnValue('enc:::ciphertext');
      await service.create({ label: 'GitHub PAT', type: 'key', secret: 'ghp_xxx', host: 'github.com' });
      expect(crypto.encrypt).toHaveBeenCalledWith('ghp_xxx');
      expect(repo.save).toHaveBeenCalled();
    });

    it('nulls username for key type', async () => {
      const created = entity({ id: 0, secret: null, username: null });
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(entity());
      await service.create({ label: 'Token', type: 'key', username: 'should-be-ignored' });
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ username: null }));
    });

    it('keeps username for user_pass type', async () => {
      const created = entity({ id: 0, type: 'user_pass', username: 'bob', secret: null });
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(entity({ type: 'user_pass', username: 'bob' }));
      await service.create({ label: 'GH user/pass', type: 'user_pass', username: 'bob', secret: 'pw' });
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ username: 'bob' }));
    });
  });

  describe('update', () => {
    it('replaces the secret when provided', async () => {
      const existing = entity();
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue(entity());
      crypto.encrypt.mockReturnValue('enc:::new');
      await service.update(1, { secret: 'new-pw' });
      expect(existing.secret).toBe('enc:::new');
      expect(repo.save).toHaveBeenCalledWith(existing);
    });

    it('preserves existing secret when not provided', async () => {
      const existing = entity();
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue(entity());
      await service.update(1, { label: 'renamed' });
      expect(existing.secret).toBe('enc:::ciphertext');
    });

    it('clears secret when empty string provided', async () => {
      const existing = entity();
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue(entity());
      await service.update(1, { secret: '' });
      expect(existing.secret).toBeNull();
    });

    it('nulls username when switching type away from user_pass', async () => {
      const existing = entity({ type: 'user_pass', username: 'bob' });
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue(entity());
      await service.update(1, { type: 'key' });
      expect(existing.username).toBeNull();
    });
  });

  describe('remove', () => {
    it('removes an existing credential', async () => {
      const existing = entity();
      repo.findOne.mockResolvedValue(existing);
      await service.remove(1);
      expect(repo.remove).toHaveBeenCalledWith(existing);
    });

    it('throws when missing', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.remove(99)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('toSafe', () => {
    it('strips the secret and exposes hasSecret', () => {
      const safe = service.toSafe(entity());
      expect(safe).not.toHaveProperty('secret');
      expect(safe.hasSecret).toBe(true);
      expect(safe.type).toBe('key');
    });

    it('reports hasSecret=false when no secret', () => {
      const safe = service.toSafe(entity({ secret: null }));
      expect(safe.hasSecret).toBe(false);
    });
  });
});