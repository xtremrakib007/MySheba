import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';

/**
 * MySheba Help - a single "ask a question" entry point reachable from
 * Support. Each entry below is a common worker question mapped straight
 * to wherever MySheba already answers it (My Documents, a government
 * webview, Marketplace's Accommodation/Community/Local Services hubs) -
 * no new mechanism, just the same openX() calls the home grid uses. A
 * question with no direct feature (an employer pay dispute) falls back
 * to Support's own ticket form via openSupportWithPrefill - see
 * AppContext's "MySheba Help" block and SupportScreen's helpPrefill
 * effect. Add more entries here as new questions/features come up; each
 * just needs an icon, the question text, and an action from useApp().
 */
export default function HelpScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const {
    goBackOrHome, openMyDocuments, openWebView, openAccommodation,
    openServiceProvidersHome, openCommunity, openSupportWithPrefill,
  } = useApp();

  const HELP_ITEMS = [
    {
      icon: '💰',
      question: "My employer hasn't paid my salary.",
      onPress: () => openSupportWithPrefill(
        "Employer hasn't paid my salary",
        'My employer has not paid my salary. Please advise on what I can do and help me follow up.'
      ),
    },
    {
      icon: '📔',
      question: 'My passport is expiring.',
      onPress: openMyDocuments,
    },
    {
      icon: '🏥',
      question: 'Where can I do FOMEMA?',
      onPress: () => openWebView('fomema'),
    },
    {
      icon: '🏠',
      question: 'I need a room near my workplace.',
      onPress: openAccommodation,
    },
    {
      icon: '🗣️',
      question: 'I need a Bengali-speaking clinic.',
      onPress: openServiceProvidersHome,
    },
    {
      icon: '🛂',
      question: 'How can I renew my visa?',
      onPress: () => openWebView('visa'),
    },
    {
      icon: '💼',
      question: 'I need a job.',
      onPress: openCommunity,
    },
  ];

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>🤝 MySheba Help</Text>
          <Text style={styles.headerSubtitle}>Tell us what you need - we'll get you to the right place</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.body}>
        {HELP_ITEMS.map((item) => (
          <TouchableOpacity key={item.question} style={styles.itemCard} onPress={item.onPress} activeOpacity={0.7}>
            <View style={styles.itemIconWrap}>
              <Text style={styles.itemIcon}>{item.icon}</Text>
            </View>
            <Text style={styles.itemText}>{item.question}</Text>
            <Text style={styles.itemChevron}>›</Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.footerNote}>
          Don't see your question? Use Message Support or Submit a Support Request on the Support page.
        </Text>
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '700', fontSize: 16 },
    headerSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 2 },
    body: { padding: 16, paddingBottom: 30 },
    itemCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card,
      borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14, marginBottom: 10,
    },
    itemIconWrap: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    itemIcon: { fontSize: 18 },
    itemText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
    itemChevron: { fontSize: 20, color: '#999' },
    footerNote: { textAlign: 'center', fontSize: 12, color: colors.textSecondary, marginTop: 10, lineHeight: 18 },
  });
}
