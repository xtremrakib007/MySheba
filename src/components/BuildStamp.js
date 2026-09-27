import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { useTheme } from '../theme/ThemeContext';

// Which bundle is actually running.
//
// "The last two updates didn't apply" was impossible to check from inside
// the app: the version string comes from app.base.json and is baked into
// the native build, so it reads 5.4.1.12 whether the JS on top of it is
// today's OTA or the one from three weeks ago. Nothing on any screen
// distinguished them.
//
// expo-updates knows exactly which bundle it launched. Tapping the version
// line shows it: EMBEDDED means the app is running the JS that shipped
// inside the APK and no OTA has been applied, which is the answer to "did
// my update land". The publish time is the decisive one - compare it with
// when the workflow ran.
function shortId(id) {
  const s = String(id || '');
  return s ? s.slice(0, 8) : '—';
}

function when(value) {
  if (!value) return '—';
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  } catch (_) {
    return '—';
  }
}

export default function BuildStamp() {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  const version = Constants.expoConfig?.version || '—';
  const build = Constants.expoConfig?.android?.versionCode;

  // Every one of these is safe to read when updates are disabled (dev
  // client, Expo Go) - they simply come back null or false.
  let embedded = true;
  let updateId = null;
  let createdAt = null;
  let channel = null;
  let runtime = null;
  try {
    embedded = Updates.isEmbeddedLaunch !== false;
    updateId = Updates.updateId;
    createdAt = Updates.createdAt;
    channel = Updates.channel;
    runtime = Updates.runtimeVersion;
  } catch (_) {
    // Leave the defaults; the version line below still renders.
  }

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel="App version details"
      >
        <Text style={[styles.version, { color: colors.textSecondary }]}>
          MySheba {version}{build ? ` (${build})` : ''}
        </Text>
      </TouchableOpacity>

      {!!open && (
        <View style={[styles.detail, { borderColor: colors.border }]}>
          <Text style={[styles.row, { color: colors.textSecondary }]}>
            Bundle: {embedded ? 'EMBEDDED (no update applied)' : `OTA ${shortId(updateId)}`}
          </Text>
          <Text style={[styles.row, { color: colors.textSecondary }]}>
            Published: {when(createdAt)}
          </Text>
          <Text style={[styles.row, { color: colors.textSecondary }]}>
            Channel: {channel || '—'}
          </Text>
          <Text style={[styles.row, { color: colors.textSecondary }]}>
            Runtime: {runtime || '—'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginTop: 18, marginBottom: 6 },
  version: { fontSize: 11, fontWeight: '600', paddingVertical: 6 },
  detail: { marginTop: 4, borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  row: { fontSize: 10.5, lineHeight: 16, textAlign: 'center' },
});
