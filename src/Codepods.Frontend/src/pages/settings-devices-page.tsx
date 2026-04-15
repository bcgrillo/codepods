import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { MoreHorizontal, Plus, RefreshCcw, Trash2 } from 'lucide-react'
import { type ColumnDef, SimpleDataTable } from '@/components/data-table/simple-data-table'
import { DataTableColumnHeader } from '@/components/data-table/column-header'
import { SelectDropdown } from '@/components/select-dropdown'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ApiError, apiRequest, type DeviceResponse, type UserResponse } from '@/lib/api'

type DeviceRow = DeviceResponse & {
  username: string
}

export function SettingsDevicesPage() {
  const [users, setUsers] = useState<UserResponse[]>([])
  const [selectedUser, setSelectedUser] = useState('')
  const [rows, setRows] = useState<DeviceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DeviceRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [deviceName, setDeviceName] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  async function loadUsers() {
    const response = await apiRequest<UserResponse[]>('/api/users')
    setUsers(response)
    if (!selectedUser && response.length > 0) {
      setSelectedUser(response[0].username)
      return response[0].username
    }
    return selectedUser
  }

  async function loadDevices(username: string) {
    if (!username) {
      setRows([])
      return
    }
    const response = await apiRequest<DeviceResponse[]>(`/api/devices/${encodeURIComponent(username)}`)
    setRows(response.map((row) => ({ ...row, username })))
  }

  async function load() {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const username = await loadUsers()
      if (username) {
        await loadDevices(username)
      } else {
        setRows([])
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load devices.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedUser) {
      return
    }
    setLoading(true)
    setError(null)
    void loadDevices(selectedUser)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Failed to load devices.'))
      .finally(() => setLoading(false))
  }, [selectedUser])

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) {
      return rows
    }
    return rows.filter((row) => {
      return (
        row.name.toLowerCase().includes(term) ||
        row.fingerprint.toLowerCase().includes(term) ||
        row.username.toLowerCase().includes(term)
      )
    })
  }, [rows, query])

  const columns: ColumnDef<DeviceRow>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Name' />,
      cell: ({ row }) => <span className='font-medium'>{row.original.name}</span>,
      meta: { className: 'w-[22%]' },
    },
    {
      accessorKey: 'fingerprint',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Fingerprint' />,
      cell: ({ row }) => <span className='font-mono text-xs text-muted-foreground'>{row.original.fingerprint}</span>,
      meta: { className: 'w-[40%]' },
    },
    {
      id: 'last_seen',
      accessorFn: (row) => row.last_seen_at ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Last seen' />,
      cell: ({ row }) => (
        <span className='text-muted-foreground'>
          {row.original.last_seen_at ? new Date(row.original.last_seen_at).toLocaleString() : '-'}
        </span>
      ),
      meta: { className: 'w-[20%]' },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className='text-right'>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size='icon-sm' variant='ghost' aria-label={`Actions for ${row.original.name}`}>
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
      await apiRequest(`/api/devices/${encodeURIComponent(deleteTarget.username)}`, {
        method: 'DELETE',
        body: { fingerprint: deleteTarget.fingerprint },
      })
      setDeleteTarget(null)
      await loadDevices(selectedUser)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete device.')
    } finally {
      setDeleting(false)
    }
  }

  async function onCreateDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreateError(null)
    if (!selectedUser) {
      setCreateError('Select a user first.')
      return
    }

    const name = deviceName.trim()
    if (!name) {
      setCreateError('Device name is required.')
      return
    }

    setCreating(true)
    try {
      const response = await apiRequest<{ device_id: string; fingerprint: string }>(
        `/api/devices/${encodeURIComponent(selectedUser)}`,
        {
          method: 'POST',
          body: {
            name,
            device_id: deviceId.trim() || null,
          },
        }
      )
      setDrawerOpen(false)
      setDeviceName('')
      setDeviceId('')
      setMessage(`Device created (device_id: ${response.device_id}).`)
      await loadDevices(selectedUser)
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create device.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className='flex flex-1 flex-col gap-4 sm:gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-2'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Settings: Devices</h1>
          <p className='text-muted-foreground'>List and revoke approved devices by user.</p>
        </div>
        <Button variant='outline' className='space-x-1' onClick={() => void load()} disabled={loading}>
          <span>Refresh</span>
          <RefreshCcw size={18} />
        </Button>
        <Button className='space-x-1' onClick={() => setDrawerOpen(true)} disabled={!selectedUser}>
          <span>Add device</span>
          <Plus size={18} />
        </Button>
      </div>

      <div className='w-full sm:w-[280px]'>
        <SelectDropdown
          value={selectedUser}
          onValueChange={setSelectedUser}
          placeholder='Select user'
          items={users.map((row) => ({ label: row.username, value: row.username }))}
        />
      </div>

      {loading ? <p className='text-sm text-muted-foreground'>Loading devices...</p> : null}
      {message ? (
        <p className='rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300'>
          {message}
        </p>
      ) : null}
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
          searchPlaceholder='Filter by name or fingerprint...'
          emptyText='No devices found.'
        />
      ) : null}

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => (!open ? setDeleteTarget(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete device</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `You are about to delete device "${deleteTarget.name}".`
                : 'You are about to delete this device.'}
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

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className='w-screen max-w-none sm:max-w-xl'>
          <SheetHeader className='text-left'>
            <SheetTitle>Add device</SheetTitle>
            <SheetDescription>
              Create an approved device for user "{selectedUser}".
            </SheetDescription>
          </SheetHeader>
          <form id='create-device-form' onSubmit={onCreateDevice} className='grid gap-4 px-4 py-3'>
            <div className='grid gap-2'>
              <label htmlFor='device-name' className='text-sm font-medium'>
                Device name
              </label>
              <Input
                id='device-name'
                value={deviceName}
                onChange={(event) => setDeviceName(event.target.value)}
                placeholder='My laptop'
              />
            </div>
            <div className='grid gap-2'>
              <label htmlFor='device-id' className='text-sm font-medium'>
                Device ID (optional)
              </label>
              <Input
                id='device-id'
                value={deviceId}
                onChange={(event) => setDeviceId(event.target.value)}
                placeholder='leave empty to auto-generate'
              />
            </div>
            {createError ? (
              <p className='rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
                {createError}
              </p>
            ) : null}
          </form>
          <SheetFooter className='flex-row justify-end'>
            <Button variant='outline' onClick={() => setDrawerOpen(false)}>
              Cancel
            </Button>
            <Button form='create-device-form' type='submit' disabled={creating}>
              {creating ? 'Creating...' : 'Create'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </section>
  )
}
