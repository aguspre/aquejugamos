const SITE_NAME = '¿A qué jugamos?';
const DEFAULT_TITLE = '¿A qué jugamos? — Ludoteca Colaborativa';
const DEFAULT_DESCRIPTION =
  'Organizá juntadas de juegos de mesa, uní ludotecas con tus amigos y votá qué sale a la mesa.';
const DEFAULT_HOST = 'aquejugamos-chi.vercel.app';
const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires';
const FETCH_TIMEOUT_MS = 4500;

function firstValue(value) {
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value : undefined;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function truncateText(text, maxLength) {
  const normalized = String(text).replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function formatPreviewDate(isoString, timeZone = DEFAULT_TIMEZONE) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';

  const weekday = new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    timeZone,
  }).format(date);
  const day = new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    timeZone,
  }).format(date);
  const month = new Intl.DateTimeFormat('es-AR', {
    month: 'short',
    timeZone,
  }).format(date);
  const time = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(date);

  const cleanWeekday = weekday.replace(/\.$/, '');
  const capWeekday = cleanWeekday.charAt(0).toUpperCase() + cleanWeekday.slice(1);
  const cleanMonth = month.replace(/\.$/, '');
  return `${capWeekday} ${day} ${cleanMonth} · ${time} hs`;
}

export function buildPreviewMetadata(preview, timeZone = DEFAULT_TIMEZONE) {
  if (!preview || typeof preview !== 'object') {
    return {
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
    };
  }

  if (preview.kind === 'session' && preview.sessionTitle) {
    const title = truncateText(`${preview.sessionTitle} — ${SITE_NAME}`, 110);
    const details = [];

    if (preview.scheduledAt) {
      const formattedDate = formatPreviewDate(preview.scheduledAt, timeZone);
      if (formattedDate) details.push(formattedDate);
    }

    if (preview.groupName && preview.groupName !== 'Invitación directa') {
      details.push(preview.groupName);
    }

    if (preview.location) {
      details.push(truncateText(preview.location, 40));
    }

    if (typeof preview.confirmedCount === 'number' && preview.confirmedCount > 0) {
      details.push(
        preview.confirmedCount === 1
          ? '1 confirmado'
          : `${preview.confirmedCount} confirmados`,
      );
    }

    if (typeof preview.proposalsCount === 'number' && preview.proposalsCount > 0) {
      details.push(
        preview.proposalsCount === 1
          ? '1 juego propuesto'
          : `${preview.proposalsCount} juegos propuestos`,
      );
    }

    const cta =
      preview.status === 'locked'
        ? 'Confirmá tu lugar y mirá qué sale a la mesa.'
        : preview.status === 'completed'
          ? 'Mirá cómo salió la juntada.'
          : 'Confirmá tu lugar y votá qué jugamos.';

    const description =
      details.length > 0 ? `${details.join(' · ')}. ${cta}` : cta;

    return {
      title,
      description: truncateText(description, 220),
    };
  }

  if (preview.kind === 'group' && preview.groupName) {
    const title = truncateText(`Sumate a "${preview.groupName}" — ${SITE_NAME}`, 110);
    const membersSuffix =
      typeof preview.membersCount === 'number' && preview.membersCount > 1
        ? ` (${preview.membersCount} miembros)`
        : '';

    const active = preview.activeSession;
    let extra = 'Uní tu ludoteca y voten qué sale a la mesa en la próxima juntada.';
    if (active?.title) {
      const dateStr = active.scheduledAt
        ? formatPreviewDate(active.scheduledAt, timeZone)
        : '';
      extra = dateStr
        ? `Próxima juntada: ${active.title} (${dateStr}).`
        : `Próxima juntada: ${active.title}.`;
    }

    return {
      title,
      description: truncateText(
        `Te invitaron al grupo ${preview.groupName}${membersSuffix}. ${extra}`,
        220,
      ),
    };
  }

  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  };
}

