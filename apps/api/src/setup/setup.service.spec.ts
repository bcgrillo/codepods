import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { SetupService } from './setup.service';
import { DockerService } from '../docker/docker.service';
import { ConfigService } from '../config/config.service';

jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

const mockedExecSync = execSync as jest.Mock;

describe('SetupService', () => {
  let service: SetupService;
  let docker: { isAvailable: jest.Mock; ping: jest.Mock };
  let config: { get: jest.Mock };
  let dataDir: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codepods-setup-'));
    docker = { isAvailable: jest.fn(), ping: jest.fn() };
    config = { get: jest.fn().mockReturnValue(dataDir) };
    service = new SetupService(docker as unknown as DockerService, config as unknown as ConfigService);
    jest.clearAllMocks();
    config.get.mockReturnValue(dataDir);
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('reports ready when all checks pass', async () => {
    docker.isAvailable.mockReturnValue(true);
    docker.ping.mockResolvedValue(true);
    mockedExecSync.mockReturnValue('git version 2.43.0');

    const status = await service.getStatus();
    expect(status.ready).toBe(true);
    expect(status.checks.map((c) => c.name)).toEqual(['docker', 'git', 'data_dir']);
    expect(status.checks.every((c) => c.status === 'ok')).toBe(true);
  });

  it('reports not ready when docker is unreachable', async () => {
    docker.isAvailable.mockReturnValue(true);
    docker.ping.mockResolvedValue(false);
    mockedExecSync.mockReturnValue('git version 2.43.0');

    const status = await service.getStatus();
    expect(status.ready).toBe(false);
    const dockerCheck = status.checks.find((c) => c.name === 'docker');
    expect(dockerCheck?.status).toBe('error');
    expect(dockerCheck?.actionUrl).toBe('https://docs.docker.com/get-docker/');
  });

  it('reports error when docker is not available at all', async () => {
    docker.isAvailable.mockReturnValue(false);
    mockedExecSync.mockReturnValue('git version 2.43.0');

    const status = await service.getStatus();
    expect(status.ready).toBe(false);
    expect(status.checks.find((c) => c.name === 'docker')?.status).toBe('error');
  });

  it('reports error when git is missing', async () => {
    docker.isAvailable.mockReturnValue(true);
    docker.ping.mockResolvedValue(true);
    mockedExecSync.mockImplementation(() => {
      throw new Error('not found');
    });

    const status = await service.getStatus();
    expect(status.ready).toBe(false);
    const gitCheck = status.checks.find((c) => c.name === 'git');
    expect(gitCheck?.status).toBe('error');
    expect(gitCheck?.actionUrl).toBe('https://git-scm.com/downloads');
  });

  it('creates the data dir if missing and reports ok', async () => {
    const missing = path.join(dataDir, 'nested', 'data');
    config.get.mockReturnValue(missing);
    docker.isAvailable.mockReturnValue(true);
    docker.ping.mockResolvedValue(true);
    mockedExecSync.mockReturnValue('git version 2.43.0');

    const status = await service.getStatus();
    expect(fs.existsSync(missing)).toBe(true);
    expect(status.checks.find((c) => c.name === 'data_dir')?.status).toBe('ok');
  });
});
