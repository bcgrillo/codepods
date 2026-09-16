# AI Proxy

The AI proxy is a reverse proxy that lets agent containers call AI providers (OpenAI, Azure, Anthropic) without ever seeing the real API key. Keys live on the host; the proxy injects them per-request.

## TL;DR

- Agents call `http://host.docker.internal:3000/api/ai-proxy/<slug>/...` with a **fake** API key (`******`).
- The proxy resolves the provider by slug (`default` → the codepod's default provider), decrypts the real key, and forwards.
- **Default model routing**: when a POST body contains `"model":"default"`, the proxy replaces it with the provider's actual default model name (streaming — only the head is buffered).
- Response is streamed back unchanged — no buffering, no body parsing.
- Each provider type uses a different auth header (`Authorization` for OpenAI/Azure, `x-api-key` for Anthropic).
- No rate-limiting, no caching, no multi-provider routing or fallback.

## Endpoints

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/ai-providers` | Admin | List all AI providers |
| GET | `/ai-providers/:id` | Admin | Get one provider |
| POST | `/ai-providers` | Admin | Create provider (with encrypted API key) |
| PATCH | `/ai-providers/:id` | Admin | Update provider |
| DELETE | `/ai-providers/:id` | Admin | Delete provider |
| POST | `/ai-providers/reorder` | Admin | Reorder sort index |
| POST | `/ai-providers/:id/test` | Admin | Test provider connectivity |
| GET | `/ai-providers/:id/models` | Admin | List models for provider |
| POST | `/ai-providers/:id/models` | Admin | Add model |
| PATCH | `/ai-providers/:id/models/:modelId` | Admin | Update model |
| DELETE | `/ai-providers/:id/models/:modelId` | Admin | Delete model |
| ALL | `/ai-proxy/:slug*` | Internal | Catch-all proxy route (streams to provider) |

## How it works

```
Agent container                   Host (NestJS)                    AI Provider
     │                                │                                │
     │  POST /api/ai-proxy/<slug>/v1/...  │                                │
     │  Authorization: 123456 (fake)  │                                │
     ├───────────────────────────────►│                                │
     │                                │  resolve provider by slug      │
     │                                │  decrypt API key               │
     │                                │  POST <baseUrl>/v1/...         │
     │                                │  Authorization: Bearer <real>  │
     │                                ├───────────────────────────────►│
     │                                │                                │
     │                                │  response (streamed)          │
     │                                │◄───────────────────────────────┤
     │  response (streamed back)     │                                │
     │◄───────────────────────────────┤                                │
```

1. The agent sends requests to `http://host.docker.internal:3000/api/ai-proxy/<slug>/...` with a **fake** API key (`123456`).
2. The proxy resolves the provider by slug (`default` → the codepod's default provider).
3. It decrypts the real API key from the host's secret store.
4. It rewrites the URL to the provider's `baseUrl`, injects the real key into the correct auth header, and forwards the request.
5. The response is streamed back unchanged — no buffering, no body parsing.

## Auth header injection

Each provider type uses a different auth header:

| Provider type | Header | Format |
|---|---|---|
| `openai` | `Authorization` | `Bearer <key>` |
| `azure` | `Authorization` | `Bearer <key>` |
| `anthropic` | `x-api-key` | `<key>` (raw) |

## How the agent gets configured

The `set_provider` command (declared in the template manifest) writes the proxy URL and fake key into the agent's config files. The agent then points its HTTP client at the proxy instead of the real provider endpoint.

See [Agent Templates](./agent-templates.md) for the `set_provider` command and variable substitution.

## Default model routing

When an agent sends a POST request with `"model":"default"` in the body, the proxy replaces `default` with the provider's actual default model name before forwarding. This lets agents use the `default` sentinel without knowing which model is configured as default.

```
Agent POST body:  {"model": "default", "messages": [...]}
                          │
                          ▼
  transformDefaultModel()
  peek first 256 bytes → replace "default" with "gpt-4o"
  stream rest untouched
                          │
                          ▼
  Upstream POST:   {"model": "gpt-4o", "messages": [...]}
```

- Only the first chunk (≤256 bytes) is buffered to find and replace the `default` sentinel; the rest of the body streams directly to upstream.
- The default model name is resolved via `getDefaultModelName()` (queries the `ai_models` table for `isDefault=true`, cached for 60s).
- If the body doesn't contain `"model":"default"`, or no default model is configured, the body is forwarded unchanged.
- The `"default"` name is reserved — it cannot be used as a real model name (`DEFAULT_MODEL_SENTINEL`).

## Key files

| File | Role |
|---|---|
| `apps/api/src/ai-proxy/ai-providers.controller.ts` | CRUD endpoints + catch-all proxy route `@All('ai-proxy/:slug*')` |
| `apps/api/src/ai-proxy/ai-proxy.service.ts` | `forward()` — resolves provider, builds upstream URL/headers, default model replacement, streams response |
| `apps/api/src/ai-proxy/ai-providers.service.ts` | Provider/model CRUD, API key resolution (`resolveApiKey`), default model name cache |
| `apps/api/src/ai-proxy/ai-provider.entity.ts` | `ai_providers` entity |
| `apps/api/src/ai-proxy/ai-model.entity.ts` | `ai_models` entity (isDefault flag) |
| `apps/api/src/main.ts` | Skips JSON body parsing for `/api/ai-proxy/` routes so raw bodies stream through |

## Current limitations

- **No rate-limiting or caching** — the proxy is a pure pass-through (except for the default model replacement).
- **No multi-provider routing** — the `default` slug routes to a single default provider; there's no load balancing across providers.
- **No fallback models** — providers can store a `fallbackModelId` but the proxy doesn't yet use it for automatic retry on model errors.
- **Agent→API auth**: the AI proxy is currently accessible without the internal token (temporary port-based auth bypass — see [Auth](./auth.md)).