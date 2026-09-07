// Income statistics for Salary History (PRD section 19) - Average
// Monthly Salary, Average OT, Total OT Hours, Highest/Lowest Monthly
// Income, and the simple monthly-income chart's data points.
//
// Deliberately pure/client-side: takes the array already returned by
// salaryRecordService.listSalaryHistory()/subscribeSalaryHistory() and
// derives stats from it in memory, rather than issuing separate
// aggregation queries - matches this file living in src/utils (no
// Firestore import) alongside salaryCalculationService.js, and keeps
// SalaryHistoryScreen to the one read it already needs.
//
// "Monthly income" here means actualSalaryReceived when the user has
// recorded it, falling back to estimatedTakeHome for months where they
// haven't - see incomeForRecord() - so a month the user forgot to log
// still contributes something reasonable to the average/chart rather
// than being silently skipped.

function incomeForRecord(record) {
  return record.actualSalaryReceived != null ? record.actualSalaryReceived : record.estimatedTakeHome || 0;
}

/**
 * @param {Array} records - salary records, any order (as returned by salaryRecordService)
 * @returns {{ averageMonthlySalary:number, averageOT:number, totalOTHours:number, highestMonthlyIncome:number, lowestMonthlyIncome:number, monthCount:number }}
 */
export function computeIncomeStats(records) {
  const list = records || [];
  if (list.length === 0) {
    return { averageMonthlySalary: 0, averageOT: 0, totalOTHours: 0, highestMonthlyIncome: 0, lowestMonthlyIncome: 0, monthCount: 0 };
  }

  const incomes = list.map(incomeForRecord);
  const otPays = list.map((r) => r.otPay || 0);
  const otHoursList = list.map((r) => r.otHours || 0);

  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  const round2 = (n) => Math.round(n * 100) / 100;

  return {
    averageMonthlySalary: round2(sum(incomes) / list.length),
    averageOT: round2(sum(otPays) / list.length),
    totalOTHours: round2(sum(otHoursList)),
    highestMonthlyIncome: round2(Math.max(...incomes)),
    lowestMonthlyIncome: round2(Math.min(...incomes)),
    monthCount: list.length,
  };
}

/** Chart data points, oldest-to-newest (chronological, opposite order
 * from the history list's most-recent-first) - what
 * MonthlyIncomeChart expects (PRD section 19's "Jan Feb Mar..." axis). */
export function buildIncomeChartSeries(records) {
  return (records || [])
    .slice()
    .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month))
    .map((r) => ({
      label: monthShortLabel(r.month),
      year: r.year,
      month: r.month,
      value: incomeForRecord(r),
    }));
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthShortLabel(month) {
  return MONTH_SHORT[(Number(month) || 1) - 1] || '';
}
