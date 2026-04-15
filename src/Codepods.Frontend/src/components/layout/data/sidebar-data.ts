import { AudioWaveform, Braces, Boxes, GalleryVerticalEnd, Settings, Shield, Users, Waypoints, Wrench } from 'lucide-react'
import React from 'react'
import codepodsDark from '@/assets/codepods_dark.png'
import codepodsLight from '@/assets/codepods_light.png'
import { useTheme } from '@/context/theme-provider'
import { type SidebarData } from '../types'

function CodepodsMark({ className }: { className?: string }) {
  const { resolvedTheme } = useTheme()
  const useDark = resolvedTheme === 'dark'
  return React.createElement('img', { src: useDark ? codepodsDark : codepodsLight, alt: '', className })
}

export const sidebarData: SidebarData = {
  teams: [
    {
      name: 'Codepods',
      logo: CodepodsMark,
      plan: 'Default',
    },
    {
      name: 'Acme Inc',
      logo: GalleryVerticalEnd,
      plan: 'Enterprise',
    },
    {
      name: 'Acme Corp.',
      logo: AudioWaveform,
      plan: 'Startup',
    },
  ],
  navGroups: [
    {
      title: 'General',
      items: [
        {
          title: 'Agents',
          url: '/agents',
          icon: Users,
        },
        {
          title: 'Variables',
          url: '/variables',
          icon: Braces,
        },
      ],
    },
    {
      title: 'Other',
      items: [
        {
          title: 'Templates',
          icon: Boxes,
          items: [],
        },
        {
          title: 'Settings',
          icon: Settings,
          items: [
            {
              title: 'System',
              url: '/settings/system',
              icon: Wrench,
            },
            {
              title: 'Users',
              url: '/settings/users',
              icon: Users,
            },
            {
              title: 'Devices',
              url: '/settings/devices',
              icon: Shield,
            },
            {
              title: 'Relays',
              url: '/settings/relays',
              icon: Waypoints,
            },
            {
              title: 'Gateway',
              url: '/settings/gateway',
              icon: Boxes,
            },
          ],
        },
      ],
    },
  ],
}
