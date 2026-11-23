import {
  Check,
  ChevronDown,
  Clock,
  Dices,
  Layers,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameFilterState, WeightTier } from '../../types/domain';
import { countActiveFilters, DEFAULT_GAME_FILTERS } from '../../utils/filterGames';

interface FilterChipBarProps {
  value: GameFilterState;
  onChange: (next: GameFilterState) => void;
  availableMechanics: string[];
  resultCount?: number;
  totalCount?: number;
  smartPlayerCount?: number;
  placeholder?: string;
}

const PLAYER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Todos' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5+' },
];

const TIME_OPTIONS: { value: number; label: string }[] = [
  { value: 30, label: '≤ 30m' },
  { value: 60, label: '≤ 60m' },
  { value: 120, label: '≤ 120m' },
];

const WEIGHT_OPTIONS: { value: WeightTier; label: string; dot: string }[] = [
  { value: 'light', label: 'Liviano', dot: 'bg-forest-500' },
  { value: 'medium', label: 'Medio', dot: 'bg-ochre-500' },
  { value: 'heavy', label: 'Pesado', dot: 'bg-terracotta-500' },
];

export function FilterChipBar({
  value,
  onChange,
  availableMechanics,
  resultCount,
  totalCount,
  smartPlayerCount,
  placeholder = 'Buscar por título o mecánica...',
}: FilterChipBarProps) {
  const [mechanicsOpen, setMechanicsOpen] = useState(false);
  const [mechanicSearch, setMechanicSearch] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  const activeCount = countActiveFilters(value);

  useEffect(() => {
    if (!mechanicsOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setMechanicsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMechanicsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [mechanicsOpen]);

  const filteredMechanics = useMemo(() => {
    const q = mechanicSearch.trim().toLowerCase();
    if (!q) return availableMechanics;
    return availableMechanics.filter((m) => m.toLowerCase().includes(q));
  }, [availableMechanics, mechanicSearch]);

  const toggleMechanic = (mechanic: string) => {
    const exists = value.mechanics.includes(mechanic);
    onChange({
      ...value,
      mechanics: exists
        ? value.mechanics.filter((m) => m !== mechanic)
        : [...value.mechanics, mechanic],
    });
  };

  return (
    <section
      aria-label="Filtros de juegos"
      className="rounded-2xl border border-border bg-surface p-3.5 sm:p-4 shadow-[var(--shadow-card)] space-y-3"
    >
      {/* Row 1: Search + Mechanics Popover + Expansions Toggle */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden="true"
          />
          <input
            type="search"
            value={value.query}
            onChange={(e) => onChange({ ...value, query: e.target.value })}
            placeholder={placeholder}
            aria-label="Buscar juego"
            className="w-full min-h-11 rounded-xl border border-border bg-canvas/70 pl-10 pr-9 text-sm text-ink placeholder:text-ink-subtle transition focus:border-forest-600 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-forest-600/15"
          />
          {value.query && (
            <button
              type="button"
              onClick={() => onChange({ ...value, query: '' })}
              aria-label="Borrar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-lg text-ink-subtle hover:bg-canvas-subtle hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Mechanics Multi-Select Popover */}
          <div className="relative" ref={popoverRef}>
            <button
              type="button"
              onClick={() => setMechanicsOpen((prev) => !prev)}
              aria-expanded={mechanicsOpen}
              aria-haspopup="listbox"
              className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold transition ${
                value.mechanics.length > 0
                  ? 'border-forest-600 bg-forest-50 text-forest-700'
                  : 'border-border bg-surface text-ink hover:border-border-strong hover:bg-canvas/60'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Mecánicas</span>
              {value.mechanics.length > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-forest-600 px-1.5 text-[11px] font-bold text-white num-tabular">
                  {value.mechanics.length}
                </span>
              )}
              <ChevronDown
                className={`h-4 w-4 opacity-60 transition-transform ${
                  mechanicsOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {mechanicsOpen && (
              <div className="absolute right-0 left-0 sm:left-auto sm:w-72 z-30 mt-2 rounded-2xl border border-border bg-surface p-3 shadow-[var(--shadow-floating)]">
                <div className="relative mb-2">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={mechanicSearch}
                    onChange={(e) => setMechanicSearch(e.target.value)}
                    placeholder="Filtrar mecánicas..."
                    className="w-full rounded-lg border border-border bg-canvas px-8 py-1.5 text-xs text-ink placeholder:text-ink-subtle focus:border-forest-600 focus:outline-none"
                    autoFocus
                  />
                </div>
                <div
                  role="listbox"
                  aria-multiselectable="true"
                  className="max-h-56 overflow-y-auto space-y-0.5 pr-1"
                >
                  {filteredMechanics.length === 0 ? (
                    <p className="py-4 text-center text-xs text-ink-subtle">
                      Sin coincidencias
                    </p>
                  ) : (
                    filteredMechanics.map((mechanic) => {
                      const selected = value.mechanics.includes(mechanic);
                      return (
                        <button
                          key={mechanic}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => toggleMechanic(mechanic)}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition ${
                            selected
                              ? 'bg-forest-50 text-forest-700 font-semibold'
                              : 'text-ink hover:bg-canvas-subtle'
                          }`}
                        >
                          <span className="truncate">{mechanic}</span>
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              selected
                                ? 'border-forest-600 bg-forest-600 text-white'
                                : 'border-border-strong bg-surface'
                            }`}
                          >
                            {selected && <Check className="h-3 w-3" aria-hidden="true" />}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
                {value.mechanics.length > 0 && (
                  <div className="mt-2 border-t border-border pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => onChange({ ...value, mechanics: [] })}
                      className="text-xs font-semibold text-terracotta-600 hover:underline"
                    >
                      Quitar mecánicas ({value.mechanics.length})
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Expansions Toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={value.includeExpansions}
            onClick={() =>
              onChange({ ...value, includeExpansions: !value.includeExpansions })
            }
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold transition ${
              value.includeExpansions
                ? 'border-forest-600 bg-forest-50 text-forest-700'
                : 'border-border bg-surface text-ink-muted hover:border-border-strong hover:text-ink'
            }`}
          >
            <Layers className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="whitespace-nowrap">Expansiones</span>
            <span
              className={`inline-flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${
                value.includeExpansions ? 'bg-forest-600' : 'bg-canvas-deep'
              }`}
              aria-hidden="true"
            >
              <span
                className={`h-3 w-3 rounded-full bg-white shadow-xs transition-transform ${
                  value.includeExpansions ? 'translate-x-3' : 'translate-x-0'
                }`}
              />
            </span>
          </button>
        </div>
      </div>

      {/* Row 2: Quick Interactive Chip Groups */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 pt-0.5">
        {/* Players */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-ink-subtle mr-0.5">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            Jug.
          </span>
          {PLAYER_OPTIONS.map((opt) => {
            const active = value.exactPlayers === opt.value;
            const matchesHint =
              smartPlayerCount !== undefined &&
              opt.value !== null &&
              (opt.value === 5 ? smartPlayerCount >= 5 : opt.value === smartPlayerCount);

            return (
              <button
                key={opt.label}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onChange({
                    ...value,
                    exactPlayers: active && opt.value !== null ? null : opt.value,
                  })
                }
                className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-3 text-xs font-semibold num-tabular transition ${
                  active
                    ? 'border-forest-600 bg-forest-600 text-white shadow-xs'
                    : 'border-border bg-canvas/60 text-ink-muted hover:border-border-strong hover:text-ink'
                }`}
              >
                <span>{opt.label}</span>
                {matchesHint && !active && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-terracotta-500"
                    title={`Grupo actual: ${smartPlayerCount} confirmados`}
                  />
                )}
              </button>
            );
          })}
        </div>

        <span className="hidden sm:inline-block h-5 w-px bg-border" aria-hidden="true" />

        {/* Max Playing Time */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-ink-subtle mr-0.5">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Tiempo
          </span>
          {TIME_OPTIONS.map((opt) => {
            const active = value.maxPlayingTime === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onChange({
                    ...value,
                    maxPlayingTime: active ? null : opt.value,
                  })
                }
                className={`inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-semibold num-tabular transition ${
                  active
                    ? 'border-forest-600 bg-forest-600 text-white shadow-xs'
                    : 'border-border bg-canvas/60 text-ink-muted hover:border-border-strong hover:text-ink'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <span className="hidden sm:inline-block h-5 w-px bg-border" aria-hidden="true" />

        {/* Complexity / Weight */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-ink-subtle mr-0.5">
            <Dices className="h-3.5 w-3.5" aria-hidden="true" />
            Peso
          </span>
          {WEIGHT_OPTIONS.map((opt) => {
            const active = value.weightTier === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onChange({
                    ...value,
                    weightTier: active ? null : opt.value,
                  })
                }
                className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition ${
                  active
                    ? 'border-forest-600 bg-forest-600 text-white shadow-xs'
                    : 'border-border bg-canvas/60 text-ink-muted hover:border-border-strong hover:text-ink'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${active ? 'bg-white' : opt.dot}`}
                  aria-hidden="true"
                />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Mechanics Chips + Result Summary */}
      {(value.mechanics.length > 0 ||
        activeCount > 0 ||
        (resultCount !== undefined && totalCount !== undefined)) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/80 pt-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {resultCount !== undefined && totalCount !== undefined && (
              <span className="text-xs font-medium text-ink-muted num-tabular mr-1">
                Mostrando <strong className="text-ink">{resultCount}</strong> de {totalCount}{' '}
                juegos
              </span>
            )}
            {value.mechanics.map((mechanic) => (
              <span
                key={mechanic}
                className="inline-flex items-center gap-1 rounded-full bg-forest-50 border border-forest-100 px-2.5 py-0.5 text-[11px] font-semibold text-forest-700"
              >
                {mechanic}
                <button
                  type="button"
                  onClick={() => toggleMechanic(mechanic)}
                  aria-label={`Quitar mecánica ${mechanic}`}
                  className="ml-0.5 rounded-full hover:bg-forest-100 p-0.5"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>

          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => onChange(DEFAULT_GAME_FILTERS)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-terracotta-600 hover:bg-terracotta-50 transition"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Limpiar filtros ({activeCount})
            </button>
          )}
        </div>
      )}
    </section>
  );
}
