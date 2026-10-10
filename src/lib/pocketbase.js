// PocketBase access for the Athinaion site.
//
// Two URLs on purpose:
//  - SERVER_BASE: used by the Node server for data fetches. Read at RUNTIME, so it can be
//    changed in Coolify without a rebuild. Set POCKETBASE_INTERNAL_URL to the internal
//    Docker address of PocketBase if the container cannot reach the public domain.
//  - PUBLIC_BASE: used for image URLs that the visitor's browser loads.
const env = (k) => (typeof process !== 'undefined' && process.env ? process.env[k] : undefined);
const PUBLIC_BASE = (env('PUBLIC_POCKETBASE_URL') || import.meta.env.PUBLIC_POCKETBASE_URL || 'https://admin.videotheatre.gr').replace(/\/$/, '');
const SERVER_BASE = (env('POCKETBASE_INTERNAL_URL') || PUBLIC_BASE).replace(/\/$/, '');
const VENUE_ID = env('ATHINAION_VENUE_ID') || '';
const VENUE_SLUG = env('ATHINAION_VENUE_SLUG') || 'athinaion-theatre';
const TIMEOUT_MS = 10000;

// Last fetch problems, exposed by /health.json so failures are visible instead of silent.
export const lastErrors = [];
const recordError = (msg) => {
  console.error('[pocketbase] ' + msg);
  lastErrors.unshift({ at: new Date().toISOString(), msg });
  lastErrors.length = Math.min(lastErrors.length, 20);
};

// Fetch every page of a collection (no silent truncation at perPage).
export async function list(collection, params = {}) {
  const items = [];
  let page = 1;
  for (;;) {
    const qs = new URLSearchParams({ perPage: '200', ...params, page: String(page) });
    const url = SERVER_BASE + '/api/collections/' + collection + '/records?' + qs;
    let res;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      recordError(`${collection}: network error to ${SERVER_BASE} — ${e?.cause?.code || e?.name || ''} ${e?.message || e}`);
      return items;
    }
    if (!res.ok) {
      let body = '';
      try { body = (await res.text()).slice(0, 200); } catch {}
      recordError(`${collection}: HTTP ${res.status} — ${body}`);
      return items;
    }
    const data = await res.json();
    items.push(...(data.items || []));
    if (!data.totalPages || page >= data.totalPages) return items;
    page++;
  }
}

// Resolve a media record ID to its current public file URL (cached for 5 minutes).
const mediaCache = new Map();
export async function mediaById(id) {
  const hit = mediaCache.get(id);
  if (hit && hit.expires > Date.now()) return hit.url;
  try {
    const res = await fetch(SERVER_BASE + '/api/collections/media/records/' + id, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) { recordError(`media ${id}: HTTP ${res.status}`); return hit?.url || null; }
    const r = await res.json();
    const url = mediaUrl(r);
    mediaCache.set(id, { url, expires: Date.now() + 5 * 60 * 1000 });
    return url;
  } catch (e) {
    recordError(`media ${id}: ${e?.message || e}`);
    return hit?.url || null;
  }
}

export const mediaUrl = (r) => (r?.id && r?.file ? PUBLIC_BASE + '/api/files/media/' + r.id + '/' + r.file : null);

const findVenue = (venues) =>
  (VENUE_ID && venues.find((v) => v.id === VENUE_ID)) ||
  venues.find((v) => v.slug === VENUE_SLUG) ||
  venues.find((v) => /athinaion|αθήναιον|αθηναιον/i.test((v.slug || '') + ' ' + v.name));

const stageType = (run, spaces) => {
  const s = spaces.find((x) => x.id === run.space);
  const label = ((s?.slug || '') + ' ' + (s?.name || '') + ' ' + (run.space_name || '')).toLowerCase();
  if (/upstage|up.stage|πάνω|επάνω/.test(label)) return 'upstage';
  if (/central|main|κεντρ|κάτω/.test(label)) return 'central';
  return null;
};

const day = (d) => (d ? String(d).slice(0, 10) : '');

