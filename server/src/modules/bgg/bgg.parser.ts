import { XMLParser } from 'fast-xml-parser';
import { badGateway, badRequest } from '../../utils/errors.js';
import type {
  BggCollectionItem,
  BggGameDetails,
  BggMechanicInfo,
  BggSearchItem,
} from './bgg.types.js';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
});

type XmlNode = Record<string, unknown>;

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (value && typeof value === 'object' && '#text' in value) {
    const text = (value as XmlNode)['#text'];
    return typeof text === 'string' && text.trim().length > 0 ? text.trim() : null;
  }
  return null;
}

function toOptionalInt(value: unknown): number | null {
  const str = asNonEmptyString(value);
  if (!str) return null;
  const parsed = Number.parseInt(str, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPositiveInt(value: unknown): number | null {
  const parsed = toOptionalInt(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function toPositiveDecimal(value: unknown, decimals = 2): number | null {
  const str = asNonEmptyString(value);
  if (!str || str.toUpperCase() === 'N/A') return null;
  const parsed = Number.parseFloat(str);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const factor = Math.pow(10, decimals);
  return Math.round(parsed * factor) / factor;
}

function parseXmlRoot(xml: string): XmlNode {
  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xml);
  } catch (error) {
    throw badGateway('No se pudo parsear la respuesta XML de BoardGameGeek', 'BGG_XML_PARSE_ERROR', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  if (!parsed || typeof parsed !== 'object') {
    throw badGateway('Respuesta XML vacía o inválida de BoardGameGeek', 'BGG_XML_INVALID');
  }

  const root = parsed as XmlNode;
  assertNoBggError(root);
  return root;
}

function assertNoBggError(root: XmlNode): void {
  const errorsNode = root.errors as XmlNode | undefined;
  if (!errorsNode) return;

  const errorEntries = asArray(errorsNode.error as XmlNode | XmlNode[] | undefined);
  const messages = errorEntries
    .map((entry) => asNonEmptyString(entry.message))
    .filter((msg): msg is string => Boolean(msg));

  const combined = messages.join('; ') || 'Error reportado por BoardGameGeek';

  if (/invalid username/i.test(combined)) {
    throw badRequest(
      'El usuario de BoardGameGeek especificado no existe',
      { bggMessage: combined },
      'BGG_INVALID_USERNAME',
    );
  }

  throw badGateway(`BoardGameGeek devolvió un error: ${combined}`, 'BGG_API_ERROR', {
    bggMessage: combined,
  });
}

export function parseBggCollectionXml(xml: string): BggCollectionItem[] {
  const root = parseXmlRoot(xml);
  const itemsNode = root.items as XmlNode | undefined;
  if (!itemsNode) {
    return [];
  }

  const rawItems = asArray(itemsNode.item as XmlNode | XmlNode[] | undefined);
  const seen = new Map<number, BggCollectionItem>();

  for (const item of rawItems) {
    const bggId = toPositiveInt(item['@_objectid']);
    if (!bggId) continue;

    const name = asNonEmptyString(item.name) ?? `BGG #${bggId}`;
    const yearPublished = toOptionalInt(item.yearpublished);
    const stats = item.stats as XmlNode | undefined;
    const ratingNode = stats?.rating as XmlNode | undefined;
    const personalRating = toPositiveDecimal(ratingNode?.['@_value'], 2);

    const existing = seen.get(bggId);
    if (!existing) {
      seen.set(bggId, {
        bggId,
        name,
        yearPublished,
        personalRating,
        thumbnailUrl: asNonEmptyString(item.thumbnail),
        imageUrl: asNonEmptyString(item.image),
      });
    } else if (existing.personalRating === null && personalRating !== null) {
      existing.personalRating = personalRating;
    }
  }

  return Array.from(seen.values());
}

function extractBestPlayers(item: XmlNode): number[] {
  const polls = asArray(item.poll as XmlNode | XmlNode[] | undefined);
  const numPlayersPoll = polls.find(
    (poll) => poll['@_name'] === 'suggested_numplayers',
  );
  if (!numPlayersPoll) return [];

  const totalVotes = toOptionalInt(numPlayersPoll['@_totalvotes']) ?? 0;
  if (totalVotes <= 0) return [];

  const resultsList = asArray(numPlayersPoll.results as XmlNode | XmlNode[] | undefined);
  const bestCounts: number[] = [];

  for (const resultGroup of resultsList) {
    const numPlayersAttr = asNonEmptyString(resultGroup['@_numplayers']);
    if (!numPlayersAttr || !/^\d+$/.test(numPlayersAttr)) {
      continue;
    }

    const playerCount = Number.parseInt(numPlayersAttr, 10);
    const votes = asArray(resultGroup.result as XmlNode | XmlNode[] | undefined);

    let bestVotes = 0;
    let recommendedVotes = 0;
    let notRecommendedVotes = 0;

    for (const vote of votes) {
      const label = asNonEmptyString(vote['@_value']);
      const count = toOptionalInt(vote['@_numvotes']) ?? 0;
      if (label === 'Best') bestVotes = count;
      else if (label === 'Recommended') recommendedVotes = count;
      else if (label === 'Not Recommended') notRecommendedVotes = count;
    }

    if (
      bestVotes > 0 &&
      bestVotes >= recommendedVotes &&
      bestVotes > notRecommendedVotes
    ) {
      bestCounts.push(playerCount);
    }
  }

  return bestCounts.sort((a, b) => a - b);
}

export function parseBggThingXml(xml: string): BggGameDetails[] {
  const root = parseXmlRoot(xml);
  const itemsNode = root.items as XmlNode | undefined;
  if (!itemsNode) {
    return [];
  }

  const rawItems = asArray(itemsNode.item as XmlNode | XmlNode[] | undefined);
  const games: BggGameDetails[] = [];

  for (const item of rawItems) {
    const bggId = toPositiveInt(item['@_id']);
    if (!bggId) continue;

    const itemType = asNonEmptyString(item['@_type']);
    const isExpansion = itemType === 'boardgameexpansion';

    const names = asArray(item.name as XmlNode | XmlNode[] | undefined);
    const primaryNameNode =
      names.find((n) => n['@_type'] === 'primary') ?? names[0];
    const name = asNonEmptyString(primaryNameNode?.['@_value']) ?? `BGG #${bggId}`;

    const yearPublished = toOptionalInt((item.yearpublished as XmlNode | undefined)?.['@_value']);
    const imageUrl = asNonEmptyString(item.image);
    const thumbnailUrl = asNonEmptyString(item.thumbnail);
    const minPlayers = toPositiveInt((item.minplayers as XmlNode | undefined)?.['@_value']);
    const maxPlayers = toPositiveInt((item.maxplayers as XmlNode | undefined)?.['@_value']);
    const playingTimeMinutes =
      toPositiveInt((item.playingtime as XmlNode | undefined)?.['@_value']) ??
      toPositiveInt((item.maxplaytime as XmlNode | undefined)?.['@_value']);

    const bestPlayers = extractBestPlayers(item);

    const ratings = (item.statistics as XmlNode | undefined)?.ratings as XmlNode | undefined;
    const weight = toPositiveDecimal((ratings?.averageweight as XmlNode | undefined)?.['@_value'], 2);
    const bggRating = toPositiveDecimal((ratings?.average as XmlNode | undefined)?.['@_value'], 2);

    const links = asArray(item.link as XmlNode | XmlNode[] | undefined);
    const mechanicsMap = new Map<number, BggMechanicInfo>();
    let baseGameBggId: number | null = null;

    for (const link of links) {
      const linkType = asNonEmptyString(link['@_type']);
      const linkId = toPositiveInt(link['@_id']);
      const linkValue = asNonEmptyString(link['@_value']);

      if (linkType === 'boardgamemechanic' && linkId && linkValue) {
        mechanicsMap.set(linkId, { bggId: linkId, name: linkValue });
      } else if (
        isExpansion &&
        baseGameBggId === null &&
        linkType === 'boardgameexpansion' &&
        link['@_inbound'] === 'true' &&
        linkId
      ) {
        baseGameBggId = linkId;
      }
    }

    games.push({
      bggId,
      name,
      yearPublished,
      imageUrl,
      thumbnailUrl,
      minPlayers,
      maxPlayers,
      bestPlayers,
      playingTimeMinutes,
      weight,
      bggRating,
      isExpansion,
      baseGameBggId,
      mechanics: Array.from(mechanicsMap.values()),
    });
  }

  return games;
}

export function parseBggSearchXml(xml: string): BggSearchItem[] {
  const root = parseXmlRoot(xml);
  const itemsNode = root.items as XmlNode | undefined;
  if (!itemsNode) {
    return [];
  }

  const rawItems = asArray(itemsNode.item as XmlNode | XmlNode[] | undefined);
  const uniqueResults = new Map<number, BggSearchItem>();

  for (const item of rawItems) {
    const bggId = toPositiveInt(item['@_id']);
    if (!bggId || uniqueResults.has(bggId)) continue;

    const names = asArray(item.name as XmlNode | XmlNode[] | undefined);
    const name = asNonEmptyString(names[0]?.['@_value']) ?? `BGG #${bggId}`;
    const yearPublished = toOptionalInt((item.yearpublished as XmlNode | undefined)?.['@_value']);
    const isExpansion = item['@_type'] === 'boardgameexpansion';

    uniqueResults.set(bggId, {
      bggId,
      name,
      yearPublished,
      isExpansion,
    });
  }

  return Array.from(uniqueResults.values());
}
