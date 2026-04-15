const TOKEN_KEY = "codepods.access_token";
const DEVICE_ID_KEY = "codepods.device_id";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
  document.cookie = `codepods_access_token=${encodeURIComponent(token)}; path=/; SameSite=Strict; Secure`;
}

export function clearAccessToken(): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem(TOKEN_KEY);
  document.cookie = "codepods_access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict; Secure";
}

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") {
    return "device-unavailable";
  }
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing && existing.trim().length > 0) {
    return existing;
  }
  const created = crypto.randomUUID().replace(/-/g, "");
  localStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

export function setDeviceId(deviceId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(DEVICE_ID_KEY, deviceId);
}
