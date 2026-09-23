// PHASE 5 - MySheba Advertisement System - Ad Targeting Engine.
//
// USER TYPES - this file deliberately does NOT invent a new role
// vocabulary. It re-declares (does not import) the exact same role
// strings this app's auth/profile system already uses everywhere else
// (users/{uid}.role, written only by self-registration ['customer'] or a
// superadmin-only Cloud Function - see firestore.rules and
// functions/userManagement.js), matching the list
// src/firebase/featureAccessService.js's TOGGLEABLE_ROLES + 'customer' +
// 'superadmin' already uses. A plain re-declaration (not a re-export)
// because featureAccessService.js's TOGGLEABLE_ROLES intentionally
// excludes 'customer'/'superadmin' for its own reasons (see that file) -
// ad targeting needs all five, since an ad can legitimately be aimed at
// customers specifically, or at staff-facing roles.
//
// Advertisement.targetUserTypes (src/types/ads.ts) stores these as plain
// strings, not a hard enum dependency - see that field's own comment.
export const AD_USER_TYPES = {
  CUSTOMER: 'customer',
  DEALER: 'dealer',
  RESELLER: 'reseller',
  ADMIN: 'admin',
  SUPERADMIN: 'superadmin',
};

export const AD_USER_TYPE_LIST = [
  AD_USER_TYPES.CUSTOMER,
  AD_USER_TYPES.DEALER,
  AD_USER_TYPES.RESELLER,
  AD_USER_TYPES.ADMIN,
  AD_USER_TYPES.SUPERADMIN,
];

export const AD_USER_TYPE_LABELS = {
  [AD_USER_TYPES.CUSTOMER]: 'Customer',
  [AD_USER_TYPES.DEALER]: 'Dealer',
  [AD_USER_TYPES.RESELLER]: 'Reseller',
  [AD_USER_TYPES.ADMIN]: 'Admin',
  [AD_USER_TYPES.SUPERADMIN]: 'Super Admin',
};

// GEO TARGETING - country/state/city/area/outlet.
//
// Country has a real, existing data source in this app (src/data/countries.js
// - the same list Remittance/Recharge already use), so the targeting UI
// reuses it directly rather than duplicating country codes here.
//
// State/City/Area/Outlet deliberately do NOT get a fixed dataset: nothing
// in MySheba today models a user's state/city/area or an "outlet" (no
// users/{uid} field, no outlets/{id} collection anywhere in this app -
// see this file's PHASE 5 audit notes). Advertisement.targetStates/
// targetCities/targetAreas/targetOutlets are plain string[] for exactly
// this reason (see src/types/ads.ts). The admin targeting UI therefore
// offers these as free-text tag pickers (type a value, add it as a chip)
// rather than a picklist - see TagMultiSelect.js. Whatever strings an
// admin enters here only ever match if a later caller's AdTargetingContext
// happens to carry the same string for that dimension - since no such
// context source exists in this app yet, setting these fields has no
// visible effect today, exactly like targetCountries would have no effect
// before this same phase wired country matching into the app's own
// context builder in SmartAd.js. This is intentional: the matching engine
// (adTargetingService.js) is fully general-purpose so the current ad pipeline that
// DOES add real state/city/area/outlet data to a user's profile only has
// to start populating AdTargetingContext with it - no change needed here
// or in the matching logic itself.
