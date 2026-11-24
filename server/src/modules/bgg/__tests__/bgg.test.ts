import { describe, expect, it, vi } from 'vitest';
import { hashPassword, verifyPassword } from '../../../utils/password.js';
import { BggClient } from '../bgg.client.js';
import { BggGuard } from '../bgg.guard.js';
import {
  parseBggCollectionXml,
  parseBggSearchXml,
  parseBggThingXml,
} from '../bgg.parser.js';
import {
  bggImportParamsSchema,
  bggSearchQuerySchema,
  bggUsernameSchema,
} from '../bgg.schemas.js';

const SAMPLE_COLLECTION_XML = `<?xml version="1.0" encoding="utf-8"?>
<items totalitems="2" termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
  <item objecttype="thing" objectid="174430" subtype="boardgame" collid="1">
    <name sortindex="1">Gloomhaven</name>
    <yearpublished>2017</yearpublished>
    <image>https://cf.geekdo-images.com/gloomhaven.jpg</image>
    <thumbnail>https://cf.geekdo-images.com/gloomhaven_t.jpg</thumbnail>
    <stats minplayers="1" maxplayers="4">
      <rating value="9.5" />
    </stats>
  </item>
  <item objecttype="thing" objectid="266192" subtype="boardgame" collid="2">
    <name sortindex="1">Wingspan</name>
    <yearpublished>2019</yearpublished>
    <stats minplayers="1" maxplayers="5">
      <rating value="N/A" />
    </stats>
  </item>
</items>`;

const SAMPLE_THING_XML = `<?xml version="1.0" encoding="utf-8"?>
<items>
  <item type="boardgame" id="266192">
    <thumbnail>https://cf.geekdo-images.com/wingspan_t.jpg</thumbnail>
    <image>https://cf.geekdo-images.com/wingspan.jpg</image>
    <name type="primary" sortindex="1" value="Wingspan" />
    <name type="alternate" sortindex="1" value="Flügelschlag" />
    <yearpublished value="2019" />
    <minplayers value="1" />
    <maxplayers value="5" />
    <playingtime value="70" />
    <poll name="suggested_numplayers" title="User Suggested Number of Players" totalvotes="500">
      <results numplayers="1">
        <result value="Best" numvotes="30" />
        <result value="Recommended" numvotes="150" />
        <result value="Not Recommended" numvotes="80" />
      </results>
      <results numplayers="3">
        <result value="Best" numvotes="320" />
        <result value="Recommended" numvotes="150" />
        <result value="Not Recommended" numvotes="5" />
      </results>
      <results numplayers="4">
        <result value="Best" numvotes="210" />
        <result value="Recommended" numvotes="200" />
        <result value="Not Recommended" numvotes="30" />
      </results>
      <results numplayers="5+">
        <result value="Best" numvotes="1" />
        <result value="Recommended" numvotes="2" />
        <result value="Not Recommended" numvotes="100" />
      </results>
    </poll>
    <link type="boardgamemechanic" id="2040" value="Hand Management" />
    <link type="boardgamemechanic" id="2004" value="Set Collection" />
    <statistics page="1">
      <ratings>
        <average value="8.04812" />
        <averageweight value="2.4632" />
      </ratings>
    </statistics>
  </item>
  <item type="boardgameexpansion" id="290448">
    <name type="primary" sortindex="1" value="Wingspan: European Expansion" />
    <yearpublished value="2019" />
    <minplayers value="1" />
    <maxplayers value="5" />
    <playingtime value="70" />
    <link type="boardgameexpansion" id="266192" value="Wingspan" inbound="true" />
    <link type="boardgamemechanic" id="2040" value="Hand Management" />
    <statistics page="1">
      <ratings>
        <average value="8.19" />
        <averageweight value="2.41" />
      </ratings>
    </statistics>
  </item>
</items>`;

