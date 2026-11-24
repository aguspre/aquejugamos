import type { BggSyncQuotaStatus } from './bgg.guard.js';

export interface BggCollectionItem {
  bggId: number;
  name: string;
  yearPublished: number | null;
  personalRating: number | null;
  thumbnailUrl: string | null;
  imageUrl: string | null;
}

export interface BggMechanicInfo {
  bggId: number;
  name: string;
}

export interface BggGameDetails {
  bggId: number;
  name: string;
  yearPublished: number | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  bestPlayers: number[];
  playingTimeMinutes: number | null;
  weight: number | null;
  bggRating: number | null;
  isExpansion: boolean;
  baseGameBggId: number | null;
  mechanics: BggMechanicInfo[];
}

export interface BggSearchItem {
  bggId: number;
  name: string;
  yearPublished: number | null;
  isExpansion: boolean;
}

export interface BggSyncSummary {
  bggUsername: string;
  totalInBgg: number;
  metadataRefreshed: number;
  addedToLibrary: number;
  updatedInLibrary: number;
  syncedAt: Date;
  quota: BggSyncQuotaStatus;
}
