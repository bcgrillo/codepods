import { Injectable, BadRequestException } from '@nestjs/common';
import { GithubAdapter } from './github.adapter';
import type { GitProviderAdapter, GitProviderType, CreateRepoOptions, CreateRepoResult } from './git-provider.interface';

/**
 * Registry of git provider adapters. Selects the right adapter by type.
 * To add a new provider (e.g. GitLab), implement GitProviderAdapter and
 * register it in the constructor.
 */
@Injectable()
export class GitProvidersService {
  private readonly adapters = new Map<GitProviderType, GitProviderAdapter>();

  constructor(github: GithubAdapter) {
    this.adapters.set('github', github);
    // Future: this.adapters.set('gitlab', new GitlabAdapter());
  }

  getAdapter(type: string): GitProviderAdapter {
    const adapter = this.adapters.get(type as GitProviderType);
    if (!adapter) throw new BadRequestException(`Unsupported git provider: ${type}`);
    return adapter;
  }

  getSupportedTypes(): GitProviderType[] {
    return [...this.adapters.keys()];
  }

  async createRepo(type: string, opts: CreateRepoOptions): Promise<CreateRepoResult> {
    return this.getAdapter(type).createRepo(opts);
  }
}