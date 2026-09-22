import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from "../theme/ThemeContext";

// Mirrors .step-bar / .step-dot / .step-line
export default function StepBar({ totalSteps, currentStep }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const dots = [];
  for (let i = 0; i < totalSteps; i++) {
    const done = i < currentStep;
    const active = i === currentStep;
    dots.push(
      <View key={`dot-${i}`} style={[styles.dot, done && styles.done, active && styles.active]}>
        <Text style={[styles.dotText, (done || active) && styles.dotTextOn]}>{done ? '✓' : i + 1}</Text>
      </View>
    );
    if (i < totalSteps - 1) dots.push(<View key={`line-${i}`} style={[styles.line, done && styles.lineDone]} />);
  }
  return <View style={styles.bar}>{dots}</View>;
}

function createStyles(colors) {
  return StyleSheet.create({
    bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    dot: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    active: { backgroundColor: colors.primary },
    done: { backgroundColor: colors.success },
    dotText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    dotTextOn: { color: '#FFFFFF' },
    line: { width: 30, height: 2, backgroundColor: colors.border },
    lineDone: { backgroundColor: colors.success },
  });
}
