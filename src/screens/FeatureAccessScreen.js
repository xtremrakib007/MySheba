import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius, spacing } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import { FEATURE_DEFS, TOGGLEABLE_ROLES, ROLE_LABEL, canAccessFeature } from '../firebase/featureAccessService';
import * as featureAccessService from '../firebase/featureAccessService';

// Superadmin-only screen: a checkbox matrix (feature x role) that controls
// which of Reseller/Dealer/Sub Dealer/Admin can open each management tool
// on their own Features page (AdminFeaturesScreen/DealerFeaturesScreen/
// ResellerFeaturesScreen all read the same settings/featureAccess doc via
// canAccessFeature - see featureAccessService.js). Customer-facing
// features (the Quick Services grid every role sees) are intentionally
// NOT shown here - those stay identical for everyone, per product
// requirement, and are never role-gated at all.
export default function FeatureAccessScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { profile, goBackOrHome, featureAccess } = useApp();
  const [busyCell, setBusyCell] = useState(null); // `${featureKey}:${role}` while saving

  const isSuperadmin = profile && profile.role === 'superadmin';

  const toggle = async (featureKey, role, currentlyEnabled) => {
    const cellId = `${featureKey}:${role}`;
    if (busyCell) return;
    setBusyCell(cellId);
    try {
      await featureAccessService.setFeatureAccessForRole(featureKey, role, !currentlyEnabled);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not update this feature access.');
    } finally {
      setBusyCell(null);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🔐 Feature Access</Text>
      </LinearGradient>

      {!isSuperadmin ? (
        <View style={styles.deniedWrap}>
          <Text style={styles.deniedText}>Only a superadmin can manage feature access.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
          <Text style={styles.hint}>
            Choose which roles can see and open each tool below. Customer features are the
            same for everyone and aren't listed here - Superadmin always has full access.
          </Text>

          {/* Column headers */}
          <View style={styles.headerRow}>
            <View style={styles.featureCol} />
            {TOGGLEABLE_ROLES.map((role) => (
              <View key={role} style={styles.roleCol}>
                <Text style={styles.roleColLabel} numberOfLines={2}>{ROLE_LABEL[role]}</Text>
              </View>
            ))}
          </View>

          {FEATURE_DEFS.map((feature) => (
            <View key={feature.key} style={styles.row}>
              <View style={styles.featureCol}>
                <View style={[styles.iconWrap, { backgroundColor: feature.bg }]}>
                  <Text style={styles.iconText}>{feature.icon}</Text>
                </View>
                <Text style={styles.featureName} numberOfLines={2}>{feature.name}</Text>
              </View>
              {TOGGLEABLE_ROLES.map((role) => {
                const enabled = canAccessFeature(featureAccess, feature.key, role);
                const cellId = `${feature.key}:${role}`;
                return (
                  <View key={role} style={styles.roleCol}>
                    <TouchableOpacity
                      style={[styles.checkbox, enabled && styles.checkboxChecked]}
                      activeOpacity={0.7}
                      disabled={busyCell === cellId}
                      onPress={() => toggle(feature.key, role, enabled)}
                    >
                      {!!enabled && <Text style={styles.checkMark}>✓</Text>}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ))}
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
    hint: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 17 },
    headerRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 6 },
    row: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.card, borderRadius: radius.lg,
      borderWidth: 1, borderColor: colors.border,
      paddingVertical: 10, marginBottom: 8,
    },
    featureCol: { flex: 1.6, flexDirection: 'row', alignItems: 'center', paddingLeft: 10, paddingRight: 4, gap: 8 },
    iconWrap: { width: 30, height: 30, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    iconText: { fontSize: 14 },
    featureName: { fontSize: 12, fontWeight: '600', color: colors.text, flexShrink: 1 },
    roleCol: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    roleColLabel: { fontSize: 10.5, fontWeight: '700', color: colors.textSecondary, textAlign: 'center' },
    checkbox: {
      width: 24, height: 24, borderRadius: 6,
      borderWidth: 1.5, borderColor: colors.border,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.bg,
    },
    checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
    checkMark: { color: 'white', fontSize: 14, fontWeight: '800' },
  });
}
