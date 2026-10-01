// Which Success TopUp packages belong on which screen.
//
// /api/drives returns one flat catalogue per operator with a category on each
// entry. The supplied Bangladesh catalogue (BD_Mobile_Operator_Packages.xlsx,
// 239 regular + 211 drive packs) uses exactly four:
//
//   Data        internet volume only
//   Bundle      data + minutes together
//   Voice       minutes only
//   Call Rate   per-minute tariff offers
//
// Nothing in those 450 packages is streaming, TV, game or music content - a
// keyword sweep for Toffee, Bioscope, Hoichoi, Chorki, YouTube and the rest
// matched zero rows in either sheet. So "Entertainment" has no Success TopUp
// product today. ENTERTAINMENT_CATEGORIES is matched against the live category
// anyway, so the screen fills itself the day they add such SKUs, rather than
// showing minutes packs under an Entertainment heading.
//
// An unrecognised or missing category is KEPT rather than hidden: a provider
// that renames a category, or omits it, must not silently empty the picker.
const DATA_CATEGORIES = ['data', 'bundle', 'internet'];
const VOICE_CATEGORIES = ['voice', 'call rate', 'callrate', 'minute', 'minutes', 'talktime'];
const ENTERTAINMENT_CATEGORIES = ['entertainment', 'tv', 'streaming', 'video', 'music', 'game', 'ott'];

const norm = (value) => String(value || '').trim().toLowerCase();

/** True when the category is one we recognise at all. */
export function isKnownCategory(category) {
  const c = norm(category);
  if (!c) return false;
  return [...DATA_CATEGORIES, ...VOICE_CATEGORIES, ...ENTERTAINMENT_CATEGORIES].some((k) => c.includes(k));
}

/** Data and data+minutes bundles - what the Internet screen sells. */
export function isInternetPackage(pkg) {
  const c = norm(pkg && pkg.category);
  if (!isKnownCategory(c)) return true;
  if (ENTERTAINMENT_CATEGORIES.some((k) => c.includes(k))) return false;
  if (DATA_CATEGORIES.some((k) => c.includes(k))) return true;
  // Voice-only and call-rate packs are not internet, whatever else they carry.
  return !VOICE_CATEGORIES.some((k) => c.includes(k));
}

/** Streaming/TV/game content. Empty against today's catalogue, by design. */
export function isEntertainmentPackage(pkg) {
  const c = norm(pkg && pkg.category);
  if (!c) return false;
  return ENTERTAINMENT_CATEGORIES.some((k) => c.includes(k));
}

export const CATEGORY_GROUPS = { DATA_CATEGORIES, VOICE_CATEGORIES, ENTERTAINMENT_CATEGORIES };
