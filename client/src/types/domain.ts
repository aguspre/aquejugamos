export type UserGameStatus = 'owned' | 'wishlist' | 'want_to_play' | 'previously_owned';

export type SessionStatus = 'planning' | 'voting' | 'locked' | 'completed' | 'cancelled';

export type VotingMode = 'single_choice' | 'multi_vote' | 'ranked_top3';

export type RsvpStatus = 'going' | 'maybe' | 'not_going';

export interface UserSummary {
  id: string;
  displayName: string;
  avatarUrl?: string;
  bggUsername?: string;
  initials: string;
  accentColor: string;
}

export interface Game {
  id: string;
  bggId: number;
  name: string;
  yearPublished: number;
  imageUrl: string;
  thumbnailUrl: string;
  minPlayers: number;
  maxPlayers: number;
  bestPlayers: number[];
  playingTimeMinutes: number;
  weight: number;
  bggRating: number;
  isExpansion: boolean;
  baseGameBggId?: number;
  mechanics: string[];
}

export interface LibraryGameItem extends Game {
  status: UserGameStatus;
  personalRating?: number;
  notes?: string;
}

export interface SessionGameItem extends Game {
  owners: UserSummary[];
  isProposed: boolean;
}

export interface SessionProposal {
  id: string;
  game: Game;
  owners: UserSummary[];
  proposedBy: UserSummary;
  note?: string;
  voteCount: number;
  score: number;
  userVoted: boolean;
  userRank?: number;
}

export interface SessionParticipant {
  user: UserSummary;
  rsvp: RsvpStatus;
}

export interface GameSession {
  id: string;
  groupName: string;
  title: string;
  scheduledAt: string;
  location: string;
  host: UserSummary;
  status: SessionStatus;
  votingMode: VotingMode;
  maxVotesPerUser: number;
  inviteToken: string;
  participants: SessionParticipant[];
  proposals: SessionProposal[];
}

export interface PlayLogPlayer {
  user: UserSummary;
  score?: number;
  isWinner: boolean;
}

export interface PlayLog {
  id: string;
  sessionId?: string;
  sessionTitle?: string;
  game: Game;
  playedAt: string;
  durationMinutes: number;
  notes?: string;
  players: PlayLogPlayer[];
}

export type WeightTier = 'light' | 'medium' | 'heavy';

export interface GameFilterState {
  query: string;
  exactPlayers: number | null; // 5 represents "5+"
  maxPlayingTime: number | null;
  weightTier: WeightTier | null;
  mechanics: string[];
  includeExpansions: boolean;
}
