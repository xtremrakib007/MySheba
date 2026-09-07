const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

// Serves a plain HTML page for one marketplace listing, reachable at
// https://mysheba.top/listing/{id} once mysheba.top is connected to this
// Firebase project as a custom Hosting domain (Firebase Console > Hosting >
// Add custom domain) and firebase.json's hosting.rewrites sends /listing/**
// here (see firebase.json in the project root).
//
// This is what makes a shared listing link mean something to someone who
// doesn't have MySheba installed - it's a real page with the listing's
// photo/title/price, Open Graph + Twitter Card meta tags so WhatsApp/
// Facebook/X/etc build a proper link-preview card, an "Open in MySheba
// App" button (mysheba://listing/{id} - handled in App.js/AppContext.js
// for anyone who already has the app), and a Play Store button for anyone
// who doesn't. The mysheba:// button is a plain link tap, not an automatic
// JS redirect - those are unreliable (especially on iOS Safari) and would
// make the page feel broken for people without the app installed.
//
// GOOGLE_PLAY_URL: update once the app is actually listed - a placeholder
// Play Store search link is used until then so the button never 404s.
const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.satulink.mysheba';

const BRAND_TEAL = '#0FB8A0';
const BRAND_BLUE = '#1A73E8';

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderNotFoundPage() {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Listing not found - MySheba</title></head>
<body style="font-family:-apple-system,Roboto,sans-serif;text-align:center;padding:60px 20px;color:#333;">
<h2>This listing isn't available</h2>
<p>It may have been removed by the seller.</p>
<a href="${GOOGLE_PLAY_URL}" style="color:${BRAND_BLUE};">Get the MySheba app</a>
</body></html>`;
}

function renderListingPage(listing, id, requestUrl) {
  const title = escapeHtml(listing.title || 'MySheba Marketplace listing');
  const price = `MYR ${Number(listing.price || 0).toFixed(2)}${listing.negotiable ? ' (Negotiable)' : ''}`;
  const description = escapeHtml(
    `${price}${listing.location ? ` · ${listing.location}` : ''}${listing.description ? ` — ${listing.description}` : ''}`
  ).slice(0, 300);
  const image = Array.isArray(listing.images) && listing.images.length > 0 ? listing.images[0] : '';
  const pageUrl = `https://mysheba.top/listing/${id}`;
  const sold = listing.status === 'sold';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} - MySheba Marketplace</title>
<meta name="description" content="${description}">

<meta property="og:type" content="product">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${pageUrl}">
${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ''}
<meta property="product:price:amount" content="${Number(listing.price || 0).toFixed(2)}">
<meta property="product:price:currency" content="MYR">

<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
${image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : ''}

<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Roboto, "Segoe UI", sans-serif; margin: 0; background: #F7F8FA; color: #1A1A1A; }
  .wrap { max-width: 480px; margin: 0 auto; background: white; min-height: 100vh; }
  .header { background: linear-gradient(90deg, ${BRAND_TEAL}, ${BRAND_BLUE}); padding: 16px 20px; color: white; font-weight: 700; font-size: 18px; }
  .photo { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; background: #EEE; display: block; }
  .body { padding: 20px; }
  .badge { display: inline-block; background: #FDECEA; color: #C62828; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 20px; margin-bottom: 10px; }
  h1 { font-size: 20px; margin: 0 0 6px; }
  .price { font-size: 22px; font-weight: 800; color: ${BRAND_BLUE}; margin: 0 0 10px; }
  .meta { color: #777; font-size: 13px; margin-bottom: 14px; }
  .desc { font-size: 14px; line-height: 1.6; color: #333; white-space: pre-line; }
  .cta { display: block; text-align: center; background: linear-gradient(90deg, ${BRAND_TEAL}, ${BRAND_BLUE}); color: white; text-decoration: none; font-weight: 700; padding: 14px; border-radius: 10px; margin: 24px 20px 8px; }
  .cta.secondary { background: white; color: ${BRAND_BLUE}; border: 2px solid ${BRAND_BLUE}; margin-top: 0; }
  .footer { text-align: center; color: #999; font-size: 12px; padding: 0 20px 30px; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="header">MySheba Marketplace</div>
    ${image ? `<img class="photo" src="${escapeHtml(image)}" alt="${title}">` : ''}
    <div class="body">
      ${sold ? '<div class="badge">SOLD</div>' : ''}
      <h1>${title}</h1>
      <div class="price">${escapeHtml(price)}</div>
      ${listing.location ? `<div class="meta">📍 ${escapeHtml(listing.location)}</div>` : ''}
      ${listing.description ? `<div class="desc">${escapeHtml(listing.description)}</div>` : ''}
    </div>
    <a class="cta" href="mysheba://listing/${escapeHtml(id)}">Open in MySheba App</a>
    <a class="cta secondary" href="${GOOGLE_PLAY_URL}">Don't have the app? Get it here</a>
    <div class="footer">Buy, sell, and discover services on MySheba.</div>
  </div>
</body>
</html>`;
}

// Path comes through as-is from the Hosting rewrite (see firebase.json,
// source: "/listing/**") - e.g. /listing/abc123. Also tolerates a plain
// ?id= query param in case something links to the function URL directly.
exports.listingPreview = onRequest(async (req, res) => {
  const pathMatch = req.path.match(/\/listing\/([^/?]+)/);
  const id = (pathMatch && pathMatch[1]) || req.query.id;

  res.set('Cache-Control', 'public, max-age=300, s-maxage=600');

  if (!id) {
    res.status(400).send(renderNotFoundPage());
    return;
  }

  try {
    const snap = await admin.firestore().collection('marketplaceListings').doc(String(id)).get();
    if (!snap.exists) {
      res.status(404).send(renderNotFoundPage());
      return;
    }
    res.status(200).send(renderListingPage(snap.data(), snap.id, req.originalUrl));
  } catch (err) {
    res.status(500).send(renderNotFoundPage());
  }
});
