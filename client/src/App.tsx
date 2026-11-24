import { Loader2 } from 'lucide-react';
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useParams,
} from 'react-router-dom';
import { AuthModal } from './components/auth/AuthModal';
import { LogPlayModal } from './components/history/LogPlayModal';
import { AppShell } from './components/layout/AppShell';
import { AppStateProvider } from './context/AppStateContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DesignSystemPreview } from './pages/DesignSystemPreview';
import { GroupsPage } from './pages/GroupsPage';
import { HistoryPage } from './pages/HistoryPage';
import { LibraryPage } from './pages/LibraryPage';
import { SessionRoomPage } from './pages/SessionRoomPage';
import { SessionsHubPage } from './pages/SessionsHubPage';
import { WelcomePage } from './pages/WelcomePage';

function RootRoute() {
  const { isAuthenticated, isGuestSession, loading } = useAuth();

  if (!loading && (isAuthenticated || isGuestSession)) {
    return <Navigate to="/sessions" replace />;
  }

  return <WelcomePage />;
}

function GroupInviteRoute() {
  const { inviteCode } = useParams<{ inviteCode?: string }>();
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-canvas text-ink-muted gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-forest-600" aria-hidden="true" />
        <span className="text-sm font-semibold">Cargando invitación…</span>
      </div>
    );
  }

  if (!isAuthenticated && inviteCode) {
    return (
      <Navigate
        to={`/welcome?groupInvite=${encodeURIComponent(inviteCode)}`}
        replace
      />
    );
  }

  return (
    <AppShell>
      <GroupsPage />
      <LogPlayModal />
      <AuthModal />
    </AppShell>
  );
}

function AppShellLayout() {
  return (
    <AppShell>
      <Outlet />
      <LogPlayModal />
      <AuthModal />
    </AppShell>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppStateProvider>
        <BrowserRouter>
          <Routes>
            {/* Fullscreen Welcome & Login experience (without AppShell) */}
            <Route path="/" element={<RootRoute />} />
            <Route path="/welcome" element={<WelcomePage />} />

            {/* Group invite link: redirects unauthenticated visitors to WelcomePage */}
            <Route path="/join/:inviteCode" element={<GroupInviteRoute />} />

            {/* Main application routes inside AppShell */}
            <Route element={<AppShellLayout />}>
              <Route path="/sessions" element={<SessionsHubPage />} />
              <Route path="/sessions/:id" element={<SessionRoomPage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/groups" element={<GroupsPage />} />
              <Route path="/preview" element={<DesignSystemPreview />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AppStateProvider>
    </AuthProvider>
  );
}
