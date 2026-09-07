// Marketplace Admin Panel > Business Profiles (sitemap's Admin Panel,
// PRD section 15 Monetization Plan - "Business profile"). Admin/superadmin
// only (gated in Sidebar.js, same pattern as MarketplaceModerationScreen /
// VerificationManagementScreen). Unlike Verification (a review queue),
// Business Profile has no request to review - the admin just searches for
// a user and grants or revokes it directly, via the setBusinessProfileStatus
// Cloud Function (functions/businessProfileService.js).
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius, spacing } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import * as userManagementService from '../firebase/userManagementService';
import * as businessProfileService from '../firebase/businessProfileService';

const normalizeDigits = (v) => String(v || '').replace(/[^0-9]/g, '');

function matchesSearch(u, term) {
  if (!term) return true;
  const nameLower = String(u.name || '').toLowerCase();
  const termLower = term.toLowerCase();
  const termDigits = normalizeDigits(term);
  const nameMatch = nameLower.includes(termLower);
  const phoneMatch = termDigits.length > 0 && normalizeDigits(u.phone).includes(termDigits);
  return nameMatch || phoneMatch;
}

function UserRow({ u, biz, onGrant, onRevoke, busy }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const isBusiness = !!biz?.isBusinessProfile;
  return (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{u.name || '—'}</Text>
        <Text style={styles.meta}>{u.phone || '—'}</Text>
        {isBusiness && <Text style={styles.bizName}>🏢 {biz.businessName || 'Business'}</Text>}
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : isBusiness ? (
        <TouchableOpacity style={styles.revokeBtn} onPress={onRevoke}>
          <Text style={styles.revokeBtnText}>Revoke</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.grantBtn} onPress={onGrant}>
          <Text style={styles.grantBtnText}>Grant</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function AdminBusinessManagementScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome } = useApp();
  const [users, setUsers] = useState([]);
  const [bizByUid, setBizByUid] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [busyUid, setBusyUid] = useState(null);

  useEffect(() => {
    return userManagementService.subscribeAllUsers((list) => { setUsers(list); setLoading(false); }, () => setLoading(false));
  }, []);

  useEffect(() => {
    return businessProfileService.subscribeAllBusinessProfiles((list) => {
      const map = {};
      list.forEach((b) => { map[b.uid] = b; });
      setBizByUid(map);
    }, () => {});
  }, []);

  const term = searchTerm.trim();
  const filtered = users.filter((u) => matchesSearch(u, term));
  // Current businesses first, so the admin can see/manage existing grants
  // at a glance without searching for each one.
  const sorted = [...filtered].sort((a, b) => {
    const aBiz = bizByUid[a.id]?.isBusinessProfile ? 1 : 0;
    const bBiz = bizByUid[b.id]?.isBusinessProfile ? 1 : 0;
    return bBiz - aBiz;
  });

  const grant = async (u) => {
    setBusyUid(u.id);
    try {
      await businessProfileService.setBusinessProfileStatus(u.id, true);
      showAlert('MySheba', `${u.name || 'This user'} now has a Business Profile.`);
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not grant Business Profile.');
    } finally {
      setBusyUid(null);
    }
  };

  const revoke = async (u) => {
    setBusyUid(u.id);
    try {
      await businessProfileService.setBusinessProfileStatus(u.id, false);
      showAlert('MySheba', `Business Profile revoked for ${u.name || 'this user'}.`);
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not revoke Business Profile.');
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Business Profiles</Text>
      </LinearGradient>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or phone"
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {sorted.length === 0 ? (
            <View style={styles.center}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>🏢</Text>
              <Text style={styles.emptyText}>No users match your search.</Text>
            </View>
          ) : (
            sorted.map((u) => (
              <UserRow
                key={u.id}
                u={u}
                biz={bizByUid[u.id]}
                busy={busyUid === u.id}
                onGrant={() => grant(u)}
                onRevoke={() => revoke(u)}
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: spacing.lg, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '700', fontSize: 16, marginLeft: 6, flex: 1 },
    searchWrap: { padding: spacing.md, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    searchInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 14, fontSize: 13, color: colors.text, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 30 },
    emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
    body: { padding: spacing.lg, paddingBottom: spacing.xl + 12 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.sm,
      gap: 10,
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 5,
      elevation: 1,
    },
    name: { fontSize: 14, fontWeight: '700', color: colors.text },
    meta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    bizName: { fontSize: 11, fontWeight: '700', color: '#5E35B1', marginTop: 4 },
    grantBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 14 },
    grantBtnText: { color: 'white', fontSize: 12, fontWeight: '700' },
    revokeBtn: { backgroundColor: '#FDECEA', borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 14 },
    revokeBtnText: { color: colors.error, fontSize: 12, fontWeight: '700' },
  });
}
