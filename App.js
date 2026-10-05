import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, View, Text, ActivityIndicator, TouchableOpacity, Platform, Linking } from 'react-native';
import { AppProvider, useApp } from './src/context/AppContext';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { LanguageProvider } from './src/i18n/LanguageContext';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import DeviceVerifyScreen from './src/screens/DeviceVerifyScreen';
import GooglePhoneScreen from './src/screens/GooglePhoneScreen';
import CustomerHomeScreen from './src/screens/CustomerHomeScreen';
import ServiceScreen from './src/screens/ServiceScreen';
import DealerHomeScreen from './src/screens/DealerHomeScreen';
import ResellerHomeScreen from './src/screens/ResellerHomeScreen';
import AdminHomeScreen from './src/screens/AdminHomeScreen';
import StaffHomeScreen from './src/screens/StaffHomeScreen';
import WebViewScreen from './src/screens/WebViewScreen';
import BusPickerScreen from './src/screens/BusPickerScreen';
import SupportScreen from './src/screens/SupportScreen';
import HelpScreen from './src/screens/HelpScreen';
import AdminSupportScreen from './src/screens/AdminSupportScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import TopUpScreen from './src/screens/TopUpScreen';
import SuperAdminTopUpScreen from './src/screens/SuperAdminTopUpScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import PrinterScreen from './src/screens/PrinterScreen';
import RechargePinScreen from './src/screens/RechargePinScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import MyAccountScreen from './src/screens/MyAccountScreen';
import ReportsScreen from './src/screens/ReportsScreen';
import LedgerScreen from './src/screens/LedgerScreen';
import InvoicesScreen from './src/screens/InvoicesScreen';
import TileLabelsScreen from './src/screens/TileLabelsScreen';
import WalletFundingScreen from './src/screens/WalletFundingScreen';
import UserManagementScreen from './src/screens/UserManagementScreen';
import TransferPointsScreen from './src/screens/TransferPointsScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import VerifyIdentityScreen from './src/screens/VerifyIdentityScreen';
import VerificationManagementScreen from './src/screens/VerificationManagementScreen';
import AdminAnalyticsScreen from './src/screens/AdminAnalyticsScreen';
import MyDocumentsScreen from './src/screens/MyDocumentsScreen';
import NotepadScreen from './src/screens/NotepadScreen';
import AddNoteScreen from './src/screens/AddNoteScreen';
import NoteDetailScreen from './src/screens/NoteDetailScreen';
import MoreFeaturesScreen from './src/screens/MoreFeaturesScreen';
import AdminFeaturesScreen from './src/screens/AdminFeaturesScreen';
import TierPromotionsScreen from './src/screens/TierPromotionsScreen';
import ApiProviderManagementScreen from './src/screens/ApiProviderManagementScreen';
import ReconcileTransactionsScreen from './src/screens/ReconcileTransactionsScreen';
import DealerFeaturesScreen from './src/screens/DealerFeaturesScreen';
import ResellerFeaturesScreen from './src/screens/ResellerFeaturesScreen';
import FeatureAccessScreen from './src/screens/FeatureAccessScreen';
import GridManagementScreen from './src/screens/GridManagementScreen';
import WebviewManagementScreen from './src/screens/WebviewManagementScreen';
import AdFeatureControlsScreen from './src/screens/AdFeatureControlsScreen';
import AdAnalyticsScreen from './src/screens/AdAnalyticsScreen';
import BannerManagementScreen from './src/screens/BannerManagementScreen';
import AdvertiserManagementScreen from './src/screens/AdvertiserManagementScreen';
import AdvertiserDetailScreen from './src/screens/AdvertiserDetailScreen';
import AdPackagesManagementScreen from './src/screens/AdPackagesManagementScreen';
import AdPaymentsManagementScreen from './src/screens/AdPaymentsManagementScreen';
import TrustedDevicesScreen from './src/screens/TrustedDevicesScreen';
import DocumentTypeScreen from './src/screens/DocumentTypeScreen';
import AddDocumentScreen from './src/screens/AddDocumentScreen';
import DocumentDetailsScreen from './src/screens/DocumentDetailsScreen';
import DocumentViewerScreen from './src/screens/DocumentViewerScreen';
import SalaryDashboardScreen from './src/screens/SalaryDashboardScreen';
import SalarySettingsScreen from './src/screens/SalarySettingsScreen';
import SalaryCalculatorScreen from './src/screens/SalaryCalculatorScreen';
import WorkLogScreen from './src/screens/WorkLogScreen';
import SalaryReportsScreen from './src/screens/SalaryReportsScreen';
import MonthlySummaryScreen from './src/screens/MonthlySummaryScreen';
import SalaryHistoryScreen from './src/screens/SalaryHistoryScreen';
import CreatePayslipScreen from './src/screens/CreatePayslipScreen';
import PayslipHistoryScreen from './src/screens/PayslipHistoryScreen';
import PayslipDetailsScreen from './src/screens/PayslipDetailsScreen';
import RatePopup from './src/components/RatePopup';
import ResultModal from './src/components/ResultModal';
import Sidebar from './src/components/Sidebar';
import BottomNav from './src/components/BottomNav';
import UpdateGate from './src/components/UpdateGate';
import AppAlertHost from './src/components/AppAlertHost';
import SecurityPinGate from './src/components/SecurityPinGate';
import AppLockScreen from './src/components/AppLockScreen';
import BiometricOptInPrompt from './src/components/BiometricOptInPrompt';
import WebSignInApprovalPrompt from './src/components/WebSignInApprovalPrompt';
import ErrorBoundary from './src/components/ErrorBoundary';
import AnimatedSplash from './src/components/AnimatedSplash';