const SAMPLE_SEARCH_XML = `<?xml version="1.0" encoding="utf-8"?>
<items total="2">
  <item type="boardgame" id="13">
    <name type="primary" value="CATAN" />
    <yearpublished value="1995" />
  </item>
  <item type="boardgameexpansion" id="2807">
    <name type="primary" value="CATAN: Seafarers" />
    <yearpublished value="1997" />
  </item>
</items>`;

describe('BGG XML Parsers', () => {
  it('parsea correctamente /collection incluyendo rating personal y N/A', () => {
    const items = parseBggCollectionXml(SAMPLE_COLLECTION_XML);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      bggId: 174430,
      name: 'Gloomhaven',
      yearPublished: 2017,
      personalRating: 9.5,
    });
    expect(items[1]).toMatchObject({
      bggId: 266192,
      name: 'Wingspan',
      yearPublished: 2019,
      personalRating: null,
    });
  });

  it('detecta errores XML de usuario inválido en BGG', () => {
    const invalidUserXml = `<errors><error><message>Invalid username specified</message></error></errors>`;
    expect(() => parseBggCollectionXml(invalidUserXml)).toThrow(/no existe/i);
  });

  it('parsea /thing con bestPlayers, mecánicas, stats y expansiones con baseGameBggId', () => {
    const games = parseBggThingXml(SAMPLE_THING_XML);
    expect(games).toHaveLength(2);

    const wingspan = games[0]!;
    expect(wingspan).toMatchObject({
      bggId: 266192,
      name: 'Wingspan',
      yearPublished: 2019,
      minPlayers: 1,
      maxPlayers: 5,
      bestPlayers: [3, 4],
      playingTimeMinutes: 70,
      weight: 2.46,
      bggRating: 8.05,
      isExpansion: false,
      baseGameBggId: null,
    });
    expect(wingspan.mechanics).toEqual([
      { bggId: 2040, name: 'Hand Management' },
      { bggId: 2004, name: 'Set Collection' },
    ]);

    const expansion = games[1]!;
    expect(expansion).toMatchObject({
      bggId: 290448,
      name: 'Wingspan: European Expansion',
      isExpansion: true,
      baseGameBggId: 266192,
    });
  });

  it('parsea /search diferenciando juegos base y expansiones', () => {
    const results = parseBggSearchXml(SAMPLE_SEARCH_XML);
    expect(results).toEqual([
      { bggId: 13, name: 'CATAN', yearPublished: 1995, isExpansion: false },
      { bggId: 2807, name: 'CATAN: Seafarers', yearPublished: 1997, isExpansion: true },
    ]);
  });
});

