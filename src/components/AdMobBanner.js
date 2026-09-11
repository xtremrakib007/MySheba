import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Constants from 'expo-constants';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { AD_TYPES } from '../constants/adEnums';
import * as adControlsService from '../firebase/adControlsService';

// Google AdMob banner renderer. Super Admin controls remain the single gate:
// Global Ads -> Banner -> Google AdMob -> per-feature Banner.
// The default IDs are Google's official test IDs until production IDs are
// supplied in Expo config.
const extra = Constants.expoConfig?.extra || {};
const configuredBannerId = Platform.OS === 'ios'
  ? extra.admobIosBannerId
  : extra.admobAndroidBannerId;
const TEST_BANNER_ID = TestIds.ADAPTIVE_BANNER || TestIds.BANNER;

export default function AdMobBanner({ feature = 'home', style }) {
  const { adSettings, adFeatureControls } = useApp();
  const { colors } = useTheme();
  const featureControl = adFeatureControls?.[feature];

  const allowed =
    adControlsService.isGlobalAdTypeEnabled(adSettings, AD_TYPES.BANNER) &&
    adControlsService.isAdNetworkEnabled(adSettings, 'admob') &&
    adControlsService.isFeatureAdTypeEnabled(featureControl, AD_TYPES.BANNER);

  if (!allowed) return null;

  const unitId = __DEV__ ? TEST_BANNER_ID : (configuredBannerId || TEST_BANNER_ID);

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
