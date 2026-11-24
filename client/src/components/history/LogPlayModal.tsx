import {
  AlertCircle,
  Calendar,
  Check,
  Clock,
  Crown,
  Dices,
  Loader2,
  Trophy,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { useAppState } from '../../context/AppStateContext';
import type { PlayLogPlayer } from '../../types/domain';

interface PlayerRowState {
  included: boolean;
  score: string;
  isWinner: boolean;
}

export function LogPlayModal() {
  const {
    activeGroup,
    allGames,
    users,
    logPlayModalPrefill,
    closeLogPlayModal,
    addPlayLog,
  } = useAppState();

  const { open, gameId, sessionId, sessionTitle, groupId, playerIds } =
    logPlayModalPrefill;

  const selectableUsers = useMemo(
    () =>
      activeGroup && activeGroup.members.length > 0
        ? activeGroup.members.map((m) => m.user)
        : users,
    [activeGroup, users],
  );

  const [selectedGameId, setSelectedGameId] = useState('');
  const [playedDate, setPlayedDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [notes, setNotes] = useState('');
  const [playerState, setPlayerState] = useState<Record<string, PlayerRowState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const initialGame = allGames.find((g) => g.id === gameId) ?? allGames[0];
    setSelectedGameId(initialGame?.id ?? '');
    setDurationMinutes(String(initialGame?.playingTimeMinutes ?? 60));
    setPlayedDate(new Date().toISOString().slice(0, 10));
    setNotes('');
    setError(null);

    const preselectedSet = new Set(
      playerIds && playerIds.length > 0
        ? playerIds
        : selectableUsers.slice(0, 4).map((u) => u.id),
    );

    const nextRows: Record<string, PlayerRowState> = {};
    for (const user of selectableUsers) {
      nextRows[user.id] = {
        included: preselectedSet.has(user.id),
        score: '',
        isWinner: false,
      };
    }
    setPlayerState(nextRows);
  }, [open, gameId, playerIds, allGames, selectableUsers]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLogPlayModal();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, closeLogPlayModal]);

  if (!open) return null;

  const selectedGame = allGames.find((g) => g.id === selectedGameId) ?? allGames[0];
  const includedUsers = selectableUsers.filter((u) => playerState[u.id]?.included);

  const toggleUserIncluded = (userId: string) => {
    setPlayerState((prev) => {
      const current = prev[userId] ?? { included: false, score: '', isWinner: false };
      return {
        ...prev,
        [userId]: {
          ...current,
          included: !current.included,
          isWinner: !current.included ? current.isWinner : false,
        },
      };
    });
  };

  const updateScore = (userId: string, score: string) => {
    setPlayerState((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] ?? { included: true, score: '', isWinner: false }),
        score,
      },
    }));
  };

  const toggleWinner = (userId: string) => {
    setPlayerState((prev) => {
      const current = prev[userId] ?? { included: true, score: '', isWinner: false };
      return {
        ...prev,
        [userId]: {
          ...current,
          isWinner: !current.isWinner,
        },
      };
    });
  };

  const handleGameChange = (nextId: string) => {
    setSelectedGameId(nextId);
    const found = allGames.find((g) => g.id === nextId);
    if (found) {
      setDurationMinutes(String(found.playingTimeMinutes));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedGame || includedUsers.length === 0) return;

    const players: PlayLogPlayer[] = includedUsers.map((user) => {
      const row = playerState[user.id]!;
      const numericScore =
        row.score.trim() !== '' && !Number.isNaN(Number(row.score))
          ? Math.round(Number(row.score))
          : undefined;
      return {
        user,
        score: numericScore,
        isWinner: row.isWinner,
      };
    });

    setSubmitting(true);
    setError(null);
    try {
      await addPlayLog({
        sessionId,
        sessionTitle,
        groupId: groupId !== undefined ? groupId : activeGroup?.id ?? null,
        gameId: selectedGame.id,
        playedAt: new Date(`${playedDate}T22:00:00`).toISOString(),
        durationMinutes: Math.max(
          5,
          Number(durationMinutes) || selectedGame.playingTimeMinutes,
        ),
        notes,
        players,
      });

      closeLogPlayModal();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo guardar la partida',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="log-play-title"
    >
      <button
        type="button"
        aria-label="Cerrar modal"
        onClick={closeLogPlayModal}
        className="fixed inset-0 bg-ink/45 backdrop-blur-[2px]"
      />

      <div className="relative z-10 flex max-h-[92dvh] w-full sm:max-w-lg flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl border border-border bg-surface shadow-[var(--shadow-floating)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-terracotta-50 text-terracotta-600">
              <Trophy className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-terracotta-600">
                {sessionTitle ? `Juntada: ${sessionTitle}` : 'Historial del grupo'}
              </span>
              <h2
                id="log-play-title"
                className="font-[var(--font-display)] text-xl font-bold text-ink"
              >
                Registrar partida jugada
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={closeLogPlayModal}
            aria-label="Cerrar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-canvas-subtle"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {allGames.length === 0 ? (
          <div className="p-6 text-center space-y-3">
            <Dices className="mx-auto h-9 w-9 text-ink-subtle" aria-hidden="true" />
            <p className="font-bold text-ink">Todavía no tenés juegos cargados</p>
            <p className="text-sm text-ink-muted">
              Sincronizá tu colección de BoardGameGeek o agregá un juego en{' '}
              <strong>Mi Ludoteca</strong> antes de registrar una partida.
            </p>
            <button
              type="button"
              onClick={closeLogPlayModal}
              className="min-h-10 rounded-xl bg-forest-600 px-4 text-xs font-bold text-white"
            >
              Entendido
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="flex-1 overflow-y-auto p-5 space-y-5"
          >
            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-terracotta-200 bg-terracotta-50 px-3 py-2 text-xs font-semibold text-terracotta-700"
              >
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {/* Game Selector */}
            <div className="space-y-1.5">
              <label
                htmlFor="log-game-select"
                className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-muted"
              >
                <Dices className="h-3.5 w-3.5" aria-hidden="true" />
                Juego
              </label>
              <div className="flex items-center gap-3">
                {selectedGame && (
                  <img
                    src={selectedGame.thumbnailUrl}
                    alt=""
                    className="h-11 w-14 shrink-0 rounded-xl object-cover border border-border"
                  />
                )}
                <select
                  id="log-game-select"
                  value={selectedGameId}
                  onChange={(e) => handleGameChange(e.target.value)}
                  className="flex-1 min-h-11 rounded-xl border border-border bg-canvas/60 px-3 text-sm font-bold text-ink focus:border-forest-600 focus:bg-surface focus:outline-none"
                >
                  {allGames.map((game) => (
                    <option key={game.id} value={game.id}>
                      {game.name}
                      {game.yearPublished ? ` (${game.yearPublished})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Date & Duration */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="log-date-input"
                  className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-ink-muted"
                >
                  <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                  Fecha
                </label>
                <input
                  id="log-date-input"
                  type="date"
                  required
                  value={playedDate}
                  onChange={(e) => setPlayedDate(e.target.value)}
                  className="w-full min-h-11 rounded-xl border border-border bg-canvas/60 px-3 text-sm text-ink num-tabular focus:border-forest-600 focus:bg-surface focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="log-duration-input"
                  className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-ink-muted"
                >
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  Duración (min)
                </label>
                <input
                  id="log-duration-input"
                  type="number"
                  min={5}
                  max={600}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  className="w-full min-h-11 rounded-xl border border-border bg-canvas/60 px-3 text-sm text-ink num-tabular focus:border-forest-600 focus:bg-surface focus:outline-none"
                />
              </div>
            </div>

            {/* Players Checklist */}
            <div className="space-y-2.5">
              <span className="block text-xs font-bold uppercase tracking-wider text-ink-muted">
                ¿Quiénes jugaron? ({includedUsers.length})
              </span>
              <div className="flex flex-wrap gap-2">
                {selectableUsers.map((user) => {
                  const included = Boolean(playerState[user.id]?.included);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => toggleUserIncluded(user.id)}
                      className={`inline-flex min-h-10 items-center gap-2 rounded-full border pl-1.5 pr-3 text-xs font-bold transition ${
                        included
                          ? 'border-forest-600 bg-forest-50 text-forest-900'
                          : 'border-border bg-canvas/60 text-ink-muted hover:border-border-strong'
                      }`}
                    >
                      <span
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ backgroundColor: user.accentColor }}
                      >
                        {included ? (
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          user.initials
                        )}
                      </span>
                      <span>{user.displayName}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scores + Winner Toggle per Player */}
            {includedUsers.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                    Puntajes y ganador/es
                  </span>
                  <span className="text-[11px] text-ink-subtle">
                    Tocá la corona para marcar ganador
                  </span>
                </div>

                <div className="space-y-2">
                  {includedUsers.map((user) => {
                    const row = playerState[user.id]!;
                    return (
                      <div
                        key={user.id}
                        className={`flex items-center justify-between gap-3 rounded-xl border p-2.5 transition ${
                          row.isWinner
                            ? 'border-ochre-500 bg-ochre-50/70'
                            : 'border-border bg-canvas/50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                            style={{ backgroundColor: user.accentColor }}
                          >
                            {user.initials}
                          </span>
                          <span className="text-sm font-bold text-ink truncate">
                            {user.displayName}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <input
                            type="number"
                            inputMode="numeric"
                            placeholder="Pts"
                            aria-label={`Puntaje de ${user.displayName}`}
                            value={row.score}
                            onChange={(e) => updateScore(user.id, e.target.value)}
                            className="w-20 min-h-9 rounded-lg border border-border bg-surface px-2.5 text-right text-sm font-bold text-ink num-tabular placeholder:font-normal placeholder:text-ink-subtle focus:border-forest-600 focus:outline-none"
                          />

                          <button
                            type="button"
                            onClick={() => toggleWinner(user.id)}
                            aria-pressed={row.isWinner}
                            aria-label={`Marcar a ${user.displayName} como ganador`}
                            className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                              row.isWinner
                                ? 'border-ochre-500 bg-ochre-500 text-white shadow-xs'
                                : 'border-border bg-surface text-ink-subtle hover:border-ochre-500 hover:text-ochre-500'
                            }`}
                          >
                            <Crown className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <label
                htmlFor="log-notes-input"
                className="block text-xs font-bold uppercase tracking-wider text-ink-muted"
              >
                Notas o anécdota (opcional)
              </label>
              <textarea
                id="log-notes-input"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej. Empate técnico resuelto por dinero restante..."
                className="w-full rounded-xl border border-border bg-canvas/60 px-3.5 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-forest-600 focus:bg-surface focus:outline-none"
              />
            </div>

            {/* Submit */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
              <button
                type="button"
                onClick={closeLogPlayModal}
                className="min-h-11 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-ink-muted hover:bg-canvas-subtle"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting || includedUsers.length === 0}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-forest-600 px-5 text-sm font-bold text-white shadow-xs hover:bg-forest-700 disabled:opacity-50 transition"
              >
                {submitting && (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                )}
                Guardar partida
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
