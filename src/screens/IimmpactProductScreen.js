import React, { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, Alert, ActivityIndicator, Image, Modal, Share } from 'react-native';
import { printTransactionReceipt } from '../utils/printService';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import * as api from '../firebase/apiProviderService';
import { radius } from '../theme/theme';

const norm = (v) => String(v || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
const pathValue = (obj, path) => String(path || '').split('.').filter(Boolean).reduce((v, key) => v == null ? undefined : v[key], obj);
const rawValue = (values, selected, fieldId) => selected?.[fieldId] !== undefined ? selected[fieldId] : values?.[fieldId];
const displayValue = (value) => {
  if (value == null) return '';
  if (typeof value === 'object') return String(value.label || value.description || value.name || value.code || '');
  return String(value);
};

function flattenGroups(groups = []) {
  return groups.flatMap((group) => (group?.categories || []).map((category) => ({
    name: category?.name || group?.name || 'Other',
    codes: Array.isArray(category?.product_codes) ? category.product_codes.map(String) : [],
  })));
}

function inputKeyboard(field) {
  const mode = String(field?.input_mode || '').toLowerCase();
  if (mode === 'decimal') return 'decimal-pad';
  if (mode === 'numeric' || field?.type === 'number') return 'numeric';
  if (mode === 'tel') return 'phone-pad';
  return 'default';
}

function optionLabel(option, showWholesale = false) {
  const parts = [option?.label || option?.description || option?.code];
  if (option?.validity) parts.push(option.validity);
  const price = option?.price?.amount;
  if (price != null) parts.push('Sell RM ' + Number(price).toFixed(2));
  const cost = option?.cost?.amount;
  if (showWholesale && cost != null) parts.push('Provider cost RM ' + Number(cost).toFixed(4));
  const rrp = option?.rrp?.amount;
  if (showWholesale && rrp != null) parts.push('RRP RM ' + Number(rrp).toFixed(2));
  return parts.filter(Boolean).join(' • ');
}

export default function IimmpactProductScreen({ category }) {
  const decodedCategory = useMemo(() => {
    try { return decodeURIComponent(String(category || '')); } catch { return String(category || ''); }
  }, [category]);

  const { goBackOrHome, profile } = useApp();
  const isSuperadmin = String(profile?.role || '').toLowerCase() === 'superadmin';
  const { colors, brandGradient } = useTheme();
  const [catalog, setCatalog] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [values, setValues] = useState({});
  const [selectedOptions, setSelectedOptions] = useState({});
  const [options, setOptions] = useState({});
  const [optionBusy, setOptionBusy] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [pendingPurchase, setPendingPurchase] = useState(null);
  const [search, setSearch] = useState({});
  const styles = makeStyles(colors);

  useEffect(() => {
    let alive = true;
    const cacheKey = '@mysheba/iimmpact-catalog/MY/v1';
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(cacheKey);
        if (alive && saved) {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed === 'object') setCatalog(parsed);
        }
      } catch (_) {}
      try {
        const data = await api.getIimmpactFullCatalogForUser('MY');
        if (alive && data && typeof data === 'object') {
          setCatalog(data);
          setError('');
          try { await AsyncStorage.setItem(cacheKey, JSON.stringify(data)); } catch (_) {}
        }
      } catch (e) {
        if (alive && !catalog) setError(e?.message || 'IIMMPACT catalogue unavailable.');
      }
    })();
    return () => { alive = false; };
  }, []);

  const products = catalog?.products || {};
  const match = useMemo(() => {
    const wanted = norm(decodedCategory);
    return flattenGroups(catalog?.tree?.groups || []).find((x) => norm(x.name) === wanted || norm(x.name).includes(wanted) || wanted.includes(norm(x.name)));
  }, [catalog, decodedCategory]);

  const productList = useMemo(() => (match?.codes || [])
    .map((code) => products[code])
    .filter((p) => p && p.is_active !== false && p.code), [match, products]);

  useEffect(() => {
    setSelectedProduct(null);
    setValues({});
    setSelectedOptions({});
    setOptions({});
    setOptionBusy({});
    setError('');
  }, [decodedCategory]);

  const fields = useMemo(() => Array.isArray(selectedProduct?.fields)
    ? [...selectedProduct.fields].sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))
    : [], [selectedProduct]);

  // Catalog-driven Options API. Static reference fields and dynamic user-specific
  // fields use the same callable; dynamic fields are only requested after their
  // declared dependencies are filled.
  useEffect(() => {
    if (!selectedProduct) return;
    let cancelled = false;
    const load = async (field) => {
      if (!field || field.type !== 'select') return;
      const source = field.data_source || {};
      const deps = Array.isArray(source.depends_on) ? source.depends_on : [];
      if (deps.some((id) => !displayValue(rawValue(values, selectedOptions, id)).trim())) return;

      setOptionBusy((x) => ({ ...x, [field.id]: true }));
      try {
        const params = source.params || {};
        const resolveParam = (spec) => {
          if (!spec || typeof spec !== 'object') return '';
          if (spec.static !== undefined) return spec.static;
          if (spec.from_field) {
            const value = rawValue(values, selectedOptions, spec.from_field);
            return typeof value === 'object' ? String(value.code || value.account_number || value.value || '') : String(value ?? '');
          }
          return '';
        };
        const productCode = String(resolveParam(params.product_code) || selectedProduct.code);
        const fieldId = String(resolveParam(params.field_id) || field.id);
        const accountNumber = String(resolveParam(params.account_number) || '');
        const billerCode = String(resolveParam(params.biller_code) || '');
        const result = await api.getIimmpactOptions({
          productCode,
          fieldId,
          accountNumber,
          billerCode,
          limit: source.type === 'reference' ? 25000 : 100,
          page: 1,
          service: 'IIMMPACT',
          country: 'MY',
        });
        if (!cancelled) setOptions((x) => ({ ...x, [field.id]: Array.isArray(result?.items) ? result.items : [] }));
      } catch (e) {
        if (!cancelled) setOptions((x) => ({ ...x, [field.id]: [] }));
      } finally {
        if (!cancelled) setOptionBusy((x) => ({ ...x, [field.id]: false }));
      }
    };
    fields.filter((f) => f.type === 'select').forEach(load);
    return () => { cancelled = true; };
  }, [selectedProduct, fields, values, selectedOptions]);

  const setField = (field, value) => {
    setValues((current) => ({ ...current, [field.id]: value }));
    // Changing an upstream dependency invalidates dependent options/selections.
    setSelectedOptions((current) => {
      const next = { ...current };
      for (const child of fields) {
        const deps = Array.isArray(child?.data_source?.depends_on) ? child.data_source.depends_on : [];
        if (deps.includes(field.id)) delete next[child.id];
      }
      return next;
    });
  };

  const chooseOption = (field, option) => {
    setSelectedOptions((current) => ({ ...current, [field.id]: option }));
    setValues((current) => ({ ...current, [field.id]: option }));
  };

  const validate = () => {
    for (const field of fields) {
      const value = rawValue(values, selectedOptions, field.id);
      const shown = displayValue(value).trim();
      if (field.required && !shown) return 'Please complete: ' + (field.label || field.id);
      if (!shown) continue;
      const validation = field.validation || {};
      if (validation.pattern) {
        try {
          if (!new RegExp(validation.pattern).test(shown)) return validation.message || ('Invalid ' + (field.label || field.id));
        } catch {}
      }
      const number = Number(shown);
      if ((field.type === 'number' || field.type === 'money') && Number.isFinite(number)) {
        if (validation.min != null && number < Number(validation.min)) return (field.label || field.id) + ' is below the minimum.';
        if (validation.max != null && number > Number(validation.max)) return (field.label || field.id) + ' exceeds the maximum.';
      }
    }
    return '';
  };

  const fulfillmentValue = (spec) => {
    if (!spec || !spec.from_field) return '';
    const value = rawValue(values, selectedOptions, spec.from_field);
    if (spec.path) return pathValue(value, spec.path);
    return value;
  };

  const buy = async () => {
    const validationError = validate();
    if (validationError) return Alert.alert('Check details', validationError);
    const fulfillment = selectedProduct?.fulfillment || {};
    const fulfillmentValue = (spec) => {
      if (!spec || !spec.from_field) return '';
      const value = rawValue(values, selectedOptions, spec.from_field);
      if (spec.path) return pathValue(value, spec.path);
      return value;
    };
    const accountValue = fulfillmentValue(fulfillment.account);
    const amountValue = fulfillmentValue(fulfillment.amount);
    const fallbackAccount = String(values.__account || '').trim();
    const fallbackAmount = Number(values.__amount);
    const accountNumber = (typeof accountValue === 'object'
      ? String(accountValue.account_number || accountValue.code || '').trim()
      : String(accountValue || '').trim()) || fallbackAccount;
    const amount = Number.isFinite(Number(amountValue)) && Number(amountValue) > 0 ? Number(amountValue) : fallbackAmount;
    if (!selectedProduct?.code) return;
    if (!accountNumber) return Alert.alert('Account required', 'Enter the account, phone, player ID or reference required for this product.');
    if (!Number.isFinite(amount) || amount <= 0) return Alert.alert('Amount required', 'Select a package or enter a valid amount.');
    const extras = {};
    for (const [key, spec] of Object.entries(fulfillment.extras || {})) {
      const value = fulfillmentValue(spec);
      if ((value == null || value === '') && spec.omit_if_empty) continue;
      if (value == null || value === '') continue;
      extras[key] = typeof value === 'object' ? (value.code || value.account_number || value.value || '') : value;
    }
    const pricingField = fields.find((field) => field.role === 'pricing' && field.type === 'select');
    const pricingOption = pricingField ? selectedOptions[pricingField.id] : null;
    const sellAmount = Number(pricingOption?.price?.amount ?? amount);
    setPendingPurchase({
      accountNumber, amount, extras, sellAmount, pricingOption,
      productCode: String(selectedProduct.code),
      productName: String(selectedProduct.name || selectedProduct.code),
      selectedFields: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, displayValue(value)])),
    });
    setReviewing(true);
  };

  // This is the only customer action that submits a purchase to IIMMPACT.
  // Catalogue and option lookups above are read-only; no charge is submitted
  // until the customer explicitly taps Confirm & Pay in the review modal.
  const confirmBuy = async () => {
    if (!pendingPurchase || busy) return;
    const purchase = pendingPurchase;
    setBusy(true);
    try {
      const requestId = 'ms_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
      const result = await api.chargeIimmpactProduct({
        requestId,
        amount: purchase.sellAmount,
        total: purchase.sellAmount,
        raw: {
          country: 'MY',
          productCode: purchase.productCode,
          accountNumber: purchase.accountNumber,
          amount: purchase.sellAmount,
          providerAmount: purchase.amount,
          packageCostAmount: purchase.amount,
          subproductCode: purchase.pricingOption?.code || '',
          optionCode: purchase.pricingOption?.code || '',
          extras: purchase.extras,
          fieldValues: purchase.selectedFields,
          selectedOptions,
          remarks: purchase.productName.slice(0, 200),
        },
      }, { uid: profile?.id || '', phone: profile?.phone || '' });
      const tx = {
        id: String(result?.id || ''),
        service: purchase.productName,
        details: purchase.accountNumber,
        amount: purchase.sellAmount,
        total: purchase.sellAmount,
        status: 'pending',
        customerPhone: profile?.phone || '',
        createdAt: new Date(),
      };
      setReviewing(false);
      Alert.alert('Order submitted', 'Transaction ' + tx.id + ' has been accepted. The final status will update when the provider responds.', [
        { text: 'Print', onPress: () => printTransactionReceipt(tx, profile || {}).catch((e) => Alert.alert('Print receipt', e?.message || 'Could not print receipt.')) },
        { text: 'Share', onPress: () => Share.share({ title: 'MySheba Receipt', message: [
          'MySheba Transaction Receipt', 'Service: ' + tx.service, 'Account: ' + tx.details,
          'Transaction ID: ' + tx.id, 'Amount: MYR ' + Number(tx.amount).toFixed(2),
          'Status: PENDING', 'Provider cost and commission are not included.',
        ].join('\n') }).catch(() => {}) },
        { text: 'OK', onPress: goBackOrHome },
      ]);
      setPendingPurchase(null);
    } catch (e) {
      Alert.alert('Order failed', e?.message || 'Unable to complete this purchase.');
    } finally {
      setBusy(false);
    }
  };

  const st = styles;

  if (error) {
    return (
      <View style={st.screen}>
        <LinearGradient colors={brandGradient} style={st.head}><HeaderDecor /><TouchableOpacity onPress={goBackOrHome}><Text style={st.back}>←</Text></TouchableOpacity><Text style={st.ht}>Marketplace</Text></LinearGradient>
        <Text style={st.err}>{error}</Text>
      </View>
    );
  }

  if (!catalog) {
    return (
      <View style={st.screen}>
        <LinearGradient colors={brandGradient} style={st.head}><HeaderDecor /><TouchableOpacity onPress={goBackOrHome}><Text style={st.back}>←</Text></TouchableOpacity><Text style={st.ht}>Marketplace</Text></LinearGradient>
        <View style={st.loading}><ActivityIndicator color={colors.primary} /><Text style={st.muted}>Loading catalogue…</Text></View>
      </View>
    );
  }

  return (
    <View style={st.screen}>
      <LinearGradient colors={brandGradient} style={st.head}>
        <HeaderDecor />
        <TouchableOpacity onPress={selectedProduct ? () => { setSelectedProduct(null); setValues({}); setSelectedOptions({}); } : goBackOrHome}><Text style={st.back}>←</Text></TouchableOpacity>
        <View style={{flex:1}}><Text style={st.ht}>{decodedCategory || 'Marketplace'}</Text><Text style={st.hs}>IIMMPACT • live catalogue</Text></View>
      </LinearGradient>

      <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">
        {!selectedProduct ? (
          <>
            <Text style={st.h}>Products</Text>
            <Text style={st.muted}>{productList.length} active product{productList.length === 1 ? '' : 's'} in this category.</Text>
            <View style={st.productGrid}>
              {productList.map((product) => (
                <TouchableOpacity key={product.code} style={st.productCard} onPress={() => { setSelectedProduct(product); setValues({}); setSelectedOptions({}); setOptions({}); }}>
                  {product.image_url ? <Image source={{uri: product.image_url}} style={st.productLogo} resizeMode="contain" /> : <View style={st.productFallback}><Text style={st.productFallbackText}>I</Text></View>}
                  <Text style={st.productName} numberOfLines={3}>{product.name || product.code}</Text>
                  {!!product.processing_time && <Text style={st.processing}>{String(product.processing_time).replace(/_/g, ' ')}</Text>}
                  <Text style={st.buySmall}>Select</Text>
                </TouchableOpacity>
              ))}
            </View>
            {!productList.length && <Text style={st.empty}>No active products are currently published in this category.</Text>}
          </>
        ) : (
          <>
            <View style={st.productHero}>
              {selectedProduct.image_url ? <Image source={{uri:selectedProduct.image_url}} style={st.heroLogo} resizeMode="contain" /> : null}
              <View style={{flex:1}}>
                <Text style={st.h}>{selectedProduct.name || selectedProduct.code}</Text>
                <Text style={st.muted}>{selectedProduct.note || 'Complete the catalogue-defined fields below.'}</Text>
                {!!selectedProduct.processing_time && <Text style={st.processing}>Processing: {String(selectedProduct.processing_time).replace(/_/g, ' ')}</Text>}
              </View>
            </View>

            {(() => {
              const fulfillment = selectedProduct?.fulfillment || {};
              const accountFieldId = String(fulfillment?.account?.from_field || '');
              const amountFieldId = String(fulfillment?.amount?.from_field || '');
              const hasAccountField = accountFieldId && fields.some((field) => String(field.id) === accountFieldId);
              const hasAmountField = amountFieldId && fields.some((field) => String(field.id) === amountFieldId);
              return (
                <>
                  {!hasAccountField && (
                    <View style={st.field}>
                      <Text style={st.label}>Account / Recipient *</Text>
                      <TextInput
                        style={st.input}
                        placeholder="Enter account, phone, player ID or recipient"
                        placeholderTextColor={colors.textSecondary}
                        value={String(values.__account || '')}
                        onChangeText={(text) => setValues((x) => ({...x, __account: text}))}
                        autoCapitalize="none"
                      />
                    </View>
                  )}
                  {!hasAmountField && (
                    <View style={st.field}>
                      <Text style={st.label}>Amount / Denomination *</Text>
                      <TextInput
                        style={st.input}
                        placeholder="Enter amount"
                        placeholderTextColor={colors.textSecondary}
                        value={String(values.__amount || '')}
                        onChangeText={(text) => setValues((x) => ({...x, __amount: text}))}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  )}
                </>
              );
            })()}
            {fields.map((field) => {
              const id = String(field.id || field.name || '');
              const value = rawValue(values, selectedOptions, id);
              const list = options[id] || [];
              const busyField = optionBusy[id];
              const query = String(search[id] || '').trim().toLowerCase();
              const filtered = query
                ? list.filter((option) => optionLabel(option).toLowerCase().includes(query)).slice(0, 100)
                : list.slice(0, 100);
              const isSelect = field.type === 'select';
              return (
                <View key={id} style={st.field}>
                  <Text style={st.label}>{field.label || field.name || id}{field.required ? ' *' : ''}</Text>
                  {isSelect ? (
                    <>
                      {list.length > 20 && (
                        <TextInput
                          style={st.input}
                          placeholder="Search options"
                          placeholderTextColor={colors.textSecondary}
                          value={search[id] || ''}
                          onChangeText={(text) => setSearch((x) => ({...x, [id]: text}))}
                        />
                      )}
                      {busyField && <View style={st.optionLoading}><ActivityIndicator color={colors.primary} /><Text style={st.muted}>Loading options…</Text></View>}
                      {!busyField && !list.length && <Text style={st.muted}>Enter the required information above to load options.</Text>}
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.optionRow}>
                        {filtered.map((option, index) => {
                          const selected = selectedOptions[id]?.code === option?.code;
                          return (
                            <TouchableOpacity key={String(option?.code || index)} style={[st.option, selected && st.optionSelected]} onPress={() => chooseOption(field, option)}>
                              <Text style={[st.optionText, selected && st.optionTextSelected]}>{optionLabel(option, isSuperadmin)}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                      {list.length > 100 && <Text style={st.muted}>Showing first 100 matches. Search to narrow the list.</Text>}
                    </>
                  ) : (
                    <TextInput
                      style={st.input}
                      placeholder={field.placeholder || field.label || id}
                      placeholderTextColor={colors.textSecondary}
                      value={displayValue(value)}
                      onChangeText={(text) => setField(field, text)}
                      keyboardType={inputKeyboard(field)}
                      autoCapitalize="none"
                    />
                  )}
                </View>
              );
            })}

            <TouchableOpacity disabled={busy} style={[st.buy, busy && {opacity:0.6}]} onPress={buy}>
              <Text style={st.buyText}>{busy ? 'Preparing review…' : 'Review purchase'}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      <Modal visible={reviewing && !!pendingPurchase} transparent animationType="slide" onRequestClose={() => setReviewing(false)}>
        <View style={st.confirmOverlay}>
          <View style={st.confirmCard}>
            <Text style={st.confirmTitle}>Confirm {pendingPurchase?.productName || 'Purchase'}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <View style={st.confirmRow}><Text style={st.confirmLabel}>Product</Text><Text style={st.confirmValue}>{pendingPurchase?.productName}</Text></View>
              <View style={st.confirmRow}><Text style={st.confirmLabel}>Account / recipient</Text><Text style={st.confirmValue}>{pendingPurchase?.accountNumber}</Text></View>
              {Object.entries(pendingPurchase?.selectedFields || {}).filter(([k,v]) => v && !/(pin|password|token|secret|otp)/i.test(k)).map(([k,v]) => <View key={k} style={st.confirmRow}><Text style={st.confirmLabel}>{k.replace(/([A-Z])/g, ' $1')}</Text><Text style={st.confirmValue}>{v}</Text></View>)}
              <View style={st.confirmRow}><Text style={st.confirmLabel}>Selling price</Text><Text style={st.confirmValue}>MYR {Number(pendingPurchase?.sellAmount || 0).toFixed(2)}</Text></View>
              {isSuperadmin && <>
                <View style={st.confirmRow}><Text style={st.confirmLabel}>Provider cost price</Text><Text style={st.confirmValue}>MYR {Number(pendingPurchase?.pricingOption?.cost?.amount ?? pendingPurchase?.amount ?? 0).toFixed(4)}</Text></View>
                <View style={st.confirmRow}><Text style={st.confirmLabel}>Commission / margin</Text><Text style={st.confirmValue}>MYR {(Number(pendingPurchase?.sellAmount || 0) - Number(pendingPurchase?.pricingOption?.cost?.amount ?? pendingPurchase?.amount ?? 0)).toFixed(2)}</Text></View>
              </>}
              <View style={st.confirmRow}><Text style={st.confirmLabel}>Total wallet deduction</Text><Text style={st.confirmTotal}>MYR {Number(pendingPurchase?.sellAmount || 0).toFixed(2)}</Text></View>
            </ScrollView>
            <View style={st.confirmActions}>
              <TouchableOpacity style={[st.confirmBtn, st.cancelBtn]} onPress={() => setReviewing(false)} disabled={busy}><Text style={st.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[st.confirmBtn, st.payBtn, busy && {opacity:0.6}]} onPress={confirmBuy} disabled={busy}><Text style={st.payText}>{busy ? 'Submitting…' : 'Confirm & Pay'}</Text></TouchableOpacity>
            </View>
            <Text style={st.confirmHint}>Printed and shared receipts include customer-facing details only, never provider cost or commission.</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  confirmOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.58)',justifyContent:'center',padding:18},confirmCard:{backgroundColor:c.card,borderRadius:16,padding:16,maxHeight:'88%',borderWidth:1,borderColor:c.border},confirmTitle:{fontSize:18,fontWeight:'900',color:c.text,marginBottom:12},confirmRow:{flexDirection:'row',justifyContent:'space-between',gap:12,paddingVertical:9,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:c.border},confirmLabel:{flex:1,fontSize:12,color:c.textSecondary},confirmValue:{flex:1,fontSize:12,fontWeight:'700',color:c.text,textAlign:'right'},confirmTotal:{fontSize:15,fontWeight:'900',color:c.primary},confirmActions:{flexDirection:'row',gap:10,marginTop:14},confirmBtn:{flex:1,minHeight:44,borderRadius:9,alignItems:'center',justifyContent:'center'},cancelBtn:{borderWidth:1,borderColor:c.primary},payBtn:{backgroundColor:c.primary},cancelText:{fontWeight:'800',color:c.primary},payText:{fontWeight:'900',color:c.onPrimary},confirmHint:{fontSize:10,color:c.textSecondary,marginTop:10,lineHeight:15},
  screen:{flex:1,backgroundColor:c.bg},head:{flexDirection:'row',alignItems:'center',padding:12,gap:10,overflow:'hidden'},
  back:{color:'#fff',fontSize:22},ht:{color:'#fff',fontSize:17,fontWeight:'900'},hs:{color:'#ffffffcc',fontSize:10,marginTop:2},
  body:{padding:14,paddingBottom:50},h:{fontSize:20,fontWeight:'900',color:c.text,marginBottom:4},muted:{fontSize:11,color:c.textSecondary,lineHeight:17},
  err:{color:c.danger||c.text,padding:18},loading:{flex:1,alignItems:'center',justifyContent:'center',gap:8},
  productGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',marginTop:12,rowGap:10},
  productCard:{width:'31.5%',backgroundColor:c.card,borderWidth:1,borderColor:c.border,borderRadius:radius.lg,padding:10,minHeight:150,alignItems:'center'},
  productLogo:{width:46,height:38,marginBottom:7},productFallback:{width:38,height:38,borderRadius:19,backgroundColor:c.primary,alignItems:'center',justifyContent:'center',marginBottom:7},productFallbackText:{color:c.onPrimary,fontWeight:'900'},
  productName:{fontSize:10.5,fontWeight:'800',textAlign:'center',color:c.text,minHeight:42},processing:{fontSize:8.5,color:c.textSecondary,marginTop:4,textTransform:'capitalize'},buySmall:{marginTop:'auto',color:c.primary,fontSize:10,fontWeight:'900'},
  productHero:{backgroundColor:c.card,borderWidth:1,borderColor:c.border,borderRadius:radius.lg,padding:14,flexDirection:'row',gap:12,alignItems:'center',marginBottom:6},heroLogo:{width:50,height:45},
  field:{marginTop:14},label:{fontSize:12,fontWeight:'800',color:c.text,marginBottom:6},input:{backgroundColor:c.card,borderWidth:1,borderColor:c.border,borderRadius:radius.md,padding:12,color:c.text,minHeight:44},
  optionLoading:{flexDirection:'row',alignItems:'center',gap:8,paddingVertical:8},optionRow:{paddingVertical:4,gap:8},option:{borderWidth:1,borderColor:c.border,borderRadius:radius.md,padding:10,maxWidth:250,backgroundColor:c.card},optionSelected:{backgroundColor:c.primary,borderColor:c.primary},optionText:{fontSize:10,color:c.text,fontWeight:'700'},optionTextSelected:{color:c.onPrimary},
  buy:{marginTop:24,backgroundColor:c.primary,borderRadius:radius.lg,padding:15,alignItems:'center'},buyText:{color:c.onPrimary,fontWeight:'900',fontSize:14},empty:{padding:20,textAlign:'center',color:c.textSecondary},
});
