import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import SmartAd from './SmartAd';

// The ad strip pinned directly above the bottom nav bar.
//
// Sits outside the screen's own ScrollView, in App.js's chrome, so it stays
// put while the page scrolls under it and every tabbed screen gets it without
// each screen placing one. Its placement is APP_BOTTOM_BAR - deliberately not
// HOME_BOTTOM, which scrolls with the home page and belongs to it, so a
// superadmin can run one without running the other.
//
// COLLAPSES TO NOTHING when there is no ad. SmartAd returns null unless an ad
// is actually eligible for this placement right now (ads off globally, the
// home feature's banner switch off, this placement disabled, frequency cap
// hit, or simply nothing booked), and this wrapper renders nothing in that
// case rather than an empty 56dp band above the nav bar. So the slot costs no
// screen space until something is booked into it - which is the whole point
// of it being here before there is anything to put in it.
//
// ADMOB: the slot is the part that had to exist in the app. Filling it from
// AdMob rather than from a booked banner needs three things this repo cannot
// supply on its own - the react-native-google-mobile-ads package, a native
// build to include it (it has no Expo Go support), and the AdMob app id plus
// a banner ad unit id from the AdMob console. With those, the AdMob <BannerAd>
// goes inside this same wrapper, beside the SmartAd, and everything around it
// - where it sits, that it collapses when empty, that the nav bar is still
// clear of it - already holds.
const AD_HEIGHT = 56;

export default function BottomAdSlot() {
  const { colors } = useTheme();
  return (
    <View style={[styles.slot, { backgroundColor: colors.bg }]}>
      <SmartAd placement="APP_BOTTOM_BAR" feature="home" height={AD_HEIGHT} />
    </View>
  );
}

const styles = StyleSheet.create({
  // No height, no padding, no min-height and no border of its own: an empty
  // SmartAd leaves this View zero-high, so the band appears and disappears
  // with the ad instead of reserving space for one that is not there. A
  // border would have been the one thing still drawn when it is empty - a
  // stray hairline above the nav bar with nothing over it.
  slot: { width: '100%', alignItems: 'center', overflow: 'hidden' },
});
