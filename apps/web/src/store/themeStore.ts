import { create } from 'zustand';

export type ThemeMode = 'dark' | 'light' | 'auto';

const STORAGE_KEY = 'codepods-theme-mode';

function readInitialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light' || stored === 'auto') return stored;
  return 'dark';
}

function applyMode(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const resolved = mode === 'auto'
    ? window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    : mode;
  root.classList.toggle('dark', resolved === 'dark');
}

interface ThemeStore {
  mode: ThemeMode;
  cycleMode: () => void;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  mode: readInitialMode(),
  cycleMode: () => {
    const order: ThemeMode[] = ['dark', 'light', 'auto'];
    const next = order[(order.indexOf(get().mode) + 1) % order.length];
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, next);
    applyMode(next);
    set({ mode: next });
  },
}));

// Apply the persisted mode on load.
if (typeof window !== 'undefined') {
  applyMode(readInitialMode());
}
