import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius, spacing } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import AdvertiserFormModal from '../components/AdvertiserFormModal';
import { ADVERTISER_STATUS_LABELS } from '../constants/adEnums';
import * as adService from '../firebase/adService';

// PHASE 9 - MY SHEBA ADVERTISER AND CAMPAIGN MANAGEMENT.
//
// Super Admin-only list screen for ad_advertisers docs - the brief's
// ADVERTISER "Admin can: Create advertiser / Edit advertiser / Activate /
// Deactivate" actions live here, same gating and list/form-modal shape as
// BannerManagementScreen.js. "View campaigns / View analytics / View
// payment history" are AdvertiserDetailScreen's job (opened by tapping a
// card here) - this screen itself is just the roster.

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'suspended', label: 'Inactive' },
];

function AdvertiserCard({ advertiser, onOpen, onEdit, onActivate, onDeactivate, busy }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const isActive = advertiser.status === 'active';

  return (
    <TouchableOpacity style={styles.card} onPress={() => onOpen(advertiser)} activeOpacity={0.8}>
      <View style={styles.cardTopRow}>
        {advertiser.logoUrl ? (
          <Image source={{ uri: advertiser.logoUrl }} style={styles.logo} />
        ) : (
          <View style={[styles.logo, styles.logoPlaceholder]}><Text style={{ fontSize: 18 }}>🏢</Text></View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{advertiser.companyName || 'Untitled advertiser'}</Text>
          <Text style={styles.meta} numberOfLines={1}>{advertiser.contactName} · {advertiser.contactPhone}</Text>
        </View>
        <View style={[styles.statusBadge, isActive ? styles.statusBadgeOn : styles.statusBadgeOff]}>
          <Text style={[styles.statusBadgeText, isActive ? styles.statusBadgeTextOn : styles.statusBadgeTextOff]}>
            {ADVERTISER_STATUS_LABELS[advertiser.status] || advertiser.status}
          </Text>
        </View>
      </View>

      {busy ? (
        <View style={styles.actionsRow}><ActivityIndicator size="small" color={colors.primary} /></View>
      ) : (
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => onEdit(advertiser)}>
            <Text style={styles.actionBtnText}>Edit</Text>
          </TouchableOpacity>
          {isActive ? (
            <TouchableOpacity style={styles.actionBtn} onPress={() => onDeactivate(advertiser)}>
              <Text style={styles.actionBtnText}>Deactivate</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.actionBtn} onPress={() => onActivate(advertiser)}>
              <Text style={styles.actionBtnText}>Activate</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.actionBtn} onPress={() => onOpen(advertiser)}>
            <Text style={styles.actionBtnText}>View →</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function AdvertiserManagementScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { profile, goBackOrHome, openAdvertiserDetail } = useApp();
  const isSuperadmin = profile && profile.role === 'superadmin';

  const [advertisers, setAdvertisers] = useState(undefined);
  const [statusFilter, setStatusFilter] = useState('all');
  const [formVisible, setFormVisible] = useState(false);
  const [editingAdvertiser, setEditingAdvertiser] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!isSuperadmin) return undefined;
    return adService.subscribeAdvertisers(setAdvertisers, () => setAdvertisers([]));
  }, [isSuperadmin]);

  const filtered = useMemo(() => {
    const list = advertisers || [];
    if (statusFilter === 'all') return list;
    return list.filter((a) => (a.status || 'active') === statusFilter);
  }, [advertisers, statusFilter]);

  const openCreate = () => { setEditingAdvertiser(null); setFormVisible(true); };
  const openEdit = (advertiser) => { setEditingAdvertiser(advertiser); setFormVisible(true); };
  const closeForm = () => { setFormVisible(false); setEditingAdvertiser(null); };

  const submitForm = async (payload) => {
    if (editingAdvertiser) {
      await adService.updateAdvertiser(editingAdvertiser.id, payload);
    } else {
      await adService.createAdvertiser(payload);
    }
    closeForm();
  };

  const runAction = async (advertiser, action, label) => {
    if (busyId) return;
    setBusyId(advertiser.id);
    try {
      await action();
    } catch (e) {
      showAlert('MySheba', e.message || `Could not ${label} this advertiser.`);
    } finally {
      setBusyId(null);
    }
  };
  const onActivate = (advertiser) => runAction(advertiser, () => adService.activateAdvertiser(advertiser.id), 'activate');
  const onDeactivate = (advertiser) => runAction(advertiser, () => adService.deactivateAdvertiser(advertiser.id), 'deactivate');
  const onOpen = (advertiser) => openAdvertiserDetail(advertiser.id);

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🏢 Advertiser Management</Text>
        {isSuperadmin && (
          <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
            <Text style={styles.addBtnText}>+ New</Text>
          </TouchableOpacity>
        )}
      </LinearGradient>

      {!isSuperadmin ? (
        <View style={styles.deniedWrap}>
          <Text style={styles.deniedText}>Only a Super Admin can manage advertisers.</Text>
        </View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterBarContent}>
            {STATUS_FILTERS.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterChip, statusFilter === f.key && styles.filterChipActive]}
                onPress={() => setStatusFilter(f.key)}
              >
                <Text style={[styles.filterChipText, statusFilter === f.key && styles.filterChipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {advertisers === undefined ? (
            <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}>
              {filtered.length === 0 ? (
                <View style={styles.center}>
                  <Text style={{ fontSize: 36, marginBottom: 8 }}>🏢</Text>
                  <Text style={styles.emptyText}>No advertisers match this filter.</Text>
                </View>
              ) : (
                filtered.map((advertiser) => (
                  <AdvertiserCard
                    key={advertiser.id}
                    advertiser={advertiser}
                    busy={busyId === advertiser.id}
                    onOpen={onOpen}
                    onEdit={openEdit}
                    onActivate={onActivate}
                    onDeactivate={onDeactivate}
                  />
                ))
              )}
            </ScrollView>
          )}
        </>
      )}

      <AdvertiserFormModal visible={formVisible} advertiser={editingAdvertiser} onSubmit={submitForm} onCancel={closeForm} />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 4, flex: 1 },
    addBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill },
    addBtnText: { color: 'white', fontWeight: '700', fontSize: 12 },
    deniedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
    deniedText: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 30 },
    emptyText: { fontSize: 13, color: '#999', textAlign: 'center' },
    filterBar: { flexGrow: 0, marginTop: spacing.sm },
    filterBarContent: { paddingHorizontal: spacing.md, gap: 8, paddingBottom: 6 },
    filterChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterChipText: { fontSize: 11.5, fontWeight: '600', color: colors.text },
    filterChipTextActive: { color: 'white' },
    card: {
      backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
      padding: 12, marginBottom: 12,
    },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    logo: { width: 42, height: 42, borderRadius: radius.sm },
    logoPlaceholder: { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
    name: { fontSize: 14.5, fontWeight: '700', color: colors.text },
    meta: { fontSize: 11.5, color: colors.textSecondary, marginTop: 1 },
    actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    actionBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary },
    actionBtnText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
    statusBadge: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.pill },
    statusBadgeText: { fontSize: 9.5, fontWeight: '700' },
    statusBadgeOn: { backgroundColor: '#E8F5E9' },
    statusBadgeTextOn: { color: '#2E7D32' },
    statusBadgeOff: { backgroundColor: '#FFEBEE' },
    statusBadgeTextOff: { color: '#C62828' },
  });
}
