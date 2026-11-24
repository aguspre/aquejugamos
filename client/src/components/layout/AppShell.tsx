import {
  CalendarDays,
  CheckCircle2,
  CloudOff,
  Dices,
  History,
  Library,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAppState } from '../../context/AppStateContext';
import { useAuth } from '../../context/AuthContext';
import { GroupSwitcher } from '../groups/GroupSwitcher';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const {
    currentUser,
    groups,
    activeGroup,
    library,
    sessions,
    playLogs,
    openLogPlayModal,
  } = useAppState();
  const {
    isAuthenticated,
    isGuestSession,
    guestScope,
    firebaseUser,
    backendSyncStatus,
    backendSyncError,
    loading: authLoading,
    openAuthModal,
    signOut,
    refreshBackendSync,
  } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const votingCount = sessions.filter(
    (s) =>
      s.status === 'voting' &&
      (!activeGroup || s.groupId === activeGroup.id || s.groupId === null),
  ).length;

  const activeGroupPlayCount = activeGroup
    ? playLogs.filter((l) => l.groupId === activeGroup.id).length
    : playLogs.length;

  const desktopNavItems = [
    {
      to: '/sessions',
      label: 'Juntadas',
      shortLabel: 'Juntadas',
      icon: CalendarDays,
      badge: votingCount > 0 ? String(votingCount) : undefined,
      badgeTone: 'terracotta' as const,
      locked: false,
    },
    {
      to: '/library',
      label: 'Mi Ludoteca',
      shortLabel: 'Ludoteca',
      icon: Library,
      badge: isAuthenticated ? String(library.length) : undefined,
      badgeTone: 'neutral' as const,
      locked: !isAuthenticated,
    },
    {
      to: '/history',
      label: 'Historial',
      shortLabel: 'Historial',
      icon: History,
      badge: isAuthenticated ? String(activeGroupPlayCount) : undefined,
      badgeTone: 'neutral' as const,
      locked: !isAuthenticated,
    },
    {
      to: '/groups',
      label: 'Mis Grupos',
      shortLabel: 'Grupos',
      icon: Users,
      badge: isAuthenticated ? String(groups.length) : undefined,
      badgeTone: 'neutral' as const,
      locked: !isAuthenticated,
    },
  ];

  const mobileNavItems = desktopNavItems;

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-68 lg:shrink-0 lg:flex-col lg:fixed lg:inset-y-0 border-r border-border bg-[#FDFBF7]">
        {/* Brand Header */}
        <div className="px-5 pt-6 pb-5">
          <NavLink to="/sessions" className="flex items-center gap-3 group">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest-600 text-white shadow-sm transition-transform group-hover:rotate-[-4deg]">
              <Dices className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <span className="block font-[var(--font-display)] text-lg font-bold leading-tight text-ink tracking-tight">
                ¿A qué jugamos?
              </span>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                Ludoteca Colaborativa
              </span>
            </div>
          </NavLink>

          {/* Interactive Active Group Switcher */}
          <div className="mt-5">
            <GroupSwitcher variant="sidebar" />
          </div>
        </div>

        {/* Navigation Links (menu always intact; locked indicator when unauthenticated) */}
        <nav aria-label="Navegación principal" className="flex-1 px-3 space-y-1">
          {desktopNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                    isActive
                      ? 'bg-forest-600 text-white shadow-xs'
                      : 'text-ink-muted hover:bg-canvas-subtle hover:text-ink'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="flex items-center gap-3">
                      <Icon className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
                      <span>{item.label}</span>
                    </span>
                    {item.locked ? (
                      <span
                        title="Requiere iniciar sesión"
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-canvas-deep/80 text-ink-subtle'
                        }`}
                      >
                        <Lock className="h-3 w-3" aria-hidden="true" />
                        <span className="sr-only">Bloqueado para invitados</span>
                      </span>
                    ) : item.badge ? (
                      <span
                        className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold num-tabular ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : item.badgeTone === 'terracotta'
                              ? 'bg-terracotta-100 text-terracotta-700'
                              : 'bg-canvas-deep text-ink-muted'
                        }`}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </>
                )}
              </NavLink>
            );
          })}

          {/* Quick Log Play CTA */}
          <div className="pt-4 px-0.5">
            <button
              type="button"
              onClick={() => openLogPlayModal()}
              className={`w-full inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold transition ${
                isAuthenticated
                  ? 'border-terracotta-200 bg-terracotta-50 text-terracotta-700 hover:bg-terracotta-100'
                  : 'border-border bg-canvas-subtle/80 text-ink-muted hover:bg-canvas-deep hover:text-ink'
              }`}
            >
              {isAuthenticated ? (
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Lock className="h-3.5 w-3.5 text-ink-subtle" aria-hidden="true" />
              )}
              Registrar partida
            </button>
          </div>
        </nav>

        {/* User Footer */}
        <div className="p-4 border-t border-border space-y-2.5">
          {isAuthenticated ? (
            <div className="rounded-xl bg-surface border border-border/80 p-2.5 space-y-2.5">
              <div className="flex items-center gap-3">
                {currentUser.avatarUrl ? (
                  <img
                    src={currentUser.avatarUrl}
                    alt={currentUser.displayName}
                    referrerPolicy="no-referrer"
                    className="h-9 w-9 shrink-0 rounded-full object-cover border border-border"
                  />
                ) : (
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: currentUser.accentColor }}
                  >
                    {currentUser.initials}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink truncate">
                    {currentUser.displayName}
                  </p>
                  <p className="text-[11px] font-medium text-ink-muted truncate">
                    {currentUser.bggUsername
                      ? `@${currentUser.bggUsername} · BGG`
                      : firebaseUser?.email}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-border/70 pt-2">
                {backendSyncStatus === 'synced' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-forest-600">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>Cuenta conectada</span>
                  </span>
                )}
                {backendSyncStatus === 'syncing' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-muted">
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
                    <span>Sincronizando...</span>
                  </span>
                )}
                {backendSyncStatus === 'offline' && (
                  <button
                    type="button"
                    onClick={() => void refreshBackendSync()}
                    title={backendSyncError ?? 'Reintentar sincronización con el servidor'}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-ochre-700 hover:underline truncate"
                  >
                    <CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">Reintentar API</span>
                  </button>
                )}
                {backendSyncStatus === 'idle' && (
                  <span className="text-[11px] font-medium text-ink-subtle">
                    Firebase activo
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-ink-muted hover:bg-canvas-subtle hover:text-terracotta-600 transition shrink-0"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Salir</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-xl bg-surface border border-border/80 p-2.5 space-y-2">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: currentUser.accentColor }}
                  >
                    {currentUser.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink truncate">
                      {currentUser.displayName}
                    </p>
                    <p className="text-[11px] font-medium text-ink-subtle truncate">
                      {isGuestSession
                        ? `Invitado${guestScope?.groupName ? ` · ${guestScope.groupName}` : ''}`
                        : 'Modo invitado limitado'}
                    </p>
                  </div>
                </div>

                {isGuestSession && (
                  <div className="flex items-center justify-between border-t border-border/70 pt-2">
                    <span className="text-[11px] font-semibold text-terracotta-600">
                      Juntada, propuestas y voto
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleSignOut()}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-ink-muted hover:bg-canvas-subtle hover:text-terracotta-600 transition shrink-0"
                    >
                      <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Salir</span>
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={authLoading}
                onClick={() => openAuthModal('signin')}
                className="w-full inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-forest-600 px-3 text-xs font-bold text-white shadow-xs hover:bg-forest-700 disabled:opacity-60 transition"
              >
                <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Iniciar sesión</span>
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Mobile Top Header with Interactive Group Switcher */}
      <header className="sticky top-0 z-30 flex lg:hidden items-center justify-between gap-2 border-b border-border/80 bg-canvas/92 px-3.5 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-2 min-w-0">
          <NavLink
            to="/sessions"
            aria-label="Inicio ¿A qué jugamos?"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-forest-600 text-white shadow-xs"
          >
            <Dices className="h-4.5 w-4.5" aria-hidden="true" />
          </NavLink>
          <GroupSwitcher variant="mobile-header" />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isAuthenticated ? (
            <>
              {currentUser.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.displayName}
                  referrerPolicy="no-referrer"
                  className="h-8 w-8 rounded-full object-cover border border-border"
                />
              ) : (
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ backgroundColor: currentUser.accentColor }}
                  title={currentUser.displayName}
                >
                  {currentUser.initials}
                </span>
              )}
              <button
                type="button"
                onClick={() => void handleSignOut()}
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-ink-muted hover:text-terracotta-600 transition"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-1.5">
              {isGuestSession && (
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  aria-label="Salir del modo invitado"
                  title="Salir del modo invitado"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-ink-muted hover:text-terracotta-600 transition"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                disabled={authLoading}
                onClick={() => openAuthModal('signin')}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-forest-600 px-3 py-1 text-xs font-bold text-white shadow-xs hover:bg-forest-700 disabled:opacity-60 transition"
              >
                <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Ingresar</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 lg:pl-68">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 pb-28 lg:pb-12">
          {!authLoading && !isAuthenticated && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-forest-200 bg-forest-50/80 px-4 py-3 text-xs text-forest-900">
              <div className="flex items-center gap-2 min-w-0">
                <Dices className="h-4 w-4 shrink-0 text-forest-600" aria-hidden="true" />
                <span className="font-medium">
                  {isGuestSession
                    ? `Entraste como invitado (${currentUser.displayName}) para acceder a la juntada, proponer juegos y votar. Iniciá sesión para desbloquear tu ludoteca, grupos e historial.`
                    : 'Estás en modo invitado limitado. Iniciá sesión para crear grupos, importar tu ludoteca y ver el historial.'}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  to="/welcome"
                  className="inline-flex min-h-8 items-center rounded-lg px-2.5 py-1 text-xs font-semibold text-forest-700 hover:bg-forest-100/80 transition"
                >
                  Ver portada
                </Link>
                <button
                  type="button"
                  onClick={() => openAuthModal('signin')}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-forest-600 px-3 py-1 text-xs font-bold text-white hover:bg-forest-700 transition shrink-0"
                >
                  <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                  Iniciar sesión
                </button>
              </div>
            </div>
          )}
          {isAuthenticated && backendSyncStatus === 'offline' && (
            <div
              role="status"
              className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ochre-200 bg-ochre-50 px-4 py-3 text-xs text-ochre-700"
            >
              <div className="flex items-center gap-2 min-w-0">
                <CloudOff className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="font-medium">
                  {backendSyncError ??
                    'Sesión iniciada en Firebase, pero el backend todavía no sincronizó tu perfil.'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void refreshBackendSync()}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-ochre-500 px-3 py-1 text-xs font-bold text-white hover:bg-ochre-700 transition shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Reintentar conexión
              </button>
            </div>
          )}
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation (keeps all 4 sections accessible in the menu) */}
      <nav
        aria-label="Navegación inferior"
        className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 lg:hidden border-t border-border bg-surface/95 backdrop-blur-md shadow-[0_-4px_20px_rgba(31,36,33,0.06)]"
      >
        <ul className="mx-auto grid max-w-md grid-cols-4 gap-1 pt-1.5">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[11px] font-semibold transition ${
                      isActive
                        ? 'text-forest-700'
                        : 'text-ink-subtle hover:text-ink'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`relative flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                          isActive ? 'bg-forest-100 text-forest-700' : ''
                        }`}
                      >
                        <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                        {item.locked ? (
                          <span className="absolute right-1.5 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-canvas-deep text-ink-subtle ring-1 ring-surface">
                            <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                          </span>
                        ) : item.badgeTone === 'terracotta' && item.badge ? (
                          <span className="absolute right-2.5 top-1 h-2 w-2 rounded-full bg-terracotta-500 ring-2 ring-surface" />
                        ) : null}
                      </span>
                      <span>{item.shortLabel}</span>
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
