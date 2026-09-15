import { Injectable } from '@nestjs/common';
import {
  CodepodsConfig,
  loadConfigSync,
  saveConfigSync,
  getConfigPath,
} from './config.util';

@Injectable()
export class ConfigService {
  private config: CodepodsConfig;

  constructor() {
    this.config = loadConfigSync();
  }

  get<K extends keyof CodepodsConfig>(key: K): CodepodsConfig[K] {
    return this.config[key];
  }

  getAll(): CodepodsConfig {
    return { ...this.config };
  }

  getConfigPath(): string {
    return getConfigPath();
  }

  /**
   * Updates config values and persists to file.
   * Returns the updated config.
   */
  update(values: Partial<CodepodsConfig>): CodepodsConfig {
    this.config = { ...this.config, ...values };
    saveConfigSync(this.config);
    return { ...this.config };
  }

  /**
   * Re-reads the config file from disk (discarding in-memory changes).
   */
  reload(): CodepodsConfig {
    this.config = loadConfigSync();
    return { ...this.config };
  }
}