import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { radius } from '../theme/theme';
import { STATUS_LABELS, STATUS_COLORS, DOCUMENT_STATUS } from '../data/documentConstants';

const STATUS_DOTS = {
  [DOCUMENT_STATUS.VALID]: '🟢',
  [DOCUMENT_STATUS.EXPIRING_SOON]: '🟠',
  [DOCUMENT_STATUS.EXPIRED]: '🔴',
  [DOCUMENT_STATUS.NOT_ADDED]: '⚪',
};

export default function DocumentStatusBadge({ status }) {
  const color = STATUS_COLORS[status] ?? STATUS_COLORS[DOCUMENT_STATUS.NOT_ADDED];
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={styles.dot}>{STATUS_DOTS[status]}</Text>
      <Text style={[styles.label, { color }]}>{STATUS_LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    gap: 4,
  },
  dot: { fontSize: 10, marginRight: 4 },
  label: { fontSize: 12, fontWeight: '600' },
});
