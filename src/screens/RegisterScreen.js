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
  const [emailCode, setEmailCode] = useState('');
  const [phoneConfirmation, setPhoneConfirmation] = useState(null);
  const [phoneIdToken, setPhoneIdToken] = useState('');
  const [localError, setLocalError] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);

  React.useEffect(() => {
    if (step !== 'emailLink') return undefined;
    let mounted = true;
    const handleUrl = (url) => {
      if (mounted && url && emailVerification.isEmailSignInLink(url)) onConfirmEmailLink(url);
    };
    Linking.getInitialURL().then((url) => handleUrl(url)).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => { mounted = false; sub.remove(); };
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
    setLocalError(''); setOtpBusy(true);
    try {
      const confirmation = await phoneVerification.sendPhoneOtp(phone, phoneCountry.dial);
      setPhoneConfirmation(confirmation); setPhoneCode(''); setStep('phoneOtp');
    } catch (e) { setLocalError(e.message || 'Could not send the SMS code. Please try again.'); }
    finally { setOtpBusy(false); }
  };

  const onResendPhoneCode = async () => {
    setLocalError(''); setOtpBusy(true);
    try {
      const confirmation = await phoneVerification.sendPhoneOtp(phone, phoneCountry.dial);
      setPhoneConfirmation(confirmation); setPhoneCode('');
    } catch (e) { setLocalError(e.message || 'Could not resend the SMS code. Please try again.'); }
    finally { setOtpBusy(false); }
  };

  const onVerifyPhoneAndSendEmailLink = async () => {
    if (!/^\d{6}$/.test(phoneCode.trim())) { setLocalError('Enter the 6-digit SMS verification code.'); return; }
    setLocalError(''); setOtpBusy(true);
    try {
      const { idToken } = await phoneVerification.confirmPhoneOtp(phoneConfirmation, phoneCode.trim());
      setPhoneIdToken(idToken);
      await emailVerification.sendEmailLink(email.trim());
      setEmailCode(''); setStep('emailLink');
    } catch (e) { setLocalError(e.message || 'Incorrect SMS code. Please try again.'); }
    finally { setOtpBusy(false); }
  };

  const onResendEmailLink = async () => {
    setLocalError(''); setOtpBusy(true);
    try { await emailVerification.sendEmailLink(email.trim()); setEmailCode(''); }
    catch (e) { setLocalError(e.message || 'Could not resend the email verification. Please try again.'); }
    finally { setOtpBusy(false); }
  };

  const finishRegistration = async (emailIdToken) => {
    await doRegister({ name, phone, phoneE164: phoneVerification.phoneToE164(phone, phoneCountry.dial), dialCode: phoneCountry.dial, email: email.trim(), pin: password, dealerCode, resellerCode, phoneIdToken, emailIdToken });
  };

  const onConfirmEmailLink = async (url) => {
    setLocalError(''); setOtpBusy(true);
    try {
      const result = await emailVerification.confirmEmailLink(url, email.trim());
      await finishRegistration(result.idToken);
    } catch (e) { setLocalError(e.message || 'Could not verify your email address. Please try again.'); setOtpBusy(false); }
  };

  const onConfirmEmailOtp = async () => {
    if (!/^\d{6}$/.test(emailCode.trim())) { setLocalError('Enter the 6-digit email verification code.'); return; }
    setLocalError(''); setOtpBusy(true);
    try {
      const result = await emailVerification.confirmEmailOtp(email.trim(), emailCode.trim());
      await finishRegistration(result.idToken);
    } catch (e) { setLocalError(e.message || 'Could not verify the email code. Please try again.'); setOtpBusy(false); }
  };

  const busy = otpBusy || authBusy;

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={() => { if (step === 'emailLink') setStep('phoneOtp'); else if (step === 'phoneOtp') setStep('details'); else setScreen('login'); }}><Text style={styles.backText}>←</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>{step === 'emailLink' ? t('register.verifyEmail') : step === 'phoneOtp' ? t('register.verifyPhone') : t('register.createAccount')}</Text>
      </LinearGradient>

      {step === 'details' ? (
        <View style={styles.body}>
          <View style={styles.formGroup}><Text style={styles.label}>{t('register.fullName')}</Text><TextInput style={styles.input} placeholder={t('register.fullNamePlaceholder')} value={name} onChangeText={setName} /></View>
          <View style={styles.formGroup}><Text style={styles.label}>{t('register.phoneNumber')}</Text><View style={{flexDirection:'row',alignItems:'center',marginBottom:6}}><TouchableOpacity onPress={()=>setCountryPicker(true)} style={{padding:12,borderWidth:1,borderColor:'#ddd',borderRadius:8,marginRight:6,flexDirection:'row',alignItems:'center'}}><Text style={{fontSize:20}}>{phoneCountry.flag}</Text><Text style={{marginLeft:5,fontWeight:'600'}}>{phoneCountry.dial}</Text></TouchableOpacity><TextInput style={styles.input} placeholder="Phone number" keyboardType="phone-pad" value={phone} onChangeText={setPhone} /></View></View>
          <View style={styles.formGroup}><Text style={styles.label}>{t('register.emailAddress')}</Text><TextInput style={styles.input} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={email} onChangeText={setEmail} /><Text style={styles.hint}>{t('register.emailHint')}</Text></View>
          <View style={styles.formGroup}><Text style={styles.label}>{t('register.password')}</Text><TextInput style={styles.input} placeholder={t('register.passwordPlaceholder')} secureTextEntry maxLength={20} autoCapitalize="none" value={password} onChangeText={setPassword} /></View>
          <View style={styles.formGroup}><Text style={styles.label}>{t('register.confirmPassword')}</Text><TextInput style={styles.input} placeholder={t('register.confirmPasswordPlaceholder')} secureTextEntry maxLength={20} autoCapitalize="none" value={confirmPassword} onChangeText={setConfirmPassword} /></View>
          <View style={styles.formGroup}><Text style={styles.label}>{t('register.dealerCode')}</Text><TextInput style={styles.input} placeholder={t('register.dealerCodePlaceholder')} keyboardType="phone-pad" value={dealerCode} onChangeText={setDealerCode} /><Text style={styles.hint}>{t('register.dealerCodeHint')}</Text></View>
          <View style={styles.formGroup}><Text style={styles.label}>{t('register.resellerCode')}</Text><TextInput style={styles.input} placeholder={t('register.resellerCodePlaceholder')} keyboardType="phone-pad" value={resellerCode} onChangeText={setResellerCode} /><Text style={styles.hint}>{t('register.resellerCodeHint')}</Text></View>
          {!!(localError || authError) && <Text style={styles.errorText}>{localError || authError}</Text>}
          <TouchableOpacity style={[styles.btn,busy&&styles.btnDisabled]} onPress={onSendPhoneCode} disabled={busy}>{busy?<ActivityIndicator color="white"/>:<Text style={styles.btnText}>{t('register.sendVerificationCode')}</Text>}</TouchableOpacity>
          <OrDivider /><GoogleButton label={t('register.signUpWithGoogle')} onPress={doGoogleLogin} disabled={busy} />
        </View>
      ) : step === 'phoneOtp' ? (
        <View style={styles.body}>
          <Text style={styles.otpHint}>{t('register.otpHintSms',{phone:phone.replace(/[^0-9]/g,'').replace(/^0+/,'')})}</Text>
          <View style={styles.formGroup}><Text style={styles.label}>{t('register.smsCode')}</Text><TextInput style={styles.input} placeholder="123456" keyboardType="number-pad" maxLength={6} value={phoneCode} onChangeText={setPhoneCode} /></View>
          {!!(localError||authError)&&<Text style={styles.errorText}>{localError||authError}</Text>}
          <TouchableOpacity style={[styles.btn,busy&&styles.btnDisabled]} onPress={onVerifyPhoneAndSendEmailLink} disabled={busy}>{busy?<ActivityIndicator color="white"/>:<Text style={styles.btnText}>{t('register.verifyPhoneBtn')}</Text>}</TouchableOpacity>
          <TouchableOpacity style={styles.resendBtn} onPress={onResendPhoneCode} disabled={busy}><Text style={styles.resendText}>{t('register.resend')}</Text></TouchableOpacity>
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={styles.otpHint}>{t('register.emailLinkHint',{email})}</Text>
          <Text style={styles.methodHint}>Use the magic link in the email, or enter the 6-digit code from the same email.</Text>
          <View style={styles.formGroup}><Text style={styles.label}>Email verification code</Text><TextInput style={styles.input} placeholder="123456" keyboardType="number-pad" maxLength={6} value={emailCode} onChangeText={setEmailCode} /></View>
          {!!(localError||authError)&&<Text style={styles.errorText}>{localError||authError}</Text>}
          <TouchableOpacity style={[styles.btn,busy&&styles.btnDisabled]} onPress={onConfirmEmailOtp} disabled={busy}>{busy?<ActivityIndicator color="white"/>:<Text style={styles.btnText}>Verify with OTP</Text>}</TouchableOpacity>
          <Text style={styles.orText}>OR</Text>
          {busy&&<ActivityIndicator color={colors.primary} style={{marginBottom:10}}/>}
          <TouchableOpacity style={styles.resendBtn} onPress={onResendEmailLink} disabled={busy}><Text style={styles.resendText}>Send link + OTP again</Text></TouchableOpacity>
        </View>
      )}
      <PhoneCountryPicker visible={countryPicker} value={phoneCountry} onSelect={(c)=>{setPhoneCountry(c);setCountryPicker(false);}} onClose={()=>setCountryPicker(false)} />
    </View>
  );
}

