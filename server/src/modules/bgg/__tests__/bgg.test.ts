import { describe, expect, it, vi } from 'vitest';
import { hashPassword, verifyPassword } from '../../../utils/password.js';
import { BggClient } from '../bgg.client.js';
import {
  parseBggCollectionXml,
  parseBggSearchXml,
  parseBggThingXml,
} from '../bgg.parser.js';

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
});

describe('Password hashing', () => {
  it('hashea y verifica contraseñas correctamente con scrypt', async () => {
    const hash = await hashPassword('MiClaveSegura123!');
    expect(hash).toContain(':');
    expect(await verifyPassword('MiClaveSegura123!', hash)).toBe(true);
    expect(await verifyPassword('OtraClave', hash)).toBe(false);
  });
});
