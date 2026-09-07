import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, Easing } from 'react-native';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';

import { useTheme } from "../theme/ThemeContext";

// Mirrors #infoBar: collapsible balance/rate summary + auto-rotating remit slider.
// All figures below come live from Firestore (AppContext.rates, subscribed from
// `rates/current`, and AppContext.profile.walletBalance, subscribed from
// `users/{uid}`) - nothing here is hardcoded/demo data anymore.

// Presentation-only metadata (flag emoji + display label + which key in the
// live `rates` doc it maps to). Values are never hardcoded here.
const REMIT_META = [
  { key: 'BD_ACC', label: '🇧🇩ACC', fullLabel: '🇧🇩 BDT ACC' },
  { key: 'BD_CASH', label: '🇧🇩CASH', fullLabel: '🇧🇩 BDT CASH' },
  { key: 'NP', label: '🇳🇵NPR', fullLabel: '🇳🇵 NPR' },
  { key: 'PK', label: '🇵🇰PKR', fullLabel: '🇵🇰 PKR' },
  { key: 'PH', label: '🇵🇭PHP', fullLabel: '🇵🇭 PHP' },
  { key: 'LK', label: '🇱🇰LKR', fullLabel: '🇱🇰 LKR' },
  { key: 'IN', label: '🇮🇳INR', fullLabel: '🇮🇳 INR' },
  { key: 'ID', label: '🇲🇨IDR', fullLabel: '🇲🇨 IDR' },
  { key: 'MM', label: '🇲🇲MMK', fullLabel: '🇲🇲 MMK' },
];
const SLIDE_SIZE = 3;

function formatAmount(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function InfoBar() {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const { setRatePopupVisible, rates, profile, setScreen } = useApp();
  const [collapsed, setCollapsed] = useState(true);
  const [remitIdx, setRemitIdx] = useState(0);
  const heightAnim = useRef(new Animated.Value(0)).current; // 1 = expanded, 0 = collapsed

  const remitRow = useMemo(
    () => REMIT_META.map((m) => ({ ...m, val: rates[m.key] })).filter((m) => m.val != null),
    [rates]
  );
  const remitSlides = useMemo(() => {
    const chunks = [];
    for (let i = 0; i < remitRow.length; i += SLIDE_SIZE) chunks.push(remitRow.slice(i, i + SLIDE_SIZE));
    return chunks.length ? chunks : [[]];
  }, [remitRow]);

  useEffect(() => {
    const id = setInterval(() => setRemitIdx((i) => (i + 1) % remitSlides.length), 2500);
    return () => clearInterval(id);
  }, [remitSlides.length]);

  useEffect(() => {
    if (remitIdx >= remitSlides.length) setRemitIdx(0);
  }, [remitSlides.length, remitIdx]);

  useEffect(() => {
    Animated.timing(heightAnim, {
      toValue: collapsed ? 0 : 1,
      duration: 250,
      easing: Easing.ease,
      useNativeDriver: false,
    }).start();
  }, [collapsed]);

  const walletBalance = profile && typeof profile.walletBalance === 'number' ? profile.walletBalance : 0;
  const mobileBankingRate = rates.mobileBanking;

  return (
    <View style={styles.bar}>
      <TouchableOpacity style={styles.headerRow} onPress={() => setCollapsed((c) => !c)} activeOpacity={0.7}>
        <View style={styles.headerLeft}>
          <View style={styles.balanceMini}>
            <Text>💰</Text>
            <Text style={styles.amount}>{walletBalance.toLocaleString('en-US')}</Text>
          </View>
          {mobileBankingRate != null && (
            <View style={styles.mbPill}><Text style={styles.mbPillText}>📱 {formatAmount(mobileBankingRate)}</Text></View>
          )}
          <View style={styles.sliderContainer}>
            <Text style={styles.sliderLabel}>💸 Remit Rates</Text>
            <View style={styles.slideRow}>
              {(remitSlides[remitIdx] || []).map((chip) => (
                <View key={chip.key} style={styles.chip}>
                  <Text style={styles.chipText}>{chip.label} <Text style={styles.chipVal}>{formatAmount(chip.val)}</Text></Text>
                </View>
              ))}
            </View>
          </View>
        </View>
        <Text style={[styles.arrow, { transform: [{ rotate: collapsed ? '0deg' : '180deg' }] }]}>▼</Text>
      </TouchableOpacity>

      {!collapsed && (
        <View style={styles.content}>
          <View style={styles.divider} />
          <View style={styles.balanceRow}>
            <View>
              <Text style={styles.balanceLabel}>Available Balance</Text>
              <Text style={styles.balanceFull}>MYR {formatAmount(walletBalance)}</Text>
            </View>
            <TouchableOpacity style={styles.topupBtn} onPress={() => setScreen('topup')}>
              <Text style={styles.topupBtnText}>+ Top Up</Text>
            </TouchableOpacity>
          </View>
          {mobileBankingRate != null && (
            <>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.mbRateDisplay} onPress={() => setRatePopupVisible(true)}>
                <Text>📱 Mobile Banking Rate</Text>
                <Text style={styles.mbRateValue}>MYR 1 = BDT {formatAmount(mobileBankingRate)}</Text>
              </TouchableOpacity>
            </>
          )}
          <View style={styles.divider} />
          <TouchableOpacity onPress={() => setRatePopupVisible(true)}>
            <View style={styles.remitScrollRow}>
              {remitRow.map((r) => (
                <View key={r.key} style={styles.remitChip}>
                  <Text style={styles.remitChipText}>{r.fullLabel} <Text style={styles.remitChipVal}>{formatAmount(r.val)}</Text></Text>
                </View>
              ))}
            </View>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    bar: { marginHorizontal: 10, marginTop: 8, marginBottom: 6, backgroundColor: 'white', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    balanceMini: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    amount: { fontSize: 15, fontWeight: '700', color: colors.primary, marginLeft: 4 },
    mbPill: { backgroundColor: '#E3F2FD', paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.md, marginLeft: 8 },
    mbPillText: { color: '#1565C0', fontSize: 10, fontWeight: '600' },
    sliderContainer: { flex: 1, marginLeft: 8, paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: '#EEE' },
    sliderLabel: { fontSize: 8, color: '#BBB', marginBottom: 3 },
    slideRow: { flexDirection: 'row', gap: 4 },
    chip: { backgroundColor: '#F5F9F5', paddingVertical: 3, paddingHorizontal: 6, borderRadius: radius.md },
    chipText: { fontSize: 9 },
    chipVal: { fontWeight: '700', color: '#2E7D32', fontSize: 10 },
    arrow: { fontSize: 12, color: '#999', marginLeft: 8 },
    content: { paddingHorizontal: 14, paddingBottom: 12 },
    divider: { borderTopWidth: 1, borderTopColor: '#EEE', marginVertical: 8 },
    balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    balanceLabel: { fontSize: 10, color: '#999' },
    balanceFull: { fontSize: 20, fontWeight: '700', color: colors.primary },
    topupBtn: { backgroundColor: colors.primary, paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.sm },
    topupBtnText: { color: 'white', fontSize: 11, fontWeight: '600' },
    mbRateDisplay: { backgroundColor: '#E3F2FD', paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    mbRateValue: { fontSize: 16, fontWeight: '700', color: '#1565C0' },
    remitScrollRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, paddingTop: 4 },
    remitChip: { backgroundColor: '#E8F5E9', paddingVertical: 5, paddingHorizontal: 8, borderRadius: radius.pill },
    remitChipText: { fontSize: 10 },
    remitChipVal: { fontWeight: '600', color: '#2E7D32' },
  });
}
