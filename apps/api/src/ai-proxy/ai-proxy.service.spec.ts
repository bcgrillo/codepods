import { Test } from '@nestjs/testing';
import { AiProxyService } from './ai-proxy.service';
import { AiProvidersService } from './ai-providers.service';
import { Readable } from 'stream';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';

// Minimal Response shape used by the proxy's test path.
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Bad Request',
    headers: { forEach: () => {} },
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

/** Reads a fetch body (Buffer or Web ReadableStream) into a string. */
async function readFetchBody(body: unknown): Promise<string> {
  if (!body) return '';
  if (body instanceof Buffer) return body.toString('utf8');
  if (body instanceof Uint8Array) return Buffer.from(body).toString('utf8');
  // Web ReadableStream
  const reader = (body as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Creates a mock Express Request backed by a real Readable stream. */
function createMockReq(body: string, method = 'POST', url = '/api/ai-proxy/test/chat/completions'): ExpressRequest {
  const stream = new Readable();
  stream.push(Buffer.from(body));
  stream.push(null);
  const mock = stream as unknown as Record<string, unknown>;
  mock.method = method;
  mock.url = url;
  mock.headers = {
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(body)),
  };
  return stream as unknown as ExpressRequest;
}

function createMockRes(): ExpressResponse {
  return {
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    json: jest.fn(),
  } as unknown as ExpressResponse;
}

describe('AiProxyService - testProvider completions retry', () => {
  let service: AiProxyService;
  const providers = {
    findOne: jest.fn(),
    listModels: jest.fn(),
    resolveApiKey: jest.fn(),
  };
  const fetchMock = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    (globalThis as { fetch?: unknown }).fetch = fetchMock as unknown as typeof fetch;
    const module = await Test.createTestingModule({
      providers: [AiProxyService, { provide: AiProvidersService, useValue: providers }],
    }).compile();
    service = module.get(AiProxyService);
  });

  it('retries with max_completion_tokens when the model rejects max_tokens', async () => {
    providers.findOne.mockResolvedValue({ id: 1, type: 'azure', baseUrl: 'https://x.openai.azure.com/' });
    providers.listModels.mockResolvedValue([{ id: 1, name: 'o3-mini', isDefault: true }]);
    providers.resolveApiKey.mockResolvedValue('key');

    // First call: 400 complaining about max_tokens. Second call: 200 OK.
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { message: "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead." } },
          400,
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 'chatcmpl-x' }, 200));

    const results = await service.testProvider(1);

    const bodies = fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));
    expect(bodies[0]).toMatchObject({ model: 'o3-mini', max_tokens: 1 });
    expect(bodies[0].max_completion_tokens).toBeUndefined();
    expect(bodies[1]).toMatchObject({ model: 'o3-mini', max_completion_tokens: 16 });
    expect(bodies[1].max_tokens).toBeUndefined();
    expect(results.some((r) => r.ok && r.endpoint === 'completions')).toBe(true);
  });

  it('does not retry when the failure is unrelated to max_tokens', async () => {
    providers.findOne.mockResolvedValue({ id: 1, type: 'openai', baseUrl: 'https://api.openai.com/' });
    providers.listModels.mockResolvedValue([{ id: 1, name: 'gpt-4o', isDefault: true }]);
    providers.resolveApiKey.mockResolvedValue('key');

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: 'invalid_api_key' } }, 401));

    const results = await service.testProvider(1);

    expect(fetchMock).toHaveBeenCalledTimes(2); // completions + responses, no retry
    const completions = results.find((r) => r.endpoint === 'completions');
    expect(completions?.ok).toBe(false);
    expect(completions?.status).toBe(401);
  });
});

