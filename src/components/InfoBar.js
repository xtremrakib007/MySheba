import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, Easing } from 'react-native';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import CountryFlag from './CountryFlag';

// The flags used to be emoji inside the label strings, which is the same
// upscaled-bitmap blur the country cards had - and this bar sits on the home
// screen, so it was the blur people saw most. `cc` is the country the rate
// belongs to and CountryFlag draws it.
//
// Indonesia's row carried the flag of MONACO. Both are a red bar over a
// white one and the two emoji are a glance apart, so it read as plausible
// for as long as it shipped; drawing the flag from the country code is also
// what stops that class of typo recurring.
const REMIT_META = [
  { key: 'BD_ACC', cc: 'BD', label: 'ACC', fullLabel: 'BDT ACC' },
  { key: 'BD_CASH', cc: 'BD', label: 'CASH', fullLabel: 'BDT CASH' },
  { key: 'NP', cc: 'NP', label: 'NPR', fullLabel: 'NPR' },
  { key: 'PK', cc: 'PK', label: 'PKR', fullLabel: 'PKR' },
  { key: 'PH', cc: 'PH', label: 'PHP', fullLabel: 'PHP' },
  { key: 'LK', cc: 'LK', label: 'LKR', fullLabel: 'LKR' },
  { key: 'IN', cc: 'IN', label: 'INR', fullLabel: 'INR' },
  { key: 'ID', cc: 'ID', label: 'IDR', fullLabel: 'IDR' },
  { key: 'MM', cc: 'MM', label: 'MMK', fullLabel: 'MMK' },
];
const SLIDE_SIZE = 3;
function formatAmount(n) { const num = Number(n) || 0; return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function InfoBar() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { setRatePopupVisible, rates } = useApp();
  const [collapsed, setCollapsed] = useState(true);
  const [remitIdx, setRemitIdx] = useState(0);
  const heightAnim = useRef(new Animated.Value(0)).current;
  const remitRow = useMemo(() => REMIT_META.map((m) => ({ ...m, val: rates[m.key] })).filter((m) => m.val != null), [rates]);
  const remitSlides = useMemo(() => { const chunks = []; for (let i = 0; i < remitRow.length; i += SLIDE_SIZE) chunks.push(remitRow.slice(i, i + SLIDE_SIZE)); return chunks.length ? chunks : [[]]; }, [remitRow]);
  useEffect(() => { const id = setInterval(() => setRemitIdx((i) => (i + 1) % remitSlides.length), 2500); return () => clearInterval(id); }, [remitSlides.length]);
  useEffect(() => { if (remitIdx >= remitSlides.length) setRemitIdx(0); }, [remitSlides.length, remitIdx]);
  useEffect(() => { Animated.timing(heightAnim, { toValue: collapsed ? 0 : 1, duration: 250, easing: Easing.ease, useNativeDriver: false }).start(); }, [collapsed]);
  const mobileBankingRate = rates.mobileBanking;
  return (
    <View style={styles.bar}>
      <TouchableOpacity style={styles.headerRow} onPress={() => setCollapsed((c) => !c)} activeOpacity={0.7}>
        <View style={styles.headerLeft}>
          {mobileBankingRate != null && <View style={styles.mbPill}><Text style={styles.mbPillText}>📱 MYR 1 = BDT {formatAmount(mobileBankingRate)}</Text></View>}
          <View style={styles.sliderContainer}><Text style={styles.sliderLabel}>💸 Remit Rates</Text><View style={styles.slideRow}>{(remitSlides[remitIdx] || []).map((chip) => <View key={chip.key} style={styles.chip}><CountryFlag code={chip.cc} size={15} style={styles.chipFlag} /><Text style={styles.chipText}>{chip.label} <Text style={styles.chipVal}>{formatAmount(chip.val)}</Text></Text></View>)}</View></View>
        </View>
        <Text style={[styles.arrow, { transform: [{ rotate: collapsed ? '0deg' : '180deg' }] }]}>▼</Text>
      </TouchableOpacity>
      {!collapsed && <View style={styles.content}>
        {mobileBankingRate != null && <TouchableOpacity style={styles.mbRateDisplay} onPress={() => setRatePopupVisible(true)}><Text style={styles.bodyText}>📱 Mobile Banking Rate</Text><Text style={styles.mbRateValue}>MYR 1 = BDT {formatAmount(mobileBankingRate)}</Text></TouchableOpacity>}
        <View style={styles.divider} /><TouchableOpacity onPress={() => setRatePopupVisible(true)}><View style={styles.remitScrollRow}>{remitRow.map((r) => <View key={r.key} style={styles.remitChip}><CountryFlag code={r.cc} size={17} style={styles.chipFlag} /><Text style={styles.remitChipText}>{r.fullLabel} <Text style={styles.remitChipVal}>{formatAmount(r.val)}</Text></Text></View>)}</View></TouchableOpacity>
      </View>}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    bar: { marginHorizontal: 10, marginTop: 8, marginBottom: 6, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    mbPill: { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.md, marginRight: 8 },
    mbPillText: { color: colors.text, fontSize: 9, fontWeight: '600' },
    sliderContainer: { flex: 1, marginLeft: 8, paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: colors.border },
    sliderLabel: { fontSize: 8, color: colors.textSecondary, marginBottom: 3 }, slideRow: { flexDirection: 'row', gap: 4 },
    chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, paddingVertical: 3, paddingHorizontal: 6, borderRadius: radius.md }, chipFlag: { marginRight: 4 }, chipText: { fontSize: 9, color: colors.text }, chipVal: { fontWeight: '700', color: colors.success, fontSize: 10 },
    arrow: { fontSize: 12, color: colors.text, marginLeft: 8 }, content: { paddingHorizontal: 14, paddingBottom: 12 }, divider: { borderTopWidth: 1, borderTopColor: colors.divider, marginVertical: 8 },
    mbRateDisplay: { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, bodyText: { color: colors.text }, mbRateValue: { fontSize: 16, fontWeight: '700', color: colors.secondary },
    remitScrollRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, paddingTop: 4 }, remitChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, paddingVertical: 5, paddingHorizontal: 8, borderRadius: radius.pill }, remitChipText: { fontSize: 10, color: colors.text }, remitChipVal: { fontWeight: '600', color: colors.success },
  });
}
