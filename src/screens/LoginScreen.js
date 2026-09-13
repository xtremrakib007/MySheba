import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Image, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { secureAsyncStorage } from '../firebase/secureLocalStorage';
import PhoneCountryPicker from '../components/PhoneCountryPicker';
import { DEFAULT_PHONE_COUNTRY } from '../data/phoneCountries';

const REMEMBER_KEY = 'mysheba_remembered_phone';
const BRAND_TEAL = '#00A99D';
const BRAND_BLUE = '#1A73E8';
const BRAND_NAVY = '#0B2447';

export default function LoginScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { setScreen, doLogin, authError, authBusy } = useApp();
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [countryPicker, setCountryPicker] = useState(false);
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  useEffect(() => {
    secureAsyncStorage.getItem(REMEMBER_KEY).then((saved) => { if (saved) setPhone(saved); }).catch(() => {});
  }, []);

  const onSignIn = () => {
    secureAsyncStorage.setItem(REMEMBER_KEY, rememberMe ? phone : '').catch(() => {});
    doLogin(phone, pin, phoneCountry.dial);
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={[BRAND_TEAL, BRAND_BLUE]} style={styles.top} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Image source={require('../../assets/icon-transparent.png')} style={styles.logo} resizeMode="contain" />
            <Text style={styles.brand}><Text style={styles.brandDark}>My</Text>Sheba</Text>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in securely with your phone number and PIN.</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.label}>Phone number</Text>
            <View style={styles.phoneRow}>
              <TouchableOpacity style={styles.countryChip} onPress={() => setCountryPicker(true)}><Text>{phoneCountry.flag}</Text><Text style={styles.countryCode}>{phoneCountry.dial}</Text><Text>▾</Text></TouchableOpacity>
              <View style={styles.divider} />
              <TextInput style={styles.phoneInput} placeholder="Phone number" placeholderTextColor="#9AA5B1" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
            </View>
            <View style={styles.labelRow}><Text style={styles.label}>6-digit PIN</Text><TouchableOpacity onPress={() => setScreen('forgotPassword')}><Text style={styles.link}>Forgot PIN?</Text></TouchableOpacity></View>
            <View style={styles.pinRow}><TextInput style={styles.pinInput} placeholder="Enter PIN" placeholderTextColor="#9AA5B1" secureTextEntry={!showPin} keyboardType="number-pad" maxLength={6} value={pin} onChangeText={setPin} /><TouchableOpacity onPress={() => setShowPin((v) => !v)}><Text>{showPin ? '🙈' : '👁️'}</Text></TouchableOpacity></View>
            <TouchableOpacity style={styles.rememberRow} onPress={() => setRememberMe((v) => !v)}><View style={[styles.checkbox, rememberMe && styles.checked]}>{rememberMe && <Text style={styles.tick}>✓</Text>}</View><Text>Remember phone number</Text></TouchableOpacity>
            {!!authError && <Text style={styles.error}>{authError}</Text>}
            <TouchableOpacity onPress={onSignIn} disabled={authBusy}><LinearGradient colors={[BRAND_TEAL, BRAND_BLUE]} style={styles.button}>{authBusy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Sign In</Text>}</LinearGradient></TouchableOpacity>
            <TouchableOpacity style={styles.signup} onPress={() => setScreen('register')}><Text>Don't have an account? <Text style={styles.link}>Create account</Text></Text></TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <PhoneCountryPicker visible={countryPicker} value={phoneCountry} onSelect={(c) => { setPhoneCountry(c); setCountryPicker(false); }} onClose={() => setCountryPicker(false)} />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#F3F7FB' }, top: { position: 'absolute', top: 0, left: 0, right: 0, height: 150 }, scroll: { flexGrow: 1, paddingBottom: 30 },
    hero: { alignItems: 'center', paddingTop: 35, paddingBottom: 18 }, logo: { width: 105, height: 105 }, brand: { fontSize: 28, fontWeight: '700', color: BRAND_TEAL }, brandDark: { color: BRAND_NAVY }, title: { marginTop: 18, fontSize: 22, fontWeight: '700', color: BRAND_NAVY }, subtitle: { marginTop: 6, color: '#6B7785', textAlign: 'center', paddingHorizontal: 35 },
    card: { backgroundColor: 'white', marginHorizontal: 18, borderRadius: radius.xl, padding: 22, elevation: 3 }, label: { fontWeight: '600', fontSize: 13, color: BRAND_NAVY, marginBottom: 8 }, labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }, link: { color: BRAND_TEAL, fontWeight: '700' },
    phoneRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, marginBottom: 16 }, countryChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12 }, countryCode: { fontWeight: '600' }, divider: { width: 1, height: 22, backgroundColor: colors.border, marginHorizontal: 10 }, phoneInput: { flex: 1, paddingVertical: 12 },
    pinRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12 }, pinInput: { flex: 1, paddingVertical: 13, fontSize: 18, letterSpacing: 5 }, rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 18 }, checkbox: { width: 20, height: 20, borderWidth: 1.5, borderColor: colors.border, borderRadius: 5, alignItems: 'center', justifyContent: 'center' }, checked: { backgroundColor: BRAND_TEAL, borderColor: BRAND_TEAL }, tick: { color: 'white', fontWeight: '700' }, error: { color: colors.error, textAlign: 'center', marginBottom: 12, fontSize: 12 }, button: { paddingVertical: 15, borderRadius: radius.md, alignItems: 'center' }, buttonText: { color: 'white', fontSize: 16, fontWeight: '700' }, signup: { alignItems: 'center', marginTop: 20 }
  });
}
