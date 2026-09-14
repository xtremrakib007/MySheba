import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { httpsCallable } from 'firebase/functions';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { useLanguage } from '../i18n/LanguageContext';
import HeaderDecor from '../components/HeaderDecor';
import * as emailVerification from '../firebase/emailVerification';
import * as phoneVerification from '../firebase/phoneVerification';
import { functions } from '../firebase/config';
import PhoneCountryPicker from '../components/PhoneCountryPicker';
import { DEFAULT_PHONE_COUNTRY } from '../data/phoneCountries';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { t } = useLanguage();
  const { setScreen, doLogin, authError, authBusy } = useApp();
  const [step, setStep] = useState('details');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [countryPicker, setCountryPicker] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [phoneConfirmation, setPhoneConfirmation] = useState(null);
  const [localError, setLocalError] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [pendingEmailLink, setPendingEmailLink] = useState('');
  const lastEmailLinkRef = useRef('');
  const verificationInProgressRef = useRef(false);
  const registrationFinishedRef = useRef(false);
  const emailVerificationCompletedRef = useRef(false);
  const phoneVerificationCompletedRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    const captureUrl = (url) => {
      if (!mounted || !url || !emailVerification.isEmailSignInLink(url)) return;
      if (lastEmailLinkRef.current === url) return;
      lastEmailLinkRef.current = url;
      setPendingEmailLink(url);
    };
    Linking.getInitialURL().then(captureUrl).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => captureUrl(url));
    return () => { mounted = false; sub.remove(); };
  }, []);

  useEffect(() => {
    if (step !== 'email' || !pendingEmailLink || otpBusy || verificationInProgressRef.current || emailVerificationCompletedRef.current || registrationFinishedRef.current) return;
    const url = pendingEmailLink;
    setPendingEmailLink('');
    onConfirmEmailLink(url);
  }, [step, pendingEmailLink]);

  const validateDetails = () => {
    if (!name.trim()) return t('register.errNoName');
    if (String(phone).replace(/[^0-9]/g, '').length < 8) return t('register.errBadPhone');
    if (!EMAIL_RE.test(String(email).trim())) return t('register.errBadEmail');
    if (String(password).length < 6 || String(password).length > 20) return t('register.errBadPassword');
    if (password !== confirmPassword) return t('register.errPasswordMismatch');
    return '';
  };

  const startEmailVerification = async () => {
    const err = validateDetails();
    if (err) { setLocalError(err); return; }
    setLocalError(''); setOtpBusy(true);
    try {
      await emailVerification.sendEmailOtp(email.trim());
      setEmailCode(''); setStep('email');
    } catch (e) { setLocalError(e.message || 'Could not send the verification email. Please try again.'); }
    finally { setOtpBusy(false); }
  };

  const startPhoneVerification = async () => {
    const err = validateDetails();
    if (err) { setLocalError(err); return; }
    setLocalError(''); setOtpBusy(true);
    try {
      const confirmation = await phoneVerification.sendPhoneOtp(phone, phoneCountry.dial);
      setPhoneConfirmation(confirmation); setPhoneCode(''); setStep('phone');
    } catch (e) { setLocalError(e.message || 'Could not send the SMS code. Please try again.'); }
    finally { setOtpBusy(false); }
  };

  const resendPhoneCode = async () => {
    setLocalError(''); setOtpBusy(true);
    try {
      const confirmation = await phoneVerification.sendPhoneOtp(phone, phoneCountry.dial);
      setPhoneConfirmation(confirmation); setPhoneCode('');
    } catch (e) { setLocalError(e.message || 'Could not resend the SMS code. Please try again.'); }
    finally { setOtpBusy(false); }
  };

  const resendEmail = async () => {
    setLocalError(''); setOtpBusy(true);
    try { await emailVerification.sendEmailOtp(email.trim()); setEmailCode(''); }
    catch (e) { setLocalError(e.message || 'Could not resend the email verification. Please try again.'); }
    finally { setOtpBusy(false); }
  };

  const finishRegistration = async ({ phoneToken = '', emailToken = '', emailProof = '' } = {}) => {
    if (registrationFinishedRef.current) return;
    registrationFinishedRef.current = true;
    try {
      const registerFn = httpsCallable(functions, 'registerWithDealerCode');
      await registerFn({
        name: name.trim(),
        phone,
        phoneE164: phoneVerification.phoneToE164(phone, phoneCountry.dial),
        dialCode: phoneCountry.dial,
        email: email.trim(),
        pin: password,
        phoneIdToken: phoneToken || undefined,
        emailIdToken: emailToken || undefined,
        emailOtpVerificationId: emailProof || undefined,
      });
      await doLogin(phone, password, phoneCountry.dial);
    } catch (error) {
      registrationFinishedRef.current = false;
      throw error;
    }
  };

  const onVerifyPhone = async () => {
    if (verificationInProgressRef.current || phoneVerificationCompletedRef.current || registrationFinishedRef.current) return;
    if (!/^\d{6}$/.test(phoneCode.trim())) { setLocalError('Enter the 6-digit SMS verification code.'); return; }
    if (!phoneConfirmation) { setLocalError('This SMS verification session expired. Please resend.'); return; }
    verificationInProgressRef.current = true;
    setLocalError(''); setOtpBusy(true);
    try {
      const { idToken } = await phoneVerification.confirmPhoneOtp(phoneConfirmation, phoneCode.trim());
      phoneVerificationCompletedRef.current = true;
      await finishRegistration({ phoneToken: idToken });
    } catch (e) {
      phoneVerificationCompletedRef.current = false;
      setLocalError(e.message || 'Could not complete phone verification. Please try again.');
    } finally { verificationInProgressRef.current = false; setOtpBusy(false); }
  };

  const onConfirmEmailLink = async (url) => {
    if (verificationInProgressRef.current || emailVerificationCompletedRef.current || registrationFinishedRef.current) return;
    verificationInProgressRef.current = true;
    setLocalError(''); setOtpBusy(true);
    try {
      const result = await emailVerification.confirmEmailLink(url, email.trim());
      emailVerificationCompletedRef.current = true;
      await finishRegistration({ emailToken: result.idToken });
    } catch (e) {
      emailVerificationCompletedRef.current = false;
      setLocalError(e.message || 'Could not verify your email address. Please try again.');
    } finally { verificationInProgressRef.current = false; setOtpBusy(false); }
  };

  const onConfirmEmailOtp = async () => {
    if (verificationInProgressRef.current || emailVerificationCompletedRef.current || registrationFinishedRef.current) return;
    if (!/^\d{6}$/.test(emailCode.trim())) { setLocalError('Enter the 6-digit email verification code.'); return; }
    verificationInProgressRef.current = true;
    setLocalError(''); setOtpBusy(true);
    try {
      const result = await emailVerification.verifyEmailOtp(email.trim(), emailCode.trim());
      emailVerificationCompletedRef.current = true;
      await finishRegistration({ emailProof: result.verificationId });
    } catch (e) {
      emailVerificationCompletedRef.current = false;
      setLocalError(e.message || 'Could not verify the email code. Please try again.');
    } finally { verificationInProgressRef.current = false; setOtpBusy(false); }
  };

  const busy = otpBusy || authBusy;
  const back = () => {
    if (step === 'email' || step === 'phone') { setStep('details'); setLocalError(''); }
    else setScreen('login');
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={back}><Text style={styles.backText}>←</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>{step === 'email' ? t('register.verifyEmail') : step === 'phone' ? t('register.verifyPhone') : t('register.createAccount')}</Text>
      </LinearGradient>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {step === 'details' ? <>
          <Field label={t('register.fullName')} value={name} setValue={setName} placeholder={t('register.fullNamePlaceholder')} styles={styles} />
          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('register.phoneNumber')}</Text>
            <View style={styles.phoneRow}>
              <TouchableOpacity onPress={() => setCountryPicker(true)} style={styles.countryButton}>
                <Text style={styles.countryFlag}>{phoneCountry.flag}</Text><Text style={styles.countryName} numberOfLines={1}>{phoneCountry.name}</Text><Text style={styles.countryDial}>{phoneCountry.dial}</Text><Text style={styles.countryChevron}>▾</Text>
              </TouchableOpacity>
              <TextInput style={styles.phoneInput} placeholder={t('register.phoneNumber')} placeholderTextColor={styles.placeholderColor} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
            </View>
          </View>
          <Field label={t('register.emailAddress')} value={email} setValue={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" styles={styles} />
          <Field label={t('register.password')} value={password} setValue={setPassword} placeholder={t('register.passwordPlaceholder')} secureTextEntry maxLength={20} styles={styles} />
          <Field label={t('register.confirmPassword')} value={confirmPassword} setValue={setConfirmPassword} placeholder={t('register.confirmPasswordPlaceholder')} secureTextEntry maxLength={20} styles={styles} />
          <Text style={styles.verifyTitle}>Choose verification method</Text>
          <Text style={styles.verifyHint}>SMS is the primary verification method. Email verification is available as a fallback.</Text>
          {!!(localError || authError) && <Text style={styles.errorText}>{localError || authError}</Text>}
          <TouchableOpacity style={[styles.btn, busy && styles.btnDisabled]} onPress={startPhoneVerification} disabled={busy}>{busy ? <ActivityIndicator color={styles.onPrimaryColor} /> : <Text style={styles.btnText}>Verify by SMS</Text>}</TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryBtn, busy && styles.btnDisabled]} onPress={startEmailVerification} disabled={busy}><Text style={styles.secondaryBtnText}>Verify by Email</Text></TouchableOpacity>
        </> : step === 'phone' ? <>
          <Text style={styles.stepTitle}>{t('register.verifyPhone')}</Text>
          <Text style={styles.otpHint}>{t('register.otpHintSms', { phone: `${phoneCountry.dial} ${phone.replace(/[^0-9]/g, '').replace(/^0+/, '')}` })}</Text>
          <Field label={t('register.smsCode')} value={phoneCode} setValue={setPhoneCode} placeholder="123456" keyboardType="number-pad" maxLength={6} styles={styles} otp />
          {!!(localError || authError) && <Text style={styles.errorText}>{localError || authError}</Text>}
          <TouchableOpacity style={[styles.btn, busy && styles.btnDisabled]} onPress={onVerifyPhone} disabled={busy}>{busy ? <ActivityIndicator color={styles.onPrimaryColor} /> : <Text style={styles.btnText}>Verify SMS & Create Account</Text>}</TouchableOpacity>
          <TouchableOpacity style={styles.resendBtn} onPress={resendPhoneCode} disabled={busy}><Text style={styles.resendText}>{t('register.resend')}</Text></TouchableOpacity>
        </> : <>
          <Text style={styles.stepTitle}>{t('register.verifyEmail')}</Text>
          <Text style={styles.otpHint}>{t('register.emailLinkHint', { email })}</Text>
          <Text style={styles.methodHint}>The email contains both a verification link and a 6-digit OTP. Either one can complete registration.</Text>
          <Field label="Email verification code" value={emailCode} setValue={setEmailCode} placeholder="123456" keyboardType="number-pad" maxLength={6} styles={styles} otp />
          {!!(localError || authError) && <Text style={styles.errorText}>{localError || authError}</Text>}
          <TouchableOpacity style={[styles.btn, busy && styles.btnDisabled]} onPress={onConfirmEmailOtp} disabled={busy}>{busy ? <ActivityIndicator color={styles.onPrimaryColor} /> : <Text style={styles.btnText}>Verify Email OTP & Create Account</Text>}</TouchableOpacity>
          <Text style={styles.orText}>OR</Text>
          <TouchableOpacity style={styles.resendBtn} onPress={resendEmail} disabled={busy}><Text style={styles.resendText}>Send link + OTP again</Text></TouchableOpacity>
        </>}
      </ScrollView>
      <PhoneCountryPicker visible={countryPicker} value={phoneCountry} onSelect={(c) => { setPhoneCountry(c); setCountryPicker(false); }} onClose={() => setCountryPicker(false)} />
    </KeyboardAvoidingView>
  );
}

