import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Image } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import PromptModal from '../components/PromptModal';
import BannerSlider from '../components/BannerSlider';
import ServiceGrid from '../components/ServiceGrid';
import CopyButton from '../components/CopyButton';
import TransactionDetailModal from '../components/TransactionDetailModal';
import AttachFileModal from '../components/AttachFileModal';
import * as mediaUpload from '../firebase/mediaUpload';
import HeaderDecor from '../components/HeaderDecor';
import * as transactionService from '../firebase/transactionService';

const FEATURES = [
  { key: 'pending', icon: '⏳', bg: '#FFF8E1', name: 'Pending' },
  { key: 'processing', icon: '🔄', bg: '#E3F2FD', name: 'Processing' },
  { key: 'completed', icon: '✅', bg: '#E8F5E9', name: 'Completed' },
  { key: 'topup', icon: '💰', bg: '#F3E5F5', name: 'Top-Up' },
];

// NOTE: the old dealer-only BUY_SERVICES grid (Recharge/Internet/.../
// here. Dealer now gets the exact same shared <ServiceGrid> every other
// role sees ("All features available for all roles"), and the dealer-only
// management tools moved to their own page - see DealerFeaturesScreen.js -
// reached via the "Dealer Features" tile appended onto that same
// ServiceGrid below, instead of two separate inline grids.

const BADGE_COLORS = {
  pending: { bg: '#FFF8E1', text: '#F57F17' },
  processing: { bg: '#E3F2FD', text: '#1565C0' },
  completed: { bg: '#E8F5E9', text: '#2E7D32' },
};

