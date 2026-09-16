import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Readable } from 'stream';
import { AiProvidersService } from './ai-providers.service';
import { AiProviderEntity } from './ai-provider.entity';
import { PROVIDER_AUTH } from '@codepods/shared-types';
import type { AiProviderTestResult } from '@codepods/shared-types';

interface ResponseLike {
  status: number;
  statusText: string;
  headers: { forEach: (cb: (value: string, key: string) => void) => void };
  body: Readable | null;
}

@Injectable()
export class AiProxyService {
  constructor(private readonly providers: AiProvidersService) {}

  async forward(req: Request, res: Response, slug: string): Promise<void> {
    const provider = await this.providers.findBySlug(slug);
    if (!provider) throw new NotFoundException(`Unknown AI provider "${slug}"`);

    const apiKey = await this.providers.resolveApiKey(provider);
    const upstream = this.buildUpstreamUrl(provider, req.url, slug);
    const url = `${upstream.base}${upstream.path}`;

    // For POST requests with a default model configured, use the lightweight
    // streaming path: peek at the first chunk, replace `"model":"default"` with
    // the actual model name, and stream the rest untouched — avoids loading the
    // full (potentially very large) body into memory.
    const isPost = req.method === 'POST';
    const defaultModelName = isPost
      ? await this.providers.getDefaultModelName(provider.id, provider.codepodId)
      : null;

    let fetchBody: Buffer | Readable | null;
    let contentLength: number | null;

    if (defaultModelName) {
      const result = await this.transformDefaultModel(req, defaultModelName);
      fetchBody = result.body;
      contentLength = result.contentLength;
    } else {
      const body = await this.readBody(req);
      fetchBody = body;
      contentLength = body ? body.length : null;
    }

    const headers = this.buildUpstreamHeaders(provider, req, contentLength, apiKey);

    let upstreamRes: ResponseLike;
    try {
      const isStream = fetchBody && !(fetchBody instanceof Buffer);
      const bodyInit =
        fetchBody instanceof Buffer
          ? fetchBody
          : fetchBody
            ? Readable.toWeb(fetchBody as Readable)
            : undefined;
      const init: RequestInit = {
        method: req.method ?? 'GET',
        headers,
        body: bodyInit,
      };
      // Node/undici requires duplex: 'half' when sending a streaming body.
      if (isStream) (init as Record<string, unknown>).duplex = 'half';
      upstreamRes = (await fetch(url, init)) as ResponseLike;
    } catch (err) {
      res.status(502).json({ error: { message: 'Upstream provider error', detail: (err as Error).message } });
      return;
    }

    this.pipeResponse(upstreamRes, res);
  }

  async testProvider(providerId: number, modelId?: number): Promise<AiProviderTestResult[]> {
    const provider = await this.providers.findOne(providerId);
    const models = await this.providers.listModels(providerId);
    const model = modelId
      ? models.find((m) => m.id === modelId) ?? (() => {
          throw new BadRequestException('Model not found');
        })()
      : models.find((m) => m.isDefault) ?? models[0];

    if (!model) {
      return [{ ok: false, latencyMs: 0, message: 'No model configured for this provider' }];
    }

    const apiKey = await this.providers.resolveApiKey(provider);
    if (!apiKey) {
      return [{ ok: false, latencyMs: 0, message: 'No API key configured', model: model.name }];
    }

    // Determine which endpoints to test based on provider type.
    const endpoints = this.testEndpointsForType(provider.type);

    const results: AiProviderTestResult[] = [];
    for (const endpoint of endpoints) {
      results.push(await this.testSingleEndpoint(provider, model.name, apiKey, endpoint));
    }
    return results;
  }

  private testEndpointsForType(type: string): Array<{ path: string; label: string; body: Record<string, unknown> }> {
    const completions = {
      path: '/chat/completions',
      label: 'completions',
      body: {
        model: '',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      },
    };
    const responses = {
      path: '/responses',
      label: 'responses',
      body: {
        model: '',
        input: 'ping',
        max_output_tokens: 16,
      },
    };
    const messages = {
      path: '/v1/messages',
      label: 'messages',
      body: {
        model: '',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      },
    };

    switch (type) {
      case 'anthropic':
        return [messages];
      case 'azure':
      case 'openai':
        return [completions, responses];
      default:
        return [completions];
    }
  }

