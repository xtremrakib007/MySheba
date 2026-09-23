import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radius, shadows } from '../theme/theme';

// The balance card from the mockup. Drawn solid in the role colour for a
// customer and on the card surface for staff, which is how the mockup
// splits them, so both live here behind one `variant` rather than being
// rebuilt per screen.
export default function WalletCard({ balance = 0, currency = 'MYR', variant = 'solid', onAddMoney, onTransfer }) {
  const { colors } = useTheme();
  const solid = variant === 'solid';
  const styles = createStyles(colors, solid);
  const [hidden, setHidden] = useState(false);
  // Grouped, because a five-figure balance rendered as RM 12480.30 and was
  // then clipped to "RM 12480..." at this size.
  const amount = `${Number(balance || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.iconWrap}><Text style={styles.icon}>▤</Text></View>
        <View style={styles.amountWrap}>
          <Text style={styles.caption}>Available Balance</Text>
          <Text style={styles.balance} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{hidden ? '••••••' : amount}</Text>
        </View>
        <TouchableOpacity
          onPress={() => setHidden((v) => !v)}
          style={styles.eyeBtn}
          accessibilityRole="button"
          accessibilityLabel={hidden ? 'Show balance' : 'Hide balance'}
        >
          <Text style={styles.eye}>{hidden ? '◌' : '◉'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.action} onPress={onAddMoney} accessibilityRole="button" accessibilityLabel="Add money">
          <Text style={styles.actionIcon}>+</Text><Text style={styles.actionText}>Add Money</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.action} onPress={onTransfer} accessibilityRole="button" accessibilityLabel="Transfer">
          <Text style={styles.actionIcon}>⇄</Text><Text style={styles.actionText}>Transfer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(colors, solid) {
  const onCard = solid ? '#FFFFFF' : colors.text;
  const muted = solid ? '#FFFFFFC4' : colors.textSecondary;
  return StyleSheet.create({
    card: { marginHorizontal: 14, marginTop: 12, padding: 14, borderRadius: radius.card, backgroundColor: solid ? colors.primary : colors.card, borderWidth: solid ? 0 : 1, borderColor: colors.border, ...shadows.card },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    iconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: solid ? '#FFFFFF2E' : `${colors.primary}1F` },
    icon: { fontSize: 20, color: solid ? '#FFFFFF' : colors.primary },
    amountWrap: { flex: 1 },
    caption: { fontSize: 11.5, color: muted, fontWeight: '600' },
    balance: { fontSize: 22, fontWeight: '800', color: solid ? '#FFFFFF' : colors.primary, marginTop: 1 },
    eyeBtn: { padding: 6 },
    eye: { fontSize: 17, color: muted },
    actions: { flexDirection: 'row', gap: 10, marginTop: 13 },
    action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: radius.md, backgroundColor: solid ? '#FFFFFF24' : `${colors.primary}14`, borderWidth: solid ? 0 : 1, borderColor: `${colors.primary}2E` },
    actionIcon: { fontSize: 15, fontWeight: '800', color: solid ? '#FFFFFF' : colors.primary },
    actionText: { fontSize: 12.5, fontWeight: '700', color: solid ? '#FFFFFF' : colors.primary },
  });
}
