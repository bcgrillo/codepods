import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useSession } from "@/auth/session-context";

export function RequireAuth() {
  const session = useSession();
  const location = useLocation();

  if (session.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <p className="text-sm text-slate-400">Validating session...</p>
      </div>
    );
  }

  if (!session.isAuthenticated) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
