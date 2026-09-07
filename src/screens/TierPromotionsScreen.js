import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Switch } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius, spacing } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import PromptModal from '../components/PromptModal';
import * as progressionService from '../firebase/progressionService';

// Superadmin-only screen: one card per Tier, each with its own promotion
// a superadmin can edit - fee discount % (the actual enforcement point is
// functions/walletService.js's chargeProductPurchase, via
// functions/progressionService.js's discountPercentFromSettings) plus a
// display title/description and an active on/off toggle. Same
// "checkbox/toggle matrix, superadmin-only" treatment as
// FeatureAccessScreen.js, just one row of controls per tier instead of a
// role grid.
export default function TierPromotionsScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { profile, goBackOrHome } = useApp();
  const isSuperadmin = profile && profile.role === 'superadmin';

  const [progression, setProgression] = useState(progressionService.DEFAULT_PROGRESSION);
  const [loading, setLoading] = useState(true);
  const [editTier, setEditTier] = useState(null); // { key, field: 'discountPercent'|'title'|'description' }
  const [busyKey, setBusyKey] = useState(null);

  useEffect(() => {
    const unsub = progressionService.subscribeProgression(
      (p) => { setProgression(p); setLoading(false); },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  const toggleActive = async (tierKey, currentlyActive) => {
    setBusyKey(tierKey);
    try {
      await progressionService.updateTierPromotion(tierKey, { active: !currentlyActive });
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not update this promotion.');
    } finally {
      setBusyKey(null);
    }
  };

  const openEdit = (tierKey, field) => setEditTier({ key: tierKey, field });

  const confirmEdit = async (value) => {
    const target = editTier;
    setEditTier(null);
    if (!target) return;
    const patch = {};
    if (target.field === 'discountPercent') {
      const num = Number(value);
      if (!Number.isFinite(num) || num < 0 || num > 100) {
        showAlert('MySheba', 'Enter a discount between 0 and 100.');
        return;
      }
      patch.discountPercent = num;
    } else {
      patch[target.field] = value || '';
    }
    setBusyKey(target.key);
    try {
      await progressionService.updateTierPromotion(target.key, patch);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not update this promotion.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🏆 Tier Promotions</Text>
      </LinearGradient>

      {!isSuperadmin ? (
        <View style={styles.deniedWrap}>
          <Text style={styles.deniedText}>Only a superadmin can manage tier promotions.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
          <Text style={styles.hint}>
            Each tier's discount applies automatically to Recharge/Internet/Mobile Banking/
            Remittance orders once a customer reaches it. Title/description are shown to the
            customer; turning a promotion off keeps the tier itself but removes its discount.
          </Text>

          {progression.tiers.map((tier) => {
            const promo = progression.promotions[tier.key] || { discountPercent: 0, title: '', description: '', active: true };
            const busy = busyKey === tier.key;
            return (
              <View key={tier.key} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.tierLabel}>{tier.label}</Text>
                  <Text style={styles.tierThreshold}>{tier.minPoints}+ orders</Text>
                  <Switch
                    value={!!promo.active}
                    onValueChange={() => toggleActive(tier.key, promo.active)}
                    disabled={busy}
                  />
                </View>

                <TouchableOpacity style={styles.row} onPress={() => openEdit(tier.key, 'discountPercent')} disabled={busy}>
                  <Text style={styles.rowLabel}>Fee Discount</Text>
                  <Text style={styles.rowValue}>{promo.discountPercent || 0}%</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.row} onPress={() => openEdit(tier.key, 'title')} disabled={busy}>
                  <Text style={styles.rowLabel}>Title</Text>
                  <Text style={styles.rowValue} numberOfLines={1}>{promo.title || 'Not set'}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.row} onPress={() => openEdit(tier.key, 'description')} disabled={busy}>
                  <Text style={styles.rowLabel}>Description</Text>
                  <Text style={styles.rowValue} numberOfLines={1}>{promo.description || 'Not set'}</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      )}

      <PromptModal
        visible={!!editTier}
        title={
          editTier?.field === 'discountPercent' ? 'Discount percent (0-100):' :
          editTier?.field === 'title' ? 'Promotion title:' :
          'Promotion description:'
        }
        placeholder={editTier?.field === 'discountPercent' ? 'e.g. 5' : 'e.g. Gold Member Perk'}
        onSubmit={confirmEdit}
        onCancel={() => setEditTier(null)}
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
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    deniedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
    deniedText: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
    hint: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 17 },
    card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
    tierLabel: { fontWeight: '700', fontSize: 15, flex: 1, color: colors.text },
    tierThreshold: { fontSize: 11, color: colors.textSecondary },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
    rowLabel: { fontSize: 13, color: colors.text },
    rowValue: { fontSize: 13, color: colors.primary, fontWeight: '600', maxWidth: '55%' },
  });
}
