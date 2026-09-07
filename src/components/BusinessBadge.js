// Small "🏢 Business" badge - drop next to a seller/owner/provider name
// once their businessProfiles/{uid}.isBusinessProfile is true (granted
// only by the setBusinessProfileStatus Cloud Function - see
// businessProfileService.js). Takes the boolean directly, same pattern as
// VerifiedBadge.js, so screens that already loaded the business profile
// don't need an extra subscription just to render this.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { radius } from '../theme/theme';

import { useTheme } from "../theme/ThemeContext";

export default function BusinessBadge({ isBusiness, size = 'md' }) {
  if (!isBusiness) return null;
  const small = size === 'sm';
  return (
    <View style={[styles.badge, small && styles.badgeSmall]}>
      <Text style={[styles.text, small && styles.textSmall]}>🏢 Business</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EDE7F6',
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginTop: 2,
  },
  badgeSmall: { paddingVertical: 1, paddingHorizontal: 6 },
  text: { fontSize: 11, fontWeight: '700', color: '#5E35B1' },
  textSmall: { fontSize: 9 },
});
