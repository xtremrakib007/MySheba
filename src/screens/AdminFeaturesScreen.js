import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import AppHeader from '../components/AppHeader';
import WalletCard from '../components/WalletCard';
import ControlCenterBanner from '../components/ControlCenterBanner';
import FeatureGrid from '../components/FeatureGrid';
import PromptModal from '../components/PromptModal';
import * as ratesService from '../firebase/ratesService';
import * as gridManagementService from '../firebase/gridManagementService';

const CATEGORIES = [
  { key: 'operations', icon: '⚙️', bg: '#E3F2FD', name: 'Operations' },
  { key: 'finance', icon: '💰', bg: '#E8F5E9', name: 'Finance' },
  { key: 'users', icon: '👥', bg: '#E0F7FA', name: 'Users & KYC' },
  { key: 'system', icon: '🛡️', bg: '#EDE7F6', name: 'System Control' },
];

const OPERATIONS = [
  { key: 'all', icon: '📋', bg: '#E3F2FD', name: 'Transactions' },
  { key: 'pending', icon: '⏳', bg: '#FFF8E1', name: 'Pending' },
  { key: 'inquiries', icon: '📝', bg: '#E8EAF6', name: 'Inquiries' },
  { key: 'topups', icon: '💳', bg: '#E8F5E9', name: 'Top-Ups' },
  { key: 'support', icon: '🎧', bg: '#E0F2F1', name: 'Support' },
  { key: 'adminAnalytics', icon: '📊', bg: '#FFF3E0', name: 'Analytics' },
];
const FINANCE = [
  { key: 'rates', icon: '💱', bg: '#F3E5F5', name: 'Rates' },
  { key: 'pricing', icon: '🏷️', bg: '#FFF3E0', name: 'Pricing' },
  { key: 'payments', icon: '💳', bg: '#E1F5FE', name: 'Payments' },
  { key: 'transferPoints', icon: '↔️', bg: '#E8F5E9', name: 'Transfers' },
];
const USERS = [
  { key: 'userManagement', icon: '👥', bg: '#E3F2FD', name: 'Users' },
  { key: 'verificationManagement', icon: '🪪', bg: '#E0F7FA', name: 'KYC Verification' },
];
// Which capability opens each hub item (any one is enough). Staff access is
// role defaults + per-user overrides (accessControlService); a superadmin
// has every capability.
const CAPABILITY_FOR = {
  all: ['orders', 'finance'], pending: ['orders'], inquiries: ['support'], topups: ['finance'],
  support: ['support'], adminAnalytics: ['reports'],
  rates: ['settings'], pricing: ['settings'], payments: ['settings'], categories: ['settings'], banners: ['settings'],
  transferPoints: ['finance'],
  userManagement: ['users'], verificationManagement: ['users'],
  announcements: ['support'],
};

const SYSTEM = [
  { key: 'featureAccess', icon: '🔐', bg: '#EDE7F6', name: 'Feature Access' },
  { key: 'gridManagement', icon: '🧩', bg: '#E0F7FA', name: 'Grid Management' },
  { key: 'banners', icon: '🖼️', bg: '#FFF0F0', name: 'Banners' },
  { key: 'announcements', icon: '📣', bg: '#E0F7FA', name: 'Announcements' },
  { key: 'apiManagement', icon: '🔌', bg: '#E0F7FA', name: 'API Management' },
];

const MOBILE_RATE_FIELDS = [{ key: 'mobileBanking', label: 'Mobile Banking — 1 MYR = BDT' }];
const REMITTANCE_RATE_FIELDS = [
  { key: 'remittanceFee', label: 'Remittance Transfer Fee — MYR' },
  { key: 'remittanceBD_ACC', label: 'Remittance BDT — Bank Account' },
  { key: 'remittanceBD_CASH', label: 'Remittance BDT — Cash Pickup' },
  { key: 'remittanceNP', label: 'Remittance NPR' }, { key: 'remittancePK', label: 'Remittance PKR' },
  { key: 'remittancePH', label: 'Remittance PHP' }, { key: 'remittanceLK', label: 'Remittance LKR' },
  { key: 'remittanceIN', label: 'Remittance INR' }, { key: 'remittanceID', label: 'Remittance IDR' },
  { key: 'remittanceMM', label: 'Remittance MMK' },
];
const RECHARGE_RATE_FIELDS = [
  { key: 'rechargeBD', label: 'Recharge/Internet — BDT' }, { key: 'rechargeIN', label: 'Recharge/Internet — INR' },
  { key: 'rechargeNP', label: 'Recharge/Internet — NPR' }, { key: 'rechargeID', label: 'Recharge/Internet — IDR' },
  { key: 'rechargePK', label: 'Recharge/Internet — PKR' }, { key: 'rechargeMM', label: 'Recharge/Internet — MMK' },
  { key: 'rechargePH', label: 'Recharge/Internet — PHP' }, { key: 'rechargeKH', label: 'Recharge/Internet — KHR' },
];

