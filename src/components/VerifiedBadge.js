// Bright "✓ Verified" badge - drop next to a name anywhere someone's
// identity-verified status should show (own profile, chat header, another
// user's profile, a listing's seller row, ...) once their users/{uid}.verified
// field is true (set only by the approveVerification Cloud Function - see
// verificationService.js). Takes the boolean directly rather than a uid so
// screens that already have the profile loaded (or don't need live updates)
// don't need an extra subscription just to render this.
//
// Styled as a glossy, "3D" badge: a bright gradient fill, a drop shadow to
// lift it off the page, a subtle glass highlight along the top edge, and a
// small filled checkmark chip - rather than a flat tinted pill.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Default (on white/card backgrounds): bright blue-cyan gradient.
const BLUE_GRADIENT = ['#4FACFE', '#0A6CFF'];
// `light` (on a colored/gradient header, e.g. Sidebar drawer): warm gold
// gradient reads as a premium badge and contrasts against the brand teal/blue.
const GOLD_GRADIENT = ['#FFE082', '#FFA000'];

export default function VerifiedBadge({ verified, size = 'md', light = false }) {
  if (!verified) return null;
  const small = size === 'sm';
  const gradient = light ? GOLD_GRADIENT : BLUE_GRADIENT;
  const checkColor = light ? '#B45F06' : '#0A6CFF';

  return (
    <View style={[styles.shadowWrap, small && styles.shadowWrapSmall]}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.badge, small && styles.badgeSmall]}
      >
        <View style={[styles.gloss, small && styles.glossSmall]} />
        <View style={[styles.checkChip, small && styles.checkChipSmall]}>
          <Text style={[styles.checkMark, small && styles.checkMarkSmall, { color: checkColor }]}>✓</Text>
        </View>
        <Text style={[styles.text, small && styles.textSmall]}>Verified</Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    marginTop: 2,
    shadowColor: '#0A6CFF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 5,
  },
  shadowWrapSmall: { shadowOffset: { width: 0, height: 2 }, shadowRadius: 3, elevation: 3 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    paddingLeft: 4,
    gap: 5,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  badgeSmall: { paddingVertical: 2, paddingHorizontal: 7, paddingLeft: 3, gap: 3 },
  gloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
  },
  glossSmall: { height: '50%' },
  checkChip: {
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 1,
  },
  checkChipSmall: { width: 12, height: 12, borderRadius: 6 },
  checkMark: { fontSize: 10, fontWeight: '900', lineHeight: 11 },
  checkMarkSmall: { fontSize: 8, lineHeight: 9 },
  text: {
    fontSize: 11,
    fontWeight: '800',
    color: 'white',
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  textSmall: { fontSize: 9 },
});
