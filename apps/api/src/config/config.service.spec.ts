import { ConfigService } from './config.service';
import { loadConfigSync, saveConfigSync, getConfigPath } from './config.util';

jest.mock('./config.util', () => ({
  loadConfigSync: jest.fn(),
  saveConfigSync: jest.fn(),
  getConfigPath: jest.fn(),
}));

const mockedLoadConfigSync = loadConfigSync as jest.Mock;
const mockedSaveConfigSync = saveConfigSync as jest.Mock;
const mockedGetConfigPath = getConfigPath as jest.Mock;

describe('ConfigService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadConfigSync.mockReturnValue({
      dataDir: '/tmp/.codepods/data',
      port: 3000,
      corsOrigin: true,
      swaggerEnabled: true,
      publicUrl: 'http://localhost:5173',
      buildKit: true,
    });
    mockedGetConfigPath.mockReturnValue('/tmp/.codepods/config.json');
  });

  it('loads config on construction', () => {
    const svc = new ConfigService();
    expect(mockedLoadConfigSync).toHaveBeenCalled();
    expect(svc.get('port')).toBe(3000);
  });

  it('returns a copy from getAll (not the internal reference)', () => {
    const svc = new ConfigService();
    const all = svc.getAll();
    all.port = 9999;
    expect(svc.get('port')).toBe(3000);
  });

  it('returns the config path', () => {
    const svc = new ConfigService();
    expect(svc.getConfigPath()).toBe('/tmp/.codepods/config.json');
  });

  it('update merges partial values, persists and returns updated config', () => {
    const svc = new ConfigService();
    const updated = svc.update({ port: 4000, buildKit: false });

    expect(mockedSaveConfigSync).toHaveBeenCalledWith(
      expect.objectContaining({ port: 4000, buildKit: false }),
    );
    expect(updated.port).toBe(4000);
    expect(svc.get('buildKit')).toBe(false);
    // untouched keys are preserved
    expect(svc.get('swaggerEnabled')).toBe(true);
  });

  it('reload re-reads the file discarding in-memory changes', () => {
    const svc = new ConfigService();
    svc.update({ port: 5000 });

    mockedLoadConfigSync.mockReturnValue({
      dataDir: '/tmp/.codepods/data',
      port: 6000,
      corsOrigin: true,
      swaggerEnabled: true,
      publicUrl: 'http://localhost:5173',
      buildKit: true,
    });

    const reloaded = svc.reload();
    expect(mockedLoadConfigSync).toHaveBeenCalledTimes(2);
    expect(reloaded.port).toBe(6000);
    expect(svc.get('port')).toBe(6000);
  });
});
