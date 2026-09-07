# Google Maps setup for MySheba

This covers the Maps/Places/Geocoding integration added across Accommodation,
Buy & Sell, Local Services, Community Events, and Business Directory.

## 1. Google Cloud Console

In the same (or a new) Google Cloud project:

1. Enable these three APIs:
   - **Maps SDK for Android**
   - **Places API**
   - **Geocoding API**
2. Create an API key (or reuse one), then **restrict** it:
   - Application restriction: Android apps → package name `com.satulink.mysheba`
     + your release keystore's SHA-1 fingerprint (`eas credentials` shows it,
     or `keytool -list -v -keystore your.keystore`).
   - API restriction: limit the key to the 3 APIs above.
3. Billing must be enabled on the project - all three APIs are pay-as-you-go
   past their free monthly credit (Places Autocomplete is the one to watch;
   it's per-keystroke-session, not per-character).

> Android needs one key (Maps SDK + Places + Geocoding all go through it).
> If you ever add iOS, `app.config.js` already wires the same key into
> `ios.config.googleMapsApiKey` too - no extra key needed unless you want
> to restrict Android/iOS separately.

## 2. Give the key to the app

Same pattern as `GOOGLE_SERVICES_JSON` already uses - **do not** commit the
real key into `app.json`, it's already gitignored-style via `app.config.js`
env override:

**Local development:**
```bash
GOOGLE_MAPS_API_KEY=AIzaSy... npx expo run:android
```
or drop it in a `.env` file your shell loads before `expo start`.

**EAS Build:**
```bash
eas env:create --name GOOGLE_MAPS_API_KEY --value AIzaSy... --environment production
```
(repeat for `preview`/`development` environments if you use them.)

Once set, `app.config.js` injects it into `android.config.googleMaps.apiKey`,
`ios.config.googleMapsApiKey`, and `extra.googleMapsApiKey` (the last one is
what `LocationPickerModal.js` reads at runtime via `expo-constants` for the
Places Autocomplete/Details/Geocoding REST calls).

## 3. Rebuild required

`react-native-maps` and `expo-location` are native modules - a JS-only
reload won't pick them up. After `npm install`:
```bash
npx expo prebuild --clean
npx expo run:android
```
(or a fresh EAS build). Your existing dev client build won't have these
modules until you rebuild it.

## 4. What was added

| Area | File(s) | What changed |
|---|---|---|
| Shared picker | `src/components/LocationPickerModal.js` | Full-screen Places Autocomplete search + drag-pin map, "use current location" |
| Shared field | `src/components/LocationField.js` | Tappable form field wrapping the picker, drop-in replacement for the old text `Location` input |
| Shared preview | `src/components/MapPreview.js` | Small read-only map on detail screens, tap → opens native Maps app for directions |
| Geo utils | `src/utils/geo.js` | `computeGeohash`, `filterByDistance`, `formatDistance` (geofire-common) |
| Create screens | `CreatePropertyScreen`, `CreateListingScreen`, `CreateServiceScreen`, `CreateCommunityPostScreen` | Text `Location` input → `LocationField`; saves `latitude`/`longitude` |
| Detail screens | `PropertyDetailScreen`, `ListingDetailScreen`, `ServiceProviderDetailScreen`, `CommunityPostDetailScreen`, `BusinessProfileScreen` | Show `MapPreview` when coords exist |
| Home feeds | `AccommodationHomeScreen`, `MarketplaceHomeScreen`, `ServiceProvidersHomeScreen`, `CommunityHomeScreen` | "📍 Nearby" toggle - gets GPS position, sorts by distance within 50 km, shows "X km away" on cards |
| Firestore writes | `accommodationService.createProperty`, `marketplaceService.createListing`, `serviceProviderService.createProvider`, `communityService.createPost` | Now store `latitude`, `longitude`, `geohash` alongside the existing text `location`/`serviceArea` field |
| Business Directory | `BusinessProfileScreen` | Owner can now set a business location (map picker) in addition to name/category/description; stored via existing `updateBusinessDetails` (no service change needed) |
| Config | `app.json`, `app.config.js`, `package.json` | Location permissions, Maps API key wiring, `react-native-maps` / `expo-location` / `geofire-common` deps |

## 5. Notes / limitations

- **Existing listings/properties/providers/posts created before this change
  have no `latitude`/`longitude`** - they'll show their old text location
  but no map, and won't appear in "Nearby" results. There's no backfill
  script; owners need to re-set location via the edit flow to get a pin
  (Accommodation/Marketplace/Services edit screens currently don't expose
  the location field for editing existing items - only creation. Say the
  word if you want that added too.)
- "Nearby" radius is hardcoded to 50 km (`NEARBY_RADIUS_KM` in each Home
  screen) - easy constant to change per module if you want different radii
  for, say, Local Services vs Accommodation.
- The Places Autocomplete call is restricted to `components=country:my`
  (Malaysia) in `LocationPickerModal.js` - remove that if you ever need
  cross-border listings.
- No Cloud Functions changes were needed - geohash range queries run
  entirely client-side against Firestore.
