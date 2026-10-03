// The printable receipt, in one place.
//
// This was sixty lines inlined in TransactionDetailModal's Print handler, for
// orders only: a top-up had no receipt at all, which is the one thing a customer
// actually asks for after paying money in. Copying the block to add one would
// have made two documents that drift - the same mistake as the three copies of
// the role-home mapping.
//
// Escaping lives here rather than at the call sites. A bank name, a note or a
// customer's own display name goes into this HTML, and `<img src=x onerror=...>`
// in any of them is a real string someone can type. A caller that has to
// remember to escape is a caller that will forget; `receiptRows` takes raw
// values and escapes them itself.
//
// No React and no printer here, so a test can read the HTML it produces.

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * `[label, value]` pairs as table rows, blanks dropped.
 *
 * A receipt listing "Bank: —" for every field the service does not use reads as
 * though something went missing, so an empty value removes its row entirely.
 */
export function receiptRows(pairs) {
  return (pairs || [])
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([label, value]) =>
      `<tr><td style="padding:7px 6px;border-bottom:1px solid #e5e7eb;color:#555;font-weight:600;width:38%">${escapeHtml(label)}</td><td style="padding:7px 6px;border-bottom:1px solid #e5e7eb;word-break:break-word">${escapeHtml(value)}</td></tr>`)
    .join('');
}

/** An uploaded image under its own heading, or nothing if there is no image. */
export function imageBlock(label, url) {
  if (!url) return '';
  return `<div style="margin-top:18px"><b>${escapeHtml(label)}</b><br><img src="${escapeHtml(url)}" style="max-width:100%;max-height:420px;margin-top:8px;object-fit:contain"></div>`;
}

/** A boxed value meant to be read off the page, like a collection PIN. */
export function highlightBlock(label, value) {
  if (!value) return '';
  return `<div style="margin:16px 0;padding:14px;border:2px solid #0B8A94;text-align:center"><div style="font-size:11px;font-weight:700">${escapeHtml(label)}</div><div style="font-size:28px;font-weight:bold;letter-spacing:6px;margin-top:5px">${escapeHtml(value)}</div></div>`;
}

/**
 * The document every MySheba receipt is: one masthead, one table, then whatever
 * blocks the receipt adds below it.
 *
 * `rowsHtml` and `blocks` are already-built HTML from the helpers above - the
 * only strings in here that are not escaped, and the reason those helpers exist.
 */
export function receiptDocument({ subtitle, rowsHtml, blocks = [], footer = 'Please keep this receipt for your records.' }) {
  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@page{margin:12mm}body{font-family:Arial,sans-serif;color:#111;font-size:12px;margin:0}
h1{font-size:20px;text-align:center;margin:0 0 4px}.sub{text-align:center;color:#666;margin-bottom:14px}
table{width:100%;border-collapse:collapse}.footer{margin-top:18px;padding-top:10px;border-top:1px solid #ddd;text-align:center;color:#666;font-size:10px}
</style></head><body>
<h1>MySheba</h1><div class="sub">${escapeHtml(subtitle)}</div>
<table>${rowsHtml}</table>
${blocks.filter(Boolean).join('')}
<div class="footer">${escapeHtml(footer)}</div>
</body></html>`;
}
