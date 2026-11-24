import {
  CalendarDays,
  Dices,
  History,
  Library,
  Plus,
  RefreshCw,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAppState } from '../../context/AppStateContext';
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

  const votingCount = sessions.filter(
    (s) => s.status === 'voting' && (s.groupId === activeGroup.id || s.groupId === null),
  ).length;

  const activeGroupPlayCount = playLogs.filter(
    (l) => l.groupId === activeGroup.id,
  ).length;

  const desktopNavItems = [
    {
      to: '/sessions',
      label: 'Juntadas',
      shortLabel: 'Juntadas',
      icon: CalendarDays,
      badge: votingCount > 0 ? String(votingCount) : undefined,
      badgeTone: 'terracotta' as const,
    },
    {
      to: '/library',
      label: 'Mi Ludoteca',
      shortLabel: 'Ludoteca',
      icon: Library,
      badge: String(library.length),
      badgeTone: 'neutral' as const,
    },
    {
      to: '/history',
      label: 'Historial',
      shortLabel: 'Historial',
      icon: History,
      badge: String(activeGroupPlayCount),
      badgeTone: 'neutral' as const,
    },
    {
      to: '/groups',
      label: 'Mis Grupos',
      shortLabel: 'Grupos',
      icon: Users,
      badge: String(groups.length),
      badgeTone: 'neutral' as const,
    },
  ];

  const mobileNavItems = desktopNavItems.slice(0, 3);

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

        {/* Navigation Links */}
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
                    {item.badge && (
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
                    )}
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
              className="w-full inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-terracotta-200 bg-terracotta-50 px-3 text-xs font-bold text-terracotta-700 hover:bg-terracotta-100 transition"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Registrar partida
            </button>
          </div>
        </nav>

        {/* User Footer */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 rounded-xl bg-surface border border-border/80 p-2.5">
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
              <p className="flex items-center gap-1 text-[11px] font-medium text-forest-600 truncate">
                <RefreshCw className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>@{currentUser.bggUsername} · BGG</span>
              </p>
            </div>
          </div>
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
          <span className="hidden xs:inline-flex items-center gap-1 rounded-full border border-forest-200 bg-forest-50 px-2.5 py-1 text-[11px] font-bold text-forest-700">
            @{currentUser.bggUsername}
          </span>
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold text-white"
            style={{ backgroundColor: currentUser.accentColor }}
            title={currentUser.displayName}
          >
            {currentUser.initials}
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 lg:pl-68">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 pb-28 lg:pb-12">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation (3 clean items; Groups lives in Top Header Switcher) */}
      <nav
        aria-label="Navegación inferior"
        className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 lg:hidden border-t border-border bg-surface/95 backdrop-blur-md shadow-[0_-4px_20px_rgba(31,36,33,0.06)]"
      >
        <ul className="mx-auto grid max-w-md grid-cols-3 gap-1 pt-1.5">
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
                        className={`relative flex h-7 w-14 items-center justify-center rounded-full transition-colors ${
                          isActive ? 'bg-forest-100 text-forest-700' : ''
                        }`}
                      >
                        <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                        {item.badgeTone === 'terracotta' && item.badge && (
                          <span className="absolute right-3 top-1 h-2 w-2 rounded-full bg-terracotta-500 ring-2 ring-surface" />
                        )}
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
