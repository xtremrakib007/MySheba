import React from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { radius } from '../theme/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SLIDE_WIDTH = Math.min(SCREEN_WIDTH, 480) - 28; // matches BannerAdFormModal's box padding, so the preview reads at real width

// PHASE 3 - MySheba Advertisement System.
//
// The one, single place a banner Advertisement's creative gets rendered.
// Per the brief's "IMAGE REQUIREMENT" and "HOME BANNER RULE" sections, a
// banner ad is ALWAYS image-only - no title, description, button, URL
// text, overlay text, or promotional text is ever drawn on top of it, no
// matter which screen renders it. Rather than restate that rule in every
// place a banner shows up, every such place should render THIS component:
//  - BannerAdFormModal's "Preview" step (this phase) - renders it exactly
//    as it will appear once live, per the brief's "Admin must see a
//    preview before saving. Show the banner as it will appear in the app."
//  - a later rendering phase's actual Home/feature placement slot
//    (adRotationService.js's selectAdForPlacement stub is where that
//    phase picks WHICH banner to show - this component is how it gets
//    drawn once picked) - reusing this component there is what makes
//    "Home banner must be image-only. Do not render administrative
//    Banner Name in the user application." true by construction, not by
//    every future call site remembering the rule on its own.
//
// `ad` only ever needs imageUrl (falls back to thumbnailUrl if that's all
// that's loaded yet) and, optionally, a numeric aspectRatio hint - nothing
// else about the Advertisement doc (name, advertiser, status, etc.) is
// read here, deliberately, so it's structurally impossible for this
// component to leak admin-only fields into the rendered banner.
export default function AdBannerPreview({ ad, onPress, height = 150, style }) {
  const uri = ad?.imageUrl || ad?.thumbnailUrl || '';

  const content = (
    <View style={[styles.box, { height }, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]} />
      )}
    </View>
  );

  if (!onPress) return content;

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  box: {
    width: SLIDE_WIDTH,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#EEEEEE',
  },
  placeholder: { backgroundColor: '#EEEEEE' },
});
