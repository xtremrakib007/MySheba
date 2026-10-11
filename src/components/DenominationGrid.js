import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

// The one way MySheba draws a choice of amounts: reload, PIN, voucher, bill
// package. Each card leads with the face value the customer is buying, adds a
// short caption (validity, plan name) when the provider gives one, and shows
// "You pay" only when the wallet pays something different from the face
// value - "RM 5 / Pay RM 5.00" said the same thing twice.
//
// items: [{ key, value, caption?, face?, pay? }]
//   value    the headline, already formatted ("RM 5", "IDR 50,000")
//   pay      what the wallet is charged, a number; hidden when equal to `face`
//   face     the face value as a number, for that comparison
export default function DenominationGrid({ items, selectedKey, onSelect, columns = 3 }) {
  const { colors } = useTheme();
  const basis = columns === 2 ? '48%' : '31.5%';
  return (
    <View style={styles.grid}>
      {(items || []).map((item) => {
        const selected = String(selectedKey ?? '') === String(item.key);
        const pay = Number(item.pay);
        const face = Number(item.face);
        const showPay = Number.isFinite(pay) && pay > 0 && !(Number.isFinite(face) && Math.abs(pay - face) < 0.005);
        return (
          <TouchableOpacity
            key={String(item.key)}
            activeOpacity={0.85}
            onPress={() => onSelect(item)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={[item.value, item.caption, showPay ? `you pay RM ${pay.toFixed(2)}` : ''].filter(Boolean).join(', ')}
            style={[
              styles.card,
              { flexBasis: basis, maxWidth: basis, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.card },
            ]}
          >
            {selected && <View style={[styles.check, { backgroundColor: colors.onPrimary }]}><Text style={[styles.checkText, { color: colors.primary }]}>✓</Text></View>}
            <Text style={[styles.value, { color: selected ? colors.onPrimary : colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{item.value}</Text>
            {!!item.caption && <Text style={[styles.caption, { color: selected ? colors.onPrimary : colors.textSecondary }]} numberOfLines={2}>{item.caption}</Text>}
            {showPay && (
              <View style={[styles.payPill, { backgroundColor: selected ? '#ffffff2e' : `${colors.primary}14` }]}>
                <Text style={[styles.payText, { color: selected ? colors.onPrimary : colors.primary }]} numberOfLines={1}>Pay RM {pay.toFixed(2)}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginBottom: 6 },
  card: {
    minHeight: 72, borderWidth: 1.5, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 8,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  value: { fontSize: 17, fontWeight: '900', textAlign: 'center' },
  caption: { fontSize: 10.5, fontWeight: '600', textAlign: 'center', marginTop: 3, lineHeight: 14 },
  payPill: { marginTop: 6, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8 },
  payText: { fontSize: 10.5, fontWeight: '800' },
  check: { position: 'absolute', top: 5, right: 5, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  checkText: { fontSize: 10, fontWeight: '900' },
});
