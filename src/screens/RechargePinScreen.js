import React, { useEffect, useMemo, useState } from 'react';
import { BackHandler, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Image, Linking } from 'react-native';
import * as Print from 'expo-print';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import { showAlert } from '../utils/appAlert';
import { rechargePinBrands } from '../data/countries';
import { getOperatorBrand } from '../data/operatorBrand';
import { purchaseRechargePin } from '../firebase/rechargePinService';
import * as apiProviderService from '../firebase/apiProviderService';
import { radius, tileGrid } from '../theme/theme';
import { Tile } from '../components/ServiceGrid';
import DenominationGrid from '../components/DenominationGrid';
import { getIimmpactCatalog } from '../firebase/iimmpactCatalogStore';
import { denominationItems } from '../utils/denominations';
import ConfirmReview, { formatMoney } from '../components/ConfirmReview';
import { applyMarkup } from '../utils/markup';
import { pinProducts, categorizePinProducts } from '../data/pinCategories';

// Recharge PIN is currently a Malaysia-only product. Keep this list
// intentionally limited so the screen cannot show unrelated country products.
const IIMMPACT_COUNTRIES = [['MY', 'Malaysia']];
const CURRENCY_BY_COUNTRY = { MY: 'MYR', SG: 'SGD', ID: 'IDR', IN: 'INR', PH: 'PHP', NP: 'NPR', PK: 'PKR', MM: 'MMK', KH: 'KHR' };
const MALAYSIA_OPERATORS = rechargePinBrands.MY || ['Celcom', 'CelcomDigi', 'U Mobile', 'Hotlink', 'XOX', 'Tunetalk', 'Unifi', 'Yes', "Touch 'n Go eWallet"];
function pricingField(product) {
  const fields = Array.isArray(product?.fields) ? product.fields : [];
  return fields.find((f) => f && (f.role === 'pricing' || f.type === 'select')) || null;
}

function pinProductIcon(product) {
  const text = `${product?.name || ''} ${product?.category || ''} ${product?.product_group || ''}`.toLowerCase();
  if (/celcomdigi|celcom|digi|hotlink|u mobile|umobile|xox|tunetalk|unifi|\byes\b|touch.?n.?go/.test(text)) return '📱';
  if (/game|gaming|playstation|xbox|steam|roblox|mobile legends|pubg/.test(text)) return '🎮';
  if (/coffee|tea|cafe|starbucks/.test(text)) return '☕';
  if (/wellness|health|medical|beauty|spa/.test(text)) return '💆';
  if (/transport|train|bus|ride|travel/.test(text)) return '🚆';
  if (/apple|itunes|app store/.test(text)) return '🍎';
  if (/shopping|retail|fashion|mall|lazada|shopee/.test(text)) return '🛍️';
  if (/grocery|supermarket|market/.test(text)) return '🛒';
  if (/food|restaurant|meal|delivery/.test(text)) return '🍔';
  if (/movie|music|stream|entertainment|netflix|spotify/.test(text)) return '🎬';
  if (/esim|data plan|internet/.test(text)) return '📶';
  if (/wallet|payment|cash/.test(text)) return '💳';
  return '🎁';
}


// A voucher order names the customer's own Malaysian number, in national
// form, when they have one. Anything else (a Bangladeshi number, say) is sent
// as an empty account: the PIN comes back on screen, never by SMS, so the
// customer is not asked to type a number at all.
function malaysianNational(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('0060')) digits = digits.slice(4);
  else if (digits.startsWith('60') && digits.length > 8) digits = digits.slice(2);
  if (!digits) return '';
  const national = digits.startsWith('0') ? digits : '0' + digits;
  return /^01\d{7,9}$/.test(national) ? national : '';
}

