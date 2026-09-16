import { Injectable, BadRequestException } from '@nestjs/common';
import type { GitProviderAdapter, GitProviderType, CreateRepoOptions, CreateRepoResult } from './git-provider.interface';

/**
 * GitHub adapter — creates repositories via the GitHub REST API.
 *
 * Convention: if `repoName` contains `/`, the part before the slash is treated
 * as the organization name and the repo is created under it via
 * `POST /orgs/{org}/repos`. Otherwise the repo is created under the
 * authenticated user via `POST /user/repos`.
 *
 * Only GitHub is supported for now. To add GitLab/Bitbucket, implement a new
 * adapter and register it in GitProvidersService.
 */
@Injectable()
export class GithubAdapter implements GitProviderAdapter {
  readonly type: GitProviderType = 'github';

  private readonly API_BASE = 'https://api.github.com';

  async createRepo(opts: CreateRepoOptions): Promise<CreateRepoResult> {
    const { token, repoName, private: isPrivate, defaultBranch } = opts;

    const trimmed = repoName.trim();
    if (!trimmed) throw new BadRequestException('repoName is required');

    // Parse org/name convention
    const slashIdx = trimmed.indexOf('/');
    const isOrgRepo = slashIdx > 0;
    const name = isOrgRepo ? trimmed.slice(slashIdx + 1).trim() : trimmed;
    const org = isOrgRepo ? trimmed.slice(0, slashIdx).trim() : null;

    if (!name) throw new BadRequestException('Invalid repo name');

    const url = isOrgRepo
      ? `${this.API_BASE}/orgs/${org}/repos`
      : `${this.API_BASE}/user/repos`;

    const body: Record<string, unknown> = { name, private: isPrivate };
    if (defaultBranch) body.default_branch = defaultBranch;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let message = `GitHub API error ${res.status}`;
      try {
        const errJson = JSON.parse(errText);
        if (errJson.message) message = `GitHub: ${errJson.message}`;
      } catch {
        if (errText) message = `GitHub: ${errText.slice(0, 200)}`;
      }
      throw new BadRequestException(message);
    }

    const data = await res.json() as {
      clone_url: string;
      default_branch: string;
      full_name: string;
    };

    return {
      url: data.clone_url,
      defaultBranch: data.default_branch,
      fullName: data.full_name,
    };
  }
}