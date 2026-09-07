// Schedules local device notifications for Salary & OT reminders (PRD
// section 21: salary record reminder, OT record reminder, payslip
// reminder).
//
// Uses expo-notifications directly, same as documentReminderService.js
// (which this file otherwise mirrors) - local, on-device scheduled
// notifications, not FCM pushes. Assumes notification permission was
// already requested elsewhere in the app's normal push-registration flow.
//
// Unlike document expiry reminders (which fire once, N days before a
// known expiry date), the daily OT nudge has no natural end date, so it
// schedules with a typed DAILY trigger (Notifications.SchedulableTriggerInputTypes.DAILY)
// instead of documentReminderService's one-shot Date triggers. The
// monthly salary/payslip reminders below are still one-shot Date
// triggers, re-scheduled each month by their caller.
import * as Notifications from 'expo-notifications';
import { DEFAULT_REMINDER_TIME } from '../data/salaryConstants';

const REMINDER_IDS = {
  DAILY_OT: 'salary-reminder-daily-ot',
  SALARY_RECORD: 'salary-reminder-record-salary',
  PAYSLIP: 'salary-reminder-payslip',
};

/** "Don't forget to record today's OT." - daily at DEFAULT_REMINDER_TIME. */
export async function scheduleDailyOTReminder() {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_IDS.DAILY_OT).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_IDS.DAILY_OT,
    content: {
      title: '⏱️ Work Log Reminder',
      body: "Don't forget to record today's work hours and OT.",
      data: { screen: 'salaryWorkLog' },
    },
    // Requires an explicit `type` (added in a later expo-notifications
    // API revision than documentReminderService.js's `{ date: ... }`
    // trigger was written against). Without it, the native Android side
    // can't tell which trigger shape this is and throws a raw
    // org.json.JSONObject error instead of scheduling - this was the
    // "Failed to schedule the notification" popup on Salary Settings.
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: DEFAULT_REMINDER_TIME.hour,
      minute: DEFAULT_REMINDER_TIME.minute,
    },
  });
}

/** "Have you received your salary for August?" - fires once, a few days
 * into a new month, to nudge recording the previous month's actual
 * salary. Re-scheduled each time SalaryDashboardScreen detects a new
 * month has started (see the screen for the call site), rather than a
 * fixed monthly repeat, since the label needs the actual previous month's
 * name. */
export async function scheduleSalaryRecordReminder(previousMonthLabel, fireAt) {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_IDS.SALARY_RECORD).catch(() => {});
  if (!fireAt || fireAt <= Date.now()) return;
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_IDS.SALARY_RECORD,
    content: {
      title: '💰 Salary Record Reminder',
      body: `Have you received your salary for ${previousMonthLabel}?`,
      data: { screen: 'salaryMonthlySummary' },
    },
    trigger: { date: new Date(fireAt) },
  });
}

/** "Upload your August payslip to keep your salary records updated." -
 * same one-shot-per-month pattern as scheduleSalaryRecordReminder. */
export async function schedulePayslipReminder(monthLabel, fireAt) {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_IDS.PAYSLIP).catch(() => {});
  if (!fireAt || fireAt <= Date.now()) return;
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_IDS.PAYSLIP,
    content: {
      title: '🧾 Payslip Reminder',
      body: `Upload your ${monthLabel} payslip to keep your salary records updated.`,
      data: { screen: 'salaryMonthlySummary' },
    },
    trigger: { date: new Date(fireAt) },
  });
}

/** Cancels all three - called when the user disables reminders in
 * SalarySettingsScreen (settings.remindersEnabled = false). */
export async function cancelAllSalaryReminders() {
  await Promise.all(Object.values(REMINDER_IDS).map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
}
