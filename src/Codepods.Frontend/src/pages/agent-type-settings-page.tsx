import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from 'react'
import { Download, MoreHorizontal, Pencil, Plus, RefreshCcw, Trash2, Upload } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { type ColumnDef, SimpleDataTable } from '@/components/data-table/simple-data-table'
import { DataTableColumnHeader } from '@/components/data-table/column-header'
import { Button } from '@/components/ui/button'
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
import {
  ApiError,
  apiRequest,
  type TemplateFileContentResponse,
  type TemplateFileDownloadResponse,
  type TemplateFileListResponse,
} from '@/lib/api'

type TemplateFileRow = {
  path: string
  size: number
  updatedAt: string | null
  isTextEditable: boolean
}

type DrawerMode = 'create' | 'edit' | 'rename'

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

function normalizePath(path: string) {
  return path.trim().replaceAll('\\', '/')
}

function encodeFilePath(path: string) {
  return normalizePath(path)
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function buildLineNumbers(content: string) {
  const lines = Math.max(1, content.split('\n').length)
  return Array.from({ length: lines }, (_, i) => i + 1).join('\n')
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const value = String(reader.result ?? '')
      const comma = value.indexOf(',')
      resolve(comma >= 0 ? value.slice(comma + 1) : value)
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function base64ToBytes(base64: string) {
  const decoded = atob(base64)
  const bytes = new Uint8Array(decoded.length)
  for (let i = 0; i < decoded.length; i += 1) {
    bytes[i] = decoded.charCodeAt(i)
  }
  return bytes
}

export function AgentTypeSettingsPage() {
  const params = useParams<{ templateName: string }>()
  const templateName = params.templateName ?? 'unknown'
  const displayName = useMemo(() => titleize(templateName), [templateName])

  const [rows, setRows] = useState<TemplateFileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('create')
  const [activePath, setActivePath] = useState<string | null>(null)
  const [pathInput, setPathInput] = useState('')
  const [renameInput, setRenameInput] = useState('')
  const [contentInput, setContentInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isBinaryFile, setIsBinaryFile] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<TemplateFileRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [uploading, setUploading] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await apiRequest<TemplateFileListResponse>(`/api/templates/${encodeURIComponent(templateName)}/files`)
      const items = (res.items ?? []).map((item) => ({
        path: String(item.path ?? ''),
        size: Number(item.size ?? 0),
        updatedAt: item.updated_at ? String(item.updated_at) : null,
        isTextEditable: Boolean(item.is_text_editable),
      }))
      setRows(items)
    } catch (err) {
      setRows([])
      setError(err instanceof ApiError ? err.message : 'Failed to load template files.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [templateName])

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) {
      return rows
    }
    return rows.filter((row) => row.path.toLowerCase().includes(term))
  }, [rows, query])

  const columns: ColumnDef<TemplateFileRow>[] = [
    {
      accessorKey: 'path',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Path' />,
      cell: ({ row }) => <div className='font-mono text-[13px]'>{row.original.path}</div>,
      meta: { className: 'w-[46%]' },
    },
    {
      id: 'type',
      accessorFn: (row) => (row.isTextEditable ? 'text' : 'binary'),
      header: ({ column }) => <DataTableColumnHeader column={column} title='Type' />,
      cell: ({ row }) => (
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${
            row.original.isTextEditable
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
          }`}
        >
          {row.original.isTextEditable ? 'Text' : 'Binary'}
        </span>
      ),
      meta: { className: 'w-[12%]' },
    },
    {
      accessorKey: 'size',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Size' />,
      cell: ({ row }) => <span className='text-muted-foreground'>{row.original.size.toLocaleString()} B</span>,
      meta: { className: 'w-[12%]' },
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
      meta: { className: 'w-[24%]' },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className='text-right'>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size='icon-sm' variant='ghost' aria-label={`Actions for ${row.original.path}`}>
                <MoreHorizontal size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-44'>
              {renderTemplateContextMenuItems(row.original)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      meta: { className: 'w-[6%]' },
    },
  ]

  function renderTemplateContextMenuItems(row: TemplateFileRow) {
    return (
      <>
        <DropdownMenuItem
          onClick={() => void openEditDrawer(row)}
          disabled={!row.isTextEditable}
          className='gap-2'
        >
          <Pencil size={14} />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openRenameDrawer(row)} className='gap-2'>
          <Pencil size={14} />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void onDownloadFile(row)} className='gap-2'>
          <Download size={14} />
          Download
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

  function openCreateDrawer() {
    setDrawerMode('create')
    setActivePath(null)
    setPathInput('')
    setRenameInput('')
    setContentInput('')
    setSaveError(null)
    setIsBinaryFile(false)
    setDrawerOpen(true)
  }

  async function openEditDrawer(row: TemplateFileRow) {
    setDrawerMode('edit')
    setActivePath(row.path)
    setPathInput(row.path)
    setRenameInput('')
    setSaveError(null)
    setContentInput('')
    setIsBinaryFile(!row.isTextEditable)
    setDrawerOpen(true)

    if (!row.isTextEditable) {
      return
    }

    try {
      const encodedPath = encodeFilePath(row.path)
      const response = await apiRequest<TemplateFileContentResponse>(
        `/api/templates/${encodeURIComponent(templateName)}/files/${encodedPath}`
      )
      setContentInput(response.content ?? '')
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to load file content.')
    }
  }

  function openRenameDrawer(row: TemplateFileRow) {
    setDrawerMode('rename')
    setActivePath(row.path)
    setPathInput(row.path)
    setRenameInput(row.path)
    setContentInput('')
    setSaveError(null)
    setIsBinaryFile(false)
    setDrawerOpen(true)
  }

  async function onSubmitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaveError(null)

    const normalizedPath = normalizePath(pathInput)
    const normalizedRename = normalizePath(renameInput)

    if (drawerMode === 'create' && !normalizedPath) {
      setSaveError('Path is required.')
      return
    }
    if (drawerMode === 'rename' && !normalizedRename) {
      setSaveError('New path is required.')
      return
    }
    if (drawerMode === 'edit' && isBinaryFile) {
      setSaveError('Binary files cannot be edited in text mode.')
      return
    }

    setSaving(true)
    try {
      if (drawerMode === 'create') {
        await apiRequest(`/api/templates/${encodeURIComponent(templateName)}/files`, {
          method: 'POST',
          body: { path: normalizedPath, content: contentInput },
        })
      } else if (drawerMode === 'edit' && activePath) {
        const encodedPath = encodeFilePath(activePath)
        await apiRequest(`/api/templates/${encodeURIComponent(templateName)}/files/${encodedPath}`, {
          method: 'PUT',
          body: { content: contentInput },
        })
      } else if (drawerMode === 'rename' && activePath) {
        await apiRequest(`/api/templates/${encodeURIComponent(templateName)}/files/rename`, {
          method: 'POST',
          body: { from_path: activePath, to_path: normalizedRename },
        })
      }

      setDrawerOpen(false)
      await load()
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save file changes.')
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
      const encodedPath = encodeFilePath(deleteTarget.path)
      await apiRequest(`/api/templates/${encodeURIComponent(templateName)}/files/${encodedPath}`, {
        method: 'DELETE',
      })
      setDeleteTarget(null)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete file.')
    } finally {
      setDeleting(false)
    }
  }

  async function onUploadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }

    const defaultPath = normalizePath(file.name)
    setUploading(true)
    setError(null)
    try {
      const base64 = await fileToBase64(file)
      await apiRequest(`/api/templates/${encodeURIComponent(templateName)}/files`, {
        method: 'POST',
        body: {
          path: defaultPath,
          content_base64: base64,
        },
      })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to upload file.')
    } finally {
      setUploading(false)
    }
  }

  async function onDownloadFile(row: TemplateFileRow) {
    try {
      const encodedPath = encodeFilePath(row.path)
      const response = await apiRequest<TemplateFileDownloadResponse>(
        `/api/templates/${encodeURIComponent(templateName)}/download/${encodedPath}`
      )
      const bytes = base64ToBytes(response.content_base64 ?? '')
      const blob = new Blob([bytes], { type: 'application/octet-stream' })
      const fileName = response.file_name || row.path.split('/').pop() || 'download.bin'
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(objectUrl)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to download file.')
    }
  }

  return (
    <section className='flex flex-1 flex-col gap-4 sm:gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-2'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Template: {displayName}</h1>
          <p className='text-muted-foreground'>Manage files for this template folder.</p>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' className='space-x-1' onClick={() => void load()} disabled={loading}>
            <span>Refresh</span>
            <RefreshCcw size={18} />
          </Button>
          <Button variant='outline' className='space-x-1' asChild disabled={uploading}>
            <label>
              <span>{uploading ? 'Uploading...' : 'Upload'}</span>
              <Upload size={18} />
              <input type='file' className='hidden' onChange={(event) => void onUploadFile(event)} />
            </label>
          </Button>
          <Button className='space-x-1' onClick={openCreateDrawer}>
            <span>Create file</span>
            <Plus size={18} />
          </Button>
        </div>
      </div>

      {loading ? <p className='text-sm text-muted-foreground'>Loading files...</p> : null}
      {error ? (
        <p className='rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
          {error}
        </p>
      ) : null}

      {!loading ? (
        <SimpleDataTable
          rows={filteredRows}
          columns={columns}
          getRowKey={(row) => row.path}
          searchValue={query}
          onSearchChange={setQuery}
          searchPlaceholder='Filter by path...'
          emptyText='No files found.'
          renderContextMenuItems={renderTemplateContextMenuItems}
        />
      ) : null}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className='w-screen max-w-none sm:max-w-4xl lg:max-w-[50vw]'>
          <SheetHeader className='text-left'>
            <SheetTitle>
              {drawerMode === 'create' ? 'Create File' : drawerMode === 'rename' ? 'Rename File' : 'Edit File'}
            </SheetTitle>
            <SheetDescription>
              {drawerMode === 'create'
                ? 'Create a new text file using a relative path.'
                : drawerMode === 'rename'
                  ? 'Rename or move file by changing its relative path.'
                  : 'Edit text file content.'}
            </SheetDescription>
          </SheetHeader>

          <form id='template-file-form' onSubmit={onSubmitForm} className='grid gap-4 px-4 py-3'>
            {drawerMode === 'create' ? (
              <div className='grid gap-2'>
                <label htmlFor='template-file-path' className='text-sm font-medium'>
                  Path
                </label>
                <Input
                  id='template-file-path'
                  value={pathInput}
                  onChange={(event) => setPathInput(event.target.value)}
                  placeholder='codex/config.yaml.template'
                />
              </div>
            ) : null}

            {drawerMode === 'rename' ? (
              <>
                <div className='grid gap-2'>
                  <label htmlFor='template-file-from' className='text-sm font-medium'>
                    Current path
                  </label>
                  <Input id='template-file-from' value={pathInput} readOnly />
                </div>
                <div className='grid gap-2'>
                  <label htmlFor='template-file-to' className='text-sm font-medium'>
                    New path
                  </label>
                  <Input
                    id='template-file-to'
                    value={renameInput}
                    onChange={(event) => setRenameInput(event.target.value)}
                    placeholder='shared/shared-configure.sh'
                  />
                </div>
              </>
            ) : null}

            {drawerMode !== 'rename' ? (
              isBinaryFile ? (
                <p className='rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300'>
                  This file is binary and cannot be edited in text mode. Use Upload to replace it.
                </p>
              ) : (
                <div className='grid gap-2'>
                  <label htmlFor='template-file-content' className='text-sm font-medium'>
                    Content
                  </label>
                  <div className='overflow-hidden rounded-md border border-border bg-card'>
                    <div className='grid max-h-[65vh] grid-cols-[3.5rem_1fr] overflow-auto'>
                      <pre className='m-0 border-e border-border bg-muted/30 p-3 text-right font-mono text-xs leading-6 text-muted-foreground'>
                        {buildLineNumbers(contentInput)}
                      </pre>
                      <textarea
                        id='template-file-content'
                        value={contentInput}
                        onChange={(event) => setContentInput(event.target.value)}
                        spellCheck={false}
                        className='min-h-[360px] w-full resize-y border-0 bg-transparent p-3 font-mono text-[13px] leading-6 outline-none'
                      />
                    </div>
                  </div>
                </div>
              )
            ) : null}

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
            <Button form='template-file-form' type='submit' disabled={saving}>
              {saving
                ? 'Saving...'
                : drawerMode === 'create'
                  ? 'Create'
                  : drawerMode === 'rename'
                    ? 'Rename'
                    : 'Save changes'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => (!open ? setDeleteTarget(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete file</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `You are about to delete "${deleteTarget.path}". This action cannot be undone.`
                : 'You are about to delete this file.'}
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
    </section>
  )
}
