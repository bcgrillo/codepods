/**
 * Shared auth-token holder used by all SDK HTTP clients so the admin bearer
 * token (obtained via AuthClient.login / AuthClient.setup) is attached to every
 * API request.
 */
let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

/** Returns the Authorization header to merge into a request, if a token is set. */
export function authHeaders(): Record<string, string> {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

/**
 * Global handler invoked whenever any SDK client receives a 401. The web app
 * registers it to clear the stored token and redirect to /login so an expired
 * or revoked session doesn't leave the user stuck on a broken page.
 */
let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

/** Called by SDK clients when a request returns 401. */
export function notifyUnauthorized(): void {
  onUnauthorized?.();
}
