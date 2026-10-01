// Drive packages are sold 10:00-22:00 Bangladesh time, which is 12:00-00:00
// Malaysia time and 04:00-16:00 UTC.
//
// This is a MIRROR of functions/successTopUpWindow.js, for greying the packages
// out and telling the customer when they reopen. It decides nothing: the server
// refuses a drive listing and a drive order outside the window, so a wrong or
// tampered device clock changes what the screen says and not what can be bought.
// test:successtopup fails if the two copies drift.
//
// Compared in UTC because Asia/Dhaka is a fixed +06:00 and Asia/Kuala_Lumpur a
// fixed +08:00 - neither observes DST - so this needs no timezone database,
// which a React Native build may not carry in full.
export const DRIVE_WINDOW_OPEN_UTC_HOUR = 4;   // 10:00 Asia/Dhaka
export const DRIVE_WINDOW_CLOSE_UTC_HOUR = 16; // 22:00 Asia/Dhaka

export const DRIVE_WINDOW_LABEL = '10:00 AM - 10:00 PM Bangladesh time (12:00 PM - 12:00 AM Malaysia time)';

/** Whether drive packages are on sale right now, by the device clock. */
export function isDriveWindowOpen(now = new Date()) {
  const hour = now.getUTCHours();
  return hour >= DRIVE_WINDOW_OPEN_UTC_HOUR && hour < DRIVE_WINDOW_CLOSE_UTC_HOUR;
}

/** One line to show when the window is shut. */
export function driveWindowClosedMessage() {
  return `Drive packages are available ${DRIVE_WINDOW_LABEL}.`;
}