  private async testSingleEndpoint(
    provider: AiProviderEntity,
    modelName: string,
    apiKey: string,
    endpoint: { path: string; label: string; body: Record<string, unknown> },
  ): Promise<AiProviderTestResult> {
    const result = await this.runTestFetch(provider, modelName, apiKey, endpoint, endpoint.body);

    // Reasoning models (e.g. OpenAI o-series, some Azure deployments) reject
    // `max_tokens` and require `max_completion_tokens` — and that param has a
    // minimum (>1, 16 is safe). Retry once with the alternate param when the
    // upstream says so, so the test reflects real endpoint support instead of
    // a parameter incompatibility.
    if (
      result.status === 400 &&
      'max_tokens' in endpoint.body &&
      this.suggestsMaxCompletionTokens(result.message)
    ) {
      const altBody = { ...endpoint.body };
      delete altBody.max_tokens;
      altBody.max_completion_tokens = 16;
      return this.runTestFetch(provider, modelName, apiKey, endpoint, altBody);
    }
    return result;
  }

  private suggestsMaxCompletionTokens(message: string): boolean {
    const m = message.toLowerCase();
    return (
      m.includes('max_completion_tokens') ||
      (m.includes('max_tokens') && (m.includes('unsupported') || m.includes('not supported')))
    );
  }

  private async runTestFetch(
    provider: AiProviderEntity,
    modelName: string,
    apiKey: string,
    endpoint: { path: string; label: string },
    bodyTemplate: Record<string, unknown>,
  ): Promise<AiProviderTestResult> {
    const base = provider.baseUrl.replace(/\/$/, '');
    const url = `${base}${endpoint.path}`;
    const start = Date.now();

    try {
      const headers: Record<string, string> = {
        [this.getAuthHeaderName(provider)]: this.formatAuth(provider, apiKey),
        'content-type': 'application/json',
      };
      if (provider.type === 'anthropic') {
        headers['anthropic-version'] = '2023-06-01';
      }
      const body = { ...bodyTemplate, model: modelName };
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const latencyMs = Date.now() - start;
      if (res.ok) {
        return { ok: true, status: res.status, latencyMs, message: 'OK', model: modelName, endpoint: endpoint.label };
      }
      const text = await res.text();
      return { ok: false, status: res.status, latencyMs, message: text || res.statusText, model: modelName, endpoint: endpoint.label };
    } catch (err) {
      const latencyMs = Date.now() - start;
      return { ok: false, latencyMs, message: (err as Error).message, model: modelName, endpoint: endpoint.label };
    }
  }

  // ---- Internals --------------------------------------------------------

  private buildUpstreamUrl(provider: AiProviderEntity, reqUrl: string, slug: string): { base: string; path: string } {
    const base = provider.baseUrl.replace(/\/$/, '');
    const prefix = `/api/ai-proxy/${slug}`;
    const remaining = reqUrl.startsWith(prefix) ? reqUrl.slice(prefix.length) : reqUrl;
    const path = remaining.startsWith('/') ? remaining : `/${remaining}`;
    return { base, path };
  }

  private formatAuth(provider: AiProviderEntity, apiKey: string): string {
    const auth = PROVIDER_AUTH[provider.type as keyof typeof PROVIDER_AUTH] ?? PROVIDER_AUTH.openai;
    if (!auth.authScheme || auth.authScheme === 'Bearer') return `Bearer ${apiKey}`;
    return apiKey;
  }

  private getAuthHeaderName(provider: AiProviderEntity): string {
    const auth = PROVIDER_AUTH[provider.type as keyof typeof PROVIDER_AUTH] ?? PROVIDER_AUTH.openai;
    return auth.headerName;
  }

