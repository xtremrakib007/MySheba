import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView, StyleSheet, ActivityIndicator, Dimensions, Share } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { showAlert } from '../utils/appAlert';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import * as accommodationService from '../firebase/accommodationService';
import { REPORT_REASONS } from '../firebase/accommodationService';
import * as businessProfileService from '../firebase/businessProfileService';
import BusinessBadge from '../components/BusinessBadge';
import MapPreview from '../components/MapPreview';

const SCREEN_WIDTH = Math.min(Dimensions.get('window').width, 480);

function formatDate(ts) {
  if (!ts || !ts.seconds) return '';
  return new Date(ts.seconds * 1000).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatAvailableDate(value) {
  if (!value) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function PropertyDetailScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { goBackOrHome, activePropertyId, authUser, openBusinessProfile } = useApp();
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ownerBiz, setOwnerBiz] = useState(null);

  useEffect(() => {
    if (!property?.ownerId) return undefined;
    const unsub = businessProfileService.subscribeBusinessProfile(property.ownerId, setOwnerBiz, () => {});
    return unsub;
  }, [property?.ownerId]);

  useEffect(() => {
    if (!activePropertyId) return undefined;
    const unsub = accommodationService.subscribeProperty(activePropertyId, (p) => {
      setProperty(p);
      setLoading(false);
    });
    return unsub;
  }, [activePropertyId]);

  useEffect(() => {
    if (!authUser || !activePropertyId) return;
    accommodationService.isPropertySaved(authUser.uid, activePropertyId).then(setSaved).catch(() => {});
  }, [authUser, activePropertyId]);

  if (loading) {
    return <View style={[styles.screen, styles.center]}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  if (!property) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.emptyText}>This property is no longer available.</Text>
        <TouchableOpacity style={styles.backLinkBtn} onPress={goBackOrHome}>
          <Text style={styles.backLinkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isOwner = authUser && property.ownerId === authUser.uid;
  const images = property.images && property.images.length > 0 ? property.images : [null];

  const toggleSave = async () => {
    if (!authUser) return;
    setBusy(true);
    try {
      if (saved) {
        await accommodationService.unsaveProperty(authUser.uid, property.id);
        setSaved(false);
      } else {
        await accommodationService.saveProperty(authUser.uid, property);
        setSaved(true);
      }
    } catch (err) {
      showAlert('MySheba', 'Could not update saved items right now.');
    } finally {
      setBusy(false);
    }
  };

  const toggleRented = async () => {
    setBusy(true);
    try {
      await accommodationService.setPropertyStatus(property.id, property.status === 'rented' ? 'active' : 'rented');
    } catch (err) {
      showAlert('MySheba', 'Could not update the listing.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    showAlert('Delete property listing?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await accommodationService.deleteProperty(property.id);
            goBackOrHome();
          } catch (err) {
            showAlert('MySheba', 'Could not delete the listing.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const shareProperty = async () => {
    try {
      await Share.share({ message: `${property.title}\n\nMYR ${Number(property.monthlyRent || property.rent || 0).toFixed(2)}/month${property.location ? `\n📍 ${property.location}` : ''}\n\nCheck it out on MySheba Marketplace!` });
    } catch (err) {
      // user cancelled the share sheet - nothing to do
    }
  };

  const openReport = () => {
    if (!authUser) return;
    showAlert('Report this property', 'Why are you reporting it?', [
      ...REPORT_REASONS.map((reason) => ({
        text: reason,
        onPress: async () => {
          try {
            await accommodationService.reportProperty(property.id, property.title, authUser.uid, reason);
            showAlert('MySheba', 'Thanks - our team will review this listing.');
          } catch (err) {
            showAlert('MySheba', 'Could not submit your report right now.');
          }
        },
      })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}><Text style={styles.backText}>←</Text></TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Property</Text>
        <TouchableOpacity style={styles.reportIconBtn} onPress={shareProperty}><Text style={styles.reportIcon}>↗️</Text></TouchableOpacity>
        {!isOwner && <TouchableOpacity style={styles.reportIconBtn} onPress={openReport}><Text style={styles.reportIcon}>🚩</Text></TouchableOpacity>}
      </LinearGradient>

      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH }}>
          {images.map((uri, i) => (
            <View key={i} style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH }}>
              {uri ? <Image source={{ uri }} style={styles.photo} resizeMode="cover" /> : <View style={[styles.photo, styles.photoPlaceholder]}><Text style={{ fontSize: 44 }}>🏠</Text></View>}
            </View>
          ))}
        </ScrollView>

        <View style={styles.body}>
          {property.status === 'rented' && <View style={styles.rentedBanner}><Text style={styles.rentedBannerText}>This property has been marked as RENTED</Text></View>}
          <Text style={styles.title}>{property.title}</Text>
          <Text style={styles.price}>MYR {Number(property.monthlyRent || 0).toFixed(2)}/month{property.deposit ? `  ·  Deposit MYR ${Number(property.deposit).toFixed(2)}` : ''}</Text>

          <View style={styles.metaRow}>
            <Text style={styles.metaTag}>{property.listingType}</Text>
            {!!property.availableDate && <Text style={styles.metaTag}>Available {formatAvailableDate(property.availableDate)}</Text>}
          </View>

          {!!property.location && <Text style={styles.metaLine}>📍 {property.location}</Text>}
          <MapPreview latitude={property.latitude} longitude={property.longitude} address={property.location} />
          <Text style={styles.metaLine}>Posted {formatDate(property.createdAt)}</Text>

          {!!(property.facilities && property.facilities.length) && (
            <>
              <Text style={styles.sectionLabel}>Facilities</Text>
              <View style={styles.facilityWrap}>{property.facilities.map((f) => <View key={f} style={styles.facilityTag}><Text style={styles.facilityTagText}>{f}</Text></View>)}</View>
            </>
          )}

          {!!property.description && (
            <>
              <Text style={styles.sectionLabel}>Description</Text>
              <Text style={styles.description}>{property.description}</Text>
            </>
          )}

          <Text style={styles.sectionLabel}>Owner</Text>
          <TouchableOpacity style={styles.ownerRow} activeOpacity={ownerBiz?.isBusinessProfile ? 0.7 : 1} onPress={() => ownerBiz?.isBusinessProfile && openBusinessProfile(property.ownerId)}>
            <View style={styles.ownerAvatar}><Text style={styles.ownerInitial}>{(property.ownerName || '?').trim().charAt(0).toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ownerName}>{property.ownerName || 'Owner'}</Text>
              <BusinessBadge isBusiness={ownerBiz?.isBusinessProfile} size="sm" />
            </View>
            {ownerBiz?.isBusinessProfile && <Text style={styles.chevron}>›</Text>}
          </TouchableOpacity>

          {isOwner ? (
            <View style={styles.ownerActions}>
              <TouchableOpacity style={[styles.actionBtn, styles.rentedBtn]} onPress={toggleRented} disabled={busy}><Text style={styles.actionBtnText}>{property.status === 'rented' ? 'Mark as Available' : 'Mark as Rented'}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={confirmDelete} disabled={busy}><Text style={styles.actionBtnText}>Delete Listing</Text></TouchableOpacity>
            </View>
          ) : (
            <View style={styles.buyerActions}>
              <TouchableOpacity style={styles.saveBtn} onPress={toggleSave} disabled={busy}>
                <Text style={styles.saveBtnText}>{saved ? '★ Saved' : '☆ Save'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
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
    photo: { width: '100%', height: '100%', backgroundColor: '#F1F3F4' },
    photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    body: { padding: 16 },
    rentedBanner: { backgroundColor: '#FDECEA', borderRadius: radius.md, padding: 10, marginBottom: 12 },
    rentedBannerText: { color: colors.error, fontWeight: '700', fontSize: 12, textAlign: 'center' },
    title: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 4 },
    price: { fontSize: 16, fontWeight: '700', color: colors.primaryDark, marginBottom: 10 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    metaTag: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill },
    metaLine: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
    sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.navy, marginTop: 16, marginBottom: 6 },
    facilityWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    facilityTag: { backgroundColor: '#E8F5E9', borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 },
    facilityTagText: { fontSize: 11, fontWeight: '600', color: colors.success },
    description: { fontSize: 13, color: colors.text, lineHeight: 19 },
    ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    ownerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    ownerInitial: { color: 'white', fontWeight: '700' },
    ownerName: { fontSize: 13, fontWeight: '600', color: colors.text },
    chevron: { fontSize: 18, color: '#CCC' },
    buyerActions: { marginTop: 22, alignItems: 'stretch' },
    saveBtn: { paddingHorizontal: 18, paddingVertical: 13, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    saveBtnText: { color: colors.navy, fontWeight: '700', fontSize: 13 },
    ownerActions: { gap: 10, marginTop: 22 },
    actionBtn: { borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' },
    rentedBtn: { backgroundColor: colors.secondary },
    deleteBtn: { backgroundColor: colors.error },
    actionBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
    emptyText: { fontSize: 13, color: '#999', textAlign: 'center', marginBottom: 12 },
    backLinkBtn: { paddingVertical: 8, paddingHorizontal: 16 },
    backLinkText: { color: colors.primary, fontWeight: '700' },
  });
}
