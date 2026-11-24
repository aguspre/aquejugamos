import {
  Check,
  Clock,
  ExternalLink,
  Layers,
  Loader2,
  Lock,
  Plus,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Game, UserGameStatus, UserSummary } from '../../types/domain';
import { OwnerAvatarStack } from '../ui/OwnerAvatarStack';
import { PlayerCountBadge } from '../ui/PlayerCountBadge';
import { WeightIndicator } from '../ui/WeightIndicator';

interface GameDetailDrawerProps {
  game: Game | null;
  owners?: UserSummary[];
  status?: UserGameStatus;
  notes?: string;
  onUpdateStatus?: (gameId: string, status: UserGameStatus) => void;
  onUpdateNotes?: (gameId: string, notes: string) => void;
  onRemove?: (gameId: string) => Promise<void> | void;
  onClose: () => void;
  onPropose?: (game: Game) => void;
  isProposed?: boolean;
  proposeDisabled?: boolean;
  proposeLabel?: string;
}

const STATUS_OPTIONS: { id: UserGameStatus; label: string }[] = [
  { id: 'owned', label: 'Lo tengo' },
  { id: 'want_to_play', label: 'Quiero jugar' },
  { id: 'wishlist', label: 'Wishlist' },
];

export function GameDetailDrawer({
  game,
  owners,
  status,
  notes,
  onUpdateStatus,
  onUpdateNotes,
  onRemove,
  onClose,
  onPropose,
  isProposed,
  proposeDisabled,
  proposeLabel,
}: GameDetailDrawerProps) {
  const [draftNotes, setDraftNotes] = useState(notes ?? '');
  const [notesSaved, setNotesSaved] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    setDraftNotes(notes ?? '');
    setNotesSaved(false);
    setConfirmingRemove(false);
    setRemoving(false);
  }, [game?.id, notes]);

  useEffect(() => {
    if (!game) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [game, onClose]);

  if (!game) return null;

  const handleSaveNotes = () => {
    if (!onUpdateNotes) return;
    onUpdateNotes(game.id, draftNotes);
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-game-title"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar detalle"
        onClick={onClose}
        className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] transition-opacity"
      />

      {/* Drawer / Sheet */}
      <div className="relative z-10 flex max-h-[90dvh] sm:max-h-dvh w-full sm:max-w-md flex-col overflow-hidden rounded-t-3xl sm:rounded-t-none sm:rounded-l-3xl border-t sm:border-t-0 sm:border-l border-border bg-surface shadow-[var(--shadow-floating)]">
        {/* Top Image Banner */}
        <div className="relative aspect-[16/9] w-full shrink-0 bg-canvas-subtle">
          <img
            src={game.imageUrl}
            alt={`Portada de ${game.name}`}
            className="h-full w-full object-cover"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar panel"
            className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface/92 text-ink shadow-sm backdrop-blur-xs hover:bg-surface"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>

          <div className="absolute left-4 bottom-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-surface/95 px-3 py-1 text-xs font-extrabold text-ink shadow-xs num-tabular">
              <Star
                className="h-3.5 w-3.5 fill-ochre-500 text-ochre-500"
                aria-hidden="true"
              />
              {game.bggRating.toFixed(1)} BGG
            </span>
            {game.isExpansion && (
              <span className="inline-flex items-center gap-1 rounded-full bg-ink/85 px-2.5 py-1 text-[11px] font-bold text-white">
                <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                Expansión
              </span>
            )}
          </div>
        </div>

        {/* Scrollable Details */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle num-tabular">
              Año {game.yearPublished} · BGG #{game.bggId}
            </p>
            <h2
              id="drawer-game-title"
              className="mt-1 font-[var(--font-display)] text-2xl font-bold text-ink"
            >
              {game.name}
            </h2>
          </div>

          {/* Collection Status Switcher (when in Library) */}
          {status && onUpdateStatus && (
            <div className="space-y-2">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-ink-subtle">
                Estado en tu ludoteca
              </span>
              <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-border bg-canvas p-1">
                {STATUS_OPTIONS.map((opt) => {
                  const active = status === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onUpdateStatus(game.id, opt.id)}
                      className={`min-h-9 rounded-lg text-xs font-bold transition ${
                        active
                          ? 'bg-forest-600 text-white shadow-xs'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Core Stats */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-border bg-canvas/70 p-3 space-y-1.5">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-ink-subtle">
                Jugadores
              </span>
              <PlayerCountBadge
                minPlayers={game.minPlayers}
                maxPlayers={game.maxPlayers}
                bestPlayers={game.bestPlayers}
                showBestHint
                size="md"
              />
            </div>
            <div className="rounded-xl border border-border bg-canvas/70 p-3 space-y-1.5">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-ink-subtle">
                Duración
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-ink num-tabular">
                <Clock className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                {game.playingTimeMinutes} minutos
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-ink-subtle">
              Complejidad (Weight BGG)
            </span>
            <WeightIndicator weight={game.weight} variant="detailed" />
          </div>

          {game.bestPlayers.length > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-ochre-100 bg-ochre-50/70 px-3.5 py-2.5 text-xs text-ochre-700">
              <Sparkles className="h-4 w-4 shrink-0 text-ochre-500" aria-hidden="true" />
              <span>
                La comunidad de BGG recomienda especialmente jugarlo a{' '}
                <strong className="num-tabular">
                  {game.bestPlayers.join(' o ')} jugadores
                </strong>
                .
              </span>
            </div>
          )}

          {/* Mechanics */}
          <div className="space-y-2">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-ink-subtle">
              Mecánicas
            </span>
            <div className="flex flex-wrap gap-1.5">
              {game.mechanics.map((mechanic) => (
                <span
                  key={mechanic}
                  className="rounded-lg border border-border bg-canvas px-2.5 py-1 text-xs font-semibold text-ink-muted"
                >
                  {mechanic}
                </span>
              ))}
            </div>
          </div>

          {owners && owners.length > 0 && (
            <div className="space-y-2 rounded-xl border border-border bg-canvas/60 p-3.5">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-ink-subtle">
                Disponible en el grupo
              </span>
              <OwnerAvatarStack owners={owners} size="md" />
            </div>
          )}

          {/* Notes (editable in Library, read-only otherwise) */}
          {onUpdateNotes ? (
            <div className="space-y-2 rounded-xl border border-border bg-canvas/60 p-3.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="drawer-personal-notes"
                  className="block text-[11px] font-bold uppercase tracking-wider text-ink-subtle"
                >
                  Notas personales
                </label>
                {notesSaved && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-forest-700">
                    <Check className="h-3 w-3" aria-hidden="true" />
                    Guardado
                  </span>
                )}
              </div>
              <textarea
                id="drawer-personal-notes"
                rows={3}
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
                onBlur={handleSaveNotes}
                placeholder="Ej. Cartas enfundadas, tengo la expansión..."
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-forest-600 focus:outline-none"
              />
            </div>
          ) : (
            notes && (
              <div className="space-y-1.5 rounded-xl border border-border bg-canvas/60 p-3.5">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-ink-subtle">
                  Notas personales
                </span>
                <p className="text-sm text-ink-muted leading-relaxed">{notes}</p>
              </div>
            )
          )}

          {/* Remove from Personal Library */}
          {onRemove && (
            <div className="pt-2 border-t border-border/80">
              {confirmingRemove ? (
                <div className="rounded-xl border border-terracotta-200 bg-terracotta-50/90 p-3.5 space-y-3">
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-terracotta-700">
                      ¿Quitar “{game.name}” de tu ludoteca?
                    </p>
                    <p className="text-xs text-terracotta-700/85">
                      Se eliminará de tu colección personal (podés volver a agregarlo más adelante desde BGG).
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={removing}
                      onClick={() => setConfirmingRemove(false)}
                      className="min-h-9 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-ink-muted hover:bg-canvas-subtle disabled:opacity-60"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={removing}
                      onClick={async () => {
                        setRemoving(true);
                        try {
                          await onRemove(game.id);
                        } finally {
                          setRemoving(false);
                        }
                      }}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-terracotta-600 px-3.5 text-xs font-bold text-white hover:bg-terracotta-700 disabled:opacity-70 transition"
                    >
                      {removing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Sí, quitar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(true)}
                  className="w-full inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-terracotta-200 bg-terracotta-50/60 px-3.5 text-xs font-bold text-terracotta-700 hover:bg-terracotta-50 hover:border-terracotta-500/50 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Quitar de mi ludoteca
                </button>
              )}
            </div>
          )}
        </div>

        {/* Sticky Footer CTA */}
        <div className="border-t border-border bg-surface p-4 flex items-center gap-2.5">
          {onPropose && (
            <button
              type="button"
              onClick={() => onPropose(game)}
              disabled={isProposed || proposeDisabled}
              className={`flex-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition ${
                isProposed
                  ? 'bg-forest-50 text-forest-700 border border-forest-200 cursor-default'
                  : proposeDisabled
                    ? 'bg-canvas-subtle text-ink-muted border border-border cursor-not-allowed'
                    : 'bg-forest-600 text-white hover:bg-forest-700 shadow-xs'
              }`}
            >
              {isProposed ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : proposeDisabled ? (
                <Lock className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              {isProposed
                ? 'Ya propuesto en la juntada'
                : proposeLabel ?? 'Proponer en una juntada'}
            </button>
          )}
          <a
            href={`https://boardgamegeek.com/boardgame/${game.bggId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-canvas px-3.5 text-sm font-semibold text-ink hover:bg-canvas-subtle transition"
            title="Ver ficha en BoardGameGeek"
          >
            <span>BGG</span>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  );
}
