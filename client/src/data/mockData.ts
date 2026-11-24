import type {
  Game,
  GameSession,
  Group,
  LibraryGameItem,
  PlayLog,
  SessionGameItem,
  UserSummary,
} from '../types/domain';
import { createTabletopArt } from '../utils/gameArt';

// ============================================================================
// 1. Usuarios mockeados (grupo principal + compañeros de oficina)
// ============================================================================

export const MOCK_USERS: UserSummary[] = [
  {
    id: 'u-agus',
    displayName: 'Agustín',
    bggUsername: 'aguspre',
    initials: 'AP',
    accentColor: '#1E4D3B',
  },
  {
    id: 'u-lucas',
    displayName: 'Lucas',
    bggUsername: 'lucasm_bg',
    initials: 'LM',
    accentColor: '#C85A32',
  },
  {
    id: 'u-sofia',
    displayName: 'Sofía',
    bggUsername: 'sofia_rolls',
    initials: 'SR',
    accentColor: '#1D5B6E',
  },
  {
    id: 'u-mateo',
    displayName: 'Mateo',
    bggUsername: 'mateo_meeple',
    initials: 'MM',
    accentColor: '#A66A1D',
  },
  {
    id: 'u-valen',
    displayName: 'Valentina',
    bggUsername: 'valen_plays',
    initials: 'VP',
    accentColor: '#6A4C7D',
  },
  {
    id: 'u-cami',
    displayName: 'Camila',
    bggUsername: 'cami_dice',
    initials: 'CD',
    accentColor: '#B44D6B',
  },
  {
    id: 'u-diego',
    displayName: 'Diego',
    bggUsername: 'diego_catan',
    initials: 'DC',
    accentColor: '#3B6E8C',
  },
];

export const CURRENT_USER = MOCK_USERS[0]!;

const [AGUS, LUCAS, SOFIA, MATEO, VALEN, CAMI, DIEGO] = MOCK_USERS as [
  UserSummary,
  UserSummary,
  UserSummary,
  UserSummary,
  UserSummary,
  UserSummary,
  UserSummary,
];

// ============================================================================
// 2. Grupos mockeados (2 grupos activos + 1 grupo demo para unirse con código)
// ============================================================================

export const MOCK_GROUPS: Group[] = [
  {
    id: 'grp-meeples',
    name: 'Los Meeples del Viernes',
    inviteCode: 'MEEPLES-26',
    createdBy: AGUS.id,
    members: [
      { user: AGUS, role: 'admin', joinedAt: '2025-03-12T18:00:00-03:00' },
      { user: LUCAS, role: 'admin', joinedAt: '2025-03-12T18:05:00-03:00' },
      { user: SOFIA, role: 'member', joinedAt: '2025-03-13T11:20:00-03:00' },
      { user: MATEO, role: 'member', joinedAt: '2025-03-14T20:10:00-03:00' },
      { user: VALEN, role: 'member', joinedAt: '2025-04-02T15:30:00-03:00' },
    ],
  },
  {
    id: 'grp-oficina',
    name: 'Sobremesa Oficina',
    inviteCode: 'OFICINA-88',
    createdBy: CAMI.id,
    members: [
      { user: CAMI, role: 'admin', joinedAt: '2026-01-18T13:00:00-03:00' },
      { user: AGUS, role: 'member', joinedAt: '2026-01-19T10:15:00-03:00' },
      { user: SOFIA, role: 'member', joinedAt: '2026-01-20T09:40:00-03:00' },
      { user: DIEGO, role: 'member', joinedAt: '2026-02-05T17:20:00-03:00' },
    ],
  },
];

export const DEMO_JOINABLE_GROUP: Group = {
  id: 'grp-domingos',
  name: 'Domingos de Eurogames',
  inviteCode: 'DOMINGO-99',
  createdBy: LUCAS.id,
  members: [
    { user: LUCAS, role: 'admin', joinedAt: '2026-05-01T16:00:00-03:00' },
    { user: DIEGO, role: 'member', joinedAt: '2026-05-03T18:00:00-03:00' },
    { user: VALEN, role: 'member', joinedAt: '2026-05-04T12:00:00-03:00' },
  ],
};

