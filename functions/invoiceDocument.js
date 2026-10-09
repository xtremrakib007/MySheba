/**
 * The invoice as a document somebody can print, file or send.
 *
 * Built on the server, from the stored record, for both clients. Not because
 * it is hard to render HTML in a browser - because this is the artefact a
 * payment is justified with months later, and it must say what the record
 * says. A document assembled from whatever a screen happened to have in state
 * is a different thing that looks the same.
 *
 * Pure: no Firestore, no clock, no I/O. It is handed an invoice and returns a
 * string, which is what makes the wording and the two names testable.
 */

const COMPANY_NAME = '';
const WEBSITE = 'www.mysheba.top';
const EMAIL = 'info@mysheba.top';

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const KIND_LABELS = { investment: 'Investment', providerPayment: 'Provider payment' };

/** The party line reads differently depending on which way the money went. */
const PARTY_LABELS = { investment: 'Received from', providerPayment: 'Paid to' };

function money(amount, currency) {
  const n = Number(amount);
  const value = Number.isFinite(n) ? n.toFixed(2) : '0.00';
  const code = String(currency || '').trim().toUpperCase().slice(0, 8);
  return (code ? code + ' ' : '') + value;
}

/**
 * A moment, in words, with the time.
 *
 * "Approved on the 3rd" answers nothing anybody asks of a payment later, so
 * the time is never dropped. UTC, and labelled as such: a document read in
 * another country must not imply a different hour than the record holds.
 */
function when(millis) {
  const n = Number(millis);
  if (!Number.isFinite(n) || n <= 0) return '';
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = (v) => String(v).padStart(2, '0');
  return `${pad(d.getUTCDate())} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()} at ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** "Name (role)", or just the name, or nothing at all. */
function person(name, role) {
  const who = String(name || '').trim();
  const what = String(role || '').trim();
  if (!who) return '';
  return what ? `${who} (${what})` : who;
}

function row(label, value) {
  if (!value) return '';
  return `<div class="row"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
}

/**
 * The printable invoice.
 *
 * An unapproved invoice prints too, and says so in the clearest words
 * available: a pending or rejected one that printed looking like an approved
 * one is the single worst thing this document could do.
 */
function renderInvoiceHtml(invoice) {
  const i = invoice || {};
  const status = String(i.status || '').trim().toLowerCase();
  const approved = status === 'approved';
  const kind = String(i.kind || '').trim();
  const raisedBy = person(i.createdByName, i.createdByRole);
  const approvedBy = person(i.approvedByName, i.approvedByRole);

  const notice = approved
    ? ''
    : `<div class="notice">${esc(status === 'rejected'
      ? 'REJECTED - this invoice was refused and is not payable.'
      : 'NOT YET APPROVED - this invoice is awaiting a second approver and is not payable.')}</div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(i.number || 'Invoice')}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0F2E33; background: #fff; }
  .sheet { max-width: 720px; margin: 0 auto; border: 1px solid #D5EFE7; border-radius: 12px; overflow: hidden; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 20px 24px; background: #F2FAF7; border-bottom: 1px solid #D5EFE7; }
  .logo { width: 52px; height: 52px; object-fit: contain; margin-bottom: 6px; }
  .brand { font-size: 22px; font-weight: 800; color: #0B8A94; letter-spacing: -0.3px; }
  .company { font-size: 11px; line-height: 16px; color: #476A6B; margin-top: 4px; }
  .no { text-align: right; }
  .no .label { font-size: 10px; letter-spacing: 1px; color: #476A6B; text-transform: uppercase; }
  .no .value { font-size: 17px; font-weight: 700; margin-top: 2px; }
  .status { display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; }
  .approved { background: #E8F5E9; color: #2E7D32; }
  .pending { background: #FFF8E1; color: #F57F17; }
  .rejected { background: #FDECEA; color: #C62828; }
  .notice { margin: 0; padding: 10px 24px; background: #FDECEA; color: #C62828; font-size: 12px; font-weight: 700; border-bottom: 1px solid #F5C6C2; }
  .body { padding: 20px 24px; }
  .amount { padding: 16px 0 18px; border-bottom: 1px solid #D5EFE7; margin-bottom: 14px; }
  .amount .label { font-size: 10px; letter-spacing: 1px; color: #476A6B; text-transform: uppercase; }
  .amount .value { font-size: 30px; font-weight: 800; margin-top: 2px; }
  .row { display: flex; justify-content: space-between; gap: 16px; padding: 7px 0; font-size: 13px; border-bottom: 1px solid #EDF7F3; }
  .row:last-child { border-bottom: 0; }
  .row span { color: #476A6B; flex-shrink: 0; }
  .row b { text-align: right; font-weight: 600; word-break: break-word; }
  h2 { font-size: 10px; letter-spacing: 1px; color: #476A6B; text-transform: uppercase; margin: 18px 0 4px; font-weight: 700; }
  .notes { font-size: 13px; line-height: 19px; white-space: pre-wrap; word-break: break-word; margin-top: 4px; }
  .foot { padding: 14px 24px; border-top: 1px solid #D5EFE7; background: #F2FAF7; font-size: 11px; color: #476A6B; display: flex; justify-content: space-between; gap: 16px; }
  @media print {
    body { padding: 0; }
    .sheet { border: 0; border-radius: 0; max-width: none; }
    .head, .foot { background: #fff; }
  }
</style></head><body><div class="sheet">
<div class="head">
  <div><img class="logo" src="https://mysheba.top/assets/images/logo.png" alt="MySheba logo"><div class="brand">MySheba</div>${COMPANY_NAME ? `<div class="company">${esc(COMPANY_NAME)}</div>` : ''}</div>
  <div class="no">
    <div class="label">Invoice</div>
    <div class="value">${esc(i.number || '-')}</div>
    <div class="status ${approved ? 'approved' : status === 'rejected' ? 'rejected' : 'pending'}">${esc((status || 'pending').toUpperCase())}</div>
  </div>
</div>
${notice}
<div class="body">
  <div class="amount">
    <div class="label">${esc(KIND_LABELS[kind] || 'Invoice')}</div>
    <div class="value">${esc(money(i.amount, i.currency))}</div>
  </div>
  ${row(PARTY_LABELS[kind] || 'Party', i.party)}
  ${row('Their reference', i.reference)}
  <h2>Who answered for this</h2>
  ${row('Raised by', raisedBy)}
  ${row('Raised at', when(i.createdAt))}
  ${row(status === 'rejected' ? 'Rejected by' : 'Approved by', approvedBy)}
  ${row(status === 'rejected' ? 'Rejected at' : 'Approved at', when(i.approvedAt))}
  ${i.decisionNote ? `<h2>Decision note</h2><div class="notes">${esc(i.decisionNote)}</div>` : ''}
  ${i.notes ? `<h2>Notes</h2><div class="notes">${esc(i.notes)}</div>` : ''}
</div>
<div class="foot"><span>${esc(EMAIL)}</span><span>${esc(WEBSITE)}</span></div>
</div></body></html>`;
}

module.exports = { renderInvoiceHtml, COMPANY_NAME, WEBSITE, EMAIL };
