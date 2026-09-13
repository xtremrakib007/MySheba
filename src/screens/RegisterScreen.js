import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme/theme';
import PhoneCountryPicker from '../components/PhoneCountryPicker';
import { DEFAULT_PHONE_COUNTRY } from '../data/phoneCountries';
import { phoneToE164, sendPhoneOtp, confirmPhoneOtp } from '../firebase/phoneVerification';
import { sendEmailOtp, verifyEmailOtp } from '../firebase/emailVerification';
import * as authService from '../firebase/authService';

const BRAND_TEAL = '#00A99D';
const BRAND_NAVY = '#0B2447';

export default function RegisterScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { setScreen } = useApp();
  const [step, setStep] = useState('details');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [picker, setPicker] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [otp, setOtp] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [emailVerificationId, setEmailVerificationId] = useState('');
  const [phoneIdToken, setPhoneIdToken] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const showError = (message) => setError(message || 'Something went wrong. Please try again.');

  const startVerification = async () => {
    setError('');
    if (!name.trim()) return showError('Please enter your full name.');
    if (!phone || phone.replace(/[^0-9]/g, '').length < 8) return showError('Please enter a valid phone number.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return showError('Please enter a valid email address.');
    setBusy(true);
    try {
      const [smsResult] = await Promise.all([
        sendPhoneOtp(phone, country.dial),
        sendEmailOtp(email.trim()),
      ]);
      setConfirmation(smsResult);
      setEmailOtp('');
      setEmailVerificationId('');
      setStep('verify');
    } catch (err) {
      showError(err?.message);
    } finally {
      setBusy(false);
    }
  };

  const verifyBoth = async () => {
    setError('');
    if (!/^\d{6}$/.test(otp)) return showError('Enter the 6-digit SMS code.');
    if (!/^\d{6}$/.test(emailOtp)) return showError('Enter the 6-digit email code.');
    if (!confirmation) return showError('Please request new verification codes.');
    setBusy(true);
    try {
      const [phoneResult, emailResult] = await Promise.all([
        confirmPhoneOtp(confirmation, otp),
        verifyEmailOtp(email.trim(), emailOtp),
      ]);
      setPhoneIdToken(phoneResult.idToken);
      setEmailVerificationId(emailResult.verificationId);
      setStep('pin');
    } catch (err) {
      showError(err?.message);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError('');
    setBusy(true);
    try {
      const [smsResult] = await Promise.all([
        sendPhoneOtp(phone, country.dial),
        sendEmailOtp(email.trim()),
      ]);
      setConfirmation(smsResult);
      setOtp('');
      setEmailOtp('');
      setEmailVerificationId('');
    } catch (err) {
      showError(err?.message);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setError('');
    if (!/^\d{6}$/.test(pin)) return showError('PIN must be exactly 6 digits.');
    if (pin !== confirmPin) return showError('PINs do not match.');
    if (!phoneIdToken) return showError('Please verify your phone number first.');
    if (!emailVerificationId) return showError('Please verify your email address first.');
    setBusy(true);
    try {
      await authService.registerCustomer({
        name: name.trim(),
        phone,
        phoneE164: phoneToE164(phone, country.dial),
        dialCode: country.dial,
        email: email.trim().toLowerCase(),
        pin,
        phoneIdToken,
        emailOtpVerificationId: emailVerificationId,
      });
      setScreen('customerHome');
    } catch (err) {
      showError(err?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.brand}><Text style={styles.brandDark}>My</Text>Sheba</Text>
            <Text style={styles.title}>Create your finance account</Text>
            <Text style={styles.subtitle}>{step === 'details' ? 'Enter your details to begin.' : step === 'verify' ? 'Verify your phone and email.' : 'Set your 6-digit login PIN.'}</Text>
          </View>
          <View style={styles.card}>
            {step === 'details' && <>
              <Text style={styles.label}>Full name</Text>
              <TextInput style={styles.input} placeholder="Full name" value={name} onChangeText={setName} />
              <Text style={styles.label}>Phone number</Text>
              <View style={styles.phoneRow}><TouchableOpacity style={styles.countryChip} onPress={() => setPicker(true)}><Text>{country.flag}</Text><Text style={styles.countryCode}>{country.dial}</Text><Text>▾</Text></TouchableOpacity><View style={styles.divider} /><TextInput style={styles.phoneInput} placeholder="Phone number" keyboardType="phone-pad" value={phone} onChangeText={setPhone} /></View>
              <Text style={styles.label}>Email address</Text>
              <TextInput style={styles.input} placeholder="Email address" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
              <TouchableOpacity style={styles.button} onPress={startVerification} disabled={busy}>{busy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Send SMS & Email OTP</Text>}</TouchableOpacity>
            </>}

            {step === 'verify' && <>
              <View style={styles.verifyBadge}><Text style={styles.verifyTitle}>Two-step verification</Text><Text style={styles.info}>We sent one code to your mobile number and one code to your email address.</Text></View>
              <Text style={styles.label}>SMS verification code</Text>
              <TextInput style={styles.otpInput} placeholder="000000" keyboardType="number-pad" maxLength={6} value={otp} onChangeText={setOtp} autoFocus />
              <Text style={styles.label}>Email verification code</Text>
              <TextInput style={styles.otpInput} placeholder="000000" keyboardType="number-pad" maxLength={6} value={emailOtp} onChangeText={setEmailOtp} />
              {!!error && <Text style={styles.error}>{error}</Text>}
              <TouchableOpacity style={styles.button} onPress={verifyBoth} disabled={busy}>{busy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Verify Both & Continue</Text>}</TouchableOpacity>
              <TouchableOpacity style={styles.secondary} onPress={resend} disabled={busy}><Text style={styles.link}>Resend both codes</Text></TouchableOpacity>
              <TouchableOpacity style={styles.secondary} onPress={() => { setStep('details'); setConfirmation(null); setEmailVerificationId(''); }}><Text style={styles.link}>Change details</Text></TouchableOpacity>
            </>}

            {step === 'pin' && <>
              <Text style={styles.verifyBadge}><Text style={styles.verifyTitle}>✓ Phone and email verified</Text></Text>
              <Text style={styles.info}>Choose the 6-digit PIN you will use to sign in to MySheba.</Text>
              <Text style={styles.label}>Create PIN</Text>
              <TextInput style={styles.otpInput} placeholder="••••••" secureTextEntry keyboardType="number-pad" maxLength={6} value={pin} onChangeText={setPin} autoFocus />
              <Text style={styles.label}>Confirm PIN</Text>
              <TextInput style={styles.otpInput} placeholder="••••••" secureTextEntry keyboardType="number-pad" maxLength={6} value={confirmPin} onChangeText={setConfirmPin} />
              {!!error && <Text style={styles.error}>{error}</Text>}
              <TouchableOpacity style={styles.button} onPress={finish} disabled={busy}>{busy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Create Account & Open Home</Text>}</TouchableOpacity>
            </>}

            {step === 'details' && !!error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity style={styles.back} onPress={() => setScreen('login')}><Text>Already have an account? <Text style={styles.link}>Sign in</Text></Text></TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <PhoneCountryPicker visible={picker} value={country} onSelect={(c) => { setCountry(c); setPicker(false); }} onClose={() => setPicker(false)} />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#F3F7FB' }, scroll: { flexGrow: 1, paddingBottom: 30 }, header: { alignItems: 'center', paddingTop: 55, paddingBottom: 22 }, brand: { fontSize: 30, fontWeight: '800', color: BRAND_TEAL }, brandDark: { color: BRAND_NAVY }, title: { fontSize: 21, fontWeight: '700', color: BRAND_NAVY, marginTop: 18 }, subtitle: { color: '#6B7785', marginTop: 6 }, card: { backgroundColor: 'white', marginHorizontal: 18, borderRadius: radius.xl, padding: 22, elevation: 3 }, label: { fontSize: 13, fontWeight: '600', color: BRAND_NAVY, marginTop: 10, marginBottom: 7 }, input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 13 }, phoneRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md }, countryChip: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 13 }, countryCode: { fontWeight: '600' }, divider: { width: 1, height: 22, backgroundColor: colors.border }, phoneInput: { flex: 1, padding: 13 }, otpInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, textAlign: 'center', fontSize: 22, letterSpacing: 6 }, info: { color: '#596675', lineHeight: 20, marginBottom: 10 }, verifyBadge: { backgroundColor: '#EEF9F7', borderRadius: radius.md, padding: 12, marginBottom: 6 }, verifyTitle: { color: BRAND_TEAL, fontWeight: '800', marginBottom: 4 }, error: { color: colors.error, textAlign: 'center', marginTop: 12, fontSize: 12 }, button: { backgroundColor: BRAND_TEAL, padding: 15, borderRadius: radius.md, alignItems: 'center', marginTop: 20 }, buttonText: { color: 'white', fontWeight: '700', fontSize: 15 }, secondary: { alignItems: 'center', marginTop: 16 }, back: { alignItems: 'center', marginTop: 20 }, link: { color: BRAND_TEAL, fontWeight: '700' }
  });
}
