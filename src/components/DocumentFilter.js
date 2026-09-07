import React, { useRef } from 'react';
import { ScrollView, Text, TouchableOpacity, StyleSheet, PanResponder } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import { DOCUMENT_STATUS, STATUS_LABELS } from '../data/documentConstants';

const FILTERS = ['all', DOCUMENT_STATUS.VALID, DOCUMENT_STATUS.EXPIRING_SOON, DOCUMENT_STATUS.EXPIRED];

// Minimum horizontal drag (px) before a touch counts as a swipe rather
// than a tap-that-moved-slightly. Below this, PanResponder lets the
// TouchableOpacity chips handle the touch normally.
const SWIPE_THRESHOLD = 40;

export default function DocumentFilter({ activeFilter, onChange }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);

  // Swipe left/right anywhere on the tab row steps to the next/previous
  // filter, in addition to tapping a chip directly. Built on the stock
  // PanResponder (no react-native-gesture-handler) since that library
  // isn't in this project and needs a native rebuild to add - not worth
  // it for one swipeable row.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dx) > 15 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderRelease: (_evt, gesture) => {
        if (Math.abs(gesture.dx) < SWIPE_THRESHOLD) return;
        const currentIndex = FILTERS.indexOf(activeFilter);
        const step = gesture.dx < 0 ? 1 : -1; // swipe left -> next filter, swipe right -> previous
        const nextIndex = Math.min(Math.max(currentIndex + step, 0), FILTERS.length - 1);
        if (nextIndex !== currentIndex) onChange(FILTERS[nextIndex]);
      },
    })
  ).current;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.row}
      contentContainerStyle={styles.rowContent}
      {...panResponder.panHandlers}
    >
      {FILTERS.map((filter) => {
        const active = activeFilter === filter;
        return (
          <TouchableOpacity key={filter} onPress={() => onChange(filter)} style={[styles.chip, active && styles.chipActive]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
              {filter === 'all' ? 'All' : STATUS_LABELS[filter]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 12 },
    rowContent: { paddingRight: 16 },
    // minWidth gives every chip a shared floor so "All" isn't a tiny
    // squished pill next to "Expiring Soon" - short labels center within
    // the extra space instead of the pill shrinking to fit the text.
    chip: { minWidth: 64, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.bg, marginRight: 8, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    chipTextActive: { color: '#FFFFFF' },
  });
}
