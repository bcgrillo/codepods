// ---- Agent requests (human-in-the-loop approval) -------------------------

/**
 * Type of request the agent is making to the user.
 * Extensible — currently only 'whitelist' (temporary egress access).
 */
export type AgentRequestType = 'whitelist';

/**
 * Status of an agent request.
 * - 'pending'   — waiting for user action
 * - 'approved'  — user approved (may be temporary with expiresAt)
 * - 'rejected'  — user rejected
 * - 'expired'   — temporary approval has expired
 */
export type AgentRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired';

/** Payload for a whitelist request — the URL the agent wants to access. */
export interface WhitelistRequestPayload {
  /** The full URL the agent tried to reach. */
  url: string;
  /** Extracted hostname used for egress whitelist matching. */
  host: string;
  /** Requested duration in minutes (optional — user can override). */
  duration?: number;
}

/** Union of all request payloads, discriminated by type. */
export type AgentRequestPayload = WhitelistRequestPayload;

export interface AgentRequest {
  id: number;
  agentId: string;
  type: AgentRequestType;
  status: AgentRequestStatus;
  /** Type-specific payload (JSON column). */
  payload: AgentRequestPayload;
  /** Agent's explanation of why it needs access. */
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
  /** Who resolved the request (user identifier). */
  resolvedBy: string | null;
  /** When a temporary approval expires (null for permanent or pending). */
  expiresAt: string | null;
}

/** Body for approving a request with a temporary duration. */
export interface ApproveRequestDto {
  /** Duration in minutes for temporary approval. Omit for permanent. */
  durationMinutes?: number;
}

// ---- Egress temporary exceptions -----------------------------------------

/** An active temporary egress exception (in-memory, not persisted). */
export interface TempException {
  host: string;
  /** Expiry timestamp (ISO string). */
  expiresAt: string;
  /** Agent that triggered the exception, or 'manual' if created from settings. */
  agentId: string;
}

/** Body for creating a temporary exception manually from the settings UI. */
export interface CreateTempExceptionDto {
  host: string;
  /** Duration in minutes. */
  durationMinutes: number;
}