import type { JSX } from 'react'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type SidebarNavItem = {
  id: string
  title: string
  icon: JSX.Element
}

type SidebarNavProps = React.HTMLAttributes<HTMLElement> & {
  items: SidebarNavItem[]
  value: string
  onChange: (id: string) => void
}

export function SidebarNav({ className, items, value, onChange, ...props }: SidebarNavProps) {
  return (
    <>
      <div className='p-1 md:hidden'>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className='h-12 w-full sm:w-64'>
            <SelectValue placeholder='Select section' />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                <div className='flex gap-x-4 px-2 py-1'>
                  <span className='scale-125'>{item.icon}</span>
                  <span className='text-md'>{item.title}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className='hidden w-full min-w-40 bg-background px-1 py-2 md:block'>
        <nav
          className={cn(
            'flex space-x-2 py-1 lg:flex-col lg:space-y-1 lg:space-x-0',
            className
          )}
          {...props}
        >
          {items.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={cn(
                'inline-flex h-8 items-center rounded-md px-2 text-sm font-medium transition-colors',
                value === item.id
                  ? 'bg-muted hover:bg-accent'
                  : 'hover:bg-accent hover:underline',
                'justify-start'
              )}
              onClick={(event) => {
                event.preventDefault()
                onChange(item.id)
              }}
            >
              <span className='me-2'>{item.icon}</span>
              {item.title}
            </a>
          ))}
        </nav>
      </div>
    </>
  )
}