export default function RechargePinScreen({ initialCategory = null } = {}) {
  const { colors, brandGradient } = useTheme();
  const { goBackOrHome, profile, pricing } = useApp();
  const styles = createStyles(colors);
  const [country, setCountry] = useState('MY');
  const [catalog, setCatalog] = useState(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [product, setProduct] = useState(null);
  const [options, setOptions] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [operator, setOperator] = useState('');
  const [amount, setAmount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [voucher, setVoucher] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  // The purchase being reviewed on the full confirmation page, or null.
  const [review, setReview] = useState(null);
  const account = malaysianNational(profile?.phone);
  const [fieldValues, setFieldValues] = useState({});

  // Back should unwind the current PIN task one level at a time. Previously
  // this header always delegated to app-level navigation, whose feature
  // boundary intentionally clears screen history and sent PIN users home.
  const handlePinBack = () => {
    if (review) { if (!busy) setReview(null); return; }
    if (voucher) { setVoucher(null); return; }
    if (product) {
      setProduct(null);
      setOptions([]);
      setSelectedOption(null);
      setAmount(null);
      return;
    }
    // Opened on one category from a grid tile: that category is where this
    // screen starts, so Back returns to the grid rather than to every PIN
    // category, which is the flow the tile replaced.
    if (selectedCategory && selectedCategory !== initialCategory) { setSelectedCategory(null); return; }
    goBackOrHome();
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handlePinBack();
      return true;
    });
    return () => sub.remove();
  }, [review, busy, voucher, product, selectedCategory, initialCategory, goBackOrHome]);

  useEffect(() => {
    let alive = true;
    setCatalogError('');
    setProduct(null); setOptions([]);
    setSelectedOption(null); setOperator(''); setAmount(null); setVoucher(null); setSelectedCategory(initialCategory);
    // The app's shared catalogue: drawn at once from MySheba's saved copy, so
    // opening PIN never waits on IIMMPACT.
    setLoadingCatalog(true);
    getIimmpactCatalog()
      .then((data) => { if (alive) { setCatalog(data || {}); setCatalogError(''); } })
      .catch((e) => { if (alive) setCatalogError(e?.message || 'The MySheba voucher catalogue is unavailable right now.'); })
      .finally(() => { if (alive) setLoadingCatalog(false); });
    return () => { alive = false; };
  }, [country]);

  // Products and their categories both come from the catalogue's own tree,
  // the same way the native grid decides which PIN tiles to draw.
  const dynamicProducts = useMemo(() => pinProducts(catalog), [catalog]);

  useEffect(() => {
    let alive = true;
    setOptions([]); setSelectedOption(null); setAmount(null);
    if (!product) return () => { alive = false; };
    const field = pricingField(product);
    if (!field?.id) return () => { alive = false; };
    setLoadingOptions(true);
    apiProviderService.getIimmpactOptions({
      providerId: catalog?.providerId || '',
      productCode: product.code,
      fieldId: field.id,
      service: 'Recharge PIN',
      country,
    }).then((data) => {
      if (alive) setOptions(Array.isArray(data?.items) ? data.items : []);
    }).catch((e) => {
      if (alive) setCatalogError(e?.message || 'Unable to load live voucher denominations.');
    }).finally(() => { if (alive) setLoadingOptions(false); });
    return () => { alive = false; };
  }, [product?.code, catalog?.providerId, country]);

  const categorizedProducts = useMemo(() => categorizePinProducts(catalog || {}), [catalog]);
  // The amounts of the category on screen load in the background, so the
  // product tapped draws its denominations at once.
  useEffect(() => {
    const inCategory = categorizedProducts.find((item) => item.id === selectedCategory)?.products || [];
    apiProviderService.prefetchIimmpactOptions(inCategory);
  }, [categorizedProducts, selectedCategory]);

  const selectProduct = (p) => {
    setProduct(p); setVoucher(null); setOperator(''); setSelectedOption(null); setAmount(null); setFieldValues({});
  };

  // The fields this product declares besides its denomination list. The one
  // the catalogue names as the order's account is filled from the profile;
  // the rest are drawn as inputs, because the server refuses an order with a
  // required field left empty.
  const accountFieldId = String(product?.fulfillment?.account?.from_field || '');
  const pinPricingId = String(pricingField(product)?.id || '');
  const extraFields = (Array.isArray(product?.fields) ? product.fields : [])
    .filter((f) => f && f.id && String(f.id) !== pinPricingId && String(f.id) !== accountFieldId && f.type !== 'select')
    .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0));
  const missingField = extraFields.find((f) => f.required && !String(fieldValues[f.id] || '').trim());

  const buy = async () => {
    if (busy) return;
    const liveAmount = Number(selectedOption?.price?.amount ?? selectedOption?.denomination ?? amount);
    if (!product) return showAlert('Voucher', 'Please select a voucher product.');
    if (!(liveAmount > 0)) return showAlert('Voucher', 'Please select a denomination.');
    if (missingField) return showAlert('Voucher', 'Please complete: ' + (missingField.label || missingField.name || missingField.id));
    const currency = selectedOption?.price?.currency || product?.denomination_currency || 'MYR';
    // The same full review page as a top-up, not a dialog: what is being
    // bought, for how much, and what it leaves in the wallet.
    setReview({ liveAmount, currency });
  };

  const completePurchase = async (liveAmount) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await purchaseRechargePin({
        country,
        operator,
        amount: liveAmount,
        productCode: String(product?.code || ''),
        subproductCode: String(selectedOption?.code || ''),
        productName: String(product?.name || operator || ''),
        accountNumber: account,
        fieldValues: { ...fieldValues, ...(accountFieldId ? { [accountFieldId]: account } : {}) },
        selectedOptions: pinPricingId && selectedOption?.code ? { [pinPricingId]: { code: String(selectedOption.code) } } : {},
      });
      setReview(null);
      if (result?.pending) {
        showAlert('Voucher', 'Your order ' + String(result.id || '') + ' was accepted and the voucher is being issued. It will appear in History once the provider releases it.');
        return;
      }
      setVoucher(result);
    } catch (err) {
      showAlert('Voucher', err?.message || 'Could not purchase the voucher.');
    } finally { setBusy(false); }
  };

  const printVoucher = async () => {
    if (!voucher?.pin && !voucher?.deliveryLink) return;
    try {
      const currency = CURRENCY_BY_COUNTRY[voucher.country || country] || voucher.currency || '';
      const value = Number(voucher.amount || amount || 0);
      const secret = voucher.pin || voucher.deliveryLink || '';
      await Print.printAsync({ html:
        '<html><body style="font-family:Arial;padding:16px;text-align:center">' +
        '<h2>MySheba</h2><h3>Digital Voucher</h3><hr/>' +
        '<p><b>Country:</b> ' + escapeHtml(IIMMPACT_COUNTRIES.find(([c]) => c === (voucher.country || country))?.[1] || country) + '</p>' +
        '<p><b>Product:</b> ' + escapeHtml(voucher.productName || product?.name || '') + '</p>' +
        '<p><b>Value:</b> ' + escapeHtml(currency) + ' ' + value.toFixed(2) + '</p>' +
        '<div style="margin:22px 0;font-size:18px;word-break:break-all"><b>' + escapeHtml(secret) + '</b></div>' +
        '<p>Keep this voucher private.</p><p style="font-size:10px">Transaction: ' + escapeHtml(voucher.id) + '</p>' +
        '</body></html>'
      });
    } catch (err) { showAlert('Printer', err?.message || 'Could not open the system printer.'); }
  };

  if (review) {
    const role = String(profile?.role || 'customer');
    const multiplier = Number(pricing?.rolePricing?.[role]?.rechargePointCostPerUnit ?? pricing?.rechargePointCostPerUnit ?? 1);
    // MySheba's markup, then the PIN multiplier, as the server charges it.
    const marked = applyMarkup(pricing, { service: 'rechargePin', country, productCode: product?.code || operator, amount: review.liveAmount }).amount;
    const deduction = Math.round(marked * (Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1) * 100) / 100;
    const walletCurrency = profile?.walletCurrency || 'MYR';
    const balance = Number(profile?.walletBalance ?? profile?.balance ?? 0);
    const categoryTitle = categorizedProducts.find((item) => item.id === selectedCategory)?.title || '';
    return <ConfirmReview
      title="Confirm PIN Purchase"
      details={[
        ['Country', country],
        ['Category', categoryTitle],
        ['Product', String(product?.name || '')],
        ['Denomination', selectedOption?.label || formatMoney(review.liveAmount, review.currency)],
        ['Currency', review.currency],
        ['Delivery', 'PIN shown on screen after payment'],
      ]}
      prices={[
        ['Selling / transaction amount', formatMoney(marked, review.currency)],
        ['Wallet balance before', formatMoney(balance, walletCurrency)],
        ['Wallet balance after (estimated)', formatMoney(balance - deduction, walletCurrency)],
      ]}
      total={formatMoney(deduction, walletCurrency)}
      note="Tier discounts and the final charge are applied by the server. If the provider refuses the order, the amount is returned to your wallet."
      busy={busy}
      onEdit={() => { if (!busy) setReview(null); }}
      onConfirm={() => completePurchase(review.liveAmount)}
    />;
  }

  return <View style={styles.screen}>
    <LinearGradient colors={brandGradient} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.header}>
      <HeaderDecor /><TouchableOpacity onPress={handlePinBack} style={styles.back}><Text style={styles.backText}>←</Text></TouchableOpacity>
      <Text style={styles.headerTitle}>Vouchers & Gift Cards</Text>
    </LinearGradient>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.intro}>
        <Text style={styles.title}>PIN Generator</Text>
        <Text style={styles.subtitle}>Select a PIN voucher, choose an amount, then confirm your purchase.</Text>
      </View>

      {/* PIN Generator is Malaysia-only; country is fixed to MY and not selectable. */}

      {loadingCatalog && <Text style={styles.info}>Loading MySheba catalogue…</Text>}
      {!!catalogError && !loadingCatalog && <Text style={styles.error}>{catalogError}</Text>}

      {!loadingCatalog && dynamicProducts.length > 0 && !selectedCategory && !product && <>
        <Text style={styles.label}>Choose PIN Category</Text>
        <View style={styles.tileGrid}>{categorizedProducts.map((category) =>
          <Tile key={category.id} s={{ key: category.tileKey, name: category.title, art: category.art, emoji: category.art ? '' : category.emoji }} onPress={() => setSelectedCategory(category.id)} />
        )}</View>
      </>}

      {!!selectedCategory && !product && <>
        {selectedCategory !== initialCategory && <TouchableOpacity onPress={() => setSelectedCategory(null)} style={styles.backCategory}><Text style={styles.backCategoryText}>← All PIN Categories</Text></TouchableOpacity>}
        <Text style={styles.label}>{categorizedProducts.find((item) => item.id === selectedCategory)?.title || 'PIN Products'}</Text>
        {(() => {
          const items = categorizedProducts.find((item) => item.id === selectedCategory)?.products || [];
          if (!items.length) return loadingCatalog ? null : <Text style={styles.info}>No vouchers are available in this category right now.</Text>;
          // The same native tile as the home grid; a product with no logo of
          // its own falls back to its brand drawing, then to its emoji.
          return <View style={styles.tileGrid}>{items.map((p) =>
            <Tile key={p.code} s={{ key: 'pinProduct_' + String(p.code), name: String(p.name || p.code), imageUrl: p.image_url || '', art: '', emoji: pinProductIcon(p) }} onPress={() => selectProduct(p)} />
          )}</View>;
        })()}
      </>}

      {!!product && <TouchableOpacity onPress={() => { setProduct(null); setSelectedOption(null); setAmount(null); setVoucher(null); }} style={styles.backCategory}><Text style={styles.backCategoryText}>← Back to {(categorizedProducts.find((item) => item.id === selectedCategory)?.title) || 'PIN Categories'}</Text></TouchableOpacity>}

      {!loadingCatalog && !dynamicProducts.length && country === 'MY' && !catalog?.providerId && <>
        <Text style={styles.label}>Legacy Malaysia Voucher</Text>
        <View style={styles.grid}>{MALAYSIA_OPERATORS.map((item) => { const brand = getOperatorBrand(item); return (
          <TouchableOpacity key={item} onPress={() => { setOperator(item); setProduct(null); setSelectedOption(null); setVoucher(null); }} style={[styles.option, operator === item && styles.optionSelected]}>
            {brand.logo ? <View style={styles.logoWrap}><Image source={brand.logo} style={styles.logo} resizeMode="contain" /></View> : <View style={[styles.badge, { backgroundColor: brand.color }]}><Text style={styles.badgeText}>{brand.initials}</Text></View>}
            <Text style={[styles.optionText, operator === item && styles.optionTextSelected]} numberOfLines={2}>{item}</Text>
          </TouchableOpacity>
        ); })}</View>
      </>}

      {!!product && <Text style={styles.label}>{product.name} — Select Amount</Text>}
      {!!product && loadingOptions && <Text style={styles.info}>Loading live denominations…</Text>}
      {!!product && !loadingOptions && options.length > 0 && <DenominationGrid
        items={denominationItems(options, { product, payFor: (value) => {
          // The face value leads; what the wallet pays follows when MySheba's
          // markup or the PIN multiplier makes it different.
          const role = String(profile?.role || 'customer');
          const multiplier = Number(pricing?.rolePricing?.[role]?.rechargePointCostPerUnit ?? pricing?.rechargePointCostPerUnit ?? 1);
          const marked = applyMarkup(pricing, { service: 'rechargePin', country, productCode: product?.code, amount: value }).amount;
          return marked * (Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1);
        } })}
        selectedKey={selectedOption?.code}
        onSelect={({ option }) => { setSelectedOption(option); setAmount(Number(option?.price?.amount ?? option?.denomination)); setVoucher(null); }}
      />}
      {!!product && !loadingOptions && !options.length && <Text style={styles.error}>No amounts are available for this product right now.</Text>}

      {!!product && <>
        {/* The PIN comes back on this screen, not by SMS, so no number is
            asked for: the customer's own is sent when they have one. */}
        {extraFields.map((f) => <View key={String(f.id)}>
          <Text style={styles.label}>{(f.label || f.name || f.id) + (f.required ? ' *' : '')}</Text>
          <TextInput style={styles.input} value={String(fieldValues[f.id] || '')} onChangeText={(v) => setFieldValues((x) => ({ ...x, [f.id]: v }))} placeholder={f.placeholder || ''} placeholderTextColor={colors.textSecondary} autoCapitalize="none" />
        </View>)}
      </>}


      {/* Only once there is something to buy: on a category or product grid the
          tiles are the action, and an inert Next under them read as broken. */}
      {(!!product || !!operator) && <TouchableOpacity disabled={busy || (product ? !selectedOption : !(amount > 0))} onPress={buy} style={styles.buy}><Text style={styles.buyText}>{busy ? 'Processing…' : 'Next'}</Text></TouchableOpacity>}

      {!!(voucher?.pin || voucher?.deliveryLink || voucher?.serialNumber) && <View style={styles.voucher}>
        <Text style={styles.voucherTitle}>Voucher Ready</Text>
        <Text style={styles.voucherMeta}>{voucher.productName || product?.name} • {CURRENCY_BY_COUNTRY[voucher.country || country] || ''} {Number(voucher.amount || amount).toFixed(2)}</Text>
        {!!voucher.pin && <Text selectable style={styles.pin}>{voucher.pin}</Text>}
        {!!voucher.serialNumber && voucher.serialNumber !== voucher.pin && <Text selectable style={styles.warning}>Serial no: {voucher.serialNumber}</Text>}
        {!!voucher.deliveryLink && <Text selectable style={styles.link} onPress={() => Linking.openURL(voucher.deliveryLink).catch(() => {})}>{voucher.deliveryLink}</Text>}
        {!!voucher.expiry && <Text style={styles.warning}>Expires: {voucher.expiry}</Text>}{!!voucher.deliveryNote && <Text style={styles.warning}>{voucher.deliveryNote}</Text>}
        <Text style={styles.warning}>Keep this voucher private. It is shown only after successful provider fulfillment.</Text>
        <TouchableOpacity onPress={printVoucher} style={styles.print}><Text style={styles.printText}>🖨 Print Voucher</Text></TouchableOpacity>
      </View>}

      <Text style={styles.balance}>Wallet: {profile?.walletCurrency || 'MYR'} {Number(profile?.walletBalance || 0).toFixed(2)}</Text>
    </ScrollView>
  </View>;
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function createStyles(colors) { return StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.bg}, header:{flexDirection:'row',alignItems:'center',padding:12,gap:10,overflow:'hidden'}, back:{padding:4},backText:{color:'#fff',fontSize:22},headerTitle:{color:'#fff',fontSize:17,fontWeight:'800',marginLeft:8},
  content:{padding:16,paddingBottom:40}, intro:{backgroundColor:colors.card,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,padding:16,marginBottom:16}, title:{fontSize:21,fontWeight:'800',color:colors.text}, subtitle:{fontSize:12,lineHeight:18,color:colors.textSecondary,marginTop:6}, label:{fontSize:14,fontWeight:'800',color:colors.text,marginTop:8,marginBottom:8},
  grid:{flexDirection:'row',flexWrap:'wrap',gap:9,marginBottom:14}, tileGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'flex-start',columnGap:tileGrid.gap,marginBottom:14}, country:{width:'31%',minHeight:52,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.card,padding:6}, countrySelected:{backgroundColor:colors.primary,borderColor:colors.primary}, countryCode:{fontSize:12,fontWeight:'900',color:colors.primary}, countryName:{fontSize:9,fontWeight:'700',color:colors.text,textAlign:'center',marginTop:2}, countryTextSelected:{color:colors.onPrimary},
  option:{width:'31%',minHeight:82,alignItems:'center',justifyContent:'center',padding:7,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.card}, optionSelected:{borderColor:colors.primary,borderWidth:2,backgroundColor:colors.surfaceElevated || colors.card}, logoWrap:{width:'90%',height:34,borderRadius:7,backgroundColor:'#fff',alignItems:'center',justifyContent:'center',paddingHorizontal:4,marginBottom:7}, logo:{width:'100%',height:27}, badge:{width:32,height:32,borderRadius:16,alignItems:'center',justifyContent:'center',marginBottom:7,backgroundColor:colors.primary}, badgeText:{color:colors.onPrimary,fontWeight:'900'},badgeIcon:{fontSize:21,lineHeight:27},amountIcon:{fontSize:17,marginBottom:2}, optionText:{fontSize:10,fontWeight:'700',textAlign:'center',color:colors.text}, optionTextSelected:{color:colors.primary},
  amount:{width:'31%',minHeight:54,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.card,padding:5}, amountSelected:{backgroundColor:colors.primary,borderColor:colors.primary}, amountText:{fontSize:12,fontWeight:'900',color:colors.text},amountTextSelected:{color:colors.onPrimary},optionMeta:{fontSize:9,color:colors.textSecondary,textAlign:'center',marginTop:2}, backCategory:{paddingVertical:10,marginBottom:8},backCategoryText:{fontSize:13,fontWeight:'800',color:colors.primary},
  info:{padding:12,color:colors.textSecondary,fontSize:12},input:{backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:12,color:colors.text,minHeight:44,marginBottom:10},error:{padding:12,color:colors.danger || colors.text,fontSize:12},buy:{marginTop:6,backgroundColor:colors.primary,borderRadius:radius.md,paddingVertical:14,alignItems:'center'},buyText:{color:colors.onPrimary,fontWeight:'800',fontSize:14},voucher:{marginTop:18,backgroundColor:colors.card,borderRadius:radius.lg,borderWidth:1.5,borderColor:colors.primary,padding:18,alignItems:'center'},voucherTitle:{fontSize:18,fontWeight:'800',color:colors.text},voucherMeta:{marginTop:5,color:colors.textSecondary,fontSize:12,textAlign:'center'},pin:{marginVertical:18,fontSize:27,fontWeight:'900',letterSpacing:4,color:colors.primary,textAlign:'center'},link:{marginVertical:15,fontSize:12,color:colors.primary,textAlign:'center'},warning:{marginTop:8,fontSize:11,lineHeight:16,textAlign:'center',color:colors.textSecondary},print:{marginTop:14,borderRadius:radius.md,borderWidth:1,borderColor:colors.primary,paddingVertical:11,paddingHorizontal:20},printText:{color:colors.primary,fontWeight:'800'},balance:{marginTop:18,textAlign:'center',fontSize:11,color:colors.textSecondary}
});}
