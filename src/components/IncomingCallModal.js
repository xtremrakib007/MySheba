import React, { useEffect, useMemo, useRef } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Vibration } from 'react-native';
import { Audio } from 'expo-av';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { VIBRATION_PATTERNS } from '../data/callSettingsConstants';
import { resolveCallerCallSettings } from '../firebase/callerRingtoneService';

const RINGTONE_SOURCES = {
  default: require('../../assets/sounds/ringtone.mp3'),
  classic: require('../../assets/sounds/ringtone.mp3'),
  soft: require('../../assets/sounds/soft.mp3'),
};

/** Full-screen incoming prompt for 1-to-1 voice/video calls. */
export default function IncomingCallModal() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { incomingCall, answerIncomingCall, rejectIncomingCall, callSettings, callerRingtones } = useApp();
  const soundRef = useRef(null);

  const overrideKey = incomingCall?.callerUid || null;
  const effective = useMemo(
    () => resolveCallerCallSettings(callSettings, callerRingtones, overrideKey),
    [callSettings, callerRingtones, overrideKey]
  );

  useEffect(() => {
    let cancelled = false;
    if (incomingCall) {
      if (effective.notificationsEnabled === false) return () => {};

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
          if (cancelled) { await sound.unloadAsync(); return; }
          soundRef.current = sound;
          await sound.playAsync();
        } catch (_) {
          // Ringtone failure must never block answering or declining.
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
  }, [incomingCall?.id, effective]);

  if (!incomingCall) return null;

  const kindLabel = incomingCall.type === 'video' ? '📹 Incoming video call' : '📞 Incoming call';

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.kind}>{kindLabel}</Text>
          <Text style={styles.name}>{incomingCall.callerName || 'Someone'}</Text>
          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.decline]} onPress={rejectIncomingCall}>
              <Text style={styles.btnLabel}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.accept]} onPress={answerIncomingCall}>
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
    name: { fontSize: 22, fontWeight: '700', marginBottom: 20, color: '#111' },
    row: { flexDirection: 'row', gap: 16 },
    btn: { flex: 1, paddingVertical: 14, borderRadius: 30, alignItems: 'center' },
    decline: { backgroundColor: '#E53935' },
    accept: { backgroundColor: colors.primary },
    btnLabel: { color: '#fff', fontWeight: '700', fontSize: 15 },
  });
}
