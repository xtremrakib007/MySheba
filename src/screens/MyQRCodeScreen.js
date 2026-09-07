import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';

const ROLE_LABEL = { customer: 'Customer', dealer: 'Dealer', reseller: 'Reseller', admin: 'Admin', superadmin: 'Super Admin' };

// Shows the signed-in user's own MySheba QR code so someone else can scan
// it (see QRScanScreen.js) to add them as a contact instantly, the way
// WhatsApp's "My QR code" works. The code only ever encodes the account's
// uid - the scanning side re-fetches name/phone/role fresh from the server
// via getUserByUid rather than trusting anything embedded in the code.
export default function MyQRCodeScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { authUser, profile, setScreen } = useApp();

  const payload = JSON.stringify({ app: 'mysheba', uid: authUser?.uid || '' });

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={() => setScreen('addContact')}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My QR Code</Text>
      </LinearGradient>

      <View style={styles.body}>
        <View style={styles.card}>
          {!!authUser?.uid && (
            <QRCode
              value={payload}
              size={220}
              color={colors.navy}
              backgroundColor={colors.card}
            />
          )}
        </View>

        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(profile?.name || profile?.phone || '?').trim().charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{profile?.name || profile?.phone || 'User'}</Text>
        <Text style={styles.meta}>
          {ROLE_LABEL[profile?.role] || profile?.role}
          {profile?.userId ? ` · ID ${profile.userId}` : ''}
        </Text>

        <Text style={styles.hint}>Let someone scan this code to add you as a contact instantly.</Text>

        <TouchableOpacity style={styles.scanBtn} onPress={() => setScreen('qrScan')}>
          <Text style={styles.scanBtnText}>Scan a code instead</Text>
        </TouchableOpacity>
      </View>
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
    body: { flex: 1, alignItems: 'center', paddingTop: 30, paddingHorizontal: 24 },
    card: {
      backgroundColor: colors.card, padding: 20, borderRadius: radius.lg,
      borderWidth: 1, borderColor: colors.border, marginBottom: 20,
    },
    avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    avatarText: { color: 'white', fontWeight: '700', fontSize: 22 },
    name: { fontSize: 16, fontWeight: '700', color: colors.text },
    meta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    hint: { fontSize: 12, color: '#999', textAlign: 'center', marginTop: 20, paddingHorizontal: 20 },
    scanBtn: {
      marginTop: 24, paddingVertical: 12, paddingHorizontal: 24,
      borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary,
    },
    scanBtnText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  });
}
