import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { useLanguage } from '../i18n/LanguageContext';

const SERVICES = [
  { key: 'recharge', icon: '📱', bg: '#E8F5E9', accent: '#43A047', name: 'Recharge', kind: 'service' },
  { key: 'mobilebanking', icon: '🏦', bg: '#E3F2FD', accent: '#1E88E5', name: 'Mobile Banking', kind: 'service' },
  { key: 'internet', icon: '📡', bg: '#FFF3E0', accent: '#FB8C00', name: 'Internet', kind: 'service' },
  { key: 'remittance', icon: '💸', bg: '#F3E5F5', accent: '#8E24AA', name: 'Remittance', kind: 'service' },
  { key: 'bus', icon: '🚌', bg: '#FCE4EC', accent: '#D81B60', name: 'Bus', pointsKey: 'bus-redbus', pointsLabel: 'pts on payment', kind: 'buspicker' },
  { key: 'train', icon: '🚂', bg: '#E0F7FA', accent: '#00ACC1', name: 'Train', pointsKey: 'train', pointsLabel: 'pts on payment', kind: 'webview' },
  { key: 'flight', icon: '✈️', bg: '#E8EAF6', accent: '#3949AB', name: 'Flight', kind: 'service' },
  { key: 'fomema', icon: '🏥', bg: '#E8F5E9', accent: '#43A047', name: 'FOMEMA', pointsKey: 'fomema', pointsLabel: 'pts on search', kind: 'webview' },
  { key: 'visa', icon: '🛂', bg: '#F3E5F5', accent: '#8E24AA', name: 'Visa', pointsKey: 'visa', pointsLabel: 'pts on search', kind: 'webview' },
  { key: 'mydigital', icon: '💻', bg: '#E1F5FE', accent: '#0288D1', name: 'Malaysia Arrival Card', pointsKey: 'mydigital', pointsLabel: 'pts on submit', kind: 'webview' },
  { key: 'passport', icon: '📔', bg: '#FFF8E1', accent: '#F9A825', name: 'Passport', pointsKey: 'passport', pointsLabel: 'pts on submit', kind: 'webview' },
  { key: 'marketplace', icon: '🛒', bg: '#FFF3E0', accent: '#F4511E', name: 'Marketplace', kind: 'marketplace' },
  { key: 'myDocuments', icon: '📁', bg: '#E1F5FE', accent: '#0288D1', name: 'My Documents', kind: 'documents' },
  { key: 'salary', icon: '💰', bg: '#FFF8E1', accent: '#F9A825', name: 'Salary & OT', kind: 'salary' },
];

// Legacy social/chat/game/gift features are intentionally excluded from the
// customer-facing More Features list. This app is being presented as a
// finance and essential-services app, not a social or gaming hub.
const MORE_FEATURES = [
  { key: 'esim', icon: '📶', bg: '#E0F2F1', accent: '#00897B', name: 'MY e-SIM', pointsKey: 'esim', pointsLabel: 'pts on payment', kind: 'webview' },
  { key: 'support', icon: '🎧', bg: '#E0F7FA', accent: '#00838F', name: 'Support', kind: 'support' },
  { key: 'history', icon: '🕒', bg: '#EDE7F6', accent: '#5E35B1', name: 'History', kind: 'history' },
  { key: 'myAccount', icon: '🧾', bg: '#FFF8E1', accent: '#F9A825', name: 'My Account', kind: 'myaccount' },
  { key: 'profile', icon: '👤', bg: '#E1F5FE', accent: '#0288D1', name: 'Profile', kind: 'profile' },
  { key: 'notepad', icon: '🗒️', bg: '#FFFDE7', accent: '#F9A825', name: 'Notepad', kind: 'notepad' },
];

