import { Sparkles, Users } from 'lucide-react';

interface PlayerCountBadgeProps {
  minPlayers: number;
  maxPlayers: number;
  bestPlayers?: number[];
  targetPlayers?: number;
  showBestHint?: boolean;
  size?: 'sm' | 'md';
}

export function PlayerCountBadge({
  minPlayers,
  maxPlayers,
  bestPlayers = [],
  targetPlayers,
  showBestHint = false,
  size = 'sm',
}: PlayerCountBadgeProps) {
  const rangeLabel =
    minPlayers === maxPlayers ? `${minPlayers} jug.` : `${minPlayers}–${maxPlayers} jug.`;

  const isTargetBest =
    targetPlayers !== undefined && bestPlayers.includes(targetPlayers);
  const isTargetCompatible =
    targetPlayers !== undefined &&
    minPlayers <= targetPlayers &&
    maxPlayers >= targetPlayers;

  const toneClasses = isTargetBest
    ? 'bg-ochre-50 text-ochre-700 border-ochre-100'
    : targetPlayers !== undefined && !isTargetCompatible
      ? 'bg-canvas-subtle text-ink-subtle border-border line-through decoration-ink-subtle/50'
      : 'bg-teal-50 text-teal-700 border-teal-100';

  const sizeClasses =
    size === 'md' ? 'px-2.5 py-1 text-xs gap-1.5' : 'px-2 py-0.5 text-[11px] gap-1';

  const bestLabel =
    bestPlayers.length > 0
      ? bestPlayers.length === 1
        ? `Ideal ${bestPlayers[0]}`
        : `Ideal ${bestPlayers.join('–')}`
      : null;

  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold num-tabular whitespace-nowrap ${toneClasses} ${sizeClasses}`}
      title={
        isTargetBest
          ? `Óptimo para ${targetPlayers} jugadores según BGG`
          : bestLabel
            ? `${rangeLabel} (${bestLabel})`
            : rangeLabel
      }
    >
      {isTargetBest ? (
        <Sparkles className="h-3 w-3 shrink-0 text-ochre-500" aria-hidden="true" />
      ) : (
        <Users className="h-3 w-3 shrink-0 opacity-80" aria-hidden="true" />
      )}
      <span>{rangeLabel}</span>
      {isTargetBest ? (
        <span className="font-bold text-ochre-700">· Ideal {targetPlayers}</span>
      ) : (
        showBestHint &&
        bestLabel && <span className="opacity-75 font-medium">· {bestLabel}</span>
      )}
    </span>
  );
}
