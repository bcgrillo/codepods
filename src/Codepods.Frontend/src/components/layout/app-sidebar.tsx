import { useEffect, useMemo, useState } from 'react'
import { Boxes, CircleHelp, FileCode2, TerminalSquare, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { useTheme } from '@/context/theme-provider'
import { getActiveSessions, removeActiveSession, subscribeActiveSessions, type ActiveSession } from '@/lib/active-sessions'
import { ApiError, apiRequest, type RelayResponse, type TemplateCatalogResponse } from '@/lib/api'
import { sidebarData } from './data/sidebar-data'
import { NavGroup } from './nav-group'
import { type NavGroup as NavGroupType } from './types'
import { TeamSwitcher } from './team-switcher'

function toDataUri(mimeType: string | null | undefined, base64: string | null | undefined) {
  if (!base64) {
    return null
  }
  return `data:${mimeType || 'image/svg+xml'};base64,${base64}`
}

function titleize(input: string) {
  const aliases: Record<string, string> = {
    opencode: 'OpenCode',
  }
  const normalized = input.trim().toLowerCase()
  if (aliases[normalized]) {
    return aliases[normalized]
  }

  return input
    .split(/[-_\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

function formatBuildVersion(value: string) {
  if (!value || value === 'dev') {
    return 'dev'
  }
  if (/^[0-9a-f]{7,40}$/i.test(value)) {
    return `#${value}`
  }
  return value
}

export function AppSidebar() {
  const { resolvedTheme } = useTheme()
  const [templates, setTemplates] = useState<TemplateCatalogResponse['items']>([])
  const [buildVersion, setBuildVersion] = useState('...')
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([])

  async function closeActiveSession(session: ActiveSession) {
    try {
      await apiRequest(`/api/relays/${session.relayId}`, { method: 'DELETE' })
    } catch (err) {
      if (err instanceof ApiError && err.status !== 404) {
        // Best-effort close; local session is removed below either way.
      }
    } finally {
      removeActiveSession(session.sessionId)
    }
  }

  useEffect(() => {
    setActiveSessions(getActiveSessions())
    return subscribeActiveSessions(() => setActiveSessions(getActiveSessions()))
  }, [])

  useEffect(() => {
    if (activeSessions.length === 0) {
      return
    }

    let active = true
    ;(async () => {
      try {
        const relays = await apiRequest<RelayResponse[]>('/api/relays')
        if (!active) {
          return
        }
        const validRelayIds = new Set(relays.filter((row) => row.enabled).map((row) => row.id))
        for (const session of activeSessions) {
          if (!validRelayIds.has(session.relayId)) {
            removeActiveSession(session.sessionId)
          }
        }
      } catch {
        // Ignore transient API errors; local session state remains available.
      }
    })()

    return () => {
      active = false
    }
  }, [activeSessions])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const response = await apiRequest<TemplateCatalogResponse>('/api/templates')
        if (!active) {
          return
        }
        setTemplates(response.items ?? [])
      } catch {
        if (!active) {
          return
        }
        setTemplates([])
      }
    })()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const response = await apiRequest<{ version: string }>('/api/system/version')
        if (!active) {
          return
        }
        setBuildVersion(response.version || 'dev')
      } catch {
        if (!active) {
          return
        }
        setBuildVersion('dev')
      }
    })()

    return () => {
      active = false
    }
  }, [])

  const navGroups = useMemo<NavGroupType[]>(() => {
    const templateItems = (templates.length > 0 ? templates : [
      { name: 'shared', description: 'Shared', is_shared: true },
      { name: 'codex', description: 'Codex', is_shared: false },
      { name: 'opencode', description: 'OpenCode', is_shared: false },
      { name: 'copilot', description: 'Copilot', is_shared: false },
    ]).map((item) => {
      const iconUri = resolvedTheme === 'dark'
        ? toDataUri(item.icon_mime_type, item.icon_dark_base64 ?? item.icon_light_base64)
        : toDataUri(item.icon_mime_type, item.icon_light_base64 ?? item.icon_dark_base64)
      const Icon = iconUri
        ? ((props: { className?: string }) => (
            <img
              src={iconUri}
              alt=''
              className={`size-4 rounded-sm object-contain ${props.className ?? ''}`.trim()}
            />
          ))
        : ((props: { className?: string }) =>
            item.is_shared ? (
              <Boxes className={`size-4 ${props.className ?? ''}`.trim()} />
            ) : (
              <FileCode2 className={`size-4 ${props.className ?? ''}`.trim()} />
            ))
      return {
        title: titleize(item.name),
        url: `/templates/${item.name}`,
        icon: Icon,
      }
    })

    const baseGroups = sidebarData.navGroups.map((group) => ({
      ...group,
      items: group.items.map((item) => {
        if (!('items' in item) || item.title !== 'Templates') {
          return item
        }
        return {
          ...item,
          items: templateItems,
        }
      }),
    }))

    if (activeSessions.length > 0) {
      baseGroups.splice(1, 0, {
        title: 'Active sessions',
        items: activeSessions.map((session) => ({
          title: `${session.agentName} (${session.serviceKind})`,
          url: `/sessions/${encodeURIComponent(session.sessionId)}`,
          icon: TerminalSquare,
          actionLabel: `Close ${session.agentName} ${session.serviceKind} session`,
          actionIcon: X,
          onAction: () => {
            void closeActiveSession(session)
          },
        })),
      })
    }

    return baseGroups
  }, [activeSessions, resolvedTheme, templates])

  return (
    <Sidebar collapsible='icon' variant='sidebar'>
      <SidebarHeader>
        <TeamSwitcher teams={sidebarData.teams} />
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((props) => (
          <NavGroup key={props.title} {...props} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip='About Codepods'>
              <Link to='/about'>
                <CircleHelp />
                <span>About</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <p className='px-2 text-[11px] text-sidebar-foreground/45'>{formatBuildVersion(buildVersion)}</p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
