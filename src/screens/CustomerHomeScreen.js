import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme/theme';
import BannerSlider from '../components/BannerSlider';
import ServiceGrid from '../components/ServiceGrid';
import AppHeader from '../components/AppHeader';
import WalletCard from '../components/WalletCard';
import InfoBar from '../components/InfoBar';
import ServiceIcon from '../components/ServiceIcon';
import { SectionCard, ListRow } from '../components/uiRows';

// Mockup 08.
//
// The four quick actions that sat under the KYC card are gone: Top Up is the
// first grid tile, Activity is History in the bottom nav, and Support and
// More are both behind More. Four buttons that each duplicated something one
// tap away, taking a full row above the fold.
//
// The grid is capped at six. The customer list is 17 tiles - the entire
// catalogue on the home page, pushing everything else below the fold - and
// the Services tab already shows all of them, so home keeps the money
// services and the More Services tile.
//
// Every surface here used to be a hardcoded teal: #A6F5D2 borders, #D9F6EA
// card fills, #0A5C78 and #0E9E8C text, #19C39B rings, #374151 labels, with
// plain 'white' on top. That is why the home screen stayed green for an
// admin whose palette is blue, and why the KYC and verified cards were pale
// mint blocks against a dark background. All of it is palette tokens now, so
// the screen follows the role colour it is supposed to and reads correctly
// in dark mode - the colours themselves are unchanged for a customer.
export default function CustomerHomeScreen() {
  const { colors } = useTheme();
  const { openSidebar, setScreen, hasUnreadNotifications, profile } = useApp();
  const styles = createStyles(colors);
  const balance = profile?.balance ?? profile?.walletBalance ?? profile?.wallet?.balance ?? 0;
  const kycVerified = profile?.verified === true || profile?.verificationStatus === 'approved';

  return (
    <View style={styles.screen}>
      <AppHeader unreadCount={hasUnreadNotifications ? 1 : 0} onPressMenu={openSidebar} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <WalletCard
          balance={balance}
          variant="solid"
          onAddMoney={() => setScreen('topup')}
          onTransfer={() => setScreen('transferPoints')}
        />

        <View style={styles.statusCard}>
          <View style={styles.statusIcon}><ServiceIcon name="kyc" size={24} color={colors.primary} /></View>
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>{kycVerified ? 'Identity verified' : 'Complete your KYC'}</Text>
            <Text style={styles.statusText}>
              {kycVerified
                ? 'Your account is ready for finance services.'
                : 'Verify your identity to unlock all finance services.'}
            </Text>
          </View>
          {!kycVerified && (
            <TouchableOpacity style={styles.statusAction} onPress={() => setScreen('verifyIdentity')} accessibilityRole="button">
              <Text style={styles.statusActionText}>Verify</Text>
            </TouchableOpacity>
          )}
        </View>

        <InfoBar />
        <BannerSlider />
        <ServiceGrid homeOnly />

        <SectionCard style={styles.section}>
          <ListRow
            icon="🕑"
            title="Recent activity"
            subtitle="View your complete payment and service history"
            onPress={() => setScreen('history')}
            last
          />
        </SectionCard>
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { padding: 14, paddingBottom: 32 },

    // One card for both states rather than two near-identical ones that had
    // drifted to the same styles anyway.
    statusCard: {
      backgroundColor: `${colors.primary}14`,
      borderRadius: radius.card,
      padding: 13,
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      borderWidth: 1,
      borderColor: `${colors.primary}33`,
    },
    statusIcon: {
      width: 40, height: 40, borderRadius: 20,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.card,
      borderWidth: 1.5, borderColor: colors.primary,
    },
    statusCopy: { flex: 1, minWidth: 0 },
    statusTitle: { color: colors.text, fontWeight: '800', fontSize: 14 },
    statusText: { color: colors.textSecondary, fontSize: 11.5, marginTop: 2 },
    statusAction: { backgroundColor: colors.primary, paddingVertical: 8, paddingHorizontal: 16, borderRadius: radius.pill },
    statusActionText: { color: colors.onPrimary, fontWeight: '800', fontSize: 13 },

    section: { marginTop: 12 },
  });
}
