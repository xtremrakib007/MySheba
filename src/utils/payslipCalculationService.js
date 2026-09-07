// Pure calculation functions for the Create Payslip module (PRD section
// 11: "All calculations must be handled by a dedicated service. Do NOT
// put calculation logic directly inside UI components.").
//
// Same "no Firestore imports, plain numbers/objects in and out" shape as
// salaryCalculationService.js, so this can be unit-tested standalone and
// reused from the create/edit screen, the preview, and the PDF builder
// without ever computing the same total two different ways.

/** Sums a list of {amount} line items - earnings or deductions, same
 * shape either side. Non-numeric/blank amounts count as 0 rather than
 * erroring, so an in-progress row doesn't break the live total. */
export function sumLineItems(items) {
  return round2((items || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
}

/** PRD section 11 formula: Total Earnings = Basic Salary + OT + Allowances
 * + Bonuses + Other Earnings - i.e. every row in the Earnings list. */
export function calculateTotalEarnings(earnings) {
  return sumLineItems(earnings);
}

export function calculateTotalDeductions(deductions) {
  return sumLineItems(deductions);
}

/** Gross Salary = Total Earnings (PRD section 11). */
export function calculateGrossSalary(earnings) {
  return calculateTotalEarnings(earnings);
}

/** Net Salary = Gross Salary - Total Deductions (PRD section 11). */
export function calculateNetSalary(grossSalary, totalDeductions) {
  return round2((Number(grossSalary) || 0) - (Number(totalDeductions) || 0));
}

/** Full breakdown in one call - what CreatePayslipScreen's live totals
 * (PRD section 12) and the preview/PDF builders should all read from. */
export function calculatePayslipTotals(earnings, deductions) {
  const grossSalary = calculateGrossSalary(earnings);
  const totalDeductions = calculateTotalDeductions(deductions);
  const netSalary = calculateNetSalary(grossSalary, totalDeductions);
  return { grossSalary, totalDeductions, netSalary };
}

// ---- Validation (PRD section 27) ----

/**
 * Returns an array of human-readable validation errors, empty if the
 * payslip draft is valid. Mirrors validateSalaryInputs()'s "surface
 * clear messages, don't silently clamp" approach.
 */
export function validatePayslipDraft({ employeeName, payPeriod, earnings, deductions }) {
  const errors = [];

  if (!employeeName || !employeeName.trim()) {
    errors.push('Employee name is required.');
  }

  if (!payPeriod || !payPeriod.month || !payPeriod.year) {
    errors.push('Please select a pay period.');
  }
  if (payPeriod?.startDate && payPeriod?.endDate && payPeriod.startDate > payPeriod.endDate) {
    errors.push('Pay period start date must be before the end date.');
  }

  const namedEarnings = (earnings || []).filter((e) => e.description && e.description.trim());
  if (namedEarnings.length === 0) {
    errors.push('Add at least one earning (e.g. Basic Salary).');
  }
  (earnings || []).forEach((e) => {
    if (Number(e.amount) < 0) errors.push(`"${e.description || 'Earning'}" amount cannot be negative.`);
  });
  (deductions || []).forEach((d) => {
    if (Number(d.amount) < 0) errors.push(`"${d.description || 'Deduction'}" amount cannot be negative.`);
  });

  return errors;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
