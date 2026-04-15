import { useEffect, useMemo, useState } from 'react'
import { MoreHorizontal, RefreshCcw, Trash2 } from 'lucide-react'
import { type ColumnDef, SimpleDataTable } from '@/components/data-table/simple-data-table'
import { DataTableColumnHeader } from '@/components/data-table/column-header'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ApiError, apiRequest, type RelayResponse } from '@/lib/api'

export function SettingsRelaysPage() {
  const [rows, setRows] = useState<RelayResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<RelayResponse | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const response = await apiRequest<RelayResponse[]>('/api/relays')
      setRows(response.filter((row) => row.enabled))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load relays.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) {
      return rows
    }
    return rows.filter((row) => {
      return (
        String(row.id).includes(term) ||
        row.agent_name.toLowerCase().includes(term) ||
        row.service_kind.toLowerCase().includes(term) ||
        String(row.relay_port).includes(term)
      )
    })
  }, [rows, query])

  const columns: ColumnDef<RelayResponse>[] = [
    {
      accessorKey: 'agent_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Agent' />,
      cell: ({ row }) => <span className='font-medium'>{row.original.agent_name}</span>,
      meta: { className: 'w-[22%]' },
    },
    {
      accessorKey: 'service_kind',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Service' />,
      cell: ({ row }) => row.original.service_kind,
      meta: { className: 'w-[18%]' },
    },
    {
      accessorKey: 'target_port',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Target port' />,
      cell: ({ row }) => row.original.target_port,
      meta: { className: 'w-[16%]' },
    },
    {
      accessorKey: 'relay_port',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Relay port' />,
      cell: ({ row }) => row.original.relay_port,
      meta: { className: 'w-[16%]' },
    },
    {
      accessorKey: 'id',
      header: ({ column }) => <DataTableColumnHeader column={column} title='ID' />,
      cell: ({ row }) => <span className='text-muted-foreground'>{row.original.id}</span>,
      meta: { className: 'w-[12%]' },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className='text-right'>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size='icon-sm' variant='ghost' aria-label={`Actions for relay ${row.original.id}`}>
                <MoreHorizontal size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem
                variant='destructive'
                onClick={() => setDeleteTarget(row.original)}
                className='gap-2'
              >
                <Trash2 size={14} />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      meta: { className: 'w-[6%]' },
    },
  ]

  async function onDelete() {
    if (!deleteTarget) {
      return
    }
    setDeleting(true)
    try {
      await apiRequest(`/api/relays/${deleteTarget.id}`, { method: 'DELETE' })
      setDeleteTarget(null)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete relay.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className='flex flex-1 flex-col gap-4 sm:gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-2'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Settings: Relays</h1>
          <p className='text-muted-foreground'>Inspect active relays and disable them.</p>
        </div>
        <Button variant='outline' className='space-x-1' onClick={() => void load()} disabled={loading}>
          <span>Refresh</span>
          <RefreshCcw size={18} />
        </Button>
      </div>

      {loading ? <p className='text-sm text-muted-foreground'>Loading relays...</p> : null}
      {error ? (
        <p className='rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
          {error}
        </p>
      ) : null}

      {!loading ? (
        <SimpleDataTable
          rows={filteredRows}
          columns={columns}
          getRowKey={(row) => row.id}
          searchValue={query}
          onSearchChange={setQuery}
          searchPlaceholder='Filter by agent, service or port...'
          emptyText='No relays found.'
        />
      ) : null}

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => (!open ? setDeleteTarget(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete relay</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `You are about to disable relay #${deleteTarget.id} (${deleteTarget.agent_name}/${deleteTarget.service_kind}).`
                : 'You are about to disable this relay.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant='outline' onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant='destructive' onClick={() => void onDelete()} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