// Venue presentations of a production, one per (stage, dates). A copy without a stage is
// dropped when the same dates also exist with a stage (protects against duplicate runs).
function presentationsOf(runs, spaces) {
  const items = runs.map((r) => {
    const s = spaces.find((x) => x.id === r.space);
    return {
      space: s?.name || r.space_name || '',
      start: day(r.start_date),
      end: day(r.end_date),
      ticketingUrl: /^https?:\/\//i.test(r.ticketing_url || '') ? r.ticketing_url.trim() : '',
    };
  });
  const seen = new Map();
  for (const it of items) {
    const key = it.space + '|' + it.start + '|' + it.end;
    if (!seen.has(key)) seen.set(key, it);
    else if (!seen.get(key).ticketingUrl && it.ticketingUrl) seen.set(key, it);
  }
  const unique = [...seen.values()];
  return unique
    .filter((it) => it.space || !unique.some((o) => o.space && o.start === it.start && o.end === it.end))
    .sort((a, b) => a.start.localeCompare(b.start));
}

// "2026-10-25" -> "25/10/2026"
export const formatDate = (d) => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '');

// YouTube watch/short/embed URL -> embed URL, or null.
export const youtubeEmbed = (url) => {
  const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? 'https://www.youtube-nocookie.com/embed/' + m[1] : null;
};

// Ticket link: production-level URL first (when that field exists), then the first run's URL.
// Never for completed productions.
export const ticketUrl = (p) => {
  if (p.displayStatus === 'past') return '';
  const own = /^https?:\/\//i.test(p.ticketing_url || '') ? p.ticketing_url.trim() : '';
  return own || p.presentations.find((x) => x.ticketingUrl)?.ticketingUrl || '';
};

export async function shows(lang = 'el') {
  const [venues, productions, runs, spaces] = await Promise.all([
    list('venues', { filter: 'editorial_status="published"' }),
    list('productions', { filter: 'editorial_status="published"', expand: 'poster,hero_image' }),
    list('runs'),
    list('spaces'),
  ]);
  const venue = findVenue(venues);
  if (!venue) {
    recordError(`venue not found (venues returned: ${venues.length}, id="${VENUE_ID}", slug="${VENUE_SLUG}")`);
    return [];
  }
  const venueRuns = runs.filter((r) => r.venue === venue.id);
  const ids = new Set(venueRuns.map((r) => r.production));

  const result = await Promise.all(
    productions
      .filter((p) => ids.has(p.id))
      .map(async (p) => {
        const tr =
          lang === 'el' && p.title
            ? []
            : await list('production_translations', {
                filter: `production="${p.id}" && language="${lang}" && translation_status="published"`,
                perPage: '1',
              });
        const associated = venueRuns.filter((r) => r.production === p.id);
        const stageTypes = [...new Set(associated.map((r) => stageType(r, spaces)).filter(Boolean))];
        const t = tr[0] || {};
        return {
          ...p,
          title: (lang === 'el' && p.title) || t.title || p.title || '',
          short_description: (lang !== 'el' && t.short_description) || p.short_description || '',
          description: (lang !== 'el' && t.description) || p.description || '',
          poster: mediaUrl(p.expand?.poster),
          stageTypes,
          displayStatus: p.display_status || 'now',
          presentations: presentationsOf(associated, spaces),
        };
      })
  );
  return result.filter((p) => p.title);
}

// Small diagnostic used by /health.json — counts only, no record contents, no secrets.
export async function health() {
  lastErrors.length = 0;
  const [venues, productions, runs] = await Promise.all([
    list('venues', { filter: 'editorial_status="published"' }),
    list('productions', { filter: 'editorial_status="published"' }),
    list('runs'),
  ]);
  const venue = findVenue(venues);
  return {
    serverBase: SERVER_BASE,
    counts: { venues: venues.length, productions: productions.length, runs: runs.length },
    venue: venue ? { id: venue.id, slug: venue.slug } : null,
    runsAtVenue: venue ? runs.filter((r) => r.venue === venue.id).length : 0,
    errors: [...lastErrors],
  };
}
