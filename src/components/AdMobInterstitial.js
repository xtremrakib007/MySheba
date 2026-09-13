import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { InterstitialAd, AdEventType, TestIds } from 'react-native-google-mobile-ads';
import { AD_TYPES } from '../constants/adEnums';
import * as adControlsService from '../firebase/adControlsService';
import * as adTrackingService from '../firebase/adTrackingService';

const extra = Constants.expoConfig?.extra || {};
const configuredUnitId = Platform.OS === 'android' ? extra.admobAndroidInterstitialId : '';
const TEST_UNIT_ID = TestIds.INTERSTITIAL;

/**
 * Shows one Google AdMob interstitial and always resolves, even when the ad
 * cannot load/show. The caller can therefore continue to the requested
 * MySheba feature without ever being blocked by advertising infrastructure.
 *
 * `feature` must match an AdFeatureControlsScreen feature id. Super Admin's
 * global AdMob/interstitial switches, per-feature interstitial switch and
 * hourly frequency cap are all respected here.
 */
export async function showAdMobInterstitial({ feature, adSettings, adFeatureControls } = {}) {
  const featureControl = adFeatureControls?.[feature];
  const allowed =
    adControlsService.isGlobalAdTypeEnabled(adSettings, AD_TYPES.INTERSTITIAL) &&
    adControlsService.isAdNetworkEnabled(adSettings, 'admob') &&
    adControlsService.isFeatureAdTypeEnabled(featureControl, AD_TYPES.INTERSTITIAL);

  if (!allowed) return false;

  const maxPerHour = Number(adSettings?.maxInterstitialsPerUserPerHour ?? 3);
  const underCap = await adTrackingService.canShowInterstitial(maxPerHour).catch(() => true);
  if (!underCap) return false;

  const unitId = __DEV__ ? TEST_UNIT_ID : configuredUnitId;
  if (!unitId) return false;

  return new Promise((resolve) => {
    let settled = false;
    let ad;
    const finish = (shown) => {
      if (settled) return;
      settled = true;
      resolve(Boolean(shown));
    };

    try {
      ad = InterstitialAd.createForAdRequest(unitId, {
        requestNonPersonalizedAdsOnly: true,
      });
      const unsubLoaded = ad.addAdEventListener(AdEventType.LOADED, async () => {
        try {
          await ad.show();
        } catch (_) {
          finish(false);
        }
      });
      const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
        unsubLoaded();
        unsubClosed();
        unsubError();
        // The impression is recorded by this native interstitial path so the
        // hourly cap remains effective for subsequent feature launches.
        // There is no ad document id for a network ad, so use the fixed
        // provider/unit identifier as the tracking key.
        adTrackingService.recordImpression({
          adId: unitId,
          campaignId: 'admob',
          placementId: `interstitial:${feature || 'unknown'}`,
          feature: feature || 'unknown',
        }, AD_TYPES.INTERSTITIAL).catch(() => {});
        finish(true);
      });
      const unsubError = ad.addAdEventListener(AdEventType.ERROR, () => {
        unsubLoaded();
        unsubClosed();
        unsubError();
        finish(false);
      });
      ad.load();
    } catch (_) {
      finish(false);
    }
  });
}