describe('BggClient polling & batching', () => {
  it('reintenta con backoff cuando /collection responde 202 Accepted hasta recibir 200 OK', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('<message>Queued</message>', { status: 202 }))
      .mockResolvedValueOnce(new Response('<message>Still queued</message>', { status: 202 }))
      .mockResolvedValueOnce(new Response(SAMPLE_COLLECTION_XML, { status: 200 }));

    const sleepDelays: number[] = [];
    const client = new BggClient({
      baseUrl: 'https://boardgamegeek.com/xmlapi2',
      fetchFn: fetchMock,
      sleepFn: async (ms) => {
        sleepDelays.push(ms);
      },
      collectionInitialDelayMs: 100,
      collectionMaxDelayMs: 1000,
    });

    const items = await client.fetchUserCollection('agus_bg');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleepDelays).toHaveLength(2);
    expect(sleepDelays[1]!).toBeGreaterThanOrEqual(sleepDelays[0]!);
    expect(items).toHaveLength(2);
  });

  it('divide /thing en lotes de máximo 20 IDs', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      const ids = url.searchParams.get('id')?.split(',') ?? [];
      const itemsXml = ids
        .map(
          (id) =>
            `<item type="boardgame" id="${id}"><name type="primary" value="Game ${id}" /></item>`,
        )
        .join('');
      return new Response(`<items>${itemsXml}</items>`, { status: 200 });
    });

    const client = new BggClient({
      baseUrl: 'https://boardgamegeek.com/xmlapi2',
      fetchFn: fetchMock,
      sleepFn: async () => {},
      thingBatchDelayMs: 0,
    });

    const ids = Array.from({ length: 45 }, (_, idx) => idx + 1);
    const games = await client.fetchThingsByIds(ids);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(games).toHaveLength(45);
  });

  it('permite consultar /thing sin stats=1 para obtener miniaturas de búsqueda livianas', async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      requestedUrls.push(String(input));
      return new Response(
        `<items><item type="boardgame" id="40628"><thumbnail>https://cf.geekdo-images.com/finca_t.jpg</thumbnail><name type="primary" value="Finca" /><minplayers value="2" /><maxplayers value="4" /><playingtime value="45" /></item></items>`,
        { status: 200 },
      );
    });

    const client = new BggClient({
      baseUrl: 'https://boardgamegeek.com/xmlapi2',
      fetchFn: fetchMock,
      sleepFn: async () => {},
      thingBatchDelayMs: 0,
    });

    const games = await client.fetchThingsByIds([40628], { includeStats: false });
    expect(requestedUrls).toHaveLength(1);
    const parsedUrl = new URL(requestedUrls[0]!);
    expect(parsedUrl.searchParams.get('id')).toBe('40628');
    expect(parsedUrl.searchParams.has('stats')).toBe(false);
    expect(games[0]).toMatchObject({
      bggId: 40628,
      name: 'Finca',
      thumbnailUrl: 'https://cf.geekdo-images.com/finca_t.jpg',
      minPlayers: 2,
      maxPlayers: 4,
      playingTimeMinutes: 45,
    });
  });
});

describe('Password hashing', () => {
  it('hashea y verifica contraseñas correctamente con scrypt', async () => {
    const hash = await hashPassword('MiClaveSegura123!');
    expect(hash).toContain(':');
    expect(await verifyPassword('MiClaveSegura123!', hash)).toBe(true);
    expect(await verifyPassword('OtraClave', hash)).toBe(false);
  });
});

