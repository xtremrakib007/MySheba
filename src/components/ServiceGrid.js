import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { useApp } from '../context/AppContext';
import { showAlert } from '../utils/appAlert';
import { useTheme } from '../theme/ThemeContext';
import { tileIcon, tileGrid } from '../theme/theme';
import { useLanguage } from '../i18n/LanguageContext';
import * as gridManagementService from '../firebase/gridManagementService';
import * as apiProviderService from '../firebase/apiProviderService';
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
  const imageUrl = asSafeText(s?.imageUrl, '').trim();
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
  const chosenArt = asSafeText(s?.art, '');
  const artKey = chosenArt || (emojiWasChosen ? '' : asSafeText(s?.key, icon));
  // Supplied artwork for this tile: a picture named outright, or one found from
  // the tile's own key. Checked before the drawings, because a tile with a
  // picture of its own should show it rather than the generic vector.
  //
  // A picture is only FOUND from the key when nothing was chosen. Looking one
  // up from a chosen name turned an explicit choice of the `walletTransfer`
  // DRAWING into the `photoWalletTransfer` picture - so a Tile Labels override
  // saved before the pack existed quietly overrode the pack, and the tile kept
  // showing the old artwork no matter what shipped.
  const photoKey = hasPhotoTileIcon(artKey) ? artKey : (chosenArt ? '' : photoIconFor(artKey));
  return <TouchableOpacity style={[styles.item, { borderColor: `${colors.primary}66`, backgroundColor: colors.card }, disabled && styles.itemDisabled]} activeOpacity={0.82} disabled={!!disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
    {imageUrl
      ? <View style={styles.logoWrap}>
          <Image
            source={{ uri: imageUrl }}
            style={{ width: tileIcon.wrap, height: tileIcon.wrap }}
            resizeMode="contain"
          />
        </View>
      : photoKey
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
    if (s.kind === 'webview') return openWebView(s.webviewKey || s.key);
    if (s.kind === 'dynamicService') {
      if (!s.serviceKey) return showAlert('MySheba', 'This feature is not configured yet.');
      return startService(s.serviceKey);
    }
    if (s.kind === 'dynamicScreen') {
      const screenMap = {
        moreFeatures: 'moreFeatures', history: 'history', topup: 'topup',
        profile: 'profile', myAccount: 'myAccount', transferPoints: 'transferPoints',
        verifyIdentity: 'verifyIdentity', support: 'support', referral: 'referral',
      };
      if (screenMap[s.screenKey]) return setScreen(screenMap[s.screenKey]);
      return showAlert('MySheba', 'This feature is not configured yet.');
    }
    if (s.kind === 'buspicker') return openBusPicker();
    if (s.kind === 'salary') return openSalary();
    if (s.kind === 'documents') return openMyDocuments();
    if (s.kind === 'rechargePin') return setScreen('rechargePin');
    if (s.kind === 'iimmpactCatalog') return setScreen('iimmpactCatalog');
    if (s.kind === 'iimmpactCategory') return setScreen('iimmpactCategoryGrid:' + encodeURIComponent(String(s.iimmpactCategory || '')));
    if (s.kind === 'iimmpactCategoryGrid') return setScreen('iimmpactCategoryGrid:' + encodeURIComponent(String(s.iimmpactCategory || '')));
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
    // Touch 'n Go is sold two ways, and used to be two tiles in two places: a
    // reload buried in Bill Payment and a voucher buried in PIN Generate. One
    // tile, and the choice is the first thing it asks.
    if (s.kind === 'tngShortcut') {
      return showAlert("Touch 'n Go eWallet", 'Reload the wallet directly, or buy a PIN voucher to top it up later?', [
        { text: 'Reload wallet', onPress: () => startService('billpayment', s.seed, s.startStep) },
        { text: 'Buy PIN voucher', onPress: () => setScreen('rechargePin') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
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
  const { colors } = useTheme(); const { webViewBusy, profile, gridManagement, gridViewer, can, webviewPages, tileLabels, dynamicPlatformFeatures } = useApp();
  const handlePress = useServiceAction(); const role = profile?.role || 'customer';
  const isStaff = STAFF_ROLES.includes(role);
  const [iimmpactCatalog, setIimmpactCatalog] = useState(null);
  const [iimmpactLoading, setIimmpactLoading] = useState(false);
  const [iimmpactError, setIimmpactError] = useState('');

  // Load the same live catalogue used by the former Marketplace screen.
  // This merges categories into the existing grid rather than creating a
  // second marketplace-only landing page.
  useEffect(() => {
    let alive = true;
    setIimmpactLoading(true);
    apiProviderService.getIimmpactFullCatalogForUser('MY')
      .then((data) => { if (alive) setIimmpactCatalog(data || {}); })
      .catch((error) => { if (alive) setIimmpactError(error?.message || 'IIMMPACT categories are temporarily unavailable.'); })
      .finally(() => { if (alive) setIimmpactLoading(false); });
    return () => { alive = false; };
  }, []);


  // Both of these live in serviceTiles.js, so what a role sees - and that an
  // added WebView reaches every staff role through the one ...SHARED_SERVICES
  // line - is something a test can compute rather than infer from a render.
  const services = visibleTiles({
    role,
    can,
    webviewPages,
    tileLabels,
    viewer: gridViewer,
    dynamicFeatures: dynamicPlatformFeatures,
    isActive: (key) => gridManagementService.isGridActive(gridManagement, key, gridViewer),
    homeOnly,
  });

  const marketplaceTiles = useMemo(() => {
    const groups = iimmpactCatalog?.tree?.groups;
    const products = iimmpactCatalog?.products || {};
    const norm = (value) => String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
    const existingNames = new Set(services.map((item) => norm(item.name)));
    const seen = new Set();
    const tiles = [];
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const category of Array.isArray(group?.categories) ? group.categories : []) {
        const name = String(category?.name || group?.name || 'Other').trim();
        const codes = Array.isArray(category?.product_codes) ? category.product_codes.map(String) : [];
        const count = codes.filter((code) => products[code] && products[code].is_active !== false).length;
        const normalized = norm(name);
        if (!normalized || !count || seen.has(normalized) || existingNames.has(normalized)) continue;
        seen.add(normalized);
        const key = 'iimmpact_' + normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        if (!gridManagementService.isGridActive(gridManagement, key, gridViewer)) continue;
        const firstProductImage = codes.map((code) => products[code]).find((product) => product && product.is_active !== false && typeof product.image_url === 'string' && (product.image_url.startsWith('https://') || product.image_url.startsWith('http://')))?.image_url || '';
        const imageUrl = (typeof category?.icon_url === 'string' && (category.icon_url.startsWith('https://') || category.icon_url.startsWith('http://')) ? category.icon_url : '') || firstProductImage;
        tiles.push({ key, name, icon: 'iimmpact', emoji: '🛍️', imageUrl, kind: 'iimmpactCategory', iimmpactCategory: encodeURIComponent(name), cat: 'recharge', home: true, iimmpactCount: count });
      }
    }
    return tiles;
  }, [iimmpactCatalog, services, gridManagement, gridViewer]);

  // The home screen is one block of services, three across, in declaration
  // order - which for a customer is exactly twelve: four full rows, no short
  // row and no gap. More Features is the twelfth tile, not a row of its own.
  //
  // Staff carry management tiles as well, and those are a different kind of
  // thing from the services they also sell, so they get their own block above.
  // What is left is the same twelve. A customer has no management block, so the
  // heading is dropped and the screen's own title does that work.
  const mergedServices = [...services, ...marketplaceTiles];
  const blocks = [];
  const manage = mergedServices.filter((t) => t.cat === 'manage');
  const rest = mergedServices.filter((t) => t.cat !== 'manage');
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
        {iimmpactLoading && <View style={styles.catalogState}><ActivityIndicator size="small" color={colors.primary} /><Text style={[styles.catalogStateText, { color: colors.textSecondary }]}>Loading additional services…</Text></View>}
        {!!iimmpactError && !iimmpactLoading && <Text style={[styles.catalogStateText, { color: colors.textSecondary }]}>{iimmpactError}</Text>}
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
  catalogState: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 }, catalogStateText: { fontSize: 11 }, grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', columnGap: tileGrid.gap }, item: { width: tileGrid.width, aspectRatio: 1, marginBottom: 10, paddingHorizontal: 2, paddingVertical: 10, borderWidth: 1.5, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 }, itemDisabled: { opacity: 0.45 }, emoji: { fontSize: tileIcon.emoji, lineHeight: tileIcon.wrap, marginBottom: 6, textAlign: 'center' }, remoteLogo: { width: tileIcon.size, height: tileIcon.size }, logoWrap: { height: tileIcon.wrap, marginBottom: 6, alignItems: 'center', justifyContent: 'center' }, iconText: { fontSize: 28 }, name: { fontSize: 11.5, lineHeight: 14, fontWeight: '700', textAlign: 'center' } });