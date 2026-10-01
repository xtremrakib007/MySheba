'use strict';

// Drive packages are only sold 10:00-22:00 Bangladesh time, which is
// 12:00-00:00 Malaysia time and 04:00-16:00 UTC.
//
// Held in UTC on purpose. Asia/Dhaka is a fixed +06:00 and Asia/Kuala_Lumpur a
// fixed +08:00 - neither has observed DST since 2009 - so a UTC comparison needs
// no timezone database and cannot be thrown off by the server's locale or by a
// Node build without full ICU. Verified against the IANA data: 04:00 UTC is
// 10:00 Dhaka / 12:00 KL and 16:00 UTC is 22:00 Dhaka / 00:00 KL.
//
// The window is enforced on the SERVER, at listing and again at order time. The
// app mirrors it in src/utils/driveWindow.js only to grey the packages out and
// say when they reopen; a device clock decides nothing, and test:successtopup
// fails if the two copies drift.
const DRIVE_WINDOW_OPEN_UTC_HOUR = 4;   // 10:00 Asia/Dhaka
const DRIVE_WINDOW_CLOSE_UTC_HOUR = 16; // 22:00 Asia/Dhaka

const DRIVE_WINDOW_LABEL = '10:00 AM - 10:00 PM Bangladesh time (12:00 PM - 12:00 AM Malaysia time)';

/** Whether drive packages may be listed or sold right now. */
function isDriveWindowOpen(now = new Date()) {
  const hour = now.getUTCHours();
  return hour >= DRIVE_WINDOW_OPEN_UTC_HOUR && hour < DRIVE_WINDOW_CLOSE_UTC_HOUR;
}

/** When the window next opens, as a Date. Returns null while it is open. */
function nextDriveWindowOpening(now = new Date()) {
  if (isDriveWindowOpen(now)) return null;
  const next = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    DRIVE_WINDOW_OPEN_UTC_HOUR, 0, 0, 0,
  ));
  // Past today's opening means the next one is tomorrow.
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/** One sentence a customer can act on. */
function driveWindowMessage(now = new Date()) {
  if (isDriveWindowOpen(now)) return '';
  return `Drive packages are available ${DRIVE_WINDOW_LABEL}. Please try again during those hours.`;
}

module.exports = {
  DRIVE_WINDOW_OPEN_UTC_HOUR,
  DRIVE_WINDOW_CLOSE_UTC_HOUR,
  DRIVE_WINDOW_LABEL,
  isDriveWindowOpen,
  nextDriveWindowOpening,
  driveWindowMessage,
};
