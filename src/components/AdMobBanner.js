import React from 'react';
import { View, StyleSheet } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { AD_TYPES } from '../constants/adEnums';
import * as adControlsService from '../firebase/adControlsService';

// Google AdMob banner renderer. It is deliberately gated by the same
// Global Ads + format + per-feature controls used by SmartAd, so Super
// Admin can turn AdMob off globally or for a specific feature without
// disabling the feature itself.
//
// Until a real AdMob App ID / banner unit is supplied, Google test IDs are
// used. These are safe for development and must be replaced before the
// production monetization build.
const ANDROID_BANNER_TEST_ID = TestIds.ADAPTIVE_BANNER || TestIds.BANNER;
const IOS_BANNER_TEST_ID = TestIds.ADAPTIVE_BANNER || TestIds.BANNER;

export default function AdMobBanner({ feature = 'home', style }) {
  const { adSettings, adFeatureControls } = useApp();
  const { colors } = useTheme();
  const featureControl = adFeatureControls?.[feature];

  const allowed =
    adControlsService.isGlobalAdTypeEnabled(adSettings, AD_TYPES.BANNER) &&
    adControlsService.isAdNetworkEnabled(adSettings, 'admob') &&
    adControlsService.isFeatureAdTypeEnabled(featureControl, AD_TYPES.BANNER);

  if (!allowed) return null;

  const unitId = __DEV__
    ? (ANDROID_BANNER_TEST_ID || IOS_BANNER_TEST_ID)
    : (globalThis.__MY_SHEBA_ADMOB_BANNER_ID__ || ANDROID_BANNER_TEST_ID);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }, style]}>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdFailedToLoad={() => {}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    overflow: 'hidden',
  },
});
