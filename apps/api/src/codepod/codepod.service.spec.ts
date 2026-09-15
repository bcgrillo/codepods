import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CodepodService } from './codepod.service';
import { CodepodEntity } from './codepod.entity';

describe('CodepodService', () => {
  let service: CodepodService;
  const repo = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        CodepodService,
        { provide: getRepositoryToken(CodepodEntity), useValue: repo },
      ],
    }).compile();
    service = module.get(CodepodService);
  });

  it('seeds the default codepod on bootstrap when missing', async () => {
    repo.findOne.mockResolvedValue(null);
    await service.onApplicationBootstrap();
    expect(repo.save).toHaveBeenCalledWith({ id: 1, slug: 'default', name: 'Default' });
  });

  it('does not seed when a default codepod already exists', async () => {
    repo.findOne.mockResolvedValue({ id: 1 });
    await service.onApplicationBootstrap();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('findDefault returns the id-1 codepod', async () => {
    repo.findOne.mockResolvedValue({ id: 1 });
    await expect(service.findDefault()).resolves.toEqual({ id: 1 });
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
  });
});
