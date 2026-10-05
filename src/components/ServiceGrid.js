import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { tileIcon, tileGrid } from '../theme/theme';
import { useLanguage } from '../i18n/LanguageContext';
import * as gridManagementService from '../firebase/gridManagementService';
import { serviceEmoji } from './serviceEmoji';
import BusOperatorLogo, { hasBusLogo } from './BusOperatorLogo';
import BrandTileLogo, { hasBrandTileLogo } from './BrandTileLogo';
import PhotoTileIcon, { hasPhotoTileIcon, photoIconFor } from './PhotoTileIcon';
import ServiceArt, { hasServiceArt } from './ServiceArt';
import { CUSTOMER_SERVICES, STAFF_ROLES, visibleTiles, groupTilesByCategory } from './serviceTiles';

// `home: true` marks the tiles the customer home shows. Everything else is
// one tap away on the Services tab, which renders this list in full.
//

function asSafeText(value, fallback = '') { return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback; }

export function Tile({ s, onPress, disabled }) {
  const { colors } = useTheme(); const { t } = useLanguage();
  const safeKey = asSafeText(s?.key, 'service');
  const translated = typeof t === 'function' ? t(`service.${safeKey}`, s?.name) : null;
  const label = asSafeText(translated, asSafeText(s?.name, safeKey));
  const icon = asSafeText(s?.icon, 'more');
  // Fixed colour per service. ServiceIcon actually strokes in this colour,
  // which RoyalIcon did not - its paths hardcoded gold and green, so the
  // accent only ever tinted the wash behind an identical illustration.
  // The reference outlines every card in the one brand colour rather than
  // per service, so nothing here reads serviceColor any more - the emoji
  // carries the colour, and the outline carries the brand.
  // A bus partner gets its own brand mark, anything with a drawing gets
  // that, and the emoji map is the fallback for whatever is left.
  // A chosen icon beats the one the key implies. `art` names a drawing, `emoji`
  // is text to print; a superadmin setting either in Tile Labels must see it,
  // and both used to lose to whatever drawing this tile's KEY happened to have.
  const chosenEmoji = asSafeText(s?.emoji, '');
  // An emoji only beats this tile's own artwork when somebody CHOSE it.
  //
  // applyTileLabels writes `art: ''` alongside the emoji it was given, so an
  // empty-string art is the mark of a deliberate choice. withWebviewConfig
  // writes no art at all - it just carries the page's title icon across - and
  // reading that as a choice blanked the artwork on every WebView tile: Visa,
  // FOMEMA, Arrival Card, Passport and Train all drew their default emoji and
  // none of them reached the picture sitting in assets/tiles under their key.
  const emojiWasChosen = !!chosenEmoji && s?.art === '';
  const artKey = asSafeText(s?.art, '') || (emojiWasChosen ? '' : asSafeText(s?.key, icon));
  // Supplied artwork for this tile, either chosen by name in Tile Labels or
  // found from the tile's own key. Checked before the drawings: a tile with a
  // picture of its own should show it rather than the generic vector.
  const photoKey = hasPhotoTileIcon(artKey) ? artKey : photoIconFor(artKey);
  return <TouchableOpacity style={[styles.item, { borderColor: `${colors.primary}66`, backgroundColor: colors.card }, disabled && styles.itemDisabled]} activeOpacity={0.82} disabled={!!disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
    {photoKey
      ? <View style={styles.logoWrap}><PhotoTileIcon art={photoKey} size={tileIcon.size} /></View>
      : hasBrandTileLogo(artKey)
      ? <View style={styles.logoWrap}><BrandTileLogo art={artKey} size={tileIcon.size} /></View>
      : hasBusLogo(artKey)
      ? <View style={styles.logoWrap}><BusOperatorLogo operatorKey={artKey} size={tileIcon.size} /></View>
      : hasServiceArt(artKey)
        ? <View style={styles.logoWrap}><ServiceArt name={artKey} size={tileIcon.size} color={colors.primary} /></View>
        : <Text style={styles.emoji} numberOfLines={1}>{chosenEmoji || serviceEmoji(asSafeText(s?.key, icon))}</Text>}
    <Text style={[styles.name, { color: colors.text || '#222' }]} numberOfLines={2}>{label}</Text>
  </TouchableOpacity>;
}

export function useServiceAction() {
  const { startService, openWebView, openBusPicker, openSalary, openMyDocuments, setScreen, gridManagement, setAdminTab, setAdminViewingSection, gridViewer } = useApp();
  return (s) => {
    if (!s || !gridManagementService.isGridActive(gridManagement, s.key, gridViewer)) return;
    if (s.kind === 'webview') return openWebView(s.key);
    if (s.kind === 'buspicker') return openBusPicker();
    if (s.kind === 'salary') return openSalary();
    if (s.kind === 'documents') return openMyDocuments();
    if (s.kind === 'rechargePin') return setScreen('rechargePin');
    if (s.kind === 'moreFeaturesLink') return setScreen('moreFeatures');
    if (s.kind === 'walletTransfer') return setScreen('transferPoints');
    if (s.kind === 'kyc') return setScreen('verifyIdentity');
    if (s.kind === 'support') return setScreen('support');
    if (s.kind === 'history') return setScreen('history');
    if (s.kind === 'myaccount') return setScreen('myAccount');
    if (s.kind === 'profile') return setScreen('profile');
    if (s.kind === 'topup') return setScreen('topup');
    if (s.kind === 'adminTopup') return setScreen('superAdminTopup');
    if (s.kind === 'dealerFeatures') return setScreen('dealerFeatures');
    if (s.kind === 'resellerFeatures') return setScreen('resellerFeatures');
    if (s.kind === 'adminFeatures') return setScreen('adminFeatures');
    if (s.kind === 'staffSupport') return setScreen('adminSupport');
    if (s.kind === 'staffInquiries') { setAdminTab('inquiries'); setAdminViewingSection(true); return setScreen('adminHome'); }
    if (s.kind === 'staffReports') return setScreen('reports');
    if (s.kind === 'staffLedger') return setScreen('ledger');
    if (s.kind === 'staffFunding') return setScreen('walletFunding');
    if (s.kind === 'staffInvoices') return setScreen('invoices');
    // A tile that is a service with some steps already answered.
    if (s.kind === 'billShortcut') return startService('billpayment', s.seed, s.startStep);
    return startService(s.key);
  };
}

// Support Agent and Finance tiles come from what the person can actually do
// - their role defaults plus any overrides - so a finance user granted
// support gets the Support Inbox too. `needs` is any-of.

export const PRIMARY_SERVICES = CUSTOMER_SERVICES;

// `homeOnly` draws just the tiles flagged `home: true`, for the home screen.
// The customer list is 17 tiles - the whole catalogue, every time, before
// anything else on the page gets a look in, so home shows the flagged set
// and ends on More Services.
//
// An unflagged tile is NOT automatically picked up somewhere else. This
// comment used to claim the Services tab rendered the full grid; it does
// not - MoreFeaturesScreen builds its own lists - and PIN Generate, Bill
// Payment and Entertainment sat unflagged and unlisted, which made three
// finished features unreachable. MoreFeaturesScreen now derives its
// overflow section from this list, so dropping `home` moves a tile there
// rather than deleting it from the app.
export default function ServiceGrid({ homeOnly }) {
  const { colors } = useTheme(); const { webViewBusy, profile, gridManagement, gridViewer, can, webviewPages, tileLabels } = useApp();
  const handlePress = useServiceAction(); const role = profile?.role || 'customer';
  const isStaff = STAFF_ROLES.includes(role);
  // Both of these live in serviceTiles.js, so what a role sees - and that an
  // added WebView reaches every staff role through the one ...SHARED_SERVICES
  // line - is something a test can compute rather than infer from a render.
  const services = visibleTiles({
    role,
    can,
    webviewPages,
    tileLabels,
    isActive: (key) => gridManagementService.isGridActive(gridManagement, key, gridViewer),
    homeOnly,
  });

  // The home screen is one block of services, three across, in declaration
  // order - which for a customer is exactly twelve: four full rows, no short
  // row and no gap. More Features is the twelfth tile, not a row of its own.
  //
  // Staff carry management tiles as well, and those are a different kind of
  // thing from the services they also sell, so they get their own block above.
  // What is left is the same twelve. A customer has no management block, so the
  // heading is dropped and the screen's own title does that work.
  const blocks = [];
  const manage = services.filter((t) => t.cat === 'manage');
  const rest = services.filter((t) => t.cat !== 'manage');
  if (manage.length) blocks.push({ key: 'manage', label: 'Management', tiles: manage });
  if (rest.length) blocks.push({ key: 'services', label: 'Quick Services', tiles: rest });

  return (
    <View>
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: colors.navy || colors.text }]}>{isStaff ? 'Management Dashboard' : 'Quick Services'}</Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
          {isStaff ? 'Manage transactions, accounts and operations' : 'Top-ups, bills, tickets and sending money home'}
        </Text>
      </View>
      <View style={[styles.gridCanvas, { backgroundColor: colors.canvasBg || colors.surface }]}>
        {blocks.map((block, i) => (
          <View key={block.key} style={i > 0 && styles.sectionSpacer}>
            {blocks.length > 1 && (
              <Text style={[styles.catLabel, { color: colors.textSecondary }]}>{block.label}</Text>
            )}
            <View style={styles.grid}>
              {block.tiles.map((service) => (
                <Tile key={service.key} s={service} disabled={service.kind === 'webview' && !!webViewBusy} onPress={() => handlePress(service)} />
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ sectionSpacer: { marginTop: 14 }, catLabel: { fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, marginLeft: 2 }, sectionHead: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 }, sectionTitle: { fontSize: 17, fontWeight: '800', letterSpacing: 0.2 }, sectionSubtitle: { fontSize: 11, marginTop: 2 }, gridCanvas: { marginHorizontal: 4, padding: 10, borderRadius: 18 }, // `space-between` spreads a partial row to both edges, so a category with two
// tiles drew one against the left margin and one against the right with a
// canyon between them. Packing left with a fixed gap means a row of two looks
// like the first two of a row of four, which is what it is.
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', columnGap: tileGrid.gap }, item: { width: tileGrid.width, aspectRatio: 1, marginBottom: 10, paddingHorizontal: 2, paddingVertical: 10, borderWidth: 1.5, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 }, itemDisabled: { opacity: 0.45 }, emoji: { fontSize: tileIcon.emoji, lineHeight: tileIcon.wrap, marginBottom: 6, textAlign: 'center' }, logoWrap: { height: tileIcon.wrap, marginBottom: 6, alignItems: 'center', justifyContent: 'center' }, iconText: { fontSize: 28 }, name: { fontSize: 11.5, lineHeight: 14, fontWeight: '700', textAlign: 'center' } });