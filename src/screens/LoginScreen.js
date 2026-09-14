import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Image, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme/theme';
import PhoneCountryPicker from '../components/PhoneCountryPicker';
import { DEFAULT_PHONE_COUNTRY } from '../data/phoneCountries';

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
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const onSignIn = () => doLogin(phone, password, phoneCountry.dial);

  return (
    <View style={styles.screen}>
      <LinearGradient colors={[BRAND_TEAL, BRAND_BLUE]} style={styles.top} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Image source={require('../../assets/icon-transparent.png')} style={styles.logo} resizeMode="contain" />
            <Text style={styles.brand}>MySheba Finance</Text>
            <Text style={styles.subtitle}>Secure payments, remittance and everyday financial services</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.heading}>Sign in</Text>
            <Text style={styles.label}>Phone number</Text>
            <View style={styles.phoneRow}>
              <TouchableOpacity style={styles.countryChip} onPress={() => setCountryPicker(true)}>
                <Text style={styles.flag}>{phoneCountry.flag}</Text>
                <Text style={styles.code}>{phoneCountry.dial}</Text>
                <Text>▾</Text>
              </TouchableOpacity>
              <View style={styles.divider} />
              <TextInput style={styles.phoneInput} placeholder="Phone number" placeholderTextColor="#9AA5B1" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
            </View>

            <View style={styles.labelRow}>
              <Text style={styles.label}>Password</Text>
              <TouchableOpacity onPress={() => setScreen('forgotPassword')}><Text style={styles.link}>Forgot password?</Text></TouchableOpacity>
            </View>
            <View style={styles.passwordRow}>
              <TextInput style={styles.passwordInput} placeholder="Password" placeholderTextColor="#9AA5B1" secureTextEntry={!showPassword} value={password} onChangeText={setPassword} />
              <TouchableOpacity onPress={() => setShowPassword(v => !v)}><Text>{showPassword ? '🙈' : '👁️'}</Text></TouchableOpacity>
            </View>

            {!!authError && <Text style={styles.error}>{authError}</Text>}

            <TouchableOpacity onPress={onSignIn} disabled={authBusy} activeOpacity={0.85}>
              <LinearGradient colors={[BRAND_TEAL, BRAND_BLUE]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.loginButton}>
                {authBusy ? <ActivityIndicator color="white" /> : <Text style={styles.loginText}>Sign in</Text>}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.signup} onPress={() => setScreen('register')}>
              <Text style={styles.signupText}>Don't have an account? <Text style={styles.link}>Sign up</Text></Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <PhoneCountryPicker visible={countryPicker} value={phoneCountry} onSelect={(c) => { setPhoneCountry(c); setCountryPicker(false); }} onClose={() => setCountryPicker(false)} />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#F3F7FB' },
    top: { position: 'absolute', top: 0, left: 0, right: 0, height: 150 },
    content: { flexGrow: 1, paddingBottom: 30 },
    hero: { alignItems: 'center', paddingTop: 42, paddingBottom: 20 },
    logo: { width: 92, height: 92, marginBottom: 4 },
    brand: { fontSize: 24, fontWeight: '800', color: 'white' },
    subtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 12, textAlign: 'center', marginTop: 7, paddingHorizontal: 30 },
    card: { backgroundColor: 'white', marginHorizontal: 18, borderRadius: 22, padding: 22, marginTop: 10, elevation: 4 },
    heading: { fontSize: 22, fontWeight: '800', color: BRAND_NAVY, marginBottom: 20 },
    label: { fontSize: 13, fontWeight: '700', color: BRAND_NAVY, marginBottom: 8 },
    labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    phoneRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, marginBottom: 18 },
    countryChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 12 },
    flag: { fontSize: 16 },
    code: { fontWeight: '700', color: BRAND_NAVY },
    divider: { width: 1, height: 22, backgroundColor: colors.border, marginHorizontal: 8 },
    phoneInput: { flex: 1, paddingVertical: 12, color: BRAND_NAVY },
    passwordRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, marginBottom: 14 },
    passwordInput: { flex: 1, paddingVertical: 12, color: BRAND_NAVY },
    link: { color: BRAND_TEAL, fontWeight: '700', fontSize: 12 },
    error: { color: colors.error || '#D32F2F', textAlign: 'center', fontSize: 12, marginBottom: 12 },
    loginButton: { borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
    loginText: { color: 'white', fontSize: 16, fontWeight: '800' },
    signup: { alignItems: 'center', marginTop: 20 },
    signupText: { color: '#6B7280', fontSize: 12 },
  });
}