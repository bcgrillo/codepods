type Team = {
  name: string
  logo: React.ElementType
  plan: string
}

type BaseNavItem = {
  title: string
  badge?: string
  icon?: React.ElementType
}

type NavLink = BaseNavItem & {
  url: string
  actionLabel?: string
  actionIcon?: React.ElementType
  onAction?: () => void
}

type NavSubmenu = BaseNavItem & {
  items: NavLink[]
}

type NavItem = NavLink | NavSubmenu

type NavGroup = {
  title: string
  items: NavItem[]
}

type SidebarData = {
  teams: Team[]
  navGroups: NavGroup[]
}

export type { SidebarData, NavGroup, NavItem, NavLink, NavSubmenu }
