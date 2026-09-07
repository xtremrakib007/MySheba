import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius, spacing } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import AdPackageFormModal from '../components/AdPackageFormModal';
import { PACKAGE_STATUS_FILTERS } from '../constants/adEnums';
import { PLACEMENT_LABELS } from '../constants/adPlacements';
import * as adService from '../firebase/adService';

// PHASE 10 - MY SHEBA ADVERTISING PACKAGES AND PAYMENTS - PACKAGES admin
// roster. Same "own screen, no id needed to open it" shape as
// AdvertiserManagementScreen - Create/Edit/Activate/Deactivate for every
// ad_packages doc, per the brief's ADMIN "Packages" action list.

function PackageCard({ pkg, onEdit, onActivate, onDeactivate, busy }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const placementLabels = (pkg.placements || []).map((id) => PLACEMENT_LABELS[id] || id);

  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <Text style={styles.name} numberOfLines={1}>{pkg.name || 'Untitled package'}</Text>
        <View style={[styles.statusBadge, pkg.active ? styles.statusBadgeOn : styles.statusBadgeOff]}>
          <Text style={[styles.statusBadgeText, pkg.active ? styles.statusBadgeTextOn : styles.statusBadgeTextOff]}>
            {pkg.active ? 'Active' : 'Inactive'}
          </Text>
        </View>
      </View>
      {!!pkg.description && <Text style={styles.meta}>{pkg.description}</Text>}
      <Text style={styles.price}>{pkg.currency || 'MYR'} {pkg.price || 0}</Text>
      <Text style={styles.meta}>{pkg.durationDays || 0} days · Priority {pkg.priority ?? 0} · {pkg.maxImpressions == null ? 'Unlimited impressions' : `${pkg.maxImpressions} max impressions`}</Text>
      {placementLabels.length > 0 && (
        <Text style={styles.meta} numberOfLines={2}>Placements: {placementLabels.join(', ')}</Text>
      )}

      {busy ? (
        <View style={styles.actionsRow}><ActivityIndicator size="small" color={colors.primary} /></View>
      ) : (
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => onEdit(pkg)}>
            <Text style={styles.actionBtnText}>Edit</Text>
          </TouchableOpacity>
          {pkg.active ? (
            <TouchableOpacity style={styles.actionBtn} onPress={() => onDeactivate(pkg)}>
              <Text style={styles.actionBtnText}>Deactivate</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.actionBtn} onPress={() => onActivate(pkg)}>
              <Text style={styles.actionBtnText}>Activate</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

export default function AdPackagesManagementScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { profile, goBackOrHome } = useApp();
  const isSuperadmin = profile && profile.role === 'superadmin';

  const [packages, setPackages] = useState(undefined);
  const [statusFilter, setStatusFilter] = useState('all');
  const [formVisible, setFormVisible] = useState(false);
  const [editingPackage, setEditingPackage] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!isSuperadmin) return undefined;
    return adService.subscribePackages(setPackages, () => setPackages([]));
  }, [isSuperadmin]);

  const filtered = useMemo(() => {
    const list = packages || [];
    if (statusFilter === 'active') return list.filter((p) => p.active !== false);
    if (statusFilter === 'inactive') return list.filter((p) => p.active === false);
    return list;
  }, [packages, statusFilter]);

  const openCreate = () => { setEditingPackage(null); setFormVisible(true); };
  const openEdit = (pkg) => { setEditingPackage(pkg); setFormVisible(true); };
  const closeForm = () => { setFormVisible(false); setEditingPackage(null); };

  const submitForm = async (payload) => {
    if (editingPackage) {
      await adService.updatePackage(editingPackage.id, payload);
    } else {
      await adService.createPackage(payload);
    }
    closeForm();
  };

  const runAction = async (pkg, action, label) => {
    if (busyId) return;
    setBusyId(pkg.id);
    try {
      await action();
    } catch (e) {
      showAlert('MySheba', e.message || `Could not ${label} this package.`);
    } finally {
      setBusyId(null);
    }
  };
  const onActivate = (pkg) => runAction(pkg, () => adService.activatePackage(pkg.id), 'activate');
  const onDeactivate = (pkg) => runAction(pkg, () => adService.deactivatePackage(pkg.id), 'deactivate');

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📦 Ad Packages</Text>
      </LinearGradient>

      {!isSuperadmin ? (
        <View style={styles.deniedWrap}>
          <Text style={styles.deniedText}>Only a Super Admin can manage advertising packages.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}>
          <View style={styles.tabHeaderRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {PACKAGE_STATUS_FILTERS.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.filterChip, statusFilter === f.key && styles.filterChipActive]}
                  onPress={() => setStatusFilter(f.key)}
                >
                  <Text style={[styles.filterChipText, statusFilter === f.key && styles.filterChipTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.newBtn} onPress={openCreate}>
              <Text style={styles.newBtnText}>+ New Package</Text>
            </TouchableOpacity>
          </View>

          {packages === undefined ? (
            <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
          ) : filtered.length === 0 ? (
            <View style={styles.center}>
              <Text style={{ fontSize: 32, marginBottom: 8 }}>📦</Text>
              <Text style={styles.emptyText}>No packages match this filter.</Text>
            </View>
          ) : (
            filtered.map((pkg) => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                busy={busyId === pkg.id}
                onEdit={openEdit}
                onActivate={onActivate}
                onDeactivate={onDeactivate}
              />
            ))
          )}
        </ScrollView>
      )}

      <AdPackageFormModal
        visible={formVisible}
        pkg={editingPackage}
        onSubmit={submitForm}
        onCancel={closeForm}
      />
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
    deniedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
    deniedText: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
    center: { alignItems: 'center', justifyContent: 'center', paddingTop: 40, paddingHorizontal: 30 },
    emptyText: { fontSize: 13, color: '#999', textAlign: 'center' },
    tabHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 },
    filterChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterChipText: { fontSize: 11, fontWeight: '600', color: colors.text },
    filterChipTextActive: { color: 'white' },
    newBtn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.sm, backgroundColor: colors.primary },
    newBtnText: { color: 'white', fontWeight: '700', fontSize: 11.5 },
    card: {
      backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
      padding: 12, marginBottom: 12,
    },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
    name: { fontSize: 14, fontWeight: '700', color: colors.text, flex: 1 },
    price: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 4 },
    meta: { fontSize: 11.5, color: colors.textSecondary, marginTop: 2 },
    actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
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
