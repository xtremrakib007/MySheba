import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Image } from 'react-native';
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
import { radius } from '../theme/theme';

// Recharge PIN is currently a Malaysia-only product. Keep this list
// intentionally limited so the screen cannot show unrelated country products.
const IIMMPACT_COUNTRIES = [['MY', 'Malaysia']];
const CURRENCY_BY_COUNTRY = { MY: 'MYR', SG: 'SGD', ID: 'IDR', IN: 'INR', PH: 'PHP', NP: 'NPR', PK: 'PKR', MM: 'MMK', KH: 'KHR' };
const MALAYSIA_OPERATORS = rechargePinBrands.MY || ['Celcom', 'CelcomDigi', 'U Mobile', 'Hotlink', 'XOX', 'Tunetalk', 'Unifi', 'Yes', "Touch 'n Go eWallet"];
const AMOUNTS = [10, 20, 30, 50, 100];
const PIN_CATEGORIES = [
  { id: 'mobile', title: 'Mobile Operator PIN', pattern: /digi|celcom|hotlink|maxis|u mobile|umobile|xox|tunetalk|unifi mobile|yes telco|hello sim|mobile.*pin|telco/i },
  { id: 'coffee', title: 'Coffee & Tea', pattern: /coffee|cafe|tea|tealive|starbucks|zuss|oldtown|kenangan/i },
  { id: 'wellness', title: 'Health & Wellness', pattern: /health|wellness|beauty|guardian|watsons|pharmacy|fitness|spa/i },
  { id: 'transport', title: 'Transport', pattern: /grab|transport|ride|taxi|bus|train|rapid|myrapid|touch.?n.?go|tng/i },
  { id: 'apple', title: 'Apple & iTunes', pattern: /apple|itunes|app store/i },
  { id: 'shopping', title: 'Shopping PIN', pattern: /shopping|retail|shopee|lazada|mall|fashion|gift card|voucher/i },
  { id: 'grocery', title: 'Grocery & GrabMart', pattern: /grocery|grabmart|grab mart|supermarket|foodpanda|pandamart/i },
  { id: 'other', title: 'Other PIN & Vouchers', pattern: /.*/ },
];
const FEATURED_PIN_ORDER = [
  /digi.*internet.*pin|internet.*pin.*digi/i,
  /digipin|digi.*pin/i,
  /hello.*sim.*pin|hello.*pin/i,
];

function isVoucherProduct(product) {
  if (!product || product.is_active === false || !product.code) return false;
  const text = String(product.name || '') + ' ' + String(product.note || '') + ' ' + String(product.product_group || '');
  return String(product.processing_time || '').toLowerCase() === 'pin'
    || /voucher|gift card|giftcard|digital code|gaming code/i.test(text);
}

function pricingField(product) {
  const fields = Array.isArray(product?.fields) ? product.fields : [];
  return fields.find((f) => f && (f.role === 'pricing' || f.type === 'select')) || null;
}

