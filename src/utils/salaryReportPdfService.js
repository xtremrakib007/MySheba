// PDF generation for the Salary & OT module's Reports screen. Same
// "generate then share via expo-sharing" pattern as payslipPdfService.js -
// see that file's top note. Kept as its own module rather than folded
// into payslipPdfService since a work-log report and a payslip are
// different documents with different data shapes (a date-range table of
// daily entries vs a single period's earnings/deductions breakdown).
import * as Print from 'expo-print';
import { printUri } from './printService';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { CURRENCY } from '../data/salaryConstants';

function money(n) {
  return `${CURRENCY} ${(Number(n) || 0).toFixed(2)}`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Salary_Report_<start>_to_<end>.pdf, invalid characters stripped so the
 * result is a safe filename on both iOS and Android - mirrors
 * payslipPdfService.buildPayslipFileName. */
export function buildReportFileName(startLabel, endLabel) {
  const clean = (s) => (s || '').trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `Salary_Report_${clean(startLabel)}_to_${clean(endLabel)}.pdf`;
}

function statusLabel(status) {
  if (status === 'worked') return 'Worked';
  if (status === 'restDay') return 'Rest Day';
  if (status === 'leave') return 'Leave';
  return '-';
}

function dayRows(entries) {
  if (!entries || entries.length === 0) {
    return '<tr><td colspan="6" class="muted">No work log entries in this range.</td></tr>';
  }
  return entries
    .map((e) => `
      <tr>
        <td>${escapeHtml(e.displayDate)}</td>
        <td>${statusLabel(e.status)}</td>
        <td>${e.startTime && e.endTime ? `${escapeHtml(e.startTime)} - ${escapeHtml(e.endTime)}` : '-'}</td>
        <td class="amount">${e.hoursWorked || 0}h</td>
        <td class="amount">${e.otHours || 0}h</td>
        <td class="amount">${((Number(e.hoursWorked) || 0) + (Number(e.otHours) || 0)).toFixed(2)}h</td>
      </tr>`)
    .join('');
}

/**
 * Builds the printable HTML for a Salary & OT report over a date range
 * (start work / end work time, derived normal + OT hours per day, and
 * the period's estimated basic/OT/gross pay). Mirrors
 * payslipPdfService.buildPayslipHtml's structure/styling so the two PDF
 * types feel like they come from the same app.
 * @param {{ startLabel:string, endLabel:string, entries:Array, totals:Object, currency?:string }} report
 */
export function buildReportHtml(report) {
  const { startLabel, endLabel, entries, totals } = report;

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 16mm 14mm; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #202124; font-size: 11px; }
  .brand { text-align: center; margin-bottom: 4px; }
  .brand .name { font-size: 20px; font-weight: 700; color: #00A99D; letter-spacing: 1px; }
  .brand .doc { font-size: 12px; color: #5F6368; letter-spacing: 3px; margin-top: 2px; }
  hr { border: none; border-top: 1px solid #E0E0E0; margin: 14px 0; }
  .period { text-align: center; font-size: 13px; font-weight: 700; margin-bottom: 14px; }
  h3.section { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #5F6368; margin: 16px 0 6px; }
  table.summary { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  table.summary td { padding: 6px 0; border-bottom: 1px solid #F0F0F0; }
  table.summary td.amount { text-align: right; font-weight: 600; }
  table.summary .totalRow td { font-weight: 700; padding-top: 8px; border-bottom: none; border-top: 2px solid #202124; }
  table.days { width: 100%; border-collapse: collapse; margin-top: 6px; }
  table.days th { text-align: left; font-size: 9px; text-transform: uppercase; color: #5F6368; padding: 6px 4px; border-bottom: 2px solid #202124; }
  table.days td { padding: 5px 4px; border-bottom: 1px solid #F0F0F0; font-size: 10px; }
  table.days td.amount, table.days th.amount { text-align: right; }
  table.days td.muted { color: #999; font-style: italic; text-align: center; }
  .notice { margin-top: 22px; padding-top: 12px; border-top: 1px solid #E0E0E0; text-align: center; }
  .notice .g { font-size: 11px; font-weight: 700; color: #00A99D; }
  .notice .d { font-size: 9px; color: #999; margin-top: 4px; line-height: 1.4; }
</style>
</head>
<body>
  <div class="brand">
    <div class="name">MYSHEBA</div>
    <div class="doc">SALARY &amp; OT REPORT</div>
  </div>
  <hr />
  <div class="period">${escapeHtml(startLabel)} &ndash; ${escapeHtml(endLabel)}</div>

  <h3 class="section">Summary</h3>
  <table class="summary">
    <tr><td>Days Worked</td><td class="amount">${totals.daysWorked}</td></tr>
    <tr><td>Total Normal Hours</td><td class="amount">${totals.normalHours}h</td></tr>
    <tr><td>Total OT Hours</td><td class="amount">${totals.otHours}h</td></tr>
    <tr><td>Estimated Basic Pay</td><td class="amount">${money(totals.basicPay)}</td></tr>
    <tr><td>Estimated OT Pay</td><td class="amount">${money(totals.otPay)}</td></tr>
    <tr class="totalRow"><td>Estimated Gross Pay</td><td class="amount">${money(totals.grossPay)}</td></tr>
  </table>

  <h3 class="section">Daily Work Log</h3>
  <table class="days">
    <thead>
      <tr>
        <th>Date</th><th>Status</th><th>Start - End</th>
        <th class="amount">Normal</th><th class="amount">OT</th><th class="amount">Total</th>
      </tr>
    </thead>
    <tbody>
      ${dayRows(entries)}
    </tbody>
  </table>

  <div class="notice">
    <div class="g">Generated by MySheba</div>
    <div class="d">This report is an estimate based on your saved settings and work log. It is not a payslip and does not represent a legally binding statutory calculation. Actual salary depends on your employment contract, approved OT and your employer's payroll rules.</div>
  </div>
</body>
</html>`;
}

/**
 * Renders the report to a PDF on disk, renamed to a friendly filename
 * (expo-print's own output name is a random cache path) - see
 * payslipPdfService.generatePayslipPdf for the identical pattern.
 * @returns {Promise<{uri:string, fileName:string}>}
 */
export async function generateReportPdf(report) {
  const html = buildReportHtml(report);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const fileName = buildReportFileName(report.startLabel, report.endLabel);
  const destUri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.copyAsync({ from: uri, to: destUri });
  return { uri: destUri, fileName };
}

export async function shareReportPdf(uri) {
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
}

/** Falls back to a friendly message rather than a raw error if the
 * platform/device has no printing capability - mirrors
 * payslipPdfService.printPayslipPdf. */
export async function printReportPdf(uri) {
  try {
    await printUri(uri);
  } catch (err) {
    throw new Error('Printing is not available on this device. You can share or save the PDF instead.');
  }
}
