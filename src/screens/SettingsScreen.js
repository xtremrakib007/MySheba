import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { showAlert } from '../utils/appAlert';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import { useLanguage, LANGUAGES } from '../i18n/LanguageContext';
import HeaderDecor from '../components/HeaderDecor';
import { SectionCard, ListRow, ToggleRow } from '../components/uiRows';
import ChangePasswordModal from '../components/ChangePasswordModal';
import ResetSecurityPinModal from '../components/ResetSecurityPinModal';
import DisplayModeModal from '../components/DisplayModeModal';
import LanguageModal from '../components/LanguageModal';

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
    <ScrollView contentContainerStyle={styles.body}>
      <SectionCard title={t('settings.sectionNotifications')}>
        <ToggleRow icon="🔔" title={t('settings.pushNotifications')} subtitle={t('settings.pushNotificationsSub')} value={pushEnabled} onValueChange={onTogglePush} />
        <ToggleRow icon="✉️" title={t('settings.emailNotifications')} subtitle={t('settings.emailNotificationsSub')} value={emailEnabled} onValueChange={onToggleEmail} />
        <ToggleRow icon="💱" title={t('settings.rateAlerts')} subtitle={t('settings.rateAlertsSub')} value={rateAlerts} onValueChange={onToggleRateAlerts} last />
      </SectionCard>

      <SectionCard title={t('settings.sectionGeneral')} style={styles.section}>
        <ListRow icon="🌙" title={t('settings.displayMode')} subtitle={isSystemMode ? `System Default (${isDark ? 'Dark' : 'Light'})` : (isDark ? 'Dark' : 'Light')} onPress={() => setDisplayModalVisible(true)} />
        <ListRow icon="🌐" title={t('settings.language')} subtitle={LANGUAGES[language]?.label || 'English'} onPress={() => setLanguageModalVisible(true)} />
        <ListRow icon="🖨️" title="Printer" subtitle="Connect or select a supported printer" onPress={() => setScreen('printer')} />
        <ListRow icon="🔒" title={t('settings.changePassword')} onPress={() => setPwModalVisible(true)} />
        <ListRow icon="🔢" title={profile?.securityPinSet ? t('settings.changeSecurityPin') : t('settings.setUpSecurityPin')} subtitle={t('settings.securityPinSub')} onPress={() => setPinModalVisible(true)} />
        <ToggleRow icon="🔐" title={t('settings.appLock')} subtitle={t('settings.appLockSub')} value={appLockEnabled} onValueChange={onToggleAppLock} last={!(profile?.role === 'admin' || profile?.role === 'superadmin')} />
        {(profile?.role === 'admin' || profile?.role === 'superadmin') && (
          <ListRow icon="📱" title={t('settings.trustedDevices')} subtitle={t('settings.trustedDevicesSub')} onPress={() => setScreen('trustedDevices')} last />
        )}
      </SectionCard>

      <TouchableOpacity style={styles.logoutBtn} onPress={() => showAlert('Log Out', 'Are you sure you want to log out?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Log Out', style: 'destructive', onPress: logout }])}>
        <Text style={styles.logoutText}>{t('settings.logout')}</Text>
      </TouchableOpacity>
    </ScrollView>
    <DisplayModeModal visible={displayModalVisible} selected={mode} onSelect={(key) => { setMode(key); setDisplayModalVisible(false); }} onClose={() => setDisplayModalVisible(false)} />
    <ChangePasswordModal visible={pwModalVisible} onSubmit={submitPasswordChange} onCancel={() => setPwModalVisible(false)} />
    <ResetSecurityPinModal visible={pinModalVisible} hasExistingPin={!!profile?.securityPinSet} onSubmit={submitPinReset} onCancel={() => setPinModalVisible(false)} />
    <LanguageModal visible={languageModalVisible} onClose={() => setLanguageModalVisible(false)} />
  </View>;
}
function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: colors.onPrimary, fontSize: 20 },
    headerTitle: { color: colors.onPrimary, fontWeight: '600', fontSize: 16, marginLeft: 10 },
    body: { padding: 16, paddingBottom: 30 },
    section: { marginTop: 22 },
    // Was '#FDECEA' and colors.error on top of it, which stayed a pale pink
    // block in dark mode. Tinting the role palette's error keeps the same
    // look in light and follows the surface in dark.
    logoutBtn: { marginTop: 26, backgroundColor: `${colors.error}1A`, paddingVertical: 13, borderRadius: radius.md, alignItems: 'center' },
    logoutText: { color: colors.error, fontWeight: '700', fontSize: 14 },
  });
}
