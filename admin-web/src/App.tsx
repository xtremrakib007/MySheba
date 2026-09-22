import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './routes/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ExecutiveDashboardPage from './pages/ExecutiveDashboardPage';
import AlertIntelligencePage from './pages/AlertIntelligencePage';
import AdminActivityCenterPage from './pages/AdminActivityCenterPage';
import AdminInvestigationCenterPage from './pages/AdminInvestigationCenterPage';
import PlatformControlCenterPage from './pages/PlatformControlCenterPage';
import SystemGovernanceCenterPage from './pages/SystemGovernanceCenterPage';
import AdvancedUserOperationsPage from './pages/AdvancedUserOperationsPage';
import FinancialRiskControlsPage from './pages/FinancialRiskControlsPage';
import UserManagementPage from './pages/UserManagementPage';
import UserOperationsPage from './pages/UserOperationsPage';
import OperationsCenterPage from './pages/OperationsCenterPage';
import FeatureAccessPage from './pages/FeatureAccessPage';
import IdentityVerificationPage from './pages/IdentityVerificationPage';
import KycOperationsPage from './pages/KycOperationsPage';
import FraudRiskPage from './pages/FraudRiskPage';
import CommunicationsCenterPage from './pages/CommunicationsCenterPage';
import ServiceOperationsPage from './pages/ServiceOperationsPage';
import WalletSettlementPage from './pages/WalletSettlementPage';
import SupportOperationsPage from './pages/SupportOperationsPage';
import SupportTicketsPage from './pages/SupportTicketsPage';
import SupportMessagesPage from './pages/SupportMessagesPage';
import ChatReportsPage from './pages/ChatReportsPage';
import ReportsPage from './pages/ReportsPage';
import RatesPricingPage from './pages/RatesPricingPage';
import PricingPage from './pages/PricingPage';
import TransactionsPage from './pages/TransactionsPage';
import FinancialControlPage from './pages/FinancialControlPage';
import InquiriesPage from './pages/InquiriesPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import NotificationDeliveryPage from './pages/NotificationDeliveryPage';
import TransferPointsPage from './pages/TransferPointsPage';
import BusinessProfilesPage from './pages/BusinessProfilesPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ToolAccessPage from './pages/ToolAccessPage';
import RolePermissionsPage from './pages/RolePermissionsPage';
import SalarySettingsPage from './pages/SalarySettingsPage';
import BannersPage from './pages/BannersPage';
import CategoriesPage from './pages/CategoriesPage';
import ModuleSubscriptionsPage from './pages/ModuleSubscriptionsPage';
import PaymentSettingsPage from './pages/PaymentSettingsPage';
import PointTopUpPage from './pages/PointTopUpPage';
import RechargePinsPage from './pages/RechargePinsPage';
import DeviceSessionsPage from './pages/DeviceSessionsPage';
import SecurityCenterPage from './pages/SecurityCenterPage';
import GrowthCenterPage from './pages/GrowthCenterPage';
import AuditCompliancePage from './pages/AuditCompliancePage';
import SystemHealthPage from './pages/SystemHealthPage';
import SuperadminRoute from './routes/SuperadminRoute';


// Every navigable path in navConfig.ts, plus the in-app links pages use
// between each other, resolves to exactly one of these routes. Superadmin
// screens sit inside the SuperadminRoute group; ProtectedRoute keeps its own
// list as a second line of defence.
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            {/* Overview */}
            <Route index element={<DashboardPage />} />
            <Route path="executive" element={<ExecutiveDashboardPage />} />
            <Route path="alerts" element={<AlertIntelligencePage />} />
            <Route path="investigation" element={<AdminInvestigationCenterPage />} />

            {/* Operations */}
            <Route path="operations" element={<OperationsCenterPage />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="users" element={<UserManagementPage />} />
            <Route path="user-operations" element={<UserOperationsPage />} />
            <Route path="advanced-user-operations" element={<AdvancedUserOperationsPage />} />
            <Route path="kyc-operations" element={<KycOperationsPage />} />
            <Route path="support-operations" element={<SupportOperationsPage />} />
            <Route path="service-operations" element={<ServiceOperationsPage />} />
            <Route path="inquiries" element={<InquiriesPage />} />

            {/* Users & access */}
            <Route path="transfer-points" element={<TransferPointsPage />} />
            <Route path="feature-access" element={<FeatureAccessPage />} />
            <Route path="business-profiles" element={<BusinessProfilesPage />} />

            {/* Verification & moderation */}
            <Route path="verification" element={<IdentityVerificationPage />} />
            <Route path="security" element={<SecurityCenterPage />} />
            <Route path="chat-reports" element={<ChatReportsPage />} />

            {/* Finance & risk */}
            <Route path="financial" element={<FinancialControlPage />} />
            <Route path="wallet-settlement" element={<WalletSettlementPage />} />
            <Route path="fraud-risk" element={<FraudRiskPage />} />

            {/* Support & communications */}
            <Route path="support" element={<SupportTicketsPage />} />
            <Route path="support-messages" element={<SupportMessagesPage />} />
            <Route path="announcements" element={<AnnouncementsPage />} />
            <Route path="communications" element={<CommunicationsCenterPage />} />
            <Route path="notification-delivery" element={<NotificationDeliveryPage />} />
            {/* Older links point at /notifications for the same screen. */}
            <Route path="notifications" element={<Navigate to="/notification-delivery" replace />} />

            {/* Analytics & reports */}
            <Route path="reports" element={<ReportsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="growth" element={<GrowthCenterPage />} />

            {/* Platform configuration */}
            <Route path="config">
              <Route path="rates" element={<RatesPricingPage />} />
              <Route path="pricing" element={<PricingPage />} />
              <Route path="payments" element={<PaymentSettingsPage />} />
              <Route path="salary" element={<SalarySettingsPage />} />
              <Route path="banners" element={<BannersPage />} />
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="modules" element={<ModuleSubscriptionsPage />} />
            </Route>

            {/* Superadmin governance */}
            <Route element={<SuperadminRoute />}>
              <Route path="governance" element={<SystemGovernanceCenterPage />} />
              <Route path="platform-control" element={<PlatformControlCenterPage />} />
              <Route path="role-permissions" element={<RolePermissionsPage />} />
              <Route path="tool-access" element={<ToolAccessPage />} />
              <Route path="audit" element={<AuditCompliancePage />} />
              <Route path="activity-center" element={<AdminActivityCenterPage />} />
              <Route path="system-health" element={<SystemHealthPage />} />
              <Route path="devices" element={<DeviceSessionsPage />} />
              <Route path="topup" element={<PointTopUpPage />} />
              <Route path="recharge-pins" element={<RechargePinsPage />} />
              <Route path="financial-risk" element={<FinancialRiskControlsPage />} />
            </Route>

            {/* Anything else lands back on the dashboard. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
