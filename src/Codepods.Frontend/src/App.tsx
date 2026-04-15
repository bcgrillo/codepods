import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { RequireAuth } from "@/components/auth/require-auth";
import { AppShell } from "@/components/layout/app-shell";
import { findActiveSession } from "@/lib/active-sessions";
import { ActiveSessionPage } from "@/pages/active-session-page";
import { AgentTypeSettingsPage } from "@/pages/agent-type-settings-page";
import { AgentsPage } from "@/pages/agents-page";
import { AboutPage } from "@/pages/about-page";
import { SettingsDevicesPage } from "@/pages/settings-devices-page";
import { SettingsPlaceholderPage } from "@/pages/settings-placeholder-page";
import { SettingsRelaysPage } from "@/pages/settings-relays-page";
import { SettingsPage } from "@/pages/settings-page";
import { SettingsUsersPage } from "@/pages/settings-users-page";
import { SignInPage } from "@/pages/sign-in-page";
import { VariablesPage } from "@/pages/variables-page";

function RouteTitleSync() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    let pageTitle = "App";
    if (path === "/sign-in") pageTitle = "Sign in";
    else if (path === "/agents") pageTitle = "Agents";
    else if (path === "/variables") pageTitle = "Variables";
    else if (path.startsWith("/templates/")) pageTitle = "Template";
    else if (path.startsWith("/sessions/")) {
      const sessionId = decodeURIComponent(path.split("/sessions/")[1] ?? "");
      const session = findActiveSession(sessionId);
      pageTitle = session ? `Session · ${session.agentName}` : "Session";
    } else if (path === "/settings/system") pageTitle = "Settings · System";
    else if (path === "/settings/users") pageTitle = "Settings · Users";
    else if (path === "/settings/devices") pageTitle = "Settings · Devices";
    else if (path === "/settings/relays") pageTitle = "Settings · Relays";
    else if (path === "/settings/gateway") pageTitle = "Settings · Gateway";
    else if (path === "/about") pageTitle = "About";

    document.title = `Codepods · ${pageTitle}`;
  }, [location.pathname]);

  return null;
}

function App() {
  return (
    <>
      <RouteTitleSync />
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/agents" replace />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/templates/:templateName" element={<AgentTypeSettingsPage />} />
            <Route path="/variables" element={<VariablesPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/sessions/:sessionId" element={<ActiveSessionPage />} />
            <Route path="/settings" element={<Navigate to="/settings/system" replace />} />
            <Route path="/settings/system" element={<SettingsPage />} />
            <Route path="/settings/users" element={<SettingsUsersPage />} />
            <Route path="/settings/devices" element={<SettingsDevicesPage />} />
            <Route path="/settings/relays" element={<SettingsRelaysPage />} />
            <Route
              path="/settings/gateway"
              element={
                <SettingsPlaceholderPage
                  title="Settings: Gateway"
                  description="Gateway and proxy configuration will be available here (coming soon)."
                />
              }
            />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/agents" replace />} />
      </Routes>
    </>
  );
}

export default App;
