import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, View, Platform, Linking } from 'react-native';
// TEMP DIAGNOSTIC: commented out to test whether @notifee/react-native's
// native module is causing the launch crash under RN 0.79 / SDK 53.
// import { ensureCallChannels, registerCallNotificationForegroundHandler } from './src/notifications/callPush';

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
import WebViewScreen from './src/screens/WebViewScreen';
import BusPickerScreen from './src/screens/BusPickerScreen';
import SupportScreen from './src/screens/SupportScreen';
import HelpScreen from './src/screens/HelpScreen';
import AdminSupportScreen from './src/screens/AdminSupportScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import TopUpScreen from './src/screens/TopUpScreen';
import SuperAdminTopUpScreen from './src/screens/SuperAdminTopUpScreen';
import ChatScreen from './src/screens/ChatScreen';
import ChatListScreen from './src/screens/ChatListScreen';
import QRScanScreen from './src/screens/QRScanScreen';
import MyQRCodeScreen from './src/screens/MyQRCodeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import CallSettingsScreen from './src/screens/CallSettingsScreen';
import RingtonePickerScreen from './src/screens/RingtonePickerScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import MyAccountScreen from './src/screens/MyAccountScreen';
import ReportsScreen from './src/screens/ReportsScreen';
import UserManagementScreen from './src/screens/UserManagementScreen';
import MarketplaceModerationScreen from './src/screens/MarketplaceModerationScreen';
import ChatReportsScreen from './src/screens/ChatReportsScreen';
import InvestigateChatScreen from './src/screens/InvestigateChatScreen';
import TransferPointsScreen from './src/screens/TransferPointsScreen';
import GamePointsScreen from './src/screens/GamePointsScreen';
import GamePointsTransferScreen from './src/screens/GamePointsTransferScreen';
import GamePointsGiftScreen from './src/screens/GamePointsGiftScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import MarketplaceHubScreen from './src/screens/MarketplaceHubScreen';
import CreateListingScreen from './src/screens/CreateListingScreen';
import MyListingsScreen from './src/screens/MyListingsScreen';
import MyReviewsScreen from './src/screens/MyReviewsScreen';
import ListingDetailScreen from './src/screens/ListingDetailScreen';
import CreatePropertyScreen from './src/screens/CreatePropertyScreen';
import MyPropertiesScreen from './src/screens/MyPropertiesScreen';
import PropertyDetailScreen from './src/screens/PropertyDetailScreen';
import CreateRoommateRequestScreen from './src/screens/CreateRoommateRequestScreen';
import MyRoommateRequestsScreen from './src/screens/MyRoommateRequestsScreen';
import RoommateRequestDetailScreen from './src/screens/RoommateRequestDetailScreen';
import CreateServiceScreen from './src/screens/CreateServiceScreen';
import MyServicesScreen from './src/screens/MyServicesScreen';
import ServiceProviderDetailScreen from './src/screens/ServiceProviderDetailScreen';
import CreateCommunityPostScreen from './src/screens/CreateCommunityPostScreen';
import MyCommunityPostsScreen from './src/screens/MyCommunityPostsScreen';
import CommunityPostDetailScreen from './src/screens/CommunityPostDetailScreen';
import SocialFeedScreen from './src/screens/SocialFeedScreen';
import CreateSocialPostScreen from './src/screens/CreateSocialPostScreen';
import SocialPostDetailScreen from './src/screens/SocialPostDetailScreen';
import MarketplaceSearchScreen from './src/screens/MarketplaceSearchScreen';
import VerifyIdentityScreen from './src/screens/VerifyIdentityScreen';
import VerificationManagementScreen from './src/screens/VerificationManagementScreen';
import AdminAnalyticsScreen from './src/screens/AdminAnalyticsScreen';
import BusinessProfileScreen from './src/screens/BusinessProfileScreen';
import ContactProfileScreen from './src/screens/ContactProfileScreen';
import GroupSettingsScreen from './src/screens/GroupSettingsScreen';
import AdminBusinessManagementScreen from './src/screens/AdminBusinessManagementScreen';
import MyDocumentsScreen from './src/screens/MyDocumentsScreen';
import NotepadScreen from './src/screens/NotepadScreen';
import AddNoteScreen from './src/screens/AddNoteScreen';
import NoteDetailScreen from './src/screens/NoteDetailScreen';
import MoreFeaturesScreen from './src/screens/MoreFeaturesScreen';
import AdminFeaturesScreen from './src/screens/AdminFeaturesScreen';
import TierPromotionsScreen from './src/screens/TierPromotionsScreen';
import ApiProviderManagementScreen from './src/screens/ApiProviderManagementScreen';
import DealerFeaturesScreen from './src/screens/DealerFeaturesScreen';
import ResellerFeaturesScreen from './src/screens/ResellerFeaturesScreen';
import FeatureAccessScreen from './src/screens/FeatureAccessScreen';
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
import BottomNav from './src/components/BottomNav';
import Sidebar from './src/components/Sidebar';
import IncomingCallModal from './src/components/IncomingCallModal';
import AppAlertHost from './src/components/AppAlertHost';
import SecurityPinGate from './src/components/SecurityPinGate';
import AppLockScreen from './src/components/AppLockScreen';
import BiometricOptInPrompt from './src/components/BiometricOptInPrompt';
import ErrorBoundary from './src/components/ErrorBoundary';
import AnimatedSplash from './src/components/AnimatedSplash';

