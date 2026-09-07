import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import { showAlert } from '../utils/appAlert';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import { RINGTONE_OPTIONS, VIBRATION_PATTERNS } from '../data/callSettingsConstants';

function ToggleRow({ icon, label, sub, value, onValueChange, disabled }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <View style={[styles.row, disabled && styles.rowDisabled]}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: '#DDD', true: colors.primary }}
        thumbColor={Platform.OS === 'android' ? 'white' : undefined}
      />
    </View>
  );
}

function RadioRow({ label, sub, selected, disabled, onPress }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={[styles.row, disabled && styles.rowDisabled]} onPress={disabled ? undefined : onPress} disabled={disabled}>
      <View style={styles.radioOuter}>{selected && !disabled && <View style={styles.radioInner} />}</View>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      {disabled && (
        <View style={styles.comingSoonPill}>
          <Text style={styles.comingSoonText}>Coming soon</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

/** Call Settings - lets the signed-in user control how MySheba rings them:
 * whether calls notify them at all, which ringtone plays, vibration on/off
 * + pattern, and the foreground ring volume. Persisted to Firestore via
 * AppContext.updateCallSettings (see there for how each field is actually
 * consumed by IncomingCallModal.js / callPush.js / functions/index.js). */
export default function CallSettingsScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, callSettings, updateCallSettings } = useApp();
  const [pickingFile, setPickingFile] = useState(false);

  const onToggleNotifications = (v) => updateCallSettings({ notificationsEnabled: v });
  const onToggleVibration = (v) => updateCallSettings({ vibrationEnabled: v });
  const onSelectVibrationPattern = (key) => updateCallSettings({ vibrationPattern: key });
  const onSetVolume = (v) => updateCallSettings({ volume: v });

  const onSelectRingtone = async (key) => {
    if (key === 'custom') {
      try {
        setPickingFile(true);
        const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
        if (result.canceled) return;
        const file = result.assets?.[0];
        if (!file?.uri) return;
        updateCallSettings({
          ringtone: 'custom',
          customRingtoneUri: file.uri,
          customRingtoneName: file.name || 'Custom ringtone',
        });
      } catch (e) {
        showAlert('MySheba', 'Could not select that file. Please try again.');
      } finally {
        setPickingFile(false);
      }
      return;
    }
    updateCallSettings({ ringtone: key });
  };

  const volumePercent = Math.round((typeof callSettings.volume === 'number' ? callSettings.volume : 1) * 100);
  const volumeSteps = [0.2, 0.4, 0.6, 0.8, 1];

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>MySheba Calls</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        <View style={styles.card}>
          <ToggleRow
            icon="📞"
            label="Incoming Call Notifications"
            sub="Ring and show a full-screen alert for incoming calls"
            value={callSettings.notificationsEnabled !== false}
            onValueChange={onToggleNotifications}
          />
        </View>

        <Text style={styles.sectionTitle}>Ringtone</Text>
        <View style={styles.card}>
          {RINGTONE_OPTIONS.map((opt, i) => (
            <React.Fragment key={opt.key}>
              {i > 0 && <View style={styles.divider} />}
              <RadioRow
                label={opt.label}
                sub={
                  opt.key === 'custom'
                    ? (callSettings.ringtone === 'custom' ? callSettings.customRingtoneName || 'File selected' : 'Choose an audio file from your device')
                    : undefined
                }
                selected={callSettings.ringtone === opt.key}
                disabled={opt.comingSoon || (opt.key === 'custom' && pickingFile)}
                onPress={() => onSelectRingtone(opt.key)}
              />
            </React.Fragment>
          ))}
          <View style={styles.divider} />
          <Text style={styles.footnote}>
            "Custom" only changes the sound while the app is open - when the app is closed or the phone is
            locked, a custom file can't be used since Android can't play an arbitrary file for a locked-screen
            call alert. "MySheba Default", "Classic", and "Soft" all ring correctly either way.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Vibration</Text>
        <View style={styles.card}>
          <ToggleRow icon="📳" label="Vibration" value={callSettings.vibrationEnabled !== false} onValueChange={onToggleVibration} />
          <View style={styles.divider} />
          {Object.keys(VIBRATION_PATTERNS).map((key, i) => (
            <React.Fragment key={key}>
              {i > 0 && <View style={styles.divider} />}
              <RadioRow
                label={VIBRATION_PATTERNS[key].label}
                selected={(callSettings.vibrationPattern || 'default') === key}
                disabled={callSettings.vibrationEnabled === false}
                onPress={() => onSelectVibrationPattern(key)}
              />
            </React.Fragment>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Call Notification Volume</Text>
        <View style={styles.card}>
          <View style={styles.volumeRow}>
            <Text style={styles.volumeIcon}>🔉</Text>
            <View style={styles.volumeSteps}>
              {volumeSteps.map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[styles.volumeSegment, v <= (callSettings.volume ?? 1) + 0.001 && styles.volumeSegmentFilled]}
                  onPress={() => onSetVolume(v)}
                />
              ))}
            </View>
            <Text style={styles.volumeIcon}>🔊</Text>
          </View>
          <Text style={styles.volumePercent}>{volumePercent}%</Text>
          <Text style={styles.footnote}>
            Controls ring loudness while the app is open. The lock-screen/background ring
            follows your phone's ringer volume.
          </Text>
        </View>
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
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    sectionTitle: { fontSize: 12, fontWeight: '700', color: '#999', textTransform: 'uppercase', marginTop: 20, marginBottom: 8, marginHorizontal: 16 },
    card: { backgroundColor: colors.card, marginHorizontal: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14, gap: 12 },
    rowDisabled: { opacity: 0.5 },
    rowIcon: { fontSize: 18, width: 22, textAlign: 'center' },
    rowTextWrap: { flex: 1 },
    rowLabel: { fontSize: 14, fontWeight: '500', color: colors.text },
    rowSub: { fontSize: 11, color: '#999', marginTop: 2 },
    divider: { height: 1, backgroundColor: '#F0F0F0', marginLeft: 48 },
    radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
    comingSoonPill: { backgroundColor: '#F0F0F0', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    comingSoonText: { fontSize: 10, color: '#888', fontWeight: '600' },
    footnote: { fontSize: 11, color: '#999', paddingHorizontal: 14, paddingVertical: 12, lineHeight: 16 },
    volumeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 16, gap: 10 },
    volumeIcon: { fontSize: 16 },
    volumeSteps: { flex: 1, flexDirection: 'row', gap: 6 },
    volumeSegment: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#E5E5E5' },
    volumeSegmentFilled: { backgroundColor: colors.primary },
    volumePercent: { textAlign: 'center', fontSize: 12, color: '#999', marginTop: 6 },
  });
}
