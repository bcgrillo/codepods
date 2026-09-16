import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Symmetric encryption helper for secrets at rest.
 *
 * Strategy: a 256-bit master key is stored outside the database in a file
 * (`data/keys/master.key`) with restrictive permissions. Secrets are
 * encrypted with AES-256-GCM and persisted as a single base64 string that
 * bundles the IV, auth tag and ciphertext.
 *
 * The master key file is generated automatically on first use; it MUST NOT
 * be committed to the repository. Rotating the key requires re-encrypting
 * all stored secrets (out of scope for now).
 */
export class CryptoService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly ivLength = 12;
  private readonly key: Buffer;

  constructor(masterKeyPath?: string) {
    const keyPath = masterKeyPath ?? path.join(process.cwd(), 'data', 'keys', 'master.key');
    this.key = CryptoService.loadOrCreateMasterKey(keyPath);
  }

  encrypt(plain: string): string {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  }

  decrypt(payload: string): string {
    const buf = Buffer.from(payload, 'base64');
    const iv = buf.subarray(0, this.ivLength);
    const tag = buf.subarray(this.ivLength, this.ivLength + 16);
    const enc = buf.subarray(this.ivLength + 16);
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  }

  private static loadOrCreateMasterKey(keyPath: string): Buffer {
    if (fs.existsSync(keyPath)) {
      const raw = fs.readFileSync(keyPath);
      if (raw.length === 32) return raw;
      // Backwards-compat: a hex-encoded key.
      const hex = raw.toString('utf8').trim();
      if (/^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, 'hex');
    }
    const key = crypto.randomBytes(32);
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    fs.writeFileSync(keyPath, key, { mode: 0o600 });
    return key;
  }
}