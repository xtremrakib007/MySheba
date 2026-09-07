// Pure calculation functions for the Salary & OT module (PRD section 31:
// "Keep all calculation formulas in one dedicated service. DO NOT place
// salary calculations directly inside UI components.").
//
// No Firestore/Firebase imports here on purpose - every function takes
// plain numbers/objects and returns plain numbers/objects, so this can be
// unit-tested standalone and reused from any screen. Lives in src/utils
// (like internetPackages.js) rather than src/firebase, since it never
// touches the network - contrast with salaryService.js /
// workLogService.js in src/firebase, which persist the results these
// functions produce.
//
// IMPORTANT - PRD section 33 "Important Legal / Accuracy Requirement":
// every total this module produces is an ESTIMATE. MYSheba does not
// currently implement a verified Malaysian statutory OT calculation -
// MYSHEBA_DEFAULT_OT_MULTIPLIERS (salaryConstants.js) is a plain 1.5x/2x/3x
// approximation of common practice, not a checked legal rate table. Do not
// remove the "Estimated" labeling in the UI, and do not present
// calculateDifference()'s output as proof of underpayment - see
// formatDifferenceMessage() below, which deliberately never says that.
import {
  OT_CALCULATION_METHODS,
  MYSHEBA_DEFAULT_OT_MULTIPLIERS,
  MIN_HOURS_FOR_SALARY,
} from '../data/salaryConstants';

// ---- Basic pay ----

/**
 * Estimated basic pay for the days actually worked this period (PRD
 * section 5). Monthly-frequency users still price a "per day worked"
 * rate off their basic salary / working days, same as daily/weekly/hourly
 * users, so partial months (new hire, unpaid leave) come out right rather
 * than always returning the full basic salary regardless of days worked.
 * @param {number} basicSalary - per the settings' payFrequency period
 * @param {number} workingDaysInPeriod - the normal/contracted days for that period (denominator)
 * @param {number} daysWorked - actual days worked (numerator)
 * @returns {number}
 */
export function calculateBasicPay(basicSalary, workingDaysInPeriod, daysWorked) {
  const salary = Number(basicSalary) || 0;
  const denom = Number(workingDaysInPeriod) || 0;
  const worked = Number(daysWorked) || 0;
  if (denom <= 0) return 0;
  return round2((salary / denom) * worked);
}

/** Derives an hourly rate from basic salary + the settings' normal hours,
 * used both to display "OT Rate: RM XX.XX / hour" (PRD section 6) and as
 * the multiplier base for calculateOT()'s DEFAULT method. */
export function deriveHourlyRate(basicSalary, normalHoursPerDay, workingDaysPerWeek) {
  const salary = Number(basicSalary) || 0;
  const hoursPerDay = Number(normalHoursPerDay) || 0;
  const daysPerWeek = Number(workingDaysPerWeek) || 0;
  if (hoursPerDay <= 0 || daysPerWeek <= 0) return 0;
  // basic salary is monthly - PRD section 4's setup only collects one
  // basicSalary figure regardless of payFrequency, so this assumes it's
  // being used as a monthly figure here. (26 is a common Malaysian
  // working-days-per-month convention for this kind of estimate, but it's
  // just the denominator for an *estimate* - not a statutory constant.)
  const monthlyHours = hoursPerDay * daysPerWeek * (52 / 12);
  if (monthlyHours <= 0) return 0;
  return round2(salary / monthlyHours);
}

// ---- Overtime ----

/**
 * Estimated OT pay for one OT entry (PRD sections 6-8).
 * @param {number} otHours
 * @param {string} otType - one of OT_TYPES (salaryConstants.js)
 * @param {string} calculationMethod - one of OT_CALCULATION_METHODS
 * @param {{ hourlyRate?: number, customOtRate?: number }} rateInputs -
 *   hourlyRate is the DEFAULT method's base (see deriveHourlyRate);
 *   customOtRate is the CUSTOM method's flat RM/hour figure (PRD section 7).
 * @returns {{ otPay: number, otRateApplied: number }}
 */
export function calculateOT(otHours, otType, calculationMethod, rateInputs = {}) {
  const hours = Number(otHours) || 0;
  if (hours <= 0) return { otPay: 0, otRateApplied: 0 };

  let rate;
  if (calculationMethod === OT_CALCULATION_METHODS.CUSTOM) {
    // PRD section 8 - simple hours x flat employer/contract rate. Same
    // rate regardless of otType, since a custom rate is whatever the
    // user's own contract says.
    rate = Number(rateInputs.customOtRate) || 0;
  } else {
    // DEFAULT - see the file-level note above: this is an unverified
    // approximation, not a checked statutory table.
    const base = Number(rateInputs.hourlyRate) || 0;
    const multiplier = MYSHEBA_DEFAULT_OT_MULTIPLIERS[otType] ?? MYSHEBA_DEFAULT_OT_MULTIPLIERS.normal;
    rate = round2(base * multiplier);
  }

  return { otPay: round2(hours * rate), otRateApplied: rate };
}