const ICON_SETS = {
  classic: {},
  modern: { recharge:'⚡', mobilebanking:'💳', internet:'🌐', remittance:'🌍', bus:'🚌', train:'🚆', flight:'✈️', fomema:'🩺', visa:'🪪', mydigital:'🛬', passport:'📕', marketplace:'🛍️', myDocuments:'🗂️', salary:'💵', esim:'📲', support:'🎧', history:'⏱️', myAccount:'👛', profile:'👤', notepad:'📝', moreFeaturesTile:'✨' },
  filled: { recharge:'🔋', mobilebanking:'💳', internet:'📶', remittance:'💰', bus:'🚍', train:'🚆', flight:'🛫', fomema:'🩺', visa:'🪪', mydigital:'🛬', passport:'📘', marketplace:'🛒', myDocuments:'📚', salary:'💵', esim:'📲', support:'🎧', history:'🕘', myAccount:'💼', profile:'👤', notepad:'📒', moreFeaturesTile:'⭐' },
  outline: { recharge:'▱', mobilebanking:'▢', internet:'◎', remittance:'◇', bus:'▭', train:'▤', flight:'△', fomema:'♡', visa:'□', mydigital:'⌁', passport:'▯', marketplace:'⌑', myDocuments:'▧', salary:'＄', esim:'⌁', support:'◉', history:'◷', myAccount:'▣', profile:'○', notepad:'▤', moreFeaturesTile:'✧' },
  playful: { recharge:'🔋', mobilebanking:'💳', internet:'🚀', remittance:'💸', bus:'🚌', train:'🚂', flight:'🛩️', fomema:'🩺', visa:'🛂', mydigital:'🛬', passport:'📗', marketplace:'🛍️', myDocuments:'📂', salary:'🤑', esim:'📱', support:'🎧', history:'⏰', myAccount:'🧾', profile:'🙂', notepad:'📝', moreFeaturesTile:'🌟' },
  compact: { recharge:'▣', mobilebanking:'▤', internet:'◉', remittance:'↗', bus:'▰', train:'▰', flight:'➤', fomema:'✚', visa:'▢', mydigital:'↘', passport:'▯', marketplace:'▱', myDocuments:'▧', salary:'$', esim:'▥', support:'◉', history:'◷', myAccount:'▣', profile:'○', notepad:'▤', moreFeaturesTile:'✦' },
};

// Exactly 12 home tiles: 11 requested services + More Features.
const NUM_COLUMNS = 4;
const GRID_PADDING = 10;
const COLUMN_GAP = 6;
const ITEM_PERCENT = `${100 / NUM_COLUMNS - 2}%`;
const PRIMARY_SERVICES = SERVICES.slice(0, 11);
const MORE_SERVICES = [...SERVICES.slice(11), ...MORE_FEATURES];
const MORE_FEATURES_TILE = { key: 'moreFeaturesTile', icon: '✨', bg: '#EDE7F6', accent: '#5E35B1', name: 'More Features', kind: 'moreFeaturesLink' };

