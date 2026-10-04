// The home header, per country.
//
// A Bangladeshi worker in Kuala Lumpur, an Indian in Jakarta and a Nepali in
// Doha all open the same app. The header is the one place it can say "we know
// where you are from" without changing anything else, so it carries that
// country's colours, its flag and its name - and the rest of the app stays
// exactly as it is.
//
// `photo` is deliberately absent and deliberately supported. The design calls
// for a landmark behind the greeting - Jatiyo Sangsad, the Petronas Towers,
// India Gate - and those are photographs somebody has to license. Until one is
// dropped in, each country gets a gradient drawn from its own flag, which reads
// as a design rather than as a missing image. Adding a photo later is one line
// per country and no other change: see HOW TO ADD A PHOTO below.
//
// HOW TO ADD A PHOTO
//   1. put the file in assets/hero/ (bd.jpg, my.jpg, ...)
//   2. give that country a `photo:` whose value is a require of the new file,
//      relative to this one - assets/hero/bd.jpg is ../../assets/hero/bd.jpg
//   The header uses it immediately and keeps the gradient as the scrim over it.
//
// Colours come from each flag rather than from the brand palette, because a
// header that is teal for everybody is the thing this replaces. They are dark
// enough for white text at the weights the header uses - the greeting sits
// directly on them.

const HEROES = {
  BD: { name: 'Bangladesh', gradient: ['#006A4E', '#00402F'], accent: '#F42A41' },
  MY: { name: 'Malaysia', gradient: ['#01346B', '#010E2B'], accent: '#FFCC00' },
  IN: { name: 'India', gradient: ['#1A4C8B', '#0C2644'], accent: '#FF9933' },
  NP: { name: 'Nepal', gradient: ['#1C3A6E', '#0A1A33'], accent: '#DC143C' },
  PK: { name: 'Pakistan', gradient: ['#01411C', '#011F0E'], accent: '#FFFFFF' },
  ID: { name: 'Indonesia', gradient: ['#8B1A20', '#3A0A0D'], accent: '#FFFFFF' },
  KW: { name: 'Kuwait', gradient: ['#0A3B22', '#04170D'], accent: '#CE1126' },
  LK: { name: 'Sri Lanka', gradient: ['#7A2E12', '#2E1007'], accent: '#FFBE29' },
  MM: { name: 'Myanmar', gradient: ['#1C5B33', '#0A2415'], accent: '#FECB00' },
  KH: { name: 'Cambodia', gradient: ['#032A5B', '#01122A'], accent: '#E4002B' },
  PH: { name: 'Philippines', gradient: ['#0038A8', '#001B52'], accent: '#FCD116' },
};

// Somebody whose country is not known, or is not one the app serves, still has
// to get a header. Brand colours rather than a country's: inventing one would
// be worse than being neutral about it.
const FALLBACK = { name: '', gradient: ['#0B8A94', '#064A50'], accent: '#FFFFFF' };

/** The header treatment for a country code, never null. */
export function heroFor(code) {
  const key = String(code || '').trim().toUpperCase();
  return HEROES[key] || FALLBACK;
}

/** Country codes with a header of their own. */
export const HERO_COUNTRIES = Object.keys(HEROES);

/**
 * "Good morning" / "Good afternoon" / "Good evening" for an hour of the day.
 *
 * Takes the hour rather than reading the clock, so a test can ask for 5am
 * without waiting for it.
 */
export function greetingForHour(hour) {
  // `typeof` first, because Number(null) and Number('') are both 0 - so a
  // missing hour would have passed every range check and greeted midnight.
  if (typeof hour !== 'number' || !Number.isInteger(hour) || hour < 0 || hour > 23) return 'Welcome';
  const h = hour;
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
