import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { AuthGate } from './components/auth/AuthGate';
import { LoginPage } from './components/auth/LoginPage';
import { StandaloneConsole } from './components/console/StandaloneConsole';

/**
 * Routes that require an authenticated admin session. The AuthGate renders the
 * app shell trees only when a token exists; otherwise it redirects to /login.
 */
function Protected() {
  return (
    <AuthGate>
      <Outlet />
    </AuthGate>
  );
}

const appRoutes = [
  { path: '/', element: <Navigate to="/agents/dashboard" replace /> },
  { path: '/agents/dashboard', element: <AppShell /> },
  { path: '/agents/dashboard/agents-stats', element: <AppShell /> },
  { path: '/agents/dashboard/cleanup', element: <AppShell /> },
  { path: '/console/:agentName', element: <StandaloneConsole /> },
  { path: '/agents', element: <AppShell /> },
  { path: '/agents/new', element: <AppShell /> },
  { path: '/agents/templates', element: <AppShell /> },
  { path: '/agents/templates/new', element: <AppShell /> },
  { path: '/agents/templates/:templateSlug', element: <AppShell /> },
  { path: '/agents/:agentName', element: <AppShell /> },
  { path: '/agents/:agentName/:serviceName', element: <AppShell /> },
  { path: '/ai-providers', element: <AppShell /> },
  { path: '/ai-providers/new', element: <AppShell /> },
  { path: '/ai-providers/:providerSlug', element: <AppShell /> },
  { path: '/workspaces', element: <AppShell /> },
  { path: '/workspaces/new', element: <AppShell /> },
  { path: '/workspaces/agents-md', element: <AppShell /> },
  { path: '/workspaces/agents-md/:agentsMdId', element: <AppShell /> },
  { path: '/workspaces/:workspaceSlug', element: <AppShell /> },
  { path: '/mcps', element: <AppShell /> },
  { path: '/mcps/new', element: <AppShell /> },
  { path: '/mcps/:serverSlug', element: <AppShell /> },
  { path: '/mcps/managed-apis', element: <AppShell /> },
  { path: '/skills', element: <AppShell /> },
  { path: '/skills/new', element: <AppShell /> },
  { path: '/skills/:sourceId', element: <AppShell /> },
  { path: '/settings', element: <AppShell /> },
  { path: '/settings/:settingsSection', element: <AppShell /> },
  { path: '/user', element: <AppShell /> },
  { path: '/user/:userSection', element: <AppShell /> },
  { path: '/security', element: <AppShell /> },
  { path: '/security/:securitySection', element: <AppShell /> },
  { path: '*', element: <Navigate to="/agents/dashboard" replace /> },
];

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <Protected />,
    children: appRoutes,
  },
]);
