import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, PanResponder } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import * as transactionService from '../firebase/transactionService';
import * as inquiryService from '../firebase/inquiryService';
import * as topupService from '../firebase/topupService';
import TransactionDetailModal from '../components/TransactionDetailModal';
import HeaderDecor from '../components/HeaderDecor';

function getTxStatusStyle(colors) {
  return {
    pending: { label: 'Pending', color: colors.warning, bg: '#FFF8E1' },
    processing: { label: 'Processing', color: colors.primary, bg: '#E8F0FE' },
    completed: { label: 'Completed', color: colors.success, bg: '#E8F5E9' },
  };
}

function getInquiryStatusStyle(colors) {
  return {
    new: { label: 'Submitted', color: colors.warning, bg: '#FFF8E1' },
    contacted: { label: 'Contacted', color: colors.primary, bg: '#E8F0FE' },
    closed: { label: 'Closed', color: colors.success, bg: '#E8F5E9' },
  };
}

const TRAVEL_ICON = { flight: '\u2708\uFE0F', bus: '\uD83D\uDE8C', train: '\uD83D\uDE86' };

function getTopupStatusStyle(colors) {
  return {
    pending: { label: 'Pending', color: colors.warning, bg: '#FFF8E1' },
    approved: { label: 'Approved', color: colors.success, bg: '#E8F5E9' },
    rejected: { label: 'Rejected', color: colors.error, bg: '#FDECEA' },
  };
}

function formatDate(ts) {
  if (!ts || !ts.seconds) return '';
  const d = new Date(ts.seconds * 1000);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' \u00B7 ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function TxRow({ item, onPress }) {
  const {
    colors
  } = useTheme();

  const TX_STATUS_STYLE = getTxStatusStyle(colors);
  const styles = createStyles(colors);
  const style = TX_STATUS_STYLE[item.status] || TX_STATUS_STYLE.pending;
  const showRejected = item.status === 'completed' && item.rejected;
  const badge = showRejected ? { label: 'Rejected', color: colors.error, bg: '#FDECEA' } : style;

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={onPress}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>{item.service}</Text>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
        </View>
      </View>
      {!!item.details && <Text style={styles.cardDetail}>{item.details}</Text>}
      <View style={styles.cardBottom}>
        <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
        <Text style={styles.cardAmount}>MYR {Number(item.total || 0).toFixed(2)}</Text>
      </View>
      {showRejected && !!item.rejectReason && (
        <Text style={styles.rejectReason}>Reason: {item.rejectReason}</Text>
      )}
    </TouchableOpacity>
  );
}

function InquiryRow({ item, onPress }) {
  const {
    colors
  } = useTheme();

  const INQUIRY_STATUS_STYLE = getInquiryStatusStyle(colors);
  const styles = createStyles(colors);
  const style = INQUIRY_STATUS_STYLE[item.status] || INQUIRY_STATUS_STYLE.new;
  const icon = TRAVEL_ICON[item.type] || '\uD83D\uDDFA\uFE0F';

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={onPress}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>{icon} {item.type ? item.type[0].toUpperCase() + item.type.slice(1) : 'Travel'}</Text>
        <View style={[styles.badge, { backgroundColor: style.bg }]}>
          <Text style={[styles.badgeText, { color: style.color }]}>{style.label}</Text>
        </View>
      </View>
      <Text style={styles.cardDetail}>
        {item.from || '?'} → {item.to || '?'}{item.date ? ` \u00B7 ${item.date}` : ''}{item.time ? ` ${item.time}` : ''}
      </Text>
      <View style={styles.cardBottom}>
        <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
        <Text style={styles.cardPassengers}>{item.passengers || 1} pax</Text>
      </View>
    </TouchableOpacity>
  );
}

function TopupRow({ item, onPress }) {
  const {
    colors
  } = useTheme();

  const TOPUP_STATUS_STYLE = getTopupStatusStyle(colors);
  const styles = createStyles(colors);
  const style = TOPUP_STATUS_STYLE[item.status] || TOPUP_STATUS_STYLE.pending;

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={onPress}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>💰 {topupService.METHODS[item.method] || item.method}</Text>
        <View style={[styles.badge, { backgroundColor: style.bg }]}>
          <Text style={[styles.badgeText, { color: style.color }]}>{style.label}</Text>
        </View>
      </View>
      {!!item.bankName && <Text style={styles.cardDetail}>{item.bankName}{item.refNo ? ` \u00B7 Ref: ${item.refNo}` : ''}</Text>}
      <View style={styles.cardBottom}>
        <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
        <Text style={styles.cardAmount}>MYR {Number(item.amount || 0).toFixed(2)}</Text>
      </View>
      {item.status === 'rejected' && !!item.rejectReason && (
        <Text style={styles.rejectReason}>Reason: {item.rejectReason}</Text>
      )}
    </TouchableOpacity>
  );
}

