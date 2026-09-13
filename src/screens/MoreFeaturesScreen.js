import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

const FINANCE_FEATURES = [
  { key: 'account', icon: '👤', title: 'My Account', subtitle: 'Profile, wallet balance and account details', screen: 'myAccount' },
  { key: 'history', icon: '📋', title: 'Transaction History', subtitle: 'View your orders and financial activity', screen: 'history' },
  { key: 'reports', icon: '📊', title: 'Reports', subtitle: 'Review your account and transaction reports', screen: 'reports' },
  { key: 'verify', icon: '🪪', title: 'Identity Verification', subtitle: 'Manage your account verification status', screen: 'verifyIdentity' },
  { key: 'notifications', icon: '🔔', title: 'Notifications', subtitle: 'Important account and service updates', screen: 'notifications' },
];

export default function MoreFeaturesScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { goBackOrHome, setScreen } = useApp();

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>More Features</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={goBackOrHome} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>Manage your MySheba finance account and activity.</Text>
        <View style={styles.card}>
          {FINANCE_FEATURES.map((item, index) => (
            <React.Fragment key={item.key}>
              {index > 0 && <View style={styles.divider} />}
              <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={() => setScreen(item.screen)}>
                <View style={styles.iconWrap}><Text style={styles.icon}>{item.icon}</Text></View>
                <View style={styles.textWrap}>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.subtitle}>{item.subtitle}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: 22, paddingBottom: 22, paddingHorizontal: 20, backgroundColor: colors.card },
    headerTitle: { color: colors.navy, fontWeight: '800', fontSize: 22 },
    closeBtn: { position: 'absolute', right: 20, top: 18, width: 32, height: 32, borderRadius: radius.pill, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center' },
    closeText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
    content: { padding: 16, paddingBottom: 40 },
    intro: { color: colors.textMuted || '#777', fontSize: 13, marginBottom: 12 },
    card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    row: { minHeight: 78, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
    iconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: `${colors.primary}12`, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    icon: { fontSize: 22 },
    textWrap: { flex: 1 },
    title: { color: colors.text, fontSize: 15, fontWeight: '700' },
    subtitle: { color: colors.textMuted || '#777', fontSize: 11, marginTop: 3, lineHeight: 16 },
    chevron: { color: colors.primary, fontSize: 24, marginLeft: 8 },
    divider: { height: 1, backgroundColor: colors.border, marginLeft: 70 },
  });
}
