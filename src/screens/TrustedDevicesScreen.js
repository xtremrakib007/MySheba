import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius, spacing } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import * as deviceSessionService from '../firebase/deviceSessionService';
import { friendlyMessage } from '../utils/signInErrorCopy';

function formatWhen(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' \u00B7 ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// Settings > Trusted Devices (admin/superadmin only - see SettingsScreen.js).
// Lists every device that has already cleared the admin sign-in OTP
// challenge once (functions/deviceSessionService.js's trustedDevices map -
// see checkDeviceSession's own doc comment there for the full flow) and
// therefore skips it on every later login. Removing a device here just
// makes its NEXT login ask for the code again - it doesn't sign anything
// out immediately.
export default function TrustedDevicesScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { goBackOrHome } = useApp();

  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await deviceSessionService.listTrustedDevices();
      setDevices(list);
    } catch (e) {
      setError(friendlyMessage(e, 'Could not load trusted devices.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const confirmRemove = (device) => {
    showAlert(
      'Remove this device?',
      `${device.label || 'This device'} will need to enter a verification code the next time it signs in.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusyId(device.deviceId);
            try {
              await deviceSessionService.revokeTrustedDevice(device.deviceId);
              setDevices((prev) => prev.filter((d) => d.deviceId !== device.deviceId));
            } catch (e) {
              showAlert('MySheba', e.message || 'Could not remove this device.');
            } finally {
              setBusyId(null);
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
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📱 Trusted Devices</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        <Text style={styles.hint}>
          These devices already verified a sign-in code once, so they skip it on future
          logins. Remove a device you don't recognize, or one you no longer use - it'll be
          asked for a fresh code the next time it signs in.
        </Text>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 30 }} color={colors.primary} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : devices.length === 0 ? (
          <Text style={styles.empty}>No trusted devices yet. Verify a sign-in code once and this device will be remembered here.</Text>
        ) : (
          devices.map((device) => (
            <View key={device.deviceId} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardTextWrap}>
                  <View style={styles.nameRow}>
                    <Text style={styles.deviceName} numberOfLines={1}>{device.label || 'Unknown device'}</Text>
                    {device.isCurrent && (
                      <View style={styles.currentPill}><Text style={styles.currentPillText}>This device</Text></View>
                    )}
                  </View>
                  {!!device.lastIp && <Text style={styles.detailText}>IP: {device.lastIp}</Text>}
                  {!!device.lastSeenAt && <Text style={styles.detailText}>Last used: {formatWhen(device.lastSeenAt)}</Text>}
                  {!!device.trustedAt && <Text style={styles.detailText}>Trusted since: {formatWhen(device.trustedAt)}</Text>}
                </View>
              </View>
              <TouchableOpacity
                style={styles.removeBtn}
                disabled={busyId === device.deviceId}
                onPress={() => confirmRemove(device)}
              >
                {busyId === device.deviceId
                  ? <ActivityIndicator size="small" color={colors.error} />
                  : <Text style={styles.removeBtnText}>Remove</Text>}
              </TouchableOpacity>
            </View>
          ))
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
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    hint: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 17 },
    empty: { textAlign: 'center', color: colors.textSecondary, paddingVertical: 30, fontSize: 13 },
    errorText: { color: colors.error, textAlign: 'center', paddingVertical: 20, fontSize: 13 },
    card: {
      backgroundColor: colors.card, borderRadius: radius.lg,
      borderWidth: 1, borderColor: colors.border,
      padding: spacing.md, marginBottom: spacing.sm,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    },
    cardTop: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    cardTextWrap: { flex: 1 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    deviceName: { fontSize: 13, fontWeight: '700', color: colors.text, flexShrink: 1 },
    currentPill: { backgroundColor: '#E8F5E9', paddingVertical: 2, paddingHorizontal: 8, borderRadius: radius.pill },
    currentPillText: { fontSize: 10, fontWeight: '700', color: '#2E7D32' },
    detailText: { fontSize: 11, color: colors.textSecondary, marginTop: 3 },
    removeBtn: { backgroundColor: '#FDECEA', paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.md },
    removeBtnText: { color: colors.error, fontSize: 12, fontWeight: '700' },
  });
}
