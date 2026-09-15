/** Credential type: a bare key/token, or a username + password/token pair. */
export type CredentialType = 'key' | 'user_pass';

/** A credential as exposed by the API (secret is never returned). */
export interface Credential {
  id: number;
  codepodId: number;
  label: string;
  type: CredentialType;
  host: string | null;
  username: string | null;
  hasSecret: boolean;
  createdAt: string;
  updatedAt: string;
}

export const CREDENTIAL_TYPES: CredentialType[] = ['key', 'user_pass'];