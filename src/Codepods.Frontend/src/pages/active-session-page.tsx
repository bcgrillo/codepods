import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError, apiRequest, type RelayTokenResponse } from '@/lib/api'
import { findActiveSession, removeActiveSession, subscribeActiveSessions } from '@/lib/active-sessions'

export function ActiveSessionPage() {
  const navigate = useNavigate()
  const params = useParams<{ sessionId: string }>()
  const sessionId = params.sessionId ?? ''
  const [iframeUrl, setIframeUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return subscribeActiveSessions(() => {
      if (!findActiveSession(sessionId)) {
        navigate('/agents', { replace: true })
      }
    })
  }, [navigate, sessionId])

  useEffect(() => {
    let active = true
    ;(async () => {
      const currentSession = findActiveSession(sessionId)
      if (!currentSession) {
        setError('Session not found.')
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      try {
        const token = await apiRequest<RelayTokenResponse>(`/api/relays/${currentSession.relayId}/token`, {
          method: 'POST',
        })
        if (!active) {
          return
        }
        setIframeUrl(token.bootstrap)
      } catch (err) {
        if (!active) {
          return
        }
        if (err instanceof ApiError && err.status === 404) {
          removeActiveSession(sessionId)
          navigate('/agents', { replace: true })
          return
        }
        setError(err instanceof ApiError ? err.message : 'Failed to bootstrap relay session.')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    })()

    return () => {
      active = false
    }
  }, [sessionId])

  return (
    <section className='flex h-full min-h-0 flex-1 flex-col gap-2'>
      {loading ? <p className='text-sm text-muted-foreground'>Loading session...</p> : null}
      {error ? (
        <p className='rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
          {error}
        </p>
      ) : null}

      {!loading && !error && iframeUrl ? (
        <div className='min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-background'>
          <iframe title={`session-${sessionId}`} src={iframeUrl} className='h-full w-full border-0' />
        </div>
      ) : null}
    </section>
  )
}