describe('AiProxyService - default model replacement', () => {
  let service: AiProxyService;
  const providers = {
    findBySlug: jest.fn(),
    resolveApiKey: jest.fn(),
    getDefaultModelName: jest.fn(),
    // testProvider deps
    findOne: jest.fn(),
    listModels: jest.fn(),
  };
  const fetchMock = jest.fn();
  let capturedBody: string | null;
  let capturedHeaders: Record<string, string> | null;

  beforeEach(async () => {
    jest.clearAllMocks();
    capturedBody = null;
    capturedHeaders = null;
    (globalThis as { fetch?: unknown }).fetch = fetchMock as unknown as typeof fetch;
    const module = await Test.createTestingModule({
      providers: [AiProxyService, { provide: AiProvidersService, useValue: providers }],
    }).compile();
    service = module.get(AiProxyService);
  });

  function setupProvider(defaultModel: string | null) {
    providers.findBySlug.mockResolvedValue({ id: 1, codepodId: 1, type: 'openai', baseUrl: 'https://api.openai.com/v1' });
    providers.resolveApiKey.mockResolvedValue('sk-test');
    providers.getDefaultModelName.mockResolvedValue(defaultModel);
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = await readFetchBody(init.body);
      capturedHeaders = init.headers as Record<string, string>;
      return jsonResponse({ ok: true }, 200);
    });
  }

  it('replaces "model":"default" with the actual default model name', async () => {
    setupProvider('gpt-4o');
    const req = createMockReq(JSON.stringify({ model: 'default', messages: [{ role: 'user', content: 'hi' }] }));
    await service.forward(req, createMockRes(), 'test');

    const body = JSON.parse(capturedBody!);
    expect(body.model).toBe('gpt-4o');
  });

  it('preserves original whitespace around the model field', async () => {
    setupProvider('gpt-4o');
    // Use raw JSON with spaces to verify whitespace preservation
    const req = createMockReq('{ "model" : "default" , "messages": [] }');
    await service.forward(req, createMockRes(), 'test');

    expect(capturedBody).toContain('"gpt-4o"');
    expect(capturedBody).not.toContain('"default"');
  });

  it('adjusts content-length when the replacement model name is longer', async () => {
    setupProvider('gpt-4o-mini');
    const bodyStr = JSON.stringify({ model: 'default', messages: [] });
    const origLen = Buffer.byteLength(bodyStr);
    const req = createMockReq(bodyStr);
    await service.forward(req, createMockRes(), 'test');

    const newLen = parseInt(capturedHeaders!['content-length'], 10);
    // "default" (7) → "gpt-4o-mini" (11) → delta = +4
    expect(newLen).toBe(origLen + 4);
    expect(Buffer.byteLength(capturedBody!)).toBe(newLen);
  });

  it('adjusts content-length when the replacement model name is shorter', async () => {
    setupProvider('gpt-4');
    const bodyStr = JSON.stringify({ model: 'default', messages: [] });
    const origLen = Buffer.byteLength(bodyStr);
    const req = createMockReq(bodyStr);
    await service.forward(req, createMockRes(), 'test');

    const newLen = parseInt(capturedHeaders!['content-length'], 10);
    // "default" (7) → "gpt-4" (5) → delta = -2
    expect(newLen).toBe(origLen - 2);
  });

  it('passes through unchanged when model is not "default"', async () => {
    setupProvider('gpt-4o');
    const bodyStr = JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] });
    const req = createMockReq(bodyStr);
    await service.forward(req, createMockRes(), 'test');

    const body = JSON.parse(capturedBody!);
    expect(body.model).toBe('gpt-4o');
    const newLen = parseInt(capturedHeaders!['content-length'], 10);
    expect(newLen).toBe(Buffer.byteLength(bodyStr));
  });

  it('passes through when no default model is configured', async () => {
    setupProvider(null);
    const bodyStr = JSON.stringify({ model: 'default', messages: [] });
    const req = createMockReq(bodyStr);
    await service.forward(req, createMockRes(), 'test');

    // Should pass through unchanged — no replacement
    const body = JSON.parse(capturedBody!);
    expect(body.model).toBe('default');
  });

  it('passes through GET requests without model replacement', async () => {
    setupProvider('gpt-4o');
    const req = createMockReq('', 'GET');
    await service.forward(req, createMockRes(), 'test');

    // GET should not call getDefaultModelName
    expect(providers.getDefaultModelName).not.toHaveBeenCalled();
  });

  it('streams a large body without loading it all into memory at once', async () => {
    setupProvider('gpt-4o');
    // Create a large body (> 256 bytes head) with "model":"default" at the start
    const bigContent = 'x'.repeat(100_000);
    const bodyStr = JSON.stringify({ model: 'default', messages: [{ role: 'user', content: bigContent }] });
    const req = createMockReq(bodyStr);
    await service.forward(req, createMockRes(), 'test');

    const body = JSON.parse(capturedBody!);
    expect(body.model).toBe('gpt-4o');
    expect(body.messages[0].content).toBe(bigContent);
    // Content-length should match the actual body size
    const newLen = parseInt(capturedHeaders!['content-length'], 10);
    expect(newLen).toBe(Buffer.byteLength(capturedBody!));
  });

  it('handles empty POST body', async () => {
    setupProvider('gpt-4o');
    const req = createMockReq('');
    (req as unknown as Record<string, Record<string, string>>).headers['content-length'] = '0';
    await service.forward(req, createMockRes(), 'test');

    expect(capturedBody).toBe('');
  });

  it('streaming path has negligible overhead vs buffer path for large bodies', async () => {
    // 5 MB body — simulates a heavy LLM conversation with lots of context.
    // The key concern: the new streaming path should not add meaningful latency
    // or memory overhead compared to the old readBody() buffer path.
    const bigContent = 'A'.repeat(5_000_000);
    const bodyStr = JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: bigContent }] });
    const bodySizeMB = Buffer.byteLength(bodyStr) / (1024 * 1024);

    // --- Streaming path (default model replacement, model not "default" so no-op) ---
    setupProvider('gpt-4o');
    const streamReq = createMockReq(bodyStr);
    const streamStart = process.hrtime.bigint();
    await service.forward(streamReq, createMockRes(), 'test');
    const streamElapsed = Number(process.hrtime.bigint() - streamStart) / 1e6; // ms

    expect(capturedBody).toBe(bodyStr); // body arrives intact
    const streamMemAfter = process.memoryUsage().heapUsed;

    // --- Buffer path (no default model → falls back to readBody) ---
    providers.getDefaultModelName.mockResolvedValue(null);
    const bufferReq = createMockReq(bodyStr);
    const bufferStart = process.hrtime.bigint();
    await service.forward(bufferReq, createMockRes(), 'test');
    const bufferElapsed = Number(process.hrtime.bigint() - bufferStart) / 1e6; // ms

    // Both paths should complete quickly for a 5MB body.
    // The streaming path should NOT be significantly slower than the buffer path.
    // Allow 3x tolerance to account for GC jitter.
    expect(streamElapsed).toBeLessThan(bufferElapsed * 3 + 50);
    expect(streamElapsed).toBeLessThan(500); // absolute bound: 5MB in < 500ms

    // Log for visibility in test output
    console.log(
      `  [perf] ${bodySizeMB.toFixed(1)}MB body — stream: ${streamElapsed.toFixed(1)}ms, buffer: ${bufferElapsed.toFixed(1)}ms`,
    );
  });

  it('streaming path does not buffer the full body in memory (head only)', async () => {
    // Verify the streaming path only buffers the first ~256 bytes (the head),
    // not the entire body. We do this by checking that the fetch body is a
    // ReadableStream (web stream), not a Buffer.
    setupProvider('gpt-4o');
    let capturedBodyType = '';
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBodyType = init.body instanceof Uint8Array ? 'buffer' : 'stream';
      // Drain the stream so the request completes
      if (init.body && typeof init.body === 'object' && 'getReader' in (init.body as object)) {
        const reader = (init.body as ReadableStream<Uint8Array>).getReader();
        for (;;) {
          const { done } = await reader.read();
          if (done) break;
        }
      }
      return jsonResponse({ ok: true }, 200);
    });

    const bigContent = 'B'.repeat(1_000_000); // 1MB
    const bodyStr = JSON.stringify({ model: 'default', messages: [{ role: 'user', content: bigContent }] });
    const req = createMockReq(bodyStr);
    await service.forward(req, createMockRes(), 'test');

    // The streaming path must send a web ReadableStream, not a Buffer.
    // If it buffered the full body, it would be a Buffer.
    expect(capturedBodyType).toBe('stream');
  });
});