import { BrowserRouter, Route, Routes } from 'react-router-dom';
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
import FeatureAccessPage from './pages/FeatureAccessPage';
import IdentityVerificationPage from './pages/IdentityVerificationPage';
import KycOperationsPage from './pages/KycOperationsPage';
import FraudRiskPage from './pages/FraudRiskPage';
import CommunicationsCenterPage from './pages/CommunicationsCenterPage';
import ServiceOperationsPage from './pages/ServiceOperationsPage';
import NotificationDeliveryPage from './pages/NotificationDeliveryPage';
import WalletSettlementPage from './pages/WalletSettlementPage';
import SupportOperationsPage from './pages/SupportOperationsPage';
import SupportTicketsPage from './pages/SupportTicketsPage';
import SupportMessagesPage from './pages/SupportMessagesPage';
import ReportsPage from './pages/ReportsPage';
import RatesPricingPage from './pages/RatesPricingPage';
import WalletExchangeRatesPage from './pages/WalletExchangeRatesPage';
import PricingPage from './pages/PricingPage';
import TransactionsPage from './pages/TransactionsPage';
import InvoicesPage from './pages/InvoicesPage';
import FinancialControlPage from './pages/FinancialControlPage';
import InquiriesPage from './pages/InquiriesPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import TransferPointsPage from './pages/TransferPointsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ToolAccessPage from './pages/ToolAccessPage';
import RolePermissionsPage from './pages/RolePermissionsPage';
import SalarySettingsPage from './pages/SalarySettingsPage';
import BannersPage from './pages/BannersPage';
import CategoriesPage from './pages/CategoriesPage';
import ModuleSubscriptionsPage from './pages/ModuleSubscriptionsPage';
import PaymentSettingsPage from './pages/PaymentSettingsPage';
import PointTopUpPage from './pages/PointTopUpPage';
import AccessControlPage from './pages/AccessControlPage';
import DeviceSessionsPage from './pages/DeviceSessionsPage';
import SecurityCenterPage from './pages/SecurityCenterPage';
import GrowthCenterPage from './pages/GrowthCenterPage';
import AuditCompliancePage from './pages/AuditCompliancePage';
import SystemHealthPage from './pages/SystemHealthPage';
import SuperadminRoute from './routes/SuperadminRoute';

function AdminRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route index element={<DashboardPage />} />
        <Route path="/executive" element={<ExecutiveDashboardPage />} />
        <Route path="/alerts" element={<AlertIntelligencePage />} />
        <Route path="/investigation" element={<AdminInvestigationCenterPage />} />
        <Route path="/activity" element={<AdminActivityCenterPage />} />
        <Route path="/users" element={<UserManagementPage />} />
        <Route path="/user-operations" element={<AdvancedUserOperationsPage />} />
        <Route path="/verification" element={<IdentityVerificationPage />} />
        <Route path="/kyc-operations" element={<KycOperationsPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/financial" element={<FinancialControlPage />} />
        <Route path="/wallet-settlement" element={<WalletSettlementPage />} />
        <Route path="/fraud-risk" element={<FraudRiskPage />} />
        <Route path="/financial-risk" element={<FinancialRiskControlsPage />} />
        <Route path="/support" element={<SupportTicketsPage />} />
        <Route path="/support/messages" element={<SupportMessagesPage />} />
        <Route path="/support/messages/:chatId" element={<SupportMessagesPage />} />
        <Route path="/support-operations" element={<SupportOperationsPage />} />
        <Route path="/service-operations" element={<ServiceOperationsPage />} />
        <Route path="/announcements" element={<AnnouncementsPage />} />
        <Route path="/communications" element={<CommunicationsCenterPage />} />
        <Route path="/notification-delivery" element={<NotificationDeliveryPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/growth" element={<GrowthCenterPage />} />
        <Route path="/inquiries" element={<InquiriesPage />} />
        <Route path="/transfer-points" element={<TransferPointsPage />} />
        <Route path="/feature-access" element={<FeatureAccessPage />} />
        <Route path="/security" element={<SecurityCenterPage />} />
        <Route path="/config/rates" element={<RatesPricingPage />} />
        <Route element={<SuperadminRoute />}><Route path="/config/wallet-exchange" element={<WalletExchangeRatesPage />} /></Route>
        <Route path="/config/pricing" element={<PricingPage />} />
        <Route path="/config/payments" element={<PaymentSettingsPage />} />
        <Route path="/config/salary" element={<SalarySettingsPage />} />
        <Route path="/config/banners" element={<BannersPage />} />
        <Route path="/config/categories" element={<CategoriesPage />} />
        <Route path="/config/modules" element={<ModuleSubscriptionsPage />} />
        <Route path="/topup" element={<PointTopUpPage />} />
        <Route element={<SuperadminRoute />}>
          <Route path="/governance" element={<SystemGovernanceCenterPage />} />
          <Route path="/platform-control" element={<PlatformControlCenterPage />} />
          <Route path="/access-control" element={<AccessControlPage />} />
          <Route path="/role-permissions" element={<RolePermissionsPage />} />
          <Route path="/tool-access" element={<ToolAccessPage />} />
          <Route path="/audit" element={<AuditCompliancePage />} />
          <Route path="/activity-center" element={<AdminActivityCenterPage />} />
          <Route path="/system-health" element={<SystemHealthPage />} />
          <Route path="/devices" element={<DeviceSessionsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<LoginPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AdminRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
