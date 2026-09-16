# §7 Ads Regression Pass — MySheba Next Update PRD

## What this covers
The PRD's own §10/§12 call for a full Ads regression pass before shipping,
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
| Country/region targeting must not break existing ad rules | Test suite exercises `targetCountries` matching directly (`ctx.country` vs `ad.targetCountries`) — 29/29 pass, including the "wrong country alone fails the whole ad" and fail-closed-on-missing-context cases |
| Ad controls respect Superadmin enable/disable | `adControlsService.js` (`canShowAd`, `isPlacementEnabled`) is unmodified by both deltas |
| Track impressions/clicks per current implementation/privacy | Tracking code path unmodified; confirmed by the phase7 suite |

## Not run
No Metro bundle or device/emulator run — same standing caveat as every
other audit in this thread. The Node-level suite above is a real
production-logic regression test, but it isn't a substitute for an actual
app run through the ad placements on device.

## Overall PRD status
All items in `MySheba_Next_Update_PRD.docx` are now built and verified:
International Wallet/MYR Exchange, §6 API Provider Management (config
layer, honestly scoped — see `API_PROVIDER_MANAGEMENT.md`), and §7 Ads
regression (this report). Per §11's acceptance criteria, the release ZIP
is ready to package with this report and `SOCIAL_FEED_AUDIT.md` as the
accompanying regression documentation.