function hexLuminance(hex) {
  const raw = String(hex || '').replace('#', ''); if (raw.length !== 6) return 1;
  const rgb = [0, 2, 4].map((i) => parseInt(raw.slice(i, i + 2), 16) / 255);
  const linear = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
function contrastText(hex) { return hexLuminance(hex) > 0.55 ? '#000000' : '#FFFFFF'; }
function gridCanvas(gridStyle, colors, isDark) {
  const dark = isDark ? { bordered:'#0B0F12', classic:'#0B1220', soft:'#101418', minimal:'transparent', glass:'#0E1A24', threeD:'#0D1116', gradient:'#17122A', neon:'#050709', bento:'#0C1015', adaptive:'#0B1512' } : { bordered:'#F5F7FA', classic:'#EEF5FF', soft:'#F7FAFC', minimal:'transparent', glass:'#EAF6FF', threeD:'#EEF1F5', gradient:'#F0ECFF', neon:'#EEF2F5', bento:'#F4F0FF', adaptive:'#ECF9F3' };
  return dark[gridStyle] || colors.bg;
}

export function Tile({ s, onPress, disabled, index = 0 }) {
  const { colors, isDark, gridStyle, iconStyle } = useTheme();
  const { t } = useLanguage(); const styles = createStyles(colors);
  const label = t(`service.${s.key}`, s.name);
  const icon = (ICON_SETS[iconStyle] && ICON_SETS[iconStyle][s.key]) || s.icon || '•';
  const gradientColors = [colors.primary, colors.secondary]; const gradientText = contrastText(gradientColors[0]);
  const adaptive = gridStyle === 'adaptive' && index < 4; const iconBg = isDark ? '#FFFFFF14' : s.bg;
  const iconStyleView = [styles.iconWrap, { backgroundColor: iconBg, borderColor: s.accent }, gridStyle === 'bordered' && styles.iconBordered, gridStyle === 'classic' && styles.iconClassic, gridStyle === 'soft' && styles.iconSoft, gridStyle === 'minimal' && styles.iconMinimal, gridStyle === 'glass' && styles.iconGlass, gridStyle === 'threeD' && styles.iconThreeD, gridStyle === 'neon' && styles.iconNeon, gridStyle === 'gradient' && styles.iconGradient, gridStyle === 'bento' && styles.iconBento, gridStyle === 'adaptive' && styles.iconAdaptive];
  const content = <><View style={iconStyleView}><Text style={[styles.iconText, { color: s.accent }, gridStyle === 'neon' && styles.iconTextNeon, gridStyle === 'gradient' && { color: gradientText }]}>{icon}</Text></View><Text style={[styles.name, gridStyle === 'gradient' && { color: gradientText }, gridStyle === 'neon' && { color: '#FFFFFF' }]} numberOfLines={2}>{label}</Text></>;
  const common = [styles.item, { width: ITEM_PERCENT }, disabled && styles.itemDisabled, adaptive && styles.itemAdaptive];
  if (gridStyle === 'gradient') return <TouchableOpacity style={common} activeOpacity={0.82} disabled={disabled} onPress={onPress}><LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradientFill}>{content}</LinearGradient></TouchableOpacity>;
  return <TouchableOpacity style={[...common, gridStyle === 'bordered' && styles.bordered, gridStyle === 'classic' && styles.classic, gridStyle === 'soft' && styles.soft, gridStyle === 'minimal' && styles.minimal, gridStyle === 'glass' && styles.glass, gridStyle === 'threeD' && styles.threeD, gridStyle === 'neon' && styles.neon, gridStyle === 'bento' && styles.bento, gridStyle === 'adaptive' && styles.adaptive]} activeOpacity={0.82} disabled={disabled} onPress={onPress}>{gridStyle === 'classic' && <View style={[styles.classicBar, { backgroundColor: s.accent }]} />}{gridStyle === 'adaptive' && adaptive && <View style={[styles.adaptiveBar, { backgroundColor: colors.primary }]} />}{content}</TouchableOpacity>;
}

export function useServiceAction() {
  const { startService, openWebView, openBusPicker, openMarketplace, openSalary, openMyDocuments, openNotepad, openAccommodation, openRoomSharing, openCommunity, openServiceProvidersHome, openChatHub, openSocialFeed, setScreen } = useApp();
  return (s) => {
    if (s.kind === 'webview') return openWebView(s.key); if (s.kind === 'buspicker') return openBusPicker(); if (s.kind === 'marketplace') return openMarketplace(); if (s.kind === 'salary') return openSalary(); if (s.kind === 'documents') return openMyDocuments(); if (s.kind === 'notepad') return openNotepad(); if (s.kind === 'accommodation') return openAccommodation(); if (s.kind === 'roomsharing') return openRoomSharing(); if (s.kind === 'community') return openCommunity(); if (s.kind === 'social') return openSocialFeed(); if (s.kind === 'localservices') return openServiceProvidersHome(); if (s.kind === 'chathub') return openChatHub(); if (s.kind === 'moreFeaturesLink') return setScreen('moreFeatures'); if (s.kind === 'support') return setScreen('support'); if (s.kind === 'history') return setScreen('history'); if (s.kind === 'myaccount') return setScreen('myAccount'); if (s.kind === 'profile') return setScreen('profile'); return startService(s.key);
  };
}
export { MORE_SERVICES };

export default function ServiceGrid({ extraTiles = [] }) {
  const { colors, isDark, gridStyle } = useTheme(); const styles = createStyles(colors); const { webViewBusy } = useApp(); const handlePress = useServiceAction();
  return <View><View style={styles.sectionHead}><Text style={styles.sectionTitle}>Services</Text></View><View style={[styles.gridCanvas, { backgroundColor: gridCanvas(gridStyle, colors, isDark) }, gridStyle === 'minimal' && styles.gridCanvasMinimal]}><View style={styles.grid}>{PRIMARY_SERVICES.map((s, index) => <Tile key={s.key} s={s} index={index} disabled={s.kind === 'webview' && webViewBusy} onPress={() => handlePress(s)} />)}<Tile s={MORE_FEATURES_TILE} index={PRIMARY_SERVICES.length} onPress={() => handlePress(MORE_FEATURES_TILE)} />{extraTiles.map((t, index) => <Tile key={t.key} s={t} index={PRIMARY_SERVICES.length + index + 1} onPress={t.onPress} />)}</View></View></View>;
}
export { GRID_PADDING, COLUMN_GAP };

