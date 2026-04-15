import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { MoreHorizontal, Plus, RefreshCcw, Trash2 } from 'lucide-react'
import { type ColumnDef, SimpleDataTable } from '@/components/data-table/simple-data-table'
import { DataTableColumnHeader } from '@/components/data-table/column-header'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { ApiError, apiRequest, type UserResponse } from '@/lib/api'

export function SettingsUsersPage() {
  const [rows, setRows] = useState<UserResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<UserResponse | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [createUsername, setCreateUsername] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createSuperadmin, setCreateSuperadmin] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const response = await apiRequest<UserResponse[]>('/api/users')
      setRows(response)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load users.')
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
        row.username.toLowerCase().includes(term) ||
        String(row.id).includes(term) ||
        (row.is_superadmin ? 'superadmin' : 'user').includes(term)
      )
    })
  }, [rows, query])

  const columns: ColumnDef<UserResponse>[] = [
    {
      accessorKey: 'username',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Username' />,
      cell: ({ row }) => <span className='font-medium'>{row.original.username}</span>,
      meta: { className: 'w-[32%]' },
    },
    {
      id: 'role',
      accessorFn: (row) => (row.is_superadmin ? 'superadmin' : 'user'),
      header: ({ column }) => <DataTableColumnHeader column={column} title='Role' />,
      cell: ({ row }) => (row.original.is_superadmin ? 'Superadmin' : 'User'),
      meta: { className: 'w-[16%]' },
    },
    {
      id: 'active',
      accessorFn: (row) => (row.is_active ? 1 : 0),
      header: ({ column }) => <DataTableColumnHeader column={column} title='Active' />,
      cell: ({ row }) => (row.original.is_active ? 'Yes' : 'No'),
      meta: { className: 'w-[12%]' },
    },
    {
      id: 'updated',
      accessorFn: (row) => row.updated_at ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Updated' />,
      cell: ({ row }) => (
        <span className='text-muted-foreground'>
          {row.original.updated_at ? new Date(row.original.updated_at).toLocaleString() : '-'}
        </span>
      ),
      meta: { className: 'w-[34%]' },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className='text-right'>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size='icon-sm' variant='ghost' aria-label={`Actions for ${row.original.username}`}>
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
      await apiRequest(`/api/users/${encodeURIComponent(deleteTarget.username)}`, { method: 'DELETE' })
      setDeleteTarget(null)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete user.')
    } finally {
      setDeleting(false)
    }
  }

  async function onCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreateError(null)
    const username = createUsername.trim()
    if (!username) {
      setCreateError('Username is required.')
      return
    }
    if (!createPassword) {
      setCreateError('Password is required.')
      return
    }

    setCreating(true)
    try {
      await apiRequest('/api/users', {
        method: 'POST',
        body: {
          username,
          password: createPassword,
          superadmin: createSuperadmin,
        },
      })
      setDrawerOpen(false)
      setCreateUsername('')
      setCreatePassword('')
      setCreateSuperadmin(false)
      setMessage(`User "${username}" created.`)
      await load()
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create user.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className='flex flex-1 flex-col gap-4 sm:gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-2'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Settings: Users</h1>
          <p className='text-muted-foreground'>List and remove users.</p>
        </div>
        <Button variant='outline' className='space-x-1' onClick={() => void load()} disabled={loading}>
          <span>Refresh</span>
          <RefreshCcw size={18} />
        </Button>
        <Button className='space-x-1' onClick={() => setDrawerOpen(true)}>
          <span>Add user</span>
          <Plus size={18} />
        </Button>
      </div>

      {loading ? <p className='text-sm text-muted-foreground'>Loading users...</p> : null}
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
          searchPlaceholder='Filter by username or role...'
          emptyText='No users found.'
        />
      ) : null}

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => (!open ? setDeleteTarget(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete user</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `You are about to delete "${deleteTarget.username}". This action cannot be undone.`
                : 'You are about to delete this user.'}
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
            <SheetTitle>Create user</SheetTitle>
            <SheetDescription>Add a new user account for web/API access.</SheetDescription>
          </SheetHeader>
          <form id='create-user-form' onSubmit={onCreateUser} className='grid gap-4 px-4 py-3'>
            <div className='grid gap-2'>
              <label htmlFor='create-user-username' className='text-sm font-medium'>
                Username
              </label>
              <Input
                id='create-user-username'
                value={createUsername}
                onChange={(event) => setCreateUsername(event.target.value)}
                placeholder='new-user'
              />
            </div>
            <div className='grid gap-2'>
              <label htmlFor='create-user-password' className='text-sm font-medium'>
                Password
              </label>
              <Input
                id='create-user-password'
                type='password'
                value={createPassword}
                onChange={(event) => setCreatePassword(event.target.value)}
                placeholder='Password'
              />
            </div>
            <label className='flex items-center gap-2 text-sm'>
              <Switch checked={createSuperadmin} onCheckedChange={setCreateSuperadmin} />
              Superadmin
            </label>
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
            <Button form='create-user-form' type='submit' disabled={creating}>
              {creating ? 'Creating...' : 'Create'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </section>
  )
}
