// Where a tapped link from outside the app is allowed to go.
//
// An ad's destination is typed into the advertiser console and stored in
// Firestore, so by the time it reaches the app it is untrusted input: whoever
// can write an ad document decides this string. It then gets handed either to
// a WebView or to Linking.openURL, and both of those will act on far more
// than a web address -
//
//   javascript:   runs in the WebView, with the app's own page context
//   data:         renders attacker-authored HTML as if it were the site
//   file:         reads the device filesystem through the WebView
//   intent: / tel: / sms: / market:  leave the app entirely, silently
//
// so the scheme is checked here rather than at each call site. Pure, with no
// React or Firebase in it, so the rule can be tested directly instead of
// inferred from a render.

const ALLOWED_SCHEMES = ['http:', 'https:'];

/**
 * The URL if it is a plain web address this app may open, else ''.
 *
 * A bare host ("example.com") is accepted and read as https - that is how
 * people type a domain, and rejecting it would just mean ads that silently do
 * nothing. Anything carrying a scheme must carry one of the two above.
 */
export function safeExternalUrl(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  // A scheme cannot contain a space or a slash, so this only matches a real
  // "scheme:" prefix - "example.com/a:b" falls through to the https default.
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(raw);
  if (scheme) {
    if (!ALLOWED_SCHEMES.includes(scheme[1].toLowerCase() + ':')) return '';
    // Reject a scheme with nothing after it, and anything with whitespace or
    // a control character in it - both reach a WebView as a broken load
    // rather than an address.
    if (/[\s\u0000-\u001f]/.test(raw)) return '';
    if (raw.length <= scheme[0].length + 2) return '';
    return raw;
  }
  if (/[\s\u0000-\u001f]/.test(raw)) return '';
  // Must look like a host: at least one dot, and nothing that would read as
  // a path-only or protocol-relative reference.
  if (raw.startsWith('/') || raw.startsWith('.')) return '';
  if (!/^[^/]+\.[^/.]{2,}/.test(raw)) return '';
  return 'https://' + raw;
}

/** Whether a tapped link should open inside the app rather than the browser. */
export function opensInApp(value) {
  return !!safeExternalUrl(value);
}

/**
 * A short title for the in-app browser's header bar.
 *
 * Falls back to the host, because an ad has no page title of its own and
 * "MySheba" over somebody else's site is worse than saying whose site it is.
 */
export function linkTitle(url, fallback = 'Sponsored') {
  const safe = safeExternalUrl(url);
  if (!safe) return fallback;
  const host = /^https?:\/\/([^/?#]+)/i.exec(safe);
  if (!host) return fallback;
  return host[1].replace(/^www\./i, '') || fallback;
}

/**
 * The webViewKey an ad-hoc link runs under.
 *
 * Deliberately not one of the configured page keys. Every charged and
 * triggered flow on the WebView screen is keyed off webViewKey -
 * SUBMIT_CHARGED_WEBVIEWS, ACCESS_CLICK_WEBVIEWS, PAYMENT_CHARGED_WEBVIEWS,
 * pointCosts, the FOMEMA clinic toggle - so a key that appears in none of
 * them turns all of it off by construction rather than by each of those
 * lists remembering to exclude it. An ad is never charged for.
 */
export const AD_HOC_WEBVIEW_KEY = 'externalLink';
