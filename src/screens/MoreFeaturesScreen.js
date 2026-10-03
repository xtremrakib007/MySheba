import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import HeaderDecor from '../components/HeaderDecor';
import { radius } from '../theme/theme';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { useServiceAction, Tile } from '../components/ServiceGrid';
import { moreFeaturesSections } from '../components/serviceTiles';
import * as gridManagementService from '../firebase/gridManagementService';


function Section({ title, subtitle, items, onPress }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  if (!items || items.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      <View style={styles.sectionCard}>
        <View style={styles.grid}>
          {items.map((item) => <Tile key={item.key} s={item} onPress={() => onPress(item)} />)}
        </View>
      </View>
    </View>
  );
}

export default function MoreFeaturesScreen() {
  const { goBackOrHome, profile, gridManagement, gridViewer, webviewPages, can } = useApp();
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  // This screen's rule: a finished tile lands on the home screen or here, never
  // nowhere - whether "not on the home screen" is how it was declared or how a
  // superadmin has since set it. Role-aware, because staff home screens are
  // trimmed too, and one call returns both halves so the overflow and the
  // account rows cannot disagree about what the account section already covers.
  const role = profile?.role || 'customer';
  const { sections, account } = moreFeaturesSections({
    role,
    can,
    webviewPages,
    isActive: (key) => gridManagementService.isGridActive(gridManagement, key, gridViewer),
  });
  const handlePress = useServiceAction();
  const visible = (items) => items.filter((item) => gridManagementService.isGridActive(gridManagement, item.key, gridViewer));
  const isCustomer = !profile?.role || profile.role === 'customer';

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>All Services</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        {/* One section per category, so this screen reads the same way the home
            screen does rather than as one long undifferentiated list. Hidden
            when empty - every tile being on the home screen is the good case,
            not a reason for a bare heading. */}
        {sections.map((section) => (
          <Section key={section.key} title={section.label} subtitle={section.subtitle} items={section.tiles} onPress={handlePress} />
        ))}
        {/* The account rows are the same for everyone; only the list differs,
            and a staff member's includes the management shortcuts. Shown for
            staff too, which it was not: the staff branch used to replace the
            overflow entirely, so a tile that left a dealer's home screen had
            nowhere to appear. */}
        <Section
          title={isCustomer ? 'Personal' : 'Account & Operations'}
          subtitle={isCustomer ? 'Your account, documents and activity' : 'Manage your account and operational features'}
          items={visible(account)}
          onPress={handlePress}
        />
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: '#FFFFFF', fontSize: 20 },
    headerTitle: { color: '#FFFFFF', fontWeight: '700', fontSize: 16, marginLeft: 10 },
    content: { padding: 14, paddingBottom: 40 },
    section: { marginBottom: 18 },
    sectionTitle: { fontSize: 12, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2, marginLeft: 2 },
    sectionSubtitle: { fontSize: 11.5, color: colors.textSecondary, marginBottom: 9, marginLeft: 2 },
    sectionCard: { backgroundColor: colors.canvasBg || colors.surface, borderRadius: 18, padding: 10 },
    // Three across, left-packed, same as the home grid: the tile width is
    // ServiceGrid's, so the two screens cannot disagree about how wide a
    // service is.
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', columnGap: 8 },
  });
}
