import {
  ArrowRight,
  CalendarDays,
  Check,
  Crown,
  Link2,
  Loader2,
  Lock,
  LogIn,
  MapPin,
  Plus,
  UserPlus,
  Vote,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CreateSessionModal } from '../components/sessions/CreateSessionModal';
import { OwnerAvatarStack } from '../components/ui/OwnerAvatarStack';
import { useAppState } from '../context/AppStateContext';
import { useAuth } from '../context/AuthContext';
import type { GameSession, SessionStatus, VotingMode } from '../types/domain';
import { formatSessionDate } from '../utils/formatDate';

const STATUS_META: Record<
  SessionStatus,
  { label: string; className: string }
> = {
  planning: {
    label: 'Planificando',
    className: 'bg-teal-50 text-teal-700 border-teal-100',
  },
  voting: {
    label: 'Votación abierta',
    className: 'bg-terracotta-50 text-terracotta-700 border-terracotta-100',
  },
  locked: {
    label: 'Votación cerrada',
    className: 'bg-forest-50 text-forest-700 border-forest-200',
  },
  completed: {
    label: 'Finalizada',
    className: 'bg-canvas-subtle text-ink-muted border-border',
  },
  cancelled: {
    label: 'Cancelada',
    className: 'bg-canvas-subtle text-ink-subtle border-border',
  },
};

const VOTING_MODE_LABEL: Record<VotingMode, string> = {
  single_choice: 'Voto simple (1)',
  multi_vote: 'Multi-voto',
  ranked_top3: 'Top 3 Rankeado',
};

