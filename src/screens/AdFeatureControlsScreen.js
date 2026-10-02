import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, StyleSheet, Platform } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius, spacing } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import { FEATURE_ID_LIST } from '../constants/adFeatures';
import * as adControlsService from '../firebase/adControlsService';

// Super Admin-only screen (PHASE 2 brief: "Advertisement -> Feature Ad
// Controls"). Two independent control layers, both backed by
// src/firebase/adControlsService.js / functions/adControlsService.js:
//   1. Global Controls (ad_settings/general) - Global Ads / Direct
//      MySheba Ads / Banner / Native / Interstitial.
//   2. Feature Controls (ad_feature_controls/{featureId}) - per-feature
//      Ads / Banner / Native / Interstitial, one row per FEATURE_ID_LIST
//      entry (adFeatures.ts).
// Neither layer ever touches a feature's own functionality - see
// canShowAd's header comment in adControlsService.js. Turning every
// switch on this screen off does not disable Mobile Recharge, Jobs, or
// any other MySheba feature; it only ever affects whether an
// advertisement is allowed to render.

const GLOBAL_TOGGLES = [
  { key: 'adsEnabled', label: 'Global Ads', sub: 'Master switch - off disables every ad, everywhere.' },
  { key: 'directAdsEnabled', label: 'Direct MySheba Ads', sub: 'Ads sold and managed directly through MySheba.' },
  { key: 'bannerAdsEnabled', label: 'Banner Ads', sub: 'Banner-format ads, across every feature.' },
  { key: 'nativeAdsEnabled', label: 'Native Ads', sub: 'Native-format ads, across every feature.' },
  { key: 'interstitialAdsEnabled', label: 'Interstitial Ads', sub: 'Full-screen interstitial ads, across every feature.' },
];

const FEATURE_COLUMNS = [
  { key: 'adsEnabled', label: 'Ads' },
  { key: 'bannerEnabled', label: 'Banner' },
  { key: 'nativeEnabled', label: 'Native' },
  { key: 'interstitialEnabled', label: 'Interstitial' },
];

function GlobalToggleRow({ label, sub, value, disabled, onValueChange }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return (
    <View style={styles.globalRow}>
      <View style={styles.globalRowText}>
        <Text style={styles.globalRowLabel}>{label}</Text>
        <Text style={styles.globalRowSub}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: '#DDD', true: colors.primary }}
        thumbColor={Platform.OS === 'android' ? 'white' : undefined}
      />
    </View>
  );
}

function statusFor(control) {
  if (!control.adsEnabled) return { label: 'Ads Off', tone: 'off' };
  const allOn = control.bannerEnabled && control.nativeEnabled && control.interstitialEnabled;
  if (allOn) return { label: 'Active', tone: 'on' };
  return { label: 'Partial', tone: 'partial' };
}

