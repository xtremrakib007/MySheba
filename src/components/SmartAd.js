import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, StyleSheet, Linking, Dimensions } from 'react-native';
import { useApp } from '../context/AppContext';
import { useLanguage } from '../i18n/LanguageContext';
import AdBannerPreview from './AdBannerPreview';
import * as adService from '../firebase/adService';
import * as adControlsService from '../firebase/adControlsService';
import * as adTargetingService from '../firebase/adTargetingService';
import * as adRotationService from '../firebase/adRotationService';
import * as adTrackingService from '../firebase/adTrackingService';
import { AD_TYPES, CLICK_ACTION_TYPES } from '../constants/adEnums';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SLIDE_WIDTH = Math.min(SCREEN_WIDTH, 480);
const ROTATE_MS = 4000;

// PHASE 4 - MySheba Advertisement System.
// PHASE 6 - CAMPAIGN SCHEDULING AND ROTATION. See each PHASE 6-tagged
// block below for what's new (placement-enabled gate, frequency capping,
// interstitial hourly cap); the six-step shape below is unchanged, PHASE
// 6 just adds sub-checks inside steps 1-2 and 5-6.
//
// The one component every feature places an ad through:
//
//   <SmartAd placement="RECHARGE_TOP" feature="mobile_recharge" />
//
// Six steps, run in order, any one of which can end in "render nothing":
//   1. Check Global Controls for this adType (ad_settings/general).
//   2. Check this feature's own controls (ad_feature_controls/{feature})
//      and this placement's own config (ad_placements/{placement}.enabled
//      - PHASE 6).
//   3. Check ad type/network - format-level above, per-candidate network
//      check once ads are in hand (see canShowAd below).
//   4. Request eligible ads for this placement (live Firestore listener,
//      adService.subscribeAdvertisementsByPlacement).
//   5. Pick which one(s) to display (adRotationService) after narrowing
//      by targeting (adTargetingService) and dropping any ad already at
//      its per-user daily impression cap (PHASE 6 - adTrackingService).
//   6. Display it - always through AdBannerPreview, so the "banner is
//      image-only, no admin text ever rendered" rule holds by
//      construction rather than by every call site remembering it. An
//      interstitial additionally checks the per-user hourly interstitial
//      cap before ever rendering (PHASE 6).
//
// FAILURE RULE: this component never blocks its host screen. It has no
// loading state of its own - it renders null until (if ever) an ad
// resolves, so a slow, offline, or errored ad listener never delays
// anything else on the page; the feature around it is already fully
// interactive the instant it mounts, ad or no ad, and stays that way
// regardless of what happens here. Every Firestore listener below is
// wired to fail silent (its onError just empties the ad list) - a broken
// ad config can never surface as a broken feature, and "offline" is
// handled the same way as any other non-resolving listener: nothing here
// ever waits for it, so there's nothing that needs a special offline
// check.
//
// `adType` defaults to 'banner' - the only ad type with a real creative
// pipeline so far (adService.uploadBannerCreative); native/interstitial
// stay dormant until a later phase implements their own upload + render
// path, at which point a call site can pass adType explicitly.
//
// PHASE 5 - the AdTargetingContext this component builds now carries
// userType and language in addition to placement/feature:
//   - userType comes from AppContext's `profile.role` - a live listener
//     on users/{uid}, a field firestore.rules blocks the signed-in user
//     from writing themselves (see adTargetingService.js's SECURITY
//     note) - never from anything this component could be passed as a
//     prop, so a screen can't accidentally (or deliberately) spoof it.
//   - language comes from useLanguage()'s current app language.
// country/state/city/area/outletId are left undefined - nothing in this
// app's user profile models them yet (see src/constants/adTargeting.js's
// GEO TARGETING note), so any ad that restricts on those dimensions
// simply won't match anyone yet, exactly the same "not implemented on
// the data side, but the matching logic is already correct and ready"
// state targetCountries/etc. were in before this phase for every
// dimension.
export default function SmartAd({ placement, feature, adType = AD_TYPES.BANNER, height = 120, style }) {
  const { adSettings, adFeatureControls, adCampaignsById, profile } = useApp();
  const { language } = useLanguage();
  const featureControl = adFeatureControls?.[feature];
  const userType = profile?.role;

  // ---- steps 1-2: Global Controls + this feature's own controls,
  // format-level only. False here means "don't even ask Firestore for
  // ads" - a fully-disabled feature/format never opens a listener. ----
  const typeGateOpen = !!placement && !!feature
    && adControlsService.isGlobalAdTypeEnabled(adSettings, adType)
    && adControlsService.isFeatureAdTypeEnabled(featureControl, adType);

  const [rawAds, setRawAds] = useState([]);
  // PHASE 6 - "placement is enabled" (STATUS AUTOMATION section) needs
  // this placement's own ad_placements/{placement} doc, which also
  // carries maxConcurrentAds for the rotation cap (see adRotationService).
  const [placementConfig, setPlacementConfig] = useState(null);
  // PHASE 6 - FREQUENCY. Ad ids this user has already hit
  // maxImpressionsPerUser/day for - filtered out of rotation entirely
  // (not just "stop counting", the FREQUENCY section's whole point is the
  // ad stops being SHOWN once its cap is hit).
  const [cappedAdIds, setCappedAdIds] = useState(() => new Set());
  // PHASE 6 - interstitials are gated as a whole format, not per-ad (see
  // adTrackingService.canShowInterstitial's header comment). Defaults to
  // true (not capped) so a non-interstitial placement - the overwhelming
  // majority of SmartAd usages - never waits on an hourly-cap check it
  // doesn't need; only flips to false once an interstitial's own check
  // resolves negative.
  const [interstitialAllowed, setInterstitialAllowed] = useState(true);

  // ---- step 4: request eligible ads for this placement. ----
  useEffect(() => {
    if (!typeGateOpen) {
      setRawAds([]);
      return undefined;
    }
    let cancelled = false;
    const unsub = adService.subscribeAdvertisementsByPlacement(
      placement,
      (ads) => { if (!cancelled) setRawAds(ads); },
      () => { if (!cancelled) setRawAds([]); } // fail silent - see FAILURE RULE above
    );
    return () => { cancelled = true; unsub && unsub(); };
  }, [placement, typeGateOpen]);

  // PHASE 6 - this placement's own config (enabled + maxConcurrentAds).
  // Same fail-silent posture as the ads listener above: an error here
  // must never block the feature, so it falls back to "enabled, default
  // rotation cap" (adControlsService.isPlacementEnabled/adRotationRules'
  // rotationCap both already treat a missing config the same way).
  useEffect(() => {
    if (!typeGateOpen) {
      setPlacementConfig(null);
      return undefined;
    }
    let cancelled = false;
    const unsub = adService.subscribePlacement(
      placement,
      (config) => { if (!cancelled) setPlacementConfig(config); },
      () => { if (!cancelled) setPlacementConfig(null); }
    );
    return () => { cancelled = true; unsub && unsub(); };
  }, [placement, typeGateOpen]);

  // ---- step 3 (per-candidate) + step 5: narrow to ads that actually
  // match this feature/placement, are still effectively active
  // (schedule-aware), pass every PHASE 5 targeting dimension (geo/user
  // type/language, in addition to feature), and pass their own
  // network's Global Controls switch - then pick which of what's left to
  // show. adTargetingService.getEligibleAds is the single consolidated
  // call for all of this (see its own header comment for the full
  // ordered list of checks it runs). PHASE 6 additionally drops any ad
  // already at its daily impression cap (cappedAdIds) before rotation
  // picks from what's left. ----
  const displayAds = useMemo(() => {
    if (!typeGateOpen || rawAds.length === 0) return [];
    const context = { placementId: placement, featureId: feature, userType, language };
    const eligible = adTargetingService
      .getEligibleAds(rawAds, { context, adSettings, featureControl, placementConfig, adType, campaignsById: adCampaignsById })
      .filter((ad) => !cappedAdIds.has(ad.id));
    return adRotationService.getRotationForPlacement(placement, eligible, placementConfig);
  }, [typeGateOpen, rawAds, placement, feature, adType, adSettings, featureControl, placementConfig, cappedAdIds, userType, language, adCampaignsById]);

  // PHASE 6 - FREQUENCY: check each rotation candidate's own
  // maxImpressionsPerUser/day cap once the candidate set changes, and
  // drop any that are already maxed out for today. Runs against
  // displayAds (post-targeting/rotation) rather than every rawAd, so a
  // placement with many candidates only pays for count-query checks on
  // the handful actually about to be shown.
  useEffect(() => {
    if (displayAds.length === 0) return undefined;
    let cancelled = false;
    (async () => {
      const newlyCapped = [];
      for (const ad of displayAds) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await adTrackingService.canShowImpression(ad.id, ad.maxImpressionsPerUser);
        if (!ok) newlyCapped.push(ad.id);
      }
      if (!cancelled && newlyCapped.length > 0) {
        setCappedAdIds((prev) => {
          const next = new Set(prev);
          newlyCapped.forEach((id) => next.add(id));
          return next;
        });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayAds.map((ad) => ad.id).join(',')]);

  // PHASE 6 - FREQUENCY: interstitials are gated as a whole format
  // (AdSettings.maxInterstitialsPerUserPerHour), checked once per mount/
  // adSettings change rather than per-candidate.
  useEffect(() => {
    if (adType !== AD_TYPES.INTERSTITIAL || !typeGateOpen) {
      setInterstitialAllowed(true);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const ok = await adTrackingService.canShowInterstitial(adSettings?.maxInterstitialsPerUserPerHour);
      if (!cancelled) setInterstitialAllowed(ok);
    })();
    return () => { cancelled = true; };
  }, [adType, typeGateOpen, adSettings?.maxInterstitialsPerUserPerHour]);

  // ---- step 6: nothing to show - true whenever ads are off, this
  // feature/format is off, this placement is disabled, the interstitial
  // hourly cap is hit, or there's simply no eligible/uncapped ad right
  // now. The host screen never knows or cares which. ----
  if (!interstitialAllowed || displayAds.length === 0) return null;

  return <AdRotator ads={displayAds} placementId={placement} feature={feature} adType={adType} height={height} style={style} />;
}

// Renders one ad, or - when a placement has more than one eligible ad -
// an auto-rotating carousel between them (per the brief's HOME section:
// "If multiple banners exist, support carousel/rotation"). Mirrors
// BannerSlider.js's own rotate-every-few-seconds/dots pattern so a
// SmartAd placement and the older Home banner slider behave consistently
// to the person using the app, even though they're two separate systems
// (see adService.js's header comment on that separation).
function AdRotator({ ads, placementId, feature, adType, height, style }) {
  const [index, setIndex] = useState(0);
  const scrollRef = useRef(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (index >= ads.length) setIndex(0);
  }, [ads.length, index]);

  useEffect(() => {
    if (ads.length < 2) return undefined;
    const id = setInterval(() => {
      if (pausedRef.current) return;
      setIndex((i) => {
        const next = (i + 1) % ads.length;
        scrollRef.current?.scrollTo({ x: next * SLIDE_WIDTH, animated: true });
        return next;
      });
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [ads.length]);

  const activeAd = ads[index] || ads[0];

  // One impression per ad actually shown, not per render - fires again
  // only when the visible ad changes (rotation advancing) or the
  // eligible-ad list itself changes. Fire-and-forget, never throws - see
  // adTrackingService.recordImpression's own header comment. PHASE 7 -
  // recordImpression itself additionally guards against a component
  // REMOUNT re-firing this same effect for the same ad a moment later
  // (see that file's DUPLICATE PROTECTION section); this effect's own
  // activeAd.id dependency only ever protected against re-renders.
  useEffect(() => {
    if (!activeAd) return;
    adTrackingService.recordImpression({
      adId: activeAd.id,
      campaignId: activeAd.campaignId || null,
      placementId,
      feature,
    }, adType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAd?.id, placementId, feature, adType]);

  // PHASE 6 - FREQUENCY: "Maximum clicks per user/day". Checked
  // fire-and-forget alongside the click itself rather than blocking the
  // tap - a capped click should stop being COUNTED (so an advertiser
  // isn't charged/attributed past what they paid for), not stop the
  // person's tap from doing anything; the click action still runs either
  // way (see performClickAction below), same "never break the feature"
  // posture the rest of this file already holds ad tracking to.
  const onPressAd = (ad) => {
    adTrackingService.canRecordClick(ad.id, ad.maxClicksPerUser).then((allowed) => {
      if (!allowed) return;
      adTrackingService.recordClick({
        adId: ad.id,
        campaignId: ad.campaignId || null,
        placementId,
        feature,
        clickAction: ad.clickAction,
      });
    });
    performClickAction(ad.clickAction);
  };

  const pressableFor = (ad) => (
    ad.clickAction && ad.clickAction.type !== CLICK_ACTION_TYPES.NONE && ad.clickAction.value
      ? () => onPressAd(ad)
      : undefined
  );

  if (ads.length === 1) {
    return <AdBannerPreview ad={activeAd} height={height} style={style} onPress={pressableFor(activeAd)} />;
  }

  const onScrollEnd = (e) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SLIDE_WIDTH);
    setIndex(i);
  };

  return (
    <View style={styles.rotatorContainer}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        onTouchStart={() => { pausedRef.current = true; }}
        onTouchEnd={() => { pausedRef.current = false; }}
      >
        {ads.map((ad) => (
          <View key={ad.id} style={{ width: SLIDE_WIDTH, alignItems: 'center' }}>
            <AdBannerPreview ad={ad} height={height} style={style} onPress={pressableFor(ad)} />
          </View>
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {ads.map((ad, i) => (
          <View key={ad.id} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

// Best-effort only, mirrors adTrackingService's own "never throw into the
// UI" trust model - a bad/unsupported click action should disappear
// quietly, not break the tap.
function performClickAction(clickAction) {
  if (!clickAction || clickAction.type === CLICK_ACTION_TYPES.NONE || !clickAction.value) return;
  try {
    if (clickAction.type === CLICK_ACTION_TYPES.URL) {
      Linking.openURL(clickAction.value).catch(() => {});
    } else if (clickAction.type === CLICK_ACTION_TYPES.PHONE) {
      Linking.openURL(`tel:${clickAction.value}`).catch(() => {});
    } else if (clickAction.type === CLICK_ACTION_TYPES.WHATSAPP) {
      const digits = String(clickAction.value).replace(/[^\d]/g, '');
      Linking.openURL(`https://wa.me/${digits}`).catch(() => {});
    }
    // CLICK_ACTION_TYPES.INTERNAL - what an in-app route/feature id
    // resolves to is a later-phase navigation concern (see ClickAction's
    // header comment in src/types/ads.ts) - left a deliberate no-op here
    // rather than guessing a screen key.
  } catch (e) {
    // never let a bad click action value throw into the UI
  }
}

const styles = StyleSheet.create({
  rotatorContainer: { paddingBottom: 2 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 6, paddingBottom: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D0D0D0' },
  dotActive: { backgroundColor: '#1A73E8', width: 20, borderRadius: 4 },
});
