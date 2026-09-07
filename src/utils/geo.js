// Shared geolocation helpers used across Accommodation, Marketplace,
// Local Services, Community Events, and Business Directory.
//
// Firestore has no native "find things within N km" query, so every
// location-bearing doc also stores a `geohash` string (via geofire-common).
// To find nearby docs we compute the set of geohash ranges that cover a
// bounding circle (geohashQueryBounds), run one Firestore query per range
// ordered by geohash, then do a client-side haversine distance check to
// throw out the false positives the bounding-box approach lets through.
//
// Usage pattern in a screen:
//   const center = [lat, lng];
//   const radiusInM = 10 * 1000;
//   const bounds = geohashQueryBounds(center, radiusInM);
//   const snaps = await Promise.all(bounds.map(([start, end]) =>
//     getDocs(query(collection(db, 'serviceProviders'), orderBy('geohash'), startAt(start), endAt(end)))
//   ));
//   const docs = snaps.flatMap(s => s.docs.map(d => ({ id: d.id, ...d.data() })));
//   const nearby = filterByDistance(docs, center, radiusInM / 1000);
import { geohashForLocation, geohashQueryBounds, distanceBetween } from 'geofire-common';

/** Computes a geohash string for a lat/lng pair - call this before saving
 * any doc that has latitude/longitude so it's queryable by proximity. */
export function computeGeohash(latitude, longitude) {
  if (latitude == null || longitude == null) return null;
  return geohashForLocation([Number(latitude), Number(longitude)]);
}

/** Returns the list of [start, end] geohash string ranges that cover a
 * circle of `radiusInM` meters around `center` ([lat, lng]). Run one
 * Firestore range query per pair (see usage above). */
export { geohashQueryBounds };

/** Haversine distance in km between two [lat, lng] points. */
export function distanceKm(a, b) {
  return distanceBetween(a, b);
}

/** Filters+sorts a list of docs (each with latitude/longitude fields) to
 * those within `radiusKm` of `center`, nearest first. Also attaches a
 * `_distanceKm` field to each doc for display ("2.3 km away"). Needed
 * because geohash range queries return a superset (the bounding box is
 * bigger than the circle) - this is the client-side correction step. */
export function filterByDistance(docs, center, radiusKm) {
  return docs
    .filter((d) => d.latitude != null && d.longitude != null)
    .map((d) => ({ ...d, _distanceKm: distanceBetween(center, [Number(d.latitude), Number(d.longitude)]) }))
    .filter((d) => d._distanceKm <= radiusKm)
    .sort((a, b) => a._distanceKm - b._distanceKm);
}

/** Formats a distance in km for display, e.g. "450 m away" / "3.2 km away". */
export function formatDistance(km) {
  if (km == null) return '';
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  return `${km.toFixed(1)} km away`;
}
