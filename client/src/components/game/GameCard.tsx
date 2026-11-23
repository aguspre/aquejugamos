import { Clock, Layers, Star } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Game, UserGameStatus, UserSummary } from '../../types/domain';
import { OwnerAvatarStack } from '../ui/OwnerAvatarStack';
import { PlayerCountBadge } from '../ui/PlayerCountBadge';
import { WeightIndicator } from '../ui/WeightIndicator';

interface GameCardProps {
  game: Game;
  status?: UserGameStatus;
  personalRating?: number;
  owners?: UserSummary[];
  targetPlayers?: number;
  onSelect?: (game: Game) => void;
  actionSlot?: ReactNode;
}

const STATUS_BADGE: Record<
  UserGameStatus,
  { label: string; className: string }
> = {
  owned: {
    label: 'Lo tengo',
    className: 'bg-forest-600/92 text-white border-forest-700/30',
  },
  want_to_play: {
    label: 'Quiero jugar',
    className: 'bg-teal-700/92 text-white border-teal-700/30',
  },
  wishlist: {
    label: 'Wishlist',
    className: 'bg-ochre-500/95 text-white border-ochre-700/20',
  },
  previously_owned: {
    label: 'Lo tuve',
    className: 'bg-ink/75 text-white border-ink/20',
  },
};

export function GameCard({
  game,
  status,
  personalRating,
  owners,
  targetPlayers,
  onSelect,
  actionSlot,
}: GameCardProps) {
  const statusMeta = status ? STATUS_BADGE[status] : null;
  const visibleMechanics = game.mechanics.slice(0, 2);
  const extraMechanics = game.mechanics.length - visibleMechanics.length;

  return (
    <article className="tabletop-card flex flex-col overflow-hidden h-full">
      {/* Cover artwork */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-canvas-subtle">
        <img
          src={game.imageUrl}
          alt={`Portada de ${game.name}`}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/35 to-transparent"
          aria-hidden="true"
        />

        {/* Top-left badges: Collection status or Expansion */}
        <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
          {statusMeta && (
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold backdrop-blur-xs shadow-xs ${statusMeta.className}`}
            >
              {statusMeta.label}
            </span>
          )}
          {game.isExpansion && (
            <span className="inline-flex items-center gap-1 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur-xs">
              <Layers className="h-3 w-3" aria-hidden="true" />
              Expansión
            </span>
          )}
        </div>

        {/* Top-right BGG rating pill */}
        <div
          className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-surface/95 px-2.5 py-0.5 text-xs font-extrabold text-ink shadow-xs backdrop-blur-xs num-tabular"
          title={`Rating en BoardGameGeek: ${game.bggRating.toFixed(1)}`}
        >
          <Star
            className="h-3.5 w-3.5 fill-ochre-500 text-ochre-500"
            aria-hidden="true"
          />
          <span>{game.bggRating.toFixed(1)}</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold leading-snug text-ink">
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(game)}
                  className="card-primary-trigger text-left hover:text-forest-600 transition-colors"
                >
                  {game.name}
                </button>
              ) : (
                game.name
              )}
            </h3>
            <p className="mt-0.5 text-xs text-ink-subtle num-tabular">
              {game.yearPublished}
              {personalRating !== undefined && (
                <span className="ml-2 font-semibold text-forest-600">
                  · Tu nota {personalRating.toFixed(1)}
                </span>
              )}
            </p>
          </div>
        </header>

        {/* Semantic Metadata Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <PlayerCountBadge
            minPlayers={game.minPlayers}
            maxPlayers={game.maxPlayers}
            bestPlayers={game.bestPlayers}
            targetPlayers={targetPlayers}
          />
          <span
            className="inline-flex items-center gap-1 rounded-full border border-border bg-canvas-subtle px-2 py-0.5 text-[11px] font-semibold text-ink-muted num-tabular whitespace-nowrap"
            title={`Duración aproximada: ${game.playingTimeMinutes} minutos`}
          >
            <Clock className="h-3 w-3 opacity-75" aria-hidden="true" />
            {game.playingTimeMinutes} min
          </span>
          <WeightIndicator weight={game.weight} />
        </div>

        {/* Mechanics tags */}
        <div className="flex flex-wrap items-center gap-1">
          {visibleMechanics.map((mechanic) => (
            <span
              key={mechanic}
              className="rounded-md bg-canvas px-2 py-0.5 text-[11px] font-medium text-ink-muted border border-border/70"
            >
              {mechanic}
            </span>
          ))}
          {extraMechanics > 0 && (
            <span className="rounded-md bg-canvas px-1.5 py-0.5 text-[11px] font-semibold text-ink-subtle num-tabular">
              +{extraMechanics}
            </span>
          )}
        </div>

        {/* Owners + Footer CTA */}
        {(owners && owners.length > 0) || actionSlot ? (
          <footer className="mt-auto pt-3 border-t border-border/80 flex flex-col gap-2.5">
            {owners && owners.length > 0 && (
              <OwnerAvatarStack owners={owners} size="sm" />
            )}
            {actionSlot && (
              <div className="card-elevated-action">{actionSlot}</div>
            )}
          </footer>
        ) : null}
      </div>
    </article>
  );
}
