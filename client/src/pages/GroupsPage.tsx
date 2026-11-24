import {
  AlertCircle,
  CalendarDays,
  Check,
  Copy,
  KeyRound,
  Library,
  Link2,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Shield,
  ShieldCheck,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { GuestLockedView } from '../components/auth/GuestLockedView';
import { OwnerAvatarStack } from '../components/ui/OwnerAvatarStack';
import { useAppState } from '../context/AppStateContext';
import { useAuth } from '../context/AuthContext';

export function GroupsPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const {
    currentUser,
    isBootstrapping,
    groups,
    activeGroupId,
    setActiveGroupId,
    sessions,
    createGroup,
    joinGroupByCode,
    regenerateInviteCode,
    toggleMemberRole,
    removeGroupMember,
    getUserOwnedGameCount,
    getGroupGameCount,
  } = useAppState();

  const [searchParams, setSearchParams] = useSearchParams();
  const { inviteCode: routeInviteCode } = useParams<{ inviteCode?: string }>();

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(activeGroupId);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copiedType, setCopiedType] = useState<'code' | 'link' | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedGroupId && activeGroupId) {
      setSelectedGroupId(activeGroupId);
    }
  }, [activeGroupId, selectedGroupId]);

  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'create') {
      setCreateModalOpen(true);
      setSearchParams({}, { replace: true });
    } else if (action === 'join') {
      setJoinModalOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (routeInviteCode) {
      setJoinCodeInput(routeInviteCode.toUpperCase());
      setJoinModalOpen(true);
    }
  }, [routeInviteCode]);

  const selectedGroup =
    groups.find((g) => g.id === selectedGroupId) ??
    groups.find((g) => g.id === activeGroupId) ??
    groups[0] ??
    null;

  const showToast = (message: string) => {
    setErrorMsg(null);
    setFeedback(message);
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleCopy = (type: 'code' | 'link') => {
    if (!selectedGroup) return;
    const text =
      type === 'code'
        ? selectedGroup.inviteCode
        : `${window.location.origin}/join/${selectedGroup.inviteCode}`;
    void navigator.clipboard?.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const created = await createGroup(newGroupName.trim());
      setSelectedGroupId(created.id);
      setNewGroupName('');
      setCreateModalOpen(false);
      showToast(`¡Grupo "${created.name}" creado! Compartí el código ${created.inviteCode}.`);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'No se pudo crear el grupo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const { group, alreadyMember } = await joinGroupByCode(joinCodeInput.trim());
      setSelectedGroupId(group.id);
      setJoinCodeInput('');
      setJoinModalOpen(false);
      showToast(
        alreadyMember
          ? `Ya eras parte de "${group.name}". Lo activamos para vos.`
          : `¡Te sumaste a "${group.name}"! Ya podés ver sus juntadas y pool.`,
      );
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Código de invitación inválido.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSafeAction = async (fn: () => Promise<void>) => {
    setErrorMsg(null);
    try {
      await fn();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'No se pudo completar la acción.');
    }
  };

  const myMembership = selectedGroup?.members.find(
    (m) => m.user.id === currentUser.id,
  );
  const isAdmin = myMembership?.role === 'admin';
  const groupSessionsCount = selectedGroup
    ? sessions.filter((s) => s.groupId === selectedGroup.id).length
    : 0;
  const groupGamesCount = selectedGroup ? getGroupGameCount(selectedGroup.id) : 0;

  if (!authLoading && !isAuthenticated) {
    return (
      <GuestLockedView
        eyebrow="Mesas habituales"
        pageTitle="Mis Grupos"
        pageSubtitle="Armá tus grupos de juego, compartí códigos de invitación y gestioná miembros."
        icon={Users}
        lockTitle="Los grupos requieren una cuenta"
        lockDescription="En modo invitado no podés ver ni crear grupos. Iniciá sesión o registrate para armar tus mesas habituales y cruzar ludotecas con tus amigos."
        benefits={[
          'Creá grupos privados y compartí links de invitación por WhatsApp.',
          'Sumá las colecciones de todos los integrantes automáticamente.',
          'Administrá miembros, roles y el grupo activo en cada juntada.',
        ]}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-forest-600">
            Mesas habituales
          </span>
          <h1 className="font-[var(--font-display)] text-3xl sm:text-4xl font-bold tracking-tight text-ink">
            Mis Grupos
          </h1>
          <p className="text-sm sm:text-base text-ink-muted max-w-xl">
            Armá tus grupos de juego, compartí el código de invitación por WhatsApp y
            cambiá de grupo activo cuando quieras.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              setJoinModalOpen(true);
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-bold text-ink hover:border-border-strong hover:bg-canvas-subtle transition"
          >
            <KeyRound className="h-4 w-4 text-forest-600" aria-hidden="true" />
            Unirme con código
          </button>

          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              setCreateModalOpen(true);
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-forest-600 px-4.5 text-sm font-bold text-white shadow-xs hover:bg-forest-700 transition"
          >
            <Plus className="h-4.5 w-4.5" aria-hidden="true" />
            Crear grupo
          </button>
        </div>
      </header>

      {/* Feedback & Error Banners */}
      {feedback && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-2xl border border-forest-200 bg-forest-50 px-4 py-3 text-sm font-semibold text-forest-900"
        >
          <Check className="h-4 w-4 shrink-0 text-forest-600" aria-hidden="true" />
          <span>{feedback}</span>
        </div>
      )}

      {errorMsg && !createModalOpen && !joinModalOpen && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-2xl border border-terracotta-200 bg-terracotta-50 px-4 py-3 text-xs font-semibold text-terracotta-700"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      {isBootstrapping ? (
        <div className="flex items-center justify-center py-16 text-ink-muted gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-forest-600" aria-hidden="true" />
          <span className="text-sm font-semibold">Cargando grupos…</span>
        </div>
      ) : !selectedGroup ? (
        <div className="rounded-3xl border border-dashed border-border-strong bg-surface/80 px-6 py-14 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-50 text-forest-700">
            <Users className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="font-[var(--font-display)] text-2xl font-bold text-ink">
              Todavía no estás en ningún grupo
            </h2>
            <p className="text-sm text-ink-muted max-w-md mx-auto">
              Creá tu primer grupo para invitar amigos con un código y cruzar sus ludotecas
              de BGG en cada juntada.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-forest-600 px-5 text-sm font-bold text-white hover:bg-forest-700 transition"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Crear mi primer grupo
            </button>
            <button
              type="button"
              onClick={() => setJoinModalOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-bold text-ink hover:bg-canvas-subtle transition"
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              Tengo un código
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-12 items-start">
          {/* Groups List */}
          <section className="lg:col-span-5 space-y-3" aria-label="Lista de tus grupos">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-ink-subtle">
              Tus grupos ({groups.length})
            </h2>

            <div className="space-y-2.5">
              {groups.map((group) => {
                const isSelected = group.id === selectedGroup.id;
                const isActive = group.id === activeGroupId;
                const gamesCount = getGroupGameCount(group.id);
                const myRole = group.members.find(
                  (m) => m.user.id === currentUser.id,
                )?.role;

                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setSelectedGroupId(group.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      isSelected
                        ? 'border-forest-600 bg-surface shadow-[var(--shadow-card-hover)] ring-1 ring-forest-600/20'
                        : 'border-border bg-surface/80 hover:border-border-strong hover:bg-surface'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          {isActive && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-forest-600 px-2 py-0.5 text-[10px] font-bold text-white">
                              Grupo activo
                            </span>
                          )}
                          {myRole === 'admin' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-ochre-50 border border-ochre-100 px-2 py-0.5 text-[10px] font-bold text-ochre-700">
                              Admin
                            </span>
                          )}
                        </div>
                        <h3 className="font-[var(--font-display)] text-lg font-bold text-ink truncate">
                          {group.name}
                        </h3>
                      </div>

                      <span className="rounded-lg bg-canvas px-2 py-1 text-[11px] font-bold text-ink-muted num-tabular border border-border">
                        {group.inviteCode}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <OwnerAvatarStack
                        owners={group.members.map((m) => m.user)}
                        maxVisible={4}
                        showNames={false}
                      />
                      <span className="text-xs font-semibold text-ink-muted num-tabular">
                        {group.members.length}{' '}
                        {group.members.length === 1 ? 'miembro' : 'miembros'} · {gamesCount}{' '}
                        juegos
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Selected Group Management Panel */}
          <section className="lg:col-span-7 rounded-3xl border border-border bg-surface p-5 sm:p-6 shadow-[var(--shadow-card)] space-y-6">
            {/* Group Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-forest-600">
                    Gestión del grupo
                  </span>
                  {selectedGroup.id === activeGroupId && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-forest-50 border border-forest-200 px-2.5 py-0.5 text-[11px] font-bold text-forest-700">
                      <Check className="h-3 w-3" aria-hidden="true" />
                      Activo en la app
                    </span>
                  )}
                </div>
                <h2 className="mt-1 font-[var(--font-display)] text-2xl sm:text-3xl font-bold text-ink">
                  {selectedGroup.name}
                </h2>
              </div>

              {selectedGroup.id !== activeGroupId ? (
                <button
                  type="button"
                  onClick={() => {
                    setActiveGroupId(selectedGroup.id);
                    showToast(`Cambiaste el grupo activo a "${selectedGroup.name}".`);
                  }}
                  className="self-start inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-forest-600 px-4 text-xs font-bold text-white hover:bg-forest-700 transition"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Activar este grupo
                </button>
              ) : (
                <Link
                  to="/sessions"
                  className="self-start inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-canvas px-3.5 text-xs font-bold text-ink hover:border-border-strong transition"
                >
                  <CalendarDays className="h-3.5 w-3.5 text-forest-600" aria-hidden="true" />
                  Ver sus juntadas
                </Link>
              )}
            </div>

            {/* 3 Quick Metrics */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-2xl border border-border bg-canvas/70 p-3">
                <span className="flex items-center gap-1 text-[11px] font-bold text-ink-subtle">
                  <Users className="h-3.5 w-3.5" aria-hidden="true" />
                  Miembros
                </span>
                <p className="mt-1 text-xl font-extrabold text-ink num-tabular">
                  {selectedGroup.members.length}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-canvas/70 p-3">
                <span className="flex items-center gap-1 text-[11px] font-bold text-ink-subtle">
                  <Library className="h-3.5 w-3.5" aria-hidden="true" />
                  Ludoteca
                </span>
                <p className="mt-1 text-xl font-extrabold text-forest-700 num-tabular">
                  {groupGamesCount}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-canvas/70 p-3">
                <span className="flex items-center gap-1 text-[11px] font-bold text-ink-subtle">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                  Juntadas
                </span>
                <p className="mt-1 text-xl font-extrabold text-terracotta-600 num-tabular">
                  {groupSessionsCount}
                </p>
              </div>
            </div>

            {/* Invite Code Card */}
            <div className="rounded-2xl border border-forest-200 bg-forest-50/60 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-forest-900">
                    Invitar amigos al grupo
                  </h3>
                  <p className="text-xs text-forest-700">
                    Quien ingrese con este código suma automáticamente su ludoteca de BGG al
                    grupo.
                  </p>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() =>
                      void handleSafeAction(async () => {
                        const nextCode = await regenerateInviteCode(selectedGroup.id);
                        showToast(`Código actualizado a ${nextCode}.`);
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-forest-700 hover:bg-forest-100 transition"
                  >
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                    Regenerar
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                <div className="flex-1 rounded-xl border border-forest-200 bg-surface px-4 py-2.5 font-mono text-base font-extrabold tracking-widest text-forest-900 num-tabular">
                  {selectedGroup.inviteCode}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy('code')}
                    className="flex-1 sm:flex-none inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-forest-200 bg-surface px-3.5 text-xs font-bold text-forest-800 hover:bg-forest-50 transition"
                  >
                    {copiedType === 'code' ? (
                      <>
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        Código
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy('link')}
                    className="flex-1 sm:flex-none inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-forest-600 px-3.5 text-xs font-bold text-white hover:bg-forest-700 transition"
                  >
                    {copiedType === 'link' ? (
                      <>
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        Link copiado
                      </>
                    ) : (
                      <>
                        <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Copiar link
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Members Roster */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-ink-subtle">
                  Miembros y aporte a la ludoteca
                </h3>
                <span className="text-[11px] text-ink-subtle">
                  {isAdmin ? 'Podés gestionar roles' : 'Vista de miembro'}
                </span>
              </div>

              <ul className="divide-y divide-border rounded-2xl border border-border bg-canvas/40">
                {selectedGroup.members.map((member) => {
                  const isMe = member.user.id === currentUser.id;
                  const ownedCount = getUserOwnedGameCount(member.user.id);

                  return (
                    <li
                      key={member.user.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3.5"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-2xs"
                          style={{ backgroundColor: member.user.accentColor }}
                        >
                          {member.user.initials}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-ink truncate">
                              {member.user.displayName}
                              {isMe && (
                                <span className="ml-1 text-xs font-medium text-ink-subtle">
                                  (vos)
                                </span>
                              )}
                            </p>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                member.role === 'admin'
                                  ? 'bg-ochre-50 text-ochre-700 border border-ochre-100'
                                  : 'bg-canvas-deep text-ink-muted'
                              }`}
                            >
                              {member.role === 'admin' ? (
                                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                              ) : (
                                <Shield className="h-3 w-3" aria-hidden="true" />
                              )}
                              {member.role === 'admin' ? 'Admin' : 'Miembro'}
                            </span>
                          </div>
                          <p className="text-xs text-ink-subtle num-tabular">
                            {member.user.bggUsername ? `@${member.user.bggUsername} · ` : ''}
                            Aporta <strong className="text-ink-muted">{ownedCount}</strong>{' '}
                            juegos
                          </p>
                        </div>
                      </div>

                      {/* Member Actions */}
                      <div className="flex items-center gap-1.5">
                        {isAdmin && !isMe && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                void handleSafeAction(() =>
                                  toggleMemberRole(selectedGroup.id, member.user.id),
                                )
                              }
                              className="inline-flex min-h-8 items-center rounded-lg border border-border bg-surface px-2.5 text-[11px] font-bold text-ink-muted hover:border-border-strong hover:text-ink transition"
                            >
                              {member.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleSafeAction(() =>
                                  removeGroupMember(selectedGroup.id, member.user.id),
                                )
                              }
                              aria-label={`Quitar a ${member.user.displayName}`}
                              title="Quitar del grupo"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-ink-subtle hover:border-terracotta-200 hover:bg-terracotta-50 hover:text-terracotta-600 transition"
                            >
                              <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </>
                        )}

                        {isMe && (
                          <button
                            type="button"
                            onClick={() =>
                              void handleSafeAction(async () => {
                                await removeGroupMember(selectedGroup.id, currentUser.id);
                                showToast(`Saliste del grupo "${selectedGroup.name}".`);
                              })
                            }
                            className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-border bg-surface px-2.5 text-[11px] font-bold text-terracotta-600 hover:bg-terracotta-50 transition"
                          >
                            <LogOut className="h-3 w-3" aria-hidden="true" />
                            Salir
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        </div>
      )}

      {/* Modal: Create Group */}
      {createModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-group-title"
        >
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setCreateModalOpen(false)}
            className="fixed inset-0 bg-ink/45 backdrop-blur-[2px]"
          />
          <form
            onSubmit={(e) => void handleCreateSubmit(e)}
            className="relative z-10 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-border bg-surface p-5 shadow-[var(--shadow-floating)] space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-forest-600">
                  Nuevo espacio compartido
                </span>
                <h2
                  id="create-group-title"
                  className="font-[var(--font-display)] text-xl font-bold text-ink"
                >
                  Crear grupo de juegos
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                aria-label="Cerrar"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-canvas-subtle"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {errorMsg && (
              <div className="flex items-center gap-2 rounded-xl border border-terracotta-200 bg-terracotta-50 px-3 py-2 text-xs font-semibold text-terracotta-700">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="new-group-name"
                className="block text-xs font-bold uppercase tracking-wider text-ink-muted"
              >
                Nombre del grupo
              </label>
              <input
                id="new-group-name"
                type="text"
                required
                minLength={2}
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Ej. Los Meeples del Viernes"
                className="w-full min-h-11 rounded-xl border border-border bg-canvas/70 px-3.5 text-sm text-ink placeholder:text-ink-subtle focus:border-forest-600 focus:bg-surface focus:outline-none"
                autoFocus
              />
              <p className="text-xs text-ink-subtle">
                Generaremos un código único y un link de invitación apenas lo crees.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="min-h-10 rounded-xl border border-border px-4 text-xs font-semibold text-ink-muted hover:bg-canvas-subtle"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-forest-600 px-4.5 text-xs font-bold text-white hover:bg-forest-700 disabled:opacity-70"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Crear grupo
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Join Group by Code */}
      {joinModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="join-group-title"
        >
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setJoinModalOpen(false)}
            className="fixed inset-0 bg-ink/45 backdrop-blur-[2px]"
          />
          <form
            onSubmit={(e) => void handleJoinSubmit(e)}
            className="relative z-10 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-border bg-surface p-5 shadow-[var(--shadow-floating)] space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-forest-600">
                  Invitación
                </span>
                <h2
                  id="join-group-title"
                  className="font-[var(--font-display)] text-xl font-bold text-ink"
                >
                  Unirme con código
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setJoinModalOpen(false)}
                aria-label="Cerrar"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-canvas-subtle"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {errorMsg && (
              <div className="flex items-center gap-2 rounded-xl border border-terracotta-200 bg-terracotta-50 px-3 py-2 text-xs font-semibold text-terracotta-700">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-2">
              <label
                htmlFor="join-group-code"
                className="block text-xs font-bold uppercase tracking-wider text-ink-muted"
              >
                Código del grupo
              </label>
              <input
                id="join-group-code"
                type="text"
                required
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="Ej. MEEPLE-7K4Q"
                className="w-full min-h-11 rounded-xl border border-border bg-canvas/70 px-3.5 font-mono text-base font-bold uppercase tracking-wider text-ink placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-subtle focus:border-forest-600 focus:bg-surface focus:outline-none"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setJoinModalOpen(false)}
                className="min-h-10 rounded-xl border border-border px-4 text-xs font-semibold text-ink-muted hover:bg-canvas-subtle"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-forest-600 px-4.5 text-xs font-bold text-white hover:bg-forest-700 disabled:opacity-70"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Unirme al grupo
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
