import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import AppHeader from '../components/AppHeader';
import WalletCard from '../components/WalletCard';
import FeatureGrid from '../components/FeatureGrid';
import { useServiceAction } from '../components/ServiceGrid';
import PromptModal from '../components/PromptModal';
import * as ratesService from '../firebase/ratesService';
import * as gridManagementService from '../firebase/gridManagementService';

const CATEGORIES = [
  { key: 'operations', icon: '⚙️', bg: '#E3F2FD', name: 'Operations' },
  { key: 'finance', icon: '💰', bg: '#E8F5E9', name: 'Finance' },
  { key: 'users', icon: '👥', bg: '#E0F7FA', name: 'Users & KYC' },
  { key: 'system', icon: '🛡️', bg: '#EDE7F6', name: 'System Control' },
];

// The admin landing, as one flat 4-column grid rather than four category
// tiles that each needed a tap before anything useful appeared.
//
// Management first, then the same services every other role gets - an admin
// still sells a top-up and books a bus. `section` opens one of the hubs
// below, `screen` goes straight to a screen, and `service` runs the same
// action the customer grid runs, through useServiceAction.
const ADMIN_HOME = [
  { key: 'finance', icon: '\uD83D\uDCB0', name: 'Financial Management', section: 'finance' },
  { key: 'adminAnalytics', icon: '\uD83D\uDCCA', name: 'Reports & Analytics', screen: 'adminAnalytics' },
  { key: 'userManagement', icon: '\uD83D\uDC65', name: 'User Management', screen: 'userManagement' },
  { key: 'verificationManagement', icon: '\uD83E\uDEAA', name: 'KYC Management', screen: 'verificationManagement' },

  { key: 'adminSupport', icon: '\uD83C\uDFA7', name: 'Support Inbox', screen: 'adminSupport' },
  { key: 'recharge', icon: '\uD83D\uDCF1', name: 'Recharge', service: { key: 'recharge', kind: 'service' } },
  { key: 'remittance', icon: '\uD83D\uDCB8', name: 'Remittance', service: { key: 'remittance', kind: 'service' } },
  { key: 'mobilebanking', icon: '\uD83C\uDFE6', name: 'Mobile Banking', service: { key: 'mobilebanking', kind: 'service' } },

  { key: 'internet', icon: '\uD83D\uDCE1', name: 'Internet', service: { key: 'internet', kind: 'service' } },
  { key: 'flight', icon: '\u2708\uFE0F', name: 'Flight', service: { key: 'flight', kind: 'service' } },
  { key: 'bus', icon: '\uD83D\uDE8C', name: 'Bus', service: { key: 'bus', kind: 'buspicker' } },
  { key: 'train', icon: '\uD83D\uDE82', name: 'Train', service: { key: 'train', kind: 'webview' } },

  { key: 'visa', icon: '\uD83D\uDEC2', name: 'Visa', service: { key: 'visa', kind: 'webview' } },
  { key: 'mydigital', icon: '\uD83D\uDCBB', name: 'Malaysia Arrival Card', service: { key: 'mydigital', kind: 'webview' } },
  { key: 'passport', icon: '\uD83D\uDCD9', name: 'Passport', service: { key: 'passport', kind: 'webview' } },
  { key: 'moreFeaturesTile', icon: '\u2728', name: 'More Features', screen: 'moreFeatures' },
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

// Tiles that open a screen of their own rather than an AdminHomeScreen tab.
// Anything not listed falls through to setAdminTab, and a key with no branch
// there opens an empty page - which is what five of these were doing.
// adminAnalytics, transferPoints, userManagement, verificationManagement and
// featureAccess all have real screens in App.js and were all being routed to
// a tab that does not exist. gridManagement and apiManagement were already
// special-cased by hand in openItem; folding them in gives one path, so the
// navigation audit reads a single list instead of chasing special cases.
const SCREEN_FEATURES = ['adminAnalytics', 'transferPoints', 'userManagement', 'verificationManagement', 'featureAccess', 'gridManagement', 'apiManagement'];
// Where the tile key and the screen name differ.
const SCREEN_FOR = { apiManagement: 'apiProviderManagement' };

export default function AdminFeaturesScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { profile, goBackOrHome, setScreen, openSidebar, dealerTxs, inquiries, topups, setAdminTab, setAdminViewingSection, rates, gridManagement, gridViewer, can } = useApp();
  const [section, setSection] = useState(null);
  const [rateView, setRateView] = useState(false);
  const [editRateKey, setEditRateKey] = useState(null);
  const isSuperadmin = profile?.role === 'superadmin';

  const allow = (items) => items.filter((item) => {
    const gridKey = item.key === 'all' ? 'history' : item.key;
    if (gridKey === 'gridManagement') return isSuperadmin;
    if (!gridManagementService.isGridActive(gridManagement, gridKey, gridViewer)) return false;
    if (item.key === 'featureAccess') return isSuperadmin;
    const need = CAPABILITY_FOR[item.key];
    return need ? need.some((cap) => can(cap)) : isSuperadmin;
  });
  const runService = useServiceAction();
  const badges = {
    pending: dealerTxs.filter((t) => t.status === 'pending').length || undefined,
    inquiries: inquiries.filter((i) => (i.status || 'new') === 'new').length || undefined,
    topups: topups.filter((t) => t.status === 'pending').length || undefined,
  };
  // A landing tile is one of three things, and each goes somewhere
  // different: a hub section, a screen, or a service the customer grid
  // already knows how to run.
  const openHomeItem = (key) => {
    const item = ADMIN_HOME.find((x) => x.key === key);
    if (!item) return;
    if (item.section) { setSection(item.section); return; }
    if (item.screen) { setScreen(item.screen); return; }
    if (item.service) runService(item.service);
  };

  const openItem = (key) => {
    if (key === 'rates') { setRateView(true); return; }
    if (SCREEN_FEATURES.includes(key)) { setScreen(SCREEN_FOR[key] || key); return; }
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
        {!!isSuperadmin && <View style={styles.card}><Text style={styles.cardTitle}>🔄 Recharge / Internet</Text>{renderRateRows(RECHARGE_RATE_FIELDS)}</View>}
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

  // One flat grid, the same shape every other role gets. The four category
  // tiles this replaces each cost a tap before anything useful appeared,
  // and the two most-used destinations - users and KYC - were two levels
  // down. The category hubs still exist; More Features and the sidebar
  // reach them, and openHomeItem routes the tiles that live in one.
  const homeItems = ADMIN_HOME.filter((item) => {
    if (item.section === 'system' && !isSuperadmin) return false;
    if (!gridManagementService.isGridActive(gridManagement, item.key, gridViewer)) return false;
    const need = CAPABILITY_FOR[item.key];
    // A service tile is not a management capability - every role may use it.
    if (!need) return !item.section || isSuperadmin || item.service || item.screen;
    return need.some((cap) => can(cap));
  });

  return <View style={styles.screen}>
    <AppHeader onPressMenu={openSidebar} />
    <ScrollView contentContainerStyle={styles.homeContent}>
      <WalletCard balance={balance} variant="surface" onAddMoney={() => setScreen('superAdminTopup')} onTransfer={() => setScreen('transferPoints')} />
      <FeatureGrid
        title={isSuperadmin ? 'Superadmin Control Center' : 'Admin Control Center'}
        items={homeItems}
        onPress={openHomeItem}
      />
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