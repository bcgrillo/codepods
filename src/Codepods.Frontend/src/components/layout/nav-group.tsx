import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { type NavGroup as NavGroupProps, type NavItem, type NavLink as NavEntry } from './types'

export function NavGroup({ title, items }: NavGroupProps) {
  const { pathname } = useLocation()
  const [hoveredActionItem, setHoveredActionItem] = useState<string | null>(null)
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarItem
            key={item.title}
            item={item}
            href={pathname}
            hoveredActionItem={hoveredActionItem}
            setHoveredActionItem={setHoveredActionItem}
          />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}

function SidebarItem({
  item,
  href,
  hoveredActionItem,
  setHoveredActionItem,
}: {
  item: NavItem
  href: string
  hoveredActionItem: string | null
  setHoveredActionItem: (value: string | null) => void
}) {
  if ('url' in item) {
    return (
      <SidebarMenuLink
        item={item}
        href={href}
        hoveredActionItem={hoveredActionItem}
        setHoveredActionItem={setHoveredActionItem}
      />
    )
  }

  return <SidebarMenuWithSubmenu item={item} href={href} />
}

function SidebarMenuLink({
  item,
  href,
  hoveredActionItem,
  setHoveredActionItem,
}: {
  item: NavEntry
  href: string
  hoveredActionItem: string | null
  setHoveredActionItem: (value: string | null) => void
}) {
  const { setOpenMobile } = useSidebar()
  const isActionVisible = hoveredActionItem === item.url
  return (
    <SidebarMenuItem
      onMouseEnter={() => setHoveredActionItem(item.url)}
      onMouseLeave={() => setHoveredActionItem(null)}
    >
      <SidebarMenuButton asChild isActive={checkIsActive(href, item)} tooltip={item.title} className='active:translate-y-0'>
        <NavLink to={item.url} onClick={() => setOpenMobile(false)}>
          {item.icon && <item.icon />}
          <span>{item.title}</span>
        </NavLink>
      </SidebarMenuButton>
      {item.onAction && item.actionIcon ? (
        <SidebarMenuAction
          className={`z-20 transition-opacity ${
            isActionVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          aria-label={item.actionLabel ?? `Action for ${item.title}`}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            item.onAction?.()
          }}
        >
          <item.actionIcon />
        </SidebarMenuAction>
      ) : null}
    </SidebarMenuItem>
  )
}

function SidebarMenuWithSubmenu({ item, href }: { item: Exclude<NavItem, NavEntry>; href: string }) {
  const hasActiveChild = item.items.some((subItem) => checkIsActive(href, subItem))
  const [open, setOpen] = useState(hasActiveChild)
  const { setOpenMobile } = useSidebar()

  useEffect(() => {
    if (hasActiveChild) {
      setOpen(true)
    }
  }, [hasActiveChild])

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={() => setOpen((current) => !current)}
        className='active:translate-y-0'
      >
        {item.icon && <item.icon />}
        <span>{item.title}</span>
        <ChevronDown className={`ms-auto transition-transform ${open ? 'rotate-180' : ''}`} size={16} />
      </SidebarMenuButton>

      {open ? (
        <SidebarMenuSub>
          {item.items.map((subItem) => (
            <SidebarMenuSubItem key={subItem.url}>
              <SidebarMenuSubButton asChild isActive={checkIsActive(href, subItem)} className='active:translate-y-0'>
                <NavLink to={subItem.url} onClick={() => setOpenMobile(false)}>
                  {subItem.icon && <subItem.icon />}
                  <span>{subItem.title}</span>
                </NavLink>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      ) : null}
    </SidebarMenuItem>
  )
}

function checkIsActive(href: string, item: NavEntry) {
  return href === item.url || href.startsWith(`${item.url}/`)
}