function createStyles(colors){return StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.bg},header:{flexDirection:'row',alignItems:'center',gap:10,padding:12,backgroundColor:colors.primary,overflow:'hidden'},backBtn:{padding:4},backText:{color:'white',fontSize:20},headerTitle:{color:'white',fontWeight:'600',fontSize:16},body:{padding:20},formGroup:{marginBottom:14},label:{fontWeight:'500',marginBottom:5,fontSize:13},hint:{fontSize:11,color:'#888',marginTop:5},input:{width:'100%',paddingVertical:12,paddingHorizontal:14,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,fontSize:14,backgroundColor:'white'},btn:{backgroundColor:colors.primary,paddingVertical:12,borderRadius:radius.md,alignItems:'center'},btnDisabled:{opacity:0.6},btnText:{color:'white',fontWeight:'600',fontSize:14},errorText:{color:colors.error,fontSize:12,marginBottom:10,textAlign:'center'},otpHint:{fontSize:13,color:'#666',marginBottom:16,textAlign:'center'},methodHint:{fontSize:12,color:'#666',marginBottom:16,textAlign:'center'},orText:{textAlign:'center',marginTop:14,color:'#888',fontSize:12},resendBtn:{alignItems:'center',marginTop:14},resendText:{color:colors.primary,fontSize:12,fontWeight:'500'}});}