function Root() {
  const { screen, authLoading, handleDeepLink } = useApp();
  const { colors, isDark } = useTheme();
  const styles = createStyles(colors);
  const [splashVisible, setSplashVisible] = useState(true);
  const [renderedScreen, setRenderedScreen] = useState(screen);

  useEffect(() => {
    if (screen === renderedScreen) return undefined;
    const id = setTimeout(() => setRenderedScreen(screen), 0);
    return () => clearTimeout(id);
  }, [screen, renderedScreen]);

  const handleSplashFinished = () => {
    setTimeout(() => setSplashVisible(false), 0);
  };

  useEffect(() => {
    Linking.getInitialURL().then((url) => { if (url) handleDeepLink(url); }).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, [handleDeepLink]);

  if (splashVisible) {
    return (
      <SafeAreaView style={styles.app} edges={['top', 'bottom']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <AnimatedSplash ready={!authLoading} onFinished={handleSplashFinished} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.app} edges={['top', 'bottom']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={styles.body}>
        {renderedScreen === 'login' && <LoginScreen />}
        {renderedScreen === 'register' && <RegisterScreen />}
        {renderedScreen === 'forgotPassword' && <ForgotPasswordScreen />}
        {renderedScreen === 'deviceVerify' && <DeviceVerifyScreen />}
        {renderedScreen === 'googlePhone' && <GooglePhoneScreen />}
        {renderedScreen === 'customerHome' && <CustomerHomeScreen />}
        {renderedScreen === 'service' && <ServiceScreen />}
        {renderedScreen === 'dealerHome' && <DealerHomeScreen />}
        {renderedScreen === 'resellerHome' && <ResellerHomeScreen />}
        {renderedScreen === 'adminHome' && <AdminHomeScreen />}
        {renderedScreen === 'webview' && <WebViewScreen />}
        {renderedScreen === 'buspicker' && <BusPickerScreen />}
        {renderedScreen === 'support' && <SupportScreen />}
        {renderedScreen === 'help' && <HelpScreen />}
        {renderedScreen === 'adminSupport' && <AdminSupportScreen />}
        {renderedScreen === 'history' && <HistoryScreen />}
        {renderedScreen === 'topup' && <TopUpScreen />}
        {renderedScreen === 'superAdminTopup' && <SuperAdminTopUpScreen />}
        {/* ChatScreen remains only for Support/admin messaging; the customer Chat hub is removed. */}
        {renderedScreen === 'chat' && <ChatScreen />}
        {renderedScreen === 'chatList' && <ChatListScreen />}
        {renderedScreen === 'qrScan' && <QRScanScreen />}
        {renderedScreen === 'myQrCode' && <MyQRCodeScreen />}
        {renderedScreen === 'settings' && <SettingsScreen />}
        {renderedScreen === 'callSettings' && <CallSettingsScreen />}
        {renderedScreen === 'ringtonePicker' && <RingtonePickerScreen />}
        {renderedScreen === 'profile' && <ProfileScreen />}
        {renderedScreen === 'myAccount' && <MyAccountScreen />}
        {renderedScreen === 'reports' && <ReportsScreen />}
        {renderedScreen === 'userManagement' && <UserManagementScreen />}
        {renderedScreen === 'marketplaceModeration' && <MarketplaceModerationScreen />}
        {renderedScreen === 'chatReports' && <ChatReportsScreen />}
        {renderedScreen === 'investigateChat' && <InvestigateChatScreen />}
        {renderedScreen === 'transferPoints' && <TransferPointsScreen />}
        {renderedScreen === 'gamePoints' && <GamePointsScreen />}
        {renderedScreen === 'gamePointsTransfer' && <GamePointsTransferScreen />}
        {renderedScreen === 'gamePointsGift' && <GamePointsGiftScreen />}
        {renderedScreen === 'notifications' && <NotificationsScreen />}
        {(renderedScreen === 'marketplaceHome' || renderedScreen === 'accommodationHome' || renderedScreen === 'roomSharingHome' || renderedScreen === 'servicesHome' || renderedScreen === 'communityHome') && <MarketplaceHubScreen screen={renderedScreen} />}
        {renderedScreen === 'marketplaceCreateListing' && <CreateListingScreen />}
        {renderedScreen === 'marketplaceMyListings' && <MyListingsScreen />}
        {renderedScreen === 'marketplaceMyReviews' && <MyReviewsScreen />}
        {renderedScreen === 'marketplaceListingDetail' && <ListingDetailScreen />}
        {renderedScreen === 'accommodationCreateProperty' && <CreatePropertyScreen />}
        {renderedScreen === 'accommodationMyProperties' && <MyPropertiesScreen />}
        {renderedScreen === 'accommodationPropertyDetail' && <PropertyDetailScreen />}
        {renderedScreen === 'roomSharingCreateRequest' && <CreateRoommateRequestScreen />}
        {renderedScreen === 'roomSharingMyRequests' && <MyRoommateRequestsScreen />}
        {renderedScreen === 'roomSharingRequestDetail' && <RoommateRequestDetailScreen />}
        {renderedScreen === 'servicesCreateProvider' && <CreateServiceScreen />}
        {renderedScreen === 'servicesMyServices' && <MyServicesScreen />}
        {renderedScreen === 'servicesProviderDetail' && <ServiceProviderDetailScreen />}
        {renderedScreen === 'communityCreatePost' && <CreateCommunityPostScreen />}
        {renderedScreen === 'communityMyPosts' && <MyCommunityPostsScreen />}
        {renderedScreen === 'communityPostDetail' && <CommunityPostDetailScreen />}
        {renderedScreen === 'socialFeed' && <SocialFeedScreen />}
        {renderedScreen === 'createSocialPost' && <CreateSocialPostScreen />}
        {renderedScreen === 'socialPostDetail' && <SocialPostDetailScreen />}
        {renderedScreen === 'marketplaceSearch' && <MarketplaceSearchScreen />}
        {renderedScreen === 'verifyIdentity' && <VerifyIdentityScreen />}
        {renderedScreen === 'verificationManagement' && <VerificationManagementScreen />}
        {renderedScreen === 'adminAnalytics' && <AdminAnalyticsScreen />}
        {renderedScreen === 'businessProfile' && <BusinessProfileScreen />}
        {renderedScreen === 'contactProfile' && <ContactProfileScreen />}
        {renderedScreen === 'adminBusinessManagement' && <AdminBusinessManagementScreen />}
        {renderedScreen === 'myDocuments' && <MyDocumentsScreen />}
        {renderedScreen === 'notepad' && <NotepadScreen />}
        {renderedScreen === 'addNote' && <AddNoteScreen />}
        {renderedScreen === 'noteDetail' && <NoteDetailScreen />}
        {renderedScreen === 'moreFeatures' && <MoreFeaturesScreen />}
        {renderedScreen === 'adminFeatures' && <AdminFeaturesScreen />}
        {renderedScreen === 'tierPromotions' && <TierPromotionsScreen />}
        {renderedScreen === 'apiProviderManagement' && <ApiProviderManagementScreen />}
        {renderedScreen === 'dealerFeatures' && <DealerFeaturesScreen />}
        {renderedScreen === 'resellerFeatures' && <ResellerFeaturesScreen />}
        {renderedScreen === 'featureAccess' && <FeatureAccessScreen />}
        {renderedScreen === 'adFeatureControls' && <AdFeatureControlsScreen />}
        {renderedScreen === 'adAnalytics' && <AdAnalyticsScreen />}
        {renderedScreen === 'bannerManagement' && <BannerManagementScreen />}
        {renderedScreen === 'advertiserManagement' && <AdvertiserManagementScreen />}
        {renderedScreen === 'advertiserDetail' && <AdvertiserDetailScreen />}
        {renderedScreen === 'adPackagesManagement' && <AdPackagesManagementScreen />}
        {renderedScreen === 'adPaymentsManagement' && <AdPaymentsManagementScreen />}
        {renderedScreen === 'trustedDevices' && <TrustedDevicesScreen />}
        {renderedScreen === 'documentType' && <DocumentTypeScreen />}
        {renderedScreen === 'addDocument' && <AddDocumentScreen />}
        {renderedScreen === 'documentDetails' && <DocumentDetailsScreen />}
        {renderedScreen === 'documentViewer' && <DocumentViewerScreen />}
        {renderedScreen === 'salaryDashboard' && <SalaryDashboardScreen />}
        {renderedScreen === 'salarySettings' && <SalarySettingsScreen />}
        {renderedScreen === 'salaryCalculator' && <SalaryCalculatorScreen />}
        {renderedScreen === 'salaryWorkLog' && <WorkLogScreen />}
        {renderedScreen === 'salaryReports' && <SalaryReportsScreen />}
        {renderedScreen === 'salaryMonthlySummary' && <MonthlySummaryScreen />}
        {renderedScreen === 'salaryHistory' && <SalaryHistoryScreen />}
        {renderedScreen === 'createPayslip' && <CreatePayslipScreen />}
        {renderedScreen === 'payslipHistory' && <PayslipHistoryScreen />}
        {renderedScreen === 'payslipDetails' && <PayslipDetailsScreen />}
      </View>

      {(renderedScreen === 'customerHome' || renderedScreen === 'dealerHome' || renderedScreen === 'resellerHome' || renderedScreen === 'adminHome' || renderedScreen === 'support' || renderedScreen === 'help' || renderedScreen === 'adminSupport' || renderedScreen === 'history' || renderedScreen === 'topup' || renderedScreen === 'superAdminTopup' || renderedScreen === 'gamePoints' || renderedScreen === 'profile' || renderedScreen === 'settings' || renderedScreen === 'myAccount' || renderedScreen === 'moreFeatures' || renderedScreen === 'adminFeatures' || renderedScreen === 'dealerFeatures' || renderedScreen === 'resellerFeatures' || renderedScreen === 'notifications' || renderedScreen === 'marketplaceHome' || renderedScreen === 'accommodationHome' || renderedScreen === 'roomSharingHome' || renderedScreen === 'servicesHome' || renderedScreen === 'communityHome') && <BottomNav />}

      <RatePopup />
      <ResultModal />
      <Sidebar />
      <IncomingCallModal />
      <AppAlertHost />
      <SecurityPinGate />
      <AppLockScreen />
      <BiometricOptInPrompt />
    </SafeAreaView>
  );
}

export default function App() {
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    // TEMP DIAGNOSTIC: Notifee calls disabled, see import comment above.
    // ensureCallChannels();
    // return registerCallNotificationForegroundHandler();
    return undefined;
  }, []);

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <ThemeProvider>
          <AppProvider>
            <ErrorBoundary>
              <Root />
            </ErrorBoundary>
          </AppProvider>
        </ThemeProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    app: { flex: 1, backgroundColor: colors.bg },
    body: { flex: 1 },
  });
}
