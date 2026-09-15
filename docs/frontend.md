# Frontend Architecture

The `apps/web` application is a React 18 + Vite 5 SPA with a 3-pane layout, a design-system-first component library, and a clean separation between UI state (Zustand) and server state (TanStack Query). All API access goes through the `@codepods/sdk` package — no direct `fetch` in components.

## TL;DR

- **Stack**: React 18, Vite 5, Tailwind CSS v4, shadcn/ui (new-york), lucide-react, Zustand, TanStack Query v5, React Router v6, react-i18next.
- **Layout**: 3-pane `AppShell` — `PrimaryNav` (icon rail) + `SecondaryPanel` (reusable `SecondaryList`) + `<main>` (detail view via `ContentShell`/`ContentHeader`).
- **Design system**: Tailwind v4 CSS-first config, OKLCH semantic tokens (`:root` light / `.dark` dark), shadcn/ui primitives.
- **State**: Zustand for UI (persisted partially), TanStack Query for server data. URL ↔ store bidirectional sync in `AppShell`.
- **API**: `@codepods/sdk` client classes (one per domain), shared `request()` wrapper, module-level bearer token + global 401 handler.
- **i18n**: i18next, English only. All strings in `src/i18n/locales/en.ts`.

## Entry point & providers

`main.tsx` bootstraps in order:
1. `bootstrapAuth()` — restores saved admin token into the SDK *before* React mounts.
2. `./i18n` side-effect import — initializes i18next.
3. `./index.css` — Tailwind theme tokens.
4. Renders `<React.StrictMode>` → `<BrowserRouter>` → `<QueryClientProvider>` → `<App />`.

Provider stack: **React Router > TanStack Query > App**.

## Routing

Two-tier routing in `App.tsx`:
- **Outer**: `/login` → `<LoginPage />` (unauthenticated). Everything else → `<AuthGate>` → `<AppShell />`.
- **Inner** (auth-protected): all app routes render `<AppShell />` (same shell instance for every section), except:
  - `/` → redirects to `/agents`
  - `/console/:agentName` → `<StandaloneConsole />` (full-screen, outside shell)
  - `/agents/:agentName/:serviceName` → deep-linkable agent + service tabs

Route groups (all under AppShell): `agents` (+ `agents/templates`), `ai-providers`, `workspaces` (+ `agents-md`), `mcps` (+ `managed-apis`), `skills`, `settings`, `user`, `security`. Catch-all `*` → `/agents`.

## State management

| Layer | Technology | Purpose |
|---|---|---|
| UI state | Zustand (`uiStore`) | Active view, selected IDs, nav expansion, settings sub-sections. Partially persisted to `localStorage` (`codepods-ui-nav`). |
| Theme | Zustand (`themeStore`) | `'dark' \| 'light' \| 'auto'`, persisted. Toggles `.dark` class on `<html>`. |
| Server state | TanStack Query v5 | Data hooks wrap SDK clients; mutations invalidate query keys. `retry: 1`, `staleTime: 5s`. |

### URL ↔ store sync

`AppShell` maintains bidirectional sync:
- `viewFromPathname()` derives `activeView` from the URL.
- A `useEffect` resolves route params (name/slug) → entity IDs (URL → store).
- Another effect resolves store selection → name/slug and `navigate(..., {replace:true})` (store → URL).
- Empty-state auto-redirect: if a section has zero items, redirects to `/{view}/new`.
- Dynamic document title: `CodePods · {viewLabel} · {selectedItem}`.

## Layout — AppShell

```
┌──────────────┬──────────────────┬────────────────────────────────┐
│ PrimaryNav   │ SecondaryPanel   │ Main Content                   │
│ (w-14 / w-48)│ (w-14 / w-72)    │ (flex-1, rounded panel)        │
│              │                  │                                │
│ [Logo]       │ [SecondaryList]  │ ContentShell                   │
│  Agents      │  ┌──────────┐    │  ├ ContentHeader (h-12)        │
│  AI Providers│  │ Item     │    │  │  ├ icon + title + badges    │
│  MCPs        │  │ Item ⟍   │    │  │  └ actions (grouped)        │
│  Skills      │  │ Item     │    │  ├ scrollable body             │
│  Workspaces  │  └──────────┘    │  └ optional footer              │
│  Security    │  [+ New]         │                                │
│              │                  │                                │
│  [Theme]     │                  │                                │
│  [Settings]  │                  │                                │
│  [User]      │                  │                                │
└──────────────┴──────────────────┴────────────────────────────────┘
```

### Component hierarchy

```
AppShell
├── PrimaryNav
│   ├── LogoButton + CodepodsLogo
│   ├── Nav items (agents, ai-providers, mcps, skills, workspaces, security)
│   └── Footer: ThemeModeItem + Settings + User
├── SecondaryPanel
│   ├── Header (section icon + title + collapse toggle)
│   ├── Per-view list: AgentList | WorkspaceList | McpServerList | SkillSourceList | AiProviderList
│   │   or sub-menus: SettingsSubMenu | SecuritySubMenu | UserSubMenu
│   └── Bottom buttons (sub-sections): Templates, CodePods MCP, Managed APIs, Local Skills, AGENTS.md
└── <main> → per-view detail component (AgentDetail, WorkspaceDetail, …)
```

