export type AiProviderType = 'openai' | 'azure' | 'anthropic';

/** Sentinel value for the `model` field meaning "use the provider's default
 * model". The AI proxy detects `"model":"default"` in the request body and
 * replaces it with the actual default model name before forwarding upstream.
 * No AiModelEntity may use this as its name — it is reserved. */
export const DEFAULT_MODEL_SENTINEL = 'default';

export const AI_PROVIDER_TYPES: AiProviderType[] = ['anthropic', 'azure', 'openai'];

/** Auth configuration deduced from provider type. */
export interface AiProviderAuth {
  headerName: string;
  /** 'Bearer' for standard bearer auth, '' for raw key (no scheme prefix). */
  authScheme: string;
}

export const PROVIDER_AUTH: Record<AiProviderType, AiProviderAuth> = {
  openai: { headerName: 'Authorization', authScheme: 'Bearer' },
  azure: { headerName: 'Authorization', authScheme: 'Bearer' },
  anthropic: { headerName: 'x-api-key', authScheme: '' },
};

export const PROVIDER_BASE_URL_PRESETS: Record<AiProviderType, string> = {
  openai: 'https://api.openai.com/v1',
  azure: '',
  anthropic: 'https://api.anthropic.com',
};

export interface AiModel {
  id: number;
  providerId: number;
  name: string;
  displayName: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AiProvider {
  id: number;
  codepodId: number;
  name: string;
  slug: string;
  type: AiProviderType;
  baseUrl: string;
  /** Set to true when an API key is configured (credential or env var). Never returns the value. */
  hasApiKey: boolean;
  apiKeyEnvVar: string | null;
  /** Linked unified credential id (FK → credentials.id). The proxy resolves the
   * secret from the credential store. Lets any credential (incl. git user_pass)
   * be reused for an AI provider. */
  credentialId: number | null;
  /** True when credentialId points at an existing credential. */
  hasCredential: boolean;
  /** True when this is the default provider for its codepod. */
  isDefault: boolean;
  /** Disabled providers are invisible to the proxy and set_provider dropdowns. */
  enabled: boolean;
  fallbackModelId: number | null;
  fallbackModel: AiModel | null;
  models: AiModel[];
  /** Manual sort order (drag-and-drop). 0 = no forced order (alphabetical fallback). */
  sortOrder: number;
  /** Provider icon URL (light theme). Populated from discovered providers. */
  iconUrl: string | null;
  /** Provider icon URL (dark theme). Populated from discovered providers. */
  iconDarkUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAiModelDto {
  name: string;
  displayName?: string | null;
  isDefault?: boolean;
}

export interface UpdateAiModelDto {
  name?: string;
  displayName?: string | null;
  isDefault?: boolean;
}

export interface CreateAiProviderDto {
  name: string;
  type?: AiProviderType;
  baseUrl: string;
  /** Name of an environment variable holding the API key. */
  apiKeyEnvVar?: string | null;
  /** Linked unified credential id (FK → credentials.id). */
  credentialId?: number | null;
  isDefault?: boolean;
  fallbackModelId?: number | null;
  models?: CreateAiModelDto[];
  /** Provider icon URL (light theme). Populated from discovered providers. */
  iconUrl?: string | null;
  /** Provider icon URL (dark theme). Populated from discovered providers. */
  iconDarkUrl?: string | null;
}

export interface UpdateAiProviderDto {
  name?: string;
  type?: AiProviderType;
  baseUrl?: string;
  apiKeyEnvVar?: string | null;
  /** Linked unified credential id (FK → credentials.id). */
  credentialId?: number | null;
  isDefault?: boolean;
  fallbackModelId?: number | null;
  enabled?: boolean;
  iconUrl?: string | null;
  iconDarkUrl?: string | null;
}

export interface AiProviderTestResult {
  ok: boolean;
  status?: number;
  latencyMs: number;
  message: string;
  model?: string;
  endpoint?: string;
}