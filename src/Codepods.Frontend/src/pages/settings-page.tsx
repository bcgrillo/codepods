import { useEffect, useMemo, useState } from 'react'
import { Bell, Globe, Shield, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { ApiError, apiRequest, type SystemConfigResponse, type SystemConfigUpdateRequest } from '@/lib/api'
import { ContentSection } from '@/features/settings/components/content-section'
import { SidebarNav } from '@/features/settings/components/sidebar-nav'

type SettingsForm = {
  requireApprovedDevice: boolean
  sessionLifetime: string
  relayPortMin: string
  relayPortMax: string
  relayTokenLifetime: string
  relayCookieLifetime: string
  relayCookieName: string
  publicDomain: string
  baseUrl: string
  corsOrigins: string
  swaggerEnabled: boolean
  certPath: string
  keyPath: string
  certbotEmail: string
}

function toForm(config: SystemConfigResponse): SettingsForm {
  return {
    requireApprovedDevice: config.auth.requireApprovedDevice,
    sessionLifetime: String(config.auth.sessionLifetime),
    relayPortMin: String(config.relay.portMin),
    relayPortMax: String(config.relay.portMax),
    relayTokenLifetime: String(config.relay.tokenLifetime),
    relayCookieLifetime: String(config.relay.cookieLifetime),
    relayCookieName: config.relay.cookieName,
    publicDomain: config.web.publicDomain,
    baseUrl: config.web.baseUrl,
    corsOrigins: config.web.corsOrigins,
    swaggerEnabled: config.web.swaggerEnabled,
    certPath: config.tls.certPath,
    keyPath: config.tls.keyPath,
    certbotEmail: config.tls.certbotEmail,
  }
}

type SettingsSection = 'auth' | 'relay' | 'web' | 'tls'

export function SettingsPage() {
  const [configPath, setConfigPath] = useState('')
  const [savedForm, setSavedForm] = useState<SettingsForm | null>(null)
  const [form, setForm] = useState<SettingsForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [reloadConfirmOpen, setReloadConfirmOpen] = useState(false)
  const [currentSection, setCurrentSection] = useState<SettingsSection>('auth')

  async function load() {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const cfg = await apiRequest<SystemConfigResponse>('/api/settings/config')
      setConfigPath(cfg.configPath)
      const mapped = toForm(cfg)
      setSavedForm(mapped)
      setForm(mapped)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load settings.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function switchSection(next: SettingsSection) {
    setCurrentSection(next)
    setMessage(null)
    setError(null)
    if (savedForm) {
      setForm(savedForm)
    }
  }

  function discardCurrentSection() {
    if (!savedForm || !form) {
      return
    }

    if (currentSection === 'auth') {
      setForm((current) =>
        current
          ? {
              ...current,
              requireApprovedDevice: savedForm.requireApprovedDevice,
              sessionLifetime: savedForm.sessionLifetime,
            }
          : current
      )
      return
    }

    if (currentSection === 'relay') {
      setForm((current) =>
        current
          ? {
              ...current,
              relayPortMin: savedForm.relayPortMin,
              relayPortMax: savedForm.relayPortMax,
              relayTokenLifetime: savedForm.relayTokenLifetime,
              relayCookieLifetime: savedForm.relayCookieLifetime,
              relayCookieName: savedForm.relayCookieName,
            }
          : current
      )
      return
    }

    if (currentSection === 'web') {
      setForm((current) =>
        current
          ? {
              ...current,
              publicDomain: savedForm.publicDomain,
              baseUrl: savedForm.baseUrl,
              corsOrigins: savedForm.corsOrigins,
              swaggerEnabled: savedForm.swaggerEnabled,
            }
          : current
      )
      return
    }

    setForm((current) =>
      current
        ? {
            ...current,
            certPath: savedForm.certPath,
            keyPath: savedForm.keyPath,
            certbotEmail: savedForm.certbotEmail,
          }
        : current
    )
  }

  async function saveCurrentSectionWithReload() {
    if (!form || !savedForm) {
      return
    }

    setSaving(true)
    setError(null)
    setMessage(null)

    let payload: SystemConfigUpdateRequest = { reload: true }

    if (currentSection === 'auth') {
      payload = {
        auth: {
          require_approved_device: form.requireApprovedDevice,
          session_lifetime: Number(form.sessionLifetime),
        },
        reload: true,
      }
    } else if (currentSection === 'relay') {
      payload = {
        relay: {
          port_min: Number(form.relayPortMin),
          port_max: Number(form.relayPortMax),
          token_lifetime: Number(form.relayTokenLifetime),
          cookie_lifetime: Number(form.relayCookieLifetime),
          cookie_name: form.relayCookieName,
        },
        reload: true,
      }
    } else if (currentSection === 'web') {
      payload = {
        web: {
          public_domain: form.publicDomain,
          base_url: form.baseUrl,
          cors_origins: form.corsOrigins,
          swagger_enabled: form.swaggerEnabled,
        },
        reload: true,
      }
    } else if (currentSection === 'tls') {
      payload = {
        tls: {
          cert_path: form.certPath,
          key_path: form.keyPath,
          certbot_email: form.certbotEmail,
        },
        reload: true,
      }
    }

    try {
      await apiRequest('/api/settings/config', { method: 'PUT', body: payload })
      setMessage('Settings saved and web reload requested.')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  const isCurrentSectionDirty = useMemo(() => {
    if (!form || !savedForm) {
      return false
    }

    if (currentSection === 'auth') {
      return (
        form.requireApprovedDevice !== savedForm.requireApprovedDevice ||
        form.sessionLifetime !== savedForm.sessionLifetime
      )
    }

    if (currentSection === 'relay') {
      return (
        form.relayPortMin !== savedForm.relayPortMin ||
        form.relayPortMax !== savedForm.relayPortMax ||
        form.relayTokenLifetime !== savedForm.relayTokenLifetime ||
        form.relayCookieLifetime !== savedForm.relayCookieLifetime ||
        form.relayCookieName !== savedForm.relayCookieName
      )
    }

    if (currentSection === 'web') {
      return (
        form.publicDomain !== savedForm.publicDomain ||
        form.baseUrl !== savedForm.baseUrl ||
        form.corsOrigins !== savedForm.corsOrigins ||
        form.swaggerEnabled !== savedForm.swaggerEnabled
      )
    }

    return (
      form.certPath !== savedForm.certPath ||
      form.keyPath !== savedForm.keyPath ||
      form.certbotEmail !== savedForm.certbotEmail
    )
  }, [currentSection, form, savedForm])

  function renderSectionActions() {
    return (
      <div className='flex flex-wrap gap-2 pt-4'>
        <Button onClick={() => setReloadConfirmOpen(true)} disabled={saving || !isCurrentSectionDirty}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
        <Button type='button' variant='outline' onClick={discardCurrentSection} disabled={saving || !isCurrentSectionDirty}>
          Discard
        </Button>
      </div>
    )
  }

  const navItems = useMemo(
    () => [
      { id: 'auth', title: 'Auth', icon: <Shield size={18} /> },
      { id: 'relay', title: 'Relay', icon: <Wrench size={18} /> },
      { id: 'web', title: 'Web', icon: <Globe size={18} /> },
      { id: 'tls', title: 'TLS', icon: <Bell size={18} /> },
    ],
    []
  )

  if (loading) {
    return <p className='text-sm text-muted-foreground'>Loading settings...</p>
  }

  if (!form) {
    return <p className='text-sm text-destructive'>Settings are unavailable.</p>
  }

  return (
    <section className='space-y-0.5'>
      <h1 className='text-2xl font-bold tracking-tight'>Settings: System</h1>
      <p className='text-muted-foreground'>Manage host runtime configuration from {configPath || 'config.toml'}.</p>
      <Separator className='my-4 lg:my-6' />

      {error ? <p className='mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'>{error}</p> : null}
      {message ? <p className='mb-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300'>{message}</p> : null}

      <div className='flex flex-1 flex-col space-y-2 overflow-hidden md:space-y-2 lg:flex-row lg:space-y-0 lg:space-x-12'>
        <aside className='top-0 lg:sticky lg:w-1/5'>
          <SidebarNav items={navItems} value={currentSection} onChange={(id) => switchSection(id as SettingsSection)} />
        </aside>

        <div className='flex w-full overflow-y-hidden p-1'>
          {currentSection === 'auth' ? (
            <ContentSection title='Auth' desc='Authentication and device approval requirements.'>
              <div>
                <div className='grid gap-3'>
                  <label className='flex items-center gap-2 text-sm'>
                    <Switch
                      checked={form.requireApprovedDevice}
                      onCheckedChange={(checked) =>
                        setForm((c) => (c ? { ...c, requireApprovedDevice: checked } : c))
                      }
                    />
                    Require approved device
                  </label>
                  <div className='grid gap-1'>
                    <span className='text-sm'>Session lifetime (seconds)</span>
                    <Input value={form.sessionLifetime} onChange={(e) => setForm((c) => (c ? { ...c, sessionLifetime: e.target.value } : c))} />
                  </div>
                </div>
                {renderSectionActions()}
              </div>
            </ContentSection>
          ) : null}

          {currentSection === 'relay' ? (
            <ContentSection title='Relay' desc='Ports, token lifetime and relay cookie behavior.'>
              <div>
                <div className='grid gap-3 md:grid-cols-2'>
                  <div className='grid gap-1'><span className='text-sm'>Port min</span><Input value={form.relayPortMin} onChange={(e) => setForm((c) => (c ? { ...c, relayPortMin: e.target.value } : c))} /></div>
                  <div className='grid gap-1'><span className='text-sm'>Port max</span><Input value={form.relayPortMax} onChange={(e) => setForm((c) => (c ? { ...c, relayPortMax: e.target.value } : c))} /></div>
                  <div className='grid gap-1'><span className='text-sm'>Token lifetime</span><Input value={form.relayTokenLifetime} onChange={(e) => setForm((c) => (c ? { ...c, relayTokenLifetime: e.target.value } : c))} /></div>
                  <div className='grid gap-1'><span className='text-sm'>Cookie lifetime</span><Input value={form.relayCookieLifetime} onChange={(e) => setForm((c) => (c ? { ...c, relayCookieLifetime: e.target.value } : c))} /></div>
                  <div className='grid gap-1 md:col-span-2'><span className='text-sm'>Cookie name</span><Input value={form.relayCookieName} onChange={(e) => setForm((c) => (c ? { ...c, relayCookieName: e.target.value } : c))} /></div>
                </div>
                {renderSectionActions()}
              </div>
            </ContentSection>
          ) : null}

          {currentSection === 'web' ? (
            <ContentSection title='Web' desc='Public URL, host exposure and API docs toggles.'>
              <div>
                <div className='grid gap-3 md:grid-cols-2'>
                  <div className='grid gap-1'><span className='text-sm'>Public domain</span><Input value={form.publicDomain} onChange={(e) => setForm((c) => (c ? { ...c, publicDomain: e.target.value } : c))} /></div>
                  <div className='grid gap-1'><span className='text-sm'>Base URL</span><Input value={form.baseUrl} onChange={(e) => setForm((c) => (c ? { ...c, baseUrl: e.target.value } : c))} /></div>
                  <div className='grid gap-1 md:col-span-2'><span className='text-sm'>CORS origins</span><Input value={form.corsOrigins} onChange={(e) => setForm((c) => (c ? { ...c, corsOrigins: e.target.value } : c))} /></div>
                  <label className='flex items-center gap-2 text-sm md:col-span-2'>
                    <Switch
                      checked={form.swaggerEnabled}
                      onCheckedChange={(checked) =>
                        setForm((c) => (c ? { ...c, swaggerEnabled: checked } : c))
                      }
                    />
                    Swagger enabled
                  </label>
                </div>
                {renderSectionActions()}
              </div>
            </ContentSection>
          ) : null}

          {currentSection === 'tls' ? (
            <ContentSection title='TLS' desc='Certificate and renewal-related paths and metadata.'>
              <div>
                <div className='grid gap-3'>
                  <div className='grid gap-1'><span className='text-sm'>TLS cert path</span><Input value={form.certPath} onChange={(e) => setForm((c) => (c ? { ...c, certPath: e.target.value } : c))} /></div>
                  <div className='grid gap-1'><span className='text-sm'>TLS key path</span><Input value={form.keyPath} onChange={(e) => setForm((c) => (c ? { ...c, keyPath: e.target.value } : c))} /></div>
                  <div className='grid gap-1'><span className='text-sm'>Certbot email</span><Input value={form.certbotEmail} onChange={(e) => setForm((c) => (c ? { ...c, certbotEmail: e.target.value } : c))} /></div>
                </div>
                {renderSectionActions()}
              </div>
            </ContentSection>
          ) : null}
        </div>
      </div>

      <Dialog open={reloadConfirmOpen} onOpenChange={setReloadConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save and reload web service?</DialogTitle>
            <DialogDescription>
              This will restart the web process and may temporarily interrupt your session/connection for a few seconds.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant='outline' onClick={() => setReloadConfirmOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                setReloadConfirmOpen(false)
                await saveCurrentSectionWithReload()
              }}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Continue'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
