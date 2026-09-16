/** A managed API as exposed by the API (credentials never returned). */
export interface ManagedApi {
  id: number;
  codepodId: number;
  /** Human-readable name, e.g. "GitHub API". */
  name: string;
  /** Optional description shown to agents via the get_available_apis tool. */
  description: string | null;
  /** Base URL, e.g. "https://api.github.com". */
  baseUrl: string;
  /** Linked credential id (nullable). The proxy injects the credential
   * into the auth header when calling the API on behalf of the agent. */
  credentialId: number | null;
  /** Header pattern with {key} placeholder, e.g. "Authorization: Bearer {key}"
   * or "X-API-Key: {key}". The {key} is replaced with the decrypted secret. */
  headerPattern: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}