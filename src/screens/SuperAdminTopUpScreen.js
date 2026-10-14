import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import SuperadminDepositModal from '../components/SuperadminDepositModal';

export default function SuperAdminTopUpScreen() {
  const { colors } = useTheme();
  const { profile, setScreen, goBackOrHome, setAdminTab, setAdminViewingSection } = useApp();
  const isAdmin = profile?.role === 'admin';
  const isSuperadmin = profile?.role === 'superadmin';
  const [depositOpen, setDepositOpen] = useState(false);
  const openTopupRequests = () => { setAdminTab('topups'); setAdminViewingSection(true); setScreen('adminHome'); };

  // The superadmin's Top-Ups tile used to end here, on a note saying wallet
  // value cannot be created. Everything it needs exists: a recorded bank
  // deposit into their own wallet (the one place money enters - see
  // functions/superadminDepositService.js), an instant transfer to any user
  // (superadmin may send to every role), and the customers' requests.
  if (isSuperadmin) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.bg }]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Top-Ups</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Add money to your wallet from a bank deposit, then send it to anyone instantly.
          </Text>
          <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={() => setDepositOpen(true)}>
            <Text style={styles.buttonText}>🏦 Record bank deposit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.gap, { backgroundColor: colors.primary }]} onPress={() => setScreen('transferPoints')}>
            <Text style={styles.buttonText}>⚡ Send money to a user instantly</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.gap, styles.outline, { borderColor: colors.primary }]} onPress={openTopupRequests}>
            <Text style={[styles.buttonText, { color: colors.primary }]}>📋 Review customer top-up requests</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={goBackOrHome} style={styles.back}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Back</Text>
          </TouchableOpacity>
        </View>
        <SuperadminDepositModal visible={depositOpen} onClose={() => setDepositOpen(false)} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Wallet Funding</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Direct staff self-credit is disabled. Wallet value must come through the approved funding workflow and be recorded server-side.
        </Text>
        {isAdmin ? (
          <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={() => setScreen('walletFunding')}>
            <Text style={styles.buttonText}>Open Wallet Funding</Text>
          </TouchableOpacity>
        ) : (
          <Text style={[styles.notice, { color: colors.textSecondary }]}>
            Superadmin wallet funding must come from an approved external/partner funding mechanism. This screen cannot create wallet value.
          </Text>
        )}
        <TouchableOpacity onPress={goBackOrHome} style={styles.back}>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { borderWidth: 1, borderRadius: 18, padding: 22 },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 10 },
  body: { fontSize: 14, lineHeight: 21, marginBottom: 18 },
  notice: { fontSize: 13, lineHeight: 19 },
  button: { paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '800' },
  back: { alignItems: 'center', marginTop: 18, padding: 8 },
  gap: { marginTop: 10 },
  outline: { backgroundColor: 'transparent', borderWidth: 1.5 },
});