export function renderOgHtml({ title, description, url, imageUrl }) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeUrl = escapeHtml(url);
  const safeImageUrl = escapeHtml(imageUrl);
  const safeSiteName = escapeHtml(SITE_NAME);

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#1E4D3B" />
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDescription}" />
    <link rel="canonical" href="${safeUrl}" />

    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${safeSiteName}" />
    <meta property="og:locale" content="es_AR" />
    <meta property="og:url" content="${safeUrl}" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDescription}" />
    <meta property="og:image" content="${safeImageUrl}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${safeTitle}" />

    <!-- Twitter / X -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDescription}" />
    <meta name="twitter:image" content="${safeImageUrl}" />
  </head>
  <body>
    <main>
      <h1>${safeTitle}</h1>
      <p>${safeDescription}</p>
      <p><a href="${safeUrl}">Abrir en ${safeSiteName}</a></p>
    </main>
  </body>
</html>`;
}

function getQueryParams(req) {
  if (req.query && Object.keys(req.query).length > 0) {
    return {
      kind: firstValue(req.query.kind)?.trim() || '',
      sessionId: firstValue(req.query.sessionId)?.trim() || '',
      invite: firstValue(req.query.invite)?.trim() || '',
      inviteCode: firstValue(req.query.inviteCode)?.trim() || '',
      seriesToken: firstValue(req.query.seriesToken)?.trim() || '',
    };
  }

  const parsed = new URL(req.url || '/', 'http://localhost');
  return {
    kind: parsed.searchParams.get('kind')?.trim() || '',
    sessionId: parsed.searchParams.get('sessionId')?.trim() || '',
    invite: parsed.searchParams.get('invite')?.trim() || '',
    inviteCode: parsed.searchParams.get('inviteCode')?.trim() || '',
    seriesToken: parsed.searchParams.get('seriesToken')?.trim() || '',
  };
}

function resolveOrigin(req) {
  const headers = req.headers || {};
  const rawProto = firstValue(headers['x-forwarded-proto']) || 'https';
  const proto = rawProto.split(',')[0].trim() || 'https';
  const rawHost =
    firstValue(headers['x-forwarded-host']) ||
    firstValue(headers.host) ||
    DEFAULT_HOST;
  const host = rawHost.split(',')[0].trim() || DEFAULT_HOST;
  return `${proto}://${host}`;
}

function resolveCanonicalUrl(origin, { kind, sessionId, invite, inviteCode, seriesToken }) {
  if (kind === 'series' && seriesToken) {
    return `${origin}/s/${encodeURIComponent(seriesToken)}`;
  }
  if (kind === 'session' && sessionId && invite) {
    return `${origin}/sessions/${encodeURIComponent(sessionId)}?invite=${encodeURIComponent(invite)}`;
  }
  if (kind === 'session' && invite) {
    return `${origin}/welcome?sessionInvite=${encodeURIComponent(invite)}`;
  }
  if (kind === 'group' && inviteCode) {
    return `${origin}/join/${encodeURIComponent(inviteCode)}`;
  }
  return `${origin}/`;
}

async function fetchInvitePreview(apiBase, { kind, invite, inviteCode, seriesToken }) {
  if (!apiBase) return null;

  const endpoint = new URL(`${apiBase}/api/auth/invite-preview`);
  if (kind === 'series' && seriesToken) {
    endpoint.searchParams.set('seriesToken', seriesToken);
  } else if (kind === 'session' && invite) {
    endpoint.searchParams.set('sessionToken', invite);
  } else if (kind === 'group' && inviteCode) {
    endpoint.searchParams.set('groupCode', inviteCode);
  } else {
    return null;
  }

  try {
    const response = await fetch(endpoint.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'AQueJugamos-OGPreview/1.0',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data?.preview ?? null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const params = getQueryParams(req);
  const origin = resolveOrigin(req);
  const canonicalUrl = resolveCanonicalUrl(origin, params);
  const imageUrl = `${origin}/og-image.jpg`;
  const timeZone = process.env.OG_TIMEZONE || DEFAULT_TIMEZONE;

  const apiBase = (
    process.env.API_BASE_URL ||
    process.env.VITE_API_BASE_URL ||
    process.env.VITE_API_URL ||
    ''
  ).replace(/\/+$/, '');

  const preview = await fetchInvitePreview(apiBase, params);
  const metadata = buildPreviewMetadata(preview, timeZone);
  const html = renderOgHtml({
    ...metadata,
    url: canonicalUrl,
    imageUrl,
  });

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader(
    'Cache-Control',
    'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
  );

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  res.end(html);
}
