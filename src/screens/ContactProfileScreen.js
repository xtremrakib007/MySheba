// Contact Profile - a read-only view of another account.
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import VerifiedBadge from '../components/VerifiedBadge';
import BusinessBadge from '../components/BusinessBadge';
import * as authService from '../firebase/authService';
import * as businessProfileService from '../firebase/businessProfileService';

const ROLE_LABEL = { customer: 'Customer', dealer: 'Dealer', reseller: 'Reseller', admin: 'Admin', superadmin: 'Super Admin' };

export default function ContactProfileScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { goBackOrHome, activeContactProfileUid, openBusinessProfile } = useApp();

  const targetUid = activeContactProfileUid;
  const [target, setTarget] = useState(undefined);
  const [biz, setBiz] = useState(null);

  useEffect(() => {
    if (!targetUid) return;
    let cancelled = false;
    authService.fetchProfile(targetUid)
      .then((p) => { if (!cancelled) setTarget(p || null); })
      .catch(() => { if (!cancelled) setTarget(null); });
    return () => { cancelled = true; };
  }, [targetUid]);

  useEffect(() => {
    if (!targetUid) return undefined;
    return businessProfileService.subscribeBusinessProfile(targetUid, setBiz, () => setBiz(null));
  }, [targetUid]);

  const roleLabel = target ? (ROLE_LABEL[target.role] || target.role) : '';
  const displayName = (biz && biz.businessName) || target?.name || 'User';

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
      </LinearGradient>

      {target === undefined ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : target === null ? (
        <View style={styles.center}><Text style={styles.emptyText}>This profile is unavailable.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.profileCard}>
            {target.avatarUrl ? (
              <Image source={{ uri: target.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={[styles.avatarImage, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitial}>{displayName.trim().charAt(0).toUpperCase()}</Text>
              </View>
            )}

            <Text style={styles.name}>{displayName}</Text>

            <View style={styles.badgeRow}>
              {!!biz && <BusinessBadge isBusiness size="md" />}
              <VerifiedBadge verified={target.verified} size="md" />
            </View>

            {!!roleLabel && <Text style={styles.roleLabel}>{roleLabel}</Text>}
            {!!target.userId && (
              <View style={styles.idPill}><Text style={styles.idPillText}>ID {target.userId}</Text></View>
            )}
          </View>

          {!!biz && (
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => openBusinessProfile(targetUid)}>
                <Text style={styles.actionIcon}>🏪</Text>
                <Text style={styles.actionLabel}>Business Profile</Text>
              </TouchableOpacity>
            </View>
          )}
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
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
    emptyText: { fontSize: 13, color: colors.text, textAlign: 'center', lineHeight: 19 },
    body: { padding: 16, paddingBottom: 40 },
    profileCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 24, alignItems: 'center', marginBottom: 16 },
    avatarImage: { width: 92, height: 92, borderRadius: 46 },
    avatarPlaceholder: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    avatarInitial: { fontSize: 34, fontWeight: '700', color: 'white' },
    name: { fontSize: 19, fontWeight: '700', color: colors.text, marginTop: 14, textAlign: 'center' },
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    roleLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginTop: 8 },
    idPill: { backgroundColor: '#F0F0F0', borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 12, marginTop: 10 },
    idPillText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
    actionRow: { flexDirection: 'row', gap: 10 },
    actionBtn: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: 16, alignItems: 'center' },
    actionIcon: { fontSize: 22, marginBottom: 6 },
    actionLabel: { fontSize: 12, fontWeight: '600', color: colors.text },
  });
}
