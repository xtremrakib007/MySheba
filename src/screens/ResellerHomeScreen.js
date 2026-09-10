import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Linking } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import ServiceGrid from '../components/ServiceGrid';
import BannerSlider from '../components/BannerSlider';
import CopyButton from '../components/CopyButton';
import TransactionDetailModal from '../components/TransactionDetailModal';
import PromptModal from '../components/PromptModal';
import AttachFileModal from '../components/AttachFileModal';
import HeaderDecor from '../components/HeaderDecor';
import * as transactionService from '../firebase/transactionService';
import * as directChatService from '../firebase/directChatService';
import * as mediaUpload from '../firebase/mediaUpload';
import * as inquiryService from '../firebase/inquiryService';

// Reseller dashboard: a customer who registered under this reseller's code
// has their Recharge/Internet/Remittance orders land here first (resellerId,
// no dealerId yet - see transactionService.createTransaction). A reseller
// has a real per-order choice while an order is still unforwarded (dealerId
// == null, see firestore.rules): Accept/Reject/Complete it themselves, OR
// forward it to a specific dealer (assignDealer, reused from the admin
// "Appoint Dealer" flow). The moment it's forwarded it leaves the
// reseller's actionable queues and becomes read-only under the
// "Sent to Dealer" tab.
//
// Phase 10 service-tier split: Reseller no longer touches Mobile Banking
// (that's Dealer-only now, see firestore.rules' canHandleTransaction()) -
// resellerTxs itself only ever contains Recharge/Internet/Remittance (see
// AppContext.js's broadcast-transactions filter). Reseller also now owns
// Flight inquiries (the "Flight Inquiries" tab below) - Bus/Train are
// WebView bookings and never reach any staff queue.
const FEATURES = [
  { key: 'pending', icon: '⏳', bg: '#FFF8E1', name: 'Pending' },
  { key: 'processing', icon: '🔄', bg: '#E3F2FD', name: 'Processing' },
  { key: 'completed', icon: '✅', bg: '#E8F5E9', name: 'Completed' },
  { key: 'inquiries', icon: '✈️', bg: '#E8EAF6', name: 'Flight Inquiries' },
  ];

const BADGE_COLORS = {
  pending: { bg: '#FFF8E1', text: '#F57F17' },
  processing: { bg: '#E3F2FD', text: '#1565C0' },
  completed: { bg: '#E8F5E9', text: '#2E7D32' },
  new: { bg: '#E8EAF6', text: '#5E35B1' },
  contacted: { bg: '#E3F2FD', text: '#1565C0' },
  closed: { bg: '#E8F5E9', text: '#2E7D32' },
};

/** Same idea as formatTxCopy() elsewhere but for a Flight inquiry. */
function formatInquiryCopy(inq) {
  const lines = [
    `Type: ${inq.type || ''}`,
    `Route: ${inq.from || ''} → ${inq.to || ''}`,
    `Date: ${inq.date || ''}${inq.time ? ` · ${inq.time}` : ''}`,
    `Passengers: ${inq.passengers || ''}`,
    `Name: ${inq.name || ''}`,
    `Phone: ${inq.phone || ''}`,
  ];
  if (inq.email) lines.push(`Email: ${inq.email}`);
  if (inq.notes) lines.push(`Notes: ${inq.notes}`);
  lines.push(`Status: ${(inq.status || 'new').toUpperCase()}`);
  return lines.join('\n');
}

