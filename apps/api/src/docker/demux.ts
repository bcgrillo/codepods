/**
 * Demultiplexing for Docker's framed stream protocol.
 *
 * Docker multiplexes stdout/stderr in one stream using an 8-byte header per
 * chunk when the stream is NOT attached to a TTY:
 *
 *   [stream-type: 1 byte][reserved: 3 bytes][length: 4 bytes big-endian][payload]
 *
 * stream-type: 0 = stdin, 1 = stdout, 2 = stderr.
 *
 * This is the same framing `docker-modem`'s `demuxStream` consumes for live
 * streams; this module handles a complete buffer (dockerode's non-stream
 * `container.logs()` path returns the raw framed body).
 */

const FRAME_HEADER_LEN = 8;
const VALID_STREAM_TYPES = new Set([0, 1, 2]);

export interface DemuxedLog {
  stdout: Buffer;
  stderr: Buffer;
}

/**
 * Splits a framed buffer into stdout and stderr payloads.
 *
 * If the buffer does not start with a valid frame header (e.g. the stream came
 * from a TTY and is already clean text), the whole buffer is returned as
 * stdout with empty stderr. This mirrors docker-modem's passthrough fallback,
 * so callers can rely on readable text either way.
 */
export function demuxDockerLogBuffer(buf: Buffer): DemuxedLog {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  let offset = 0;
  while (offset + FRAME_HEADER_LEN <= buf.length) {
    const streamType = buf.readUInt8(offset);
    const length = buf.readUInt32BE(offset + 4);

    // Invalid header → the stream is not multiplexed (TTY mode) or got
    // misaligned. Return everything read so far plus the remainder as stdout.
    if (!VALID_STREAM_TYPES.has(streamType)) {
      return {
        stdout: Buffer.concat([...stdout, buf.subarray(offset)]),
        stderr: Buffer.concat(stderr),
      };
    }

    offset += FRAME_HEADER_LEN;
    if (offset + length > buf.length) {
      // Header promises more payload than available (truncated stream): emit
      // what payload exists rather than dropping it.
      if (streamType === 1) {
        return { stdout: Buffer.concat([...stdout, buf.subarray(offset)]), stderr: Buffer.concat(stderr) };
      }
      return { stdout: Buffer.concat(stdout), stderr: Buffer.concat([...stderr, buf.subarray(offset)]) };
    }

    const payload = buf.subarray(offset, offset + length);
    if (streamType === 1) stdout.push(payload);
    else if (streamType === 2) stderr.push(payload);
    offset += length;
  }

  // Trailing bytes that don't form a full header: treat as stdout directly.
  return { stdout: Buffer.concat([...stdout, buf.subarray(offset)]), stderr: Buffer.concat(stderr) };
}

/** Convenience: demux a framed buffer and return clean UTF-8 text preserving
 *  frame order (stdout and stderr interleaved as written, matching `docker
 *  logs`). Falls back to the raw buffer as text when the stream is not framed. */
export function demuxDockerLogText(buf: Buffer | string): string {
  if (typeof buf === 'string') return buf;
  if (!isValidFrameHeader(buf)) return buf.toString('utf-8');

  const chunks: Buffer[] = [];
  let offset = 0;
  while (offset + FRAME_HEADER_LEN <= buf.length) {
    const streamType = buf.readUInt8(offset);
    const length = buf.readUInt32BE(offset + 4);
    if (!VALID_STREAM_TYPES.has(streamType)) break;
    offset += FRAME_HEADER_LEN;
    if (offset + length > buf.length) break;
    if (streamType === 1 || streamType === 2) chunks.push(buf.subarray(offset, offset + length));
    offset += length;
  }
  // Any trailing bytes (truncated tail) are emitted as text too.
  if (offset < buf.length) chunks.push(buf.subarray(offset));
  return Buffer.concat(chunks).toString('utf-8');
}

function isValidFrameHeader(buf: Buffer): boolean {
  return buf.length >= FRAME_HEADER_LEN && VALID_STREAM_TYPES.has(buf.readUInt8(0));
}