describe('BggGuard (cuota diaria, cooldown, concurrencia, cache y rate limits)', () => {
  it('limita la sincronización de biblioteca a 2 veces cada 24 horas y se reinicia pasado el día', () => {
    let now = Date.UTC(2026, 10, 24, 12, 0, 0);
    const guard = new BggGuard({
      maxSyncsPerDay: 2,
      sameUserCooldownMs: 5 * 60 * 1000,
      searchRateLimitPerMin: 15,
      importRateLimitPerHour: 30,
      searchCacheTtlMs: 15 * 60 * 1000,
      nowFn: () => now,
    });

    // 1ra sincronización
    const slot1 = guard.acquireSyncSlot('user-1', 'agus_bg');
    slot1.release(true);
    expect(guard.getSyncQuota('user-1')).toMatchObject({
      dailyLimit: 2,
      usedToday: 1,
      remainingToday: 1,
    });

    // Avanzamos 10 min (pasa el cooldown de 5 min) -> 2da sincronización
    now += 10 * 60 * 1000;
    const slot2 = guard.acquireSyncSlot('user-1', 'agus_bg');
    slot2.release(true);
    expect(guard.getSyncQuota('user-1')).toMatchObject({
      dailyLimit: 2,
      usedToday: 2,
      remainingToday: 0,
    });

    // 3ra sincronización el mismo día -> bloqueada con 429
    now += 10 * 60 * 1000;
    expect(() => guard.acquireSyncSlot('user-1', 'agus_bg')).toThrowError(
      expect.objectContaining({
        statusCode: 429,
        code: 'BGG_DAILY_SYNC_LIMIT_REACHED',
      }),
    );

    // Pasadas 24 horas desde la primera -> vuelve a tener 1 cupo disponible
    now = Date.UTC(2026, 10, 25, 12, 0, 1);
    const slot3 = guard.acquireSyncSlot('user-1', 'agus_bg');
    slot3.release(true);
    expect(guard.getSyncQuota('user-1').remainingToday).toBe(0);
  });

  it('aplica cooldown de 5 minutos para el mismo usuario BGG pero permite corregir otro usuario', () => {
    let now = Date.UTC(2026, 10, 24, 12, 0, 0);
    const guard = new BggGuard({
      maxSyncsPerDay: 2,
      sameUserCooldownMs: 5 * 60 * 1000,
      searchRateLimitPerMin: 15,
      importRateLimitPerHour: 30,
      searchCacheTtlMs: 15 * 60 * 1000,
      nowFn: () => now,
    });

    const slot1 = guard.acquireSyncSlot('user-1', 'agus_bg');
    slot1.release(true);

    // 1 minuto después con el mismo username -> 429 cooldown sin quemar el 2do cupo
    now += 60 * 1000;
    expect(() => guard.acquireSyncSlot('user-1', 'AGUS_BG')).toThrowError(
      expect.objectContaining({
        statusCode: 429,
        code: 'BGG_SYNC_COOLDOWN',
      }),
    );
    expect(guard.getSyncQuota('user-1').remainingToday).toBe(1);

    // Si corrige el username, puede usar su 2do cupo inmediatamente
    const slot2 = guard.acquireSyncSlot('user-1', 'agus_real');
    slot2.release(true);
    expect(guard.getSyncQuota('user-1').remainingToday).toBe(0);
  });

  it('bloquea sincronizaciones concurrentes (409) y no consume cupo si falla', () => {
    const guard = new BggGuard({
      maxSyncsPerDay: 2,
      sameUserCooldownMs: 0,
      searchRateLimitPerMin: 15,
      importRateLimitPerHour: 30,
      searchCacheTtlMs: 15 * 60 * 1000,
    });

    const slot = guard.acquireSyncSlot('user-1', 'agus_bg');
    expect(() => guard.acquireSyncSlot('user-1', 'agus_bg')).toThrowError(
      expect.objectContaining({
        statusCode: 409,
        code: 'BGG_SYNC_IN_PROGRESS',
      }),
    );

    // Si falla el sync, no consume cupo
    slot.release(false);
    expect(guard.getSyncQuota('user-1').usedToday).toBe(0);
  });

  it('siembra cuota desde lastBggSyncAt persistido en DB tras reinicio del servidor', () => {
    const now = Date.UTC(2026, 10, 24, 15, 0, 0);
    const lastSyncAt = new Date(now - 2 * 60 * 60 * 1000); // hace 2 horas
    const guard = new BggGuard({
      maxSyncsPerDay: 2,
      sameUserCooldownMs: 5 * 60 * 1000,
      searchRateLimitPerMin: 15,
      importRateLimitPerHour: 30,
      searchCacheTtlMs: 15 * 60 * 1000,
      nowFn: () => now,
    });

    expect(guard.getSyncQuota('user-1', lastSyncAt, 'agus_bg')).toMatchObject({
      usedToday: 1,
      remainingToday: 1,
    });
  });

  it('cachea y deduplica búsquedas en vuelo y aplica rate limit por minuto', async () => {
    const guard = new BggGuard({
      maxSyncsPerDay: 2,
      sameUserCooldownMs: 0,
      searchRateLimitPerMin: 2,
      importRateLimitPerHour: 2,
      searchCacheTtlMs: 15 * 60 * 1000,
    });

    const fetcher = vi.fn(async () => [
      { bggId: 13, name: 'CATAN', yearPublished: 1995, isExpansion: false },
    ]);

    // Dos búsquedas concurrentes iguales (con espacios/mayúsculas distintas) solo disparan 1 llamada
    const [r1, r2] = await Promise.all([
      guard.getOrFetchSearch('  Catan ', false, fetcher),
      guard.getOrFetchSearch('catan', false, fetcher),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(r1.results).toHaveLength(1);
    expect(r2.results).toHaveLength(1);

    // Tercera búsqueda lee de cache
    const r3 = await guard.getOrFetchSearch('CATAN', false, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(r3.fromCache).toBe(true);

    // Rate limit de búsqueda: 2/min permitidas, la 3ra devuelve 429
    guard.assertSearchRateLimit('user-1');
    guard.assertSearchRateLimit('user-1');
    expect(() => guard.assertSearchRateLimit('user-1')).toThrowError(
      expect.objectContaining({
        statusCode: 429,
        code: 'BGG_SEARCH_RATE_LIMITED',
      }),
    );

    // Rate limit de importación individual: 2/hora permitidas, la 3ra devuelve 429
    guard.assertUpstreamImportRateLimit('user-1');
    guard.assertUpstreamImportRateLimit('user-1');
    expect(() => guard.assertUpstreamImportRateLimit('user-1')).toThrowError(
      expect.objectContaining({
        statusCode: 429,
        code: 'BGG_IMPORT_RATE_LIMITED',
      }),
    );
  });

  it('cachea previews de búsqueda con TTL y evicción LRU', () => {
    let now = Date.UTC(2026, 10, 24, 12, 0, 0);
    const guard = new BggGuard({
      maxSyncsPerDay: 2,
      sameUserCooldownMs: 0,
      searchRateLimitPerMin: 15,
      importRateLimitPerHour: 30,
      searchCacheTtlMs: 15 * 60 * 1000,
      previewCacheTtlMs: 30 * 60 * 1000,
      maxPreviewCacheEntries: 2,
      nowFn: () => now,
    });

    guard.cacheThingPreviews([
      {
        bggId: 40628,
        thumbnailUrl: 'https://cf.geekdo-images.com/finca_t.jpg',
        imageUrl: null,
        minPlayers: 2,
        maxPlayers: 4,
        playingTimeMinutes: 45,
      },
      {
        bggId: 13,
        thumbnailUrl: 'https://cf.geekdo-images.com/catan_t.jpg',
        imageUrl: null,
        minPlayers: 3,
        maxPlayers: 4,
        playingTimeMinutes: 120,
      },
    ]);

    // Accedemos a 40628 para refrescar su posición LRU antes de insertar un 3ro
    expect(guard.getCachedThingPreviews([40628]).get(40628)?.thumbnailUrl).toBe(
      'https://cf.geekdo-images.com/finca_t.jpg',
    );

    guard.cacheThingPreviews([
      {
        bggId: 266192,
        thumbnailUrl: 'https://cf.geekdo-images.com/wingspan_t.jpg',
        imageUrl: null,
        minPlayers: 1,
        maxPlayers: 5,
        playingTimeMinutes: 70,
      },
    ]);

    const afterEviction = guard.getCachedThingPreviews([40628, 13, 266192]);
    expect(afterEviction.has(40628)).toBe(true);
    expect(afterEviction.has(266192)).toBe(true);
    expect(afterEviction.has(13)).toBe(false);

    // Expiración por TTL
    now += 31 * 60 * 1000;
    expect(guard.getCachedThingPreviews([40628, 266192]).size).toBe(0);
  });
});

describe('BGG strict schemas', () => {
  it('rechaza caracteres peligrosos en bggUsername y queries vacías de símbolos', () => {
    expect(bggUsernameSchema.safeParse('agus_bg-2').success).toBe(true);
    expect(bggUsernameSchema.safeParse('bad/user?x=1').success).toBe(false);
    expect(bggUsernameSchema.safeParse('a').success).toBe(false);

    expect(bggSearchQuerySchema.safeParse({ query: '  Wingspan  ' })).toMatchObject({
      success: true,
      data: { query: 'Wingspan' },
    });
    expect(bggSearchQuerySchema.safeParse({ query: '...' }).success).toBe(false);

    expect(bggImportParamsSchema.safeParse({ bggId: '266192' }).success).toBe(true);
    expect(bggImportParamsSchema.safeParse({ bggId: '999999999' }).success).toBe(false);
  });
});