export default function RechargePinScreen({ initialCategory = null } = {}) {
  const { colors, brandGradient } = useTheme();
  const { goBackOrHome, profile } = useApp();
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

  useEffect(() => {
    let alive = true;
    setCatalog(null); setCatalogError(''); setProduct(null); setOptions([]);
    setSelectedOption(null); setOperator(''); setAmount(null); setVoucher(null); setSelectedCategory(initialCategory);
    setLoadingCatalog(true);
    apiProviderService.getIimmpactCatalogForUser('', 'Recharge PIN', country)
      .then((data) => { if (alive) setCatalog(data || {}); })
      .catch((e) => { if (alive) setCatalogError(e?.message || 'IIMMPACT voucher catalogue is unavailable.'); })
      .finally(() => { if (alive) setLoadingCatalog(false); });
    return () => { alive = false; };
  }, [country]);

  const dynamicProducts = useMemo(() => {
    const products = Object.values(catalog?.products || {}).filter(isVoucherProduct);
    const rank = (p) => {
      const name = String(p.name || '');
      const i = FEATURED_PIN_ORDER.findIndex((pattern) => pattern.test(name));
      return i < 0 ? FEATURED_PIN_ORDER.length : i;
    };
    return products.sort((a, b) => rank(a) - rank(b) || String(a.name || '').localeCompare(String(b.name || '')));
  }, [catalog]);

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

  const categorizedProducts = useMemo(() => {
    const known = PIN_CATEGORIES.slice(0, -1);
    return PIN_CATEGORIES.map((category) => ({
      ...category,
      products: dynamicProducts.filter((p) => {
        const text = [p.name, p.note, p.product_group, p.category, p.subcategory].filter(Boolean).join(' ');
        return category.id === 'other'
          ? !known.some((item) => item.pattern.test(text))
          : category.pattern.test(text);
      }),
    })).filter((category) => category.products.length > 0);
  }, [dynamicProducts]);

  const selectProduct = (p) => {
    setProduct(p); setVoucher(null); setOperator(''); setSelectedOption(null); setAmount(null);
  };

  const buy = async () => {
    if (busy) return;
    const liveAmount = Number(selectedOption?.price?.amount ?? selectedOption?.denomination ?? amount);
    if (!product) return showAlert('Voucher', 'Please select a voucher product.');
    if (!(liveAmount > 0)) return showAlert('Voucher', 'Please select a denomination.');
    const currency = selectedOption?.price?.currency || product?.denomination_currency || 'MYR';
    showAlert(
      'Confirm PIN Purchase',
      'Product: ' + String(product.name || '') + '\\nAmount: ' + currency + ' ' + liveAmount.toFixed(2) + '\\nPayment will be taken from your MySheba wallet. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm & Pay', onPress: async () => { await completePurchase(liveAmount); } },
      ],
    );
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
      });
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

  return <View style={styles.screen}>
    <LinearGradient colors={brandGradient} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.header}>
      <HeaderDecor /><TouchableOpacity onPress={goBackOrHome} style={styles.back}><Text style={styles.backText}>←</Text></TouchableOpacity>
      <Text style={styles.headerTitle}>Vouchers & Gift Cards</Text>
    </LinearGradient>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.intro}>
        <Text style={styles.title}>PIN Generator</Text>
        <Text style={styles.subtitle}>Select a PIN voucher, choose an amount, then confirm your purchase.</Text>
      </View>

      {/* PIN Generator is Malaysia-only; country is fixed to MY and not selectable. */}

      {loadingCatalog && <Text style={styles.info}>Loading live IIMMPACT voucher products…</Text>}
      {!!catalogError && !loadingCatalog && <Text style={styles.error}>{catalogError}</Text>}

      {!loadingCatalog && dynamicProducts.length > 0 && !selectedCategory && !product && <>
        <Text style={styles.label}>Choose PIN Category</Text>
        <View style={styles.grid}>{categorizedProducts.map((category) =>
          <TouchableOpacity key={category.id} onPress={() => setSelectedCategory(category.id)} style={styles.option}>
            <View style={styles.badge}><Text style={styles.badgeText}>{category.id === 'mobile' ? 'M' : category.id === 'coffee' ? 'C' : category.id === 'wellness' ? 'H' : category.id === 'transport' ? 'T' : category.id === 'apple' ? 'A' : category.id === 'shopping' ? 'S' : category.id === 'grocery' ? 'G' : 'O'}</Text></View>
            <Text style={styles.optionText} numberOfLines={3}>{category.title}</Text>
            <Text style={styles.optionMeta}>{category.products.length} products</Text>
          </TouchableOpacity>
        )}</View>
      </>}

      {!!selectedCategory && !product && <>
        <TouchableOpacity onPress={() => setSelectedCategory(null)} style={styles.backCategory}><Text style={styles.backCategoryText}>← All PIN Categories</Text></TouchableOpacity>
        <Text style={styles.label}>{categorizedProducts.find((item) => item.id === selectedCategory)?.title || 'PIN Products'}</Text>
        <View style={styles.grid}>{(categorizedProducts.find((item) => item.id === selectedCategory)?.products || []).map((p) =>
          <TouchableOpacity key={p.code} onPress={() => selectProduct(p)} style={styles.option}>
            {p.image_url ? <View style={styles.logoWrap}><Image source={{ uri: p.image_url }} style={styles.logo} resizeMode="contain" /></View> : <View style={styles.badge}><Text style={styles.badgeText}>{String(p.name || 'P').slice(0,1).toUpperCase()}</Text></View>}
            <Text style={styles.optionText} numberOfLines={3}>{p.name}</Text>
          </TouchableOpacity>
        )}</View>
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
      {!!product && !loadingOptions && options.length > 0 && <View style={styles.grid}>{options.map((item) => {
        const value = Number(item?.price?.amount ?? item?.denomination);
        const currency = item?.price?.currency || product?.denomination_currency || CURRENCY_BY_COUNTRY[country] || '';
        return <TouchableOpacity key={item.code} onPress={() => { setSelectedOption(item); setAmount(value); setVoucher(null); }} style={[styles.amount, selectedOption?.code === item.code && styles.amountSelected]}>
          <Text style={[styles.amountText, selectedOption?.code === item.code && styles.amountTextSelected]}>{currency} {Number.isFinite(value) ? value : item.label || item.code}</Text>
          {!!item.label && <Text style={styles.optionMeta} numberOfLines={2}>{item.label}</Text>}
        </TouchableOpacity>;
      })}</View>}
      {!!product && !loadingOptions && !options.length && <Text style={styles.error}>IIMMPACT returned no active denominations for this product.</Text>}

      {!product && !dynamicProducts.length && country === 'MY' && !catalog?.providerId && !!operator && <>
        <Text style={styles.label}>Legacy Denomination</Text>
        <View style={styles.grid}>{AMOUNTS.map((item) => <TouchableOpacity key={item} onPress={() => { setAmount(item); setVoucher(null); }} style={[styles.amount, amount === item && styles.amountSelected]}><Text style={[styles.amountText, amount === item && styles.amountTextSelected]}>MYR {item}</Text></TouchableOpacity>)}</View>
      </>}

      <TouchableOpacity disabled={busy || (!operator && (!product || !selectedOption) && !(amount > 0))} onPress={buy} style={styles.buy}><Text style={styles.buyText}>{busy ? 'Processing…' : 'Next'}</Text></TouchableOpacity>

      {!!(voucher?.pin || voucher?.deliveryLink) && <View style={styles.voucher}>
        <Text style={styles.voucherTitle}>Voucher Ready</Text>
        <Text style={styles.voucherMeta}>{voucher.productName || product?.name} • {CURRENCY_BY_COUNTRY[voucher.country || country] || ''} {Number(voucher.amount || amount).toFixed(2)}</Text>
        {!!voucher.pin && <Text selectable style={styles.pin}>{voucher.pin}</Text>}
        {!!voucher.deliveryLink && <Text selectable style={styles.link}>{voucher.deliveryLink}</Text>}
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
  grid:{flexDirection:'row',flexWrap:'wrap',gap:9,marginBottom:14}, country:{width:'31%',minHeight:52,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.card,padding:6}, countrySelected:{backgroundColor:colors.primary,borderColor:colors.primary}, countryCode:{fontSize:12,fontWeight:'900',color:colors.primary}, countryName:{fontSize:9,fontWeight:'700',color:colors.text,textAlign:'center',marginTop:2}, countryTextSelected:{color:colors.onPrimary},
  option:{width:'31%',minHeight:82,alignItems:'center',justifyContent:'center',padding:7,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.card}, optionSelected:{borderColor:colors.primary,borderWidth:2,backgroundColor:colors.surfaceElevated || colors.card}, logoWrap:{width:'90%',height:34,borderRadius:7,backgroundColor:'#fff',alignItems:'center',justifyContent:'center',paddingHorizontal:4,marginBottom:7}, logo:{width:'100%',height:27}, badge:{width:32,height:32,borderRadius:16,alignItems:'center',justifyContent:'center',marginBottom:7,backgroundColor:colors.primary}, badgeText:{color:colors.onPrimary,fontWeight:'900'}, optionText:{fontSize:10,fontWeight:'700',textAlign:'center',color:colors.text}, optionTextSelected:{color:colors.primary},
  amount:{width:'31%',minHeight:54,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.card,padding:5}, amountSelected:{backgroundColor:colors.primary,borderColor:colors.primary}, amountText:{fontSize:12,fontWeight:'900',color:colors.text},amountTextSelected:{color:colors.onPrimary},optionMeta:{fontSize:9,color:colors.textSecondary,textAlign:'center',marginTop:2}, backCategory:{paddingVertical:10,marginBottom:8},backCategoryText:{fontSize:13,fontWeight:'800',color:colors.primary},
  info:{padding:12,color:colors.textSecondary,fontSize:12},error:{padding:12,color:colors.danger || colors.text,fontSize:12},buy:{marginTop:6,backgroundColor:colors.primary,borderRadius:radius.md,paddingVertical:14,alignItems:'center'},buyText:{color:colors.onPrimary,fontWeight:'800',fontSize:14},voucher:{marginTop:18,backgroundColor:colors.card,borderRadius:radius.lg,borderWidth:1.5,borderColor:colors.primary,padding:18,alignItems:'center'},voucherTitle:{fontSize:18,fontWeight:'800',color:colors.text},voucherMeta:{marginTop:5,color:colors.textSecondary,fontSize:12,textAlign:'center'},pin:{marginVertical:18,fontSize:27,fontWeight:'900',letterSpacing:4,color:colors.primary,textAlign:'center'},link:{marginVertical:15,fontSize:12,color:colors.primary,textAlign:'center'},warning:{marginTop:8,fontSize:11,lineHeight:16,textAlign:'center',color:colors.textSecondary},print:{marginTop:14,borderRadius:radius.md,borderWidth:1,borderColor:colors.primary,paddingVertical:11,paddingHorizontal:20},printText:{color:colors.primary,fontWeight:'800'},balance:{marginTop:18,textAlign:'center',fontSize:11,color:colors.textSecondary}
});}
