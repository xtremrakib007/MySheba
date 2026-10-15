// A voucher (Recharge PIN) the provider releases after the order was accepted
// as "processing": IIMMPACT sends it on the transaction callback rather than
// on the purchase reply. The same fields executeConfiguredApi reads from a
// reply (functions/apiProviderService.js), from the callback body.

function getPath(obj, path) {
  const p = typeof path === 'string' ? path.trim() : '';
  return p ? p.split('.').reduce((v, k) => (v == null ? undefined : v[k]), obj) : undefined;
}
const text = (v, max) => ((typeof v === 'string' || typeof v === 'number') && String(v).trim() ? String(v).trim().slice(0, max) : '');
const first = (body, paths, max) => {
  for (const p of paths) { const v = text(getPath(body, p), max); if (v) return v; }
  return '';
};

/** { pin, deliveryLink, deliveryNote, expiry, serialNumber, secret } or null when the callback carries no voucher. */
function voucherFromCallback(body, configuredPath = '') {
  if (!body || typeof body !== 'object') return null;
  const configured = configuredPath ? first(body, [configuredPath], 2000) : '';
  const pin = first(body, ['data.pin', 'pin', 'data.voucher_pin', 'data.voucherPin'], 500);
  const link = first(body, ['data.voucherlink', 'voucherlink', 'data.voucher_link', 'voucher_link'], 2000);
  const deliveryLink = /^https?:\/\//i.test(link) ? link : '';
  const serialNumber = first(body, ['data.sn', 'sn'], 200);
  const secret = configured || pin || deliveryLink || serialNumber;
  if (!secret) return null;
  return {
    pin: configured || pin || (deliveryLink ? '' : serialNumber),
    deliveryLink,
    deliveryNote: first(body, ['data.note', 'note', 'data.redemption_note', 'redemption_note'], 1000),
    expiry: first(body, ['data.expiry', 'expiry'], 32),
    serialNumber,
    secret,
  };
}

module.exports = { voucherFromCallback };