// ============================================================================
// 3. Catálogo realista de 12 juegos de mesa (variados en peso, jugadores y mecánicas)
// ============================================================================

function makeGame(
  base: Omit<Game, 'imageUrl' | 'thumbnailUrl'>,
  art: Parameters<typeof createTabletopArt>[0],
): Game {
  const artwork = createTabletopArt(art);
  return {
    ...base,
    imageUrl: artwork,
    thumbnailUrl: artwork,
  };
}

export const MOCK_GAMES: Game[] = [
  makeGame(
    {
      id: 'g-cascadia',
      bggId: 295947,
      name: 'Cascadia',
      yearPublished: 2021,
      minPlayers: 1,
      maxPlayers: 4,
      bestPlayers: [2, 3],
      playingTimeMinutes: 45,
      weight: 1.86,
      bggRating: 7.9,
      isExpansion: false,
      mechanics: ['Colocación de losetas', 'Drafting abierto', 'Construcción de patrones'],
    },
    {
      bgStart: '#1D4E45',
      bgEnd: '#2F6F5E',
      accentA: '#82C09A',
      accentB: '#E7B45A',
      ink: '#FAF8F4',
      motif: 'hex',
      tag: 'NATURALEZA',
    },
  ),
  makeGame(
    {
      id: 'g-harmonies',
      bggId: 414317,
      name: 'Harmonies',
      yearPublished: 2024,
      minPlayers: 1,
      maxPlayers: 4,
      bestPlayers: [2, 3],
      playingTimeMinutes: 35,
      weight: 2.02,
      bggRating: 7.9,
      isExpansion: false,
      mechanics: ['Construcción de patrones', 'Colocación de losetas', 'Drafting abierto'],
    },
    {
      bgStart: '#2C5C6E',
      bgEnd: '#448374',
      accentA: '#F2C97D',
      accentB: '#E07A5F',
      ink: '#FAF8F4',
      motif: 'hex',
      tag: 'PAISAJE',
    },
  ),
  makeGame(
    {
      id: 'g-azul',
      bggId: 230802,
      name: 'Azul',
      yearPublished: 2017,
      minPlayers: 2,
      maxPlayers: 4,
      bestPlayers: [2],
      playingTimeMinutes: 40,
      weight: 1.77,
      bggRating: 7.8,
      isExpansion: false,
      mechanics: ['Drafting abierto', 'Construcción de patrones', 'Colección de sets'],
    },
    {
      bgStart: '#1C4B73',
      bgEnd: '#2D6B94',
      accentA: '#F4D35E',
      accentB: '#5EC2D6',
      ink: '#FAF8F4',
      motif: 'tiles',
      tag: 'ABSTRACTO',
    },
  ),
  makeGame(
    {
      id: 'g-wingspan',
      bggId: 266192,
      name: 'Wingspan',
      yearPublished: 2019,
      minPlayers: 1,
      maxPlayers: 5,
      bestPlayers: [3],
      playingTimeMinutes: 70,
      weight: 2.46,
      bggRating: 8.1,
      isExpansion: false,
      mechanics: ['Engine Building', 'Gestión de mano', 'Colección de sets'],
    },
    {
      bgStart: '#3D6270',
      bgEnd: '#6E9187',
      accentA: '#F2CC8F',
      accentB: '#D97254',
      ink: '#FAF8F4',
      motif: 'wings',
      tag: 'ENGINE',
    },
  ),
  makeGame(
    {
      id: 'g-wingspan-eu',
      bggId: 290448,
      name: 'Wingspan: Expansión Europa',
      yearPublished: 2019,
      minPlayers: 1,
      maxPlayers: 5,
      bestPlayers: [3],
      playingTimeMinutes: 70,
      weight: 2.41,
      bggRating: 8.2,
      isExpansion: true,
      baseGameBggId: 266192,
      mechanics: ['Engine Building', 'Gestión de mano'],
    },
    {
      bgStart: '#4E3F6B',
      bgEnd: '#2E5B6B',
      accentA: '#D9A7C7',
      accentB: '#F2C97D',
      ink: '#FAF8F4',
      motif: 'wings',
      tag: 'EXPANSIÓN',
    },
  ),
  makeGame(
    {
      id: 'g-7wonders',
      bggId: 68448,
      name: '7 Wonders',
      yearPublished: 2010,
      minPlayers: 3,
      maxPlayers: 7,
      bestPlayers: [4, 5],
      playingTimeMinutes: 30,
      weight: 2.32,
      bggRating: 7.7,
      isExpansion: false,
      mechanics: ['Drafting cerrado', 'Selección simultánea', 'Colección de sets'],
    },
    {
      bgStart: '#7C4F28',
      bgEnd: '#A67238',
      accentA: '#F2D08B',
      accentB: '#3E7C85',
      ink: '#FAF8F4',
      motif: 'arch',
      tag: 'CIVILIZACIÓN',
    },
  ),
  makeGame(
    {
      id: 'g-heat',
      bggId: 366013,
      name: 'Heat: Pedal to the Metal',
      yearPublished: 2022,
      minPlayers: 1,
      maxPlayers: 6,
      bestPlayers: [5, 6],
      playingTimeMinutes: 60,
      weight: 2.2,
      bggRating: 8.1,
      isExpansion: false,
      mechanics: ['Gestión de mano', 'Push Your Luck', 'Carreras'],
    },
    {
      bgStart: '#8C2F24',
      bgEnd: '#C85A32',
      accentA: '#F6C667',
      accentB: '#FAF8F4',
      ink: '#FAF8F4',
      motif: 'track',
      tag: 'CARRERAS',
    },
  ),
  makeGame(
    {
      id: 'g-scout',
      bggId: 291453,
      name: 'SCOUT',
      yearPublished: 2021,
      minPlayers: 2,
      maxPlayers: 5,
      bestPlayers: [4, 5],
      playingTimeMinutes: 15,
      weight: 1.38,
      bggRating: 7.8,
      isExpansion: false,
      mechanics: ['Gestión de mano', 'Escalera de cartas', 'Colección de sets'],
    },
    {
      bgStart: '#A63A32',
      bgEnd: '#D47B2A',
      accentA: '#F7D774',
      accentB: '#2A6273',
      ink: '#FAF8F4',
      motif: 'cards',
      tag: 'FILLER',
    },
  ),
  makeGame(
    {
      id: 'g-codenames',
      bggId: 178900,
      name: 'Código Secreto (Codenames)',
      yearPublished: 2015,
      minPlayers: 2,
      maxPlayers: 8,
      bestPlayers: [6, 8],
      playingTimeMinutes: 15,
      weight: 1.27,
      bggRating: 7.6,
      isExpansion: false,
      mechanics: ['Deducción', 'Por equipos', 'Party'],
    },
    {
      bgStart: '#2D3A4A',
      bgEnd: '#465466',
      accentA: '#D95D48',
      accentB: '#4A93B8',
      ink: '#FAF8F4',
      motif: 'grid',
      tag: 'PARTY',
    },
  ),
  makeGame(
    {
      id: 'g-root',
      bggId: 237182,
      name: 'Root',
      yearPublished: 2018,
      minPlayers: 2,
      maxPlayers: 4,
      bestPlayers: [4],
      playingTimeMinutes: 90,
      weight: 3.79,
      bggRating: 8.1,
      isExpansion: false,
      mechanics: ['Mayorías de área', 'Poderes asimétricos', 'Gestión de mano'],
    },
    {
      bgStart: '#284A32',
      bgEnd: '#4F6B3A',
      accentA: '#D8723C',
      accentB: '#E6C260',
      ink: '#FAF8F4',
      motif: 'forest',
      tag: 'ASIMÉTRICO',
    },
  ),
  makeGame(
    {
      id: 'g-tmars',
      bggId: 167791,
      name: 'Terraforming Mars',
      yearPublished: 2016,
      minPlayers: 1,
      maxPlayers: 5,
      bestPlayers: [3],
      playingTimeMinutes: 120,
      weight: 3.26,
      bggRating: 8.4,
      isExpansion: false,
      mechanics: ['Engine Building', 'Drafting cerrado', 'Colocación de losetas'],
    },
    {
      bgStart: '#63271A',
      bgEnd: '#9E4528',
      accentA: '#E8924C',
      accentB: '#6FB8C9',
      ink: '#FAF8F4',
      motif: 'orbit',
      tag: 'EURO PESADO',
    },
  ),
  makeGame(
    {
      id: 'g-brass',
      bggId: 224517,
      name: 'Brass: Birmingham',
      yearPublished: 2018,
      minPlayers: 2,
      maxPlayers: 4,
      bestPlayers: [3, 4],
      playingTimeMinutes: 120,
      weight: 3.87,
      bggRating: 8.6,
      isExpansion: false,
      mechanics: ['Construcción de redes', 'Económico', 'Gestión de mano'],
    },
    {
      bgStart: '#2A2320',
      bgEnd: '#524034',
      accentA: '#D99B43',
      accentB: '#C85A32',
      ink: '#FAF8F4',
      motif: 'gears',
      tag: 'ECONÓMICO',
    },
  ),
];