  private buildUpstreamHeaders(
    provider: AiProviderEntity,
    req: Request,
    contentLength: number | null,
    apiKey: string | null,
  ): Record<string, string> {
    const authHeader = this.getAuthHeaderName(provider).toLowerCase();
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (!value) continue;
      const lower = key.toLowerCase();
      if (lower === 'host' || lower === 'content-length' || lower === 'connection') continue;
      if (lower === authHeader) continue; // strip incoming auth
      headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
    }
    if (apiKey) headers[this.getAuthHeaderName(provider)] = this.formatAuth(provider, apiKey);
    if (contentLength !== null) headers['content-length'] = String(contentLength);
    return headers;
  }

  private async pipeResponse(upstream: ResponseLike, res: Response): Promise<void> {
    res.status(upstream.status);
    upstream.headers.forEach((value: string, key: string) => {
      if (key.toLowerCase() === 'transfer-encoding' || key.toLowerCase() === 'content-encoding') return;
      res.setHeader(key, value);
    });
    if (!upstream.body) {
      res.end();
      return;
    }
    // Node's fetch returns a Web ReadableStream; convert to a Node stream.
    const nodeStream = Readable.fromWeb(upstream.body as unknown as import('stream/web').ReadableStream<Uint8Array>);
    nodeStream.on('data', (chunk: Buffer) => res.write(chunk));
    nodeStream.on('end', () => res.end());
    nodeStream.on('error', () => res.end());
  }

  private readBody(req: Request): Promise<Buffer | null> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', () => resolve(null));
    });
  }

  // ---- Default model streaming replacement -----------------------------

  /** Reads the first `minBytes` from the request stream (or until it ends),
   * then pauses. Returns the buffered head and whether the stream has ended. */
  private readHead(req: Request, minBytes: number): Promise<{ head: Buffer | null; ended: boolean }> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let total = 0;
      let done = false;

      const finish = (ended: boolean) => {
        if (done) return;
        done = true;
        req.removeListener('data', onData);
        req.removeListener('end', onEnd);
        req.removeListener('error', onError);
        if (!ended) req.pause();
        resolve({ head: chunks.length ? Buffer.concat(chunks) : null, ended });
      };

      const onData = (c: Buffer) => {
        chunks.push(c);
        total += c.length;
        if (total >= minBytes) finish(false);
      };
      const onEnd = () => finish(true);
      const onError = () => finish(true);

      req.on('data', onData);
      req.on('end', onEnd);
      req.on('error', onError);
    });
  }

  /** Peeks at the first chunk of a POST body, replaces `"model":"default"`
   * with the actual default model name, and streams the rest untouched.
   * Only the head is buffered — the remainder flows directly to upstream. */
  private async transformDefaultModel(
    req: Request,
    defaultModelName: string,
  ): Promise<{ body: Readable; contentLength: number | null }> {
    const origContentLength = req.headers['content-length']
      ? parseInt(String(req.headers['content-length']), 10)
      : null;

    const { head, ended } = await this.readHead(req, 256);

    if (!head) {
      return { body: Readable.from([]), contentLength: origContentLength };
    }

    const text = head.toString('utf8');
    const pattern = /"model"\s*:\s*"default"/;
    const match = pattern.exec(text);

    let modifiedHead = head;
    let delta = 0;

    if (match) {
      // Preserve original whitespace, only replace the "default" string value.
      const replacement = match[0].replace(/"default"/, `"${defaultModelName}"`);
      const before = head.subarray(0, match.index);
      const after = head.subarray(match.index + match[0].length);
      modifiedHead = Buffer.concat([before, Buffer.from(replacement), after]);
      delta = Buffer.byteLength(replacement) - match[0].length;
    }

    const newContentLength =
      origContentLength !== null && delta !== 0 ? origContentLength + delta : origContentLength;

    if (ended) {
      // Stream already ended — all data was in the head.
      return { body: Readable.from([modifiedHead]), contentLength: newContentLength };
    }

    // Prepend the (possibly modified) head and stream the rest of req.
    async function* generate(): AsyncGenerator<Buffer> {
      yield modifiedHead;
      for await (const chunk of req as AsyncIterable<Buffer>) {
        yield chunk;
      }
    }

    return { body: Readable.from(generate()), contentLength: newContentLength };
  }
}