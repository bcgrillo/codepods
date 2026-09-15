import { BadRequestException } from '@nestjs/common';
import { GitProvidersService } from './git-providers.service';
import { GithubAdapter } from './github.adapter';

describe('GitProvidersService', () => {
  const github = {
    type: 'github',
    createRepo: jest.fn(),
  } as { type: string; createRepo: jest.Mock };

  let service: GitProvidersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GitProvidersService(github as unknown as GithubAdapter);
  });

  it('returns the registered github adapter', () => {
    expect(service.getAdapter('github')).toBe(github);
  });

  it('throws for an unsupported provider type', () => {
    expect(() => service.getAdapter('gitlab')).toThrow(BadRequestException);
  });

  it('reports the supported provider types', () => {
    expect(service.getSupportedTypes()).toEqual(['github']);
  });

  it('delegates createRepo to the resolved adapter', async () => {
    github.createRepo.mockResolvedValue({ url: 'x', defaultBranch: 'main', fullName: 'u/r' });
    const opts = { token: 't', repoName: 'r', private: false };
    await expect(service.createRepo('github', opts)).resolves.toEqual({
      url: 'x',
      defaultBranch: 'main',
      fullName: 'u/r',
    });
    expect(github.createRepo).toHaveBeenCalledWith(opts);
  });
});
