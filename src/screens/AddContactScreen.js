import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import * as contactsService from '../firebase/contactsService';
import * as directChatService from '../firebase/directChatService';

const ROLE_LABEL = { customer: 'Customer', dealer: 'Dealer', reseller: 'Reseller', admin: 'Admin', superadmin: 'Super Admin' };

// Find anyone in the system - any role, not just people already assigned to
// you - by name or phone number, then start (or jump back into) a direct
// chat with them, or add them to your Friends list (see
// FriendsListScreen.js) without necessarily starting a chat yet. Search
// runs through the searchUsers Cloud Function since firestore.rules
// doesn't allow a plain client read across every account.
export default function AddContactScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { authUser, profile, setScreen, openDirectChat } = useApp();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [startingUid, setStartingUid] = useState(null);
  const [friendUids, setFriendUids] = useState(new Set());
  const [addingUid, setAddingUid] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!authUser) return undefined;
    return contactsService.subscribeFriends(authUser.uid, (list) => setFriendUids(new Set(list.map((f) => f.uid))));
  }, [authUser]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = term.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const list = await contactsService.searchUsers(q);
        setResults(list);
      } catch (err) {
        console.log('[searchUsers] error:', err?.code || err?.message || err);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [term]);

  const startChat = async (user) => {
    setStartingUid(user.uid);
    try {
      const chatId = await directChatService.ensureDirectChat(
        { uid: authUser.uid, name: profile?.name || '' },
        { uid: user.uid, name: user.name || user.phone || 'User' }
      );
      openDirectChat(chatId, user.name || user.phone || 'User', user.uid);
    } catch (err) {
      showAlert('MySheba', 'Could not start this conversation. Please try again.');
    } finally {
      setStartingUid(null);
    }
  };

  const toggleFriend = async (user) => {
    setAddingUid(user.uid);
    try {
      if (friendUids.has(user.uid)) {
        await contactsService.removeFriend(authUser.uid, user.uid);
      } else {
        await contactsService.addFriend(authUser.uid, user);
      }
      // subscribeFriends' live listener updates friendUids automatically -
      // no local state patch needed here.
    } catch (err) {
      showAlert('MySheba', 'Could not update your Friends list. Please try again.');
    } finally {
      setAddingUid(null);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient } start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={() => setScreen('chatHub')}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Contact</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => setScreen('qrScan')}>
            <Text style={styles.headerIcon}>▣</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => setScreen('myQrCode')}>
            <Text style={styles.headerIcon}>⊞</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={term}
          onChangeText={setTerm}
          placeholder="Search by name, phone, or user ID"
          placeholderTextColor="#999"
          autoFocus
        />
      </View>

      <TouchableOpacity style={styles.qrPromptRow} onPress={() => setScreen('qrScan')}>
        <Text style={styles.qrPromptIcon}>▣</Text>
        <Text style={styles.qrPromptText}>Scan a QR code to add a contact instantly</Text>
      </TouchableOpacity>

      {searching && (
        <ActivityIndicator style={styles.loading} size="small" color={colors.primary} />
      )}

      <FlatList
        data={results}
        keyExtractor={(item) => item.uid}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !searching ? (
            <Text style={styles.empty}>
              {term.trim().length < 2 ? 'Type a name, phone number, or user ID to search.' : 'No matching accounts found.'}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.userRow}>
            <TouchableOpacity
              style={styles.userRowMain}
              onPress={() => startChat(item)}
              disabled={!!startingUid}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(item.name || item.phone || '?').trim().charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.userBody}>
                <Text style={styles.userName}>{item.name || item.phone || 'User'}</Text>
                <Text style={styles.userRole}>
                  {ROLE_LABEL[item.role] || item.role}
                  {item.phone ? ` · ${item.phone}` : ''}
                  {item.userId ? ` · ID ${item.userId}` : ''}
                </Text>
              </View>
              {startingUid === item.uid ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.chatIcon}>💬</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.friendBtn}
              onPress={() => toggleFriend(item)}
              disabled={addingUid === item.uid}
            >
              {addingUid === item.uid ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.friendIcon}>{friendUids.has(item.uid) ? '★' : '☆'}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
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
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10, flex: 1 },
    headerActions: { flexDirection: 'row', gap: 4 },
    headerIconBtn: { padding: 6 },
    headerIcon: { color: 'white', fontSize: 18 },
    searchRow: { padding: 16, paddingBottom: 8 },
    qrPromptRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8,
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
      paddingVertical: 10, paddingHorizontal: 12,
    },
    qrPromptIcon: { fontSize: 16, color: colors.primary },
    qrPromptText: { fontSize: 12, color: colors.textSecondary, flex: 1 },
    searchInput: {
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill,
      paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: colors.text,
    },
    loading: { marginTop: 8 },
    list: { paddingHorizontal: 16, paddingBottom: 20, paddingTop: 8 },
    empty: { textAlign: 'center', color: '#999', paddingVertical: 30, fontSize: 13 },
    userRow: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
      marginBottom: 8,
    },
    userRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
    friendBtn: { paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
    friendIcon: { fontSize: 20, color: colors.primary },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: 'white', fontWeight: '700' },
    userBody: { flex: 1 },
    userName: { fontSize: 14, fontWeight: '600', color: colors.text },
    userRole: { fontSize: 11, color: '#999', marginTop: 2 },
    chatIcon: { fontSize: 20 },
  });
}