export default function AdminFeaturesScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { profile, goBackOrHome, setScreen, openSidebar, dealerTxs, inquiries, topups, setAdminTab, setAdminViewingSection, rates, gridManagement, can } = useApp();
  const [section, setSection] = useState(null);
  const [rateView, setRateView] = useState(false);
  const [editRateKey, setEditRateKey] = useState(null);
  const isSuperadmin = profile?.role === 'superadmin';

  const allow = (items) => items.filter((item) => {
    const gridKey = item.key === 'all' ? 'history' : item.key;
    if (gridKey === 'gridManagement') return isSuperadmin;
    if (!gridManagementService.isGridActive(gridManagement, gridKey)) return false;
    if (item.key === 'featureAccess') return isSuperadmin;
    const need = CAPABILITY_FOR[item.key];
    return need ? need.some((cap) => can(cap)) : isSuperadmin;
  });
  const badges = {
    pending: dealerTxs.filter((t) => t.status === 'pending').length || undefined,
    inquiries: inquiries.filter((i) => (i.status || 'new') === 'new').length || undefined,
    topups: topups.filter((t) => t.status === 'pending').length || undefined,
  };
  const openItem = (key) => {
    if (key === 'rates') { setRateView(true); return; }
    if (key === 'gridManagement') { setScreen('gridManagement'); return; }
    if (key === 'apiManagement') { setScreen('apiProviderManagement'); return; }
    setAdminTab(key); setAdminViewingSection(true); setScreen('adminHome');
  };
  const itemsForSection = () => {
    let items = section === 'operations' ? OPERATIONS : section === 'finance' ? FINANCE : section === 'users' ? USERS : SYSTEM;
    if (section === 'system' && !isSuperadmin) return [];
    return allow(items).map((item) => ({ ...item, badge: badges[item.key] }));
  };
  const saveRate = async (value) => {
    const key = editRateKey; setEditRateKey(null); const num = Number(value);
    if (!key || !Number.isFinite(num) || num <= 0) return;
    try { await ratesService.updateRate(key, num); } catch (e) {}
  };
  const renderRateRows = (fields) => fields.map((field) => (
    <View key={field.key} style={styles.rateRow}>
      <Text style={styles.rateLabel}>{field.label}</Text><Text style={styles.rateValue}>{rates[field.key] ?? '—'}</Text>
      <TouchableOpacity style={styles.editBtn} onPress={() => setEditRateKey(field.key)}><Text style={styles.editBtnText}>Edit</Text></TouchableOpacity>
    </View>
  ));

  if (rateView) {
    return <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.header}>
        <HeaderDecor /><TouchableOpacity style={styles.backBtn} onPress={() => setRateView(false)}><Text style={styles.backText}>←</Text></TouchableOpacity>
        <View style={styles.headerTitleWrap}><Text style={styles.headerTitle}>{isSuperadmin ? 'Superadmin Rate Management' : 'Admin Rate Management'}</Text></View>
        <TouchableOpacity style={styles.menuBtn} onPress={openSidebar} accessibilityLabel="Open menu"><Text style={styles.menuText}>☰</Text></TouchableOpacity>
      </LinearGradient>
      <ScrollView contentContainerStyle={styles.rateContent}>
        <View style={styles.infoCard}><Text style={styles.infoTitle}>Service-specific rates</Text><Text style={styles.infoText}>Mobile Banking, Remittance, and Recharge/Internet use separate rate tables.</Text></View>
        <View style={styles.card}><Text style={styles.cardTitle}>📱 Mobile Banking</Text>{renderRateRows(MOBILE_RATE_FIELDS)}</View>
        <View style={styles.card}><Text style={styles.cardTitle}>💸 Remittance</Text>{renderRateRows(REMITTANCE_RATE_FIELDS)}</View>
        {isSuperadmin && <View style={styles.card}><Text style={styles.cardTitle}>🔄 Recharge / Internet</Text>{renderRateRows(RECHARGE_RATE_FIELDS)}</View>}
        {!isSuperadmin && <View style={styles.lockedCard}><Text style={styles.lockedTitle}>🔒 Recharge / Internet rates</Text><Text style={styles.infoText}>Superadmin controls these rates.</Text></View>}
      </ScrollView>
      <PromptModal visible={!!editRateKey} title="New rate value:" placeholder="e.g. 30.50" onSubmit={saveRate} onCancel={() => setEditRateKey(null)} />
    </View>;
  }

  if (section) {
    const category = CATEGORIES.find((x) => x.key === section);
    return <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.header}>
        <HeaderDecor /><TouchableOpacity style={styles.backBtn} onPress={() => setSection(null)}><Text style={styles.backText}>←</Text></TouchableOpacity>
        <View style={styles.headerTitleWrap}><Text style={styles.headerTitle}>{category?.name || 'Management'}</Text></View>
        <TouchableOpacity style={styles.menuBtn} onPress={openSidebar} accessibilityLabel="Open menu"><Text style={styles.menuText}>☰</Text></TouchableOpacity>
      </LinearGradient>
      <ScrollView contentContainerStyle={styles.gridPage}><FeatureGrid items={itemsForSection()} onPress={openItem} /></ScrollView>
    </View>;
  }

  // The staff landing the mockup draws: shared header, the Control Center
  // banner as the way into management, the balance card, then the section
  // grid. The welcome card it replaces only restated what the banner says,
  // and pointed at a hamburger this header no longer shows.
  const balance = profile?.balance ?? profile?.walletBalance ?? profile?.wallet?.balance ?? 0;
  return <View style={styles.screen}>
    <AppHeader onPressRole={openSidebar} />
    <ScrollView contentContainerStyle={styles.homeContent}>
      <ControlCenterBanner
        title={isSuperadmin ? 'Superadmin Control Center' : 'Admin Control Center'}
        subtitle={isSuperadmin ? 'Full system access and governance.' : 'Manage operations, users, finance and more.'}
        icon={isSuperadmin ? '✦' : '◆'}
        onPress={() => setSection(isSuperadmin ? 'system' : 'operations')}
      />
      <WalletCard balance={balance} variant="surface" onAddMoney={() => setScreen('superAdminTopup')} onTransfer={() => setScreen('transferPoints')} />
      <FeatureGrid items={CATEGORIES.filter((x) => x.key !== 'system' || isSuperadmin)} onPress={setSection} />
    </ScrollView>
  </View>;
}

