import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import { showAlert } from '../utils/appAlert';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import { RINGTONE_OPTIONS, VIBRATION_PATTERNS } from '../data/callSettingsConstants';

function RadioRow({ label, sub, selected, onPress }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <View style={styles.radioOuter}>{selected && <View style={styles.radioInner} />}</View>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
    </TouchableOpacity>
  );
}

/** Per-caller ringtone + vibration override - lets the signed-in user set
 * "when THIS person calls me, ring like this" instead of only the one
 * global profile in CallSettingsScreen.js. Opened via
 * AppContext.openRingtonePicker(callerUid, callerName) - e.g. the 🔔
 * action on a FriendsListScreen row - which sets
 * activeRingtoneContactUid/Name below.
 *
 * A caller with no override saved here (callerOverride is undefined) just
 * inherits the owner's global Call Settings - that's the default and
 * common case, and this screen makes that state a first-class, clearly
 * labeled option ("Use MySheba Default") rather than something achieved by
 * leaving everything blank. "Use MySheba Default" for ringtone and
 * vibration are independent - a caller can have a custom ringtone but the
 * default vibration pattern, or vice versa (see updateCallerRingtone /
 * clearCallerRingtone in AppContext.js, and resolveCallerCallSettings in
 * callerRingtoneService.js which does that merge). Volume and the
 * notifications-on/off toggle are deliberately NOT here - see the file
 * header on callerRingtoneService.js for why those stay global-only. */
export default function RingtonePickerScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const {
    goBackOrHome, callSettings, callerRingtones,
    activeRingtoneContactUid, activeRingtoneContactName,
    updateCallerRingtone, clearCallerRingtone,
  } = useApp();
  const [pickingFile, setPickingFile] = useState(false);

  const override = (activeRingtoneContactUid && callerRingtones[activeRingtoneContactUid]) || {};
  const hasRingtoneOverride = !!override.ringtone;
  const hasVibrationOverride = !!override.vibrationPattern;

  const onSelectRingtone = async (key) => {
    if (!activeRingtoneContactUid) return;
    if (key === 'custom') {
      try {
        setPickingFile(true);
        const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
        if (result.canceled) return;
        const file = result.assets?.[0];
        if (!file?.uri) return;
        updateCallerRingtone(activeRingtoneContactUid, {
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
    updateCallerRingtone(activeRingtoneContactUid, { ringtone: key, customRingtoneUri: null, customRingtoneName: null });
  };

  const onUseDefaultRingtone = () => {
    if (!activeRingtoneContactUid) return;
    if (hasVibrationOverride) {
      // Only the ringtone half of the override is being cleared - keep
      // the vibration override intact rather than clearing the whole doc.
      updateCallerRingtone(activeRingtoneContactUid, { ringtone: null, customRingtoneUri: null, customRingtoneName: null });
    } else {
      clearCallerRingtone(activeRingtoneContactUid);
    }
  };

  const onSelectVibrationPattern = (key) => {
    if (!activeRingtoneContactUid) return;
    updateCallerRingtone(activeRingtoneContactUid, { vibrationPattern: key });
  };

  const onUseDefaultVibration = () => {
    if (!activeRingtoneContactUid) return;
    if (hasRingtoneOverride) {
      updateCallerRingtone(activeRingtoneContactUid, { vibrationPattern: null });
    } else {
      clearCallerRingtone(activeRingtoneContactUid);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{activeRingtoneContactName || 'Ringtone'}</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        <Text style={styles.footnote}>
          Choose how your phone rings when {activeRingtoneContactName || 'this person'} calls you. Anything you
          don't set here follows your regular Call Settings.
        </Text>

        <Text style={styles.sectionTitle}>Ringtone</Text>
        <View style={styles.card}>
          <RadioRow
            label="Use MySheba Default"
            sub={`Currently: ${RINGTONE_OPTIONS.find((o) => o.key === callSettings.ringtone)?.label || 'MySheba Default'}`}
            selected={!hasRingtoneOverride}
            onPress={onUseDefaultRingtone}
          />
          <View style={styles.divider} />
          {RINGTONE_OPTIONS.map((opt, i) => (
            <React.Fragment key={opt.key}>
              {i > 0 && <View style={styles.divider} />}
              <RadioRow
                label={opt.label}
                sub={
                  opt.key === 'custom'
                    ? (override.ringtone === 'custom' ? override.customRingtoneName || 'File selected' : 'Choose an audio file from your device')
                    : undefined
                }
                selected={override.ringtone === opt.key}
                onPress={() => onSelectRingtone(opt.key)}
              />
            </React.Fragment>
          ))}
          <View style={styles.divider} />
          <Text style={styles.footnote}>
            "Custom" only rings while the app is open - Android can't use an arbitrary file for a
            locked-screen call alert. "MySheba Default", "Classic", and "Soft" all ring correctly either way.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Vibration</Text>
        <View style={styles.card}>
          <RadioRow
            label="Use MySheba Default"
            sub={`Currently: ${VIBRATION_PATTERNS[callSettings.vibrationPattern]?.label || 'Default'}`}
            selected={!hasVibrationOverride}
            onPress={onUseDefaultVibration}
          />
          <View style={styles.divider} />
          {Object.keys(VIBRATION_PATTERNS).map((key, i) => (
            <React.Fragment key={key}>
              {i > 0 && <View style={styles.divider} />}
              <RadioRow
                label={VIBRATION_PATTERNS[key].label}
                selected={override.vibrationPattern === key}
                onPress={() => onSelectVibrationPattern(key)}
              />
            </React.Fragment>
          ))}
        </View>

        {(hasRingtoneOverride || hasVibrationOverride) && (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => activeRingtoneContactUid && clearCallerRingtone(activeRingtoneContactUid)}
          >
            <Text style={styles.resetBtnText}>Reset to MySheba Default</Text>
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
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10, flex: 1 },
    sectionTitle: { fontSize: 12, fontWeight: '700', color: '#999', textTransform: 'uppercase', marginTop: 20, marginBottom: 8, marginHorizontal: 16 },
    card: { backgroundColor: colors.card, marginHorizontal: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14, gap: 12 },
    rowTextWrap: { flex: 1 },
    rowLabel: { fontSize: 14, fontWeight: '500', color: colors.text },
    rowSub: { fontSize: 11, color: '#999', marginTop: 2 },
    divider: { height: 1, backgroundColor: '#F0F0F0', marginLeft: 48 },
    radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
    footnote: { fontSize: 11, color: '#999', paddingHorizontal: 14, paddingVertical: 12, lineHeight: 16 },
    resetBtn: { marginHorizontal: 16, marginTop: 20, paddingVertical: 12, alignItems: 'center' },
    resetBtnText: { color: '#E53935', fontWeight: '600', fontSize: 13 },
  });
}
