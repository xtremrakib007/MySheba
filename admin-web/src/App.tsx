import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './routes/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UserManagementPage from './pages/UserManagementPage';
import FeatureAccessPage from './pages/FeatureAccessPage';
import IdentityVerificationPage from './pages/IdentityVerificationPage';
import MarketplaceModerationPage from './pages/MarketplaceModerationPage';
import ChatReportsPage from './pages/ChatReportsPage';
import InvestigateChatPage from './pages/InvestigateChatPage';
import SupportTicketsPage from './pages/SupportTicketsPage';
import SupportMessagesPage from './pages/SupportMessagesPage';
import ReportsPage from './pages/ReportsPage';
import RatesPricingPage from './pages/RatesPricingPage';
import PricingPage from './pages/PricingPage';
import TransactionsPage from './pages/TransactionsPage';
import FinancialControlPage from './pages/FinancialControlPage';
import InquiriesPage from './pages/InquiriesPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import TransferPointsPage from './pages/TransferPointsPage';
import BusinessProfilesPage from './pages/BusinessProfilesPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ToolAccessPage from './pages/ToolAccessPage';
import SalarySettingsPage from './pages/SalarySettingsPage';
import BannersPage from './pages/BannersPage';
import CategoriesPage from './pages/CategoriesPage';
import ModuleSubscriptionsPage from './pages/ModuleSubscriptionsPage';
import PaymentSettingsPage from './pages/PaymentSettingsPage';
import PointTopUpPage from './pages/PointTopUpPage';
import DeviceSessionsPage from './pages/DeviceSessionsPage';
import SecurityCenterPage from './pages/SecurityCenterPage';
import SuperadminRoute from './routes/SuperadminRoute';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/financial" element={<FinancialControlPage />} />
            <Route path="/inquiries" element={<InquiriesPage />} />
            <Route path="/announcements" element={<AnnouncementsPage />} />
            <Route path="/transfer-points" element={<TransferPointsPage />} />
            <Route path="/business-profiles" element={<BusinessProfilesPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/security" element={<SecurityCenterPage />} />
            <Route path="/users" element={<UserManagementPage />} />
            <Route path="/feature-access" element={<FeatureAccessPage />} />
            <Route path="/verification" element={<IdentityVerificationPage />} />
            <Route path="/marketplace-moderation" element={<MarketplaceModerationPage />} />
            <Route path="/chat-reports" element={<ChatReportsPage />} />
            <Route path="/support" element={<SupportTicketsPage />} />
            <Route path="/support-messages" element={<SupportMessagesPage />} />
            <Route path="/support-messages/:chatId" element={<SupportMessagesPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/config/rates" element={<RatesPricingPage />} />
            <Route path="/config/pricing" element={<PricingPage />} />
            <Route path="/config/salary" element={<SalarySettingsPage />} />
            <Route path="/config/banners" element={<BannersPage />} />
            <Route path="/config/categories" element={<CategoriesPage />} />
            <Route path="/config/modules" element={<ModuleSubscriptionsPage />} />
            <Route path="/config/payments" element={<PaymentSettingsPage />} />
            <Route element={<SuperadminRoute />}>
              <Route path="/topup" element={<PointTopUpPage />} />
              <Route path="/devices" element={<DeviceSessionsPage />} />
              <Route path="/chat-reports/investigate/:chatId" element={<InvestigateChatPage />} />
              <Route path="/tool-access" element={<ToolAccessPage />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
