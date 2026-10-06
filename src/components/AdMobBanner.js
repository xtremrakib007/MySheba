import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { admobBannerUnitId } from '../firebase/adControlsService';

// An AdMob banner, for the slot nobody has booked a direct ad into.
//
// WHY THE REQUIRE IS GUARDED. react-native-google-mobile-ads is a native
// module. It is in a dev client and in a release build, and it is NOT in Expo
// Go or in any JS-only context - a plain import would throw at module load,
// which takes the whole bundle with it rather than just this banner. So it is
// required defensively and this component renders nothing when it is absent.
// The app has to keep working in Expo Go; an ad is the least important thing
// on any screen it appears on.
let gma = null;
try {
  // eslint-disable-next-line global-require
  gma = require('react-native-google-mobile-ads');
} catch (e) {
  gma = null;
}

const BannerAd = gma && gma.BannerAd;
const BannerAdSize = gma && gma.BannerAdSize;

// Initialised once per app run, not once per banner: mobileAds().initialize()
// is idempotent but it is also a network round trip, and this component
// mounts on every tabbed screen.
let initialised = false;
function initialiseOnce() {
  if (initialised || !gma || typeof gma.default !== 'function') return;
  initialised = true;
  try {
    gma.default().initialize().catch(() => {});
  } catch (e) {
    // Never throws into the UI - same posture as SmartAd's FAILURE RULE.
  }
}

export default function AdMobBanner({ onFilled }) {
  const { adSettings } = useApp();
  // '' unless Global Ads, the banner format and AdMob are all on AND a
  // well-formed unit id is stored. One check, in adControlsService, because a
  // slot that tests three of the four conditions renders an empty band.
  const unitId = admobBannerUnitId(adSettings);
  // A banner that failed to load must leave no gap behind. AdMob reports
  // "no fill" as a load failure, and no fill is the normal case for a new
  // account - so this is the usual path, not the error path.
  const [failed, setFailed] = useState(false);

  useEffect(() => { if (unitId) initialiseOnce(); }, [unitId]);
  // A new unit id deserves a fresh attempt; without this, one early no-fill
  // would keep the slot empty until the app restarted.
  useEffect(() => { setFailed(false); }, [unitId]);

  if (!BannerAd || !unitId || failed) return null;

  return (
    <View style={styles.wrap}>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize ? BannerAdSize.ANCHORED_ADAPTIVE_BANNER : undefined}
        requestOptions={{
          // No consent flow exists in this app yet, so nothing here may
          // assume consent was given. requestNonPersonalizedAdsOnly is the
          // conservative answer and the only correct one until there is a
          // consent prompt to read.
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdLoaded={() => { if (onFilled) onFilled(true); }}
        onAdFailedToLoad={() => { setFailed(true); if (onFilled) onFilled(false); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // No height of its own: the banner sizes itself and this collapses with it,
  // so an unfilled slot costs no screen space above the nav bar.
  wrap: { width: '100%', alignItems: 'center' },
});
