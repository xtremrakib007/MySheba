# Web update: /listing/{id} redirect to the app's preview page

## Why
The app's deep-link share feature (already merged in `mysheba-app-final`)
serves the actual "Open in MySheba App" preview page for a shared listing
from `functions/listingPreview.js` **in the app's own Firebase project**
(`satulink-solutions`), with a `/listing/**` Hosting rewrite pointed at it
there. But `mysheba.top` — the domain shared listing links actually use —
is owned by *this* project (`mysheba2`), which had no `/listing/**` route
at all. A shared `https://mysheba.top/listing/<id>` link would 404.

## What was added
- **`firebase.json`** — new `/listing/**` rewrite, alongside the existing
  `/api/contact` one, pointed at a new `listingRedirect` function
  (same `asia-southeast1` region as `submitContact`).
- **`functions/index.js`** — `exports.listingRedirect`: parses the `id` off
  `req.path` and issues a `302` redirect to
  `https://satulink-solutions.web.app/listing/{id}` — the app project's own
  default Hosting URL, which already has its own `/listing/**` rewrite to
  the real `listingPreview` function (the one with the actual Firestore
  listing data, OG tags, and the `mysheba://listing/{id}` app-open button).

## Why a redirect instead of duplicating the preview logic here
Rendering the real preview page here would mean re-implementing
`listingPreview.js` a second time *and* giving this project (`mysheba2`)
read access to the `listings` collection in the app's project
(`satulink-solutions`) — a service-account key for a second project,
stored as a secret here, for a page whose actual data already lives there.
A redirect avoids all of that: one function, no cross-project credentials,
no duplicated business logic to keep in sync.

## Trade-off (read before treating this as final)
Link-preview crawlers (Facebook/WhatsApp/Telegram/etc.) generally do follow
a 302 and pull Open Graph tags from the final URL, so the shared-link
preview card itself should still render correctly. What you lose is the
address bar: once someone taps the link, it'll end up on
`satulink-solutions.web.app/listing/{id}`, not `mysheba.top/listing/{id}`.
If keeping `mysheba.top` in the URL bar matters, that needs the other
option discussed (connecting `mysheba.top` to the app project's Hosting
directly) instead of this redirect — bigger change, not done here.

## One assumption to confirm before deploying
This assumes the app project's default Hosting URL is
`https://satulink-solutions.web.app` (the standard `<project-id>.web.app`
Firebase convention — the project ID is `satulink-solutions`, confirmed
from `src/firebase/config.js`). If a custom Hosting site name was set up
for that project instead of the default, update `APP_HOSTING_ORIGIN` in
`functions/index.js` to match before deploying.

## Verified
- `node --check functions/index.js` passes.
- `firebase.json` is valid JSON.
- Not run (no Firebase CLI/emulator in this environment): an actual
  `firebase deploy --only hosting,functions:listingRedirect` or a live
  request against a deployed `mysheba.top/listing/<id>` URL. Test that
  before considering this done.
