import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';

// Shown right after a brand-new Google account's first sign-in
// (doGoogleLogin in AppContext.js catches ensureGoogleProfile's
// PHONE_REQUIRED, see functions/googleAuth.js) - Google itself never hands
// us a phone number, but every MySheba account needs one, unique to that
// account. completeGooglePhone (AppContext.js) reuses the Google
// credential already signed in from that first attempt, so this only ever
// needs the phone number itself, not a redo of the Google picker.
export default function GooglePhoneScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { completeGooglePhone, cancelGooglePhone, authError, authBusy } = useApp();
  const [phone, setPhone] = useState('');
  const [localError, setLocalError] = useState('');

  const onSubmit = async () => {
    if (String(phone).replace(/[^0-9]/g, '').length < 8) {
      setLocalError('Please enter a valid phone number.');
      return;
    }
    setLocalError('');
    await completeGooglePhone(phone.trim());
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <Text style={styles.headerTitle}>One Last Step</Text>
      </LinearGradient>

      <View style={styles.body}>
        <Text style={styles.intro}>
          Every MySheba account needs a mobile number. Enter yours to finish setting up your account.
        </Text>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            placeholder="Phone number"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            autoFocus
          />
          <Text style={styles.hint}>This number can only be used for one account.</Text>
        </View>

        {!!(localError || authError) && <Text style={styles.errorText}>{localError || authError}</Text>}

        <TouchableOpacity style={[styles.btn, authBusy && styles.btnDisabled]} onPress={onSubmit} disabled={authBusy}>
          {authBusy ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Continue</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} onPress={cancelGooglePhone} disabled={authBusy}>
          <Text style={styles.cancelText}>Cancel and sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16 },
    body: { padding: 20 },
    intro: { fontSize: 13, color: '#666', marginBottom: 20, textAlign: 'center', lineHeight: 19 },
    formGroup: { marginBottom: 14 },
    label: { fontWeight: '500', marginBottom: 5, fontSize: 13 },
    hint: { fontSize: 11, color: '#888', marginTop: 5 },
    input: { width: '100%', paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, fontSize: 14, backgroundColor: 'white' },
    btn: { backgroundColor: colors.primary, paddingVertical: 12, borderRadius: radius.md, alignItems: 'center' },
    btnDisabled: { opacity: 0.6 },
    btnText: { color: 'white', fontWeight: '600', fontSize: 14 },
    errorText: { color: colors.error, fontSize: 12, marginTop: 10, textAlign: 'center' },
    cancelBtn: { alignItems: 'center', marginTop: 24 },
    cancelText: { color: '#999', fontSize: 12, fontWeight: '500' },
  });
}
