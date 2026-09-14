import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { useLanguage } from '../i18n/LanguageContext';

const SERVICES = [
  { key: 'recharge', icon: '📱', name: 'Recharge', kind: 'service' },
  { key: 'mobilebanking', icon: '🏦', name: 'Mobile Banking', kind: 'service' },
  { key: 'internet', icon: '📡', name: 'Internet', kind: 'service' },
  { key: 'remittance', icon: '💸', name: 'Remittance', kind: 'service' },
  { key: 'bus', icon: '🚌', name: 'Bus', kind: 'buspicker' },
  { key: 'train', icon: '🚂', name: 'Train', kind: 'webview' },
  { key: 'flight', icon: '✈️', name: 'Flight', kind: 'service' },
  { key: 'fomema', icon: '🏥', name: 'FOMEMA', kind: 'webview' },
  { key: 'visa', icon: '🛂', name: 'Visa Malaysia', kind: 'webview' },
  { key: 'mydigital', icon: '🛬', name: 'Malaysia Arrival Card', kind: 'webview' },
  { key: 'passport', icon: '📔', name: 'Passport', kind: 'webview' },
];

const MORE_FEATURES_TILE = {
  key: 'moreFeaturesTile',
  icon: '✨',
  name: 'More Features',
  kind: 'moreFeaturesLink',
};

const PRIMARY_SERVICES = SERVICES;

function asSafeText(value, fallback = '') {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return fallback;
}

export function Tile({ s, onPress, disabled, index = 0 }) {
  const { colors } = useTheme();
  const { t } = useLanguage();

  // Never allow an arbitrary value returned by translation/config data to
  // become a direct child of View. React Native requires text nodes to live
  // inside Text; converting both fields here makes this component safe even
  // when a bad/missing translation value reaches the grid.
  const safeKey = asSafeText(s && s.key, 'service');
  const translated = typeof t === 'function' ? t(`service.${safeKey}`, s && s.name) : null;
  const label = asSafeText(translated, asSafeText(s && s.name, safeKey));
  const icon = asSafeText(s && s.icon, '•');
  const accent = asSafeText(s && s.accent, colors.primary || '#1A73E8');

  return (
    <TouchableOpacity
      style={[styles.item, { borderColor: accent }, disabled && styles.itemDisabled]}
      activeOpacity={0.82}
      disabled={!!disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${accent}18` }]}>
        <Text style={[styles.iconText, { color: accent }]}>{icon}</Text>
      </View>
      <Text style={[styles.name, { color: colors.text || '#222' }]} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function useServiceAction() {
  const {
    startService,
    openWebView,
    openBusPicker,
    openMarketplace,
    openSalary,
    openMyDocuments,
    openNotepad,
    openAccommodation,
    openRoomSharing,
    openCommunity,
    openServiceProvidersHome,
    openChatHub,
    openSocialFeed,
    setScreen,
  } = useApp();

  return (s) => {
    if (!s) return;
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

export { PRIMARY_SERVICES };

export default function ServiceGrid({ extraTiles = [] }) {
  const { colors } = useTheme();
  const { webViewBusy } = useApp();
  const handlePress = useServiceAction();

  const safeExtraTiles = Array.isArray(extraTiles)
    ? extraTiles.filter((tile) => tile && typeof tile === 'object')
    : [];

  return (
    <View>
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: colors.text || '#222' }]}>🎯 Quick Services</Text>
      </View>

      <View style={styles.gridCanvas}>
        <View style={styles.grid}>
          {PRIMARY_SERVICES.map((service, index) => (
            <Tile
              key={service.key}
              s={service}
              index={index}
              disabled={service.kind === 'webview' && !!webViewBusy}
              onPress={() => handlePress(service)}
            />
          ))}

          <Tile
            s={MORE_FEATURES_TILE}
            index={PRIMARY_SERVICES.length}
            onPress={() => handlePress(MORE_FEATURES_TILE)}
          />

          {safeExtraTiles.map((tile, index) => (
            <Tile
              key={asSafeText(tile.key, `extra-${index}`)}
              s={tile}
              index={PRIMARY_SERVICES.length + 1 + index}
              onPress={tile.onPress}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHead: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  gridCanvas: {
    marginHorizontal: 10,
    padding: 10,
    borderRadius: 16,
    backgroundColor: '#F5F7FA',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  item: {
    width: '23.5%',
    minHeight: 92,
    marginBottom: 8,
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemDisabled: {
    opacity: 0.45,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  iconText: {
    fontSize: 25,
  },
  name: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});
