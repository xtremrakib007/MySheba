// Small "🏢 Business" badge - shown next to a user's name when their
// Business Profile status is active. The status is granted/revoked by the
// setBusinessProfileStatus Cloud Function and is passed in by the screen
// that already loaded the user's business profile.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { radius } from '../theme/theme';

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
