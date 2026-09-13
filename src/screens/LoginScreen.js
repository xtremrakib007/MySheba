import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Image, ScrollView, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import { useLanguage } from '../i18n/LanguageContext';
import { secureAsyncStorage } from '../firebase/secureLocalStorage';
import PhoneCountryPicker from '../components/PhoneCountryPicker';
import { DEFAULT_PHONE_COUNTRY } from '../data/phoneCountries';
import * as supportContactService from '../firebase/supportContactService';

const SUPPORT_EMAIL = 'info.mysheba@gmail.com';
const REMEMBER_KEY = 'mysheba_remembered_phone';
const BRAND_TEAL = '#00A99D';
const BRAND_BLUE = '#1A73E8';
const BRAND_NAVY = '#0B2447';

export default function LoginScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { t } = useLanguage();
  const { setScreen, doLogin, authError, authBusy } = useApp();
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [countryPicker, setCountryPicker] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  useEffect(() => {
    secureAsyncStorage.getItem(REMEMBER_KEY)
      .then((saved) => { if (saved) setPhone(saved); })
      .catch(() => {});
  }, []);

  const onSignIn = () => {
    secureAsyncStorage.setItem(REMEMBER_KEY, rememberMe ? phone : '').catch(() => {});
    doLogin(phone, password, phoneCountry.dial);
  };

  const onForgotPassword = () => setScreen('forgotPassword');

  const onNeedHelp = async () => {
    let contact;
    try {
      contact = await supportContactService.ensureSupportContact();
    } catch (err) {
      contact = supportContactService.DEFAULT_SUPPORT_CONTACT;
    }
    const openLink = async (url, label) => {
      try {
        await Linking.openURL(url);
      } catch (err) {
        showAlert('MySheba', `Couldn’t open ${label}. Please make sure you have an app installed that can handle this.`);
      }
    };
    const buttons = [];
    if (contact.phone) {
      buttons.push({ text: t('login.callSupport'), onPress: () => openLink(`tel:${contact.phone}`, 'the dialer') });
    }
    if (contact.whatsapp) {
      const msg = encodeURIComponent('Hi, I need help signing in to MySheba.');
      buttons.push({ text: 'WhatsApp', onPress: () => openLink(`https://wa.me/${contact.whatsapp}?text=${msg}`, 'WhatsApp') });
    }
    buttons.push({
      text: t('login.emailSupport'),
      onPress: () => openLink(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('MySheba Support Request')}`, 'your email app'),
    });
    buttons.push({ text: t('common.cancel'), style: 'cancel' });
    showAlert(t('login.needHelpTitle'), t('login.needHelpMessage'), buttons);
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={[BRAND_TEAL, BRAND_BLUE]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.topSwoosh} />
      <View style={styles.topDots}>{Array.from({ length: 12 }).map((_, i) => <View key={i} style={styles.dot} />)}</View>
      <View style={styles.bottomWaveLight} />
      <View style={styles.bottomWaveMid} />
      <LinearGradient colors={[BRAND_TEAL, BRAND_BLUE]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.bottomWaveDark} />
      <View style={styles.bottomDots}>{Array.from({ length: 12 }).map((_, i) => <View key={i} style={styles.dot} />)}</View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Image source={require('../../assets/icon-transparent.png')} style={styles.logo} resizeMode="contain" />
            <View style={styles.brandRow}>
              <Text style={styles.brandDark}>My</Text>
              <Text style={styles.brandTeal}>Sheba</Text>
            </View>
            <Text style={styles.welcome}>{t('login.welcomeBack')}</Text>
            <Text style={styles.subtitle}>{t('login.subtitle')}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>{t('login.phoneNumber')}</Text>
            <View style={styles.phoneRow}>
              <TouchableOpacity style={styles.countryChip} onPress={() => setCountryPicker(true)}>
                <Text style={styles.flagEmoji}>{phoneCountry.flag}</Text>
                <Text style={styles.countryCode}>{phoneCountry.dial}</Text>
                <Text style={styles.countryChevron}>▾</Text>
              </TouchableOpacity>
              <View style={styles.fieldDivider} />
              <TextInput
                style={styles.phoneInput}
                placeholder={t('login.phonePlaceholder')}
                placeholderTextColor="#9AA5B1"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.labelRow}>
              <Text style={styles.label}>{t('login.password')}</Text>
              <TouchableOpacity onPress={onForgotPassword}>
                <Text style={styles.forgotLink}>{t('login.forgotPassword')}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.pinRow}>
              <Text style={styles.lockIcon}>🔒</Text>
              <TextInput
                style={styles.pinInput}
                placeholder={t('login.passwordPlaceholder')}
                placeholderTextColor="#9AA5B1"
                secureTextEntry={!showPassword}
                maxLength={20}
                autoCapitalize="none"
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword((s) => !s)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.rememberRow} onPress={() => setRememberMe((r) => !r)} activeOpacity={0.7}>
              <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                {rememberMe && <Text style={styles.checkboxTick}>✓</Text>}
              </View>
              <Text style={styles.rememberText}>{t('login.rememberMe')}</Text>
            </TouchableOpacity>

            {!!authError && <Text style={styles.errorText}>{authError}</Text>}

            <TouchableOpacity activeOpacity={0.85} onPress={onSignIn} disabled={authBusy}>
              <LinearGradient colors={[BRAND_TEAL, BRAND_BLUE]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.loginBtn, authBusy && styles.btnDisabled]}>
                {authBusy ? <ActivityIndicator color="white" /> : <>
                  <Text style={styles.loginBtnText}>{t('login.login')}</Text>
                  <View style={styles.arrowCircle}><Text style={styles.arrowText}>→</Text></View>
                </>}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.signupRow} onPress={() => setScreen('register')}>
              <Text style={styles.signupText}>{t('login.noAccount')}<Text style={styles.signupLink}>{t('login.signUp')}</Text></Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.helpRow} onPress={onNeedHelp}>
              <Text style={styles.signupText}>{t('login.needHelp')}<Text style={styles.signupLink}>{t('login.contactUs')}</Text></Text>
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
    scrollContent: { flexGrow: 1, paddingBottom: 30 },
    topSwoosh: { position: 'absolute', top: 0, left: 0, width: 220, height: 170, borderBottomRightRadius: 180 },
    topDots: { position: 'absolute', top: 145, left: 28, width: 60, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    bottomWaveLight: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 140, backgroundColor: '#CDEDE6', opacity: 0.6, borderTopLeftRadius: 140 },
    bottomWaveMid: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 95, backgroundColor: '#9FD9DE', opacity: 0.7, borderTopRightRadius: 160 },
    bottomWaveDark: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 55, borderTopLeftRadius: 90 },
    bottomDots: { position: 'absolute', bottom: 16, right: 24, width: 60, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,105,92,0.35)' },
    hero: { alignItems: 'center', paddingTop: 46, paddingHorizontal: 24, paddingBottom: 20 },
    logo: { width: 130, height: 130, marginBottom: 4 },
    brandRow: { flexDirection: 'row', marginBottom: 14 },
    brandDark: { fontSize: 28, fontWeight: '700', color: BRAND_NAVY },
    brandTeal: { fontSize: 28, fontWeight: '700', color: BRAND_TEAL },
    welcome: { fontSize: 22, fontWeight: '700', color: BRAND_NAVY, marginBottom: 8 },
    subtitle: { fontSize: 13, color: '#6B7785', textAlign: 'center', lineHeight: 19 },
    card: { backgroundColor: 'white', marginHorizontal: 18, borderRadius: radius.xl, padding: 22, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
    label: { fontWeight: '600', fontSize: 13, color: BRAND_NAVY, marginBottom: 8 },
    labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    forgotLink: { color: BRAND_TEAL, fontSize: 12, fontWeight: '600' },
    phoneRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: 'white', marginBottom: 18, paddingHorizontal: 12 },
    countryChip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 6 },
    flagEmoji: { fontSize: 16 },
    countryCode: { fontSize: 14, fontWeight: '600', color: BRAND_NAVY },
    countryChevron: { fontSize: 10, marginLeft: 2, color: BRAND_NAVY },
    fieldDivider: { width: 1, height: 22, backgroundColor: colors.border, marginHorizontal: 10 },
    phoneInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: BRAND_NAVY },
    pinRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: 'white', marginBottom: 14, paddingHorizontal: 14 },
    lockIcon: { fontSize: 14, marginRight: 8 },
    pinInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: BRAND_NAVY },
    eyeIcon: { fontSize: 16, marginLeft: 8 },
    rememberRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 8 },
    checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    checkboxChecked: { backgroundColor: BRAND_TEAL, borderColor: BRAND_TEAL },
    checkboxTick: { color: 'white', fontSize: 12, fontWeight: '700' },
    rememberText: { fontSize: 13, color: BRAND_NAVY },
    errorText: { color: colors.error, fontSize: 12, marginBottom: 12, textAlign: 'center' },
    loginBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, borderRadius: radius.md, gap: 10 },
    btnDisabled: { opacity: 0.7 },
    loginBtnText: { color: 'white', fontWeight: '700', fontSize: 16 },
    arrowCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
    arrowText: { color: 'white', fontSize: 14, fontWeight: '700' },
    signupRow: { marginTop: 18, alignItems: 'center' },
    helpRow: { marginTop: 10, alignItems: 'center' },
    signupText: { fontSize: 13, color: '#6B7785' },
    signupLink: { color: BRAND_TEAL, fontWeight: '700' },
  });
}
