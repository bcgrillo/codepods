import {
  Box,
  Bot,
  Cloud,
  Code,
  Cpu,
  Database,
  FileCode,
  Globe,
  Image as ImageIcon,
  Layers,
  Monitor,
  Server,
  Settings,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { cx } from '../../utils/cx';
import { useThemeStore } from '../../store/themeStore';

interface TemplateIconProps {
  icon?: string | null;
  iconDark?: string | null;
  className?: string;
  dark?: boolean;
  tint?: 'emerald' | 'red' | 'amber' | 'white' | 'zinc';
}

const TINT_OPACITY: Record<NonNullable<TemplateIconProps['tint']>, string> = {
  emerald: 'opacity-100',
  red: 'opacity-100',
  amber: 'opacity-100',
  white: 'opacity-100',
  zinc: 'opacity-40',
};

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Box,
  Bot,
  Cloud,
  Code,
  Cpu,
  Database,
  FileCode,
  Globe,
  Image: ImageIcon,
  Layers,
  Monitor,
  Server,
  Settings,
  Sparkles,
  Terminal,
};

export function TemplateIcon({ icon, iconDark, className, dark, tint }: TemplateIconProps) {
  const { mode } = useThemeStore();
  const autoDark = mode === 'dark' || (mode === 'auto' &&
    (typeof window === 'undefined' || !window.matchMedia('(prefers-color-scheme: light)').matches));
  const useDark = dark ?? autoDark;
  const value = (useDark ? iconDark : undefined) ?? icon;
  const opacityCls = tint ? TINT_OPACITY[tint] : undefined;

  const wrapperCls = cx('inline-flex items-center justify-center [&_svg]:h-full [&_svg]:w-full', className, opacityCls);

  const empty = (
    <span className={wrapperCls}>
      <Box className="h-full w-full" />
    </span>
  );

  if (!value || value.trim() === '') {
    return empty;
  }

  const trimmed = value.trim();

  if (isInlineSvg(trimmed)) {
    return (
      <span
        className={wrapperCls}
        dangerouslySetInnerHTML={{ __html: trimmed }}
      />
    );
  }

  if (isUrl(trimmed)) {
    return (
      <span className={wrapperCls}>
        <img src={trimmed} alt="" className="h-full w-full object-contain" />
      </span>
    );
  }

  if (isEmoji(trimmed)) {
    return (
      <span className={wrapperCls} aria-hidden="true">
        {trimmed}
      </span>
    );
  }

  const Icon = ICONS[trimmed] ?? Box;
  return (
    <span className={wrapperCls}>
      <Icon className="h-full w-full" />
    </span>
  );
}

function isInlineSvg(value: string): boolean {
  return value.startsWith('<svg') || value.includes('xmlns=');
}

function isUrl(value: string): boolean {
  return /^(https?:\/\/|data:)/i.test(value) || /\.svg$/i.test(value);
}

function isEmoji(value: string): boolean {
  return /^\p{Emoji_Presentation}$/u.test(value);
}
