import React, { useEffect, useMemo, useRef } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Vibration } from 'react-native';
import { Audio } from 'expo-av';
import { useApp } from '../context/AppContext';
import { useTheme } from "../theme/ThemeContext";
import { VIBRATION_PATTERNS } from '../data/callSettingsConstants';
import { resolveCallerCallSettings } from '../firebase/callerRingtoneService';

// Bundled ringtone sources, keyed the same as RINGTONE_OPTIONS in
// callSettingsConstants.js. 'default' and 'classic' intentionally point at
// the same file (assets/sounds/ringtone.mp3) - that file and soft.mp3 are
// both also registered as native raw resources via app.json's
// expo-notifications "sounds" entry, so 'default' and 'soft' (but not
// 'custom' - see callSettingsConstants.js) also ring correctly when the
// app is closed/locked, via callPush.js's channel matrix instead of this
// component.
const RINGTONE_SOURCES = {
  default: require('../../assets/sounds/ringtone.mp3'),
  classic: require('../../assets/sounds/ringtone.mp3'),
  soft: require('../../assets/sounds/soft.mp3'),
};

/** Full-screen "incoming call" prompt that can pop up over any screen. Plays a
 * looping ring tone + repeating vibration for as long as the call is ringing,
 * same as the notification would if you were looking at your phone when
 * someone rang you on WhatsApp - this covers the app-open case; the
 * app-closed case is handled by the high-priority "calls" push channel (see
 * pushService.js) since JS (and this component) isn't running then. Ringtone,
 * vibration, and volume follow the caller's per-caller override if one is
 * set (see callerRingtoneService.js / RingtonePickerScreen.js), else the
 * user's global Call Settings (see CallSettingsScreen.js /
 * callSettingsConstants.js) - resolveCallerCallSettings below is the same
 * merge callPush.js's background path uses, so a given caller rings the
 * same way whether the app is open or not. */
export default function IncomingCallModal() {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const {
    incomingCall, answerIncomingCall, rejectIncomingCall,
    incomingGroupCall, answerIncomingGroupCall, rejectIncomingGroupCall,
    callSettings, callerRingtones,
  } = useApp();
  const soundRef = useRef(null);

  // A 1:1 call and a group call ringing at the exact same moment is an
  // edge case, not a real flow - if it ever happens, the 1:1 call wins the
  // prompt (it's the more common case) and the group call still shows its
  // own prompt right after this one is answered/declined.
  const incoming = incomingCall || incomingGroupCall;
  const isGroup = !incomingCall && !!incomingGroupCall;
  const onAnswer = isGroup ? answerIncomingGroupCall : answerIncomingCall;
  const onReject = isGroup ? rejectIncomingGroupCall : rejectIncomingCall;

  // A group call rings by which GROUP is calling, not by whichever member
  // happened to tap "start call" this time - a member starting a group
  // call today and a different member starting it tomorrow should ring
  // the same way for you, so the override key is incoming.groupId, not
  // incoming.callerUid, whenever isGroup is true. 1:1 calls key off the
  // caller's own uid as you'd expect.
  const overrideKey = incoming ? (isGroup ? incoming.groupId : incoming.callerUid) : null;
  // Memoized (not recomputed inline every render) since it's the ring
  // effect's dependency below - an unmemoized new-object-every-render
  // value there would restart the ringtone/vibration on every re-render
  // while a call is ringing, not just on an actual settings change.
  const effective = useMemo(
    () => resolveCallerCallSettings(callSettings, callerRingtones, overrideKey),
    [callSettings, callerRingtones, overrideKey]
  );

  useEffect(() => {
    let cancelled = false;
    if (incoming) {
      if (effective.notificationsEnabled === false) {
        // Notifications are off - the call is still live in Firestore (so
        // Accept/Decline elsewhere still work), we just don't ring/buzz for it.
        return () => {};
      }

      if (effective.vibrationEnabled !== false) {
        const preset = VIBRATION_PATTERNS[effective.vibrationPattern] || VIBRATION_PATTERNS.default;
        Vibration.vibrate(preset.pattern, true);
      }

      (async () => {
        try {
          await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
          const source = effective.ringtone === 'custom' && effective.customRingtoneUri
            ? { uri: effective.customRingtoneUri }
            : (RINGTONE_SOURCES[effective.ringtone] || RINGTONE_SOURCES.default);
          const { sound } = await Audio.Sound.createAsync(
            source,
            { isLooping: true, volume: typeof effective.volume === 'number' ? effective.volume : 1.0 }
          );
          if (cancelled) { sound.unloadAsync(); return; }
          soundRef.current = sound;
          await sound.playAsync();
        } catch (e) {
          // Ringtone is a nice-to-have - a failed load/play should never
          // block answering or declining the call itself. If a custom
          // ringtone file fails (e.g. moved/deleted), fall back silently
          // rather than leaving the call unringable.
        }
      })();
    }
    return () => {
      cancelled = true;
      Vibration.cancel();
      if (soundRef.current) {
        soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    };
  }, [incoming?.id, effective]);

  if (!incoming) return null;

  // Group calls don't have a single "callee" - show the group name, with
  // who's calling as a subtitle instead of the headline name.
  const kindLabel = incoming.type === 'video' ? '📹 Incoming video call' : '📞 Incoming call';

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.kind}>{kindLabel}</Text>
          <Text style={[styles.name, !isGroup && styles.nameSpaced]}>
            {isGroup ? (incoming.groupName || 'Group call') : (incoming.callerName || 'Someone')}
          </Text>
          {isGroup && <Text style={styles.subtitle}>{incoming.callerName || 'Someone'} started a group call</Text>}

          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.decline]} onPress={onReject}>
              <Text style={styles.btnLabel}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.accept]} onPress={onAnswer}>
              <Text style={styles.btnLabel}>Accept</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    card: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, alignItems: 'center' },
    kind: { fontSize: 14, color: '#666', marginBottom: 4 },
    name: { fontSize: 22, fontWeight: '700', marginBottom: 4, color: '#111' },
    nameSpaced: { marginBottom: 20 },
    subtitle: { fontSize: 13, color: '#666', marginBottom: 16 },
    row: { flexDirection: 'row', gap: 16 },
    btn: { flex: 1, paddingVertical: 14, borderRadius: 30, alignItems: 'center' },
    decline: { backgroundColor: '#E53935' },
    accept: { backgroundColor: colors.primary },
    btnLabel: { color: '#fff', fontWeight: '700', fontSize: 15 },
  });
}
