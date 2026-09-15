import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AgentsMdService } from './agents-md.service';
import { AgentsMdEntity } from './agents-md.entity';

const makeEntity = (overrides: Partial<AgentsMdEntity> = {}): AgentsMdEntity =>
  ({
    id: 1,
    codepodId: 1,
    alias: 'Default',
    content: '# AGENTS',
    isDefault: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as AgentsMdEntity);

describe('AgentsMdService', () => {
  let service: AgentsMdService;
  let repo: {
    find: jest.Mock;
    findOne: jest.Mock;
    findOneBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      create: jest.fn((e) => e),
      save: jest.fn((e) => e),
      delete: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [AgentsMdService, { provide: getRepositoryToken(AgentsMdEntity), useValue: repo }],
    }).compile();
    service = module.get<AgentsMdService>(AgentsMdService);
  });

  it('findAll maps entities to safe DTOs', async () => {
    repo.find.mockResolvedValue([makeEntity()]);
    const result = await service.findAll();
    expect(result[0]).toEqual({
      id: 1,
      codepodId: 1,
      alias: 'Default',
      content: '# AGENTS',
      isDefault: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('findOne throws NotFound when missing', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
  });

  it('getDefault returns null when none set', async () => {
    repo.findOne.mockResolvedValue(null);
    expect(await service.getDefault()).toBeNull();
  });

  it('create sets default when isDefault is true', async () => {
    repo.save.mockResolvedValue(makeEntity());
    repo.findOneBy.mockResolvedValue(makeEntity());
    await service.create({ alias: 'Strict', content: 'x', isDefault: true });
    expect(repo.update).toHaveBeenCalledWith({ codepodId: 1, isDefault: true }, { isDefault: false });
    expect(repo.update).toHaveBeenCalledWith({ id: 1, codepodId: 1 }, { isDefault: true });
  });

  it('update throws NotFound when missing', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.update(1, { alias: 'x' })).rejects.toThrow(NotFoundException);
  });

  it('remove throws BadRequest when deleting the default', async () => {
    repo.findOne.mockResolvedValue(makeEntity({ isDefault: true }));
    await expect(service.remove(1)).rejects.toThrow(BadRequestException);
  });

  it('remove deletes a non-default version', async () => {
    repo.findOne.mockResolvedValue(makeEntity({ id: 2, isDefault: false }));
    await service.remove(2);
    expect(repo.delete).toHaveBeenCalledWith(2);
  });

  it('seedIfEmpty seeds default content when table is empty', async () => {
    repo.count.mockResolvedValue(0);
    repo.save.mockResolvedValue(makeEntity());
    await service.seedIfEmpty();
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'Default', isDefault: true }),
    );
  });

  it('seedIfEmpty does nothing when records exist', async () => {
    repo.count.mockResolvedValue(3);
    await service.seedIfEmpty();
    expect(repo.save).not.toHaveBeenCalled();
  });
});
