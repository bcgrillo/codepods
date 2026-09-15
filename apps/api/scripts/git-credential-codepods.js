#!/usr/bin/env node
/**
 * git-credential-codepods
 *
 * Custom git credential helper that resolves a workspace's git credential
 * from the CodePods encrypted store, so the remote `origin` URL can stay
 * clean (no `user:token@` embedded).
 *
 * It is configured per-repo via:
 *   git config --local credential.helper \
 *     "/abs/git-credential-codepods --credential-id=42 --data-dir=/abs/data"
 *
 * Git invokes:  git-credential-codepods --credential-id=42 --data-dir=/abs <op>
 * where <op> is `get`, `store` or `erase`. We only implement `get`;
 * `store`/`erase` are no-ops (credentials are managed through the API).
 *
 * On `get` we read stdin (ignored; git sends protocol/host/path) and print:
 *   username=<u>
 *   password=<token>
 *
 * Crypto is identical to apps/api/src/secrets/crypto.service.ts (AES-256-GCM,
 * payload = base64(iv(12) + authTag(16) + ciphertext)).
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function parseArgs(argv) {
  const out = { credentialId: null, dataDir: null, op: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--credential-id=')) {
      out.credentialId = parseInt(a.slice('--credential-id='.length), 10);
    } else if (a.startsWith('--data-dir=')) {
      out.dataDir = a.slice('--data-dir='.length);
    } else if (a === 'get' || a === 'store' || a === 'erase') {
      out.op = a;
    }
  }
  return out;
}

function loadMasterKey(keyPath) {
  if (!fs.existsSync(keyPath)) return null;
  const raw = fs.readFileSync(keyPath);
  if (raw.length === 32) return raw;
  const hex = raw.toString('utf8').trim();
  if (/^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, 'hex');
  return null;
}

function decrypt(payload, key) {
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < IV_LENGTH + TAG_LENGTH) return null;
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const enc = buf.subarray(IV_LENGTH + TAG_LENGTH);
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

function main() {
  const args = parseArgs(process.argv);
  // Only `get` is implemented; store/erase are no-ops.
  if (args.op !== 'get') return;
  if (!args.credentialId || !args.dataDir) return;

  const dbPath = path.join(args.dataDir, 'codepods.db');
  const keyPath = path.join(args.dataDir, 'keys', 'master.key');
  if (!fs.existsSync(dbPath) || !fs.existsSync(keyPath)) return;

  const key = loadMasterKey(keyPath);
  if (!key) return;

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch {
    return;
  }

  let row;
  try {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    row = db.prepare('SELECT username, secret FROM credentials WHERE id = ?').get(args.credentialId);
    db.close();
  } catch {
    return;
  }
  if (!row || !row.username || !row.secret) return;

  const token = decrypt(row.secret, key);
  if (!token) return;

  process.stdout.write(`username=${row.username}\n`);
  process.stdout.write(`password=${token}\n`);
}

try {
  main();
} catch {
  // Never leak errors to git; a failed resolution simply yields no credentials.
}