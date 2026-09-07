import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import * as roomChatService from '../firebase/roomChatService';

const TYPE_OPTIONS = [
  { key: 'open', label: 'Open', desc: 'Anyone can join instantly' },
  { key: 'approval', label: 'Request to join', desc: 'An admin approves each request' },
  { key: 'invite', label: 'Invite only', desc: 'Only admins can add members' },
];

// Any signed-in account can create a room (unlike groups, which are
// staff-only) - rooms are meant to be community spaces. The creator
// becomes owner + admin + first member automatically (see
// roomChatService.createRoom) and lands straight in the new thread.
export default function CreateRoomScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { authUser, profile, setScreen, openRoomChat } = useApp();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('open');
  const [rules, setRules] = useState(['']);
  const [creating, setCreating] = useState(false);

  const updateRule = (index, value) => {
    setRules((prev) => prev.map((r, i) => (i === index ? value : r)));
  };

  const addRuleField = () => setRules((prev) => [...prev, '']);

  const removeRuleField = (index) => {
    setRules((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const create = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showAlert('MySheba', 'Please give the room a name.');
      return;
    }
    setCreating(true);
    try {
      const roomId = await roomChatService.createRoom(
        trimmedName,
        description,
        rules,
        type,
        { uid: authUser.uid, name: profile?.name || '' }
      );
      openRoomChat(roomId, trimmedName);
    } catch (err) {
      showAlert('MySheba', 'Could not create the room. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={() => setScreen('chatHub')}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Room</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Room name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Kuala Lumpur Community"
          placeholderTextColor="#999"
        />

        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          placeholder="What's this room for?"
          placeholderTextColor="#999"
          multiline
        />

        <Text style={styles.label}>Who can join</Text>
        {TYPE_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.typeRow, type === opt.key && styles.typeRowActive]}
            onPress={() => setType(opt.key)}
          >
            <View style={[styles.radio, type === opt.key && styles.radioActive]}>
              {type === opt.key && <View style={styles.radioDot} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.typeLabel}>{opt.label}</Text>
              <Text style={styles.typeDesc}>{opt.desc}</Text>
            </View>
          </TouchableOpacity>
        ))}

        <Text style={styles.label}>Room rules</Text>
        <Text style={styles.hint}>Members must agree to these before they can post.</Text>
        {rules.map((rule, index) => (
          <View key={index} style={styles.ruleRow}>
            <Text style={styles.ruleBullet}>{index + 1}.</Text>
            <TextInput
              style={styles.ruleInput}
              value={rule}
              onChangeText={(v) => updateRule(index, v)}
              placeholder="e.g. Be respectful to other members"
              placeholderTextColor="#999"
            />
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

        <TouchableOpacity style={[styles.createBtn, creating && styles.createBtnDisabled]} onPress={create} disabled={creating}>
          {creating ? <ActivityIndicator color="white" /> : <Text style={styles.createBtnText}>Create Room</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
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
    label: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 16, marginBottom: 6 },
    hint: { fontSize: 12, color: '#888', marginBottom: 8, marginTop: -4 },
    input: {
      backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 14, color: colors.text, borderWidth: 1, borderColor: '#EEE',
    },
    multiline: { minHeight: 70, textAlignVertical: 'top' },
    typeRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: colors.card, borderRadius: radius.md, padding: 12, marginBottom: 8,
      borderWidth: 1, borderColor: '#EEE',
    },
    typeRowActive: { borderColor: colors.primary },
    radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#CCC', alignItems: 'center', justifyContent: 'center' },
    radioActive: { borderColor: colors.primary },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
    typeLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
    typeDesc: { fontSize: 11, color: '#888', marginTop: 1 },
    ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    ruleBullet: { fontSize: 13, color: '#888', width: 18 },
    ruleInput: {
      flex: 1, backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 13, color: colors.text, borderWidth: 1, borderColor: '#EEE',
    },
    ruleRemove: { fontSize: 16, color: colors.error, padding: 4 },
    addRuleBtn: { alignSelf: 'flex-start', marginTop: 2, marginBottom: 8 },
    addRuleBtnText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
    createBtn: {
      backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 14,
      alignItems: 'center', marginTop: 24,
    },
    createBtnDisabled: { opacity: 0.6 },
    createBtnText: { color: 'white', fontSize: 15, fontWeight: '700' },
  });
}