export function SessionsHubPage() {
  const { isAuthenticated, isGuestSession, guestScope, openAuthModal } = useAuth();
  const { isBootstrapping, activeGroup, sessions, createSession } = useAppState();
  const [createOpen, setCreateOpen] = useState(false);
  const [scope, setScope] = useState<'group' | 'all'>('group');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const navigate = useNavigate();

  const visibleSessions =
    scope === 'all' || !activeGroup
      ? sessions
      : sessions.filter(
          (s) => s.groupId === activeGroup.id || s.groupId === null,
        );

  const upcoming = visibleSessions.filter(
    (s) => s.status === 'planning' || s.status === 'voting' || s.status === 'locked',
  );
  const past = visibleSessions.filter(
    (s) => s.status === 'completed' || s.status === 'cancelled',
  );

  const handleCopyInvite = (session: GameSession) => {
    const url = `${window.location.origin}/sessions/${session.id}?invite=${session.inviteToken}`;
    void navigator.clipboard?.writeText(url);
    setCopiedId(session.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-forest-600">
              {isGuestSession && guestScope?.groupName
                ? `Invitado en ${guestScope.groupName}`
                : scope === 'group' && activeGroup
                  ? activeGroup.name
                  : isAuthenticated
                    ? 'Todas tus juntadas'
                    : 'Modo invitado'}
            </span>
            {isAuthenticated && (
              <Link
                to="/groups"
                className="text-xs font-semibold text-ink-subtle underline hover:text-forest-600"
              >
                Gestionar grupos
              </Link>
            )}
          </div>
          <h1 className="font-[var(--font-display)] text-3xl sm:text-4xl font-bold tracking-tight text-ink">
            Juntadas
          </h1>
          <p className="text-sm sm:text-base text-ink-muted max-w-xl">
            Confirmá asistencia, cruzá las colecciones de quienes van y votá qué sale a la
            mesa.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          {activeGroup && (
            <div className="inline-flex rounded-xl border border-border bg-surface p-0.5">
              <button
                type="button"
                onClick={() => setScope('group')}
                className={`min-h-9 rounded-lg px-3 text-xs font-bold transition ${
                  scope === 'group'
                    ? 'bg-forest-50 text-forest-700'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                Grupo activo
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`min-h-9 rounded-lg px-3 text-xs font-bold transition ${
                  scope === 'all'
                    ? 'bg-forest-50 text-forest-700'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                Todas ({sessions.length})
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() =>
              isAuthenticated ? setCreateOpen(true) : openAuthModal('signin')
            }
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4.5 text-sm font-bold shadow-xs transition ${
              isAuthenticated
                ? 'bg-forest-600 text-white hover:bg-forest-700'
                : 'border border-border-strong bg-canvas-subtle text-ink-muted hover:bg-canvas-deep hover:text-ink'
            }`}
          >
            {isAuthenticated ? (
              <Plus className="h-4.5 w-4.5" aria-hidden="true" />
            ) : (
              <Lock className="h-4 w-4 text-ink-subtle" aria-hidden="true" />
            )}
            Nueva juntada
          </button>
        </div>
      </header>

      {isBootstrapping ? (
        <div className="flex items-center justify-center py-16 text-ink-muted gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-forest-600" aria-hidden="true" />
          <span className="text-sm font-semibold">Cargando juntadas…</span>
        </div>
      ) : upcoming.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border-strong bg-surface/80 px-6 py-14 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-50 text-forest-700">
            {isAuthenticated || isGuestSession ? (
              <CalendarDays className="h-6 w-6" aria-hidden="true" />
            ) : (
              <Lock className="h-6 w-6 text-terracotta-600" aria-hidden="true" />
            )}
          </div>
          <div className="space-y-1">
            <h2 className="font-[var(--font-display)] text-2xl font-bold text-ink">
              {isGuestSession
                ? `Todavía no hay juntadas activas${guestScope?.groupName ? ` en ${guestScope.groupName}` : ''}`
                : isAuthenticated
                  ? 'Todavía no hay juntadas programadas'
                  : 'Iniciá sesión o entrá con un link de invitación'}
            </h2>
            <p className="text-sm text-ink-muted max-w-md mx-auto">
              {isGuestSession
                ? 'Cuando el grupo publique una juntada, va a aparecer acá para que confirmes asistencia y votes.'
                : isAuthenticated
                  ? 'Creá una juntada para tu grupo o generá un link directo para que tus amigos confirmen asistencia y voten qué jugar.'
                  : 'En modo invitado no podés crear juntadas ni grupos. Si un amigo te compartió un link de invitación, abrilo para ingresar con tu nombre y votar.'}
            </p>
          </div>
          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-forest-600 px-5 text-sm font-bold text-white hover:bg-forest-700 transition"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Crear primera juntada
            </button>
          ) : (
            <div className="flex flex-wrap justify-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => openAuthModal('signin')}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-forest-600 px-5 text-sm font-bold text-white hover:bg-forest-700 transition"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Iniciar sesión
              </button>
              <button
                type="button"
                onClick={() => openAuthModal('signup')}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border-strong bg-surface px-5 text-sm font-bold text-ink hover:bg-canvas-subtle transition"
              >
                <UserPlus className="h-4 w-4 text-forest-600" aria-hidden="true" />
                Crear cuenta
              </button>
            </div>
          )}
        </div>
      ) : (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-ink-subtle">
              Próximas y en votación ({upcoming.length})
            </h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {upcoming.map((session) => {
              const going = session.participants.filter((p) => p.rsvp === 'going');
              const topProposal = [...session.proposals].sort(
                (a, b) => b.score - a.score || b.voteCount - a.voteCount,
              )[0];
              const statusMeta = STATUS_META[session.status];

              return (
                <article
                  key={session.id}
                  className="tabletop-card flex flex-col justify-between p-5 gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${statusMeta.className}`}
                      >
                        {session.status === 'voting' ? (
                          <Vote className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {statusMeta.label}
                      </span>

                      <span className="text-[11px] font-semibold text-ink-subtle num-tabular">
                        {VOTING_MODE_LABEL[session.votingMode]}
                        {session.votingMode === 'multi_vote'
                          ? ` (hasta ${session.maxVotesPerUser})`
                          : ''}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-[var(--font-display)] text-xl font-bold text-ink leading-snug">
                        <Link
                          to={`/sessions/${session.id}`}
                          className="card-primary-trigger hover:text-forest-600 transition-colors"
                        >
                          {session.title}
                        </Link>
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                        <span className="inline-flex items-center gap-1.5 font-medium num-tabular">
                          <CalendarDays
                            className="h-3.5 w-3.5 text-forest-600"
                            aria-hidden="true"
                          />
                          {formatSessionDate(session.scheduledAt)}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin
                            className="h-3.5 w-3.5 text-terracotta-500"
                            aria-hidden="true"
                          />
                          {session.location}
                        </span>
                      </div>
                    </div>

                    {topProposal ? (
                      <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-canvas/70 p-2.5">
                        <img
                          src={topProposal.game.thumbnailUrl}
                          alt=""
                          className="h-11 w-14 shrink-0 rounded-lg object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-ochre-700">
                            <Crown className="h-3 w-3 text-ochre-500" aria-hidden="true" />
                            {session.status === 'locked'
                              ? 'Elegido para jugar'
                              : 'Liderando'}
                          </p>
                          <p className="text-sm font-bold text-ink truncate">
                            {topProposal.game.name}
                          </p>
                        </div>
                        <div className="text-right shrink-0 pr-1">
                          <span className="block text-sm font-extrabold text-forest-700 num-tabular">
                            {topProposal.score}
                            {session.votingMode === 'ranked_top3' ? ' pts' : ''}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border-strong bg-canvas/50 px-3.5 py-2.5 text-xs text-ink-muted">
                        Todavía no hay juegos propuestos. ¡Entrá a la sala para proponer el
                        primero!
                      </div>
                    )}
                  </div>

                  <footer className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/80">
                    <OwnerAvatarStack
                      owners={going.map((p) => p.user)}
                      prefix={`${going.length} ${going.length === 1 ? 'confirmado' : 'confirmados'}`}
                      maxVisible={4}
                    />

                    <div className="card-elevated-action flex items-center gap-2">
                      {isAuthenticated && (
                        <button
                          type="button"
                          onClick={() => handleCopyInvite(session)}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-canvas px-2.5 text-xs font-semibold text-ink-muted hover:border-border-strong hover:text-ink transition"
                          title="Copiar link de invitación"
                        >
                          {copiedId === session.id ? (
                            <>
                              <Check
                                className="h-3.5 w-3.5 text-forest-600"
                                aria-hidden="true"
                              />
                              <span className="text-forest-700">Copiado</span>
                            </>
                          ) : (
                            <>
                              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Invitar</span>
                            </>
                          )}
                        </button>
                      )}

                      <Link
                        to={`/sessions/${session.id}`}
                        className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-forest-600 px-3 text-xs font-bold text-white hover:bg-forest-700 transition"
                      >
                        <span>{isAuthenticated ? 'Abrir sala' : 'Entrar y votar'}</span>
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    </div>
                  </footer>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Past Sessions */}
      {past.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-ink-subtle">
            Juntadas pasadas ({past.length})
          </h2>
          <div className="space-y-2.5">
            {past.map((session) => (
              <div
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface/80 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-bold text-ink">{session.title}</p>
                  <p className="text-xs text-ink-subtle num-tabular">
                    {formatSessionDate(session.scheduledAt)} · {session.location}
                  </p>
                </div>
                <Link
                  to={`/sessions/${session.id}`}
                  className="text-xs font-bold text-forest-600 hover:underline"
                >
                  Ver resumen
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <CreateSessionModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={async (input) => {
          const created = await createSession(input);
          navigate(`/sessions/${created.id}`);
        }}
      />
    </div>
  );
}
