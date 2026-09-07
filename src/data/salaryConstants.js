// Salary & OT module - shared constants.
//
// Plain JS, matching project conventions. Lives in src/data alongside the
// app's other static reference data (documentConstants.js, countries.js,
// etc). Every value here is a *default*, not a hardcoded truth about
// Malaysian employment law - see salaryCalculationService.js's top-of-file
// note and PRD section 33 ("do not hardcode Malaysian employment/payroll
// rates permanently").

export const PAY_FREQUENCIES = {
  MONTHLY: 'monthly',
  WEEKLY: 'weekly',
  DAILY: 'daily',
  HOURLY: 'hourly',
};

export const PAY_FREQUENCY_LABELS = {
  [PAY_FREQUENCIES.MONTHLY]: 'Monthly',
  [PAY_FREQUENCIES.WEEKLY]: 'Weekly',
  [PAY_FREQUENCIES.DAILY]: 'Daily',
  [PAY_FREQUENCIES.HOURLY]: 'Hourly',
};

// OT_TYPES keys match WorkLog.otType and OT_RATE_MULTIPLIERS below.
export const OT_TYPES = {
  NORMAL: 'normal',
  REST_DAY: 'restDay',
  PUBLIC_HOLIDAY: 'publicHoliday',
};

export const OT_TYPE_LABELS = {
  [OT_TYPES.NORMAL]: 'Normal Working Day',
  [OT_TYPES.REST_DAY]: 'Rest Day',
  [OT_TYPES.PUBLIC_HOLIDAY]: 'Public Holiday',
};

// Work day status for a WorkLog entry - drives the calendar view's
// color-coding (PRD section 13: worked / OT / rest day / leave).
export const WORK_DAY_STATUS = {
  WORKED: 'worked',
  REST_DAY: 'restDay',
  LEAVE: 'leave',
  NOT_RECORDED: 'notRecorded',
};

export const WORK_DAY_STATUS_COLORS = {
  [WORK_DAY_STATUS.WORKED]: '#4CAF50', // green - matches colors.success
  [WORK_DAY_STATUS.REST_DAY]: '#1A73E8', // blue - matches colors.secondary
  [WORK_DAY_STATUS.LEAVE]: '#EA4335', // red - matches colors.error
  [WORK_DAY_STATUS.NOT_RECORDED]: '#E0E0E0', // matches colors.border
};

// otCalculationMethod on SalarySettings - PRD section 7: "Do NOT hardcode a
// single OT rate for every user." CUSTOM asks the user for their own
// contract/employer rate (simple hours x rate). DEFAULT applies
// MYSHEBA_DEFAULT_OT_MULTIPLIERS below, which is deliberately a plain
// "1.5x / 2x / 3x basic hourly rate" approximation of common Malaysian
// practice, NOT a verified statutory calculation - see
// salaryCalculationService.js and PRD section 33 before ever presenting
// this as legally authoritative.
export const OT_CALCULATION_METHODS = {
  DEFAULT: 'mysheba_default',
  CUSTOM: 'custom_employer_rate',
};

export const OT_CALCULATION_METHOD_LABELS = {
  [OT_CALCULATION_METHODS.DEFAULT]: 'MySheba Default',
  [OT_CALCULATION_METHODS.CUSTOM]: 'Custom Employer Rate',
};

// Version tag stored on every SalaryRecord alongside otCalculationMethod
// (PRD section 7: "Store the calculation source/version") so a rate-table
// change later doesn't silently reinterpret old records.
export const OT_CALCULATION_VERSION = 'v1';

// Unverified approximation, not a statutory table - see note on
// OT_CALCULATION_METHODS above. Multiplies the derived basic hourly rate.
export const MYSHEBA_DEFAULT_OT_MULTIPLIERS = {
  [OT_TYPES.NORMAL]: 1.5,
  [OT_TYPES.REST_DAY]: 2.0,
  [OT_TYPES.PUBLIC_HOLIDAY]: 3.0,
};

// Recurring vs one-time, for both AllowanceRecord and DeductionRecord.
export const RECURRENCE_TYPES = {
  RECURRING: 'recurring',
  ONE_TIME: 'oneTime',
};

// Suggested names only (PRD sections 9 & 10) - both allowances and
// deductions are freeform + Add Allowance / + Add Deduction, never a
// fixed enum, since "not every foreign worker has the same deductions."
export const SUGGESTED_ALLOWANCES = ['Housing Allowance', 'Transport Allowance', 'Food Allowance'];
export const SUGGESTED_DEDUCTIONS = ['EPF', 'SOCSO', 'EIS', 'PCB / Tax', 'Accommodation', 'Advance'];

export const CURRENCY = 'RM';

export const MAX_REASONABLE_HOURS_PER_DAY = 24;
export const MAX_REASONABLE_OT_HOURS_PER_DAY = 16;

// Minimum *net* hours (clock span minus break) that must actually be
// worked in a day before MySheba turns it into a paid basic/OT split -
// a shift of a couple of minutes clocked in/out shouldn't calculate a
// salary. Applies to Start Work / End Work and the manual "Calculate
// hours from times" entry alike.
export const MIN_HOURS_FOR_SALARY = 1;

export const DEFAULT_REMINDER_TIME = { hour: 20, minute: 0 }; // 8:00 PM local
