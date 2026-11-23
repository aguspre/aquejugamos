import {
  CalendarDays,
  Check,
  Clock,
  Crown,
  Dices,
  Flame,
  Ghost,
  Plus,
  Trophy,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { OwnerAvatarStack } from '../components/ui/OwnerAvatarStack';
import { useAppState } from '../context/AppStateContext';
import type { Game } from '../types/domain';
import { formatShortDate } from '../utils/formatDate';

export function HistoryPage() {
  const {
    allGames,
    users,
    playLogs,
    sessions,
    ownershipByGame,
    openLogPlayModal,
    proposeGame,
  } = useAppState();

  const [proposedFeedbackId, setProposedFeedbackId] = useState<string | null>(null);
  const activeVotingSession = sessions.find((s) => s.status === 'voting') ?? sessions[0];

  const stats = useMemo(() => {
    const totalMinutes = playLogs.reduce((acc, log) => acc + log.durationMinutes, 0);

    // Most played games
    const gameCounts = new Map<string, { game: Game; count: number }>();
    for (const log of playLogs) {
      const existing = gameCounts.get(log.game.id);
      if (existing) {
        existing.count += 1;
      } else {
        gameCounts.set(log.game.id, { game: log.game, count: 1 });
      }
    }
    const mostPlayed = Array.from(gameCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    // Win leaderboard
    const leaderboard = users
      .map((user) => {
        let played = 0;
        let wins = 0;
        for (const log of playLogs) {
          const entry = log.players.find((p) => p.user.id === user.id);
          if (entry) {
            played += 1;
            if (entry.isWinner) wins += 1;
          }
        }
        return {
          user,
          played,
          wins,
          winRate: played > 0 ? Math.round((wins / played) * 100) : 0,
        };
      })
      .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate);

    // Shelf of Shame (owned by at least one member, base games, 0 logged plays)
    const playedGameIds = new Set(playLogs.map((l) => l.game.id));
    const shelfOfShame = allGames.filter(
      (g) =>
        !g.isExpansion &&
        !playedGameIds.has(g.id) &&
        (ownershipByGame[g.id]?.length ?? 0) > 0,
    );

    return {
      totalPlays: playLogs.length,
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      mostPlayed,
      leaderboard,
      shelfOfShame,
    };
  }, [playLogs, users, allGames, ownershipByGame]);

  const handleProposeShameGame = (game: Game) => {
    if (!activeVotingSession) return;
    proposeGame(
      activeVotingSession.id,
      game,
      '¡Salgamos de la pila de la vergüenza!',
    );
    setProposedFeedbackId(game.id);
    setTimeout(() => setProposedFeedbackId(null), 2500);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-forest-600">
            Los Meeples del Viernes
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

      {/* Mini-Dashboard (3 KPI/Insight Panels) */}
      <section className="grid gap-4 lg:grid-cols-3">
        {/* Card 1: Most Played + Total Hours */}
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)] flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-ink-subtle">
              <Flame className="h-4 w-4 text-terracotta-500" aria-hidden="true" />
              Más jugados
            </h2>
            <span className="rounded-full bg-canvas-subtle px-2.5 py-0.5 text-[11px] font-bold text-ink-muted num-tabular">
              {stats.totalPlays} partidas · {stats.totalHours} h
            </span>
          </div>

          <ul className="space-y-2.5">
            {stats.mostPlayed.map(({ game, count }) => {
              const maxCount = stats.mostPlayed[0]?.count ?? 1;
              const pct = Math.round((count / maxCount) * 100);
              return (
                <li key={game.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-ink truncate">{game.name}</span>
                    <span className="font-extrabold text-forest-700 num-tabular shrink-0">
                      {count} {count === 1 ? 'vez' : 'veces'}
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
        </div>

        {/* Card 2: Win Leaderboard */}
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)] space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-ink-subtle">
              <Trophy className="h-4 w-4 text-ochre-500" aria-hidden="true" />
              Tabla de victorias
            </h2>
            <span className="text-[11px] font-medium text-ink-subtle">Temporada 2026</span>
          </div>

          <ul className="space-y-2">
            {stats.leaderboard.map((row, idx) => (
              <li
                key={row.user.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-canvas/60 px-2.5 py-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-4 text-center text-xs font-extrabold text-ink-subtle num-tabular">
                    {idx + 1}
                  </span>
                  <span
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ backgroundColor: row.user.accentColor }}
                  >
                    {row.user.initials}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-ink truncate">
                      {row.user.displayName}
                    </p>
                    <p className="text-[10px] text-ink-subtle num-tabular">
                      {row.played} jugadas · {row.winRate}% win rate
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-ochre-50 border border-ochre-100 px-2.5 py-0.5 text-xs font-extrabold text-ochre-700 num-tabular">
                  <Crown className="h-3 w-3 text-ochre-500" aria-hidden="true" />
                  {row.wins}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Card 3: Shelf of Shame (Unplayed Games) */}
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)] flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-ink-subtle">
              <Ghost className="h-4 w-4 text-forest-600" aria-hidden="true" />
              Pila de la vergüenza
            </h2>
            <span className="rounded-full bg-terracotta-50 px-2.5 py-0.5 text-[11px] font-bold text-terracotta-700 num-tabular">
              {stats.shelfOfShame.length} sin estrenar
            </span>
          </div>

          <p className="text-xs text-ink-muted -mt-2">
            Juegos de la ludoteca combinada que todavía no salieron a mesa.
          </p>

          <ul className="space-y-2 overflow-y-auto max-h-56 pr-1">
            {stats.shelfOfShame.slice(0, 5).map((game) => {
              const owners = ownershipByGame[game.id] ?? [];
              const alreadyProposed =
                activeVotingSession?.proposals.some((p) => p.game.id === game.id) ??
                false;
              const justProposed = proposedFeedbackId === game.id;

              return (
                <li
                  key={game.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-canvas/50 p-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-ink truncate">{game.name}</p>
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
                      onClick={() => handleProposeShameGame(game)}
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
        </div>
      </section>

      {/* Play Logs Timeline Feed */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-ink-subtle">
            Feed de partidas jugadas ({playLogs.length})
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
          {playLogs.map((log) => {
            const winners = log.players.filter((p) => p.isWinner);
            return (
              <article
                key={log.id}
                className="rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-[var(--shadow-card)]"
              >
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Thumbnail */}
                  <div className="sm:w-32 aspect-[16/10] sm:aspect-[4/3] shrink-0 overflow-hidden rounded-xl bg-canvas-subtle">
                    <img
                      src={log.game.imageUrl}
                      alt={`Portada de ${log.game.name}`}
                      className="h-full w-full object-cover"
                    />
                  </div>

                  {/* Content */}
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

                    {/* Players & Scores Grid */}
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

        {playLogs.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border-strong bg-surface/70 p-10 text-center space-y-2">
            <Dices className="mx-auto h-8 w-8 text-ink-subtle" aria-hidden="true" />
            <p className="font-[var(--font-display)] text-lg font-bold text-ink">
              Aún no hay partidas registradas
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