function Field({ label, value, setValue, placeholder, styles, otp, ...props }) {
  return <View style={styles.formGroup}>
    <Text style={styles.label}>{label}</Text>
    <TextInput style={otp ? styles.otpInput : styles.input} placeholder={placeholder} placeholderTextColor={styles.placeholderColor} value={value} onChangeText={setValue} autoCorrect={false} {...props} />
  </View>;
}

function createStyles(colors) {
  const sheet = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg }, scroll: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: colors.border },
    backBtn: { padding: 4 }, backText: { color: colors.onPrimary, fontSize: 22 }, headerTitle: { color: colors.onPrimary, fontWeight: '700', fontSize: 16 },
    body: { padding: 20, paddingBottom: 40, backgroundColor: colors.bg }, formGroup: { marginBottom: 14 }, label: { fontWeight: '700', marginBottom: 7, fontSize: 13, color: colors.text },
    input: { width: '100%', paddingVertical: 13, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, fontSize: 14, backgroundColor: colors.inputBg, color: colors.text },
    phoneRow: { flexDirection: 'row', alignItems: 'stretch', gap: 7 }, countryButton: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.inputBg, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', maxWidth: '58%' },
    countryFlag: { fontSize: 19 }, countryName: { color: colors.text, fontSize: 12, fontWeight: '700', marginLeft: 6, flexShrink: 1 }, countryDial: { color: colors.text, fontSize: 12, fontWeight: '800', marginLeft: 5 }, countryChevron: { color: colors.textSecondary, fontSize: 14, marginLeft: 5 },
    phoneInput: { flex: 1, minWidth: 0, paddingVertical: 13, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, fontSize: 14, backgroundColor: colors.inputBg, color: colors.text },
    verifyTitle: { fontSize: 16, fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: 8, marginBottom: 5 }, verifyHint: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', lineHeight: 18, marginBottom: 14 },
    btn: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center' }, secondaryBtn: { marginTop: 10, backgroundColor: colors.card, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    btnDisabled: { opacity: 0.6 }, btnText: { color: colors.onPrimary, fontWeight: '800', fontSize: 14 }, secondaryBtnText: { color: colors.text, fontWeight: '800', fontSize: 14 },
    errorText: { color: colors.error || '#ff7777', fontSize: 12, marginBottom: 10, textAlign: 'center' }, stepTitle: { fontSize: 20, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 8 },
    otpHint: { fontSize: 13, color: colors.textSecondary, marginBottom: 16, textAlign: 'center', lineHeight: 20 }, methodHint: { fontSize: 12, color: colors.textSecondary, marginBottom: 16, textAlign: 'center', lineHeight: 18 },
    otpInput: { width: '100%', paddingVertical: 15, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, fontSize: 20, letterSpacing: 5, textAlign: 'center', backgroundColor: colors.inputBg, color: colors.text },
    orText: { textAlign: 'center', marginTop: 14, color: colors.textSecondary, fontSize: 12 }, resendBtn: { alignItems: 'center', marginTop: 14 }, resendText: { color: colors.text, fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  });
  return { ...sheet, placeholderColor: colors.placeholder || colors.textSecondary, onPrimaryColor: colors.onPrimary };
}