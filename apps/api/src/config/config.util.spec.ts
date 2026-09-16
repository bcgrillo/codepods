import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  loadConfigSync,
  saveConfigSync,
  getConfigDir,
  getConfigPath,
} from './config.util';

// Redirect the home dir to a static sandbox so the module-level CONFIG_PATH
// resolves there (jest.mock is hoisted, so it applies before the import).
const homeDir = path.join(os.tmpdir(), 'codepods-config-sandbox');

jest.mock('os', () => ({
  ...jest.requireActual('os'),
  homedir: () => path.join(os.tmpdir(), 'codepods-config-sandbox'),
}));

describe('config.util', () => {
  const configPath = () => path.join(homeDir, '.codepods', 'config.json');

  beforeEach(() => {
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.mkdirSync(homeDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(homeDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
    delete process.env.PORT;
    delete process.env.CORS_ORIGIN;
    delete process.env.SWAGGER_ENABLED;
    delete process.env.CODEPODS_PUBLIC_URL;
    delete process.env.DOCKER_BUILDKIT;
    jest.restoreAllMocks();
  });

  it('reports the fixed config directory and path', () => {
    expect(getConfigDir()).toBe(path.join(homeDir, '.codepods'));
    expect(getConfigPath()).toBe(path.join(homeDir, '.codepods', 'config.json'));
  });

  it('creates a default config file when missing', () => {
    const cfg = loadConfigSync();
    expect(fs.existsSync(configPath())).toBe(true);
    expect(cfg.port).toBe(3000);
    expect(cfg.buildKit).toBe(true);
    expect(cfg.dataDir).toBe(path.join(homeDir, '.codepods', 'data'));
    // Written with 0600 permissions.
    const stat = fs.statSync(configPath());
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('merges an existing config file over defaults', () => {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify({ port: 8080 }), { mode: 0o600 });
    expect(loadConfigSync().port).toBe(8080);
    expect(loadConfigSync().buildKit).toBe(true);
  });

  it('falls back to defaults when the file is invalid JSON', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), 'not json', { mode: 0o600 });
    expect(loadConfigSync().port).toBe(3000);
    expect(warn).toHaveBeenCalled();
  });

  it('applies environment variable overrides', () => {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify({}), { mode: 0o600 });
    process.env.DATA_DIR = '/data';
    process.env.PORT = '9999';
    process.env.CORS_ORIGIN = 'https://example.com';
    process.env.SWAGGER_ENABLED = 'false';
    process.env.CODEPODS_PUBLIC_URL = 'https://public.example.com';
    process.env.DOCKER_BUILDKIT = 'false';

    const cfg = loadConfigSync();
    expect(cfg.dataDir).toBe('/data');
    expect(cfg.port).toBe(9999);
    expect(cfg.corsOrigin).toBe('https://example.com');
    expect(cfg.swaggerEnabled).toBe(false);
    expect(cfg.publicUrl).toBe('https://public.example.com');
    expect(cfg.buildKit).toBe(false);
  });

  it('parses CORS_ORIGIN=true as boolean true', () => {
    process.env.CORS_ORIGIN = 'true';
    expect(loadConfigSync().corsOrigin).toBe(true);
  });

  it('persists config via saveConfigSync', () => {
    const cfg = { ...loadConfigSync(), port: 4321 };
    saveConfigSync(cfg);
    const saved = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    expect(saved.port).toBe(4321);
  });
});
