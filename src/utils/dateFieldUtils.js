// Date/time maths for DateField and TimeField.
//
// Those two components referenced a bare `DateTimePicker` that was never
// imported, and @react-native-community/datetimepicker is not a dependency
// at all - so every date field in the app threw "Property 'DateTimePicker'
// doesn't exist" the moment it was tapped. That is roughly twenty places:
// KYC, payslips, documents, notes, banner ads, salary reports, ad
// analytics, the travel inquiry.
//
// Adding the native package would not have fixed it for anyone already on
// 5.4.1.12, because a native module cannot ship over the air - it needs a
// new build in the store. The replacement pickers are therefore plain
// React Native views, and this is the arithmetic behind them, kept pure so
// it can be tested without rendering anything.

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Days in a 1-indexed month, leap years included. */
export function daysInMonth(year, month) {
  if (!Number.isFinite(year) || !Number.isFinite(month)) return 31;
  return new Date(year, month, 0).getDate();
}

/** 'YYYY-MM-DD' -> {year, month, day}, or null if it is not one. */
export function parseISODate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function toISODate({ year, month, day }) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toParts(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

/** Sort key, so bounds can be compared without building Date objects. */
function ordinal(p) {
  return p.year * 10000 + p.month * 100 + p.day;
}

export function isBefore(a, b) { return ordinal(a) < ordinal(b); }
export function isAfter(a, b) { return ordinal(a) > ordinal(b); }

/**
 * Keeps a selection valid: the day is clamped to the month's real length
 * first (31 January -> February is the 28th, or 29th in a leap year), then
 * the whole date is pulled inside minimumDate/maximumDate if it fell out.
 */
export function clampDate(parts, minimumDate, maximumDate) {
  const min = toParts(minimumDate);
  const max = toParts(maximumDate);
  let next = {
    year: parts.year,
    month: Math.min(12, Math.max(1, parts.month)),
    day: parts.day,
  };
  next.day = Math.min(Math.max(1, next.day), daysInMonth(next.year, next.month));
  if (min && isBefore(next, min)) next = { ...min };
  if (max && isAfter(next, max)) next = { ...max };
  return next;
}

/** Years offered by the picker, newest first, honouring any bounds. */
export function yearRange(minimumDate, maximumDate, today = new Date()) {
  const min = toParts(minimumDate);
  const max = toParts(maximumDate);
  const first = min ? min.year : today.getFullYear() - 100;
  const last = max ? max.year : today.getFullYear() + 25;
  const years = [];
  for (let y = last; y >= first; y -= 1) years.push(y);
  return years;
}

/** Whether a whole month can hold any selectable day. */
export function isMonthSelectable(year, month, minimumDate, maximumDate) {
  const min = toParts(minimumDate);
  const max = toParts(maximumDate);
  const lastDay = { year, month, day: daysInMonth(year, month) };
  const firstDay = { year, month, day: 1 };
  if (min && isBefore(lastDay, min)) return false;
  if (max && isAfter(firstDay, max)) return false;
  return true;
}

export function isDaySelectable(year, month, day, minimumDate, maximumDate) {
  const min = toParts(minimumDate);
  const max = toParts(maximumDate);
  const p = { year, month, day };
  if (min && isBefore(p, min)) return false;
  if (max && isAfter(p, max)) return false;
  return true;
}

// ---- time ----

/** '02:45 PM' -> {hour12, minute, suffix}, or null. */
export function parseDisplayTime(value) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(value || '').trim());
  if (!m) return null;
  const hour12 = Number(m[1]);
  const minute = Number(m[2]);
  if (hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59) return null;
  return { hour12, minute, suffix: m[3].toUpperCase() };
}

export function formatDisplayTime({ hour12, minute, suffix }) {
  return `${String(hour12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${suffix}`;
}
