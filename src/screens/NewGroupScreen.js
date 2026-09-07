import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import * as contactsService from '../firebase/contactsService';
import * as groupChatService from '../firebase/groupChatService';

const ROLE_LABEL = { customer: 'Customer', dealer: 'Dealer', reseller: 'Reseller', admin: 'Admin', superadmin: 'Super Admin' };

// "New Group" flow, open to any signed-in account (customers included):
// name the group, search for and pick members from any account (any role),
// create it, and jump straight into the new thread. Member search goes
// through the same searchUsers Cloud Function
// as AddContactScreen (see src/firebase/contactsService.js) rather than a
// plain `collection(db, 'users')` listener - firestore.rules scopes a
// dealer/dealer's direct read of `users` to their own customer pool
// only, so an unscoped client query used to come back permission-denied
// (and the whole member list silently failed to load) for anyone who
// wasn't admin/superadmin. The Cloud Function runs with the Admin SDK and
// hands back only the public-safe fields a picker needs, so it works the
// same way for every staff role.
export default function NewGroupScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { authUser, profile, setScreen, openGroupChat } = useApp();
  const [name, setName] = useState('');
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState({}); // { [uid]: { uid, name, phone, role } }
  const [creating, setCreating] = useState(false);
  const debounceRef = useRef(null);

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

  const addMember = (user) => {
    setSelected((s) => ({ ...s, [user.uid]: user }));
    setTerm('');
    setResults([]);
  };

  const removeMember = (uid) => {
    setSelected((s) => {
      const next = { ...s };
      delete next[uid];
      return next;
    });
  };

  const selectedList = Object.values(selected);
  const visibleResults = results.filter((u) => u.uid !== authUser.uid && !selected[u.uid]);

  const create = async () => {
    if (!name.trim()) {
      showAlert('MySheba', 'Please enter a group name.');
      return;
    }
    if (selectedList.length === 0) {
      showAlert('MySheba', 'Search for and add at least one other member for the group.');
      return;
    }
    setCreating(true);
    try {
      const groupId = await groupChatService.createGroup(
        name,
        selectedList.map((u) => ({ uid: u.uid, name: u.name || u.phone || 'User' })),
        { uid: authUser.uid, name: profile?.name || '' }
      );
      openGroupChat(groupId, name.trim() || 'Group Chat');
    } catch (err) {
      showAlert('MySheba', 'Could not create the group. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient } start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={() => setScreen('chatHub')}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Group</Text>
      </LinearGradient>

      <View style={styles.nameRow}>
        <TextInput
          style={styles.nameInput}
          value={name}
          onChangeText={setName}
          placeholder="Group name"
          placeholderTextColor="#999"
        />
      </View>

      {selectedList.length > 0 && (
        <View style={styles.chipsWrap}>
          {selectedList.map((u) => (
            <TouchableOpacity key={u.uid} style={styles.chip} onPress={() => removeMember(u.uid)}>
              <Text style={styles.chipText} numberOfLines={1}>{u.name || u.phone || 'User'}</Text>
              <Text style={styles.chipRemove}>✕</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={term}
          onChangeText={setTerm}
          placeholder="Search by name, phone, or user ID to add members"
          placeholderTextColor="#999"
        />
      </View>

      {searching && <ActivityIndicator style={styles.loading} size="small" color={colors.primary} />}

      <FlatList
        data={visibleResults}
        keyExtractor={(item) => item.uid}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !searching ? (
            <Text style={styles.empty}>
              {term.trim().length < 2
                ? (selectedList.length > 0 ? `${selectedList.length} member${selectedList.length === 1 ? '' : 's'} added.` : 'Type a name, phone number, or user ID to search.')
                : 'No matching accounts found.'}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.userRow} onPress={() => addMember(item)}>
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
            <Text style={styles.addIcon}>+</Text>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity
        style={[styles.createBtn, (creating || selectedList.length === 0 || !name.trim()) && styles.createBtnDisabled]}
        onPress={create}
        disabled={creating || selectedList.length === 0 || !name.trim()}
      >
        {creating ? <ActivityIndicator color="white" /> : <Text style={styles.createBtnText}>Create Group</Text>}
      </TouchableOpacity>
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
    nameRow: { padding: 16, paddingBottom: 8 },
    nameInput: {
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text,
    },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E3F2FD',
      borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12, maxWidth: 160,
    },
    chipText: { fontSize: 12, fontWeight: '600', color: colors.primary },
    chipRemove: { fontSize: 11, color: colors.primary, fontWeight: '700' },
    searchRow: { paddingHorizontal: 16, paddingBottom: 8 },
    searchInput: {
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill,
      paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: colors.text,
    },
    loading: { marginBottom: 8 },
    list: { paddingHorizontal: 16, paddingBottom: 12 },
    empty: { textAlign: 'center', color: '#999', paddingVertical: 30, fontSize: 13 },
    userRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
      padding: 12, marginBottom: 8,
    },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: 'white', fontWeight: '700' },
    userBody: { flex: 1 },
    userName: { fontSize: 14, fontWeight: '600', color: colors.text },
    userRole: { fontSize: 11, color: '#999', marginTop: 2 },
    addIcon: { fontSize: 20, color: colors.primary, fontWeight: '700' },
    createBtn: {
      margin: 16, backgroundColor: colors.primary, borderRadius: radius.md,
      paddingVertical: 14, alignItems: 'center',
    },
    createBtnDisabled: { opacity: 0.5 },
    createBtnText: { color: 'white', fontWeight: '700', fontSize: 15 },
  });
}
