import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './routes/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import PortalDashboardPage from './pages/PortalDashboardPage';
const ExecutiveDashboardPage = lazy(() => import('./pages/ExecutiveDashboardPage'));
const AlertIntelligencePage = lazy(() => import('./pages/AlertIntelligencePage'));
const AdminActivityCenterPage = lazy(() => import('./pages/AdminActivityCenterPage'));
const AdminInvestigationCenterPage = lazy(() => import('./pages/AdminInvestigationCenterPage'));
const PlatformControlCenterPage = lazy(() => import('./pages/PlatformControlCenterPage'));
const SystemGovernanceCenterPage = lazy(() => import('./pages/SystemGovernanceCenterPage'));
const AdvancedUserOperationsPage = lazy(() => import('./pages/AdvancedUserOperationsPage'));
const FinancialRiskControlsPage = lazy(() => import('./pages/FinancialRiskControlsPage'));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage'));
const FeatureAccessPage = lazy(() => import('./pages/FeatureAccessPage'));
const IdentityVerificationPage = lazy(() => import('./pages/IdentityVerificationPage'));
const KycOperationsPage = lazy(() => import('./pages/KycOperationsPage'));
const FraudRiskPage = lazy(() => import('./pages/FraudRiskPage'));
const CommunicationsCenterPage = lazy(() => import('./pages/CommunicationsCenterPage'));
const ServiceOperationsPage = lazy(() => import('./pages/ServiceOperationsPage'));
const NotificationDeliveryPage = lazy(() => import('./pages/NotificationDeliveryPage'));
const WalletSettlementPage = lazy(() => import('./pages/WalletSettlementPage'));
const SupportOperationsPage = lazy(() => import('./pages/SupportOperationsPage'));
const SupportTicketsPage = lazy(() => import('./pages/SupportTicketsPage'));
const SupportMessagesPage = lazy(() => import('./pages/SupportMessagesPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const RatesPricingPage = lazy(() => import('./pages/RatesPricingPage'));
const WalletExchangeRatesPage = lazy(() => import('./pages/WalletExchangeRatesPage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
const TransactionsPage = lazy(() => import('./pages/TransactionsPage'));
const InvoicesPage = lazy(() => import('./pages/InvoicesPage'));
const FinancialControlPage = lazy(() => import('./pages/FinancialControlPage'));
const InquiriesPage = lazy(() => import('./pages/InquiriesPage'));
const AnnouncementsPage = lazy(() => import('./pages/AnnouncementsPage'));
const TransferPointsPage = lazy(() => import('./pages/TransferPointsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const ToolAccessPage = lazy(() => import('./pages/ToolAccessPage'));
const RolePermissionsPage = lazy(() => import('./pages/RolePermissionsPage'));
const SalarySettingsPage = lazy(() => import('./pages/SalarySettingsPage'));
const BannersPage = lazy(() => import('./pages/BannersPage'));
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'));
const ModuleSubscriptionsPage = lazy(() => import('./pages/ModuleSubscriptionsPage'));
const PaymentSettingsPage = lazy(() => import('./pages/PaymentSettingsPage'));
const ApiProviderManagementPage = lazy(() => import('./pages/ApiProviderManagementPage'));
const PointTopUpPage = lazy(() => import('./pages/PointTopUpPage'));
const AccessControlPage = lazy(() => import('./pages/AccessControlPage'));
const DeviceSessionsPage = lazy(() => import('./pages/DeviceSessionsPage'));
const SecurityCenterPage = lazy(() => import('./pages/SecurityCenterPage'));
const GrowthCenterPage = lazy(() => import('./pages/GrowthCenterPage'));
const AuditCompliancePage = lazy(() => import('./pages/AuditCompliancePage'));
const SystemHealthPage = lazy(() => import('./pages/SystemHealthPage'));
import SuperadminRoute from './routes/SuperadminRoute';
import AdminErrorBoundary from './components/AdminErrorBoundary';

function AdminRoutes() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center text-sm text-slate-500">Loading MySheba Admin…</div>}><Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route index element={<PortalDashboardPage />} />
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
        <Route element={<SuperadminRoute />}><Route path="/config/api-providers" element={<ApiProviderManagementPage />} /></Route>
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
    </Routes></Suspense>
  );
}

export default function App() {
  return (
    <AdminErrorBoundary><BrowserRouter>
      <AuthProvider>
        <AdminRoutes />
      </AuthProvider>
    </BrowserRouter></AdminErrorBoundary>
  );
}
