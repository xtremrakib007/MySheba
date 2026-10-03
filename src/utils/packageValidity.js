// Grouping a package catalogue by how long the pack lasts.
//
// Sixty-three packages in one flat list is a wall of text: the only thing a
// customer is really choosing between is a 7-day pack and a 30-day one, and
// that distinction was buried in a detail line. Grouping by validity puts the
// decision first.
//
// The duration arrives as the provider wrote it, which for Success TopUp is
// `duration` and may be Bengali ("৩০ দিন"), English ("30 Days"), or neither
// ("Unlimited"). So the number is read out of the string rather than parsed
// from a format nobody promised, Bengali digits included, and anything that
// yields no number keeps its own heading at the end instead of being dropped
// or merged into a wrong one.

const BENGALI_DIGITS = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };

function toLatinDigits(text) {
  return String(text || '').replace(/[০-৯]/g, (d) => BENGALI_DIGITS[d] || d);
}

/**
 * Days a validity string describes, or null when it names no number.
 *
 * Months and years are converted so a 12-month pack sorts after a 30-day one
 * rather than ahead of it on the number alone.
 */
export function validityDays(valid) {
  const text = toLatinDigits(valid).toLowerCase();
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (/year|বছর/.test(text)) return Math.round(n * 365);
  if (/month|মাস/.test(text)) return Math.round(n * 30);
  if (/hour|ঘণ্টা|ঘন্টা/.test(text)) return Math.max(1, Math.round(n / 24));
  return Math.round(n);
}

/**
 * Packages grouped by validity, shortest first.
 *
 * Each group is { key, label, days, packages }. `label` is the provider's own
 * wording for that duration, so a Bengali catalogue reads in Bengali rather
 * than in a heading translated here. Packages whose validity names no duration
 * are collected last under one heading, because leaving them out would hide
 * products that are for sale.
 */
export function groupByValidity(packages, otherLabel = 'Other') {
  const groups = new Map();
  for (const pkg of packages || []) {
    const label = String(pkg?.valid || '').trim();
    const days = validityDays(label);
    const key = days == null ? '__other__' : String(days);
    if (!groups.has(key)) {
      groups.set(key, { key, label: days == null ? otherLabel : (label || `${days} Days`), days, packages: [] });
    }
    groups.get(key).packages.push(pkg);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.days == null) return 1;
    if (b.days == null) return -1;
    return a.days - b.days;
  });
}