export default function HistoryScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, authUser, profile } = useApp();
  const [tab, setTab] = useState('orders'); // orders | travel | topups
  const [transactions, setTransactions] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [topups, setTopups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailItem, setDetailItem] = useState(null); // { type: 'tx'|'inquiry'|'topup', data }

  // Admin/superadmin's own top-ups are self-approved purchases (kept in the
  // separate 'selfTopups' collection - see topupService.createSelfTopup /
  // SuperAdminTopUpScreen), not requests sitting in the customer/dealer
  // approval queue ('topups'). So History reads from whichever collection
  // actually holds this signed-in account's own records.
  const isAdminTier = profile && (profile.role === 'admin' || profile.role === 'superadmin');

  useEffect(() => {
    if (!authUser) { setLoading(false); return undefined; }
    setLoading(true);
    let txLoaded = false;
    let inqLoaded = false;
    let topupLoaded = false;
    const maybeStopLoading = () => { if (txLoaded && inqLoaded && topupLoaded) setLoading(false); };

    const unsubTx = transactionService.subscribeMyTransactions(
      authUser.uid,
      (list) => { setTransactions(list); txLoaded = true; maybeStopLoading(); },
      () => { txLoaded = true; maybeStopLoading(); }
    );
    const unsubInq = inquiryService.subscribeMyInquiries(
      authUser.uid,
      (list) => { setInquiries(list); inqLoaded = true; maybeStopLoading(); },
      () => { inqLoaded = true; maybeStopLoading(); }
    );
    const subscribeTopupHistory = isAdminTier ? topupService.subscribeMySelfTopups : topupService.subscribeMyTopups;
    const unsubTopup = subscribeTopupHistory(
      authUser.uid,
      (list) => { setTopups(list); topupLoaded = true; maybeStopLoading(); },
      () => { topupLoaded = true; maybeStopLoading(); }
    );

    return () => { unsubTx(); unsubInq(); unsubTopup(); };
  }, [authUser, isAdminTier]);

  const data = tab === 'orders' ? transactions : tab === 'travel' ? inquiries : topups;

  // Swipe left/right over the list to move between Orders / Travel Inquiries /
  // Top-Ups, same as tapping the tab bar. Only claims the gesture once a
  // swipe is clearly more horizontal than vertical, so vertical list
  // scrolling is untouched.
  const TAB_ORDER = ['orders', 'travel', 'topups'];
  const tabIndex = TAB_ORDER.indexOf(tab);
  const swipeTo = (dx) => {
    if (dx <= 0 && tabIndex < TAB_ORDER.length - 1) {
      setTab(TAB_ORDER[tabIndex + 1]);
    } else if (dx > 0 && tabIndex > 0) {
      setTab(TAB_ORDER[tabIndex - 1]);
    }
  };
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_evt, gesture) =>
      Math.abs(gesture.dx) > 20 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
    onPanResponderRelease: (_evt, gesture) => {
      if (Math.abs(gesture.dx) > 60) swipeTo(gesture.dx);
    },
  });

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient } start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>History</Text>
      </LinearGradient>

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tabBtn, tab === 'orders' && styles.tabBtnActive]} onPress={() => setTab('orders')}>
          <Text style={[styles.tabText, tab === 'orders' && styles.tabTextActive]}>Orders</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === 'travel' && styles.tabBtnActive]} onPress={() => setTab('travel')}>
          <Text style={[styles.tabText, tab === 'travel' && styles.tabTextActive]}>Travel Inquiries</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === 'topups' && styles.tabBtnActive]} onPress={() => setTab('topups')}>
          <Text style={[styles.tabText, tab === 'topups' && styles.tabTextActive]}>Top-Ups</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            tab === 'orders' ? <TxRow item={item} onPress={() => setDetailItem({ type: 'tx', data: item })} /> :
            tab === 'travel' ? <InquiryRow item={item} onPress={() => setDetailItem({ type: 'inquiry', data: item })} /> :
            <TopupRow item={item} onPress={() => setDetailItem({ type: 'topup', data: item })} />
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyIcon}>{tab === 'orders' ? '\uD83D\uDCCB' : tab === 'travel' ? '\u2708\uFE0F' : '\uD83D\uDCB0'}</Text>
              <Text style={styles.emptyText}>
                {tab === 'orders' ? 'No orders yet.' : tab === 'travel' ? 'No travel inquiries yet.' : 'No top-up requests yet.'}
              </Text>
            </View>
          }
        />
      )}
      </View>
      <TransactionDetailModal
        visible={!!detailItem}
        type={detailItem?.type}
        item={detailItem?.data}
        onClose={() => setDetailItem(null)}
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary , overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    tabs: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabBtnActive: { borderBottomColor: colors.primary },
    tabText: { fontSize: 13, fontWeight: '600', color: '#999' },
    tabTextActive: { color: colors.primary },
    list: { padding: 16, paddingBottom: 30, flexGrow: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
    emptyIcon: { fontSize: 40, marginBottom: 10 },
    emptyText: { fontSize: 13, color: '#999' },
    card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, marginBottom: 10 },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    cardTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
    cardDetail: { fontSize: 12, color: colors.textSecondary, marginBottom: 8 },
    cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardDate: { fontSize: 11, color: '#999' },
    cardAmount: { fontSize: 14, fontWeight: '700', color: colors.primary },
    cardPassengers: { fontSize: 11, color: '#999' },
    badge: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: radius.md },
    badgeText: { fontSize: 10, fontWeight: '700' },
    rejectReason: { fontSize: 11, color: colors.error, marginTop: 6 },
  });
}
