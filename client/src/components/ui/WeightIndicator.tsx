import { getWeightLabel, getWeightTier } from '../../utils/filterGames';

interface WeightIndicatorProps {
  weight: number;
  variant?: 'pill' | 'detailed';
}

const TIER_STYLES = {
  light: {
    badge: 'bg-forest-50 text-forest-700 border-forest-100',
    pipFill: 'bg-forest-500',
    pipTrack: 'bg-forest-200/70',
  },
  medium: {
    badge: 'bg-ochre-50 text-ochre-700 border-ochre-100',
    pipFill: 'bg-ochre-500',
    pipTrack: 'bg-ochre-100',
  },
  heavy: {
    badge: 'bg-terracotta-50 text-terracotta-700 border-terracotta-100',
    pipFill: 'bg-terracotta-500',
    pipTrack: 'bg-terracotta-100',
  },
} as const;

export function WeightIndicator({ weight, variant = 'pill' }: WeightIndicatorProps) {
  const clamped = Math.max(1, Math.min(5, weight));
  const tier = getWeightTier(clamped);
  const label = getWeightLabel(tier);
  const style = TIER_STYLES[tier];

  const pips = [1, 2, 3, 4, 5].map((index) => {
    const fill = Math.max(0, Math.min(1, clamped - (index - 1)));
    return (
      <span
        key={index}
        className={`relative h-2 w-2 overflow-hidden rounded-[3px] ${style.pipTrack}`}
        aria-hidden="true"
      >
        {fill > 0 && (
          <span
            className={`absolute inset-y-0 left-0 rounded-[2px] ${style.pipFill}`}
            style={{ width: `${Math.round(fill * 100)}%` }}
          />
        )}
      </span>
    );
  });

  if (variant === 'detailed') {
    return (
      <div
        className={`inline-flex items-center gap-2.5 rounded-xl border px-3 py-1.5 ${style.badge}`}
        aria-label={`Complejidad ${clamped.toFixed(2)} de 5 (${label})`}
      >
        <div className="flex items-center gap-1">{pips}</div>
        <div className="flex items-baseline gap-1.5 text-xs">
          <span className="font-bold num-tabular">{clamped.toFixed(1)} / 5</span>
          <span className="font-medium opacity-80">{label}</span>
        </div>
      </div>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold num-tabular whitespace-nowrap ${style.badge}`}
      title={`Complejidad ${clamped.toFixed(2)} / 5 — ${label}`}
      aria-label={`Complejidad ${clamped.toFixed(1)} de 5, ${label}`}
    >
      <span className="flex items-center gap-0.5">{pips}</span>
      <span>{clamped.toFixed(1)}</span>
    </span>
  );
}