const NAV_SCREENS = [
  'customerHome',
  'dealerHome',
  'resellerHome',
  'adminHome',
  'staffHome',
  'support',
  'help',
  'adminSupport',
  'history',
  'topup',
  'superAdminTopup',
  'profile',
  'settings',
  'myAccount',
  'moreFeatures',
  'adminFeatures',
  'dealerFeatures',
  'resellerFeatures',
  'notifications',
];

function Root() {
  const { screen, authLoading, handleDeepLink, profile, adminViewingSection, sessionRestoring, profileFatal, logout } = useApp();
  const { colors, isDark } = useTheme();
  const styles = createStyles(colors);
  const [splashVisible, setSplashVisible] = useState(true);
  const [renderedScreen, setRenderedScreen] = useState(screen);
  useEffect(() => { if (screen === renderedScreen) return undefined; const id = setTimeout(() => setRenderedScreen(screen), 0); return () => clearTimeout(id); }, [screen, renderedScreen]);
  const handleSplashFinished = () => setTimeout(() => setSplashVisible(false), 0);
  useEffect(() => { Linking.getInitialURL().then((url) => { if (url) handleDeepLink(url); }).catch(() => {}); const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url)); return () => sub.remove(); }, [handleDeepLink]);
  // Signed in, profile not here yet. Showing LoginScreen in this window is
  // what "it logs me out when I close the app" actually was: the session is
  // valid, `screen` simply never moved off its initial "login" before the
  // first-route watchdog cleared authLoading. Say what is happening instead,
  // and offer a way out so a profile that never arrives cannot trap anyone.
  if (!splashVisible && sessionRestoring && renderedScreen === 'login') {
    return <SafeAreaView style={styles.app} edges={['top', 'bottom']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={styles.restoring}>
        {!profileFatal && <ActivityIndicator size="large" color={colors.primary} />}
        <Text style={styles.restoringText}>
          {profileFatal
            ? 'Your profile could not be loaded. This account may not be active.'
            : 'Restoring your session...'}
        </Text>
        {!!profileFatal && <Text style={styles.restoringDetail} selectable>{profileFatal}</Text>}
        <TouchableOpacity onPress={logout} accessibilityRole="button">
          <Text style={styles.restoringLink}>Log out instead</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>;
  }
  if (splashVisible) return <SafeAreaView style={styles.app} edges={['top', 'bottom']}><StatusBar style={isDark ? 'light' : 'dark'} /><AnimatedSplash ready={!authLoading} onFinished={handleSplashFinished} /></SafeAreaView>;
  return <SafeAreaView style={styles.app} edges={['top', 'bottom']}><StatusBar style={isDark ? 'light' : 'dark'} /><View style={styles.body}>
    {renderedScreen === 'login' && <LoginScreen />}{renderedScreen === 'register' && <RegisterScreen />}{renderedScreen === 'forgotPassword' && <ForgotPasswordScreen />}{renderedScreen === 'deviceVerify' && <DeviceVerifyScreen />}{renderedScreen === 'googlePhone' && <GooglePhoneScreen />}{renderedScreen === 'customerHome' && <CustomerHomeScreen />}{renderedScreen === 'service' && <ServiceScreen />}{renderedScreen === 'dealerHome' && <DealerHomeScreen />}{renderedScreen === 'resellerHome' && <ResellerHomeScreen />}{renderedScreen === 'adminHome' && ((profile?.role === 'admin' || profile?.role === 'superadmin') && !adminViewingSection ? <AdminFeaturesScreen /> : <AdminHomeScreen />)}{renderedScreen === 'staffHome' && <StaffHomeScreen />}{renderedScreen === 'webview' && <WebViewScreen />}{renderedScreen === 'buspicker' && <BusPickerScreen />}{renderedScreen === 'support' && <SupportScreen />}{renderedScreen === 'help' && <HelpScreen />}{renderedScreen === 'adminSupport' && <AdminSupportScreen />}{renderedScreen === 'history' && <HistoryScreen />}{renderedScreen === 'topup' && <TopUpScreen />}{renderedScreen === 'superAdminTopup' && <SuperAdminTopUpScreen />}{renderedScreen === 'settings' && <SettingsScreen />}{renderedScreen === 'printer' && <PrinterScreen />}
      {renderedScreen === 'rechargePin' && <RechargePinScreen />}{renderedScreen === 'profile' && <ProfileScreen />}{renderedScreen === 'myAccount' && <MyAccountScreen />}{renderedScreen === 'reports' && <ReportsScreen />}{renderedScreen === 'ledger' && <LedgerScreen />}{renderedScreen === 'invoices' && <InvoicesScreen />}{renderedScreen === 'tileLabels' && <TileLabelsScreen />}{renderedScreen === 'walletFunding' && <WalletFundingScreen />}{renderedScreen === 'userManagement' && <UserManagementScreen />}{renderedScreen === 'transferPoints' && <TransferPointsScreen />}{renderedScreen === 'notifications' && <NotificationsScreen />}{renderedScreen === 'verifyIdentity' && <VerifyIdentityScreen />}{renderedScreen === 'verificationManagement' && <VerificationManagementScreen />}{renderedScreen === 'adminAnalytics' && <AdminAnalyticsScreen />}{renderedScreen === 'myDocuments' && <MyDocumentsScreen />}{renderedScreen === 'notepad' && <NotepadScreen />}{renderedScreen === 'addNote' && <AddNoteScreen />}{renderedScreen === 'noteDetail' && <NoteDetailScreen />}{renderedScreen === 'moreFeatures' && <MoreFeaturesScreen />}{renderedScreen === 'adminFeatures' && <AdminFeaturesScreen />}{renderedScreen === 'tierPromotions' && <TierPromotionsScreen />}{renderedScreen === 'apiProviderManagement' && <ApiProviderManagementScreen />}{renderedScreen === 'reconcileTransactions' && <ReconcileTransactionsScreen />}{renderedScreen === 'dealerFeatures' && <DealerFeaturesScreen />}{renderedScreen === 'resellerFeatures' && <ResellerFeaturesScreen />}{renderedScreen === 'featureAccess' && <FeatureAccessScreen />}{renderedScreen === 'gridManagement' && <GridManagementScreen />}{renderedScreen === 'webviewManagement' && <WebviewManagementScreen />}{renderedScreen === 'adFeatureControls' && <AdFeatureControlsScreen />}{renderedScreen === 'adAnalytics' && <AdAnalyticsScreen />}{renderedScreen === 'bannerManagement' && <BannerManagementScreen />}{renderedScreen === 'advertiserManagement' && <AdvertiserManagementScreen />}{renderedScreen === 'advertiserDetail' && <AdvertiserDetailScreen />}{renderedScreen === 'adPackagesManagement' && <AdPackagesManagementScreen />}{renderedScreen === 'adPaymentsManagement' && <AdPaymentsManagementScreen />}{renderedScreen === 'trustedDevices' && <TrustedDevicesScreen />}{renderedScreen === 'documentType' && <DocumentTypeScreen />}{renderedScreen === 'addDocument' && <AddDocumentScreen />}{renderedScreen === 'documentDetails' && <DocumentDetailsScreen />}{renderedScreen === 'documentViewer' && <DocumentViewerScreen />}{renderedScreen === 'salaryDashboard' && <SalaryDashboardScreen />}{renderedScreen === 'salarySettings' && <SalarySettingsScreen />}{renderedScreen === 'salaryCalculator' && <SalaryCalculatorScreen />}{renderedScreen === 'salaryWorkLog' && <WorkLogScreen />}{renderedScreen === 'salaryReports' && <SalaryReportsScreen />}{renderedScreen === 'salaryMonthlySummary' && <MonthlySummaryScreen />}{renderedScreen === 'salaryHistory' && <SalaryHistoryScreen />}{renderedScreen === 'createPayslip' && <CreatePayslipScreen />}{renderedScreen === 'payslipHistory' && <PayslipHistoryScreen />}{renderedScreen === 'payslipDetails' && <PayslipDetailsScreen />}
  </View>{NAV_SCREENS.includes(renderedScreen) && <BottomNav />}<RatePopup /><ResultModal /><Sidebar /><AppAlertHost /><UpdateGate /><SecurityPinGate /><AppLockScreen /><BiometricOptInPrompt /><WebSignInApprovalPrompt /></SafeAreaView>;
}
export default function App() { return <SafeAreaProvider><LanguageProvider><AppProvider><ThemeProvider><ErrorBoundary><Root /></ErrorBoundary></ThemeProvider></AppProvider></LanguageProvider></SafeAreaProvider>; }
function createStyles(colors) {
  return StyleSheet.create({
    app: { flex: 1, backgroundColor: colors.bg },
    body: { flex: 1 },
    restoring: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
    restoringText: { marginTop: 18, fontSize: 15, color: colors.text, textAlign: 'center' },
    restoringDetail: { marginTop: 10, fontSize: 12, color: '#888', textAlign: 'center' },
    restoringLink: { marginTop: 28, paddingVertical: 8, fontSize: 13, color: colors.primary, fontWeight: '600' },
  });
}