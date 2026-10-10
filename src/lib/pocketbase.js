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
        return {
          ...p,
          title: (lang === 'el' && p.title) || tr[0]?.title || '',
          poster: mediaUrl(p.expand?.poster),
          stageTypes,
          displayStatus: p.display_status || 'now',
        };
      })
  );
  return result.filter((p) => p.title).slice(0, 6);
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
