import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Bot, ExternalLink, Plus } from "lucide-react";
import { Cross2Icon } from "@radix-ui/react-icons";
import { useNavigate } from "react-router-dom";
import { SelectDropdown } from "@/components/select-dropdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useTheme } from "@/context/theme-provider";
import { upsertActiveSession } from "@/lib/active-sessions";
import { ApiError, apiRequest, type AgentResponse, type AgentTypeResponse, type RelayEnsureResponse } from "@/lib/api";

function toDataUri(mimeType?: string | null, base64?: string | null) {
  if (!base64) {
    return null
  }
  return `data:${mimeType || 'image/svg+xml'};base64,${base64}`
}

type AgentService = {
  id: string
  kind: string
  port: number
}

function parseAgentServices(agent: AgentResponse): AgentService[] {
  if (!agent.metadata || typeof agent.metadata !== "object") {
    return []
  }

  const payload = agent.metadata as Record<string, unknown>
  if (!Array.isArray(payload.services)) {
    return []
  }

  return payload.services
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null
      }
      const row = item as Record<string, unknown>
      const id = typeof row.id === "string" ? row.id.trim() : ""
      const kind = typeof row.kind === "string" ? row.kind.trim() : ""
      const rawPort = typeof row.port === "string" ? Number(row.port) : Number(row.port ?? NaN)
      if (!id || !kind || Number.isNaN(rawPort)) {
        return null
      }
      return {
        id,
        kind,
        port: rawPort,
      } satisfies AgentService
    })
    .filter((row): row is AgentService => row !== null)
}