export const ALL_MOCK_MECHANICS: string[] = Array.from(
  new Set(MOCK_GAMES.flatMap((g) => g.mechanics)),
).sort((a, b) => a.localeCompare(b, 'es'));

// ============================================================================
// 4. Ludoteca personal de Agustín (@aguspre)
// ============================================================================

const GAME_BY_ID = new Map(MOCK_GAMES.map((g) => [g.id, g]));
const getGame = (id: string): Game => GAME_BY_ID.get(id)!;

export const MOCK_PERSONAL_LIBRARY: LibraryGameItem[] = [
  {
    ...getGame('g-cascadia'),
    status: 'owned',
    personalRating: 8.5,
    notes: 'Ideal para arrancar la noche o sumar gente nueva.',
  },
  {
    ...getGame('g-wingspan'),
    status: 'owned',
    personalRating: 8.8,
    notes: 'Tengo las cartas enfundadas + bandeja de madera.',
  },
  {
    ...getGame('g-wingspan-eu'),
    status: 'owned',
    personalRating: 8.5,
    notes: 'Siempre mezclada con el juego base.',
  },
  {
    ...getGame('g-heat'),
    status: 'owned',
    personalRating: 9.0,
    notes: 'A 5 y 6 jugadores con clima y módulos de garaje es espectacular.',
  },
  {
    ...getGame('g-scout'),
    status: 'owned',
    personalRating: 8.2,
    notes: 'Siempre en la mochila para cerrar la juntada.',
  },
  {
    ...getGame('g-tmars'),
    status: 'owned',
    personalRating: 9.2,
    notes: 'Con tableros doble capa.',
  },
  {
    ...getGame('g-brass'),
    status: 'owned',
    personalRating: 9.5,
    notes: 'Edición Deluxe con fichas Iron Clays.',
  },
  {
    ...getGame('g-harmonies'),
    status: 'want_to_play',
    notes: 'Lo tiene Sofía, ¡hay que estrenarlo este viernes!',
  },
  {
    ...getGame('g-root'),
    status: 'wishlist',
    notes: 'Pendiente para cuando seamos exactamente 4 con ganas de guerra.',
  },
];

