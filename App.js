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
import ChatHubScreen from './src/screens/ChatHubScreen';
import DirectChatListScreen from './src/screens/DirectChatListScreen';
import LockedChatsScreen from './src/screens/LockedChatsScreen';
import AddContactScreen from './src/screens/AddContactScreen';
import QRScanScreen from './src/screens/QRScanScreen';
import MyQRCodeScreen from './src/screens/MyQRCodeScreen';
import FriendsListScreen from './src/screens/FriendsListScreen';
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
import GroupListScreen from './src/screens/GroupListScreen';
import NewGroupScreen from './src/screens/NewGroupScreen';
import CreateRoomScreen from './src/screens/CreateRoomScreen';
import RoomSettingsScreen from './src/screens/RoomSettingsScreen';
import CallScreen from './src/screens/CallScreen';
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
  // Splash stays mounted a moment after authLoading flips false so it can
  // run its "Ready" check + fade-out instead of the app snapping in.
  const [splashVisible, setSplashVisible] = useState(true);

  // onFinished (below) fires from inside an Animated .start() callback, on
  // the same tick React is still settling the PRIOR screen transition
  // (auth/session resolving into a specific `screen` value - see
  // AppContext.js's doLogin). For fast logins this timing is harmless, but
  // slower logins (admin/superadmin: extra checkDeviceSession/MFA
  // round-trips before `screen` settles - see functions/deviceSessionService.js)
  // widen the window enough that unmounting AnimatedSplash and mounting
  // the real screen tree can land in the same Fiber commit as that other
  // still-in-flight state update, which is the likely cause of an
  // intermittent "Text strings must be rendered within a <Text> component"
  // crash observed specifically on superadmin login (chat history
  // 2026-09-08) - not reproduced by static review of any single screen's
  // JSX, consistent with a timing/commit-order issue rather than a fixed
  // bad value. Deferring this one setState to its own macrotask (0ms
  // setTimeout, not requestAnimationFrame - this needs to run AFTER
  // React's current commit finishes, not just before the next paint)
  // ensures splash-teardown and whatever `screen` transition is already
  // pending never get batched into the same commit.
  const handleSplashFinished = () => {
    setTimeout(() => setSplashVisible(false), 0);
  };

  // Handles mysheba://listing/<id> - tapped from the "Open in App" button
  // on the mysheba.top preview page, or any other mysheba:// link. Covers
  // both cases: the link launching the app cold (getInitialURL) and the
  // link arriving while the app is already running (the 'url' event).
  // handleDeepLink itself (see AppContext.js) decides whether to navigate
  // immediately or queue until auth/profile are ready.
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
        {screen === 'login' && <LoginScreen />}
        {screen === 'register' && <RegisterScreen />}
        {screen === 'forgotPassword' && <ForgotPasswordScreen />}
        {screen === 'deviceVerify' && <DeviceVerifyScreen />}
        {screen === 'googlePhone' && <GooglePhoneScreen />}
        {screen === 'customerHome' && <CustomerHomeScreen />}
        {screen === 'service' && <ServiceScreen />}
        {screen === 'dealerHome' && <DealerHomeScreen />}
        {screen === 'resellerHome' && <ResellerHomeScreen />}
        {screen === 'adminHome' && <AdminHomeScreen />}
        {screen === 'webview' && <WebViewScreen />}
        {screen === 'buspicker' && <BusPickerScreen />}
        {screen === 'support' && <SupportScreen />}
        {screen === 'help' && <HelpScreen />}
        {screen === 'adminSupport' && <AdminSupportScreen />}
        {screen === 'history' && <HistoryScreen />}
        {screen === 'topup' && <TopUpScreen />}
        {screen === 'superAdminTopup' && <SuperAdminTopUpScreen />}
        {screen === 'chat' && <ChatScreen />}
        {screen === 'chatList' && <ChatListScreen />}
        {screen === 'chatHub' && <ChatHubScreen />}
        {screen === 'directChatList' && <DirectChatListScreen />}
        {screen === 'lockedChats' && <LockedChatsScreen />}
        {screen === 'addContact' && <AddContactScreen />}
        {screen === 'qrScan' && <QRScanScreen />}
        {screen === 'myQrCode' && <MyQRCodeScreen />}
        {screen === 'friendsList' && <FriendsListScreen />}
        {screen === 'settings' && <SettingsScreen />}
        {screen === 'callSettings' && <CallSettingsScreen />}
        {screen === 'ringtonePicker' && <RingtonePickerScreen />}
        {screen === 'profile' && <ProfileScreen />}
        {screen === 'myAccount' && <MyAccountScreen />}
        {screen === 'reports' && <ReportsScreen />}
        {screen === 'userManagement' && <UserManagementScreen />}
        {screen === 'marketplaceModeration' && <MarketplaceModerationScreen />}
        {screen === 'chatReports' && <ChatReportsScreen />}
        {screen === 'investigateChat' && <InvestigateChatScreen />}
        {screen === 'transferPoints' && <TransferPointsScreen />}
        {screen === 'gamePoints' && <GamePointsScreen />}
        {screen === 'gamePointsTransfer' && <GamePointsTransferScreen />}
        {screen === 'gamePointsGift' && <GamePointsGiftScreen />}
        {screen === 'groupList' && <GroupListScreen />}
        {screen === 'newGroup' && <NewGroupScreen />}
        {screen === 'createRoom' && <CreateRoomScreen />}
        {screen === 'roomSettings' && <RoomSettingsScreen />}
        {screen === 'groupSettings' && <GroupSettingsScreen />}
        {screen === 'call' && <CallScreen />}
        {screen === 'notifications' && <NotificationsScreen />}
        {(screen === 'marketplaceHome' || screen === 'accommodationHome' || screen === 'roomSharingHome' || screen === 'servicesHome' || screen === 'communityHome') && <MarketplaceHubScreen screen={screen} />}
        {screen === 'marketplaceCreateListing' && <CreateListingScreen />}
        {screen === 'marketplaceMyListings' && <MyListingsScreen />}
        {screen === 'marketplaceMyReviews' && <MyReviewsScreen />}
        {screen === 'marketplaceListingDetail' && <ListingDetailScreen />}
        {screen === 'accommodationCreateProperty' && <CreatePropertyScreen />}
        {screen === 'accommodationMyProperties' && <MyPropertiesScreen />}
        {screen === 'accommodationPropertyDetail' && <PropertyDetailScreen />}
        {screen === 'roomSharingCreateRequest' && <CreateRoommateRequestScreen />}
        {screen === 'roomSharingMyRequests' && <MyRoommateRequestsScreen />}
        {screen === 'roomSharingRequestDetail' && <RoommateRequestDetailScreen />}
        {screen === 'servicesCreateProvider' && <CreateServiceScreen />}
        {screen === 'servicesMyServices' && <MyServicesScreen />}
        {screen === 'servicesProviderDetail' && <ServiceProviderDetailScreen />}
        {screen === 'communityCreatePost' && <CreateCommunityPostScreen />}
        {screen === 'communityMyPosts' && <MyCommunityPostsScreen />}
        {screen === 'communityPostDetail' && <CommunityPostDetailScreen />}
        {screen === 'socialFeed' && <SocialFeedScreen />}
        {screen === 'createSocialPost' && <CreateSocialPostScreen />}
        {screen === 'socialPostDetail' && <SocialPostDetailScreen />}
        {screen === 'marketplaceSearch' && <MarketplaceSearchScreen />}
        {screen === 'verifyIdentity' && <VerifyIdentityScreen />}
        {screen === 'verificationManagement' && <VerificationManagementScreen />}
        {screen === 'adminAnalytics' && <AdminAnalyticsScreen />}
        {screen === 'businessProfile' && <BusinessProfileScreen />}
        {screen === 'contactProfile' && <ContactProfileScreen />}
        {screen === 'adminBusinessManagement' && <AdminBusinessManagementScreen />}
        {screen === 'myDocuments' && <MyDocumentsScreen />}
        {screen === 'notepad' && <NotepadScreen />}
        {screen === 'addNote' && <AddNoteScreen />}
        {screen === 'noteDetail' && <NoteDetailScreen />}
        {screen === 'moreFeatures' && <MoreFeaturesScreen />}
        {screen === 'adminFeatures' && <AdminFeaturesScreen />}
        {screen === 'tierPromotions' && <TierPromotionsScreen />}
        {screen === 'apiProviderManagement' && <ApiProviderManagementScreen />}
        {screen === 'dealerFeatures' && <DealerFeaturesScreen />}
        {screen === 'resellerFeatures' && <ResellerFeaturesScreen />}
        {screen === 'featureAccess' && <FeatureAccessScreen />}
        {screen === 'adFeatureControls' && <AdFeatureControlsScreen />}
        {screen === 'adAnalytics' && <AdAnalyticsScreen />}
        {screen === 'bannerManagement' && <BannerManagementScreen />}
        {screen === 'advertiserManagement' && <AdvertiserManagementScreen />}
        {screen === 'advertiserDetail' && <AdvertiserDetailScreen />}
        {screen === 'adPackagesManagement' && <AdPackagesManagementScreen />}
        {screen === 'adPaymentsManagement' && <AdPaymentsManagementScreen />}
        {screen === 'trustedDevices' && <TrustedDevicesScreen />}
        {screen === 'documentType' && <DocumentTypeScreen />}
        {screen === 'addDocument' && <AddDocumentScreen />}
        {screen === 'documentDetails' && <DocumentDetailsScreen />}
        {screen === 'documentViewer' && <DocumentViewerScreen />}
        {screen === 'salaryDashboard' && <SalaryDashboardScreen />}
        {screen === 'salarySettings' && <SalarySettingsScreen />}
        {screen === 'salaryCalculator' && <SalaryCalculatorScreen />}
        {screen === 'salaryWorkLog' && <WorkLogScreen />}
        {screen === 'salaryReports' && <SalaryReportsScreen />}
        {screen === 'salaryMonthlySummary' && <MonthlySummaryScreen />}
        {screen === 'salaryHistory' && <SalaryHistoryScreen />}
        {screen === 'createPayslip' && <CreatePayslipScreen />}
        {screen === 'payslipHistory' && <PayslipHistoryScreen />}
        {screen === 'payslipDetails' && <PayslipDetailsScreen />}
      </View>

      {(screen === 'customerHome' || screen === 'dealerHome' || screen === 'resellerHome' || screen === 'adminHome' || screen === 'support' || screen === 'help' || screen === 'adminSupport' || screen === 'history' || screen === 'topup' || screen === 'superAdminTopup' || screen === 'gamePoints' || screen === 'chatHub' || screen === 'profile' || screen === 'settings' || screen === 'myAccount' || screen === 'moreFeatures' || screen === 'adminFeatures' || screen === 'dealerFeatures' || screen === 'resellerFeatures' || screen === 'notifications' || screen === 'marketplaceHome' || screen === 'accommodationHome' || screen === 'roomSharingHome' || screen === 'servicesHome' || screen === 'communityHome') && <BottomNav />}

      {/* Global overlays - mirror #ratePopup and #resultModal from the original */}
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
