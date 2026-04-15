export type ActiveSession = {
  sessionId: string
  relayId: number
  agentId: number
  agentName: string
  serviceKind: string
  updatedAt: string
}

const STORAGE_KEY = 'codepods_active_sessions'
const EVENT_NAME = 'codepods-active-sessions-changed'

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function notifyChange() {
  if (typeof window === 'undefined') {
    return
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME))
}

function parseSessions(raw: string | null): ActiveSession[] {
  if (!raw) {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .filter((item): item is ActiveSession => {
        if (!item || typeof item !== 'object') {
          return false
        }
        const row = item as Record<string, unknown>
        return (
          typeof row.sessionId === 'string' &&
          typeof row.relayId === 'number' &&
          typeof row.agentId === 'number' &&
          typeof row.agentName === 'string' &&
          typeof row.serviceKind === 'string' &&
          typeof row.updatedAt === 'string'
        )
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } catch {
    return []
  }
}

function saveSessions(rows: ActiveSession[]) {
  if (!canUseStorage()) {
    return
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  notifyChange()
}

export function getActiveSessions(): ActiveSession[] {
  if (!canUseStorage()) {
    return []
  }
  return parseSessions(window.localStorage.getItem(STORAGE_KEY))
}

export function upsertActiveSession(input: Omit<ActiveSession, 'updatedAt'>) {
  const current = getActiveSessions().filter((row) => row.sessionId !== input.sessionId)
  const next: ActiveSession = {
    ...input,
    updatedAt: new Date().toISOString(),
  }
  saveSessions([next, ...current])
}

export function removeActiveSession(sessionId: string) {
  const current = getActiveSessions()
  const next = current.filter((row) => row.sessionId !== sessionId)
  if (next.length === current.length) {
    return
  }
  saveSessions(next)
}

export function findActiveSession(sessionId: string): ActiveSession | null {
  return getActiveSessions().find((row) => row.sessionId === sessionId) ?? null
}

export function subscribeActiveSessions(onChange: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      onChange()
    }
  }
  const onCustom = () => onChange()

  window.addEventListener('storage', onStorage)
  window.addEventListener(EVENT_NAME, onCustom)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(EVENT_NAME, onCustom)
  }
}
