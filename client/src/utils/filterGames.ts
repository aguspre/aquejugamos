import type { Game, GameFilterState, WeightTier } from '../types/domain';

export const DEFAULT_GAME_FILTERS: GameFilterState = {
  query: '',
  exactPlayers: null,
  maxPlayingTime: null,
  weightTier: null,
  mechanics: [],
  includeExpansions: false,
};

export function getWeightTier(weight: number): WeightTier {
  if (weight <= 2.0) return 'light';
  if (weight <= 3.2) return 'medium';
  return 'heavy';
}

export function getWeightLabel(tier: WeightTier): string {
  switch (tier) {
    case 'light':
      return 'Liviano';
    case 'medium':
      return 'Medio';
    case 'heavy':
      return 'Pesado';
  }
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function countActiveFilters(filters: GameFilterState): number {
  let count = 0;
  if (filters.query.trim()) count += 1;
  if (filters.exactPlayers !== null) count += 1;
  if (filters.maxPlayingTime !== null) count += 1;
  if (filters.weightTier !== null) count += 1;
  if (filters.mechanics.length > 0) count += filters.mechanics.length;
  if (filters.includeExpansions) count += 1;
  return count;
}

export function filterGames<T extends Game>(games: T[], filters: GameFilterState): T[] {
  const normalizedQuery = normalizeText(filters.query.trim());

  return games.filter((game) => {
    if (!filters.includeExpansions && game.isExpansion) {
      return false;
    }

    if (normalizedQuery) {
      const matchesName = normalizeText(game.name).includes(normalizedQuery);
      const matchesMechanic = game.mechanics.some((m) =>
        normalizeText(m).includes(normalizedQuery),
      );
      if (!matchesName && !matchesMechanic) return false;
    }

    if (filters.exactPlayers !== null) {
      if (filters.exactPlayers >= 5) {
        if (game.maxPlayers < 5) return false;
      } else if (
        game.minPlayers > filters.exactPlayers ||
        game.maxPlayers < filters.exactPlayers
      ) {
        return false;
      }
    }

    if (
      filters.maxPlayingTime !== null &&
      game.playingTimeMinutes > filters.maxPlayingTime
    ) {
      return false;
    }

    if (filters.weightTier !== null && getWeightTier(game.weight) !== filters.weightTier) {
      return false;
    }

    if (filters.mechanics.length > 0) {
      const hasAllMechanics = filters.mechanics.every((selected) =>
        game.mechanics.includes(selected),
      );
      if (!hasAllMechanics) return false;
    }

    return true;
  });
}