export default function ResellerHomeScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const {
    resellerTxs, resellerTab, setResellerTab, logout, setScreen, openSidebar,
    authUser, profile, openDirectChat, inquiries,
    setHomeBackInterceptor,
    resellerViewingSection: viewingSection, setResellerViewingSection: setViewingSection,
  } = useApp();

  const [busyId, setBusyId] = useState(null);
  const [rejectId, setRejectId] = useState(null);
  const [pinId, setPinId] = useState(null); // { id, service }
  const [receiptTxId, setReceiptTxId] = useState(null);
  const [messagingId, setMessagingId] = useState(null);
  const [detailTx, setDetailTx] = useState(null);
  const [messagingInquiryId, setMessagingInquiryId] = useState(null);
  const [ticketInquiryId, setTicketInquiryId] = useState(null);

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

  // Resellers share the same broadcast pool as Dealers. A claimed order is
  // still visible, but only the accepter can complete it.
  const pendingTxs = resellerTxs.filter((t) => t.status === 'pending' && !t.rejectedBy?.[authUser?.uid]);
  const processingTxs = resellerTxs.filter((t) => t.status === 'processing' && t.claimedBy === authUser?.uid);
  const completedTxs = resellerTxs.filter((t) => t.status === 'completed' && t.claimedBy === authUser?.uid);

  const newInquiriesCount = inquiries.filter((i) => (i.status || 'new') === 'new').length;

  const counts = {
    pending: pendingTxs.length,
    processing: processingTxs.length,
    completed: completedTxs.length,
    inquiries: newInquiriesCount,
  };
  const listByTab = { pending: pendingTxs, processing: processingTxs, completed: completedTxs };
  const visibleTxs = listByTab[resellerTab] || [];

  const featureBadges = { pending: counts.pending || undefined, processing: counts.processing || undefined, inquiries: counts.inquiries || undefined };
  const features = FEATURES.map((f) => ({ ...f, badge: featureBadges[f.key] }));
  const activeFeature = features.find((f) => f.key === resellerTab);
  const canActOnOrder = (tx) => !tx.claimedBy || tx.claimedBy === authUser?.uid;

  const openSection = (key) => {
    setResellerTab(key);
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

  const messageCustomer = async (tx) => {
    if (!tx.customerId) {
      showAlert('MySheba', 'This order has no customer account attached.');
      return;
    }
    setMessagingId(tx.id);
    try {
      const customerName = tx.customerPhone || 'Customer';
      const chatId = await directChatService.ensureDirectChat(
        { uid: authUser.uid, name: profile?.name || 'Reseller' },
        { uid: tx.customerId, name: customerName }
      );
      openDirectChat(chatId, customerName, tx.customerId, `Hi, regarding your ${tx.service} order (MYR ${Number(tx.total || 0).toFixed(2)}) - `);
    } catch (e) {
      showAlert('MySheba', 'Could not start this conversation. Please try again.');
    } finally {
      setMessagingId(null);
    }
  };

  /** "Contact" opens an in-app chat thread with the customer who submitted
   * the flight inquiry, prefilled with the trip reference. Falls back to an
   * alert if the inquiry has no linked customer account (e.g. a guest
   * submission). Same pattern as AdminHomeScreen's messageInquiry. */
  const messageInquiry = async (inq) => {
    if (!inq.customerId) {
      showAlert('MySheba', 'This inquiry has no customer account attached to message in-app. Use Call or WhatsApp instead.');
      return;
    }
    setMessagingInquiryId(inq.id);
    try {
      await inquiryService.updateInquiryStatus(inq.id, 'contacted');
      const customerName = inq.name || inq.phone || 'Customer';
      const chatId = await directChatService.ensureDirectChat(
        { uid: authUser.uid, name: profile?.name || 'Reseller' },
        { uid: inq.customerId, name: customerName }
      );
      openDirectChat(
        chatId,
        customerName,
        inq.customerId,
        `Hi ${inq.name || ''}, regarding your ${inq.type} inquiry (${inq.from} → ${inq.to} · ${inq.date}${inq.time ? ` · ${inq.time}` : ''}) - `
      );
    } catch (e) {
      showAlert('MySheba', 'Could not start this conversation. Please try again.');
    } finally {
      setMessagingInquiryId(null);
    }
  };

  /** Plain phone call - marks the inquiry contacted too, since a call is just as much "contact" as a chat message. */
  const callInquiry = async (inq) => {
    try {
      await inquiryService.updateInquiryStatus(inq.id, 'contacted');
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not update status.');
    }
    if (inq.phone) {
      Linking.openURL(`tel:${inq.phone}`).catch(() => {});
    } else {
      showAlert('MySheba', 'No phone number on this inquiry.');
    }
  };

  /** Opens WhatsApp with the customer's number, prefilled with the trip reference. */
  const whatsappInquiry = async (inq) => {
    if (!inq.phone) {
      showAlert('MySheba', 'No phone number on this inquiry.');
      return;
    }
    try {
      await inquiryService.updateInquiryStatus(inq.id, 'contacted');
    } catch (e) {
      // non-fatal - still open WhatsApp even if the status update fails
    }
    const digits = inq.phone.replace(/[^\d]/g, '');
    const msg = encodeURIComponent(
      `Hi ${inq.name || ''}, this is MySheba regarding your ${inq.type} inquiry (${inq.from} → ${inq.to} · ${inq.date}${inq.time ? ` · ${inq.time}` : ''}).`
    );
    Linking.openURL(`https://wa.me/${digits}?text=${msg}`).catch(() => {
      showAlert('MySheba', 'Could not open WhatsApp.');
    });
  };

  /** Every inquiry a reseller handles is Flight (resellerHome only ever
   * subscribes to type == 'flight', see AppContext.js), so closing always
   * needs a ticket attachment - unlike AdminHomeScreen's closeInquiry,
   * there's no plain-close branch for Bus/Train here. */
  const closeInquiry = (inq) => {
    setTicketInquiryId(inq.id);
  };

  const confirmTicketClose = async (url) => {
    const id = ticketInquiryId;
    setTicketInquiryId(null);
    try {
      await inquiryService.closeInquiryWithTicket(id, url);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not update status.');
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <View style={styles.logoArea}>
          <TouchableOpacity style={styles.menuBtn} onPress={openSidebar}>
            <Text style={styles.menuIcon}>☰</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.brand}>MySheba</Text>
            <Text style={styles.tagline}>Reseller</Text>
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
            {/* Same home-page banner slider every other role sees - see
                src/components/BannerSlider.js. */}
            <BannerSlider />
            <ServiceGrid
              extraTiles={[
                { key: 'resellerFeaturesTile', icon: '🛠️', bg: '#EDE7F6', accent: '#5E35B1', name: 'Reseller Features', onPress: () => setScreen('resellerFeatures') },
              ]}
            />
          </>
        )}

        {viewingSection && (
        <>
        <View style={styles.sectionHeaderRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setViewingSection(false)}>
            <Text style={styles.backBtnText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.sectionHeaderTitle}>{activeFeature ? `${activeFeature.icon} ${activeFeature.name}` : ''}</Text>
        </View>

        <View style={styles.sectionContent}>
        {resellerTab === 'inquiries' ? (
          inquiries.length === 0 ? (
            <Text style={styles.empty}>No flight inquiries yet</Text>
          ) : (
            inquiries.map((inq) => {
              const badge = BADGE_COLORS[inq.status] || BADGE_COLORS.new;
              return (
                <TouchableOpacity key={inq.id} style={styles.txCard} activeOpacity={0.7}>
                  <View style={styles.txHeader}>
                    <Text style={styles.txService}>✈️ {inq.type}</Text>
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.badgeText, { color: badge.text }]}>{(inq.status || 'new').toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={styles.txDetail}>🗺️ {inq.from} → {inq.to} · {inq.date}{inq.time ? ` · ${inq.time}` : ''}</Text>
                  <Text style={styles.txDetail}>👥 {inq.passengers} passenger(s)</Text>
                  <Text style={styles.txDetail}>👤 {inq.name} · 📞 {inq.phone}</Text>
                  {!!inq.email && <Text style={styles.txDetail}>✉️ {inq.email}</Text>}
                  {!!inq.notes && <Text style={styles.txDetail}>📝 {inq.notes}</Text>}
                  <View style={styles.copyRow}>
                    <CopyButton value={formatInquiryCopy(inq)} label="Copy Details" />
                  </View>
                  {inq.status !== 'closed' && (
                    <>
                      <View style={styles.actions}>
                        <TouchableOpacity
                          style={styles.primaryBtn}
                          onPress={() => messageInquiry(inq)}
                          disabled={messagingInquiryId === inq.id}
                        >
                          <Text style={styles.actionBtnText}>{messagingInquiryId === inq.id ? '…' : '💬 Contact'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.successBtn} onPress={() => callInquiry(inq)}>
                          <Text style={styles.actionBtnText}>📞 Call</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.messageBtn} onPress={() => whatsappInquiry(inq)}>
                          <Text style={styles.messageBtnText}>💬 WhatsApp</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.actions}>
                        <TouchableOpacity style={styles.successBtn} onPress={() => closeInquiry(inq)}>
                          <Text style={styles.actionBtnText}>✓ Close (attach ticket)</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                  {inq.status === 'closed' && !!inq.ticketUrl && (
                    <Text style={styles.txDetail}>🎫 Ticket attached</Text>
                  )}
                </TouchableOpacity>
              );
            })
          )
        ) : visibleTxs.length === 0 ? (
          <Text style={styles.empty}>No {activeFeature ? activeFeature.name.toLowerCase() : ''} orders</Text>
        ) : (
          visibleTxs.map((tx) => {
            const badge = BADGE_COLORS[tx.status] || BADGE_COLORS.pending;
            return (
              <TouchableOpacity key={tx.id} style={styles.txCard} activeOpacity={0.7} onPress={() => setDetailTx(tx)}>
                <View style={styles.txHeader}>
                  <Text style={styles.txService}>{tx.service}</Text>
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.badgeText, { color: badge.text }]}>{(tx.status || '').toUpperCase()}</Text>
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
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.messageBtn}
                    onPress={(event) => { event.stopPropagation(); messageCustomer(tx); }}
                    disabled={messagingId === tx.id}
                  >
                    <Text style={styles.messageBtnText}>{messagingId === tx.id ? '…' : '💬 Message'}</Text>
                  </TouchableOpacity>
                </View>

                {resellerTab === 'pending' && (
                  <>
                    <View style={styles.actions}>
                      <TouchableOpacity style={styles.successBtn} onPress={(event) => { event.stopPropagation(); accept(tx.id); }} disabled={busyId === tx.id}>
                        <Text style={styles.actionBtnText}>✓ Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.errorBtn} onPress={(event) => { event.stopPropagation(); setRejectId({ id: tx.id, service: tx.service }); }} disabled={busyId === tx.id}>
                        <Text style={styles.actionBtnText}>✕ Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                {resellerTab === 'processing' && (
                  <View style={styles.actions}>
                    <TouchableOpacity style={styles.primaryBtn} onPress={(event) => { event.stopPropagation(); onComplete(tx); }} disabled={busyId === tx.id}>
                      <Text style={styles.actionBtnText}>✓ Complete</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {resellerTab === 'completed' && !!tx.pin && (
                  <Text style={styles.txDetail}>🔐 Collection PIN: {tx.pin}</Text>
                )}
                {resellerTab === 'completed' && tx.rejected && (
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
      <AttachFileModal
        visible={!!ticketInquiryId}
        title="Attach the flight ticket"
        allowPdf
        uploadFn={(uri, mimeType) => mediaUpload.uploadFlightTicket(ticketInquiryId, uri, mimeType)}
        onDone={confirmTicketClose}
        onCancel={() => setTicketInquiryId(null)}
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', overflow: 'hidden' },
    logoArea: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    menuBtn: { padding: 4, marginRight: 2 },
    menuIcon: { color: 'white', fontSize: 20 },
    brand: { color: 'white', fontWeight: '600' },
    tagline: { color: 'white', fontSize: 10, opacity: 0.8 },
    headerRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    logoutBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.md },
    logoutText: { color: 'white', fontSize: 11 },
    statsRow: { flexDirection: 'row', gap: 6, padding: 10, paddingHorizontal: 14 },
    statCard: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    statNum: { fontSize: 18, fontWeight: '700', color: colors.primary },
    statLabel: { fontSize: 9, color: '#999' },
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
    messageBtn: { backgroundColor: '#F0F0F0', paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.sm },
    messageBtnText: { color: colors.primary, fontSize: 11, fontWeight: '600' },
    actionBtnText: { color: 'white', fontSize: 11, fontWeight: '600' },
  });
}
