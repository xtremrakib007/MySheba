import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Switch, StyleSheet } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import * as roomChatService from '../firebase/roomChatService';
import { GAME_BOT_UID, GAME_BOT_GAMES } from '../firebase/roomChatService';

const JOIN_TYPES = [
  { key: 'open', label: 'Open', hint: 'Anyone can join instantly' },
  { key: 'approval', label: 'Approval', hint: 'Join requests need admin approval' },
  { key: 'invite', label: 'Invite Only', hint: 'Only admins can add members' },
];

// Moderation panel for a room, reached from the ⚙️ icon in ChatScreen's
// header when isRoom && the signed-in user is an admin OR a moderator
// (isRoomStaff). Admins get everything: edit name/description/rules,
// GameBot, promote/demote admin & moderator, ban. Moderators get a
// narrower slice: approve/reject join requests, mute/kick - gated per
// section below with isAdmin / isStaff, and enforced server-side too
// (see the moderator branch in firestore.rules).
export default function RoomSettingsScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { authUser, activeRoomId, setScreen, setChatHubTab } = useApp();
  const [room, setRoom] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState(['']);

  useEffect(() => {
    if (!activeRoomId) return undefined;
    const unsub = roomChatService.subscribeRoomMeta(activeRoomId, (r) => {
      setRoom(r);
      if (r) {
        setName((prev) => (prev === '' ? r.name || '' : prev));
        setDescription((prev) => (prev === '' ? r.description || '' : prev));
        setRules((prev) => (prev.length === 1 && !prev[0] ? (r.rules && r.rules.length ? r.rules : ['']) : prev));
      }
    }, () => {});
    return unsub;
  }, [activeRoomId]);

  if (!room) {
    return (
      <View style={styles.screen}>
        <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
          <HeaderDecor />
          <TouchableOpacity style={styles.backBtn} onPress={() => setScreen('chat')}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Room Settings</Text>
        </LinearGradient>
      </View>
    );
  }

  const isAdmin = (room.adminUids || []).includes(authUser.uid);
  const isModerator = (room.moderatorUids || []).includes(authUser.uid);
  const isStaff = isAdmin || isModerator;
  const isOwner = room.ownerUid === authUser.uid;
  const memberUids = room.memberUids || [];
  const pendingUids = room.pendingUids || [];
  const memberNames = room.memberNames || {};

  const updateRule = (index, value) => setRules((prev) => prev.map((r, i) => (i === index ? value : r)));
  const addRuleField = () => setRules((prev) => [...prev, '']);
  const removeRuleField = (index) => setRules((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const saveInfo = async () => {
    try {
      await roomChatService.updateRoomInfo(activeRoomId, { name, description });
      showAlert('MySheba', 'Room info updated.');
    } catch (err) {
      showAlert('MySheba', 'Could not save changes.');
    }
  };

  const saveRules = async () => {
    try {
      await roomChatService.updateRoomRules(activeRoomId, rules);
      showAlert('MySheba', 'Rules updated. Members will be asked to re-accept them.');
    } catch (err) {
      showAlert('MySheba', 'Could not save the rules.');
    }
  };

  const approve = (uid) => roomChatService.approveJoinRequest(activeRoomId, uid).catch(() => {});
  const reject = (uid) => roomChatService.rejectJoinRequest(activeRoomId, uid).catch(() => {});
  const promote = (uid) => roomChatService.promoteToAdmin(activeRoomId, uid).catch(() => {});
  const demote = (uid) => roomChatService.demoteAdmin(activeRoomId, uid).catch(() => {});
  const promoteMod = (uid) => roomChatService.promoteToModerator(activeRoomId, uid).catch(() => {});
  const demoteMod = (uid) => roomChatService.demoteModerator(activeRoomId, uid).catch(() => {});
  const mute = (uid) => roomChatService.muteRoomMember(activeRoomId, uid).catch(() => {});
  const unmute = (uid) => roomChatService.unmuteRoomMember(activeRoomId, uid).catch(() => {});
  const kick = (uid) => {
    showAlert('Remove member', 'Remove this member from the room?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => roomChatService.removeRoomMember(activeRoomId, uid).catch(() => {}) },
    ]);
  };
  const ban = (uid) => {
    showAlert('Ban member', 'Ban this member? They will be removed and cannot rejoin an open room.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Ban', style: 'destructive', onPress: () => roomChatService.banRoomMember(activeRoomId, uid).catch(() => {}) },
    ]);
  };
  const unban = (uid) => roomChatService.unbanRoomMember(activeRoomId, uid).catch(() => {});
  const changeJoinType = (type) => {
    if (type === room.type) return;
    roomChatService.updateRoomType(activeRoomId, type).catch(() => {
      showAlert('MySheba', 'Could not update the join type.');
    });
  };
  const toggleAdminsOnlyPost = (value) => {
    roomChatService.updateRoomAdminsOnlyPost(activeRoomId, value).catch(() => {
      showAlert('MySheba', 'Could not update this setting.');
    });
  };
  const selectGameBot = (game) => {
    roomChatService.setRoomGameBot(activeRoomId, game).catch(() => {
      showAlert('MySheba', 'Could not add GameBot to this room.');
    });
  };
  const disableGameBot = () => {
    roomChatService.removeRoomGameBot(activeRoomId).catch(() => {
      showAlert('MySheba', 'Could not turn off GameBot.');
    });
  };
  const leaveRoom = () => {
    showAlert('Leave room', 'Leave this room? You\u2019ll need to rejoin to see new messages.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await roomChatService.removeRoomMember(activeRoomId, authUser.uid);
            setChatHubTab('rooms');
            setScreen('chatHub');
          } catch (err) {
            showAlert('MySheba', 'Could not leave the room.');
          }
        },
      },
    ]);
  };

  const deleteRoomConfirm = () => {
    showAlert(
      'Delete room',
      `Permanently delete "${room.name || 'this room'}"? This removes it for every member and can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await roomChatService.deleteRoom(activeRoomId);
              setChatHubTab('rooms');
              setScreen('chatHub');
            } catch (err) {
              showAlert('MySheba', 'Could not delete the room.');
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
        <Text style={styles.headerTitle}>Room Settings</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.body}>
        {isAdmin && (
          <>
            <Text style={styles.section}>Room info</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Room name" placeholderTextColor="#999" />
            <TextInput
              style={[styles.input, styles.multiline]}
              value={description}
              onChangeText={setDescription}
              placeholder="Description"
              placeholderTextColor="#999"
              multiline
            />
            <TouchableOpacity style={styles.saveBtn} onPress={saveInfo}>
              <Text style={styles.saveBtnText}>Save Info</Text>
            </TouchableOpacity>

            <Text style={styles.section}>Who can join</Text>
            {JOIN_TYPES.map((jt) => (
              <TouchableOpacity
                key={jt.key}
                style={[styles.joinTypeRow, room.type === jt.key && styles.joinTypeRowActive]}
                onPress={() => changeJoinType(jt.key)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.joinTypeLabel, room.type === jt.key && styles.joinTypeLabelActive]}>{jt.label}</Text>
                  <Text style={styles.joinTypeHint}>{jt.hint}</Text>
                </View>
                {room.type === jt.key && <Text style={styles.joinTypeCheck}>✓</Text>}
              </TouchableOpacity>
            ))}

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Only admins can post</Text>
                <Text style={styles.toggleHint}>Members can still read, but only admins can send messages</Text>
              </View>
              <Switch
                value={!!room.adminsOnlyPost}
                onValueChange={toggleAdminsOnlyPost}
                trackColor={{ true: colors.primary }}
              />
            </View>
          </>
        )}
        {isAdmin && (
          <>
            <Text style={styles.section}>Game Bot</Text>
            <Text style={styles.joinTypeHint}>
              Add GameBot to this room for points-based games (.newgame, .join, .startgame — no real money).
            </Text>
            <TouchableOpacity
              style={[styles.joinTypeRow, !room.gameBotGame && styles.joinTypeRowActive]}
              onPress={disableGameBot}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.joinTypeLabel, !room.gameBotGame && styles.joinTypeLabelActive]}>Off</Text>
                <Text style={styles.joinTypeHint}>No game bot in this room</Text>
              </View>
              {!room.gameBotGame && <Text style={styles.joinTypeCheck}>✓</Text>}
            </TouchableOpacity>
            {GAME_BOT_GAMES.map((g) => (
              <TouchableOpacity
                key={g.key}
                style={[styles.joinTypeRow, room.gameBotGame === g.key && styles.joinTypeRowActive]}
                onPress={() => selectGameBot(g.key)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.joinTypeLabel, room.gameBotGame === g.key && styles.joinTypeLabelActive]}>{g.label}</Text>
                </View>
                {room.gameBotGame === g.key && <Text style={styles.joinTypeCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
            {memberUids.includes(GAME_BOT_UID) && (
              <Text style={styles.joinTypeHint}>GameBot is a member of this room.</Text>
            )}
          </>
        )}

        {isAdmin && (
          <>
            <Text style={styles.section}>Rules</Text>
            {rules.map((rule, index) => (
              <View key={index} style={styles.ruleRow}>
                <Text style={styles.ruleBullet}>{index + 1}.</Text>
                <TextInput style={styles.ruleInput} value={rule} onChangeText={(v) => updateRule(index, v)} placeholderTextColor="#999" />
                {rules.length > 1 && (
                  <TouchableOpacity onPress={() => removeRuleField(index)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.ruleRemove}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity style={styles.addRuleBtn} onPress={addRuleField}>
              <Text style={styles.addRuleBtnText}>+ Add another rule</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={saveRules}>
              <Text style={styles.saveBtnText}>Save Rules</Text>
            </TouchableOpacity>
          </>
        )}

        {isStaff && pendingUids.length > 0 && (
          <>
            <Text style={styles.section}>Join requests ({pendingUids.length})</Text>
            {pendingUids.map((uid) => (
              <View key={uid} style={styles.memberRow}>
                <Text style={styles.memberName}>{memberNames[uid] || 'User'}</Text>
                <View style={styles.memberActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => approve(uid)}>
                    <Text style={styles.actionBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.actionBtnMuted]} onPress={() => reject(uid)}>
                    <Text style={styles.actionBtnMutedText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        <Text style={styles.section}>Members ({memberUids.length})</Text>
        {!isStaff && (
          <Text style={styles.hint}>Only admins/moderators can manage members. You can still leave the room below.</Text>
        )}
        {memberUids.map((uid) => {
          const memberIsAdmin = (room.adminUids || []).includes(uid);
          const memberIsModerator = (room.moderatorUids || []).includes(uid);
          const memberIsMuted = (room.mutedUids || []).includes(uid);
          const memberIsOwner = room.ownerUid === uid;
          return (
            <View key={uid} style={styles.memberRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>
                  {memberNames[uid] || 'User'}
                  {memberIsOwner ? ' (Owner)' : memberIsAdmin ? ' (Admin)' : memberIsModerator ? ' (Moderator)' : ''}
                </Text>
              </View>
              {!memberIsOwner && uid !== authUser.uid && isStaff && (isAdmin || !memberIsAdmin) && (
                <View style={styles.memberActions}>
                  {isAdmin && (
                    memberIsAdmin ? (
                      <TouchableOpacity style={styles.actionBtn} onPress={() => demote(uid)}>
                        <Text style={styles.actionBtnText}>Demote</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={styles.actionBtn} onPress={() => promote(uid)}>
                        <Text style={styles.actionBtnText}>Promote</Text>
                      </TouchableOpacity>
                    )
                  )}
                  {isAdmin && !memberIsAdmin && (
                    memberIsModerator ? (
                      <TouchableOpacity style={styles.actionBtn} onPress={() => demoteMod(uid)}>
                        <Text style={styles.actionBtnText}>Unmod</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={styles.actionBtn} onPress={() => promoteMod(uid)}>
                        <Text style={styles.actionBtnText}>Make Mod</Text>
                      </TouchableOpacity>
                    )
                  )}
                  <TouchableOpacity style={styles.actionBtn} onPress={() => (memberIsMuted ? unmute(uid) : mute(uid))}>
                    <Text style={styles.actionBtnText}>{memberIsMuted ? 'Unmute' : 'Mute'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => kick(uid)}>
                    <Text style={styles.actionBtnDangerText}>Remove</Text>
                  </TouchableOpacity>
                  {isStaff && (
                    <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => ban(uid)}>
                      <Text style={styles.actionBtnDangerText}>Ban</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {isStaff && (room.bannedUids || []).length > 0 && (
          <>
            <Text style={styles.section}>Banned ({(room.bannedUids || []).length})</Text>
            {(room.bannedUids || []).map((uid) => (
              <View key={uid} style={styles.memberRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{memberNames[uid] || 'User'}</Text>
                </View>
                <TouchableOpacity style={styles.actionBtn} onPress={() => unban(uid)}>
                  <Text style={styles.actionBtnText}>Unban</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {!isOwner && (
          <TouchableOpacity style={styles.leaveBtn} onPress={leaveRoom}>
            <Text style={styles.leaveBtnText}>Leave Room</Text>
          </TouchableOpacity>
        )}
        {isAdmin && (
          <TouchableOpacity style={styles.deleteBtn} onPress={deleteRoomConfirm}>
            <Text style={styles.deleteBtnText}>Delete Room</Text>
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
    multiline: { minHeight: 60, textAlignVertical: 'top' },
    saveBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
    saveBtnText: { color: 'white', fontSize: 13, fontWeight: '700' },
    ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    ruleBullet: { fontSize: 13, color: '#888', width: 18 },
    ruleInput: {
      flex: 1, backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 13, color: colors.text, borderWidth: 1, borderColor: '#EEE',
    },
    ruleRemove: { fontSize: 16, color: colors.error, padding: 4 },
    addRuleBtn: { alignSelf: 'flex-start', marginBottom: 8 },
    addRuleBtnText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
    memberRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: colors.card, borderRadius: radius.md, padding: 12, marginBottom: 8,
      borderWidth: 1, borderColor: '#EEE', flexWrap: 'wrap', gap: 8,
    },
    memberName: { fontSize: 13, fontWeight: '600', color: colors.text },
    memberActions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    actionBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 10 },
    actionBtnText: { color: 'white', fontSize: 11, fontWeight: '700' },
    actionBtnMuted: { backgroundColor: '#EEE' },
    actionBtnMutedText: { color: '#666', fontSize: 11, fontWeight: '700' },
    actionBtnDanger: { backgroundColor: '#FDECEA' },
    actionBtnDangerText: { color: colors.error, fontSize: 11, fontWeight: '700' },
    joinTypeRow: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md,
      padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#EEE',
    },
    joinTypeRowActive: { borderColor: colors.primary, backgroundColor: colors.card },
    joinTypeLabel: { fontSize: 13, fontWeight: '700', color: colors.text },
    joinTypeLabelActive: { color: colors.primary },
    joinTypeHint: { fontSize: 11, color: '#888', marginTop: 2 },
    joinTypeCheck: { fontSize: 16, color: colors.primary, fontWeight: '700' },
    toggleRow: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md,
      padding: 12, marginTop: 20, borderWidth: 1, borderColor: '#EEE',
    },
    toggleLabel: { fontSize: 13, fontWeight: '700', color: colors.text },
    toggleHint: { fontSize: 11, color: '#888', marginTop: 2 },
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
