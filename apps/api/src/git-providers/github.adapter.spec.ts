import { BadRequestException } from '@nestjs/common';
import { GithubAdapter } from './github.adapter';

describe('GithubAdapter', () => {
  let adapter: GithubAdapter;
  const fetchMock = jest.fn();

  beforeEach(() => {
    adapter = new GithubAdapter();
    (global as any).fetch = fetchMock;
    fetchMock.mockReset();
  });

  const okResponse = (body: unknown) =>
    ({ ok: true, status: 200, json: jest.fn().mockResolvedValue(body) }) as any;

  const errResponse = (status: number, text: string) =>
    ({
      ok: false,
      status,
      text: jest.fn().mockResolvedValue(text),
    }) as any;

  it('rejects an empty repo name', async () => {
    await expect(adapter.createRepo({ token: 't', repoName: '  ', private: false })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('creates a user repo when repoName has no slash', async () => {
    fetchMock.mockResolvedValue(
      okResponse({ clone_url: 'https://github.com/u/repo.git', default_branch: 'main', full_name: 'u/repo' }),
    );
    const result = await adapter.createRepo({ token: 'tok', repoName: 'my-repo', private: true });
    expect(result).toEqual({
      url: 'https://github.com/u/repo.git',
      defaultBranch: 'main',
      fullName: 'u/repo',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/user/repos');
    expect(JSON.parse(init.body)).toMatchObject({ name: 'my-repo', private: true });
  });

  it('creates an org repo when repoName contains a slash', async () => {
    fetchMock.mockResolvedValue(okResponse({ clone_url: 'x', default_branch: 'main', full_name: 'o/r' }));
    await adapter.createRepo({
      token: 'tok',
      repoName: 'my-org / my-repo',
      private: false,
      defaultBranch: 'dev',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/orgs/my-org/repos');
    expect(JSON.parse(init.body)).toMatchObject({ name: 'my-repo', default_branch: 'dev' });
  });

  it('rejects a repo name that is only a slash', async () => {
    await expect(adapter.createRepo({ token: 't', repoName: 'org/', private: false })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws a GitHub message when the API returns a JSON error', async () => {
    fetchMock.mockResolvedValue(
      errResponse(422, JSON.stringify({ message: 'Name already exists' })),
    );
    await expect(
      adapter.createRepo({ token: 't', repoName: 'dup', private: false }),
    ).rejects.toThrow('GitHub: Name already exists');
  });

  it('falls back to a truncated text error when the body is not JSON', async () => {
    fetchMock.mockResolvedValue(errResponse(500, 'boom '.repeat(100)));
    await expect(
      adapter.createRepo({ token: 't', repoName: 'r', private: false }),
    ).rejects.toThrow('GitHub: boom');
  });
});
