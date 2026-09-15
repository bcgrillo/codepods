import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import { execSync } from 'child_process';
import type { SetupStatus, SetupCheck } from '@codepods/shared-types';
import { DockerService } from '../docker/docker.service';
import { ConfigService } from '../config/config.service';

@Injectable()
export class SetupService {
  constructor(
    private readonly docker: DockerService,
    private readonly config: ConfigService,
  ) {}

  async getStatus(): Promise<SetupStatus> {
    const checks: SetupCheck[] = await Promise.all([
      this.checkDocker(),
      Promise.resolve(this.checkGit()),
      Promise.resolve(this.checkDataDir()),
    ]);

    return {
      ready: checks.every((c) => c.status === 'ok'),
      checks,
    };
  }

  private async checkDocker(): Promise<SetupCheck> {
    if (!this.docker.isAvailable()) {
      return {
        name: 'docker',
        status: 'error',
        message: 'Docker daemon is not reachable on this host',
        actionUrl: 'https://docs.docker.com/get-docker/',
      };
    }

    const reachable = await this.docker.ping();
    return {
      name: 'docker',
      status: reachable ? 'ok' : 'error',
      message: reachable ? 'Docker is running' : 'Cannot connect to Docker daemon',
      actionUrl: reachable ? undefined : 'https://docs.docker.com/get-docker/',
    };
  }

  private checkGit(): SetupCheck {
    try {
      const version = execSync('git --version', { encoding: 'utf8', timeout: 5000 }).trim();
      return { name: 'git', status: 'ok', message: version };
    } catch {
      return {
        name: 'git',
        status: 'error',
        message: 'Git is not installed or not in PATH',
        actionUrl: 'https://git-scm.com/downloads',
      };
    }
  }

  private checkDataDir(): SetupCheck {
    const dataDir = this.config.get('dataDir');
    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.accessSync(dataDir, fs.constants.W_OK);
      return { name: 'data_dir', status: 'ok', message: `Data directory ready: ${dataDir}` };
    } catch {
      return {
        name: 'data_dir',
        status: 'error',
        message: `Data directory is not writable: ${dataDir}`,
      };
    }
  }
}
