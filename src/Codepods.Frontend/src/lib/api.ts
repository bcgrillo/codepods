import { getAccessToken } from "@/lib/auth-storage";

const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? "";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
};

export async function apiRequest<T>(path: string, options?: RequestOptions): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options?.auth !== false) {
    const token = getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options?.method ?? "GET",
    headers,
    body: options?.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: "same-origin",
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = (await response.json()) as { detail?: string };
      if (data.detail) {
        message = data.detail;
      }
    } catch {
      // Ignore parse errors and keep default message.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export type LoginResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

export type MeResponse = {
  uid: number;
  user: string;
  superadmin: boolean;
  device: string;
  exp: number;
};

export type AgentResponse = {
  id: number;
  name: string;
  agent_type: string;
  status: string;
  runtime_status?: string | null;
  metadata?: unknown;
};

export type AgentTypeResponse = {
  name: string;
  description: string;
  image: string;
  icon_light_base64?: string | null;
  icon_dark_base64?: string | null;
  icon_mime_type?: string | null;
};

export type VariableResponse = {
  id: number;
  name: string;
  value: string | null;
  isSecret: boolean;
  isValueRedacted?: boolean;
  codepodId: number | null;
  createdAtUtc?: string | null;
  updatedAtUtc?: string | null;
};

export type CodepodResponse = {
  id: number;
  name: string;
  description?: string | null;
  createdAtUtc?: string | null;
  updatedAtUtc?: string | null;
};

export type TemplateFileListItemResponse = {
  path: string;
  size: number;
  updated_at: string;
  is_text_editable: boolean;
};

export type TemplateFileListResponse = {
  items: TemplateFileListItemResponse[];
};

export type TemplateFileContentResponse = {
  content: string;
};

export type TemplateFileDownloadResponse = {
  file_name: string;
  content_base64: string;
};

export type TemplateCatalogItemResponse = {
  name: string;
  description: string;
  is_shared: boolean;
  icon_light_base64?: string | null;
  icon_dark_base64?: string | null;
  icon_mime_type?: string | null;
};

export type TemplateCatalogResponse = {
  items: TemplateCatalogItemResponse[];
};

export type SystemConfigResponse = {
  configPath: string;
  auth: {
    bootstrapUser: string;
    requireApprovedDevice: boolean;
    sessionLifetime: number;
  };
  relay: {
    portMin: number;
    portMax: number;
    tokenLifetime: number;
    cookieLifetime: number;
    cookieName: string;
  };
  web: {
    publicDomain: string;
    baseUrl: string;
    corsOrigins: string;
    swaggerEnabled: boolean;
  };
  tls: {
    certPath: string;
    keyPath: string;
    certbotEmail: string;
  };
};

export type SystemConfigUpdateRequest = {
  auth?: {
    require_approved_device?: boolean;
    session_lifetime?: number;
  };
  relay?: {
    port_min?: number;
    port_max?: number;
    token_lifetime?: number;
    cookie_lifetime?: number;
    cookie_name?: string;
  };
  web?: {
    public_domain?: string;
    base_url?: string;
    cors_origins?: string;
    swagger_enabled?: boolean;
  };
  tls?: {
    cert_path?: string;
    key_path?: string;
    certbot_email?: string;
  };
  reload?: boolean;
};

export type UserResponse = {
  id: number;
  username: string;
  is_superadmin: boolean;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DeviceResponse = {
  id: number;
  name: string;
  fingerprint: string;
  last_seen_at?: string | null;
  created_at?: string | null;
};

export type RelayResponse = {
  id: number;
  agent_id: number;
  agent_name: string;
  service_kind: string;
  target_port: number;
  relay_port: number;
  enabled: boolean;
};

export type RelayEnsureResponse = {
  relay: RelayResponse;
  relay_url: string;
};

export type RelayTokenResponse = {
  relay_id: number;
  relay_port: number;
  service_kind: string;
  expires_in: number;
  relay_token: string;
  relay_url: string;
  bootstrap: string;
};
