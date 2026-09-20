import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { showAlert } from '../utils/appAlert';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import { useLanguage, LANGUAGES } from '../i18n/LanguageContext';
import HeaderDecor from '../components/HeaderDecor';
import ChangePasswordModal from '../components/ChangePasswordModal';
import ResetSecurityPinModal from '../components/ResetSecurityPinModal';
import DisplayModeModal from '../components/DisplayModeModal';
import LanguageModal from '../components/LanguageModal';

function ToggleRow({ icon, label, sub, value, onValueChange }) {
  const { colors } = useTheme(); const styles = createStyles(colors);
  return <View style={styles.row}><Text style={styles.rowIcon}>{icon}</Text><View style={styles.rowTextWrap}><Text style={styles.rowLabel}>{label}</Text>{!!sub && <Text style={styles.rowSub}>{sub}</Text>}</View><Switch value={value} onValueChange={onValueChange} trackColor={{ false: '#DDD', true: colors.primary }} thumbColor={Platform.OS === 'android' ? 'white' : undefined} /></View>;
}
function LinkRow({ icon, label, sub, onPress }) {
  const { colors } = useTheme(); const styles = createStyles(colors);
  return <TouchableOpacity style={styles.row} onPress={onPress}><Text style={styles.rowIcon}>{icon}</Text><View style={styles.rowTextWrap}><Text style={styles.rowLabel}>{label}</Text>{!!sub && <Text style={styles.rowSub}>{sub}</Text>}</View><Text style={styles.chevron}>›</Text></TouchableOpacity>;
}

