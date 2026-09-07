// PDF generation for the Create Payslip module (PRD sections 15-16,
// 20-21). Builds an A4 HTML payslip and renders it with expo-print,
// mirroring the existing "generate then share via expo-sharing" pattern
// used by DocumentDetailsScreen.js, plus native printing.
//
// No Firestore imports here on purpose, same "pure-ish, testable, one
// job" spirit as salaryCalculationService.js - this only turns a Payslip
// object into a file on disk.
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { PAYSLIP_TEMPLATES, GENERATED_BY_NOTICE, USER_GENERATED_DISCLAIMER } from '../data/payslipConstants';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function money(currency, n) {
  return `${currency} ${(Number(n) || 0).toFixed(2)}`;
}

/** PRD section 16 - Payslip_<EmployeeName>_<Month>_<Year>.pdf, invalid
 * characters stripped so the result is always a safe filename on both
 * iOS and Android filesystems. */
export function buildPayslipFileName(employeeName, month, year) {
  const namePart = (employeeName || 'Employee').trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Employee';
  const monthPart = MONTH_NAMES[(month || 1) - 1] || 'Month';
  return `Payslip_${namePart}_${monthPart}_${year || ''}.pdf`;
}

function lineItemRows(items, currency) {
  if (!items || items.length === 0) return '<tr><td colspan="2" class="muted">None</td></tr>';
  return items.map((i) => `<tr><td>${escapeHtml(i.description)}</td><td class="amount">${money(currency, i.amount)}</td></tr>`).join('');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Builds the printable HTML for a payslip (PRD section 13's preview
 * structure / section 15's PDF requirements). The three templates (PRD
 * section 14) share the same data and section order - they differ only
 * in density/typography, never in the underlying totals - so one
 * builder with a `template` switch keeps the numbers impossible to
 * drift between templates, per "Templates should differ in layout, not
 * in the underlying salary calculations."
 */
export function buildPayslipHtml(payslip) {
  const { employer, employee, payPeriod, paymentDate, earnings, deductions, grossSalary, totalDeductions, netSalary, currency, template } = payslip;
  const monthLabel = `${MONTH_NAMES[(payPeriod.month || 1) - 1]} ${payPeriod.year || ''}`;
  const detailed = template === PAYSLIP_TEMPLATES.DETAILED;
  const simple = template === PAYSLIP_TEMPLATES.SIMPLE;

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 20mm 16mm; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #202124; font-size: ${simple ? '11px' : '12px'}; }
  .brand { text-align: center; margin-bottom: 4px; }
  .brand .name { font-size: 20px; font-weight: 700; color: #00A99D; letter-spacing: 1px; }
  .brand .doc { font-size: 12px; color: #5F6368; letter-spacing: 3px; margin-top: 2px; }
  hr { border: none; border-top: 1px solid #E0E0E0; margin: 14px 0; }
  .company { text-align: center; margin-bottom: 10px; }
  .company .cname { font-size: 15px; font-weight: 700; }
  .company .caddr { font-size: 11px; color: #5F6368; }
  table.meta { width: 100%; margin-bottom: 6px; }
  table.meta td { padding: 3px 0; vertical-align: top; width: 50%; }
  table.meta .label { font-size: 10px; color: #5F6368; text-transform: uppercase; letter-spacing: 0.5px; }
  table.meta .value { font-size: 12px; font-weight: 600; }
  h3.section { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #5F6368; margin: 16px 0 6px; }
  table.items { width: 100%; border-collapse: collapse; }
  table.items td { padding: 5px 0; border-bottom: 1px solid #F0F0F0; }
  table.items td.amount { text-align: right; }
  table.items td.muted { color: #999; font-style: italic; }
  .totalRow td { font-weight: 700; padding-top: 8px; border-bottom: none; border-top: 2px solid #202124; }
  .netRow { background: #F0F7FB; margin-top: 14px; padding: 12px 14px; border-radius: 8px; display: flex; justify-content: space-between; }
  .netRow .label { font-size: 13px; font-weight: 700; }
  .netRow .value { font-size: 18px; font-weight: 800; color: #00897B; }
  .notice { margin-top: 22px; padding-top: 12px; border-top: 1px solid #E0E0E0; text-align: center; }
  .notice .g { font-size: 11px; font-weight: 700; color: #00A99D; }
  .notice .d { font-size: 9px; color: #999; margin-top: 4px; line-height: 1.4; }
</style>
</head>
<body>
  <div class="brand">
    <div class="name">MYSHEBA</div>
    <div class="doc">PAYSLIP</div>
  </div>
  <hr />
  ${employer?.name ? `<div class="company"><div class="cname">${escapeHtml(employer.name)}</div>${employer.address ? `<div class="caddr">${escapeHtml(employer.address)}</div>` : ''}</div>` : ''}

  <table class="meta">
    <tr>
      <td><div class="label">Employee</div><div class="value">${escapeHtml(employee?.name)}</div></td>
      <td><div class="label">Employee ID</div><div class="value">${escapeHtml(employee?.employeeId) || '-'}</div></td>
    </tr>
    <tr>
      <td><div class="label">Position</div><div class="value">${escapeHtml(employee?.position) || '-'}</div></td>
      <td><div class="label">Pay Period</div><div class="value">${monthLabel}</div></td>
    </tr>
    ${!simple ? `<tr>
      <td><div class="label">Payment Date</div><div class="value">${paymentDate || '-'}</div></td>
      ${employee?.includeBankAccount && employee?.bankAccount ? `<td><div class="label">Bank Account</div><div class="value">${escapeHtml(employee.bankAccount)}</div></td>` : '<td></td>'}
    </tr>` : ''}
  </table>

  <h3 class="section">Earnings</h3>
  <table class="items">
    ${lineItemRows(earnings, currency)}
    <tr class="totalRow"><td>Gross Salary</td><td class="amount">${money(currency, grossSalary)}</td></tr>
  </table>

  <h3 class="section">Deductions</h3>
  <table class="items">
    ${lineItemRows(deductions, currency)}
    <tr class="totalRow"><td>Total Deductions</td><td class="amount">${money(currency, totalDeductions)}</td></tr>
  </table>

  <div class="netRow">
    <div class="label">NET SALARY</div>
    <div class="value">${money(currency, netSalary)}</div>
  </div>

  ${detailed && employer?.registrationNumber ? `<p style="font-size:9px;color:#999;margin-top:14px;">Company Reg. No: ${escapeHtml(employer.registrationNumber)}</p>` : ''}

  <div class="notice">
    <div class="g">${GENERATED_BY_NOTICE}</div>
    <div class="d">${USER_GENERATED_DISCLAIMER}</div>
  </div>
</body>
</html>`;
}

/**
 * Renders the payslip to a PDF on disk and renames it to the PRD
 * section 16 filename (expo-print's own output name is a random cache
 * path, not something we control directly).
 * @returns {Promise<{uri:string, fileName:string}>}
 */
export async function generatePayslipPdf(payslip) {
  const html = buildPayslipHtml(payslip);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const fileName = buildPayslipFileName(payslip.employee?.name, payslip.payPeriod?.month, payslip.payPeriod?.year);
  // buildPayslipFileName is deterministic per employee/month/year, so
  // destUri is the same path across regenerations of the same payslip -
  // deleteAsync first (idempotent: {idempotent:true} makes "already
  // doesn't exist" a no-op) rather than letting copyAsync overwrite in
  // place, since a stale, possibly-truncated file from an earlier
  // failed/partial generation left at this exact path was one way a
  // "successful" copy could still end up unusable.
  const destUri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.deleteAsync(destUri, { idempotent: true });
  await FileSystem.copyAsync({ from: uri, to: destUri });
  // Verify the copy actually produced a non-empty file before handing the
  // uri back to the caller. expo-print's cache uri can be evicted by the
  // OS between printToFileAsync resolving and copyAsync reading it
  // (more likely on constrained/dev environments), and copyAsync
  // resolving successfully doesn't by itself guarantee a full, non-empty
  // destination file. Catching that here, right after generation, is
  // more useful than only catching it later at upload time - the error
  // points at "PDF generation" instead of surfacing as an unexplained
  // blank document days later.
  const destInfo = await FileSystem.getInfoAsync(destUri).catch(() => null);
  if (!destInfo?.exists || !destInfo.size) {
    throw new Error('The PDF could not be generated. Please try again.');
  }
  return { uri: destUri, fileName };
}

export async function sharePayslipPdf(uri) {
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
}

/** PRD section 21 - falls back to a friendly message rather than a raw
 * error if the platform/device has no printing capability. */
export async function printPayslipPdf(uri) {
  try {
    await Print.printAsync({ uri });
  } catch (err) {
    throw new Error('Printing is not available on this device. You can share or save the PDF instead.');
  }
}
