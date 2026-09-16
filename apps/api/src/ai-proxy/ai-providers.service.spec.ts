import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AiProvidersService } from './ai-providers.service';
import { AiProviderEntity } from './ai-provider.entity';
import { AiModelEntity } from './ai-model.entity';
import { CredentialsService } from '../credentials/credentials.service';

describe('AiProvidersService', () => {
  let service: AiProvidersService;
  const providers = {
    findOne: jest.fn(),
    find: jest.fn(),
    findOneBy: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    update: jest.fn(),
  };
  const models = {
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    update: jest.fn(),
  };
  const credentials = { getSecret: jest.fn() };

  const provider = (over: Partial<AiProviderEntity> = {}): AiProviderEntity =>
    ({
      id: 1,
      codepodId: 1,
      name: 'openai',
      slug: 'openai',
      type: 'openai',
      baseUrl: 'https://api.openai.com/',
      enabled: true,
      isDefault: true,
      models: [],
      ...over,
    }) as unknown as AiProviderEntity;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AiProvidersService,
        { provide: getRepositoryToken(AiProviderEntity), useValue: providers },
        { provide: getRepositoryToken(AiModelEntity), useValue: models },
        { provide: CredentialsService, useValue: credentials },
      ],
    }).compile();
    service = module.get(AiProvidersService);
  });

  describe('onModuleInit / ensureDefaultProvider', () => {
    it('promotes the first enabled provider when no default exists', async () => {
      providers.findOne
        .mockResolvedValueOnce(null) // findDefault
        .mockResolvedValueOnce({ ...provider(), isDefault: false, models: [] }); // first enabled
      await service.onModuleInit();
      expect(providers.save).toHaveBeenCalledWith(expect.objectContaining({ isDefault: true }));
    });

    it('does nothing when a default already exists', async () => {
      providers.findOne.mockResolvedValue(provider());
      await service.onModuleInit();
      expect(providers.save).not.toHaveBeenCalled();
    });
  });

  describe('finders', () => {
    it('findAll queries with name ordering', async () => {
      providers.find.mockResolvedValue([provider()]);
      await expect(service.findAll()).resolves.toHaveLength(1);
      expect(providers.find).toHaveBeenCalledWith({ where: { codepodId: 1 }, order: { name: 'ASC' } });
    });

    it('findOne throws when missing', async () => {
      providers.findOne.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });

    it('findBySlug resolves the default provider for slug "default"', async () => {
      providers.findOne.mockResolvedValue(provider());
      await expect(service.findBySlug('default')).resolves.toMatchObject({ slug: 'openai' });
    });

    it('findBySlug returns null for a disabled provider', async () => {
      providers.findOne.mockResolvedValue(provider({ enabled: false }));
      await expect(service.findBySlug('openai')).resolves.toBeNull();
    });

    it('findDefault returns null when the default is disabled', async () => {
      providers.findOne.mockResolvedValue(provider({ enabled: false }));
      await expect(service.findDefault()).resolves.toBeNull();
    });
  });

  describe('create', () => {
    it('creates the first provider as default', async () => {
      providers.count.mockResolvedValue(0);
      providers.create.mockReturnValue(provider({ baseUrl: 'https://api.openai.com/' }));
      providers.save.mockImplementation((e) => Promise.resolve({ ...e, id: 1, models: [] }));

      const result = await service.create({
        name: 'openai',
        baseUrl: 'https://api.openai.com/',
        models: [],
      });
      expect(result.isDefault).toBe(true);
    });

    it('trims a trailing slash from baseUrl and creates models when provided', async () => {
      providers.count.mockResolvedValue(1);
      providers.create.mockImplementation((e) => ({ ...e, id: 2, models: [] }));
      providers.save.mockImplementation((e) => Promise.resolve({ ...e, id: 2 }));
      // ensureUniqueSlug needs a free slug first; then findOne is used by
      // createModel and the final reload.
      providers.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValue(provider({ id: 2, baseUrl: 'https://x.com', models: [] }));
      models.count.mockResolvedValue(0);
      models.create.mockImplementation((e) => ({ ...e, id: 5 }));
      models.save.mockImplementation((e) => Promise.resolve({ ...e, id: 5 }));
      models.update.mockResolvedValue(undefined);

      const result = await service.create({
        name: 'other',
        baseUrl: 'https://x.com/',
        models: [{ name: 'gpt' }],
      });
      expect(result.baseUrl).toBe('https://x.com');
      expect(providers.create).toHaveBeenCalledWith(
        expect.objectContaining({ baseUrl: 'https://x.com' }),
      );
      expect(models.create).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates credentialId when provided', async () => {
      providers.findOne.mockResolvedValue(provider());
      providers.save.mockImplementation((e) => Promise.resolve(e));

      const result = await service.update(1, { credentialId: 5 });
      expect(result.credentialId).toBe(5);
    });

    it('promotes to default when isDefault is true', async () => {
      providers.findOne.mockResolvedValue(provider());
      providers.save.mockImplementation((e) => Promise.resolve(e));
      providers.update.mockResolvedValue(undefined);
      await service.update(1, { isDefault: true });
      expect(providers.update).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('promotes the next enabled provider when removing the default', async () => {
      providers.findOne
        .mockResolvedValueOnce(provider({ isDefault: true })) // the one to remove
        .mockResolvedValueOnce({ ...provider(), id: 2, models: [] }); // next
      providers.remove.mockResolvedValue(undefined);
      providers.save.mockImplementation((e) => Promise.resolve(e));

      await service.remove(1);
      expect(providers.remove).toHaveBeenCalled();
      expect(providers.save).toHaveBeenCalledWith(expect.objectContaining({ id: 2, isDefault: true }));
    });

    it('does not promote when no next provider exists', async () => {
      providers.findOne.mockResolvedValueOnce(provider({ isDefault: true })).mockResolvedValueOnce(null);
      providers.remove.mockResolvedValue(undefined);
      await service.remove(1);
      expect(providers.save).not.toHaveBeenCalled();
    });
  });

  describe('models', () => {
    it('createModel makes the first model default', async () => {
      providers.findOne.mockResolvedValue(provider());
      models.count.mockResolvedValue(0);
      models.create.mockImplementation((e) => ({ ...e }));
      models.save.mockImplementation((e) => Promise.resolve({ ...e, id: 1 }));
      models.update.mockResolvedValue(undefined);

      const result = await service.createModel(1, { name: 'gpt' });
      expect(result.isDefault).toBe(true);
    });

    it('createModel rejects "default" as a reserved model name', async () => {
      await expect(service.createModel(1, { name: 'default' })).rejects.toThrow(BadRequestException);
      await expect(service.createModel(1, { name: 'Default' })).rejects.toThrow(BadRequestException);
      await expect(service.createModel(1, { name: 'DEFAULT' })).rejects.toThrow(BadRequestException);
    });

    it('updateModel rejects "default" as a reserved model name', async () => {
      providers.findOne.mockResolvedValue(provider());
      models.findOne.mockResolvedValue({ id: 1, providerId: 1, name: 'gpt-4o' });
      await expect(service.updateModel(1, 1, { name: 'default' })).rejects.toThrow(BadRequestException);
    });

    it('getDefaultModelName returns the default model name', async () => {
      models.findOne.mockResolvedValue({ id: 1, name: 'gpt-4o', isDefault: true });
      expect(await service.getDefaultModelName(1)).toBe('gpt-4o');
    });

    it('getDefaultModelName returns null when no default model exists', async () => {
      models.findOne.mockResolvedValue(null);
      expect(await service.getDefaultModelName(1)).toBeNull();
    });

    it('getDefaultModelName caches the result and avoids repeated DB queries', async () => {
      models.findOne.mockResolvedValue({ id: 1, name: 'gpt-4o', isDefault: true });
      await service.getDefaultModelName(1);
      await service.getDefaultModelName(1);
      await service.getDefaultModelName(1);
      expect(models.findOne).toHaveBeenCalledTimes(1);
    });

    it('createModel invalidates the default model cache', async () => {
      // Prime the cache with a model
      models.findOne.mockResolvedValue({ id: 1, name: 'gpt-4o', isDefault: true });
      await service.getDefaultModelName(1);
      const callsAfterPrime = models.findOne.mock.calls.length;

      // createModel: providers.findOne (not models), models.count, models.create, models.save
      models.count.mockResolvedValue(0);
      models.create.mockImplementation((e) => ({ ...e }));
      models.save.mockImplementation((e) => Promise.resolve({ ...e, id: 2 }));
      models.update.mockResolvedValue(undefined);
      await service.createModel(1, { name: 'gpt-4o-mini' });

      // Cache was invalidated → next call hits DB again
      await service.getDefaultModelName(1);
      expect(models.findOne.mock.calls.length).toBeGreaterThan(callsAfterPrime);
    });

    it('updateModel throws when the model is missing', async () => {
      providers.findOne.mockResolvedValue(provider());
      models.findOne.mockResolvedValue(null);
      await expect(service.updateModel(1, 99, {})).rejects.toThrow(NotFoundException);
    });

    it('removeModel clears the provider fallback when it points at the removed model', async () => {
      providers.findOne
        .mockResolvedValueOnce(provider({ fallbackModelId: 2, models: [{ id: 1 }, { id: 2 }] as unknown as AiModelEntity[] }));
      models.findOne.mockResolvedValue({ id: 2, isDefault: true });
      models.find.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      models.remove.mockResolvedValue(undefined);
      models.save.mockImplementation((e) => Promise.resolve(e));
      providers.save.mockImplementation((e) => Promise.resolve(e));

      await service.removeModel(1, 2);
      expect(providers.save).toHaveBeenCalledWith(expect.objectContaining({ fallbackModelId: 1 }));
    });
  });

  describe('resolveApiKey', () => {
    it('resolves from linked credential first', async () => {
      credentials.getSecret.mockResolvedValue('cred-secret');
      expect(await service.resolveApiKey({ credentialId: 7, apiKeyEnvVar: null } as never)).toBe('cred-secret');
    });

    it('falls back to env var when present', async () => {
      process.env.MY_KEY = 'envval';
      expect(await service.resolveApiKey({ credentialId: null, apiKeyEnvVar: 'MY_KEY' } as never)).toBe('envval');
      delete process.env.MY_KEY;
    });

    it('returns null when neither is configured', async () => {
      expect(await service.resolveApiKey({ credentialId: null, apiKeyEnvVar: null } as never)).toBeNull();
    });

    it('falls through to env var when credential lookup throws', async () => {
      process.env.MY_KEY = 'envval';
      credentials.getSecret.mockRejectedValue(new Error('not found'));
      expect(await service.resolveApiKey({ credentialId: 99, apiKeyEnvVar: 'MY_KEY' } as never)).toBe('envval');
      delete process.env.MY_KEY;
    });
  });

  describe('slugs', () => {
    it('rejects a name that produces an empty slug', async () => {
      await expect(service.create({ name: '!!!', models: [] } as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a name that produces a reserved slug', async () => {
      await expect(service.create({ name: 'default', models: [] } as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('appends a counter when the slug is already taken', async () => {
      providers.findOne
        .mockResolvedValueOnce(provider({ slug: 'openai' })) // first collision
        .mockResolvedValueOnce(null); // second candidate free
      providers.count.mockResolvedValue(1);
      providers.create.mockImplementation((e) => ({ ...e, models: [] }));
      providers.save.mockImplementation((e) => Promise.resolve({ ...e, id: 3 }));

      const result = await service.create({ name: 'OpenAI', baseUrl: 'https://x.com', models: [] } as never);
      expect(result.slug).toBe('openai-2');
    });
  });

  describe('toSafe', () => {
    it('exposes hasApiKey and hasCredential without the secret', () => {
      const safe = service.toSafe({ credentialId: 5, apiKeyEnvVar: null } as never);
      expect(safe.hasCredential).toBe(true);
      expect(safe.hasApiKey).toBe(true);
    });

    it('hasApiKey is false when no credential and no env var', () => {
      const safe = service.toSafe({ credentialId: null, apiKeyEnvVar: null } as never);
      expect(safe.hasApiKey).toBe(false);
    });
  });
});
