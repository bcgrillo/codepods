import { useEffect, useState } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/layout/header'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { ApiError, apiRequest, type RelayTokenResponse } from '@/lib/api'
import { findActiveSession, removeActiveSession, subscribeActiveSessions, type ActiveSession } from '@/lib/active-sessions'
import { AppSidebar } from './app-sidebar'

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const isSessionRoute = location.pathname.startsWith('/sessions/')
  const sessionId = isSessionRoute ? decodeURIComponent(location.pathname.split('/sessions/')[1] ?? '') : ''
  const [currentSession, setCurrentSession] = useState<ActiveSession | null>(findActiveSession(sessionId))
  const [closing, setClosing] = useState(false)
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    setCurrentSession(findActiveSession(sessionId))
  }, [sessionId])

  useEffect(() => {
    return subscribeActiveSessions(() => {
      const next = findActiveSession(sessionId)
      setCurrentSession(next)
      if (isSessionRoute && !next) {
        navigate('/agents', { replace: true })
      }
    })
  }, [isSessionRoute, navigate, sessionId])

  async function openSessionInNewTab() {
    if (!currentSession) {
      return
    }
    setOpening(true)
    try {
      const token = await apiRequest<RelayTokenResponse>(`/api/relays/${currentSession.relayId}/token`, {
        method: 'POST',
      })
      window.open(token.bootstrap, '_blank', 'noopener,noreferrer')
    } finally {
      setOpening(false)
    }
  }

  async function closeSession() {
    if (!currentSession) {
      removeActiveSession(sessionId)
      navigate('/agents', { replace: true })
      return
    }

    setClosing(true)
    try {
      await apiRequest(`/api/relays/${currentSession.relayId}`, { method: 'DELETE' })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status !== 404) {
          // Best-effort close; local session is removed below either way.
        }
      }
    } finally {
      removeActiveSession(sessionId)
      navigate('/agents', { replace: true })
      setClosing(false)
    }
  }

  return (
    <SidebarProvider defaultOpen>
      <AppSidebar />
      <SidebarInset>
        <Header fixed showLeadingSeparator={isSessionRoute}>
          <div className='flex w-full items-center justify-between gap-2'>
            {isSessionRoute ? (
              <div className='min-w-0'>
                <h1 className='truncate text-base font-semibold'>
                  {currentSession ? `${currentSession.agentName} · ${currentSession.serviceKind}` : 'Session'}
                </h1>
              </div>
            ) : <div />}
            <div className='flex items-center gap-2'>
              {isSessionRoute ? (
                <>
                  <Button variant='outline' size='sm' onClick={() => void openSessionInNewTab()} disabled={!currentSession || opening}>
                    <ExternalLink size={14} />
                    {opening ? 'Opening...' : 'Open'}
                  </Button>
                  <Button variant='destructive' size='sm' onClick={() => void closeSession()} disabled={closing}>
                    <X size={14} />
                    {closing ? 'Closing...' : 'Close'}
                  </Button>
                  <Separator orientation='vertical' className='h-6' />
                </>
              ) : null}
              <ThemeSwitch />
              <ProfileDropdown />
            </div>
          </div>
        </Header>
        <main className={isSessionRoute ? 'flex min-h-0 flex-1 p-1 pt-0 md:p-2 md:pt-1' : 'flex min-h-0 flex-1 p-4 pt-0 md:p-6 md:pt-2'}>
          <div className={isSessionRoute ? 'flex h-full w-full flex-col' : 'mx-auto flex h-full w-full max-w-7xl flex-col'}>
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