export default function AdFeatureControlsScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { profile, goBackOrHome } = useApp();
  const isSuperadmin = profile && profile.role === 'superadmin';

  const [adSettings, setAdSettings] = useState(adControlsService.DEFAULT_AD_SETTINGS);
  const [featureControls, setFeatureControls] = useState(adControlsService.DEFAULT_AD_FEATURE_CONTROLS);
  const [busyGlobalKey, setBusyGlobalKey] = useState(null);
  const [busyCell, setBusyCell] = useState(null); // `${featureId}:${field}`
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    if (!isSuperadmin) return undefined;
    const unsub = adControlsService.subscribeAdSettings(setAdSettings, () => {});
    return unsub;
  }, [isSuperadmin]);

  useEffect(() => {
    if (!isSuperadmin) return undefined;
    const unsub = adControlsService.subscribeAdFeatureControls(setFeatureControls, () => {});
    return unsub;
  }, [isSuperadmin]);

  const toggleGlobal = async (key, currentlyEnabled) => {
    if (busyGlobalKey) return;
    setBusyGlobalKey(key);
    try {
      await adControlsService.updateAdSettings({ [key]: !currentlyEnabled });
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not update this Global Control.');
    } finally {
      setBusyGlobalKey(null);
    }
  };

  const toggleFeatureCell = async (featureId, field, currentlyEnabled) => {
    const cellId = `${featureId}:${field}`;
    if (busyCell) return;
    setBusyCell(cellId);
    try {
      await adControlsService.updateAdFeatureControl(featureId, { [field]: !currentlyEnabled });
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not update this feature\'s ad controls.');
    } finally {
      setBusyCell(null);
    }
  };

  const runBulk = async (changes, label) => {
    if (bulkBusy) return;
    setBulkBusy(true);
    try {
      await adControlsService.bulkUpdateAdFeatureControls(FEATURE_ID_LIST, changes);
    } catch (e) {
      showAlert('MySheba', e.message || `Could not ${label.toLowerCase()}.`);
    } finally {
      setBulkBusy(false);
    }
  };

  const confirmBulk = (turnOn) => {
    const changes = { adsEnabled: turnOn, bannerEnabled: turnOn, nativeEnabled: turnOn, interstitialEnabled: turnOn };
    const label = turnOn ? 'Enable All' : 'Disable All';
    showAlert(
      label,
      turnOn
        ? 'Turn every ad control ON for every feature? This does not affect Global Controls above.'
        : 'Turn every ad control OFF for every feature? Features keep working normally - only their ads stop showing. This does not affect Global Controls above.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: label, style: turnOn ? 'default' : 'destructive', onPress: () => runBulk(changes, label) },
      ]
    );
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📢 Feature Ad Controls</Text>
      </LinearGradient>

      {!isSuperadmin ? (
        <View style={styles.deniedWrap}>
          <Text style={styles.deniedText}>Only a Super Admin can manage advertisement controls.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
          <Text style={styles.hint}>
            These switches control only whether advertisements show. Disabling ads here never disables the
            underlying MySheba feature - Mobile Recharge, Jobs, and every other feature keep working normally.
          </Text>

          <Text style={styles.sectionTitle}>Global Controls</Text>
          <View style={styles.card}>
            {GLOBAL_TOGGLES.map((t, idx) => (
              <View key={t.key}>
                <GlobalToggleRow
                  label={t.label}
                  sub={t.sub}
                  value={adSettings[t.key] !== false}
                  disabled={busyGlobalKey === t.key}
                  onValueChange={() => toggleGlobal(t.key, adSettings[t.key] !== false)}
                />
                {idx < GLOBAL_TOGGLES.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>

          <View style={styles.sectionHeadRow}>
            <Text style={styles.sectionTitle}>Feature Controls</Text>
            <View style={styles.bulkBtnRow}>
              <TouchableOpacity
                style={[styles.bulkBtn, styles.bulkBtnEnable]}
                activeOpacity={0.7}
                disabled={bulkBusy}
                onPress={() => confirmBulk(true)}
              >
                <Text style={styles.bulkBtnEnableText}>Enable All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.bulkBtn, styles.bulkBtnDisable]}
                activeOpacity={0.7}
                disabled={bulkBusy}
                onPress={() => confirmBulk(false)}
              >
                <Text style={styles.bulkBtnDisableText}>Disable All</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Column headers */}
          <View style={styles.headerRow}>
            <View style={styles.featureCol} />
            {FEATURE_COLUMNS.map((c) => (
              <View key={c.key} style={styles.toggleCol}>
                <Text style={styles.colLabel} numberOfLines={2}>{c.label}</Text>
              </View>
            ))}
            <View style={styles.statusCol}>
              <Text style={styles.colLabel}>Status</Text>
            </View>
          </View>

          {FEATURE_ID_LIST.map((featureId) => {
            const control = featureControls[featureId] || adControlsService.DEFAULT_AD_FEATURE_CONTROLS[featureId];
            const status = statusFor(control);
            return (
              <View key={featureId} style={styles.row}>
                <View style={styles.featureCol}>
                  <Text style={styles.featureName} numberOfLines={2}>{control.featureName}</Text>
                </View>
                {FEATURE_COLUMNS.map((c) => {
                  const enabled = control[c.key] !== false;
                  const cellId = `${featureId}:${c.key}`;
                  // Banner/Native/Interstitial for this feature only matter
                  // while this feature's own Ads switch is on - dim (but
                  // still tappable) when the row's Ads master is off, same
                  // "master gates the rest" relationship as Global Ads
                  // above (see canShowAd in adControlsService.js).
                  const dimmed = c.key !== 'adsEnabled' && !control.adsEnabled;
                  return (
                    <View key={c.key} style={styles.toggleCol}>
                      <Switch
                        style={styles.smallSwitch}
                        value={enabled}
                        disabled={busyCell === cellId}
                        onValueChange={() => toggleFeatureCell(featureId, c.key, enabled)}
                        trackColor={{ false: '#DDD', true: dimmed ? colors.border : colors.primary }}
                        thumbColor={Platform.OS === 'android' ? 'white' : undefined}
                      />
                    </View>
                  );
                })}
                <View style={styles.statusCol}>
                  <View style={[styles.statusBadge, styles[`statusBadge_${status.tone}`]]}>
                    <Text style={[styles.statusBadgeText, styles[`statusBadgeText_${status.tone}`]]}>{status.label}</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    deniedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
    deniedText: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
    hint: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 17 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
    sectionHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg, marginBottom: spacing.sm },
    card: {
      backgroundColor: colors.card, borderRadius: radius.lg,
      borderWidth: 1, borderColor: colors.border,
      paddingHorizontal: spacing.md,
    },
    divider: { height: 1, backgroundColor: colors.border },
    globalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
    globalRowText: { flex: 1 },
    globalRowLabel: { fontSize: 13.5, fontWeight: '600', color: colors.text },
    globalRowSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2, lineHeight: 15 },
    bulkBtnRow: { flexDirection: 'row', gap: 8 },
    bulkBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1 },
    bulkBtnEnable: { borderColor: colors.primary, backgroundColor: colors.card },
    bulkBtnEnableText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
    bulkBtnDisable: { borderColor: colors.error, backgroundColor: colors.card },
    bulkBtnDisableText: { color: colors.error, fontSize: 11, fontWeight: '700' },
    headerRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 6 },
    row: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.card, borderRadius: radius.lg,
      borderWidth: 1, borderColor: colors.border,
      paddingVertical: 8, marginBottom: 8,
    },
    featureCol: { flex: 1.5, paddingLeft: 10, paddingRight: 4 },
    featureName: { fontSize: 11.5, fontWeight: '600', color: colors.text },
    toggleCol: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    smallSwitch: { transform: [{ scale: 0.75 }] },
    statusCol: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    colLabel: { fontSize: 9.5, fontWeight: '700', color: colors.textSecondary, textAlign: 'center' },
    statusBadge: { paddingVertical: 3, paddingHorizontal: 7, borderRadius: radius.pill },
    statusBadgeText: { fontSize: 9, fontWeight: '700' },
    statusBadge_on: { backgroundColor: '#E8F5E9' },
    statusBadgeText_on: { color: '#2E7D32' },
    statusBadge_partial: { backgroundColor: '#FFF8E1' },
    statusBadgeText_partial: { color: '#F9A825' },
    statusBadge_off: { backgroundColor: '#FFEBEE' },
    statusBadgeText_off: { color: '#C62828' },
  });
}
