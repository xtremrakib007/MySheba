// Feature grid tiles a superadmin adds, without a release.
//
// WHAT A CUSTOM TILE CAN AND CANNOT BE. It is a SHORTCUT into a service flow
// the app already has, with some of the first steps already answered - which
// is exactly what the JomPAY and Touch 'n Go tiles are, written by hand:
//
//   { service: 'billpayment', seed: { country: 'MY', category: 'jompay',
//     provider: 'JomPAY' }, startStep: 3 }
//
// It cannot point at a screen. That is deliberate and it is the same boundary
// settings/tileLabels already holds: a tile whose destination can be set to
// anything is a way to dress one feature up as another - a tile called
// "Mobile Reload" that opens Wallet Transfer, say. So `service` is checked
// against the flows that exist, and nothing else is a valid destination.
//
// The practical effect is that the worst a bad tile can do is land somebody on
// the wrong step of a real service, which they can back out of. It cannot
// reach a management screen, cannot skip a capability check (startService
// re-checks Grid Access for the service itself), and cannot invent a flow.

// The service flows a tile may open, and how many steps each has.
//
// MUST stay identical to SERVICE_STEPS in src/context/AppContext.js, which is
// the authority - it is what actually drives the step machine. This copy
// exists so validation can run without pulling the whole context in, and
// scripts/test-custom-tiles.js holds the two against each other so they
// cannot drift: a service here that the step machine does not know would be a
// tile that opens an empty screen.
export const SERVICE_STEP_COUNTS = {
  recharge: 4,
  mobilebanking: 3,
  internet: 4,
  offerpacks: 4,
  entertainment: 3,
  billpayment: 5,
  remittance: 7,
  bus: 3,
  train: 3,
  flight: 3,
};

export const CUSTOM_TILE_SERVICES = Object.keys(SERVICE_STEP_COUNTS);

// What a seed may answer. An allowlist, not a free-form object: the seed is
// spread straight into serviceData, so an unknown key is at best ignored and
// at worst sets something a step did not expect to find already set.
export const SEED_FIELDS = ['country', 'currency', 'operator', 'category', 'provider', 'package', 'amount', 'bank'];

// A custom tile's key. Prefixed like a WebView page's, so it cannot collide
// with a built-in tile now or after a release adds one.
const CUSTOM_KEY_RE = /^ct_[a-z0-9]{4,24}$/;
const MAX_NAME = 40;
const MAX_VALUE = 60;
const MAX_TILES = 40;

export function isCustomTileKey(key) {
  return CUSTOM_KEY_RE.test(String(key || ''));
}

export function newCustomTileKey() {
  return `ct_${Math.random().toString(36).slice(2, 10)}`;
}

const str = (v) => String(v == null ? '' : v).trim();

/**
 * What a custom tile is allowed to be, or null.
 *
 * Returns the tile in the same shape serviceTiles.js declares its own in, so
 * the grids, More Features, Grid Access and the artwork pipeline all treat it
 * as an ordinary tile rather than needing to know it was added.
 */
export function cleanCustomTile(key, raw, categoryKeys = []) {
  const id = str(key);
  if (!isCustomTileKey(id)) return null;
  const name = str(raw && raw.name).slice(0, MAX_NAME);
  if (name.length < 2) return null;

  const service = str(raw && raw.service);
  // THE boundary: a destination that is not a service flow is not a tile.
  if (!Object.prototype.hasOwnProperty.call(SERVICE_STEP_COUNTS, service)) return null;

  // A start step past the end of the flow would open a step that does not
  // exist; a negative one is the same as the beginning.
  const steps = SERVICE_STEP_COUNTS[service];
  let startStep = Number(raw && raw.startStep);
  if (!Number.isInteger(startStep) || startStep < 0) startStep = 0;
  if (startStep > steps - 1) startStep = steps - 1;

  const seed = {};
  const rawSeed = raw && raw.seed && typeof raw.seed === 'object' && !Array.isArray(raw.seed) ? raw.seed : {};
  for (const field of SEED_FIELDS) {
    const value = rawSeed[field];
    if (value == null || value === '') continue;
    if (field === 'amount') {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) seed.amount = n;
      continue;
    }
    const text = str(value).slice(0, MAX_VALUE);
    if (text) seed[field] = text;
  }

  // A tile that skips steps without answering them lands on a step whose
  // earlier answers are missing - the step renders, and nothing it needs is
  // there. Better no tile than that.
  if (startStep > 0 && Object.keys(seed).length === 0) return null;

  const cat = str(raw && raw.cat);
  const icon = str(raw && raw.icon).slice(0, MAX_VALUE);
  const art = str(raw && raw.art).slice(0, MAX_VALUE);

  return {
    key: id,
    name,
    kind: 'customShortcut',
    service,
    seed,
    startStep,
    cat: categoryKeys.includes(cat) ? cat : 'recharge',
    home: raw && raw.home === false ? false : true,
    custom: true,
    ...(art ? { art, icon: icon || '\u{1F310}' } : { icon: icon || '\u{1F310}' }),
  };
}

/** Every valid custom tile in the stored document, in a stable order. */
export function cleanCustomTiles(data, categoryKeys = []) {
  const raw = data && typeof data === 'object' && !Array.isArray(data) ? data.tiles : null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const out = [];
  // Sorted by key so two devices render the same order from the same
  // document - Object.keys order is insertion order, and a merge write can
  // change it.
  for (const key of Object.keys(raw).sort()) {
    if (out.length >= MAX_TILES) break;
    const tile = cleanCustomTile(key, raw[key], categoryKeys);
    if (tile) out.push(tile);
  }
  return out;
}

/** A human description of where a tile goes, for the editing screen. */
export function describeCustomTile(tile) {
  if (!tile) return '';
  const answered = SEED_FIELDS.filter((f) => tile.seed && tile.seed[f] != null)
    .map((f) => `${f}: ${tile.seed[f]}`);
  const step = tile.startStep > 0 ? ` from step ${tile.startStep + 1}` : '';
  return `${tile.service}${step}${answered.length ? ` · ${answered.join(', ')}` : ''}`;
}
