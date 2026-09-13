import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme/theme';

const SERVICES = [
  { key: 'recharge', icon: '📱', name: 'Recharge', kind: 'service' },
  { key: 'mobilebanking', icon: '🏦', name: 'Mobile Banking', kind: 'service' },
  { key: 'internet', icon: '🌐', name: 'Internet Banking', kind: 'service' },
  { key: 'remittance', icon: '💸', name: 'Remittance', kind: 'service' },
  { key: 'bus', icon: '🚌', name: 'Bus', kind: 'bus' },
  { key: 'train', icon: '🚆', name: 'Train', kind: 'webview' },
  { key: 'flight', icon: '✈️', name: 'Flight', kind: 'service' },
  { key: 'fomema', icon: '🩺', name: 'FOMEMA', kind: 'webview' },
  { key: 'visa', icon: '🛂', name: 'Visa', kind: 'webview' },
  { key: 'mydigital', icon: '🛬', name: 'Malaysia Arrival Card', kind: 'webview' },
  { key: 'passport', icon: '📘', name: 'Passport', kind: 'webview' },
  { key: 'moreFeatures', icon: '⋯', name: 'More Features', kind: 'more' },
];

export default function ServiceGrid() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { startService, openWebView, openBusPicker, setScreen, webViewBusy } = useApp();

  const onPress = (service) => {
    if (service.kind === 'webview') return openWebView(service.key);
    if (service.kind === 'bus') return openBusPicker();
    if (service.kind === 'more') return setScreen('moreFeatures');
    return startService(service.key);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Finance Services</Text>
      <View style={styles.grid}>
        {SERVICES.map((service) => {
          const disabled = service.kind === 'webview' && webViewBusy;
          return (
            <TouchableOpacity key={service.key} style={[styles.tile, disabled && styles.disabled]} activeOpacity={0.82} disabled={disabled} onPress={() => onPress(service)}>
              <View style={styles.icon}><Text style={styles.iconText}>{service.icon}</Text></View>
              <Text style={styles.name} numberOfLines={2}>{service.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    wrap: { paddingHorizontal: 10, paddingTop: 8 },
    title: { fontSize: 16, fontWeight: '800', color: colors.navy, marginBottom: 10, paddingHorizontal: 4 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
    tile: { width: '23.7%', minHeight: 118, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, paddingVertical: 10, elevation: 2 },
    icon: { width: 50, height: 50, borderRadius: 16, backgroundColor: `${colors.primary}14`, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    iconText: { fontSize: 27 },
    name: { color: colors.text, fontSize: 10.5, fontWeight: '700', textAlign: 'center', lineHeight: 14 },
    disabled: { opacity: 0.5 },
  });
}
