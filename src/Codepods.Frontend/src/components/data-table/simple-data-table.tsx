import { useMemo, useRef, useState } from 'react'
import { Cross2Icon, MixerHorizontalIcon } from '@radix-ui/react-icons'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DoubleArrowLeftIcon,
  DoubleArrowRightIcon,
} from '@radix-ui/react-icons'
import {
  type ColumnDef,
  type PaginationState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { cn, getPageNumbers } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type TableColumnMeta = {
  className?: string
  thClassName?: string
  tdClassName?: string
}

type SimpleDataTableProps<TData> = {
  rows: TData[]
  columns: ColumnDef<TData, unknown>[]
  getRowKey?: (row: TData) => string | number
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  emptyText?: string
  leftFilters?: React.ReactNode
  rightActions?: React.ReactNode
  renderContextMenuItems?: (row: TData) => React.ReactNode
}

export function SimpleDataTable<TData>({
  rows,
  columns,
  getRowKey,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Filter...',
  emptyText = 'No results.',
  leftFilters,
  rightActions,
  renderContextMenuItems,
}: SimpleDataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 })
  const isFiltered = searchValue.trim().length > 0
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: TData } | null>(null)
  const touchTimerRef = useRef<number | null>(null)

  function openContextMenu(row: TData, x: number, y: number) {
    if (!renderContextMenuItems) {
      return
    }
    setContextMenu((current) => {
      if (current !== null) {
        return null
      }
      return { x, y, row }
    })
    window.setTimeout(() => {
      setContextMenu({ x, y, row })
    }, 0)
  }

  function clearTouchTimer() {
    if (touchTimerRef.current !== null) {
      window.clearTimeout(touchTimerRef.current)
      touchTimerRef.current = null
    }
  }

  const table = useReactTable({
    data: rows,
    columns,
    state: {
      sorting,
      columnVisibility,
      pagination,
    },
    getRowId: getRowKey ? (originalRow) => String(getRowKey(originalRow)) : undefined,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const currentPage = table.getState().pagination.pageIndex + 1
  const totalPages = Math.max(1, table.getPageCount())
  const pageNumbers = useMemo(() => getPageNumbers(currentPage, totalPages), [currentPage, totalPages])

  return (
    <div className='flex flex-1 flex-col gap-4'>
      <div className='flex items-center justify-between gap-2'>
        <div className='flex flex-1 flex-col-reverse items-start gap-y-2 sm:flex-row sm:items-center sm:space-x-2'>
          <div className='relative w-full sm:w-[150px] lg:w-[250px]'>
            <Input
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(event) => {
                onSearchChange(event.target.value)
                setPagination((current) => ({ ...current, pageIndex: 0 }))
              }}
              className='h-8 w-full pe-8'
            />
            {isFiltered ? (
              <button
                type='button'
                aria-label='Clear filter'
                onClick={() => {
                  onSearchChange('')
                  setPagination((current) => ({ ...current, pageIndex: 0 }))
                }}
                className='text-muted-foreground hover:text-foreground absolute inset-y-0 end-2 flex items-center'
              >
                <Cross2Icon className='h-4 w-4' />
              </button>
            ) : null}
          </div>
          {leftFilters ? <div className='flex gap-x-2'>{leftFilters}</div> : null}
        </div>
        <div className='flex items-center gap-2'>
          {rightActions}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant='outline' size='sm' className='h-8'>
                <MixerHorizontalIcon className='size-4' />
                View
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-[150px]'>
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllColumns()
                .filter(
                  (column) =>
                    typeof column.accessorFn !== 'undefined' && column.getCanHide()
                )
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className='capitalize'
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className='overflow-hidden rounded-md border'>
        <Table className='min-w-xl'>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = (header.column.columnDef.meta ?? {}) as TableColumnMeta
                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      className={cn(meta.className, meta.thClassName)}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className='select-none sm:select-text'
                  onContextMenu={(event) => {
                    event.preventDefault()
                    openContextMenu(row.original, event.clientX, event.clientY)
                  }}
                  onTouchStart={(event) => {
                    if (!renderContextMenuItems) {
                      return
                    }
                    clearTouchTimer()
                    const touch = event.touches[0]
                    const x = touch.clientX
                    const y = touch.clientY
                    touchTimerRef.current = window.setTimeout(() => {
                      openContextMenu(row.original, x, y)
                      touchTimerRef.current = null
                    }, 520)
                  }}
                  onTouchMove={clearTouchTimer}
                  onTouchEnd={clearTouchTimer}
                  onTouchCancel={clearTouchTimer}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = (cell.column.columnDef.meta ?? {}) as TableColumnMeta
                    return (
                      <TableCell key={cell.id} className={cn(meta.className, meta.tdClassName)}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className='h-24 text-center text-muted-foreground'>
                  {emptyText}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <DropdownMenu
        modal={false}
        open={contextMenu !== null}
        onOpenChange={(open) => (!open ? setContextMenu(null) : null)}
      >
        <DropdownMenuTrigger asChild>
          <button
            type='button'
            aria-hidden='true'
            tabIndex={-1}
            style={{
              position: 'fixed',
              left: contextMenu?.x ?? -9999,
              top: contextMenu?.y ?? -9999,
              width: 1,
              height: 1,
              opacity: 0,
              pointerEvents: 'none',
            }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' sideOffset={4}>
          {contextMenu && renderContextMenuItems ? (
            renderContextMenuItems(contextMenu.row)
          ) : (
            <DropdownMenuItem disabled>No actions</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className='mt-auto overflow-clip px-2' style={{ overflowClipMargin: 1 }}>
        <div className='hidden items-center justify-between sm:flex'>
          <div className='flex items-center gap-2'>
            <p className='text-sm font-medium'>Rows per page</p>
            <Select
              value={`${table.getState().pagination.pageSize}`}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger className='h-8 w-[70px]'>
                <SelectValue placeholder={table.getState().pagination.pageSize} />
              </SelectTrigger>
              <SelectContent side='top'>
                {[10, 20, 30, 40, 50].map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='flex items-center space-x-2'>
            <div className='flex w-[110px] items-center justify-center text-sm font-medium'>
              Page {currentPage} of {totalPages}
            </div>
            <Button
              variant='outline'
              className='size-8 p-0'
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <span className='sr-only'>Go to first page</span>
              <DoubleArrowLeftIcon className='h-4 w-4' />
            </Button>
            <Button
              variant='outline'
              className='size-8 p-0'
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <span className='sr-only'>Go to previous page</span>
              <ChevronLeftIcon className='h-4 w-4' />
            </Button>
            {pageNumbers.map((pageNumber, index) => (
              <div key={`${pageNumber}-${index}`} className='flex items-center'>
                {pageNumber === '...' ? (
                  <span className='px-1 text-sm text-muted-foreground'>...</span>
                ) : (
                  <Button
                    variant={currentPage === pageNumber ? 'default' : 'outline'}
                    className='h-8 min-w-8 px-2'
                    onClick={() => table.setPageIndex((pageNumber as number) - 1)}
                  >
                    <span className='sr-only'>Go to page {pageNumber}</span>
                    {pageNumber}
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant='outline'
              className='size-8 p-0'
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <span className='sr-only'>Go to next page</span>
              <ChevronRightIcon className='h-4 w-4' />
            </Button>
            <Button
              variant='outline'
              className='size-8 p-0'
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <span className='sr-only'>Go to last page</span>
              <DoubleArrowRightIcon className='h-4 w-4' />
            </Button>
          </div>
        </div>

        <div className='flex flex-col gap-3 sm:hidden'>
          <div className='flex items-center justify-center space-x-2'>
            <Button
              variant='outline'
              className='size-8 p-0'
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <span className='sr-only'>Go to first page</span>
              <DoubleArrowLeftIcon className='h-4 w-4' />
            </Button>
            <Button
              variant='outline'
              className='size-8 p-0'
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <span className='sr-only'>Go to previous page</span>
              <ChevronLeftIcon className='h-4 w-4' />
            </Button>
            {pageNumbers.map((pageNumber, index) => (
              <div key={`${pageNumber}-${index}`} className='flex items-center'>
                {pageNumber === '...' ? (
                  <span className='px-1 text-sm text-muted-foreground'>...</span>
                ) : (
                  <Button
                    variant={currentPage === pageNumber ? 'default' : 'outline'}
                    className='h-8 min-w-8 px-2'
                    onClick={() => table.setPageIndex((pageNumber as number) - 1)}
                  >
                    <span className='sr-only'>Go to page {pageNumber}</span>
                    {pageNumber}
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant='outline'
              className='size-8 p-0'
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <span className='sr-only'>Go to next page</span>
              <ChevronRightIcon className='h-4 w-4' />
            </Button>
            <Button
              variant='outline'
              className='size-8 p-0'
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <span className='sr-only'>Go to last page</span>
              <DoubleArrowRightIcon className='h-4 w-4' />
            </Button>
          </div>

          <div className='flex items-center justify-between'>
            <p className='text-sm font-medium'>Page {currentPage} of {totalPages}</p>
            <Select
              value={`${table.getState().pagination.pageSize}`}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger className='h-8 w-[70px]'>
                <SelectValue placeholder={table.getState().pagination.pageSize} />
              </SelectTrigger>
              <SelectContent side='top'>
                {[10, 20, 30, 40, 50].map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  )
}

export type { ColumnDef }