export default function SettingsScreen() {
  const { colors, brandGradient, isDark, mode, isSystemMode, setMode } = useTheme();
  const styles = createStyles(colors); const { language, t } = useLanguage();
  const { goBackOrHome, logout, profile, setNotifPref, changePassword, resetSecurityPin, setScreen, appLockEnabled, setAppLockEnabled } = useApp();
  const prefs = profile?.notifPrefs || {};
  const [pushEnabled, setPushEnabledState] = useState(prefs.pushEnabled !== false); const [emailEnabled, setEmailEnabledState] = useState(prefs.emailEnabled !== false); const [rateAlerts, setRateAlertsState] = useState(!!prefs.rateAlerts);
  const [pwModalVisible, setPwModalVisible] = useState(false); const [pinModalVisible, setPinModalVisible] = useState(false); const [displayModalVisible, setDisplayModalVisible] = useState(false); const [languageModalVisible, setLanguageModalVisible] = useState(false);
  useEffect(() => { if (!profile?.notifPrefs) return; setPushEnabledState(profile.notifPrefs.pushEnabled !== false); setEmailEnabledState(profile.notifPrefs.emailEnabled !== false); setRateAlertsState(!!profile.notifPrefs.rateAlerts); }, [profile?.notifPrefs]);
  const onTogglePush = (value) => { setPushEnabledState(value); setNotifPref('pushEnabled', value); }; const onToggleEmail = (value) => { setEmailEnabledState(value); setNotifPref('emailEnabled', value); }; const onToggleRateAlerts = (value) => { setRateAlertsState(value); setNotifPref('rateAlerts', value); };
  const onToggleAppLock = (value) => { setAppLockEnabled(value).catch(() => {}); };
  const submitPasswordChange = async (currentPin, newPin) => { await changePassword(currentPin, newPin); setPwModalVisible(false); showAlert('MySheba', t('settings.passwordChanged')); };
  const submitPinReset = async (currentPassword, newPin) => { await resetSecurityPin(currentPassword, newPin); setPinModalVisible(false); showAlert('MySheba', t('settings.pinSaved')); };
  return <View style={styles.screen}>
    <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}><HeaderDecor /><TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}><Text style={styles.backText}>←</Text></TouchableOpacity><Text style={styles.headerTitle}>{t('settings.title')}</Text></LinearGradient>
    <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
      <Text style={styles.sectionTitle}>{t('settings.sectionNotifications')}</Text><View style={styles.card}>
        <ToggleRow icon="🔔" label={t('settings.pushNotifications')} sub={t('settings.pushNotificationsSub')} value={pushEnabled} onValueChange={onTogglePush} /><View style={styles.divider} />
        <ToggleRow icon="✉️" label={t('settings.emailNotifications')} sub={t('settings.emailNotificationsSub')} value={emailEnabled} onValueChange={onToggleEmail} /><View style={styles.divider} />
        <ToggleRow icon="💱" label={t('settings.rateAlerts')} sub={t('settings.rateAlertsSub')} value={rateAlerts} onValueChange={onToggleRateAlerts} />
      </View>
      <Text style={styles.sectionTitle}>{t('settings.sectionGeneral')}</Text><View style={styles.card}>
        <LinkRow icon="🌙" label={t('settings.displayMode')} sub={isSystemMode ? `System Default (${isDark ? 'Dark' : 'Light'})` : (isDark ? 'Dark' : 'Light')} onPress={() => setDisplayModalVisible(true)} /><View style={styles.divider} />
        <LinkRow icon="🌐" label={t('settings.language')} sub={LANGUAGES[language]?.label || 'English'} onPress={() => setLanguageModalVisible(true)} /><View style={styles.divider} />
        <LinkRow icon="🔒" label={t('settings.changePassword')} onPress={() => setPwModalVisible(true)} />
        <View style={styles.divider} /><LinkRow icon="🔢" label={profile?.securityPinSet ? t('settings.changeSecurityPin') : t('settings.setUpSecurityPin')} sub={t('settings.securityPinSub')} onPress={() => setPinModalVisible(true)} /><View style={styles.divider} />
        <ToggleRow icon="🔐" label={t('settings.appLock')} sub={t('settings.appLockSub')} value={appLockEnabled} onValueChange={onToggleAppLock} />
        {(profile?.role === 'admin' || profile?.role === 'superadmin') && <><View style={styles.divider} /><LinkRow icon="📱" label={t('settings.trustedDevices')} sub={t('settings.trustedDevicesSub')} onPress={() => setScreen('trustedDevices')} /></>}
      </View>
      <TouchableOpacity style={styles.logoutBtn} onPress={() => showAlert('Log Out', 'Are you sure you want to log out?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Log Out', style: 'destructive', onPress: logout }])}><Text style={styles.logoutText}>{t('settings.logout')}</Text></TouchableOpacity>
    </ScrollView>
    <DisplayModeModal visible={displayModalVisible} selected={mode} onSelect={(key) => { setMode(key); setDisplayModalVisible(false); }} onClose={() => setDisplayModalVisible(false)} />
    <ChangePasswordModal visible={pwModalVisible} onSubmit={submitPasswordChange} onCancel={() => setPwModalVisible(false)} />
    <ResetSecurityPinModal visible={pinModalVisible} hasExistingPin={!!profile?.securityPinSet} onSubmit={submitPinReset} onCancel={() => setPinModalVisible(false)} />
    <LanguageModal visible={languageModalVisible} onClose={() => setLanguageModalVisible(false)} />
  </View>;
}
function createStyles(colors) { return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg }, header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' }, backBtn: { padding: 4 }, backText: { color: 'white', fontSize: 20 }, headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 }, sectionTitle: { fontSize: 12, fontWeight: '700', color: '#999', textTransform: 'uppercase', marginTop: 20, marginBottom: 8, marginHorizontal: 16 }, card: { backgroundColor: colors.card, marginHorizontal: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }, row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14, gap: 12 }, rowIcon: { fontSize: 18, width: 22, textAlign: 'center' }, rowTextWrap: { flex: 1 }, rowLabel: { fontSize: 14, fontWeight: '500', color: colors.text }, rowSub: { fontSize: 11, color: '#999', marginTop: 2 }, chevron: { fontSize: 16, color: '#CCC' }, divider: { height: 1, backgroundColor: colors.border, marginLeft: 48 }, logoutBtn: { marginTop: 26, marginHorizontal: 16, backgroundColor: '#FDECEA', paddingVertical: 13, borderRadius: radius.md, alignItems: 'center' }, logoutText: { color: colors.error, fontWeight: '700', fontSize: 14 },
}); }
