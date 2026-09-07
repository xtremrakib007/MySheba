// Group Settings - every member can rename the group; adding/removing
// members (including leaving) is staff-only (dealer/dealer/admin/
// superadmin), matching firestore.rules' groupChats update rule ("changing
// who's in an existing group stays staff-only"). Non-staff members see the
// member list read-only with a note to contact staff to be removed.
// Reached from the ⚙️ icon in ChatScreen's header when isGroup.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import * as groupChatService from '../firebase/groupChatService';
import * as contactsService from '../firebase/contactsService';

export default function GroupSettingsScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { authUser, profile, activeGroupId, setScreen, setChatHubTab } = useApp();
  const [group, setGroup] = useState(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [addingUid, setAddingUid] = useState(null);
  const debounceRef = useRef(null);

  const isStaff = profile && ['dealer', 'reseller', 'admin', 'superadmin'].includes(profile.role);

  useEffect(() => {
    if (!activeGroupId) return undefined;
    const unsub = groupChatService.subscribeGroupMeta(activeGroupId, (g) => {
      setGroup(g);
      setName((prev) => (prev === '' ? g?.name || '' : prev));
    }, () => {});
    return unsub;
  }, [activeGroupId]);

  useEffect(() => {
    if (!isStaff) return undefined;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = term.trim();
    if (q.length < 2) { setResults([]); setSearching(false); return undefined; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const list = await contactsService.searchUsers(q);
        setResults(list);
      } catch (err) {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [term, isStaff]);

  if (!group) {
    return (
      <View style={styles.screen}>
        <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
          <HeaderDecor />
          <TouchableOpacity style={styles.backBtn} onPress={() => setScreen('chat')}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Group Settings</Text>
        </LinearGradient>
      </View>
    );
  }

  const memberUids = group.memberUids || [];
  const memberNames = group.memberNames || {};
  const visibleResults = results.filter((u) => u.uid !== authUser.uid && !memberUids.includes(u.uid));

  const saveName = async () => {
    if (!name.trim()) {
      showAlert('MySheba', 'Please enter a group name.');
      return;
    }
    setSaving(true);
    try {
      await groupChatService.renameGroup(activeGroupId, name);
      showAlert('MySheba', 'Group name updated.');
    } catch (err) {
      showAlert('MySheba', 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  const addMember = async (user) => {
    setAddingUid(user.uid);
    try {
      await groupChatService.addGroupMember(activeGroupId, { uid: user.uid, name: user.name || user.phone || 'User' });
      setTerm('');
      setResults([]);
    } catch (err) {
      showAlert('MySheba', 'Could not add this member.');
    } finally {
      setAddingUid(null);
    }
  };

  const removeMember = (uid) => {
    showAlert('Remove member', 'Remove this member from the group?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => groupChatService.removeGroupMember(activeGroupId, uid).catch(() => {}) },
    ]);
  };

  const leaveGroup = () => {
    showAlert('Leave group', 'Leave this group? You\u2019ll need to be re-added to see new messages.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await groupChatService.removeGroupMember(activeGroupId, authUser.uid);
            setChatHubTab('groups');
            setScreen('chatHub');
          } catch (err) {
            showAlert('MySheba', 'Could not leave the group.');
          }
        },
      },
    ]);
  };

  const deleteGroupConfirm = () => {
    showAlert(
      'Delete group',
      `Permanently delete "${group.name || 'this group'}"? This removes it for every member and can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await groupChatService.deleteGroup(activeGroupId);
              setChatHubTab('groups');
              setScreen('chatHub');
            } catch (err) {
              showAlert('MySheba', 'Could not delete the group.');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={() => setScreen('chat')}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group Settings</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.section}>Group info</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Group name" placeholderTextColor="#999" />
        <TouchableOpacity style={styles.saveBtn} onPress={saveName} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Info'}</Text>
        </TouchableOpacity>

        {isStaff && (
          <>
            <Text style={styles.section}>Add Member</Text>
            <TextInput
              style={styles.input}
              value={term}
              onChangeText={setTerm}
              placeholder="Search by name or phone"
              placeholderTextColor="#999"
            />
            {searching && <ActivityIndicator color={colors.primary} style={{ marginVertical: 8 }} />}
            {visibleResults.map((u) => (
              <View key={u.uid} style={styles.memberRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{u.name || u.phone || 'User'}</Text>
                </View>
                <TouchableOpacity style={styles.actionBtn} onPress={() => addMember(u)} disabled={addingUid === u.uid}>
                  <Text style={styles.actionBtnText}>{addingUid === u.uid ? '...' : '+ Add'}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        <Text style={styles.section}>Members ({memberUids.length})</Text>
        {!isStaff && (
          <Text style={styles.hint}>Only dealers/admins can add or remove other members. You can still leave the group below.</Text>
        )}
        {memberUids.map((uid) => (
          <View key={uid} style={styles.memberRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.memberName}>{memberNames[uid] || 'User'}</Text>
            </View>
            {isStaff && uid !== authUser.uid && (
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => removeMember(uid)}>
                <Text style={styles.actionBtnDangerText}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        <TouchableOpacity style={styles.leaveBtn} onPress={leaveGroup}>
          <Text style={styles.leaveBtnText}>Leave Group</Text>
        </TouchableOpacity>
        {group.createdBy === authUser.uid && (
          <TouchableOpacity style={styles.deleteBtn} onPress={deleteGroupConfirm}>
            <Text style={styles.deleteBtnText}>Delete Group</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { flex: 1, color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    body: { padding: 16, paddingBottom: 40 },
    section: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 20, marginBottom: 8, textTransform: 'uppercase' },
    hint: { fontSize: 12, color: '#888', marginBottom: 10, lineHeight: 17 },
    input: {
      backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 14, color: colors.text, borderWidth: 1, borderColor: '#EEE', marginBottom: 8,
    },
    saveBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
    saveBtnText: { color: 'white', fontSize: 13, fontWeight: '700' },
    memberRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: colors.card, borderRadius: radius.md, padding: 12, marginBottom: 8,
      borderWidth: 1, borderColor: '#EEE', flexWrap: 'wrap', gap: 8,
    },
    memberName: { fontSize: 13, fontWeight: '600', color: colors.text },
    actionBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 10 },
    actionBtnText: { color: 'white', fontSize: 11, fontWeight: '700' },
    actionBtnDanger: { backgroundColor: '#FDECEA' },
    actionBtnDangerText: { color: colors.error, fontSize: 11, fontWeight: '700' },
    leaveBtn: {
      backgroundColor: '#FDECEA', borderRadius: radius.pill, paddingVertical: 12, alignItems: 'center', marginTop: 24,
    },
    leaveBtnText: { color: colors.error, fontSize: 13, fontWeight: '700' },
    deleteBtn: {
      backgroundColor: colors.error, borderRadius: radius.pill, paddingVertical: 12, alignItems: 'center', marginTop: 12,
    },
    deleteBtnText: { color: 'white', fontSize: 13, fontWeight: '700' },
  });
}