// ============================================================================
// 5. Mapa de dueños (todos los usuarios)
// ============================================================================

export const MOCK_OWNERSHIP_BY_GAME: Record<string, UserSummary[]> = {
  'g-cascadia': [AGUS, SOFIA, CAMI],
  'g-harmonies': [SOFIA, VALEN],
  'g-azul': [LUCAS, VALEN, CAMI],
  'g-wingspan': [AGUS, LUCAS],
  'g-wingspan-eu': [AGUS],
  'g-7wonders': [LUCAS, MATEO, DIEGO],
  'g-heat': [AGUS, MATEO],
  'g-scout': [AGUS, SOFIA, VALEN, CAMI],
  'g-codenames': [MATEO, VALEN, DIEGO],
  'g-root': [LUCAS],
  'g-tmars': [AGUS, LUCAS, DIEGO],
  'g-brass': [AGUS],
};

// ============================================================================
// 6. Juntadas mockeadas (asociadas a grupos)
// ============================================================================

export const MOCK_SESSIONS: GameSession[] = [
  {
    id: 'session-viernes',
    groupId: 'grp-meeples',
    groupName: 'Los Meeples del Viernes',
    title: 'Noche de Euros + Birra en lo de Agus',
    scheduledAt: '2026-11-27T21:00:00-03:00',
    location: 'Depto de Agus (Palermo)',
    host: AGUS,
    status: 'voting',
    votingMode: 'multi_vote',
    maxVotesPerUser: 3,
    inviteToken: 'meeples-27nov',
    participants: [
      { user: AGUS, rsvp: 'going' },
      { user: LUCAS, rsvp: 'going' },
      { user: SOFIA, rsvp: 'going' },
      { user: MATEO, rsvp: 'going' },
      { user: VALEN, rsvp: 'going' },
    ],
    proposals: [
      {
        id: 'prop-1',
        game: getGame('g-heat'),
        owners: [AGUS, MATEO],
        proposedBy: MATEO,
        note: 'Jugamos campeonato de 2 pistas con módulo de clima',
        status: 'open',
        voteCount: 4,
        score: 4,
        userVoted: true,
      },
      {
        id: 'prop-2',
        game: getGame('g-wingspan'),
        owners: [AGUS, LUCAS],
        proposedBy: SOFIA,
        note: 'Llevemos la expansión de Europa para más variedad de aves',
        status: 'open',
        voteCount: 3,
        score: 3,
        userVoted: false,
      },
      {
        id: 'prop-3',
        game: getGame('g-7wonders'),
        owners: [LUCAS, MATEO],
        proposedBy: LUCAS,
        note: 'Rápido para arrancar mientras llegan las pizzas',
        status: 'open',
        voteCount: 2,
        score: 2,
        userVoted: false,
      },
    ],
  },
  {
    id: 'session-domingo',
    groupId: 'grp-meeples',
    groupName: 'Los Meeples del Viernes',
    title: 'Tarde de Pesados (Mesa de 4)',
    scheduledAt: '2026-12-06T16:30:00-03:00',
    location: 'Lo de Lucas (Caballito)',
    host: LUCAS,
    status: 'locked',
    votingMode: 'ranked_top3',
    maxVotesPerUser: 3,
    inviteToken: 'pesados-06dic',
    participants: [
      { user: AGUS, rsvp: 'going' },
      { user: LUCAS, rsvp: 'going' },
      { user: SOFIA, rsvp: 'going' },
      { user: MATEO, rsvp: 'going' },
      { user: VALEN, rsvp: 'not_going' },
    ],
    proposals: [
      {
        id: 'prop-d1',
        game: getGame('g-brass'),
        owners: [AGUS],
        proposedBy: AGUS,
        note: 'Llevo las Iron Clays',
        status: 'accepted',
        acceptedBy: LUCAS,
        voteCount: 4,
        score: 11,
        userVoted: true,
        userRank: 1,
      },
      {
        id: 'prop-d2',
        game: getGame('g-root'),
        owners: [LUCAS],
        proposedBy: LUCAS,
        note: 'Facciones base, todos ya sabemos reglas',
        status: 'open',
        voteCount: 3,
        score: 7,
        userVoted: true,
        userRank: 2,
      },
    ],
  },
  {
    id: 'session-oficina',
    groupId: 'grp-oficina',
    groupName: 'Sobremesa Oficina',
    title: 'After Office de Fillers (1 hora)',
    scheduledAt: '2026-11-26T18:30:00-03:00',
    location: 'Sala Comedor · Piso 4',
    host: CAMI,
    status: 'voting',
    votingMode: 'single_choice',
    maxVotesPerUser: 1,
    inviteToken: 'oficina-26nov',
    participants: [
      { user: CAMI, rsvp: 'going' },
      { user: AGUS, rsvp: 'going' },
      { user: SOFIA, rsvp: 'going' },
      { user: DIEGO, rsvp: 'going' },
    ],
    proposals: [
      {
        id: 'prop-o1',
        game: getGame('g-azul'),
        owners: [CAMI],
        proposedBy: CAMI,
        note: 'Se explica en 2 minutos y entra perfecto en el horario',
        status: 'open',
        voteCount: 2,
        score: 2,
        userVoted: false,
      },
      {
        id: 'prop-o2',
        game: getGame('g-scout'),
        owners: [AGUS, SOFIA, CAMI],
        proposedBy: SOFIA,
        note: 'Podemos meter dos partidas al hilo',
        status: 'open',
        voteCount: 2,
        score: 2,
        userVoted: true,
      },
    ],
  },
];

