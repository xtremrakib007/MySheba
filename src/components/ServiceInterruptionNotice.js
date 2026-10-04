import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

/**
 * "This service is having problems" - and nothing more than that.
 *
 * iimmpact's guide is explicit that an interruption must not block the payment
 * flow, so this is a sentence and never a gate: there is no button on it, no
 * step depends on it, and the Continue button beside it is untouched. The
 * wording says so out loud, because a warning that reads like a refusal is a
 * refusal as far as the person holding the phone is concerned.
 *
 * Renders nothing at all unless there is a warning, so it can sit
 * unconditionally in a step.
 */
export default function ServiceInterruptionNotice({ notice }) {
  const { colors } = useTheme();
  const text = String(notice || '').trim();
  if (!text) return null;
  const tone = colors.warning || colors.danger || colors.primary;
  return (
    <View style={[styles.card, { borderColor: `${tone}66`, backgroundColor: `${tone}14` }]}>
      <Text style={[styles.text, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 13, marginTop: 10, marginBottom: 2 },
  text: { fontSize: 12.5, lineHeight: 18.5, fontWeight: '600' },
});
