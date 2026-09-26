import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { busLogoImage } from '../data/busLogos';

// Marks for the three bus ticketing partners.
//
// All three used to render the same thing: Tile looks its artwork up by
// `key`, the emoji map had no entry for 'bus-redbus' and friends, so each
// one fell through to the generic blue diamond. Three identical tiles, and
// the `icon: '🚍' / '🚌' / '🎫'` written next to them in busTicketPartners
// was never read by anything.
//
// A monogram in the partner's own brand colour is the fix that does not
// need their trademark: three different colours and three different letter
// pairs are told apart at a glance, which is the whole job of the tile.
// Drop real artwork into assets/bus/ and wire it in src/data/busLogos.js
// and that takes over instead.
const MARKS = {
  'bus-redbus': { mono: 'rB', bg: '#D32F2F' },
  'bus-busonlineticket': { mono: 'BOT', bg: '#1565C0' },
  'bus-easybook': { mono: 'eb', bg: '#00897B' },
};

export function hasBusLogo(key) {
  return !!MARKS[key];
}

export default function BusOperatorLogo({ operatorKey, size = 34 }) {
  const mark = MARKS[operatorKey];
  if (!mark) return null;

  const image = busLogoImage(operatorKey);
  if (image) {
    return <Image source={image} style={{ width: size, height: size }} resizeMode="contain" />;
  }

  // Three letters need to fit the same box two letters do.
  const fontSize = mark.mono.length > 2 ? size * 0.32 : size * 0.4;
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size * 0.26, backgroundColor: mark.bg },
      ]}
    >
      <Text style={[styles.mono, { fontSize }]} numberOfLines={1} allowFontScaling={false}>
        {mark.mono}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
  mono: { color: '#FFFFFF', fontWeight: '800', letterSpacing: -0.3 },
});
