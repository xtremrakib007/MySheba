import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useApp } from '../context/AppContext';
import { sendPhoneOtp, confirmPhoneOtp, phoneToE164 } from '../firebase/phoneVerification';
import { resetPassword } from '../firebase/authService';

export default function ForgotPasswordScreen() {
  const { setScreen } = useApp();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [phoneIdToken, setPhoneIdToken] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [step, setStep] = useState('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => setConfirmation(null), []);

  const send = async () => {
    setError('');
    if (phone.replace(/\D/g, '').length < 8) return setError('Enter a valid phone number.');
    setBusy(true);
    try {
      const result = await sendPhoneOtp(phone, '+60');
      setConfirmation(result);
      setStep('otp');
    } catch (e) {
      setError(e.message || 'Could not send SMS OTP.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError('');
    if (!confirmation) return setError('Please request a new OTP.');
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit OTP.');
    setBusy(true);
    try {
      const result = await confirmPhoneOtp(confirmation, code);
      setPhoneIdToken(result.idToken);
      setStep('pin');
    } catch (e) {
      setError(e.message || 'Invalid or expired OTP.');
    } finally {
      setBusy(false);
    }
  };

  const savePin = async () => {
    setError('');
    if (!/^\d{6}$/.test(pin)) return setError('PIN must be exactly 6 digits.');
    if (pin !== confirmPin) return setError('PINs do not match.');
    if (!phoneIdToken) return setError('Please verify your phone number first.');
    setBusy(true);
    try {
      await resetPassword({
        phone,
        phoneE164: phoneToE164(phone, '+60'),
        dialCode: '+60',
        email: '',
        newPassword: pin,
        phoneIdToken,
        emailIdToken: '',
      });
      Alert.alert('PIN updated', 'Your login PIN has been updated. Please sign in again.', [
        { text: 'OK', onPress: () => setScreen('login') },
      ]);
    } catch (e) {
      setError(e.message || 'Could not update your login PIN.');
    } finally {
      setBusy(false);
    }
  };

  return <View style={styles.container}>
    <Text style={styles.title}>Reset PIN</Text>
    <Text style={styles.subtitle}>Verify your Malaysian phone number by SMS, then create a new 6-digit login PIN.</Text>

    {step === 'phone' && <>
      <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone number" keyboardType="phone-pad" autoCapitalize="none" />
      <TouchableOpacity style={styles.button} onPress={send} disabled={busy}><Text style={styles.buttonText}>{busy ? 'Sending…' : 'Send SMS OTP'}</Text></TouchableOpacity>
    </>}

    {step === 'otp' && <>
      <TextInput style={styles.input} value={code} onChangeText={setCode} placeholder="6-digit SMS OTP" keyboardType="number-pad" maxLength={6} />
      <TouchableOpacity style={styles.button} onPress={verify} disabled={busy}><Text style={styles.buttonText}>{busy ? 'Verifying…' : 'Verify OTP'}</Text></TouchableOpacity>
      <TouchableOpacity onPress={send} disabled={busy}><Text style={styles.link}>Send OTP again</Text></TouchableOpacity>
    </>}

    {step === 'pin' && <>
      <TextInput style={styles.input} value={pin} onChangeText={setPin} placeholder="New 6-digit PIN" keyboardType="number-pad" maxLength={6} secureTextEntry />
      <TextInput style={styles.input} value={confirmPin} onChangeText={setConfirmPin} placeholder="Confirm PIN" keyboardType="number-pad" maxLength={6} secureTextEntry />
      <TouchableOpacity style={styles.button} onPress={savePin} disabled={busy}><Text style={styles.buttonText}>{busy ? 'Saving…' : 'Set New PIN'}</Text></TouchableOpacity>
    </>}

    {!!error && <Text style={styles.error}>{error}</Text>}
    <TouchableOpacity onPress={() => setScreen('login')}><Text style={styles.link}>Back to Login</Text></TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', lineHeight: 21, marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#D5D9DE', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 12, fontSize: 16 },
  button: { backgroundColor: '#1266F1', borderRadius: 12, padding: 15, alignItems: 'center', marginBottom: 12 },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  link: { textAlign: 'center', color: '#1266F1', fontWeight: '700', padding: 10 },
  error: { color: '#C62828', marginVertical: 10, textAlign: 'center' },
});