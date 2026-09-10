import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { useLanguage } from '../i18n/LanguageContext';

const SERVICES = [
  { key: 'recharge', icon: 'phone-portrait-outline', bg: '#E8F5E9', accent: '#43A047', name: 'Recharge', kind: 'service' },
  { key: 'mobilebanking', icon: 'card-outline', bg: '#E3F2FD', accent: '#1E88E5', name: 'Mobile Banking', kind: 'service' },
  { key: 'internet', icon: 'wifi-outline', bg: '#FFF3E0', accent: '#FB8C00', name: 'Internet', kind: 'service' },
  { key: 'remittance', icon: 'cash-outline', bg: '#F3E5F5', accent: '#8E24AA', name: 'Remittance', kind: 'service' },
  { key: 'bus', icon: 'bus-outline', bg: '#FCE4EC', accent: '#D81B60', name: 'Bus', pointsKey: 'bus-redbus', pointsLabel: 'pts on payment', kind: 'buspicker' },
  { key: 'train', icon: 'train-outline', bg: '#E0F7FA', accent: '#00ACC1', name: 'Train', pointsKey: 'train', pointsLabel: 'pts on payment', kind: 'webview' },
  { key: 'flight', icon: 'airplane-outline', bg: '#E8EAF6', accent: '#3949AB', name: 'Flight', kind: 'service' },
  { key: 'fomema', icon: 'medkit-outline', bg: '#E8F5E9', accent: '#43A047', name: 'FOMEMA', pointsKey: 'fomema', pointsLabel: 'pts on search', kind: 'webview' },
  { key: 'visa', icon: 'document-text-outline', bg: '#F3E5F5', accent: '#8E24AA', name: 'Visa', pointsKey: 'visa', pointsLabel: 'pts on search', kind: 'webview' },
  { key: 'mydigital', icon: 'document-outline', bg: '#E1F5FE', accent: '#0288D1', name: 'Malaysia Arrival Card', pointsKey: 'mydigital', pointsLabel: 'pts on submit', kind: 'webview' },
  { key: 'passport', icon: 'book-outline', bg: '#FFF8E1', accent: '#F9A825', name: 'Passport', pointsKey: 'passport', pointsLabel: 'pts on submit', kind: 'webview' },
  { key: 'marketplace', icon: 'cart-outline', bg: '#FFF3E0', accent: '#F4511E', name: 'Marketplace', kind: 'marketplace' },
  { key: 'myDocuments', icon: 'folder-open-outline', bg: '#E1F5FE', accent: '#0288D1', name: 'My Documents', kind: 'documents' },
  { key: 'salary', icon: 'wallet-outline', bg: '#FFF8E1', accent: '#F9A825', name: 'Salary & OT', kind: 'salary' },
];

const MORE_FEATURES = [
  { key: 'esim', icon: 'cellular-outline', bg: '#E0F2F1', accent: '#00897B', name: 'MY e-SIM', pointsKey: 'esim', pointsLabel: 'pts on payment', kind: 'webview' },
  { key: 'social', icon: 'megaphone-outline', bg: '#FCE4EC', accent: '#AD1457', name: 'Social Feed', kind: 'social' },
  { key: 'support', icon: 'headset-outline', bg: '#E0F7FA', accent: '#00838F', name: 'Support', kind: 'support' },
  { key: 'history', icon: 'time-outline', bg: '#EDE7F6', accent: '#5E35B1', name: 'History', kind: 'history' },
  { key: 'chat', icon: 'chatbubble-ellipses-outline', bg: '#E8F5E9', accent: '#2E7D32', name: 'Chat', kind: 'chathub' },
  { key: 'myAccount', icon: 'receipt-outline', bg: '#FFF8E1', accent: '#F9A825', name: 'My Account', kind: 'myaccount' },
  { key: 'profile', icon: 'person-outline', bg: '#E1F5FE', accent: '#0288D1', name: 'Profile', kind: 'profile' },
  { key: 'notepad', icon: 'create-outline', bg: '#FFFDE7', accent: '#F9A825', name: 'Notepad', kind: 'notepad' },
  { key: 'gamePoints', icon: 'game-controller-outline', bg: '#E8EAF6', accent: '#5E35B1', name: 'Game Points', kind: 'gamePoints' },
  { key: 'gamePointsGift', icon: 'gift-outline', bg: '#FCE4EC', accent: '#D81B60', name: 'Gifts', kind: 'gamePointsGift' },
];

