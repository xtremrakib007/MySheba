/**
 * Reading a callback that may arrive as either a POST body or a GET query.
 *
 * iimmpact's dashboard offers a POST/GET toggle for the transaction callback
 * and its own help text says "We'll send transaction status updates to this
 * endpoint using GET requests". A GET callback carries no body at all, so a
 * handler that only reads `req.body` sees an empty object and answers 400
 * "Missing transactionId or status" for every single delivery.
 *
 * The same dashboard refuses to save a callback URL that already carries a
 * query string - it has its own parameters to append. That is why the provider
 * id can also arrive as a path segment, `/apiWebhook/<providerId>`, which is
 * the form `endpointUrl` now hands out. The `?providerId=` form keeps working
 * because webhooks configured before this change are still registered with it
 * at the provider, and those providers are not all re-configurable on demand.
 */

const FUNCTION_NAME = 'apiWebhook';
const PROJECT_ID = 'satulink-solutions';
const REGION = 'us-central1';
// Our own parameter, not the provider's. It identifies which webhook config to
// load and must not be mistaken for a callback field.
const OWN_PARAMS = ['providerId'];

function text(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/**
 * The provider id from the URL path, or '' when the path does not carry one.
 *
 * Exactly one segment may remain after the function name, so `/apiWebhook`
 * alone falls through to the query parameter and a deeper path is refused
 * rather than having some segment of it read as an id. Cloud Functions strips
 * the function name from `req.path`, the emulator does not, so both shapes
 * are accepted.
 */
function pathProviderId(path) {
  const segments = String(path == null ? '' : path).split('/').filter(Boolean);
  if (segments.length > 1 && segments[0] === FUNCTION_NAME) segments.shift();
  if (segments.length !== 1 || segments[0] === FUNCTION_NAME) return '';
  return segments[0];
}

function webhookProviderId(req) {
  const fromPath = pathProviderId(req && req.path);
  if (fromPath) return text(fromPath, 100);
  const q = req && req.query;
  return text(q && q.providerId, 100);
}

/**
 * One configuration that reads both a nested and a flat payload.
 *
 * An iimmpact provider's path settings are `data.refid`, `data.status`,
 * `data.remarks`, because that is the shape of the JSON body their POST
 * callback sends. A GET callback has no body at all and puts the same fields
 * flat on the URL, and a form-encoded POST would arrive flat too. Rather than
 * make every path setting depend on a toggle in someone else's dashboard - and
 * silently blank every field the day it moves - flat fields are also mirrored
 * under `data`, so the settings above keep resolving either way.
 *
 * A field actually named `data` wins over the mirror: it is real provider
 * output and the mirror is only our convenience. A nested body therefore comes
 * back untouched.
 */
function withDataMirror(fields) {
  if (Object.prototype.hasOwnProperty.call(fields, 'data')) return fields;
  return { ...fields, data: { ...fields } };
}

/**
 * The callback fields, whichever way the provider sent them.
 *
 * A POST with a non-empty object body is that body. Anything else falls back
 * to the query string, which is where a GET callback puts its fields.
 */
function webhookPayload(req) {
  const method = String((req && req.method) || '').toUpperCase();
  const body = req && req.body;
  const isObjectBody = !!body && typeof body === 'object' && !Array.isArray(body);
  if (method === 'POST' && isObjectBody && Object.keys(body).length) return withDataMirror(body);

  const q = (req && req.query) || {};
  const flat = {};
  for (const key of Object.keys(q)) {
    if (OWN_PARAMS.includes(key)) continue;
    const value = q[key];
    // Express gives an array for a repeated parameter. Keep the last one: a
    // provider that sends `status` twice means the later value, and an array
    // would not survive `safeText` into a status comparison.
    flat[key] = Array.isArray(value) ? value[value.length - 1] : value;
  }
  return withDataMirror(flat);
}

/**
 * The URL to register at the provider.
 *
 * The provider id is a path segment, not a query parameter: iimmpact's own
 * dashboard answers 400 and refuses to save a callback URL that already
 * carries a query string, because a GET-mode callback appends its own
 * parameters to it. `webhookProviderId` still accepts the older
 * `?providerId=` form, so webhooks already registered that way keep working.
 *
 * It lives here, beside the parser that has to read it back, so the URL handed
 * out and the URL understood cannot drift apart - they did when the Success
 * TopUp auto-provision carried its own copy of this string.
 */
function webhookEndpointUrl(providerId) {
  return 'https://' + REGION + '-' + PROJECT_ID + '.cloudfunctions.net/' + FUNCTION_NAME + '/' + encodeURIComponent(providerId);
}

module.exports = { pathProviderId, webhookProviderId, webhookPayload, webhookEndpointUrl, FUNCTION_NAME };