export const MOCK_SESSION_POOL: SessionGameItem[] = MOCK_GAMES.map((game) => {
  const proposedIds = new Set(MOCK_SESSIONS[0]!.proposals.map((p) => p.game.id));
  return {
    ...game,
    owners: MOCK_OWNERSHIP_BY_GAME[game.id] ?? [AGUS],
    isProposed: proposedIds.has(game.id),
  };
});

// ============================================================================
// 7. Historial de partidas mockeado (por grupo)
// ============================================================================

export const MOCK_PLAY_LOGS: PlayLog[] = [
  {
    id: 'log-1',
    groupId: 'grp-meeples',
    sessionTitle: 'Juntada de Noviembre #1',
    game: getGame('g-cascadia'),
    playedAt: '2026-11-15T22:15:00-03:00',
    durationMinutes: 48,
    notes: 'Sofía metió combo récord de salmones.',
    players: [
      { user: SOFIA, score: 104, isWinner: true },
      { user: AGUS, score: 97, isWinner: false },
      { user: LUCAS, score: 91, isWinner: false },
      { user: VALEN, score: 86, isWinner: false },
    ],
  },
  {
    id: 'log-2',
    groupId: 'grp-meeples',
    sessionTitle: 'Juntada de Noviembre #1',
    game: getGame('g-scout'),
    playedAt: '2026-11-15T23:30:00-03:00',
    durationMinutes: 20,
    notes: 'Dos rondas seguidas para cerrar la noche.',
    players: [
      { user: MATEO, score: 42, isWinner: true },
      { user: AGUS, score: 38, isWinner: false },
      { user: SOFIA, score: 31, isWinner: false },
      { user: LUCAS, score: 29, isWinner: false },
      { user: VALEN, score: 25, isWinner: false },
    ],
  },
  {
    id: 'log-3',
    groupId: 'grp-meeples',
    sessionTitle: 'Especial Terraforming',
    game: getGame('g-tmars'),
    playedAt: '2026-11-02T19:00:00-03:00',
    durationMinutes: 145,
    notes: 'Victoria ajustada por hitos en la generación 11.',
    players: [
      { user: AGUS, score: 89, isWinner: true },
      { user: LUCAS, score: 87, isWinner: false },
      { user: MATEO, score: 74, isWinner: false },
    ],
  },
  {
    id: 'log-4',
    groupId: 'grp-oficina',
    sessionTitle: 'Almuerzo extendido',
    game: getGame('g-azul'),
    playedAt: '2026-11-19T13:45:00-03:00',
    durationMinutes: 35,
    notes: 'Camila cerró dos columnas completas.',
    players: [
      { user: CAMI, score: 78, isWinner: true },
      { user: AGUS, score: 66, isWinner: false },
      { user: SOFIA, score: 61, isWinner: false },
      { user: DIEGO, score: 54, isWinner: false },
    ],
  },
];
