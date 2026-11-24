import { ProposalStatus, VotingMode } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  generateGroupInviteCode,
  generateSessionInviteToken,
} from '../../../utils/tokens.js';
import {
  aggregateCombinedPool,
  computeUserVoteQuota,
  scoreProposalVotes,
  sortAcceptedProposals,
  sortScoredProposals,
  type OwnerSummary,
  type PoolGameInput,
} from '../sessions.scoring.js';

const AGUS: OwnerSummary = {
  id: 'u-agus',
  displayName: 'Agustín',
  avatarUrl: null,
  bggUsername: 'aguspre',
};

const LUCAS: OwnerSummary = {
  id: 'u-lucas',
  displayName: 'Lucas',
  avatarUrl: null,
  bggUsername: 'lucasm_bg',
};

function makePoolGame(overrides: Partial<PoolGameInput> & { id: string; name: string }): PoolGameInput {
  return {
    bggId: 1,
    yearPublished: 2020,
    imageUrl: null,
    thumbnailUrl: null,
    minPlayers: 2,
    maxPlayers: 4,
    bestPlayers: [],
    playingTimeMinutes: 60,
    weight: 2.5,
    bggRating: 8.0,
    isExpansion: false,
    baseGameBggId: null,
    mechanics: [],
    ...overrides,
  };
}

describe('Session voting scoring', () => {
  it('calcula puntaje ponderado (3/2/1) en modo ranked_top3 y detecta el voto del usuario', () => {
    const result = scoreProposalVotes(
      [
        { userId: 'u-agus', rank: 1 },
        { userId: 'u-lucas', rank: 2 },
        { userId: 'u-sofia', rank: 3 },
      ],
      VotingMode.ranked_top3,
      'u-agus',
    );

    expect(result).toEqual({
      voteCount: 3,
      score: 6,
      userVoted: true,
      userRank: 1,
    });
  });

  it('ordena propuestas por score descendente, luego voteCount y luego orden de creación', () => {
    const sorted = sortScoredProposals([
      {
        id: 'p-1',
        createdAt: new Date('2026-11-23T10:00:00Z'),
        voteCount: 2,
        score: 4,
        userVoted: false,
        userRank: null,
      },
      {
        id: 'p-2',
        createdAt: new Date('2026-11-23T10:05:00Z'),
        voteCount: 3,
        score: 4,
        userVoted: true,
        userRank: 2,
      },
      {
        id: 'p-3',
        createdAt: new Date('2026-11-23T10:10:00Z'),
        voteCount: 2,
        score: 6,
        userVoted: true,
        userRank: 1,
      },
    ]);

    expect(sorted.map((p) => p.id)).toEqual(['p-3', 'p-2', 'p-1']);
  });

  it('ordena propuestas aceptadas por orden de aceptación (acceptedAt ascendente)', () => {
    const sorted = sortAcceptedProposals([
      {
        id: 'p-second',
        createdAt: new Date('2026-11-23T09:00:00Z'),
        acceptedAt: new Date('2026-11-23T12:00:00Z'),
      },
      {
        id: 'p-first',
        createdAt: new Date('2026-11-23T10:00:00Z'),
        acceptedAt: new Date('2026-11-23T11:00:00Z'),
      },
    ]);

    expect(sorted.map((p) => p.id)).toEqual(['p-first', 'p-second']);
  });

  it('mantiene consumido el cupo de votos en juegos aceptados en multi_vote, single_choice y ranked_top3', () => {
    const multiQuota = computeUserVoteQuota(
      [
        { status: ProposalStatus.accepted, userVoted: true, userRank: 1 },
        { status: ProposalStatus.open, userVoted: true, userRank: 1 },
        { status: ProposalStatus.open, userVoted: false, userRank: null },
      ],
      VotingMode.multi_vote,
      3,
    );

    expect(multiQuota).toEqual({
      userVotesUsed: 2,
      votesRemaining: 1,
      lockedVotesCount: 1,
      lockedRanks: [1],
    });

    const singleQuota = computeUserVoteQuota(
      [
        { status: ProposalStatus.accepted, userVoted: true, userRank: 1 },
        { status: ProposalStatus.open, userVoted: false, userRank: null },
      ],
      VotingMode.single_choice,
      1,
    );

    expect(singleQuota).toEqual({
      userVotesUsed: 1,
      votesRemaining: 0,
      lockedVotesCount: 1,
      lockedRanks: [1],
    });

    const rankedQuota = computeUserVoteQuota(
      [
        { status: ProposalStatus.accepted, userVoted: true, userRank: 1 },
        { status: ProposalStatus.open, userVoted: true, userRank: 2 },
        { status: ProposalStatus.open, userVoted: false, userRank: null },
      ],
      VotingMode.ranked_top3,
      3,
    );

    expect(rankedQuota).toEqual({
      userVotesUsed: 2,
      votesRemaining: 1,
      lockedVotesCount: 1,
      lockedRanks: [1],
    });
  });
});

describe('Combined session pool aggregation', () => {
  it('agrupa dueños por juego, oculta expansiones y filtra por cantidad de confirmados', () => {
    const heat = makePoolGame({
      id: 'g-heat',
      bggId: 366013,
      name: 'Heat',
      minPlayers: 1,
      maxPlayers: 6,
      bestPlayers: [5, 6],
      bggRating: 8.1,
    });

    const wingspan = makePoolGame({
      id: 'g-wingspan',
      bggId: 266192,
      name: 'Wingspan',
      minPlayers: 1,
      maxPlayers: 5,
      bestPlayers: [3],
      bggRating: 8.1,
    });

    const wingspanExp = makePoolGame({
      id: 'g-wingspan-eu',
      bggId: 290448,
      name: 'Wingspan: Europa',
      minPlayers: 1,
      maxPlayers: 5,
      isExpansion: true,
      baseGameBggId: 266192,
    });

    const brass = makePoolGame({
      id: 'g-brass',
      bggId: 224517,
      name: 'Brass: Birmingham',
      minPlayers: 2,
      maxPlayers: 4,
      bestPlayers: [4],
      bggRating: 8.6,
    });

    const pool = aggregateCombinedPool(
      [
        { user: AGUS, game: wingspan },
        { user: LUCAS, game: wingspan },
        { user: AGUS, game: wingspanExp },
        { user: AGUS, game: heat },
        { user: AGUS, game: brass },
      ],
      new Map<string, ProposalStatus>([['g-heat', ProposalStatus.accepted]]),
      {
        confirmedCount: 5,
        onlyCompatible: true,
        includeExpansions: false,
      },
    );

    // Brass (max 4) y Wingspan: Europa (expansión) quedan filtrados; Heat primero por bestPlayers=[5,6]
    expect(pool.map((g) => g.id)).toEqual(['g-heat', 'g-wingspan']);
    expect(pool[0]!.isProposed).toBe(true);
    expect(pool[0]!.proposalStatus).toBe(ProposalStatus.accepted);
    expect(pool[1]!.isProposed).toBe(false);
    expect(pool[1]!.proposalStatus).toBeNull();
    expect(pool[1]!.owners.map((o) => o.displayName)).toEqual(['Agustín', 'Lucas']);
  });
});

describe('Invite token generators', () => {
  it('genera códigos de grupo legibles y tokens URL-safe', () => {
    const code = generateGroupInviteCode('Los Meeples del Viernes');
    expect(code).toMatch(/^[A-Z0-9]{1,6}-[A-Z2-9]{4}$/);

    const token = generateSessionInviteToken();
    expect(token.length).toBeGreaterThanOrEqual(12);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