## Reusable components

### SecondaryList

The shared building block for all sidebar lists. Built on @dnd-kit with drag-to-reorder, pin items, collapsible groups, context menus, and tooltips.

```typescript
interface SecondaryItem {
  id: string;
  icon?: LucideIcon | ReactNode;
  label: string;
  secondary?: string;
  badge?: string;
  badgeVariant?: 'default' | 'success' | 'warning' | 'destructive';
  status?: string;
  statusColor?: string;
  groupId?: string;
  pinned?: boolean;
  iconBoxClassName?: string;
}

interface SecondaryListProps {
  items: SecondaryItem[];
  groups?: SecondaryGroup[];
  selectedId?: string;
  newItemLabel?: string;
  onSelect?: (id: string) => void;
  onPin?: (id: string) => void;
  onReorder?: (ids: string[]) => void;
  onNew?: () => void;
  contextMenuActions?: ContextMenuAction[];
  collapsed?: boolean;
}
```

Supports a `collapsed` mode (icon-only, no labels/DnD) for the compact sidebar.

### ContentShell + ContentHeader

`ContentShell` — standard wrapper for every detail view. Props: `title`, `icon`, `subtitle`, `badges`, `showBack`/`onBack`, `actions`/`actionGroups`, `centerContent`, `children`, `footer`, `noScroll`.

`ContentHeader` — fixed h-12 header bar: back button, icon+title+subtitle+badges (left), optional centered content, grouped action buttons separated by `<Separator>` (right).

## Design system

### Tailwind v4 (CSS-first)

Config is CSS-first: `@import 'tailwindcss'` + `@import 'tw-animate-css'` in `index.css`. No `tailwind.config.js`.

### Semantic tokens (OKLCH)

Defined as CSS custom properties in `:root` (light) and `.dark` (dark):

- **Standard shadcn**: `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--primary-foreground`, `--primary-soft`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, chart-1..5.
- **Custom app tokens**: `--page-background`, `--panel-background`, `--secondary-item`, `--secondary-item-hover`, `--selected-secondary-item(-hover)`, sidebar aliases.
- **Layout metrics**: `--sidebar-width: 3.5rem`, `--secondary-width: 18rem`, `--form-max-width: 42rem`.

`@theme inline` block maps tokens into Tailwind utilities (e.g. `bg-page-background`, `text-primary-soft`).

### Dark mode

`@custom-variant dark (&:is(.dark *))` — class-based, toggled by `themeStore` on `<html>`. Three modes: `dark`, `light`, `auto` (resolves via `prefers-color-scheme`).

### shadcn/ui components used

`Badge`, `Button`, `Collapsible`, `ContextMenu`, `Separator`, `Tooltip` (in `components/ui/`).

## Auth flow (frontend)

`hooks/useAuth.ts` bridges the SDK auth with React + localStorage:
- `bootstrapAuth()`: loads token from `localStorage` (`codepods.admin.token`) into the SDK, registers a global 401 handler that clears the token and redirects to `/login`.
- `useLogin()`: calls `authClient.login`, persists token on success.
- `useLogout()`: calls `authClient.logout` (clears HttpOnly cookie), then clears local token.
- `useDevices`, `useRevokeDevice`, `useChangePassword`: TanStack Query wrappers.

See [Authentication](./auth.md) for the backend auth system.

## Frontend ↔ API communication

- **No direct `fetch` in components.** All API access goes through `@codepods/sdk` client classes, wrapped by TanStack Query hooks.
- **Vite dev proxy**: `/api` and `/socket.io` proxy to `http://localhost:3000` with `ws: true`.
- **Path aliases**: `@` → `./src`, `@codepods/shared-types` and `@codepods/sdk` → source packages (no build step in dev).

## Key files

| File | Role |
|---|---|
| `apps/web/src/main.tsx` | Entry point, provider stack |
| `apps/web/src/App.tsx` | Routing, AuthGate |
| `apps/web/src/components/layout/AppShell.tsx` | 3-pane layout, URL↔store sync |
| `apps/web/src/components/layout/PrimaryNav.tsx` | Icon rail navigation |
| `apps/web/src/components/layout/SecondaryPanel.tsx` | Per-view list panel |
| `apps/web/src/components/SecondaryList.tsx` | Reusable list engine (DnD, pin, groups) |
| `apps/web/src/components/ContentShell.tsx` | Detail view wrapper |
| `apps/web/src/components/ContentHeader.tsx` | Header bar |
| `apps/web/src/store/uiStore.ts` | UI state (Zustand) |
| `apps/web/src/store/themeStore.ts` | Theme state (Zustand) |
| `apps/web/src/index.css` | Tailwind v4 tokens, OKLCH, dark mode |
| `apps/web/src/i18n/locales/en.ts` | All UI strings |
| `apps/web/src/hooks/useAuth.ts` | Auth bridge (SDK ↔ React) |

## Current limitations

- **English only** — i18next is wired but only `en.ts` exists. Other locales are planned.
- **Large bundle** — the SPA is a single ~330 kB gzip chunk; no code-splitting or lazy routes yet.
- **No offline support** — the app requires a connection to the API; no service worker or PWA features.
- **No E2E tests** — the frontend has no Playwright/Cypress test suite.