import {
  Check,
  ChevronDown,
  KeyRound,
  Lock,
  LogIn,
  Plus,
  Settings2,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../../context/AppStateContext';
import { useAuth } from '../../context/AuthContext';
import { OwnerAvatarStack } from '../ui/OwnerAvatarStack';

interface GroupSwitcherProps {
  variant: 'sidebar' | 'mobile-header';
}

export function GroupSwitcher({ variant }: GroupSwitcherProps) {
  const { groups, activeGroup, setActiveGroupId } = useAppState();
  const { isAuthenticated, isGuestSession, guestScope, openAuthModal } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const handleSelectGroup = (groupId: string) => {
    setActiveGroupId(groupId);
    setOpen(false);
  };

  const handleNavigateAction = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const guestLabel =
    isGuestSession && guestScope?.groupName
      ? guestScope.groupName
      : 'Modo invitado';

  return (
    <div className="relative" ref={containerRef}>
      {variant === 'sidebar' ? (
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="w-full rounded-xl border border-border bg-canvas/85 p-3 text-left transition hover:border-border-strong hover:bg-surface"
        >
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">
              {isAuthenticated
                ? 'Grupo activo'
                : isGuestSession
                  ? 'Invitación activa'
                  : 'Grupos'}
            </span>
            {isAuthenticated && activeGroup ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-forest-50 px-2 py-0.5 text-[10px] font-bold text-forest-700 num-tabular">
                {activeGroup.members.length}{' '}
                {activeGroup.members.length === 1 ? 'miembro' : 'amigos'}
              </span>
            ) : !isAuthenticated ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-canvas-deep px-2 py-0.5 text-[10px] font-bold text-ink-muted">
                <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                Invitado
              </span>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-ink truncate">
              {isAuthenticated
                ? activeGroup
                  ? activeGroup.name
                  : 'Creá o unite a un grupo'
                : guestLabel}
            </p>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${
                open ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </div>

          {isAuthenticated && activeGroup && (
            <div className="mt-2">
              <OwnerAvatarStack
                owners={activeGroup.members.map((m) => m.user)}
                maxVisible={5}
                size="sm"
                showNames={false}
              />
            </div>
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="inline-flex min-h-8 max-w-[190px] items-center gap-1.5 rounded-full border border-border bg-surface/90 px-2.5 py-1 text-xs font-bold text-ink shadow-2xs transition hover:border-border-strong"
        >
          {isAuthenticated ? (
            <Users className="h-3.5 w-3.5 shrink-0 text-forest-600" aria-hidden="true" />
          ) : (
            <Lock className="h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-hidden="true" />
          )}
          <span className="truncate">
            {isAuthenticated
              ? activeGroup
                ? activeGroup.name
                : 'Mis grupos'
              : guestLabel}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-ink-subtle transition-transform ${
              open ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>
      )}

      {open && (
        <div
          role="menu"
          className={`absolute z-50 mt-2 rounded-2xl border border-border bg-surface p-2 shadow-[var(--shadow-floating)] ${
            variant === 'sidebar'
              ? 'left-0 right-0'
              : 'left-0 w-72 max-w-[calc(100vw-2rem)]'
          }`}
        >
          {!isAuthenticated ? (
            <div className="p-2 space-y-2.5">
              <div className="flex items-start gap-2">
                <Lock
                  className="h-4 w-4 shrink-0 text-terracotta-500 mt-0.5"
                  aria-hidden="true"
                />
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-ink">
                    Grupos bloqueados sin cuenta
                  </p>
                  <p className="text-[11px] text-ink-muted leading-snug">
                    {isGuestSession && guestScope?.groupName
                      ? `Tenés acceso como invitado solo a las juntadas de ${guestScope.groupName}.`
                      : 'Iniciá sesión para ver tus grupos o crear uno nuevo.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  openAuthModal('signin');
                }}
                className="w-full inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-forest-600 px-3 text-xs font-bold text-white hover:bg-forest-700 transition"
              >
                <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                Iniciar sesión
              </button>
            </div>
          ) : (
            <>
              <div className="px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-ink-subtle">
                Tus grupos ({groups.length})
              </div>

              {groups.length === 0 ? (
                <p className="px-2.5 py-2 text-xs text-ink-muted">
                  Todavía no formás parte de ningún grupo.
                </p>
              ) : (
                <div className="space-y-0.5 max-h-56 overflow-y-auto">
                  {groups.map((group) => {
                    const isSelected = group.id === activeGroup?.id;
                    return (
                      <button
                        key={group.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={isSelected}
                        onClick={() => handleSelectGroup(group.id)}
                        className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left transition ${
                          isSelected
                            ? 'bg-forest-50 text-forest-900'
                            : 'text-ink hover:bg-canvas-subtle'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">{group.name}</p>
                          <p className="text-[11px] text-ink-subtle num-tabular">
                            {group.members.length}{' '}
                            {group.members.length === 1 ? 'miembro' : 'miembros'} ·{' '}
                            {group.inviteCode}
                          </p>
                        </div>
                        {isSelected && (
                          <Check
                            className="h-4 w-4 shrink-0 text-forest-600"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="my-1.5 border-t border-border" />

              <div className="space-y-0.5">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleNavigateAction('/groups?action=create')}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-bold text-forest-700 hover:bg-forest-50 transition"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Crear nuevo grupo
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleNavigateAction('/groups?action=join')}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold text-ink hover:bg-canvas-subtle transition"
                >
                  <KeyRound className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
                  Unirme con código
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleNavigateAction('/groups')}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold text-ink-muted hover:bg-canvas-subtle hover:text-ink transition"
                >
                  <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Gestionar grupos y miembros
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
