import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  let keyPath: string;

  beforeEach(() => {
    keyPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'codepods-crypto-')),
      'keys',
      'master.key',
    );
  });

  afterEach(() => {
    fs.rmSync(path.dirname(path.dirname(keyPath)), { recursive: true, force: true });
  });

  it('generates a master key file on first use', () => {
    new CryptoService(keyPath);
    const raw = fs.readFileSync(keyPath);
    expect(raw.length).toBe(32);
  });

  it('reuses an existing 32-byte binary key', () => {
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    const existing = Buffer.alloc(32, 7);
    fs.writeFileSync(keyPath, existing, { mode: 0o600 });

    const svc = new CryptoService(keyPath);
    expect(svc.encrypt('x')).toBeTruthy();
    expect(fs.readFileSync(keyPath)).toEqual(existing);
  });

  it('decrypts what it encrypts (round-trip)', () => {
    const svc = new CryptoService(keyPath);
    const payload = svc.encrypt('my-secret-token');
    expect(payload).not.toContain('my-secret-token');
    expect(svc.decrypt(payload)).toBe('my-secret-token');
  });

  it('produces unique ciphertext for the same plaintext (random IV)', () => {
    const svc = new CryptoService(keyPath);
    const a = svc.encrypt('same');
    const b = svc.encrypt('same');
    expect(a).not.toBe(b);
    expect(svc.decrypt(a)).toBe('same');
    expect(svc.decrypt(b)).toBe('same');
  });

  it('reuses a hex-encoded 64-char master key (backwards-compat)', () => {
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    const hex = 'a'.repeat(64);
    fs.writeFileSync(keyPath, hex, { mode: 0o600 });

    const svc = new CryptoService(keyPath);
    const payload = svc.encrypt('secret');
    expect(svc.decrypt(payload)).toBe('secret');
  });

  it('regenerates the key when the existing file is neither 32 bytes nor hex', () => {
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    fs.writeFileSync(keyPath, 'garbage-key', { mode: 0o600 });

    const svc = new CryptoService(keyPath);
    expect(svc.decrypt(svc.encrypt('x'))).toBe('x');
    expect(fs.readFileSync(keyPath).length).toBe(32);
  });

  it('throws on tampered ciphertext', () => {
    const svc = new CryptoService(keyPath);
    const payload = svc.encrypt('secret');
    const buf = Buffer.from(payload, 'base64');
    buf[buf.length - 1] ^= 0xff;
    expect(() => svc.decrypt(buf.toString('base64'))).toThrow();
  });
});
