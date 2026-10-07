import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  BannerAd,
  BannerAdSize,
  TestIds,
} from 'react-native-google-mobile-ads';
import { ADMOB_AD_UNITS } from '../constants/adMobUnits';
import {
  DEFAULT_AD_SETTINGS,
  subscribeAdSettings,
  isGlobalAdTypeEnabled,
  subscribeAdFeatureControls,
  isFeatureAdTypeEnabled,
} from '../firebase/adControlsService';
import { AD_TYPES } from '../constants/adEnums';
import { FEATURE_IDS } from '../constants/adFeatures';

const AD_UNIT_ID = __DEV__ ? TestIds.BANNER : ADMOB_AD_UNITS.primary;

export default function GoogleAdMobBanner() {
  const [adSettings, setAdSettings] = useState(DEFAULT_AD_SETTINGS);
  const [featureControls, setFeatureControls] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeAdSettings(
      setAdSettings,
      () => setAdSettings(DEFAULT_AD_SETTINGS)
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeAdFeatureControls(
      setFeatureControls,
      () => setFeatureControls(null)
    );
    return unsubscribe;
  }, []);

  const homeControl = featureControls?.[FEATURE_IDS.HOME];

  if (
    !adSettings.admobEnabled ||
    !adSettings.admobBannerEnabled ||
    !isGlobalAdTypeEnabled(adSettings, AD_TYPES.BANNER) ||
    !isFeatureAdTypeEnabled(homeControl, AD_TYPES.BANNER)
  ) {
    return null;
  }

  return (
    <View style={styles.container} accessibilityLabel="Advertisement">
      <BannerAd
        unitId={AD_UNIT_ID}
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
    alignItems: 'center',
    marginBottom: 12,
    overflow: 'hidden',
  },
});