function createStyles(colors) { return StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.bg}, header:{flexDirection:'row',alignItems:'center',gap:10,padding:12,backgroundColor:colors.primary,overflow:'hidden'},
  backBtn:{padding:4},backText:{color:'white',fontSize:22},headerTitleWrap:{flex:1,minWidth:0},headerTitle:{color:'white',fontWeight:'800',fontSize:16},headerSub:{color:'rgba(255,255,255,0.8)',fontSize:11,marginTop:2},
  menuBtn:{width:42,height:42,borderRadius:21,backgroundColor:'rgba(255,255,255,0.18)',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'rgba(255,255,255,0.28)'},menuText:{color:'white',fontSize:23,fontWeight:'800',lineHeight:25},
  homeContent:{padding:14,paddingBottom:30},gridPage:{paddingTop:10,paddingBottom:30},welcomeCard:{backgroundColor:colors.card,borderRadius:16,padding:16,marginBottom:12,borderWidth:1,borderColor:colors.border},
  welcomeTitle:{color:colors.text,fontWeight:'800',fontSize:20,marginBottom:4},welcomeText:{color:colors.textSecondary,fontSize:12,lineHeight:18},rateContent:{padding:14,paddingBottom:30},
  infoCard:{backgroundColor:colors.card,borderRadius:14,padding:14,marginBottom:10,borderWidth:1,borderColor:colors.border},infoTitle:{color:colors.text,fontWeight:'800',fontSize:16,marginBottom:6},infoText:{color:colors.textSecondary,fontSize:12,lineHeight:18},
  card:{backgroundColor:colors.card,borderRadius:14,padding:14,marginBottom:10,borderWidth:1,borderColor:colors.border},cardTitle:{color:colors.text,fontWeight:'800',fontSize:15,marginBottom:4},
  rateRow:{flexDirection:'row',alignItems:'center',paddingVertical:10,borderBottomWidth:1,borderBottomColor:colors.border},rateLabel:{flex:1,color:colors.text,fontSize:12,fontWeight:'600'},rateValue:{color:colors.primary,fontWeight:'800',marginHorizontal:8},
  editBtn:{backgroundColor:colors.primary,paddingVertical:7,paddingHorizontal:13,borderRadius:8},editBtnText:{color:'white',fontSize:11,fontWeight:'700'},lockedCard:{backgroundColor:colors.card,borderRadius:14,padding:14,borderWidth:1,borderColor:colors.border},lockedTitle:{color:colors.text,fontWeight:'800',fontSize:14},
});}