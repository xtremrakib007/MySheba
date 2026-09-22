import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from "../theme/ThemeContext";
import { busTicketPartners } from '../data/countries';
import HeaderDecor from '../components/HeaderDecor';
import { Tile } from '../components/ServiceGrid';

// Bus is 3 real ticketing sites rather than one in-app flow - tapping
// any card runs the same lock/deduct-warning gate as any other paid
// webview (see AppContext.openWebView), then opens that site's WebView.
// Points are only deducted later, once payment success is detected there.
//
// Grid now reuses ServiceGrid's own <Tile> component (same one the home
// screen's Quick Services grid renders) instead of a bespoke card style,
// so this screen automatically matches whichever Grid Style the user has
// picked in Settings (classic / soft / minimal / gradient) and any future
// tweaks to that design land here for free too.
export default function BusPickerScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, openWebView, webViewBusy, pointCosts } = useApp();
  // Every bus partner shares the same live price (pointCosts maps every
  // PAYMENT_CHARGED_WEBVIEWS key, including all of busTicketPartners, to
  // the same paymentSuccessCost - see AppContext.pointCosts), so any one
  // of them works here.
  const cost = pointCosts['bus-redbus'];

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🚌 Bus Ticket</Text>
      </LinearGradient>

      <Text style={styles.hint}>Choose a ticketing partner to continue</Text>
      <Text style={styles.subHint}>{cost} pts deducted only after your payment is successful</Text>

      <View style={styles.grid}>
        {busTicketPartners.map((opt) => (
          <Tile
            key={opt.key}
            s={opt}
            disabled={webViewBusy}
            onPress={() => openWebView(opt.key)}
          />
        ))}
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10, flexShrink: 1 },
    hint: { textAlign: 'center', fontSize: 13, fontWeight: '600', color: colors.navy, marginTop: 20 },
    subHint: { textAlign: 'center', fontSize: 11, color: colors.textSecondary, marginTop: 4, marginBottom: 20, paddingHorizontal: 30 },
    // Same padding/gap as the home grid so tiles line up identically -
    // only 3 partners exist today so this simply wraps to one short row.
    grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, gap: 6, justifyContent: 'center', marginTop: 4 },
  });
}
