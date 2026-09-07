// Builds the text every "share this listing" button uses, so the URL
// format and caption wording only live in one place.
//
// PUBLIC_BASE_URL points at the mysheba.top public preview page (see
// functions/listingPreview.js + firebase.json's hosting rewrite). That page
// is what makes the link actually mean something to someone who doesn't
// have the app yet - it shows the photo/price/title and a "Get the App"
// button, and gives Facebook/WhatsApp/Twitter something real to build a
// link-preview card from (og:title/og:image/etc).
//
// NOTE: mysheba.top has to be connected to this Firebase project as a
// custom Hosting domain (Firebase Console -> Hosting -> Add custom domain)
// before these links resolve - see the deploy README.
const PUBLIC_BASE_URL = 'https://mysheba.top';

export function getListingShareUrl(listingId) {
  return `${PUBLIC_BASE_URL}/listing/${listingId}`;
}

/** Plain-text caption used by targets that accept a message separately from the url (WhatsApp, X, the generic share sheet, Instagram-feed's copy-caption flow). */
export function getListingShareCaption(listing) {
  const price = `MYR ${Number(listing?.price || 0).toFixed(2)}${listing?.negotiable ? ' (Negotiable)' : ''}`;
  const location = listing?.location ? `\n📍 ${listing.location}` : '';
  return `${listing?.title || 'Check this out'}\n\n${price}${location}\n\nOn MySheba Marketplace!`;
}

/** First photo, if any - used as the background image for Instagram/Facebook Story sharing. */
export function getListingShareImage(listing) {
  return Array.isArray(listing?.images) && listing.images.length > 0 ? listing.images[0] : null;
}
