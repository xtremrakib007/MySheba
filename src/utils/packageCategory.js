// Which Success TopUp packages belong on the Entertainment screen.
//
// /api/drives returns one flat catalogue per operator with a category on each
// entry. The supplied Bangladesh catalogue (BD_Mobile_Operator_Packages.xlsx,
// 239 regular + 211 drive packs) uses exactly four: Data, Bundle, Voice and
// Call Rate.
//
// None of those is an internet-only category: the whole `regular` catalogue is
// what the Internet screen sells, Voice and Call Rate included, so that screen
// filters nothing and the classifier it used to call is gone. Offer Packs sells
// the `drive` catalogue whole for the same reason.
//
// Nothing in those 450 packages is streaming, TV, game or music content - a
// keyword sweep for Toffee, Bioscope, Hoichoi, Chorki, YouTube and the rest
// matched zero rows in either sheet. So "Entertainment" has no Success TopUp
// product today. ENTERTAINMENT_CATEGORIES is matched against the live category
// anyway, so the screen fills itself the day they add such SKUs.
const ENTERTAINMENT_CATEGORIES = ['entertainment', 'tv', 'streaming', 'video', 'music', 'game', 'ott'];

const norm = (value) => String(value || '').trim().toLowerCase();

/** Streaming/TV/game content. Empty against today's catalogue, by design. */
export function isEntertainmentPackage(pkg) {
  const c = norm(pkg && pkg.category);
  if (!c) return false;
  return ENTERTAINMENT_CATEGORIES.some((k) => c.includes(k));
}

export const CATEGORY_GROUPS = { ENTERTAINMENT_CATEGORIES };
