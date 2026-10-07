import React from 'react';

// Temporarily disabled on native clients because the current native AdMob
// BannerAd implementation crashes inside BannerAdViewManager.requestAd.
// Keep the component so existing imports and admin controls remain intact.
export default function GoogleAdMobBanner() {
  return null;
}
