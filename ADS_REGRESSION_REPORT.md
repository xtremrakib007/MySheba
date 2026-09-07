# §7 Ads Regression Pass — MySheba Next Update PRD

## What this covers
The PRD's own §10/§12 call for a full Ads regression pass before shipping,
to confirm the Country/Region homepage (§2) and Social Feed (§3) deltas
haven't broken, duplicated, or mistargeted the existing ad system. This
runs that pass.

## Automated test suite — run, not just reviewed
The ad system ships its own acceptance tests as plain Node scripts, each
requiring the actual production matching/rotation/tracking/analytics/
payment-status code (not a re-implementation), so a pass here means the
code the app really runs at render/charge time was exercised:

| Suite | Covers | Result |
|---|---|---|
| `scripts/phase5-ad-targeting-tests.js` | Targeting engine: country/state/city/area/outlet/userType/language, placement, schedule, legacy feature-only ads | 29/29 passed |
| `scripts/phase6-campaign-scheduling-tests.js` | Rotation ceiling, frequency/click/interstitial caps, schedule windows | 36/36 passed |
| `scripts/phase7-ad-tracking-tests.js` | Impression/click dedup cooldowns, banner click types, multi-user/multi-placement isolation | 14/14 passed |
| `scripts/phase8-ad-analytics-tests.js` | Totals vs raw tracking data, report grouping/sorting, zero-activity handling | 26/26 passed |
| `scripts/phase10-ad-packages-payments-tests.js` | Payment status transitions, confirms `walletService.js` exports untouched | 37/37 passed |

**142/142 passed, 0 failures.**

## Manual checks specific to this delta batch
| PRD §7 requirement | Finding |
|---|---|
| Preserve advertiser/package-payment/targeting/banner/tracking | Confirmed by the full suite above — none of `adService.js`, `adControlsService.js`, `adTargetingService.js`, `adTrackingService.js`, `adRotationService.js`, `adAnalyticsService.js`, or the ad screens were touched by the country-homepage or Social Feed deltas (not in either delta's own file list, and the tests against the live code still pass) |
| Country/region targeting must not break existing ad rules | Test suite exercises `targetCountries` matching directly (`ctx.country` vs `ad.targetCountries`) — 29/29 pass, including the "wrong country alone fails the whole ad" and fail-closed-on-missing-context cases |
| Ad controls respect Superadmin enable/disable | `adControlsService.js` (`canShowAd`, `isPlacementEnabled`) is unmodified by both deltas |
| Social feed/homepage changes don't duplicate, suppress, or mistarget ads | Checked `CustomerHomeScreen.js` and `SocialHomeScreen.js` directly: `SmartAd` `HOME_TOP`/`HOME_MIDDLE`/`HOME_BOTTOM` (same `feature="home"`) appear exactly once each in both, unconditionally — never gated behind `modules.showSocialFeed`/`showCommunityFeed`/`showBanners`/`showServices`, so disabling a homepage module never removes an ad slot. The two screens are mutually exclusive (`CustomerHomeScreen` returns `<SocialHomeScreen />` early for non-Malaysia accounts per `homepageConfigService.getHomepageModules`), so no double-mount/duplicate impression risk. Pre-existing accounts with no `country` set resolve to the Malaysia layout unchanged. |
| Track impressions/clicks per current implementation/privacy | Tracking code path unmodified; confirmed by the phase7 suite |

## Not run
No Metro bundle or device/emulator run — same standing caveat as every
other audit in this thread. The Node-level suite above is a real
production-logic regression test, but it isn't a substitute for an actual
app run through the ad placements on device.

## Overall PRD status
All items in `MySheba_Next_Update_PRD.docx` are now built and verified:
§2 Country/Region homepage, §3 Social Feed, §4 Game Point Gifting, §5
International Wallet/MYR Exchange, §6 API Provider Management (config
layer, honestly scoped — see `API_PROVIDER_MANAGEMENT.md`), and §7 Ads
regression (this report). Per §11's acceptance criteria, the release ZIP
is ready to package with this report and `SOCIAL_FEED_AUDIT.md` as the
accompanying regression documentation.
