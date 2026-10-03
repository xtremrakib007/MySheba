// What kind of pack this is, and which packs are Entertainment.
//
// The supplied Bangladesh catalogue (BD_Mobile_Operator_Packages.xlsx, 239
// regular + 211 drive packs) uses exactly four categories: Data, Bundle, Voice
// and Call Rate. Nothing in those 450 packages is streaming, TV, game or music
// content - a keyword sweep for Toffee, Bioscope, Hoichoi, Chorki, YouTube and
// the rest matched zero rows in either sheet. So "Entertainment" has no Success
// TopUp product today; ENTERTAINMENT_CATEGORIES is matched against the live
// category anyway, so that screen fills itself the day they add such SKUs.
//
// Neither is any of the four internet-only: the whole `regular` catalogue is
// what the Internet screen sells, Voice and Call Rate included, so that screen
// filters nothing. Offer Packs sells the `drive` catalogue whole for the same
// reason. Filtering is not what the grouping below is for - it is for showing
// the customer which of the four a row is, without them reading every row.
const ENTERTAINMENT_CATEGORIES = ['entertainment', 'tv', 'streaming', 'video', 'music', 'game', 'ott'];

const norm = (value) => String(value || '').trim().toLowerCase();

/** Streaming/TV/game content. Empty against today's catalogue, by design. */
export function isEntertainmentPackage(pkg) {
  const c = norm(pkg && pkg.category);
  if (!c) return false;
  return ENTERTAINMENT_CATEGORIES.some((k) => c.includes(k));
}

export const CATEGORY_GROUPS = { ENTERTAINMENT_CATEGORIES };

// --- grouping the catalogue for the customer ---------------------------------
//
// Sixty-three packs grouped only by validity still mixes a Voice pack into a
// 30-day Data section, where someone looking for internet has to read every row
// to find out which rows are internet. Kind answers the first question a
// customer has; validity answers the second.
//
// The provider's own word wins, mapped to one heading per kind: "Data" is shown
// as Internet because that is what the customer came to the Internet screen for,
// and "Call Rate" joins Voice rather than making a section of one. Everything
// else here is about a word we have not seen, which is most of what a
// third-party catalogue sends over time:
//
//   - One we do not know keeps the provider's own label and its own heading.
//     Burying an unknown kind under "Other" hides a product that is for sale.
//   - A pack with no category at all is guessed from its title, and if that
//     yields nothing it goes to "Other" last.
//
// A guess can be wrong, which is why the picker always offers "All": a pack
// filed under the wrong heading is still reachable, just not where expected.
//
// No React here, so a test can ask where each pack lands.

const BENGALI_DIGITS_STRIPPED = /[০-৯]/g;

/**
 * Canonical kinds, in the order they are shown.
 *
 * `match` is tried against the provider's category first and the pack's title
 * second. Bengali spellings are listed because the catalogue arrives in Bengali
 * as often as not, and a Bengali title under an English heading is still the
 * right heading.
 */
const KINDS = [
  { key: 'voice', label: 'Voice', match: /voice|minute|talk ?time|call|মিনিট|কল|টক/ },
  { key: 'bundle', label: 'Bundle', match: /bundle|combo|mixed?|বান্ডেল|কম্বো|মিক্স/ },
  { key: 'internet', label: 'Internet', match: /internet|data|ইন্টারনেট|ডাটা|ডেটা|জিবি|এমবি/ },
  { key: 'sms', label: 'SMS', match: /\bsms\b|এসএমএস/ },
];

const OTHER = { key: '__other__', label: 'Other' };

function normalise(text) {
  return String(text || '').replace(BENGALI_DIGITS_STRIPPED, '').trim().toLowerCase();
}

/**
 * The kind a pack belongs to: { key, label, provided }.
 *
 * `provided` says whether this came from the provider's own category or was
 * guessed from the title. The caller does not currently use it; a guess being
 * distinguishable from a fact is the kind of thing that matters the first time
 * someone asks why a pack is in the wrong place.
 */
export function categoryOf(pkg) {
  const stated = normalise(pkg?.category);
  if (stated) {
    const known = KINDS.find((k) => k.match.test(stated));
    if (known) return { key: known.key, label: known.label, provided: true };
    // An unseen category keeps the provider's own wording, trimmed of nothing
    // but whitespace - it is their catalogue, and they wrote it for customers.
    return { key: `provided:${stated}`, label: String(pkg.category).trim(), provided: true };
  }
  const guessFrom = normalise(`${pkg?.name || ''} ${pkg?.data || ''}`);
  const guessed = KINDS.find((k) => k.match.test(guessFrom));
  if (guessed) return { key: guessed.key, label: guessed.label, provided: false };
  return { ...OTHER, provided: false };
}

const KIND_ORDER = KINDS.map((k) => k.key);

function rank(key) {
  const known = KIND_ORDER.indexOf(key);
  if (known !== -1) return [0, known, ''];
  if (key === OTHER.key) return [2, 0, ''];
  return [1, 0, key];
}

/**
 * Packages grouped by kind: [{ key, label, packages }].
 *
 * Known kinds first in the order above, then any the provider named that we do
 * not know, alphabetically, then the ones with no kind at all. A group is only
 * returned if something is in it, so an operator that sells no voice packs shows
 * no empty Voice heading.
 */
export function groupByCategory(packages) {
  const groups = new Map();
  for (const pkg of packages || []) {
    const kind = categoryOf(pkg);
    if (!groups.has(kind.key)) groups.set(kind.key, { key: kind.key, label: kind.label, packages: [] });
    groups.get(kind.key).packages.push(pkg);
  }
  return [...groups.values()].sort((a, b) => {
    const [ga, ka, la] = rank(a.key);
    const [gb, kb, lb] = rank(b.key);
    return ga - gb || ka - kb || la.localeCompare(lb);
  });
}
