import {
  Check,
  Library,
  Plus,
  Sparkles,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { GameCard } from '../components/game/GameCard';
import { GameDetailDrawer } from '../components/game/GameDetailDrawer';
import { FilterChipBar } from '../components/ui/FilterChipBar';
import { OwnerAvatarStack } from '../components/ui/OwnerAvatarStack';
import { PlayerCountBadge } from '../components/ui/PlayerCountBadge';
import { WeightIndicator } from '../components/ui/WeightIndicator';
import {
  ALL_MOCK_MECHANICS,
  MOCK_OWNERSHIP_BY_GAME,
  MOCK_PERSONAL_LIBRARY,
  MOCK_SESSION_POOL,
  MOCK_USERS,
} from '../data/mockData';
import type {
  Game,
  GameFilterState,
  LibraryGameItem,
  SessionGameItem,
} from '../types/domain';
import { DEFAULT_GAME_FILTERS, filterGames } from '../utils/filterGames';

type PreviewMode = 'session_pool' | 'personal_library';

const SWATCHES = [
  { name: 'Canvas', hex: '#FAF8F4', token: 'bg-canvas', border: true },
  { name: 'Surface', hex: '#FFFFFF', token: 'bg-surface', border: true },
  { name: 'Border', hex: '#E7E1D7', token: 'bg-border' },
  { name: 'Forest 600', hex: '#1E4D3B', token: 'bg-forest-600' },
  { name: 'Terracotta', hex: '#C85A32', token: 'bg-terracotta-500' },
  { name: 'Ochre', hex: '#C98223', token: 'bg-ochre-500' },
  { name: 'Teal Meta', hex: '#1D5B6E', token: 'bg-teal-700' },
];

export function DesignSystemPreview() {
  const [mode, setMode] = useState<PreviewMode>('session_pool');
  const [filters, setFilters] = useState<GameFilterState>(DEFAULT_GAME_FILTERS);
  const [proposedIds, setProposedIds] = useState<Set<string>>(
    () => new Set(MOCK_SESSION_POOL.filter((g) => g.isProposed).map((g) => g.id)),
  );
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);

  const confirmedCount = 5;

  const sourceGames: Array<LibraryGameItem | SessionGameItem> =
    mode === 'session_pool' ? MOCK_SESSION_POOL : MOCK_PERSONAL_LIBRARY;

  const filteredGames = useMemo(
    () => filterGames(sourceGames, filters),
    [sourceGames, filters],
  );

  const toggleProposed = (gameId: string) => {
    setProposedIds((prev) => {
      const next = new Set(prev);
      if (next.has(gameId)) {
        next.delete(gameId);
      } else {
        next.add(gameId);
      }
      return next;
    });
  };

  const selectedLibraryEntry = selectedGame
    ? MOCK_PERSONAL_LIBRARY.find((g) => g.id === selectedGame.id)
    : undefined;

  return (
    <div className="space-y-8">
      {/* Editorial Hero Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-forest-200 bg-forest-50 px-3 py-1 text-xs font-bold text-forest-700">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Pasos 1 y 2 · Sistema de Diseño "Tactile Tabletop"
          </span>
          <h1 className="font-[var(--font-display)] text-3xl sm:text-4xl font-bold tracking-tight text-ink">
            Tokens, Componentes & Mocks
          </h1>
          <p className="max-w-2xl text-sm sm:text-base text-ink-muted">
            Paleta cálida editorial inspirada en cajas modernas, tipografía con números
            tabulares y componentes atómicos listos para las vistas de Juntadas, Ludoteca e
            Historial.
          </p>
        </div>

        {/* Quick Mode Switch */}
        <div
          role="tablist"
          aria-label="Modo de previsualización de cards"
          className="inline-flex self-start rounded-xl border border-border bg-surface p-1 shadow-xs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'session_pool'}
            onClick={() => setMode('session_pool')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
              mode === 'session_pool'
                ? 'bg-forest-600 text-white shadow-xs'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            Pool de Juntada ({confirmedCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'personal_library'}
            onClick={() => setMode('personal_library')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
              mode === 'personal_library'
                ? 'bg-forest-600 text-white shadow-xs'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Library className="h-3.5 w-3.5" aria-hidden="true" />
            Mi Ludoteca
          </button>
        </div>
      </header>

      {/* Section 1: Tokens & Atomic Components Showcase */}
      <section className="grid gap-4 lg:grid-cols-12">
        {/* Palette Swatches */}
        <div className="lg:col-span-5 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)] space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink-subtle">
              Paleta & Superficies
            </h2>
            <span className="text-xs font-medium text-ink-subtle">Warm Paper + Forest</span>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-7 lg:grid-cols-4 gap-2.5">
            {SWATCHES.map((swatch) => (
              <div key={swatch.name} className="space-y-1.5">
                <div
                  className={`h-11 rounded-xl ${swatch.token} ${
                    swatch.border ? 'border border-border' : ''
                  }`}
                />
                <div>
                  <p className="text-[11px] font-bold text-ink leading-tight">
                    {swatch.name}
                  </p>
                  <p className="text-[10px] text-ink-subtle num-tabular">{swatch.hex}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Atomic Metadata Badges Specimen */}
        <div className="lg:col-span-7 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)] space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink-subtle">
              Componentes Atómicos
            </h2>
            <span className="text-xs font-medium text-ink-subtle">tabular-nums</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-bold text-ink-muted">PlayerCountBadge</p>
              <div className="flex flex-wrap gap-2">
                <PlayerCountBadge minPlayers={2} maxPlayers={4} bestPlayers={[3]} showBestHint />
                <PlayerCountBadge
                  minPlayers={1}
                  maxPlayers={6}
                  bestPlayers={[5, 6]}
                  targetPlayers={5}
                />
                <PlayerCountBadge
                  minPlayers={2}
                  maxPlayers={4}
                  targetPlayers={5}
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold text-ink-muted">WeightIndicator</p>
              <div className="flex flex-wrap items-center gap-2">
                <WeightIndicator weight={1.38} />
                <WeightIndicator weight={2.46} />
                <WeightIndicator weight={3.87} />
              </div>
              <div className="pt-1">
                <WeightIndicator weight={2.46} variant="detailed" />
              </div>
            </div>

            <div className="sm:col-span-2 space-y-2 border-t border-border/70 pt-3">
              <p className="text-xs font-bold text-ink-muted">OwnerAvatarStack</p>
              <div className="flex flex-wrap items-center gap-5">
                <OwnerAvatarStack owners={[MOCK_USERS[0]!]} />
                <OwnerAvatarStack owners={[MOCK_USERS[0]!, MOCK_USERS[1]!]} />
                <OwnerAvatarStack owners={MOCK_USERS} maxVisible={3} size="md" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Interactive FilterChipBar + Live GameCard Grid */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="font-[var(--font-display)] text-2xl font-bold text-ink">
              {mode === 'session_pool'
                ? 'Pool Combinado de Asistentes (Preview)'
                : 'Mi Ludoteca Personal (Preview)'}
            </h2>
            <p className="text-sm text-ink-muted">
              {mode === 'session_pool'
                ? 'Probá filtrar el catálogo de los 5 amigos confirmados, proponer juegos o abrir cualquier ficha.'
                : 'Colección de @aguspre con estado, nota personal y apertura de drawer de detalle.'}
            </p>
          </div>
          {mode === 'session_pool' && (
            <button
              type="button"
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  exactPlayers: prev.exactPlayers === 5 ? null : 5,
                }))
              }
              className={`self-start inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-bold transition ${
                filters.exactPlayers === 5
                  ? 'border-ochre-500 bg-ochre-50 text-ochre-700'
                  : 'border-border bg-surface text-ink-muted hover:border-border-strong'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 text-ochre-500" aria-hidden="true" />
              {filters.exactPlayers === 5
                ? 'Filtro activo: Compatibles con 5 jug.'
                : 'Activar filtro inteligente (5 jug.)'}
            </button>
          )}
        </div>

        <FilterChipBar
          value={filters}
          onChange={setFilters}
          availableMechanics={ALL_MOCK_MECHANICS}
          resultCount={filteredGames.length}
          totalCount={
            filters.includeExpansions
              ? sourceGames.length
              : sourceGames.filter((g) => !g.isExpansion).length
          }
          smartPlayerCount={mode === 'session_pool' ? confirmedCount : undefined}
        />

        {filteredGames.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-strong bg-surface/70 px-6 py-12 text-center space-y-2">
            <p className="font-[var(--font-display)] text-lg font-bold text-ink">
              Ningún juego coincide con esos filtros
            </p>
            <p className="text-sm text-ink-muted">
              Probá relajar la duración, cambiar el peso o activar expansiones.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredGames.map((item) => {
              const isSessionMode = mode === 'session_pool';
              const proposed = proposedIds.has(item.id);
              const libraryEntry =
                !isSessionMode && 'status' in item ? item : undefined;
              const owners = isSessionMode
                ? MOCK_OWNERSHIP_BY_GAME[item.id] ?? []
                : undefined;

              return (
                <GameCard
                  key={item.id}
                  game={item}
                  status={libraryEntry?.status}
                  personalRating={libraryEntry?.personalRating}
                  owners={owners}
                  targetPlayers={isSessionMode ? confirmedCount : undefined}
                  onSelect={setSelectedGame}
                  actionSlot={
                    isSessionMode ? (
                      <button
                        type="button"
                        onClick={() => toggleProposed(item.id)}
                        className={`w-full inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition ${
                          proposed
                            ? 'border border-forest-200 bg-forest-50 text-forest-700 hover:bg-forest-100'
                            : 'bg-forest-600 text-white hover:bg-forest-700 shadow-xs'
                        }`}
                      >
                        {proposed ? (
                          <>
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            Ya propuesto (quitar)
                          </>
                        ) : (
                          <>
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                            Proponer para votar
                          </>
                        )}
                      </button>
                    ) : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Detail Drawer */}
      <GameDetailDrawer
        game={selectedGame}
        owners={selectedGame ? MOCK_OWNERSHIP_BY_GAME[selectedGame.id] : undefined}
        notes={selectedLibraryEntry?.notes}
        isProposed={selectedGame ? proposedIds.has(selectedGame.id) : false}
        onPropose={(game) => toggleProposed(game.id)}
        onClose={() => setSelectedGame(null)}
      />
    </div>
  );
}
