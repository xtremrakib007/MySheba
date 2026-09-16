// section 8) - "My Services" screen. Structurally mirrors
// MyPropertiesScreen's tab-strip pattern, but the second tab is "Requests
// Received" rather than "Saved" - Local Services has no equivalent of
// "save for later" concept in the PRD), while it does have
// serviceRequestService.subscribeReceivedRequests (leads sent to any of
// the signed-in user's own provider profiles) with no screen of its own
// until now.
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import * as serviceRequestService from '../firebase/serviceRequestService';

function getStatusStyle(colors) {
  return {
    active: { label: 'Active', color: colors.success, bg: '#E8F5E9' },
    hidden: { label: 'Under Review', color: colors.error, bg: '#FDECEA' },
  };
}

function getRequestStatusStyle(colors) {
  return {
    new: { label: 'New', color: colors.secondary, bg: '#E8F0FE' },
    contacted: { label: 'Contacted', color: colors.warning, bg: '#FEF7E0' },
    closed: { label: 'Closed', color: colors.textSecondary, bg: '#F1F3F4' },
  };
}

function formatDate(ts) {
  if (!ts || !ts.seconds) return '';
  return new Date(ts.seconds * 1000).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

function ListingRow({ item, onPress }) {
  const {
    colors
  } = useTheme();

  const STATUS_STYLE = getStatusStyle(colors);
  const styles = createStyles(colors);
  const badge = STATUS_STYLE[item.status] || null;
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.75} onPress={onPress}>
      {item.photo ? (
        <Image source={{ uri: item.photo }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}><Text style={{ fontSize: 20 }}>🧰</Text></View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.cardSub}>{item.category}</Text>
      </View>
      {badge && (
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function RequestRow({ item }) {
  const {
    colors
  } = useTheme();

  const REQUEST_STATUS_STYLE = getRequestStatusStyle(colors);
  const styles = createStyles(colors);
  const badge = REQUEST_STATUS_STYLE[item.status] || REQUEST_STATUS_STYLE.new;
  const { setRequestStatus, busyRequestId } = item._actions;
  return (
    <View style={styles.requestCard}>
      <View style={styles.requestTopRow}>
        <Text style={styles.requestCustomer} numberOfLines={1}>{item.customerName || 'A customer'}</Text>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
        </View>
      </View>
      <Text style={styles.requestProvider} numberOfLines={1}>for "{item.providerName}"</Text>
      {!!item.message && <Text style={styles.requestMessage}>{item.message}</Text>}
      <Text style={styles.requestDate}>{formatDate(item.createdAt)}</Text>

      {item.status !== 'closed' && (
        <View style={styles.requestActions}>
          {item.status === 'new' && (
            <TouchableOpacity
              style={styles.requestActionBtn}
              disabled={busyRequestId === item.id}
              onPress={() => setRequestStatus(item.id, 'contacted')}
            >
              <Text style={styles.requestActionText}>Mark Contacted</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.requestActionBtn, styles.requestActionBtnClose]}
            disabled={busyRequestId === item.id}
            onPress={() => setRequestStatus(item.id, 'closed')}
          >
            <Text style={[styles.requestActionText, styles.requestActionTextClose]}>Close</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function MyServicesScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const [tab, setTab] = useState('mine'); // mine | requests
  const [mine, setMine] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyRequestId, setBusyRequestId] = useState(null);

  useEffect(() => {
    if (!authUser) return undefined;
      setMine(list);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    return serviceRequestService.subscribeReceivedRequests(authUser.uid, setRequests, () => {});
  }, [authUser]);

  const setRequestStatus = async (requestId, status) => {
    setBusyRequestId(requestId);
    try {
      await serviceRequestService.setRequestStatus(requestId, status);
    } finally {
      setBusyRequestId(null);
    }
  };

  const newRequestCount = requests.filter((r) => r.status === 'new').length;

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Services</Text>
      </LinearGradient>

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tabBtn, tab === 'mine' && styles.tabBtnActive]} onPress={() => setTab('mine')}>
          <Text style={[styles.tabText, tab === 'mine' && styles.tabTextActive]}>My Listings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === 'requests' && styles.tabBtnActive]} onPress={() => setTab('requests')}>
          <Text style={[styles.tabText, tab === 'requests' && styles.tabTextActive]}>
            Requests Received{newRequestCount > 0 ? ` (${newRequestCount})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {loading && tab === 'mine' ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : tab === 'mine' ? (
        <FlatList
          data={mine}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ fontSize: 34, marginBottom: 8 }}>🧰</Text>
              <Text style={styles.emptyText}>You haven't listed any services yet.</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={requests.map((r) => ({ ...r, _actions: { setRequestStatus, busyRequestId } }))}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <RequestRow item={item} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ fontSize: 34, marginBottom: 8 }}>📩</Text>
              <Text style={styles.emptyText}>No service requests yet.</Text>
            </View>
          }
        />
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
    tabs: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabBtnActive: { borderBottomColor: colors.primary },
    tabText: { fontSize: 13, fontWeight: '600', color: '#999' },
    tabTextActive: { color: colors.primary },
    list: { padding: 16, paddingBottom: 30, flexGrow: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 30 },
    emptyText: { fontSize: 13, color: '#999', textAlign: 'center' },
    card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10, marginBottom: 10, gap: 10 },
    thumb: { width: 54, height: 54, borderRadius: radius.sm, backgroundColor: '#F1F3F4' },
    thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    cardBody: { flex: 1 },
    cardTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 3 },
    cardSub: { fontSize: 11, color: colors.textSecondary },
    badge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.sm },
    badgeText: { fontSize: 10, fontWeight: '700' },
    requestCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginBottom: 10 },
    requestTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
    requestCustomer: { fontSize: 13, fontWeight: '700', color: colors.text, flex: 1, marginRight: 8 },
    requestProvider: { fontSize: 11, color: colors.textSecondary, marginBottom: 6 },
    requestMessage: { fontSize: 12, color: colors.text, lineHeight: 17, marginBottom: 6 },
    requestDate: { fontSize: 10, color: '#999', marginBottom: 8 },
    requestActions: { flexDirection: 'row', gap: 8 },
    requestActionBtn: { flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center', backgroundColor: colors.primary },
    requestActionBtnClose: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
    requestActionText: { fontSize: 11, fontWeight: '700', color: 'white' },
    requestActionTextClose: { color: colors.textSecondary },
  });
}