/**
 * Sums calculateOT() across every WorkLog entry for a period (PRD
 * section 12's "OT Hours: 34" monthly total, priced out). Entries with no
 * recorded otHours are skipped rather than erroring, so a month with
 * partial logging still totals what was actually recorded, matching PRD
 * section 32's "Month with no work logs" test case (returns zero, not
 * an error).
 * @param {Array<{otHours:number, otType:string}>} workLogEntries
 */
export function calculateOTForPeriod(workLogEntries, calculationMethod, rateInputs) {
  return (workLogEntries || []).reduce(
    (totals, entry) => {
      const { otPay } = calculateOT(entry.otHours, entry.otType, calculationMethod, rateInputs);
      totals.otPay = round2(totals.otPay + otPay);
      totals.otHours = round2(totals.otHours + (Number(entry.otHours) || 0));
      return totals;
    },
    { otPay: 0, otHours: 0 }
  );
}

// ---- Allowances & deductions ----

/** Sums a list of {amount} records (PRD sections 9-10). Works for both
 * allowances and deductions - same shape, opposite side of the ledger. */
export function sumLineItems(items) {
  return round2((items || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
}

// ---- Gross / take-home ----

/**
 * Full breakdown for one period (PRD section 11's worked example).
 * @returns {{ basicPay:number, otPay:number, allowances:number, grossPay:number, deductions:number, takeHomePay:number }}
 */
export function calculateTakeHomePay({ basicPay, otPay, allowances, deductions }) {
  const basic = Number(basicPay) || 0;
  const ot = Number(otPay) || 0;
  const allow = Number(allowances) || 0;
  const deduct = Number(deductions) || 0;
  const grossPay = round2(basic + ot + allow);
  const takeHomePay = round2(grossPay - deduct);
  return { basicPay: round2(basic), otPay: round2(ot), allowances: round2(allow), grossPay, deductions: round2(deduct), takeHomePay };
}

/** Estimated - actual (PRD section 15). Negative means actual came in
 * lower than the estimate. */
export function calculateDifference(estimatedTakeHome, actualSalaryReceived) {
  return round2((Number(actualSalaryReceived) || 0) - (Number(estimatedTakeHome) || 0));
}

/**
 * User-facing copy for a difference, deliberately never claiming
 * underpayment (PRD section 15: "Do not automatically claim that the
 * employer underpaid the worker" / "Please check your payslip, contract
 * and approved OT"). Screens should render this instead of composing
 * their own message from the raw number.
 */
export function formatDifferenceMessage(difference) {
  const d = Number(difference) || 0;
  if (d === 0) return 'Your recorded salary matches your estimate.';
  const amount = Math.abs(d).toFixed(2);
  if (d < 0) {
    return `Your recorded salary is RM ${amount} lower than your estimate. Please check your payslip, contract and approved OT.`;
  }
  return `Your recorded salary is RM ${amount} higher than your estimate. Please check your payslip for the details.`;
}

// ---- Start Work / End Work clock (PRD-adjacent: derives a day's hours
// from two clock times instead of the user typing "8" every day) ----

/** Parses a TimeField-style '08:00 AM' / '05:30 PM' display string into
 * minutes since midnight, or null if it doesn't match. Same 12-hour
 * format TimeField (components/ui.js) already writes, so Start Work /
 * End Work round-trips through the exact same string shape a manual
 * edit would produce. */
export function parseTimeToMinutes(str) {
  if (!str) return null;
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(str).trim());
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const isPM = match[3].toUpperCase() === 'PM';
  if (hours === 12) hours = 0;
  if (isPM) hours += 12;
  return hours * 60 + minutes;
}

/** Current time as a '08:00 AM'-style string, for Start Work / End Work
 * to stamp "now" in the same format parseTimeToMinutes() reads. */
export function formatTimeNow(date = new Date()) {
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${String(hours).padStart(2, '0')}:${minutes} ${suffix}`;
}

/**
 * Derives total/normal/OT hours worked from a Start Work / End Work pair
 * (PRD-adjacent "Salary & OT" feature: clock in, clock out, MySheba
 * works out the split). Handles an overnight shift (end time earlier than
 * start time, e.g. a night-shift worker) by treating the end time as the
 * next calendar day.
 *
 * A `breakHours` figure (e.g. lunch) is subtracted from the raw clock
 * span *before* the basic/OT split, so "8 hours basic, then OT" is always
 * computed off actual worked time, not the raw clock-in-to-clock-out
 * span. Break is clamped to the shift's own length so a break longer
 * than the shift never produces a negative net.
 *
 * If the resulting net hours are under MIN_HOURS_FOR_SALARY (currently 1
 * hour), no basic/OT split is produced at all - `hoursWorked`/`otHours`
 * come back as 0 and `belowMinimum` is true, so a shift of a few minutes
 * doesn't get priced into a salary. The raw `totalHours`/`netHours` are
 * still returned so the screen can show what was actually recorded.
 *
 * @param {string} startTime - '08:00 AM' style
 * @param {string} endTime - '08:00 AM' style
 * @param {number} normalHoursPerDay - from SalarySettings (basic hours, e.g. 8)
 * @param {number} [breakHours] - unpaid break to subtract before the OT split
 * @returns {{ totalHours:number, breakHours:number, netHours:number, hoursWorked:number, otHours:number, belowMinimum:boolean }}
 */
export function calculateHoursFromTimes(startTime, endTime, normalHoursPerDay, breakHours = 0) {
  const startMin = parseTimeToMinutes(startTime);
  const endMin = parseTimeToMinutes(endTime);
  if (startMin == null || endMin == null) {
    return { totalHours: 0, breakHours: 0, netHours: 0, hoursWorked: 0, otHours: 0, belowMinimum: false };
  }

  let diffMin = endMin - startMin;
  // diffMin === 0 means Start Work and End Work landed on the same
  // minute (e.g. two taps a few seconds apart) - genuinely zero time
  // elapsed, not a shift that wrapped all the way around a full 24h
  // back to its own start time. Only a *negative* diff (end time earlier
  // than start time, e.g. 11:00 PM -> 07:00 AM) is the actual overnight
  // case this function is meant to handle. Treating diffMin === 0 as
  // "add 24h" was the bug behind a same-minute tap pricing out as a
  // full 8h-normal + 16h-OT day.
  if (diffMin < 0) diffMin += 24 * 60; // overnight shift

  const totalHours = round2(diffMin / 60);
  const brk = round2(Math.min(Math.max(Number(breakHours) || 0, 0), totalHours));
  const netHours = round2(totalHours - brk);

  if (netHours < MIN_HOURS_FOR_SALARY) {
    return { totalHours, breakHours: brk, netHours, hoursWorked: 0, otHours: 0, belowMinimum: true };
  }

  const normal = Number(normalHoursPerDay) || 0;
  const hoursWorked = normal > 0 ? Math.min(netHours, normal) : netHours;
  const otHours = normal > 0 ? round2(Math.max(0, netHours - normal)) : 0;
  return { totalHours, breakHours: brk, netHours, hoursWorked: round2(hoursWorked), otHours, belowMinimum: false };
}

// ---- Validation (PRD section 24) ----

/**
 * Returns an array of human-readable validation errors, empty if the
 * record is valid. Screens should call this before saving and surface
 * each message rather than silently clamping values - PRD section 24
 * asks for "clear validation messages", not silent correction.
 */
export function validateSalaryInputs({ basicSalary, hoursWorked, otHours, breakHours, daysWorked, allowanceAmount, deductionAmount, actualSalary }) {
  const errors = [];
  if (basicSalary !== undefined && !(Number(basicSalary) > 0)) errors.push('Basic salary must be greater than 0.');
  if (hoursWorked !== undefined && Number(hoursWorked) < 0) errors.push('Hours worked cannot be negative.');
  if (otHours !== undefined) {
    const ot = Number(otHours);
    if (ot < 0) errors.push('OT hours cannot be negative.');
    // PRD section 24: "Prevent impossible values such as: OT hours =
    // 999999" - a generous but finite ceiling (imported from
    // salaryConstants so it's one number to tune, not scattered magic).
    if (ot > 100) errors.push('That OT hours value looks too high - please check and re-enter.');
  }
  if (breakHours !== undefined && Number(breakHours) < 0) errors.push('Break hours cannot be negative.');
  // Minimum-1-hour rule: only enforced once there's actually some worked
  // time entered (hoursWorked and/or otHours > 0) - a Rest Day/Leave
  // record, or an untouched form, shouldn't trip this.
  if (hoursWorked !== undefined || otHours !== undefined) {
    const totalWorked = round2((Number(hoursWorked) || 0) + (Number(otHours) || 0));
    if (totalWorked > 0 && totalWorked < MIN_HOURS_FOR_SALARY) {
      errors.push(`At least ${MIN_HOURS_FOR_SALARY} hour must be worked before salary can be calculated for the day.`);
    }
  }
  if (daysWorked !== undefined && Number(daysWorked) < 0) errors.push('Days worked cannot be negative.');
  if (allowanceAmount !== undefined && Number(allowanceAmount) < 0) errors.push('Allowance amount cannot be negative.');
  if (deductionAmount !== undefined && Number(deductionAmount) < 0) errors.push('Deduction amount cannot be negative.');
  if (actualSalary !== undefined && Number(actualSalary) < 0) errors.push('Actual salary received cannot be negative.');
  return errors;
}

// ---- helpers ----

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