// Dealer dashboard: stats row, tabs, tx list with Accept/Reject/Complete
// actions. Every action writes straight to Firestore (transactionService) -
// the live subscription in AppContext keeps this list (and the Admin
// panel's) in sync automatically.
export default function DealerHomeScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const {
    dealerTxs, dealerTab, setDealerTab, logout, setScreen, openSidebar,
    authUser, profile,
    setHomeBackInterceptor,
    // viewingSection now lives in context (dealerViewingSection) so
    // DealerFeaturesScreen tiles can open a section directly - see that file.
    dealerViewingSection: viewingSection, setDealerViewingSection: setViewingSection,
  } = useApp();
  const [rejectId, setRejectId] = useState(null);
  const [pinId, setPinId] = useState(null); // { id, service }
  const [busyId, setBusyId] = useState(null);
  const [receiptTxId, setReceiptTxId] = useState(null);
  const [receiptPinTx, setReceiptPinTx] = useState(null);
  const [detailTx, setDetailTx] = useState(null);

  // Let the hardware back button close this sub-section instead of
  // navigating away from the Dealer dashboard or arming app-exit.
  useEffect(() => {
    setHomeBackInterceptor(() => {
      if (viewingSection) {
        setViewingSection(false);
        return true;
      }
      return false;
    });
    return () => setHomeBackInterceptor(null);
  }, [viewingSection, setHomeBackInterceptor]);

  const counts = {
    pending: dealerTxs.filter((t) => t.status === 'pending' && !t.rejectedBy?.[authUser?.uid]).length,
    processing: dealerTxs.filter((t) => t.status === 'processing').length,
    completed: dealerTxs.filter((t) => t.status === 'completed').length,
  };

  const visibleTxs = dealerTxs.filter((t) => t.status === dealerTab && !(t.status === 'pending' && t.rejectedBy?.[authUser?.uid]));

  const canActOnOrder = (tx) => !tx.claimedBy || tx.claimedBy === authUser?.uid;

  const featureBadges = { pending: counts.pending || undefined, processing: counts.processing || undefined };
  const features = FEATURES.map((f) => ({ ...f, badge: featureBadges[f.key] }));
  const activeFeature = features.find((f) => f.key === dealerTab);
  const openSection = (key) => {
    setDealerTab(key);
    setViewingSection(true);
  };

  const accept = async (id) => {
    setBusyId(id);
    try {
      await transactionService.acceptTransaction(id);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not accept this order.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmReject = async (reason) => {
    const target = rejectId;
    setRejectId(null);
    if (!reason || !target) return;
    try {
      await transactionService.rejectTransaction(target.id, reason, target.service);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not reject this order.');
    }
  };

  const confirmPin = async (pin) => {
    if (!pin || pin.length !== 4) {
      showAlert('MySheba', 'Enter a valid 4-digit code');
      return;
    }
    const tx = pinId;
    setPinId(null);
    if (!tx) return;
    setReceiptTxId({ id: tx.id, pin });
  };

  const onComplete = (tx) => {
    if (tx.claimedBy !== authUser?.uid) {
      showAlert('MySheba', 'This order was accepted by another staff member.');
      return;
    }
    setPinId({ id: tx.id, service: tx.service });
  };

  const confirmReceiptComplete = async (url) => {
    const target = receiptTxId;
    setReceiptTxId(null);
    if (!target) return;
    setBusyId(target.id);
    try {
      await transactionService.completeTransaction(target.id, target.pin, url);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not complete this order.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient } start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <View style={styles.logoArea}>
          <TouchableOpacity style={styles.menuBtn} onPress={openSidebar}>
            <Text style={styles.menuIcon}>☰</Text>
          </TouchableOpacity>
          <View style={styles.logoBox}>
            <Image source={require('../../assets/icon.png')} style={styles.logoImage} resizeMode="cover" />
          </View>
          <View>
            <Text style={styles.brand}>Dealer Panel</Text>
            <Text style={styles.tagline}>Transaction Processing</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <View style={styles.statsRow}>
        <TouchableOpacity style={styles.statCard} onPress={() => openSection('pending')}>
          <Text style={styles.statNum}>{counts.pending}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.statCard} onPress={() => openSection('processing')}>
          <Text style={styles.statNum}>{counts.processing}</Text>
          <Text style={styles.statLabel}>Processing</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.statCard} onPress={() => openSection('completed')}>
          <Text style={styles.statNum}>{counts.completed}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {!viewingSection && (
          <>
            {/* The old inline "📊 Dashboard" grid (Pending, Processing,
                Completed, Top-Up) has moved into DealerFeaturesScreen - see
                that file. The stat cards above still jump straight into a
                section too. Home now just shows the same banner slider +
                Quick Services grid every role sees, plus one tile linking
                to Dealer Features for everything else. */}
            <BannerSlider />
            <ServiceGrid
              extraTiles={[
                { key: 'dealerFeaturesTile', icon: '🛠️', bg: '#EDE7F6', accent: '#5E35B1', name: 'Dealer Features', onPress: () => setScreen('dealerFeatures') },
              ]}
            />
          </>
        )}

        {!!viewingSection && (
        <>
        <View style={styles.sectionHeaderRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setViewingSection(false)}>
            <Text style={styles.backBtnText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.sectionHeaderTitle}>{activeFeature ? `${activeFeature.icon} ${activeFeature.name}` : ''}</Text>
        </View>

        <View style={styles.sectionContent}>
        {visibleTxs.length === 0 ? (
          <Text style={styles.empty}>No {dealerTab} orders</Text>
        ) : (
          visibleTxs.map((tx) => {
            const badge = BADGE_COLORS[tx.status];
            return (
              <TouchableOpacity key={tx.id} style={styles.txCard} activeOpacity={0.7} onPress={() => setDetailTx(tx)}>
                <View style={styles.txHeader}>
                  <Text style={styles.txService}>{tx.service}</Text>
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.badgeText, { color: badge.text }]}>{tx.status.toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.txDetail}>👤 {tx.customerPhone || 'Unknown'}</Text>
                <Text style={styles.txDetail}>📝 {tx.details}</Text>
                {tx.service === 'Mobile Banking' && !!(tx.raw && tx.raw.phone) && (
                  <View style={styles.copyRow}>
                    <Text style={styles.txDetail}>📱 Receiver: {tx.raw.phone}</Text>
                    <CopyButton value={tx.raw.phone} />
                  </View>
                )}
                <Text style={styles.txAmount}>MYR {Number(tx.total || 0).toFixed(2)}</Text>
                {tx.status === 'pending' && (
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={styles.successBtn}
                      onPress={() => accept(tx.id)}
                      disabled={busyId === tx.id || !canActOnOrder(tx)}
                    >
                      <Text style={styles.actionBtnText}>✓ Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.errorBtn}
                      onPress={() => setRejectId({ id: tx.id, service: tx.service })}
                      disabled={busyId === tx.id || !canActOnOrder(tx) || !!tx.rejectedBy?.[authUser?.uid]}
                    >
                      <Text style={styles.actionBtnText}>{tx.rejectedBy?.[authUser?.uid] ? '✓ Rejected by me' : '✕ Reject'}</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {tx.status === 'processing' && (
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={styles.primaryBtn}
                      onPress={() => onComplete(tx)}
                      disabled={busyId === tx.id || tx.claimedBy !== authUser?.uid}
                    >
                      <Text style={styles.actionBtnText}>✓ Complete</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {tx.status === 'completed' && !!tx.pin && (
                  <Text style={styles.txDetail}>🔐 Collection PIN: {tx.pin}</Text>
                )}
                {!!(tx.status === 'completed' && tx.rejected) && (
                  <Text style={[styles.txDetail, { color: colors.error }]}>Rejected: {tx.rejectReason}</Text>
                )}
              </TouchableOpacity>
            );
          })
        )}
        </View>
        </>
        )}
      </ScrollView>

      <PromptModal
        visible={!!rejectId}
        title="Rejection reason:"
        placeholder="Enter reason"
        onSubmit={confirmReject}
        onCancel={() => setRejectId(null)}
      />
      <PromptModal
        visible={!!pinId}
        title="Enter 4-digit confirmation code:"
        placeholder="4-digit code"
        secure
        maxLength={4}
        onSubmit={confirmPin}
        onCancel={() => setPinId(null)}
      />
      <AttachFileModal
        visible={!!receiptTxId}
        title="Attach the transfer receipt"
        uploadFn={(uri, mimeType) => mediaUpload.uploadOrderReceipt(receiptTxId?.id, uri, mimeType)}
        onDone={confirmReceiptComplete}
        onCancel={() => setReceiptTxId(null)}
      />
      <TransactionDetailModal
        visible={!!detailTx}
        type="tx"
        item={detailTx}
        onClose={() => setDetailTx(null)}
        showCost
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' , overflow: 'hidden' },
    logoArea: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    menuBtn: { padding: 4, marginRight: 2 },
    menuIcon: { color: 'white', fontSize: 20 },
    logoBox: { width: 34, height: 34, backgroundColor: 'white', borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginRight: 10, overflow: 'hidden' },
    logoImage: { width: '100%', height: '100%' },
    brand: { color: 'white', fontWeight: '600' },
    tagline: { color: 'white', fontSize: 10, opacity: 0.8 },
    headerRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    logoutBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.md },
    logoutText: { color: 'white', fontSize: 11 },
    statsRow: { flexDirection: 'row', gap: 8, padding: 10, paddingHorizontal: 14 },
    statCard: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    statNum: { fontSize: 20, fontWeight: '700', color: colors.primary },
    statLabel: { fontSize: 10, color: '#999' },
    list: { paddingTop: 4, paddingBottom: 20 },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10, gap: 10 },
    backBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.md, backgroundColor: '#EAF2FE' },
    backBtnText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
    sectionHeaderTitle: { fontSize: 16, fontWeight: '700', flex: 1 },
    sectionContent: { paddingHorizontal: 14 },
    empty: { textAlign: 'center', color: '#999', paddingVertical: 30 },
    txCard: { backgroundColor: 'white', borderRadius: radius.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
    txHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    txService: { fontWeight: '600', fontSize: 14 },
    txDetail: { fontSize: 11, color: '#999', marginVertical: 2 },
    copyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 2 },
    txAmount: { fontWeight: '700', fontSize: 16, color: colors.primary },
    badge: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: radius.md },
    badgeText: { fontSize: 10, fontWeight: '600' },
    actions: { flexDirection: 'row', gap: 6, marginTop: 8 },
    successBtn: { backgroundColor: colors.success, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.sm },
    errorBtn: { backgroundColor: colors.error, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.sm },
    primaryBtn: { backgroundColor: colors.primary, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.sm },
    actionBtnText: { color: 'white', fontSize: 11, fontWeight: '600' },
    waitingNote: { fontSize: 11, color: '#999', fontStyle: 'italic', marginTop: 8 },
  });
}
