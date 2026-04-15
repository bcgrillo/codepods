import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Download, Eye, EyeOff, MoreHorizontal, Pencil, Plus, RefreshCcw, Trash2 } from 'lucide-react'
import { type ColumnDef, SimpleDataTable } from '@/components/data-table/simple-data-table'
import { DataTableColumnHeader } from '@/components/data-table/column-header'
import { SelectDropdown } from '@/components/select-dropdown'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { ApiError, apiRequest, type CodepodResponse, type VariableResponse } from '@/lib/api'

type VariableRow = {
  id: number
  name: string
  value: string
  isSecret: boolean
  isValueRedacted: boolean
  codepodId: number | null
  createdAt: string | null
  updatedAt: string | null
}

type VariableMutateForm = {
  name: string
  value: string
  isSecret: boolean
  codepodId: string
}

const emptyForm: VariableMutateForm = {
  name: '',
  value: '',
  isSecret: false,
  codepodId: '__global__',
}

function normalizeVariable(raw: VariableResponse): VariableRow {
  const candidate = raw as Record<string, unknown>
  const id = Number(candidate.id)
  const name = String(candidate.name ?? '')
  const value = String(candidate.value ?? '')
  const isSecret = Boolean(candidate.isSecret)
  const isValueRedacted = Boolean(candidate.isValueRedacted ?? isSecret)
  const codepodRaw = candidate.codepodId

  return {
    id,
    name,
    value,
    isSecret,
    isValueRedacted,
    codepodId: typeof codepodRaw === 'number' ? codepodRaw : null,
    createdAt: typeof candidate.createdAtUtc === 'string' ? candidate.createdAtUtc : null,
    updatedAt: typeof candidate.updatedAtUtc === 'string' ? candidate.updatedAtUtc : null,
  }
}

