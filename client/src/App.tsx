import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { ApiError } from './api/client';
import { AuthModal } from './components/auth/AuthModal';
import { LogPlayModal } from './components/history/LogPlayModal';
import { AppShell } from './components/layout/AppShell';
import { AppStateProvider, useAppState } from './context/AppStateContext';
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

function SeriesInviteRoute() {
  const { shareToken } = useParams<{ shareToken?: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, backendUser, backendSyncStatus, loading } = useAuth();
  const { joinSeriesByShareToken } = useAppState();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isWaitingForSync =
    isAuthenticated && (backendSyncStatus === 'idle' || backendSyncStatus === 'syncing');

  useEffect(() => {
    if (loading || !isAuthenticated || !shareToken || !backendUser) return;

    let cancelled = false;
    setErrorMsg(null);

    void joinSeriesByShareToken(shareToken, 'going')
      .then((session) => {
        if (!cancelled) {
          navigate(`/sessions/${session.id}`, { replace: true });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(
            err instanceof ApiError
              ? err.message
              : 'No se pudo abrir la juntada recurrente.',
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loading, isAuthenticated, shareToken, backendUser, joinSeriesByShareToken, navigate]);

  if (!shareToken) {
    return <Navigate to="/sessions" replace />;
  }

  if (loading || isWaitingForSync) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-canvas text-ink-muted gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-forest-600" aria-hidden="true" />
        <span className="text-sm font-semibold">Abriendo próxima juntada…</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to={`/welcome?seriesInvite=${encodeURIComponent(shareToken)}`}
        replace
      />
    );
  }

  if (errorMsg || (backendSyncStatus === 'offline' && !backendUser)) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-canvas p-4">
        <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-6 text-center space-y-4 shadow-[var(--shadow-card)]">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-terracotta-50 text-terracotta-600">
            <AlertCircle className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h1 className="font-[var(--font-display)] text-xl font-bold text-ink">
              No se pudo abrir la juntada
            </h1>
            <p className="text-sm text-ink-muted">
              {errorMsg ?? 'No se pudo conectar con el servidor para validar el link.'}
            </p>
          </div>
          <Link
            to="/sessions"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-forest-600 px-5 text-sm font-bold text-white hover:bg-forest-700 transition"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Ir a Juntadas
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-canvas text-ink-muted gap-2">
      <Loader2 className="h-5 w-5 animate-spin text-forest-600" aria-hidden="true" />
      <span className="text-sm font-semibold">Abriendo próxima juntada…</span>
    </div>
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

            {/* Permanent recurring session series link */}
            <Route path="/s/:shareToken" element={<SeriesInviteRoute />} />

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
