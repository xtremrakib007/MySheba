import React, { memo, useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import mobileAds, { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { useApp } from '../context/AppContext';
import { ADMOB_AD_UNITS } from '../constants/adMobUnits';

let sdkInitPromise;

function ensureAdMobInitialized() {
  if (!sdkInitPromise) sdkInitPromise = mobileAds().initialize().catch(() => null);
  return sdkInitPromise;
}

function GoogleAdMobBanner({ placementType = 'screen', placementKey = '' }) {
  const { adSettings } = useApp();
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    let mounted = true;
    ensureAdMobInitialized().then(() => { if (mounted) setSdkReady(true); });
    return () => { mounted = false; };
  }, []);

  // Android-only restore: iOS is intentionally untouched.
  if (Platform.OS !== 'android' || !sdkReady) return null;

  // Keep the existing Superadmin ad controls authoritative. Defaults are
  // enabled, so the banner remains visible until an admin explicitly turns
  // the relevant switch off.
  const enabled =
    adSettings?.adsEnabled !== false &&
    adSettings?.admobEnabled !== false &&
    adSettings?.admobBannerEnabled !== false &&
    adSettings?.bannerAdsEnabled !== false;

  if (!enabled) return null;

  const controls = adSettings?.placementControls || {};
  const screenControl = controls.screenBanners?.[placementKey];
  const webviewControl = controls.webviewBanners?.[placementKey];
  const configured = placementType === 'webview'
    ? (webviewControl || { enabled: controls.webviewBannerEnabled !== false, position: controls.webviewBannerPosition === 'top' ? 'top' : 'bottom' })
    : (screenControl || { enabled: true, position: 'bottom' });
  if (configured.enabled === false) return null;

  const unitId = __DEV__ ? TestIds.BANNER : ADMOB_AD_UNITS.primary;

  return (
    <View style={[styles.container, configured.position === 'top' ? styles.top : styles.bottom]} collapsable={false}>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdFailedToLoad={() => {}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  top: { marginBottom: 2 },
  bottom: { marginTop: 2 },
});

export default memo(GoogleAdMobBanner);
