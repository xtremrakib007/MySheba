import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Share } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { showAlert } from '../utils/appAlert';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import * as roommateService from '../firebase/roommateService';
import { REPORT_REASONS } from '../firebase/roommateService';

function formatDate(ts) {
  if (!ts || !ts.seconds) return '';
  return new Date(ts.seconds * 1000).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function RoommateRequestDetailScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, activeRoommateRequestId, authUser } = useApp();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!activeRoommateRequestId) return undefined;
    const unsub = roommateService.subscribeRoommateRequest(activeRoommateRequestId, (r) => {
      setRequest(r);
      setLoading(false);
    });
    return unsub;
  }, [activeRoommateRequestId]);

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!request) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.emptyText}>This request is no longer available.</Text>
        <TouchableOpacity style={styles.backLinkBtn} onPress={goBackOrHome}>
          <Text style={styles.backLinkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isOwner = authUser && request.posterId === authUser.uid;

  const toggleClosed = async () => {
    setBusy(true);
    try {
      await roommateService.setRoommateRequestStatus(request.id, request.status === 'closed' ? 'active' : 'closed');
    } catch (err) {
      showAlert('MySheba', 'Could not update the request.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    showAlert('Delete this request?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await roommateService.deleteRoommateRequest(request.id);
            goBackOrHome();
          } catch (err) {
            showAlert('MySheba', 'Could not delete the request.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const shareRequest = async () => {
    try {
      await Share.share({ message: `Roommate wanted\n\nMYR ${Number(request.budget || 0).toFixed(2)}/month budget${request.location ? `\n📍 ${request.location}` : ''}\n\nCheck it out on MySheba Marketplace!` });
    } catch (err) {
      // user cancelled the share sheet - nothing to do
    }
  };

  const openReport = () => {
    if (!authUser) return;
    showAlert(
      'Report this request',
      'Why are you reporting it?',
      [
        ...REPORT_REASONS.map((reason) => ({
          text: reason,
          onPress: async () => {
            try {
              await roommateService.reportRoommateRequest(request.id, request.posterName, authUser.uid, reason);
              showAlert('MySheba', 'Thanks - our team will review this request.');
            } catch (err) {
              showAlert('MySheba', 'Could not submit your report right now.');
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Roommate Request</Text>
        <TouchableOpacity style={styles.reportIconBtn} onPress={shareRequest}>
          <Text style={styles.reportIcon}>↗️</Text>
        </TouchableOpacity>
        {!isOwner && (
          <TouchableOpacity style={styles.reportIconBtn} onPress={openReport}>
            <Text style={styles.reportIcon}>🚩</Text>
          </TouchableOpacity>
        )}
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.body}>
        {request.status === 'closed' && (
          <View style={styles.closedBanner}><Text style={styles.closedBannerText}>This request has been marked as FILLED</Text></View>
        )}

        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarInitial}>{(request.posterName || '?').trim().charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{request.posterName || 'Roommate seeker'}</Text>
            <Text style={styles.postedLine}>Posted {formatDate(request.createdAt)}</Text>
          </View>
        </View>

        <Text style={styles.budget}>MYR {Number(request.budget || 0).toFixed(2)}/month budget</Text>

        <View style={styles.metaRow}>
          {!!request.location && <Text style={styles.metaTag}>📍 {request.location}</Text>}
          {!!request.moveInDate && <Text style={styles.metaTag}>Move-in {request.moveInDate}</Text>}
          <Text style={styles.metaTag}>{request.numberOfPeople} {request.numberOfPeople === 1 ? 'person' : 'people'}</Text>
        </View>

        {!!request.preferences && (
          <>
            <Text style={styles.sectionLabel}>Preferences</Text>
            <Text style={styles.bodyText}>{request.preferences}</Text>
          </>
        )}

        {!!request.description && (
          <>
            <Text style={styles.sectionLabel}>About</Text>
            <Text style={styles.bodyText}>{request.description}</Text>
          </>
        )}

        {isOwner && (
          <View style={styles.ownerActions}>
            <TouchableOpacity style={[styles.actionBtn, styles.closedBtn]} onPress={toggleClosed} disabled={busy}>
              <Text style={styles.actionBtnText}>{request.status === 'closed' ? 'Mark as Open' : 'Mark as Filled'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={confirmDelete} disabled={busy}>
              <Text style={styles.actionBtnText}>Delete Request</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10, flex: 1 },
    reportIconBtn: { padding: 4 },
    reportIcon: { fontSize: 16 },
    body: { padding: 16, paddingBottom: 40 },
    closedBanner: { backgroundColor: '#FDECEA', borderRadius: radius.md, padding: 10, marginBottom: 14 },
    closedBannerText: { color: colors.error, fontWeight: '700', fontSize: 12, textAlign: 'center' },
    profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
    avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    avatarInitial: { color: 'white', fontWeight: '700', fontSize: 20 },
    name: { fontSize: 16, fontWeight: '700', color: colors.text },
    postedLine: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    budget: { fontSize: 16, fontWeight: '700', color: colors.primaryDark, marginBottom: 10 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    metaTag: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill },
    sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.navy, marginTop: 16, marginBottom: 6 },
    bodyText: { fontSize: 13, color: colors.text, lineHeight: 19 },
    ownerActions: { gap: 10, marginTop: 24 },
    actionBtn: { borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' },
    closedBtn: { backgroundColor: colors.secondary },
    deleteBtn: { backgroundColor: colors.error },
    actionBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
    emptyText: { fontSize: 13, color: '#999', textAlign: 'center', marginBottom: 12 },
    backLinkBtn: { paddingVertical: 8, paddingHorizontal: 16 },
    backLinkText: { color: colors.primary, fontWeight: '700' },
  });
}
