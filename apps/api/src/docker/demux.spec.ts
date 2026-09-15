import { demuxDockerLogBuffer, demuxDockerLogText } from './demux';

/** Build a single multiplexed frame: [type][0,0,0][len BE][payload]. */
function frame(streamType: number, payload: string): Buffer {
  const data = Buffer.from(payload, 'utf-8');
  const header = Buffer.alloc(8);
  header.writeUInt8(streamType, 0);
  header.writeUInt32BE(data.length, 4);
  return Buffer.concat([header, data]);
}

describe('demuxDockerLogBuffer', () => {
  it('splits stdout and stderr frames', () => {
    const buf = Buffer.concat([
      frame(1, 'hello\n'),
      frame(2, 'error: boom\n'),
      frame(1, 'world\n'),
    ]);
    const { stdout, stderr } = demuxDockerLogBuffer(buf);
    expect(stdout.toString('utf-8')).toBe('hello\nworld\n');
    expect(stderr.toString('utf-8')).toBe('error: boom\n');
  });

  it('ignores stdin frames (stream type 0)', () => {
    const buf = Buffer.concat([frame(1, 'out\n'), frame(0, 'ignored'), frame(1, 'more\n')]);
    const { stdout } = demuxDockerLogBuffer(buf);
    expect(stdout.toString('utf-8')).toBe('out\nmore\n');
  });

  it('falls back to raw stdout when the first bytes are not a valid header (TTY/clean stream)', () => {
    const clean = Buffer.from('plain log line\nsecond line\n', 'utf-8');
    const { stdout, stderr } = demuxDockerLogBuffer(clean);
    expect(stdout.toString('utf-8')).toBe(clean.toString('utf-8'));
    expect(stderr.length).toBe(0);
  });

  it('preserves payload when a header promises more bytes than available (truncated)', () => {
    const partial = Buffer.concat([frame(1, 'almost-complete')]);
    const { stdout } = demuxDockerLogBuffer(partial);
    expect(stdout.toString('utf-8')).toBe('almost-complete');
  });

  it('appends trailing bytes that do not form a full header to stdout', () => {
    const trail = Buffer.concat([frame(1, 'ok\n'), Buffer.from('tail')]);
    const { stdout } = demuxDockerLogBuffer(trail);
    expect(stdout.toString('utf-8')).toBe('ok\ntail');
  });
});

describe('demuxDockerLogText', () => {
  it('returns demuxed stdout and stderr as UTF-8 text', () => {
    const buf = Buffer.concat([frame(1, 'line1\n'), frame(2, 'stderr line\n'), frame(1, 'line2\n')]);
    expect(demuxDockerLogText(buf)).toBe('line1\nstderr line\nline2\n');
  });

  it('passes through clean (TTY) text untouched', () => {
    const clean = Buffer.from('plain log line\n', 'utf-8');
    expect(demuxDockerLogText(clean)).toBe('plain log line\n');
  });

  it('passes through already-decoded strings untouched', () => {
    expect(demuxDockerLogText('already text\nline2\n')).toBe('already text\nline2\n');
  });
});