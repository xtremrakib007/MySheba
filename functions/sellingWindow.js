'use strict';

// A time-of-day window during which a provider's packages may be listed or sold.
//
// Success TopUp's drive packages sell 10:00-22:00 Bangladesh time, and that was
// written as four constants and three functions that knew about drives
// specifically. Bus, train and flight providers have their own booking hours,
// so the shape is the same and only the numbers differ - this builds one from
// its numbers.
//
// Held in UTC on purpose. Asia/Dhaka is a fixed +06:00 and Asia/Kuala_Lumpur a
// fixed +08:00 - neither has observed DST since 2009 - so a UTC comparison needs
// no timezone database and cannot be thrown off by the server's locale or by a
// Node build without full ICU.
//
// Windows are enforced on the SERVER, at listing and again at order time. The
// app mirrors one only to grey packages out and say when they reopen; a device
// clock decides nothing.

/** A window that is always open. Used when a provider declares no hours. */
const ALWAYS_OPEN = Object.freeze({
  alwaysOpen: true,
  isOpen: () => true,
  nextOpening: () => null,
  message: () => '',
  label: '',
  noun: 'Packages',
});

function hour(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return i >= 0 && i <= 24 ? i : fallback;
}

/**
 * Build a selling window.
 *
 * @param {object} spec
 * @param {number} spec.openUtcHour  hour (UTC) the window opens, inclusive.
 * @param {number} spec.closeUtcHour hour (UTC) the window closes, exclusive.
 * @param {string} spec.label        human hours, e.g. "10:00 AM - 10:00 PM Bangladesh time".
 * @param {string} spec.noun         what is restricted, e.g. "Drive packages".
 */
function createWindow(spec) {
  if (!spec) return ALWAYS_OPEN;
  const openUtcHour = hour(spec.openUtcHour, null);
  const closeUtcHour = hour(spec.closeUtcHour, null);
  if (openUtcHour === null || closeUtcHour === null) return ALWAYS_OPEN;
  // Equal bounds would otherwise mean a zero-length window that never opens,
  // which is never what someone configuring 0-0 or 9-9 means.
  if (openUtcHour === closeUtcHour) return ALWAYS_OPEN;

  const label = String(spec.label || '').slice(0, 300);
  const noun = String(spec.noun || 'Packages').slice(0, 60);
  // A window like 22:00-06:00 runs through midnight, so the comparison flips.
  const wraps = openUtcHour > closeUtcHour;

  function isOpen(now = new Date()) {
    const h = now.getUTCHours();
    return wraps ? h >= openUtcHour || h < closeUtcHour : h >= openUtcHour && h < closeUtcHour;
  }

  function nextOpening(now = new Date()) {
    if (isOpen(now)) return null;
    const next = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
      openUtcHour, 0, 0, 0,
    ));
    if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }

  function message(now = new Date()) {
    if (isOpen(now)) return '';
    return label
      ? `${noun} are available ${label}. Please try again during those hours.`
      : `${noun} are not available right now. Please try again later.`;
  }

  return { alwaysOpen: false, openUtcHour, closeUtcHour, label, noun, isOpen, nextOpening, message };
}

module.exports = { createWindow, ALWAYS_OPEN };
