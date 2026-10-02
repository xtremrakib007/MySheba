'use strict';

// Success TopUp's drive-package hours, expressed through the generic selling
// window.
//
// The hours themselves are the ones in providerCatalog's `success-topup`
// preset, so there is a single source for them: changing the preset changes
// what is sold and what this module reports, and they cannot drift apart.
//
// This file stays because the hours are mirrored in src/utils/driveWindow.js
// for display, and test:successtopup fails if the two copies disagree. The app
// mirror only greys packages out and says when they reopen; the server decides,
// at listing and again at order time, and a device clock decides nothing.
//
// Drive packages sell 10:00-22:00 Bangladesh time, which is 12:00-00:00
// Malaysia time and 04:00-16:00 UTC. Held in UTC because Asia/Dhaka is a fixed
// +06:00 and Asia/Kuala_Lumpur a fixed +08:00 - neither has observed DST since
// 2009 - so the comparison needs no timezone database.
const sellingWindow = require('./sellingWindow');
const { PRESETS } = require('./providerCatalog');

const SPEC = PRESETS['success-topup'].window;

const DRIVE_WINDOW_OPEN_UTC_HOUR = SPEC.openUtcHour;   // 10:00 Asia/Dhaka
const DRIVE_WINDOW_CLOSE_UTC_HOUR = SPEC.closeUtcHour; // 22:00 Asia/Dhaka
const DRIVE_WINDOW_LABEL = SPEC.label;

const window = sellingWindow.createWindow(SPEC);

/** Whether drive packages may be listed or sold right now. */
function isDriveWindowOpen(now = new Date()) {
  return window.isOpen(now);
}

/** When the window next opens, as a Date. Returns null while it is open. */
function nextDriveWindowOpening(now = new Date()) {
  return window.nextOpening(now);
}

/** One sentence a customer can act on. */
function driveWindowMessage(now = new Date()) {
  return window.message(now);
}

module.exports = {
  DRIVE_WINDOW_OPEN_UTC_HOUR,
  DRIVE_WINDOW_CLOSE_UTC_HOUR,
  DRIVE_WINDOW_LABEL,
  isDriveWindowOpen,
  nextDriveWindowOpening,
  driveWindowMessage,
};
