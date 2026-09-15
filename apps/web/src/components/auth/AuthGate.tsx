import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getAuthToken } from '../../hooks/useAuth';

/**
 * Route guard. Renders the app shell only when an authenticated admin session
 * exists; otherwise redirects to /login.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const location = useLocation();

  if (!getAuthToken()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
