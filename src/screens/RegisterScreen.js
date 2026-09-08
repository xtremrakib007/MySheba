import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import { useLanguage } from '../i18n/LanguageContext';
import HeaderDecor from '../components/HeaderDecor';
import { GoogleButton, OrDivider } from '../components/ui';
import * as emailVerification from '../firebase/emailVerification';
import * as phoneVerification from '../firebase/phoneVerification';
import PhoneCountryPicker from '../components/PhoneCountryPicker';
import { DEFAULT_PHONE_COUNTRY } from '../data/phoneCountries';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { t } = useLanguage();
  const { setScreen, doRegister, doGoogleLogin, authError, authBusy } = useApp();
  const [step, setStep] = useState('details');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [countryPicker, setCountryPicker] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [dealerCode, setDealerCode] = useState('');
  const [resellerCode, setResellerCode] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneConfirmation, setPhoneConfirmation] = useState(null);
  const [phoneIdToken, setPhoneIdToken] = useState('');
  const [localError, setLocalError] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);

  // Email-link verification can return through either a live deep-link event
  // or a cold start. The previous implementation handled only the live event.
  React.useEffect(() => {
    if (step !== 'emailLink') return undefined;
    let mounted = true;
    const handleUrl = (url) => {
      if (mounted && url && emailVerification.isEmailSignInLink(url)) {
        onConfirmEmailLink(url);
      }
    };

    Linking.getInitialURL().then((url) => handleUrl(url)).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => {
      mounted = false;
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const validateDetails = () => {
    if (!name.trim()) return t('register.errNoName');
    if (String(phone).replace(/[^0-9]/g, '').length < 8) return t('register.errBadPhone');
    if (!EMAIL_RE.test(String(email).trim())) return t('register.errBadEmail');
    if (String(password).length < 6 || String(password).length > 20) return t('register.errBadPassword');
    if (password !== confirmPassword) return t('register.errPasswordMismatch');
    return '';
  };

  const onSendPhoneCode = async () => {
    const err = validateDetails();
    if (err) { setLocalError(err); return; }
    setLocalError('');
    setOtpBusy(true);
    try {
      const confirmation = await phoneVerification.sendPhoneOtp(phone, phoneCountry.dial);
      setPhoneConfirmation(confirmation);
      setPhoneCode('');
      setStep('phoneOtp');
    } catch (e) {
      setLocalError(e.message || 'Could not send the SMS code. Please try again.');
    } finally {
      setOtpBusy(false);
    }
  };

  const onResendPhoneCode = async () => {
    setLocalError('');
    setOtpBusy(true);
    try {
      const confirmation = await phoneVerification.sendPhoneOtp(phone, phoneCountry.dial);
      setPhoneConfirmation(confirmation);
      setPhoneCode('');
    } catch (e) {
      setLocalError(e.message || 'Could not resend the SMS code. Please try again.');
    } finally {
      setOtpBusy(false);
    }
  };

  const onVerifyPhoneAndSendEmailLink = async () => {
    if (!/^\d{6}$/.test(String(phoneCode || '').trim())) {
      setLocalError('Please enter the 6-digit code we sent you.');
      return;
    }
    setLocalError('');
    setOtpBusy(true);
    try {
      const { idToken } = await phoneVerification.confirmPhoneOtp(phoneConfirmation, phoneCode.trim());
      setPhoneIdToken(idToken);
      await emailVerification.sendEmailLink(email.trim());
      setStep('emailLink');
    } catch (e) {
      setLocalError(e.message || 'Incorrect code. Please try again.');
    } finally {
      setOtpBusy(false);
    }
  };

  const onResendEmailLink = async () => {
    setLocalError('');
    setOtpBusy(true);
    try {
      await emailVerification.sendEmailLink(email.trim());
    } catch (e) {
      setLocalError(e.message || 'Could not resend the link. Please try again.');
    } finally {
      setOtpBusy(false);
    }
  };

  const onConfirmEmailLink = async (url) => {
    setLocalError('');
    setOtpBusy(true);
    let emailIdToken;
    try {
      const result = await emailVerification.confirmEmailLink(url, email.trim());
      emailIdToken = result.idToken;
    } catch (e) {
      setLocalError(e.message || 'Could not verify your email address. Please try again.');
      setOtpBusy(false);
      return;
    }
    setOtpBusy(false);
    await doRegister({ name, phone, phoneE164: phoneVerification.phoneToE164(phone, phoneCountry.dial), dialCode: phoneCountry.dial, email: email.trim(), pin: password, dealerCode, resellerCode, phoneIdToken, emailIdToken });
  };

  const busy = otpBusy || authBusy;

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient } start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (step === 'emailLink') setStep('phoneOtp');
            else if (step === 'phoneOtp') setStep('details');
            else setScreen('login');
          }}
          disabled={busy}
        >
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('register.title')}</Text>
      </LinearGradient>
      <View style={styles.content}>
        {step === 'details' && (
          <>
            <Text style={styles.title}>{t('register.createAccount')}</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={t('register.name')} editable={!busy} />
            <PhoneCountryPicker visible={countryPicker} selected={phoneCountry} onSelect={(c) => { setPhoneCountry(c); setCountryPicker(false); }} onClose={() => setCountryPicker(false)} />
            <TouchableOpacity style={styles.countryRow} onPress={() => setCountryPicker(true)} disabled={busy}>
              <Text style={styles.countryText}>{phoneCountry.flag} {phoneCountry.name} ({phoneCountry.dial})</Text>
            </TouchableOpacity>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder={t('register.phone')} keyboardType="phone-pad" editable={!busy} />
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder={t('register.email')} keyboardType="email-address" autoCapitalize="none" editable={!busy} />
            <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder={t('register.password')} secureTextEntry editable={!busy} />
            <TextInput style={styles.input} value={confirmPassword} onChangeText={setConfirmPassword} placeholder={t('register.confirmPassword')} secureTextEntry editable={!busy} />
            <TextInput style={styles.input} value={dealerCode} onChangeText={setDealerCode} placeholder={t('register.dealerCode')} editable={!busy} autoCapitalize="characters" />
            <TextInput style={styles.input} value={resellerCode} onChangeText={setResellerCode} placeholder={t('register.resellerCode')} editable={!busy} autoCapitalize="characters" />
            {!!localError && <Text style={styles.error}>{localError}</Text>}
            <TouchableOpacity style={styles.primaryBtn} onPress={onSendPhoneCode} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t('register.sendCode')}</Text>}
            </TouchableOpacity>
            <GoogleButton onPress={() => doGoogleLogin()} disabled={busy} />
            <OrDivider />
          </>
        )}

        {step === 'phoneOtp' && (
          <>
            <Text style={styles.title}>{t('register.verifyPhone')}</Text>
            <Text style={styles.subtitle}>Enter the 6-digit SMS code sent to {phoneVerification.phoneToE164(phone, phoneCountry.dial)}.</Text>
            <TextInput style={styles.input} value={phoneCode} onChangeText={(v) => setPhoneCode(v.replace(/[^0-9]/g, '').slice(0, 6))} placeholder="6-digit code" keyboardType="number-pad" maxLength={6} editable={!busy} />
            {!!localError && <Text style={styles.error}>{localError}</Text>}
            <TouchableOpacity style={styles.primaryBtn} onPress={onVerifyPhoneAndSendEmailLink} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Verify Phone</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onResendPhoneCode} disabled={busy}>
              <Text style={styles.secondaryText}>Resend SMS</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'emailLink' && (
          <>
            <Text style={styles.title}>Check your email</Text>
            <Text style={styles.subtitle}>We sent a verification link to {email}. Tap the link and MySheba will open to finish registration.</Text>
            {!!localError && <Text style={styles.error}>{localError}</Text>}
            <TouchableOpacity style={styles.secondaryBtn} onPress={onResendEmailLink} disabled={busy}>
              {busy ? <ActivityIndicator /> : <Text style={styles.secondaryText}>Resend email</Text>}
            </TouchableOpacity>
          </>
        )}
        {!!authError && <Text style={styles.error}>{authError}</Text>}
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: 14, paddingBottom: 18, paddingHorizontal: 18 },
    backBtn: { width: 40, height: 40, justifyContent: 'center' },
    backText: { color: '#fff', fontSize: 36, lineHeight: 38 },
    headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
    content: { flex: 1, padding: 20 },
    title: { color: colors.text, fontSize: 24, fontWeight: '800', marginBottom: 10 },
    subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 16 },
    input: { backgroundColor: colors.card, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 12 },
    countryRow: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 13, marginBottom: 12 },
    countryText: { color: colors.text },
    primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.md, padding: 14, alignItems: 'center', marginTop: 6 },
    primaryText: { color: '#fff', fontWeight: '800' },
    secondaryBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 13, alignItems: 'center', marginTop: 10 },
    secondaryText: { color: colors.text, fontWeight: '700' },
    error: { color: colors.danger || '#c62828', marginBottom: 12 },
  });
}
