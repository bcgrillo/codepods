#!/usr/bin/env node
/**
 * Ensure node-pty native module is compiled.
 *
 * Problem: `pnpm rebuild node-pty` runs node-pty's own postinstall which
 * DELETES build/Release ("Cleaning release folder"). So we must call
 * node-gyp directly, bypassing the destructive postinstall.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ptyDir = path.dirname(require.resolve('node-pty/package.json'));
const buildRelease = path.join(ptyDir, 'build', 'Release', 'pty.node');
const prebuildsDir = path.join(ptyDir, 'prebuilds', 'linux-x64');
const prebuilds = path.join(prebuildsDir, 'pty.node');

// Already present?
if (fs.existsSync(buildRelease) || fs.existsSync(prebuilds)) {
  console.log('[pty] native module already present, skipping');
  process.exit(0);
}

console.log('[pty] native module missing, rebuilding with node-gyp (bypassing postinstall)...');

// Check that GNU make is available (node-gyp needs it)
try {
  const makeVersion = execSync('make --version 2>&1', { encoding: 'utf8', timeout: 5000 });
  if (!makeVersion.includes('GNU Make')) {
    console.error('[pty] ✗ "make" is not GNU Make. Install build-essential:');
    console.error('[pty]   sudo apt install build-essential');
    console.error('[pty] Current make: ' + makeVersion.split('\n')[0]);
    process.exit(1);
  }
} catch {
  console.error('[pty] ✗ "make" not found. Install build tools:');
  console.error('[pty]   sudo apt install build-essential');
  process.exit(1);
}

// Find node-gyp binary — try multiple locations
let nodeGypBin = null;
const candidates = [
  // pnpm local deps
  path.join(ptyDir, 'node_modules', '.bin', 'node-gyp'),
  path.join(ptyDir, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js'),
  path.join(path.dirname(ptyDir), '.bin', 'node-gyp'),
  path.join(path.dirname(ptyDir), 'node-gyp', 'bin', 'node-gyp.js'),
  // npm bundled with Node.js
  path.join(path.dirname(path.dirname(process.execPath)), 'lib', 'node_modules', 'npm', 'node_modules', 'node-gyp', 'bin', 'node-gyp.js'),
  // nvm
  path.join(process.env.HOME || '', '.nvm', 'versions', 'node', process.version, 'lib', 'node_modules', 'npm', 'node_modules', 'node-gyp', 'bin', 'node-gyp.js'),
];
for (const c of candidates) {
  if (fs.existsSync(c)) {
    nodeGypBin = c;
    break;
  }
}

if (nodeGypBin) {
  console.log('[pty] found node-gyp at:', nodeGypBin);
  try {
    execSync(`node "${nodeGypBin}" rebuild`, { stdio: 'inherit', cwd: ptyDir });
  } catch {
    console.error('[pty] node-gyp rebuild failed');
  }
} else {
  console.log('[pty] node-gyp not found locally, downloading via npx...');
  try {
    execSync('npx --yes node-gyp rebuild', { stdio: 'inherit', cwd: ptyDir });
  } catch {
    console.error('[pty] npx node-gyp failed');
  }
}

// Verify
if (fs.existsSync(buildRelease)) {
  console.log('[pty] ✓ build/Release/pty.node compiled successfully');
} else if (fs.existsSync(prebuilds)) {
  console.log('[pty] ✓ prebuilds/linux-x64/pty.node exists');
} else {
  console.error('[pty] ✗ native module NOT found after rebuild');
  console.error('[pty] Common fixes:');
  console.error('[pty]   1. sudo apt install build-essential  (provides GNU make + gcc)');
  console.error('[pty]   2. cd ' + ptyDir + ' && npx --yes node-gyp rebuild');
}