const PRIMARY_COUNT = 11;
const NUM_COLUMNS = 4;
const GRID_PADDING = 10;
const COLUMN_GAP = 8;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CONTAINER_WIDTH = Math.min(SCREEN_WIDTH, 480) - GRID_PADDING * 2;
const ITEM_WIDTH = (CONTAINER_WIDTH - COLUMN_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
const PRIMARY_SERVICES = SERVICES.slice(0, PRIMARY_COUNT);
const MORE_SERVICES = [...SERVICES.slice(PRIMARY_COUNT), ...MORE_FEATURES];
const MORE_FEATURES_TILE = { key: 'moreFeaturesTile', icon: 'sparkles-outline', bg: '#EDE7F6', accent: '#5E35B1', name: 'More Features', kind: 'moreFeaturesLink' };

export function Tile({ s, onPress, disabled }) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = createStyles(colors);
  const label = t(`service.${s.key}`, s.name);
  return (
    <TouchableOpacity style={[styles.item, { width: ITEM_WIDTH, backgroundColor: colors.card }, disabled && styles.itemDisabled]} activeOpacity={0.7} disabled={disabled} onPress={onPress}>
      <View style={[styles.iconWrap, { backgroundColor: s.bg }]}>
        <Ionicons name={s.icon} size={27} color={s.accent || colors.primary} />
      </View>
      <Text style={styles.name} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

export function useServiceAction() {
  const { startService, openWebView, openBusPicker, openMarketplace, openSalary, openMyDocuments, openNotepad, openAccommodation, openRoomSharing, openCommunity, openServiceProvidersHome, openChatHub, openSocialFeed, setScreen } = useApp();
  return (s) => {
    if (s.kind === 'webview') return openWebView(s.key);
    if (s.kind === 'buspicker') return openBusPicker();
    if (s.kind === 'marketplace') return openMarketplace();
    if (s.kind === 'salary') return openSalary();
    if (s.kind === 'documents') return openMyDocuments();
    if (s.kind === 'notepad') return openNotepad();
    if (s.kind === 'accommodation') return openAccommodation();
    if (s.kind === 'roomsharing') return openRoomSharing();
    if (s.kind === 'community') return openCommunity();
    if (s.kind === 'social') return openSocialFeed();
    if (s.kind === 'localservices') return openServiceProvidersHome();
    if (s.kind === 'chathub') return openChatHub();
    if (s.kind === 'moreFeaturesLink') return setScreen('moreFeatures');
    if (s.kind === 'support') return setScreen('support');
    if (s.kind === 'history') return setScreen('history');
    if (s.kind === 'myaccount') return setScreen('myAccount');
    if (s.kind === 'profile') return setScreen('profile');
    if (s.kind === 'gamePoints') return setScreen('gamePoints');
    if (s.kind === 'gamePointsGift') return setScreen('gamePointsGift');
    return startService(s.key);
  };
}

export { MORE_SERVICES };

export default function ServiceGrid({ extraTiles = [] }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { webViewBusy } = useApp();
  const handlePress = useServiceAction();
  return (
    <View>
      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>🎯 Quick Services</Text></View>
      <View style={styles.grid}>
        {PRIMARY_SERVICES.map((s) => <Tile key={s.key} s={s} disabled={s.kind === 'webview' && webViewBusy} onPress={() => handlePress(s)} />)}
        <Tile s={MORE_FEATURES_TILE} onPress={() => handlePress(MORE_FEATURES_TILE)} />
        {extraTiles.map((t) => <Tile key={t.key} s={t} onPress={t.onPress} />)}
      </View>
    </View>
  );
}

export { GRID_PADDING, COLUMN_GAP };

function createStyles(colors) {
  return StyleSheet.create({
    sectionHead: { paddingHorizontal: 14, paddingTop: 2, paddingBottom: 8 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.navy },
    grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: GRID_PADDING, gap: COLUMN_GAP },
    item: { height: 92, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', marginBottom: 0, shadowColor: '#000000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
    itemDisabled: { opacity: 0.55 },
    iconWrap: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
    name: { fontSize: 11, fontWeight: '700', textAlign: 'center', color: colors.text, lineHeight: 14 },
  });
}
