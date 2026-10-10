// Fixed site images, referenced by PocketBase *record ID* (never by file name),
// so replacing a file in the admin never breaks the site.
import { mediaById } from './pocketbase.js';

const ids = {
  logo: '29nn36f40ai14fd',
  heroPhoto: '11rs7sgkrwmvx29',
  photo: 'hfut6yay1aq8vpf',
  upstage: 'x36bdnm6rxknqk8',
  upstageLogo: 'qcefc1nauopqetb',
  centralPlan: 'fq7y4ko3pgas6wr',
  upstagePlan: '8j6clmwj1ea0pmt',
};

export async function assets() {
  const entries = await Promise.all(Object.entries(ids).map(async ([k, id]) => [k, await mediaById(id)]));
  return Object.fromEntries(entries);
}