export function VariablesPage() {
  const [rows, setRows] = useState<VariableRow[]>([])
  const [codepods, setCodepods] = useState<CodepodResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingRow, setEditingRow] = useState<VariableRow | null>(null)
  const [form, setForm] = useState<VariableMutateForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [clearSecretConfirmOpen, setClearSecretConfirmOpen] = useState(false)
  const [showValue, setShowValue] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<VariableRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkConfirm, setBulkConfirm] = useState('')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [variablesRes, codepodsRes] = await Promise.all([
        apiRequest<VariableResponse[]>('/api/variables'),
        apiRequest<CodepodResponse[]>('/api/codepods'),
      ])
      setRows(variablesRes.map(normalizeVariable))
      setCodepods(codepodsRes)
      setSelectedIds([])
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to load variables.')
      }
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
        row.name.toLowerCase().includes(term) ||
        row.value.toLowerCase().includes(term)
      )
    })
  }, [rows, query])

  const allVisibleSelected =
    filteredRows.length > 0 && filteredRows.every((row) => selectedIds.includes(row.id))
  const someVisibleSelected =
    filteredRows.some((row) => selectedIds.includes(row.id)) && !allVisibleSelected

  const columns: ColumnDef<VariableRow>[] = [
    {
      id: 'select',
      header: () => (
        <Checkbox
          checked={allVisibleSelected || (someVisibleSelected && 'indeterminate')}
          onCheckedChange={(value) => toggleSelectAll(!!value)}
          aria-label='Select all'
          className='translate-y-[2px]'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={selectedIds.includes(row.original.id)}
          onCheckedChange={(value) => toggleRow(row.original.id, !!value)}
          aria-label={`Select variable ${row.original.name}`}
          className='translate-y-[2px]'
        />
      ),
      enableSorting: false,
      enableHiding: false,
      meta: { className: 'w-[6%]' },
    },
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Name' />,
      cell: ({ row }) => <div className='truncate font-medium'>{row.original.name}</div>,
      meta: { className: 'w-[22%]' },
    },
    {
      id: 'value',
      accessorFn: (row) => (row.isValueRedacted ? 'zzzz' : row.value),
      header: ({ column }) => <DataTableColumnHeader column={column} title='Value' />,
      cell: ({ row }) => (
        <span className='line-clamp-2 break-all text-muted-foreground'>
          {(row.original.isValueRedacted ? '••••••••••' : row.original.value) || '-'}
        </span>
      ),
      meta: { className: 'w-[30%]' },
    },
    {
      id: 'scope',
      accessorFn: (row) => codepods.find((entry) => entry.id === row.codepodId)?.name ?? 'Global',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Scope' />,
      cell: ({ row }) => codepods.find((entry) => entry.id === row.original.codepodId)?.name ?? 'Global',
      meta: { className: 'w-[16%]' },
    },
    {
      id: 'secret',
      accessorFn: (row) => (row.isSecret ? 1 : 0),
      header: ({ column }) => <DataTableColumnHeader column={column} title='Secret' />,
      cell: ({ row }) => (
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${
            row.original.isSecret
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
              : 'border-border bg-muted text-muted-foreground'
          }`}
        >
          {row.original.isSecret ? 'Secret' : 'Plain'}
        </span>
      ),
      meta: { className: 'w-[10%]' },
    },
    {
      id: 'updated',
      accessorFn: (row) => row.updatedAt ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Updated' />,
      cell: ({ row }) => (
        <span className='text-muted-foreground'>
          {row.original.updatedAt ? new Date(row.original.updatedAt).toLocaleString() : '-'}
        </span>
      ),
      meta: { className: 'w-[12%]' },
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
            <DropdownMenuContent align='end' className='w-44'>
              {renderVariableContextMenuItems(row.original)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      meta: { className: 'w-[4%]' },
    },
  ]

  function renderVariableContextMenuItems(row: VariableRow) {
    return (
      <>
        <DropdownMenuItem onClick={() => openUpdateDrawer(row)} className='gap-2'>
          <Pencil size={14} />
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant='destructive'
          onClick={() => setDeleteTarget(row)}
          className='gap-2'
        >
          <Trash2 size={14} />
          Delete
        </DropdownMenuItem>
      </>
    )
  }

  function toggleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedIds(Array.from(new Set([...selectedIds, ...filteredRows.map((row) => row.id)])))
      return
    }

    const visible = new Set(filteredRows.map((row) => row.id))
    setSelectedIds(selectedIds.filter((id) => !visible.has(id)))
  }

  function toggleRow(id: number, checked: boolean) {
    if (checked) {
      setSelectedIds((current) => (current.includes(id) ? current : [...current, id]))
      return
    }

    setSelectedIds((current) => current.filter((value) => value !== id))
  }

  function openCreateDrawer() {
    setEditingRow(null)
    setSaveError(null)
    setForm(emptyForm)
    setShowValue(false)
    setDrawerOpen(true)
  }

  function openUpdateDrawer(row: VariableRow) {
    setEditingRow(row)
    setSaveError(null)
    setForm({
      name: row.name,
      value: row.isSecret ? '' : row.value,
      isSecret: row.isSecret,
      codepodId: row.codepodId === null ? '__global__' : String(row.codepodId),
    })
    setShowValue(false)
    setDrawerOpen(true)
  }

  async function onSubmitVariable(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    await persistVariable(false)
  }

  async function persistVariable(forceClearSecretConfirm: boolean) {
    setSaveError(null)

    const name = form.name.trim()
    if (!name) {
      setSaveError('Name is required.')
      return
    }

    const isSecretToPlainWithEmptyValue =
      Boolean(editingRow) &&
      Boolean(editingRow?.isSecret) &&
      !form.isSecret &&
      form.value.trim().length === 0

    if (isSecretToPlainWithEmptyValue && !forceClearSecretConfirm) {
      setClearSecretConfirmOpen(true)
      return
    }

    setSaving(true)
    try {
      if (editingRow) {
        const includeValue =
          form.value.length > 0 ||
          (!editingRow.isSecret && form.value !== editingRow.value)

        const body: {
          name: string
          is_secret: boolean
          value?: string
        } = {
          name,
          is_secret: form.isSecret,
        }
        if (includeValue) {
          body.value = form.value
        }

        await apiRequest<VariableResponse>(`/api/variables/${editingRow.id}`, {
          method: 'PUT',
          body,
        })
      } else {
        await apiRequest<VariableResponse>('/api/variables', {
          method: 'POST',
          body: {
            name,
            value: form.value,
            is_secret: form.isSecret,
            codepod_id: form.codepodId === '__global__' ? null : Number(form.codepodId),
          },
        })
      }

      setClearSecretConfirmOpen(false)
      setDrawerOpen(false)
      await load()
    } catch (err) {
      if (err instanceof ApiError) {
        setSaveError(err.message)
      } else {
        setSaveError('Failed to save variable.')
      }
    } finally {
      setSaving(false)
    }
  }

  async function onDeleteOne() {
    if (!deleteTarget) {
      return
    }

    setDeleting(true)
    try {
      await apiRequest(`/api/variables/${deleteTarget.id}`, { method: 'DELETE' })
      setDeleteTarget(null)
      await load()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to delete variable.')
      }
    } finally {
      setDeleting(false)
    }
  }

  async function onDeleteMany() {
    const ids = [...selectedIds]
    if (ids.length === 0 || bulkConfirm.trim() !== 'DELETE') {
      return
    }

    setDeleting(true)
    setError(null)
    try {
      await Promise.all(ids.map((id) => apiRequest(`/api/variables/${id}`, { method: 'DELETE' })))
      setBulkDeleteOpen(false)
      setBulkConfirm('')
      await load()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to delete selected variables.')
      }
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className='flex flex-1 flex-col gap-4 sm:gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-2'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Variables</h1>
          <p className='text-muted-foreground'>Manage shared and codepod-scoped runtime variables.</p>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' className='space-x-1' onClick={() => void load()} disabled={loading}>
            <span>Refresh</span>
            <RefreshCcw size={18} />
          </Button>
          <Button variant='outline' className='space-x-1' disabled>
            <span>Import</span>
            <Download size={18} />
          </Button>
          <Button className='space-x-1' onClick={openCreateDrawer}>
            <span>Create</span>
            <Plus size={18} />
          </Button>
        </div>
      </div>

      {loading ? <p className='text-sm text-muted-foreground'>Loading variables...</p> : null}
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
          searchPlaceholder='Filter by name or value...'
          emptyText='No variables found.'
          renderContextMenuItems={renderVariableContextMenuItems}
          rightActions={
            selectedIds.length > 0 ? (
              <Button size='sm' variant='destructive' onClick={() => setBulkDeleteOpen(true)}>
                Delete selected ({selectedIds.length})
              </Button>
            ) : null
          }
        />
      ) : null}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className='w-screen max-w-none sm:max-w-xl'>
          <SheetHeader className='text-left'>
            <SheetTitle>{editingRow ? 'Update Variable' : 'Create Variable'}</SheetTitle>
            <SheetDescription>
              {editingRow
                ? 'Update variable name, value, and secret mode.'
                : 'Create a new runtime variable for global or codepod scope.'}
            </SheetDescription>
          </SheetHeader>

          <form id='variables-form' onSubmit={onSubmitVariable} className='grid gap-5 px-4 py-3'>
            <div className='grid gap-2'>
              <label htmlFor='variable-name' className='text-sm font-medium'>
                Name
              </label>
              <Input
                id='variable-name'
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder='OPENAI_API_KEY'
              />
            </div>

            <div className='grid gap-2'>
              <label htmlFor='variable-value' className='text-sm font-medium'>
                Value
              </label>
              <div className='relative'>
                <Input
                  id='variable-value'
                  type={!showValue && form.isSecret ? 'password' : 'text'}
                  value={form.value}
                  onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))}
                  placeholder={
                    editingRow?.isSecret
                      ? 'Write a new value to rotate (leave empty to keep current)'
                      : 'Value'
                  }
                  className={form.isSecret ? 'pe-10' : undefined}
                />
                {form.isSecret ? (
                  <button
                    type='button'
                    aria-label={showValue ? 'Hide value' : 'Show value'}
                    onClick={() => setShowValue((current) => !current)}
                    className='text-muted-foreground hover:text-foreground absolute inset-y-0 end-2 flex items-center'
                  >
                    {showValue ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                ) : null}
              </div>
            </div>
            {editingRow?.isSecret ? (
              <p className='text-xs text-muted-foreground'>
                Current secret value is never returned by the API. Leave empty to keep it unchanged.
              </p>
            ) : null}
            {editingRow?.isSecret && !form.isSecret && form.value.trim().length === 0 ? (
              <p className='rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300'>
                If you save with Secret disabled and an empty value, the previous secret will be permanently cleared.
              </p>
            ) : null}

            <label className='flex items-center gap-2 text-sm'>
              <Switch
                checked={form.isSecret}
                onCheckedChange={(checked) => setForm((current) => ({ ...current, isSecret: checked }))}
              />
              Secret
            </label>

            {!editingRow ? (
              <div className='grid gap-2'>
                <label htmlFor='variable-codepod' className='text-sm font-medium'>
                  Scope
                </label>
                <div id='variable-codepod'>
                  <SelectDropdown
                  value={form.codepodId}
                  onValueChange={(value) => setForm((current) => ({ ...current, codepodId: value }))}
                  placeholder='Global'
                  items={[
                    { label: 'Global', value: '__global__' },
                    ...codepods.map((codepod) => ({ label: codepod.name, value: String(codepod.id) })),
                  ]}
                />
                </div>
              </div>
            ) : (
              <p className='text-xs text-muted-foreground'>
                Scope changes are disabled on update in current API contract.
              </p>
            )}

            {saveError ? (
              <p className='rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
                {saveError}
              </p>
            ) : null}
          </form>

          <SheetFooter className='flex-row justify-end'>
            <Button variant='outline' onClick={() => setDrawerOpen(false)}>
              Cancel
            </Button>
            <Button form='variables-form' type='submit' disabled={saving}>
              {saving ? 'Saving...' : editingRow ? 'Save changes' : 'Create'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => (!open ? setDeleteTarget(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete variable</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `You are about to delete "${deleteTarget.name}". This action cannot be undone.`
                : 'You are about to delete this variable.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant='outline' onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant='destructive' onClick={() => void onDeleteOne()} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete selected variables</DialogTitle>
            <DialogDescription>
              This removes {selectedIds.length} selected variable{selectedIds.length === 1 ? '' : 's'}. Type DELETE to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={bulkConfirm}
            onChange={(event) => setBulkConfirm(event.target.value)}
            placeholder='Type DELETE'
          />
          <DialogFooter>
            <Button variant='outline' onClick={() => setBulkDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant='destructive'
              onClick={() => void onDeleteMany()}
              disabled={deleting || bulkConfirm.trim() !== 'DELETE' || selectedIds.length === 0}
            >
              {deleting ? 'Deleting...' : 'Delete selected'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={clearSecretConfirmOpen} onOpenChange={setClearSecretConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear previous secret value?</DialogTitle>
            <DialogDescription>
              You are disabling Secret and saving with an empty value. The previous secret will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant='outline' onClick={() => setClearSecretConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant='destructive' onClick={() => void persistVariable(true)} disabled={saving}>
              {saving ? 'Saving...' : 'Continue'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