function createStyles(colors) {
  return StyleSheet.create({
    sectionHead: { paddingHorizontal: 14, paddingTop: 2, paddingBottom: 8 }, sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.navy }, gridCanvas: { marginHorizontal: 4, borderRadius: radius.xl, paddingVertical: 8, overflow: 'hidden' }, gridCanvasMinimal: { paddingVertical: 0 }, grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: GRID_PADDING, columnGap: COLUMN_GAP, rowGap: 8, alignContent: 'flex-start' }, item: { minHeight: 158, borderRadius: radius.lg, paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    bordered: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 }, classic: { backgroundColor: colors.card, borderWidth: 1, borderColor: `${colors.primary}66` }, soft: { backgroundColor: isLight(colors) ? '#F7FAFC' : '#101010', borderWidth: 0 }, minimal: { backgroundColor: 'transparent', borderWidth: 0 }, glass: { backgroundColor: isLight(colors) ? '#FFFFFFD9' : '#FFFFFF12', borderWidth: 1, borderColor: isLight(colors) ? '#FFFFFF' : '#FFFFFF30', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 }, threeD: { backgroundColor: colors.card, borderWidth: 1, borderColor: `${colors.primary}55`, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 0, shadowOffset: { width: 0, height: 4 }, elevation: 5, transform: [{ translateY: -1 }] }, neon: { backgroundColor: isLight(colors) ? '#10151A' : '#080A0C', borderWidth: 1, borderColor: `${colors.primary}99`, shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 4 }, bento: { backgroundColor: colors.card, borderWidth: 1, borderColor: `${colors.primary}55`, minHeight: 158, paddingHorizontal: 8 }, adaptive: { backgroundColor: colors.card, borderWidth: 1, borderColor: `${colors.primary}44` }, itemAdaptive: { shadowColor: colors.primary, shadowOpacity: 0.18, shadowRadius: 7, shadowOffset: { width: 0, height: 2 }, elevation: 4 }, classicBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 }, adaptiveBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 }, gradientFill: { flex: 1, width: '100%', minHeight: 158, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 4 }, iconWrap: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8, borderWidth: 1 }, iconBordered: { backgroundColor: colors.card, borderColor: colors.border }, iconClassic: { backgroundColor: `${colors.primary}12`, borderWidth: 1 }, iconSoft: { backgroundColor: isLight(colors) ? '#FFFFFF' : '#181818', borderWidth: 0 }, iconMinimal: { backgroundColor: 'transparent', borderWidth: 0 }, iconGlass: { backgroundColor: isLight(colors) ? '#FFFFFF99' : '#FFFFFF10', borderColor: isLight(colors) ? '#FFFFFF' : '#FFFFFF30' }, iconThreeD: { backgroundColor: colors.card, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 0, shadowOffset: { width: 0, height: 3 }, elevation: 3 }, iconNeon: { backgroundColor: '#FFFFFF0A', borderColor: `${colors.primary}AA`, shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 3 }, iconGradient: { backgroundColor: '#FFFFFF18', borderColor: '#FFFFFF45' }, iconBento: { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}55`, borderRadius: 16 }, iconAdaptive: { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}66`, borderRadius: 14 }, iconText: { fontSize: 27, fontWeight: '700', lineHeight: 30, textAlign: 'center' }, iconTextNeon: { textShadowColor: '#FFFFFF', textShadowOpacity: 0.25, textShadowRadius: 5 }, name: { fontSize: 11, fontWeight: '700', textAlign: 'center', color: colors.text, lineHeight: 15, flexShrink: 1 }, itemDisabled: { opacity: 0.55 }
  });
}
function isLight(colors) { return colors && colors.bg === '#FFFFFF'; }
