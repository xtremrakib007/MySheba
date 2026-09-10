import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
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
  const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY); const [countryPicker, setCountryPicker] = useState(false);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirmPassword, setConfirmPassword] = useState('');
  const [dealerCode, setDealerCode] = useState(''); const [resellerCode, setResellerCode] = useState('');
  const [phoneCode, setPhoneCode] = useState(''); const [emailCode, setEmailCode] = useState('');
  const [phoneConfirmation, setPhoneConfirmation] = useState(null); const [phoneIdToken, setPhoneIdToken] = useState('');
  const [localError, setLocalError] = useState(''); const [otpBusy, setOtpBusy] = useState(false);
  const handledLinks = useRef(new Set());

  useEffect(() => {
    if (step !== 'emailLink') return undefined;
    let mounted = true;
    const handleUrl = async (url) => {
      if (!mounted || !url) return;
      const key = String(url);
      if (handledLinks.current.has(key)) return;
      handledLinks.current.add(key);
      try {
        if (await emailVerification.isEmailSignInLink(url)) await onConfirmEmailLink(url);
        else handledLinks.current.delete(key);
      } catch {
        handledLinks.current.delete(key);
      }
    };
    Linking.getInitialURL().then(handleUrl).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => { handleUrl(url); });
    return () => { mounted = false; sub.remove(); };
  }, [step]);

  const validateDetails = () => {
    if (!name.trim()) return t('register.errNoName');
    if (String(phone).replace(/[^0-9]/g, '').length < 8) return t('register.errBadPhone');
    if (!EMAIL_RE.test(String(email).trim())) return t('register.errBadEmail');
    if (String(password).length < 6 || String(password).length > 20) return t('register.errBadPassword');
    if (password !== confirmPassword) return t('register.errPasswordMismatch');
    return '';
  };
  const onSendPhoneCode = async () => { const err=validateDetails(); if(err){setLocalError(err);return;} setLocalError('');setOtpBusy(true); try{const c=await phoneVerification.sendPhoneOtp(phone,phoneCountry.dial);setPhoneConfirmation(c);setPhoneCode('');setStep('phoneOtp');}catch(e){setLocalError(e.message||'Could not send the SMS code. Please try again.');}finally{setOtpBusy(false);} };
  const onResendPhoneCode = async () => { setLocalError('');setOtpBusy(true);try{const c=await phoneVerification.sendPhoneOtp(phone,phoneCountry.dial);setPhoneConfirmation(c);setPhoneCode('');}catch(e){setLocalError(e.message||'Could not resend the SMS code. Please try again.');}finally{setOtpBusy(false);} };
  const onVerifyPhoneAndSendEmail = async () => { if(!/^\d{6}$/.test(phoneCode.trim())){setLocalError('Enter the 6-digit SMS verification code.');return;} setLocalError('');setOtpBusy(true);try{const {idToken}=await phoneVerification.confirmPhoneOtp(phoneConfirmation,phoneCode.trim());setPhoneIdToken(idToken);await emailVerification.sendEmailOtp(email.trim());setEmailCode('');setStep('emailLink');}catch(e){setLocalError(e.message||'Incorrect SMS code. Please try again.');}finally{setOtpBusy(false);} };
  const onResendEmail = async () => { setLocalError('');setOtpBusy(true);try{await emailVerification.sendEmailOtp(email.trim());setEmailCode('');}catch(e){setLocalError(e.message||'Could not resend the email verification. Please try again.');}finally{setOtpBusy(false);} };
  const finishRegistration = async (emailIdToken, emailOtpVerificationId) => { await doRegister({name,phone,phoneE164:phoneVerification.phoneToE164(phone,phoneCountry.dial),dialCode:phoneCountry.dial,email:email.trim(),pin:password,dealerCode,resellerCode,phoneIdToken,emailIdToken,emailOtpVerificationId}); };
  const onConfirmEmailLink = async (url) => { setLocalError('');setOtpBusy(true);try{const result=await emailVerification.confirmEmailLink(url,email.trim());await finishRegistration(result.idToken,'');}catch(e){setLocalError(e.message||'Could not verify your email address. Please try again.');setOtpBusy(false);} };
  const onConfirmEmailOtp = async () => { if(!/^\d{6}$/.test(emailCode.trim())){setLocalError('Enter the 6-digit email verification code.');return;}setLocalError('');setOtpBusy(true);try{const result=await emailVerification.verifyEmailOtp(email.trim(),emailCode.trim());await finishRegistration('',result.verificationId);}catch(e){setLocalError(e.message||'Could not verify the email code. Please try again.');setOtpBusy(false);} };
  const busy=otpBusy||authBusy;

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS==='ios'?'padding':'height'}>
    <LinearGradient colors={brandGradient} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.header}><HeaderDecor/><TouchableOpacity style={styles.backBtn} onPress={()=>{if(step==='emailLink')setStep('phoneOtp');else if(step==='phoneOtp')setStep('details');else setScreen('login')}}><Text style={styles.backText}>←</Text></TouchableOpacity><Text style={styles.headerTitle}>{step==='emailLink'?t('register.verifyEmail'):step==='phoneOtp'?t('register.verifyPhone'):t('register.createAccount')}</Text></LinearGradient>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      {step==='details'?<>
        <Field label={t('register.fullName')} value={name} setValue={setName} placeholder={t('register.fullNamePlaceholder')} styles={styles}/>
        <View style={styles.formGroup}><Text style={styles.label}>{t('register.phoneNumber')}</Text><View style={styles.phoneRow}><TouchableOpacity onPress={()=>setCountryPicker(true)} style={styles.countryButton}><Text style={styles.countryFlag}>{phoneCountry.flag}</Text><Text style={styles.countryName} numberOfLines={1}>{phoneCountry.name}</Text><Text style={styles.countryDial}>{phoneCountry.dial}</Text><Text style={styles.countryChevron}>▾</Text></TouchableOpacity><TextInput style={styles.phoneInput} placeholder={t('register.phoneNumber')} placeholderTextColor="#999" keyboardType="phone-pad" value={phone} onChangeText={setPhone}/></View></View>
        <Field label={t('register.emailAddress')} value={email} setValue={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" styles={styles}/><Field label={t('register.password')} value={password} setValue={setPassword} placeholder={t('register.passwordPlaceholder')} secureTextEntry maxLength={20} styles={styles}/><Field label={t('register.confirmPassword')} value={confirmPassword} setValue={setConfirmPassword} placeholder={t('register.confirmPasswordPlaceholder')} secureTextEntry maxLength={20} styles={styles}/><Field label={t('register.dealerCode')} value={dealerCode} setValue={setDealerCode} placeholder={t('register.dealerCodePlaceholder')} keyboardType="phone-pad" styles={styles}/><Field label={t('register.resellerCode')} value={resellerCode} setValue={setResellerCode} placeholder={t('register.resellerCodePlaceholder')} keyboardType="phone-pad" styles={styles}/>
        {!!(localError||authError)&&<Text style={styles.errorText}>{localError||authError}</Text>}<TouchableOpacity style={[styles.btn,busy&&styles.btnDisabled]} onPress={onSendPhoneCode} disabled={busy}>{busy?<ActivityIndicator color="#fff"/>:<Text style={styles.btnText}>{t('register.sendVerificationCode')}</Text>}</TouchableOpacity><OrDivider/><GoogleButton label={t('register.signUpWithGoogle')} onPress={doGoogleLogin} disabled={busy}/>
      </>:step==='phoneOtp'?<>
        <Text style={styles.stepTitle}>{t('register.verifyPhone')}</Text><Text style={styles.otpHint}>{t('register.otpHintSms',{phone:`${phoneCountry.dial} ${phone.replace(/[^0-9]/g,'').replace(/^0+/,'')}`})}</Text><Field label={t('register.smsCode')} value={phoneCode} setValue={setPhoneCode} placeholder="123456" keyboardType="number-pad" maxLength={6} styles={styles} otp/>{!!(localError||authError)&&<Text style={styles.errorText}>{localError||authError}</Text>}<TouchableOpacity style={[styles.btn,busy&&styles.btnDisabled]} onPress={onVerifyPhoneAndSendEmail} disabled={busy}>{busy?<ActivityIndicator color="#fff"/>:<Text style={styles.btnText}>{t('register.verifyPhoneBtn')}</Text>}</TouchableOpacity><TouchableOpacity style={styles.resendBtn} onPress={onResendPhoneCode} disabled={busy}><Text style={styles.resendText}>{t('register.resend')}</Text></TouchableOpacity>
      </>:<>
        <Text style={styles.stepTitle}>{t('register.verifyEmail')}</Text><Text style={styles.otpHint}>{t('register.emailLinkHint',{email})}</Text><Text style={styles.methodHint}>Use the Firebase verification link in the email, or enter the 6-digit code from the same email.</Text><Field label="Email verification code" value={emailCode} setValue={setEmailCode} placeholder="123456" keyboardType="number-pad" maxLength={6} styles={styles} otp/>{!!(localError||authError)&&<Text style={styles.errorText}>{localError||authError}</Text>}<TouchableOpacity style={[styles.btn,busy&&styles.btnDisabled]} onPress={onConfirmEmailOtp} disabled={busy}>{busy?<ActivityIndicator color="#fff"/>:<Text style={styles.btnText}>Verify with OTP</Text>}</TouchableOpacity><Text style={styles.orText}>OR</Text><TouchableOpacity style={styles.resendBtn} onPress={onResendEmail} disabled={busy}><Text style={styles.resendText}>Send Firebase link + OTP again</Text></TouchableOpacity>
      </>}
    </ScrollView><PhoneCountryPicker visible={countryPicker} value={phoneCountry} onSelect={c=>{setPhoneCountry(c);setCountryPicker(false)}} onClose={()=>setCountryPicker(false)}/>
  </KeyboardAvoidingView>;
}
function Field({label,value,setValue,placeholder,styles,otp,...props}){return <View style={styles.formGroup}><Text style={styles.label}>{label}</Text><TextInput style={otp?styles.otpInput:styles.input} placeholder={placeholder} placeholderTextColor="#999" value={value} onChangeText={setValue} autoCorrect={false} {...props}/></View>}
function createStyles(colors){return StyleSheet.create({screen:{flex:1,backgroundColor:'#050505'},scroll:{flex:1,backgroundColor:'#050505'},header:{flexDirection:'row',alignItems:'center',gap:10,padding:12,backgroundColor:'#080808',overflow:'hidden',borderBottomWidth:1,borderBottomColor:'#292929'},backBtn:{padding:4},backText:{color:'#fff',fontSize:22},headerTitle:{color:'#fff',fontWeight:'700',fontSize:16},body:{padding:20,paddingBottom:40,backgroundColor:'#050505'},formGroup:{marginBottom:14},label:{fontWeight:'700',marginBottom:7,fontSize:13,color:'#fff'},input:{width:'100%',paddingVertical:13,paddingHorizontal:14,borderWidth:1,borderColor:'#444',borderRadius:radius.md,fontSize:14,backgroundColor:'#111',color:'#fff'},phoneRow:{flexDirection:'row',alignItems:'stretch',gap:7},countryButton:{minHeight:48,borderWidth:1,borderColor:'#555',borderRadius:radius.md,backgroundColor:'#111',paddingHorizontal:9,flexDirection:'row',alignItems:'center',maxWidth:'58%'},countryFlag:{fontSize:19},countryName:{color:'#fff',fontSize:12,fontWeight:'700',marginLeft:6,flexShrink:1},countryDial:{color:'#fff',fontSize:12,fontWeight:'800',marginLeft:5},countryChevron:{color:'#ccc',fontSize:14,marginLeft:5},phoneInput:{flex:1,minWidth:0,paddingVertical:13,paddingHorizontal:12,borderWidth:1,borderColor:'#444',borderRadius:radius.md,fontSize:14,backgroundColor:'#111',color:'#fff'},btn:{backgroundColor:colors.primary,paddingVertical:14,borderRadius:radius.md,alignItems:'center'},btnDisabled:{opacity:.6},btnText:{color:'#fff',fontWeight:'800',fontSize:14},errorText:{color:'#ff7777',fontSize:12,marginBottom:10,textAlign:'center'},stepTitle:{fontSize:20,fontWeight:'800',color:'#fff',textAlign:'center',marginBottom:8},otpHint:{fontSize:13,color:'#ddd',marginBottom:16,textAlign:'center',lineHeight:20},methodHint:{fontSize:12,color:'#aaa',marginBottom:16,textAlign:'center',lineHeight:18},otpInput:{width:'100%',paddingVertical:15,paddingHorizontal:14,borderWidth:1,borderColor:'#666',borderRadius:radius.md,fontSize:20,letterSpacing:5,textAlign:'center',backgroundColor:'#111',color:'#fff'},orText:{textAlign:'center',marginTop:14,color:'#aaa',fontSize:12},resendBtn:{alignItems:'center',marginTop:14},resendText:{color:'#fff',fontSize:13,fontWeight:'700',textDecorationLine:'underline'}})}