export function AgentsPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<AgentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentTypes, setAgentTypes] = useState<AgentTypeResponse[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [agentType, setAgentType] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [openingSessionKey, setOpeningSessionKey] = useState<string | null>(null)
  const { resolvedTheme } = useTheme();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [agents, types] = await Promise.all([
        apiRequest<AgentResponse[]>("/api/agents"),
        apiRequest<AgentTypeResponse[]>("/api/agents/types"),
      ]);
      setRows(agents);
      setAgentTypes(types);
      if (types.length > 0 && !agentType) {
        setAgentType(types[0].name);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load agents.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      if (!active) return;
      await load();
    })();

    return () => {
      active = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreateAgent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await apiRequest<AgentResponse>("/api/agents", {
        method: "POST",
        body: {
          name: name.trim().length > 0 ? name.trim() : null,
          agent_type: agentType,
          metadata: null,
          restore: false,
        },
      });
      setName("");
      setDrawerOpen(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        setCreateError(err.message);
      } else {
        setCreateError("Failed to create agent.");
      }
    } finally {
      setCreating(false);
    }
  }

  function resolveTypeIcon(typeName: string) {
    const typeInfo = agentTypes.find((x) => x.name === typeName)
    return resolvedTheme === "dark"
      ? toDataUri(typeInfo?.icon_mime_type, typeInfo?.icon_dark_base64 ?? typeInfo?.icon_light_base64)
      : toDataUri(typeInfo?.icon_mime_type, typeInfo?.icon_light_base64 ?? typeInfo?.icon_dark_base64)
  }

  const filteredRows = rows.filter((agent) => {
    const term = query.trim().toLowerCase()
    if (!term) return true
    return (
      String(agent.id).includes(term) ||
      agent.name.toLowerCase().includes(term) ||
      agent.agent_type.toLowerCase().includes(term) ||
      String(agent.status ?? '').toLowerCase().includes(term) ||
      String(agent.runtime_status ?? '').toLowerCase().includes(term)
    )
  })

  const servicesByAgent = useMemo(() => {
    const map: Record<number, AgentService[]> = {}
    for (const row of rows) {
      const services = parseAgentServices(row)
      map[row.id] = services.length > 0 ? services : [{ id: "terminal", kind: "ttyd", port: 7681 }]
    }
    return map
  }, [rows])

  async function openSession(agent: AgentResponse, service: AgentService) {
    const actionKey = `${agent.id}:${service.id}`
    setOpeningSessionKey(actionKey)
    try {
      const ensured = await apiRequest<RelayEnsureResponse>("/api/relays/ensure", {
        method: "POST",
        body: {
          agent_id: agent.id,
          service_kind: service.kind,
        },
      })
      const sessionId = `${ensured.relay.id}:${service.id}`
      upsertActiveSession({
        sessionId,
        relayId: ensured.relay.id,
        agentId: agent.id,
        agentName: agent.name,
        serviceKind: service.id,
      })
      navigate(`/sessions/${encodeURIComponent(sessionId)}`)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError("Failed to open agent session.")
      }
    } finally {
      setOpeningSessionKey(null)
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agents</h1>
          <p className="text-muted-foreground">Manage your agents and active services.</p>
        </div>
        <Button className="space-x-1" onClick={() => setDrawerOpen(true)}>
          <span>Create</span>
          <Plus size={18} />
        </Button>
      </div>

      {loading ? <p className="mt-5 text-sm text-muted-foreground">Loading agents...</p> : null}
      {error ? (
        <p className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {!loading && !error ? (
        <>
          <div className='mt-4 flex items-center justify-between'>
            <div className='flex flex-1 flex-col-reverse items-start gap-y-2 sm:flex-row sm:items-center sm:space-x-2'>
              <div className='relative w-full sm:w-[150px] lg:w-[250px]'>
                <Input
                  placeholder='Filter by name, type, status or ID...'
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className='h-8 w-full pe-8'
                />
                {query.trim().length > 0 ? (
                  <button
                    type='button'
                    aria-label='Clear filter'
                    onClick={() => setQuery('')}
                    className='text-muted-foreground hover:text-foreground absolute inset-y-0 end-2 flex items-center'
                  >
                    <Cross2Icon className='h-4 w-4' />
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredRows.map((agent) => {
            const iconUri = resolveTypeIcon(agent.agent_type)
            return (
              <article
                key={agent.id}
                className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
              >
              <div className='mb-6 flex items-center justify-between'>
                <div className='flex size-10 items-center justify-center rounded-lg bg-muted p-2'>
                  {iconUri ? <img src={iconUri} alt='' className='size-6 rounded-sm object-contain' /> : <Bot className='size-5 text-muted-foreground' />}
                </div>
                <Button variant='outline' size='sm' className='pointer-events-none capitalize'>
                  {agent.agent_type}
                </Button>
              </div>
              <div className='mb-2'>
                <h2 className="truncate text-lg font-medium">
                  {agent.name}
                </h2>
              </div>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>{agent.status}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Runtime</dt>
                  <dd>{agent.runtime_status ?? "-"}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                {(servicesByAgent[agent.id] ?? []).map((service) => {
                  const actionKey = `${agent.id}:${service.id}`
                  return (
                    <Button
                      key={actionKey}
                      variant="outline"
                      size="sm"
                      onClick={() => void openSession(agent, service)}
                      disabled={openingSessionKey === actionKey}
                    >
                      <ExternalLink size={14} />
                      {openingSessionKey === actionKey ? "Opening..." : `Open ${service.id}`}
                    </Button>
                  )
                })}
              </div>
              </article>
            )
          })}
        </div>
        </>
      ) : null}

      {!loading && !error && filteredRows.length === 0 ? (
        <p className="mt-5 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          No agents found.
        </p>
      ) : null}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-screen max-w-none sm:max-w-xl">
          <SheetHeader className="text-left">
            <SheetTitle>Create Agent</SheetTitle>
            <SheetDescription>
              Create a new agent with the same flow as CLI/API.
            </SheetDescription>
          </SheetHeader>

          <form id="agents-create-form" onSubmit={onCreateAgent} className="grid gap-5 px-4 py-3">
            <div className="grid gap-2">
              <label htmlFor="agent-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="agent-name"
                placeholder="Leave empty to use next-name"
                value={name}
                onChange={(ev) => setName(ev.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="agent-type" className="text-sm font-medium">
                Agent Type
              </label>
              <div id="agent-type">
                <SelectDropdown
                value={agentType}
                onValueChange={(value) => setAgentType(value)}
                placeholder="Select agent type"
                items={agentTypes.map((type) => ({ label: type.name, value: type.name }))}
              />
              </div>
              {agentType && agentTypes.find((x) => x.name === agentType)?.description ? (
                <p className="text-xs text-muted-foreground">
                  {agentTypes.find((x) => x.name === agentType)?.description}
                </p>
              ) : null}
            </div>

            {createError ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {createError}
              </p>
            ) : null}
          </form>

          <SheetFooter className='flex-row justify-end'>
            <Button variant="outline" onClick={() => setDrawerOpen(false)}>
              Cancel
            </Button>
            <Button form="agents-create-form" type="submit" disabled={creating || !agentType}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </section>
  );
}
