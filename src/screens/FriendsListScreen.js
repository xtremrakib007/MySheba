import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Contacts from 'expo-contacts';
import { showAlert } from '../utils/appAlert';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import * as contactsService from '../firebase/contactsService';

const ROLE_LABEL = { customer: 'Customer', dealer: 'Dealer', reseller: 'Reseller', admin: 'Admin', superadmin: 'Super Admin' };

function normalizeDigits(v) {
  return String(v || '').replace(/[^0-9]/g, '');
}

/**
 * Friends list, WhatsApp-style: device-contact matches and explicitly added friends.
 * MySheba has Support Chat only; friends are not direct-chat contacts.
 */
export default function FriendsListScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { authUser, goBackOrHome, setScreen, openRingtonePicker } = useApp();
  const [permissionState, setPermissionState] = useState('unknown');
  const [deviceMatches, setDeviceMatches] = useState([]);
  const [addedFriends, setAddedFriends] = useState([]);
  const [loadingDevice, setLoadingDevice] = useState(false);

  const loadDeviceContacts = useCallback(async () => {
    setLoadingDevice(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        setPermissionState('denied');
        return;
      }
      setPermissionState('granted');
      const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] });
      const nameByDigits = new Map();
      const allDigits = [];
      data.forEach((c) => {
        (c.phoneNumbers || []).forEach((p) => {
          const digits = normalizeDigits(p.number);
          if (digits.length < 7) return;
          nameByDigits.set(digits, c.name || p.label || 'Contact');
          allDigits.push(digits);
        });
      });
      if (allDigits.length === 0) {
        setDeviceMatches([]);
        return;
      }
      const matched = await contactsService.matchContactsByPhone(allDigits);
      setDeviceMatches(matched.map((u) => ({
        ...u,
        deviceContactName: nameByDigits.get(normalizeDigits(u.phone)) || u.name,
      })));
    } catch (err) {
      showAlert('MySheba', 'Could not check your contacts right now.');
    } finally {
      setLoadingDevice(false);
    }
  }, []);

  useEffect(() => { loadDeviceContacts(); }, [loadDeviceContacts]);
  useEffect(() => {
    if (!authUser) return undefined;
    return contactsService.subscribeFriends(authUser.uid, setAddedFriends);
  }, [authUser]);

  const deviceUids = new Set(deviceMatches.map((m) => m.uid));
  const addedOnly = addedFriends.filter((f) => !deviceUids.has(f.uid));

  const renderRow = (item, displayName, subtitle) => (
    <View key={item.uid} style={styles.userRow}>
      <View style={styles.userRowMain}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(displayName || '?').trim().charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.userBody}>
          <Text style={styles.userName}>{displayName}</Text>
          <Text style={styles.userRole}>{subtitle}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.ringtoneBtn}
        onPress={() => openRingtonePicker(item.uid, displayName)}
        hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
      >
        <Text style={styles.ringtoneIcon}>🔔</Text>
      </TouchableOpacity>
    </View>
  );

  const sections = [];
  if (deviceMatches.length > 0) sections.push({ title: 'From your contacts', data: deviceMatches, kind: 'device' });
  if (addedOnly.length > 0) sections.push({ title: 'Added friends', data: addedOnly, kind: 'added' });

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}><Text style={styles.backText}>←</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Friends</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setScreen('addContact')}><Text style={styles.addBtnText}>+ Add</Text></TouchableOpacity>
      </LinearGradient>
      {loadingDevice && <ActivityIndicator style={styles.loading} size="small" color={colors.primary} />}
      {permissionState === 'denied' && (
        <View style={styles.permissionCard}>
          <Text style={styles.permissionText}>Allow contacts access to see which of your saved numbers are already on MySheba.</Text>
          <TouchableOpacity style={styles.permissionBtn} onPress={() => Linking.openSettings()}><Text style={styles.permissionBtnText}>Open Settings</Text></TouchableOpacity>
        </View>
      )}
      <FlatList
        data={sections}
        keyExtractor={(s) => s.kind}
        contentContainerStyle={styles.list}
        ListEmptyComponent={!loadingDevice ? <View style={styles.emptyWrap}><Text style={styles.empty}>No friends yet</Text><TouchableOpacity style={styles.emptyBtn} onPress={() => setScreen('addContact')}><Text style={styles.emptyBtnText}>Search and add a friend</Text></TouchableOpacity></View> : null}
        renderItem={({ item: section }) => (
          <View>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.data.map((item) => section.kind === 'device'
              ? renderRow(item, item.deviceContactName, `${ROLE_LABEL[item.role] || item.role}${item.name && item.name !== item.deviceContactName ? ` · ${item.name} on MySheba` : ''}`)
              : renderRow(item, item.deviceContactName || item.name || item.phone, ROLE_LABEL[item.role] || item.role))}
          </View>
        )}
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 }, backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10, flex: 1 },
    addBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radius.pill },
    addBtnText: { color: 'white', fontWeight: '600', fontSize: 12 }, loading: { marginTop: 8 },
    permissionCard: { margin: 16, padding: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
    permissionText: { fontSize: 12, color: '#666', marginBottom: 10, lineHeight: 17 },
    permissionBtn: { backgroundColor: colors.primary, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center' },
    permissionBtnText: { color: 'white', fontWeight: '600', fontSize: 12 },
    list: { paddingHorizontal: 16, paddingBottom: 20, paddingTop: 8 },
    sectionTitle: { fontSize: 12, fontWeight: '700', color: '#999', textTransform: 'uppercase', marginTop: 12, marginBottom: 8 },
    emptyWrap: { alignItems: 'center', paddingVertical: 40 }, empty: { textAlign: 'center', color: '#999', fontSize: 13, marginBottom: 12 },
    emptyBtn: { backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.pill },
    emptyBtnText: { color: 'white', fontWeight: '600', fontSize: 13 },
    userRow: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 8, overflow: 'hidden' },
    userRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: 'white', fontWeight: '700' }, userBody: { flex: 1 }, userName: { fontSize: 14, fontWeight: '600', color: colors.text }, userRole: { fontSize: 11, color: '#999', marginTop: 2 },
    ringtoneBtn: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderLeftWidth: 1, borderLeftColor: colors.border }, ringtoneIcon: { fontSize: 18 },
  });
}
