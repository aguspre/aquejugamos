import {
  CalendarDays,
  Check,
  Clock,
  Crown,
  Dices,
  Flame,
  Ghost,
  History,
  Loader2,
  Plus,
  Trophy,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { mapUserSummary } from '../api/mappers';
import { GuestLockedView } from '../components/auth/GuestLockedView';
import { OwnerAvatarStack } from '../components/ui/OwnerAvatarStack';
import { useAppState } from '../context/AppStateContext';
import { useAuth } from '../context/AuthContext';
import type { Game } from '../types/domain';
import { formatShortDate } from '../utils/formatDate';

export function HistoryPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const {
    isBootstrapping,
    activeGroup,
    activeGroupStats,
    playLogs,
    sessions,
    openLogPlayModal,
    proposeGame,
  } = useAppState();

  const [proposedFeedbackId, setProposedFeedbackId] = useState<string | null>(null);

  const visiblePlayLogs = useMemo(
    () =>
      activeGroup
        ? playLogs.filter((l) => l.groupId === activeGroup.id)
        : playLogs,
    [playLogs, activeGroup],
  );

  const activeVotingSession = activeGroup
    ? sessions.find((s) => s.groupId === activeGroup.id && s.status === 'voting') ??
      sessions.find((s) => s.groupId === activeGroup.id) ??
      sessions[0]
    : sessions[0];

  const totalHours = activeGroupStats
    ? Math.round((activeGroupStats.totalDurationMinutes / 60) * 10) / 10
    : Math.round(
        (visiblePlayLogs.reduce((acc, l) => acc + l.durationMinutes, 0) / 60) * 10,
      ) / 10;

  const handleProposeShameGame = async (gameId: string, gameName: string) => {
    if (!activeVotingSession) return;
    const minimalGame: Game = {
      id: gameId,
      bggId: 0,
      name: gameName,
      yearPublished: 0,
      imageUrl: '',
      thumbnailUrl: '',
      minPlayers: 1,
      maxPlayers: 4,
      bestPlayers: [],
      playingTimeMinutes: 45,
      weight: 0,
      bggRating: 0,
      isExpansion: false,
      mechanics: [],
    };
    try {
      await proposeGame(
        activeVotingSession.id,
        minimalGame,
        '¡Salgamos de la pila de la vergüenza!',
      );
      setProposedFeedbackId(gameId);
      setTimeout(() => setProposedFeedbackId(null), 2500);
    } catch {
      // Ignore duplicate
    }
  };

  if (!authLoading && !isAuthenticated) {
    return (
      <GuestLockedView
        eyebrow="Estadísticas y partidas"
        pageTitle="Historial & Estadísticas"
        pageSubtitle="Registro de partidas del grupo, tabla de victorias y juegos sin estrenar."
        icon={History}
        lockTitle="El historial requiere una cuenta"
        lockDescription="En modo invitado no podés consultar el historial de partidas ni registrar resultados. Iniciá sesión para acceder a las estadísticas de tu grupo."
        benefits={[
          'Llevá el registro de todas las partidas jugadas con puntajes y ganadores.',
          'Consultá el ranking de victorias y los títulos más jugados del grupo.',
          'Descubrí la pila de la vergüenza con juegos aún sin estrenar.',
        ]}
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-forest-600">
            {activeGroup ? activeGroup.name : 'Tu historial personal'}
          </span>
          <h1 className="font-[var(--font-display)] text-3xl sm:text-4xl font-bold tracking-tight text-ink">
            Historial & Estadísticas
          </h1>
          <p className="text-sm sm:text-base text-ink-muted">
            Registro de partidas del grupo, tabla de victorias y juegos que todavía esperan
            su estreno en mesa.
          </p>
        </div>

        <button
          type="button"
          onClick={() => openLogPlayModal()}
          className="self-start sm:self-auto inline-flex min-h-11 items-center gap-2 rounded-xl bg-terracotta-500 px-4.5 text-sm font-bold text-white shadow-xs hover:bg-terracotta-600 transition"
        >
          <Plus className="h-4.5 w-4.5" aria-hidden="true" />
          Registrar partida
        </button>
      </header>

      {isBootstrapping ? (
        <div className="flex items-center justify-center py-16 text-ink-muted gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-forest-600" aria-hidden="true" />
          <span className="text-sm font-semibold">Cargando historial…</span>
        </div>
      ) : (
        <>
          {/* Mini-Dashboard (when active group exists) */}
          {activeGroup && activeGroupStats ? (
            <section className="grid gap-4 lg:grid-cols-3">
              {/* Card 1: Most Played */}
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)] flex flex-col justify-between gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-ink-subtle">
                    <Flame className="h-4 w-4 text-terracotta-500" aria-hidden="true" />
                    Más jugados
                  </h2>
                  <span className="rounded-full bg-canvas-subtle px-2.5 py-0.5 text-[11px] font-bold text-ink-muted num-tabular">
                    {activeGroupStats.totalPlays} partidas · {totalHours} h
                  </span>
                </div>

                {activeGroupStats.mostPlayedGames.length === 0 ? (
                  <p className="text-xs text-ink-subtle py-4">
                    Registrá la primera partida del grupo para ver el ranking.
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {activeGroupStats.mostPlayedGames.slice(0, 4).map((entry) => {
                      const maxCount =
                        activeGroupStats.mostPlayedGames[0]?.playCount ?? 1;
                      const pct = Math.round((entry.playCount / maxCount) * 100);
                      return (
                        <li key={entry.game.id} className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-bold text-ink truncate">
                              {entry.game.name}
                            </span>
                            <span className="font-extrabold text-forest-700 num-tabular shrink-0">
                              {entry.playCount}{' '}
                              {entry.playCount === 1 ? 'vez' : 'veces'}
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas-subtle">
                            <div
                              className="h-full rounded-full bg-forest-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Card 2: Win Leaderboard */}
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)] space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-ink-subtle">
                    <Trophy className="h-4 w-4 text-ochre-500" aria-hidden="true" />
                    Tabla de victorias
                  </h2>
                  <span className="text-[11px] font-medium text-ink-subtle">
                    {activeGroup.members.length} miembros
                  </span>
                </div>

                <ul className="space-y-2">
                  {activeGroupStats.winLeaderboard.map((row, idx) => {
                    const mappedUser = mapUserSummary(row.user);
                    return (
                      <li
                        key={mappedUser.id}
                        className="flex items-center justify-between gap-2 rounded-xl bg-canvas/60 px-2.5 py-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-4 text-center text-xs font-extrabold text-ink-subtle num-tabular">
                            {idx + 1}
                          </span>
                          <span
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                            style={{ backgroundColor: mappedUser.accentColor }}
                          >
                            {mappedUser.initials}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-ink truncate">
                              {mappedUser.displayName}
                            </p>
                            <p className="text-[10px] text-ink-subtle num-tabular">
                              {row.playedCount} jugadas · {row.winRate}% win rate
                            </p>
                          </div>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-ochre-50 border border-ochre-100 px-2.5 py-0.5 text-xs font-extrabold text-ochre-700 num-tabular">
                          <Crown className="h-3 w-3 text-ochre-500" aria-hidden="true" />
                          {row.winsCount}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Card 3: Shelf of Shame */}
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)] flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-ink-subtle">
                    <Ghost className="h-4 w-4 text-forest-600" aria-hidden="true" />
                    Pila de la vergüenza
                  </h2>
                  <span className="rounded-full bg-terracotta-50 px-2.5 py-0.5 text-[11px] font-bold text-terracotta-700 num-tabular">
                    {activeGroupStats.shelfOfShame.length} sin estrenar
                  </span>
                </div>

                {activeGroupStats.shelfOfShame.length === 0 ? (
                  <p className="text-xs text-ink-subtle py-4">
                    ¡No hay juegos pendientes sin estrenar en este grupo (o falta sincronizar
                    ludotecas)!
                  </p>
                ) : (
                  <ul className="space-y-2 overflow-y-auto max-h-56 pr-1">
                    {activeGroupStats.shelfOfShame.slice(0, 8).map((entry) => {
                      const owners = entry.owners.map(mapUserSummary);
                      const alreadyProposed =
                        activeVotingSession?.proposals.some(
                          (p) => p.game.id === entry.game.id,
                        ) ?? false;
                      const justProposed = proposedFeedbackId === entry.game.id;

                      return (
                        <li
                          key={entry.game.id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-canvas/50 p-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-ink truncate">
                              {entry.game.name}
                            </p>
                            <div className="mt-1">
                              <OwnerAvatarStack
                                owners={owners}
                                size="sm"
                                maxVisible={2}
                                prefix=""
                              />
                            </div>
                          </div>

                          {activeVotingSession && (
                            <button
                              type="button"
                              disabled={alreadyProposed}
                              onClick={() =>
                                void handleProposeShameGame(
                                  entry.game.id,
                                  entry.game.name,
                                )
                              }
                              className={`shrink-0 inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold transition ${
                                alreadyProposed || justProposed
                                  ? 'bg-forest-50 text-forest-700 border border-forest-200'
                                  : 'bg-forest-600 text-white hover:bg-forest-700'
                              }`}
                            >
                              {alreadyProposed || justProposed ? (
                                <>
                                  <Check className="h-3 w-3" aria-hidden="true" />
                                  Propuesto
                                </>
                              ) : (
                                <>
                                  <Plus className="h-3 w-3" aria-hidden="true" />
                                  Proponer
                                </>
                              )}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest-50 text-forest-700">
                  <Users className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-bold text-ink">
                    Creá o unite a un grupo para ver estadísticas grupales
                  </p>
                  <p className="text-xs text-ink-muted">
                    Tabla de victorias, juegos más jugados y pila de la vergüenza del grupo.
                  </p>
                </div>
              </div>
              <Link
                to="/groups"
                className="inline-flex min-h-10 items-center rounded-xl bg-forest-600 px-4 text-xs font-bold text-white hover:bg-forest-700"
              >
                Ir a Mis Grupos
              </Link>
            </div>
          )}

          {/* Play Logs Timeline Feed */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-ink-subtle">
                Feed de partidas jugadas ({visiblePlayLogs.length})
              </h2>
              {activeVotingSession && (
                <Link
                  to={`/sessions/${activeVotingSession.id}`}
                  className="text-xs font-bold text-forest-600 hover:underline"
                >
                  Ver próxima juntada →
                </Link>
              )}
            </div>

            <div className="space-y-3.5">
              {visiblePlayLogs.map((log) => {
                const winners = log.players.filter((p) => p.isWinner);
                return (
                  <article
                    key={log.id}
                    className="rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-[var(--shadow-card)]"
                  >
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="sm:w-32 aspect-[16/10] sm:aspect-[4/3] shrink-0 overflow-hidden rounded-xl bg-canvas-subtle">
                        <img
                          src={log.game.imageUrl}
                          alt={`Portada de ${log.game.name}`}
                          className="h-full w-full object-cover"
                        />
                      </div>

                      <div className="flex-1 min-w-0 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-subtle">
                              <span className="inline-flex items-center gap-1 font-semibold num-tabular">
                                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                                {formatShortDate(log.playedAt)}
                              </span>
                              <span className="inline-flex items-center gap-1 num-tabular">
                                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                                {log.durationMinutes} min
                              </span>
                              {log.sessionTitle && (
                                <span className="rounded-full bg-forest-50 border border-forest-100 px-2 py-0.5 text-[11px] font-bold text-forest-700">
                                  {log.sessionTitle}
                                </span>
                              )}
                            </div>

                            <h3 className="mt-1 font-[var(--font-display)] text-xl font-bold text-ink">
                              {log.game.name}
                            </h3>
                          </div>

                          {winners.length > 0 && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-ochre-100 bg-ochre-50 px-3 py-1 text-xs font-extrabold text-ochre-700">
                              <Crown className="h-3.5 w-3.5 text-ochre-500" aria-hidden="true" />
                              {winners.map((w) => w.user.displayName).join(' & ')}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {log.players.map((entry) => (
                            <div
                              key={entry.user.id}
                              className={`inline-flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs ${
                                entry.isWinner
                                  ? 'border-ochre-500/40 bg-ochre-50/70 font-bold text-ink'
                                  : 'border-border bg-canvas/60 text-ink-muted'
                              }`}
                            >
                              <span
                                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white"
                                style={{ backgroundColor: entry.user.accentColor }}
                              >
                                {entry.user.initials}
                              </span>
                              <span>{entry.user.displayName}</span>
                              {entry.score !== undefined && (
                                <span className="rounded-md bg-surface px-1.5 py-0.5 text-[11px] font-extrabold text-ink num-tabular border border-border/70">
                                  {entry.score}
                                </span>
                              )}
                              {entry.isWinner && (
                                <Crown
                                  className="h-3.5 w-3.5 text-ochre-500"
                                  aria-hidden="true"
                                />
                              )}
                            </div>
                          ))}
                        </div>

                        {log.notes && (
                          <p className="text-xs text-ink-muted italic border-l-2 border-forest-200 pl-3">
                            “{log.notes}”
                          </p>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {visiblePlayLogs.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border-strong bg-surface/70 p-10 text-center space-y-2">
                <Dices className="mx-auto h-8 w-8 text-ink-subtle" aria-hidden="true" />
                <p className="font-[var(--font-display)] text-lg font-bold text-ink">
                  Aún no hay partidas registradas
                </p>
                <p className="text-sm text-ink-muted">
                  Tocá <strong>Registrar partida</strong> cuando terminen su próxima mesa.
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
