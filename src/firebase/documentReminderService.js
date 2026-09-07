// Schedules local device notifications for document expiry reminders.
//
// Uses expo-notifications directly (already a project dependency - see
// src/notifications/pushService.js for the push side, which is separate:
// these are local, on-device scheduled notifications, not FCM pushes).
// Assumes notification permission was already requested elsewhere in the
// app's normal push-registration flow.
import * as Notifications from 'expo-notifications';
import { DEFAULT_REMINDER_OFFSETS, DOCUMENT_TYPE_LABELS } from '../data/documentConstants';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Cancels any existing reminders for a document, then schedules new ones
 * based on its current expiryDate + reminderSettings. Call whenever a
 * document is created, its expiry date changes, or reminders are toggled.
 */
export async function rescheduleReminders(document) {
  await cancelReminders(document.id);

  if (!document.expiryDate || !document.reminderSettings?.enabled) return;

  const offsets = document.reminderSettings.offsets?.length
    ? document.reminderSettings.offsets
    : DEFAULT_REMINDER_OFFSETS;

  const label = DOCUMENT_TYPE_LABELS[document.documentType] ?? document.documentName;

  for (const daysBefore of offsets) {
    const triggerAt = document.expiryDate - daysBefore * DAY_MS;
    if (triggerAt <= Date.now()) continue; // don't schedule reminders in the past

    await Notifications.scheduleNotificationAsync({
      identifier: reminderId(document.id, daysBefore),
      content: {
        title: daysBefore <= 7 ? `⚠️ ${label} Expiring Soon` : `🔔 ${label} Expiry Reminder`,
        body:
          daysBefore <= 1
            ? `Your ${label.toLowerCase()} expires ${daysBefore === 0 ? 'today' : 'tomorrow'}. Please check renewal requirements.`
            : `Your ${label.toLowerCase()} will expire in ${daysBefore} days.`,
        data: { documentId: document.id, screen: 'documentDetails' },
      },
      trigger: { date: new Date(triggerAt) },
    });
  }
}

export async function cancelReminders(documentId) {
  // Scans scheduled notifications rather than only cancelling
  // DEFAULT_REMINDER_OFFSETS ids, so this also cleans up correctly if a
  // document was ever scheduled with custom offsets.
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const idsToCancel = scheduled
    .filter((n) => n.content?.data?.documentId === documentId)
    .map((n) => n.identifier);

  await Promise.all(idsToCancel.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
}

function reminderId(documentId, daysBefore) {
  return `doc-reminder-${documentId}-${daysBefore}`;
}
