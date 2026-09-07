import React from 'react';
import { View, StyleSheet } from 'react-native';

// Small decorative dot-grid, echoing the corner dot pattern used on the
// Login screen's hero background. Purely cosmetic - absolutely positioned
// so it can be dropped inside any brandGradient header without affecting
// layout. `corner` controls which side it sits on.
export default function HeaderDecor({ corner = 'right' }) {
  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, corner === 'right' ? styles.right : styles.left]}
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <View key={i} style={styles.dot} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 8,
    width: 34,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    opacity: 0.35,
  },
  right: { right: 14 },
  left: { left: 14 },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#FFFFFF' },
});
