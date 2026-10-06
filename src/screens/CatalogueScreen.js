import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import { showAlert } from '../utils/appAlert';
import { countries, rechargeOperators } from '../data/countries';
import { serviceCountries, operatorsForCountry, providerCoverage } from '../utils/catalogue';
import * as catalogueService from '../firebase/catalogueService';
import * as apiProviderService from '../firebase/apiProviderService';

/**
 * Which markets and operators the app sells, without a release.
 *
 * The country and operator lists were literals in data/countries.js, so
 * opening a market or dropping an operator meant a store build. They are the
 * defaults still - nothing here deletes them. Turning one off records it as
 * disabled, so turning it back on restores exactly what the app ships with.
 *
 * TWO THINGS THIS SCREEN IS CAREFUL ABOUT.
 *
 * It changes the SERVICE pickers only - Recharge, Internet, Offer Packs.
 * Signup dial codes, KYC, ad targeting and the language list keep reading the
 * shipped list, because "stop selling to India" must not mean "nobody with a
 * +91 number can sign in".
 *
 * And an operator here is not an operator an order can reach. Fulfilment is
 * operatorProductCodes in API Provider Management; an operator with no mapping
 * takes orders that fail AFTER the customer's wallet is charged. So each row
 * says whether a provider can actually serve it, rather than letting that be
 * discovered by a customer.
 */
const TABS = [
  { key: 'countries', label: 'Countries' },
  { key: 'operators', label: 'Operators' },
];

export default function CatalogueScreen() {
  const { goBackOrHome, profile, catalogue, setScreen, setAdminTab, setAdminViewingSection } = useApp();
  const { colors, brandGradient } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tab, setTab] = useState('countries');
  const [busy, setBusy] = useState('');
  const [country, setCountry] = useState('MY');
  const [newCountry, setNewCountry] = useState({ code: '', name: '', flag: '', dial: '', curr: '' });
  const [newOperator, setNewOperator] = useState('');
  // Loaded once, and only to answer "can anything actually serve this
  // operator". A failure leaves it null and the rows say nothing rather than
  // claiming no coverage - an unknown is not a no.
  const [providers, setProviders] = useState(null);

  const allowed = profile?.role === 'superadmin';

  useEffect(() => {
    if (!allowed) return undefined;
    let cancelled = false;
    apiProviderService.listApiProviders()
      .then((list) => { if (!cancelled) setProviders(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setProviders(null); });
    return () => { cancelled = true; };
  }, [allowed]);

  const shippedCodes = useMemo(() => new Set(countries.map((c) => c.code)), []);
  const offered = serviceCountries(countries, catalogue);
  const offeredCodes = new Set(offered.map((c) => c.code));
  const addedCountries = (catalogue?.countries?.added) || [];
  // Shipped first, then added, so the list reads the way the picker does.
  const countryRows = [...countries, ...addedCountries];

  const operatorRows = operatorsForCountry(rechargeOperators, catalogue, country);
  const shippedOperators = new Set(rechargeOperators[country] || []);
  const disabledOperators = new Set(catalogue?.operators?.disabled?.[country] || []);
  const addedOperators = catalogue?.operators?.added?.[country] || [];
  const operatorList = [...(rechargeOperators[country] || []), ...addedOperators];

  // Every country the operator tab can edit: shipped plus added.
  const operatorCountries = useMemo(() => {
    const out = Object.keys(rechargeOperators);
    for (const code of Object.keys(catalogue?.operators?.added || {})) if (!out.includes(code)) out.push(code);
    for (const c of addedCountries) if (!out.includes(c.code)) out.push(c.code);
    return out;
  }, [catalogue, addedCountries]);

  const run = async (key, fn) => {
    if (busy) return;
    setBusy(key);
    try { await fn(); }
    catch (e) { showAlert('Could not save', e?.message || 'Please try again.'); }
    finally { setBusy(''); }
  };

  const coverageFor = (operator) => {
    if (providers === null) return null;
    return providerCoverage(providers, operator);
  };

  const submitCountry = () => run('newCountry', async () => {
    await catalogueService.addCountry(catalogue, newCountry);
    setNewCountry({ code: '', name: '', flag: '', dial: '', curr: '' });
  });

  const submitOperator = () => run('newOperator', async () => {
    await catalogueService.addOperator(catalogue, country, newOperator);
    setNewOperator('');
  });

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Service Catalogue</Text>
      </LinearGradient>

      {!allowed ? (
        <Text style={styles.denied}>Only a superadmin can change the catalogue.</Text>
      ) : (
        <>
          <View style={styles.tabs}>
            {TABS.map((t) => (
              <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabOn]} onPress={() => setTab(t.key)} accessibilityRole="button">
                <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {tab === 'countries' ? (
              <>
                <Text style={styles.intro}>
                  Which markets Recharge, Internet and Offer Packs offer. Turning one off does not
                  touch signup, KYC or anyone&apos;s existing account &mdash; it stops the market being
                  sold, nothing else.
                </Text>
                <Text style={styles.summary}>{offered.length} of {countryRows.length} offered</Text>

                {countryRows.map((c) => {
                  const on = offeredCodes.has(c.code);
                  const isAdded = !shippedCodes.has(c.code);
                  return (
                    <View key={c.code} style={styles.row}>
                      <Text style={styles.flag}>{c.flag || '🏳'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowName} numberOfLines={1}>{c.name}</Text>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {c.code}{c.dial ? ` · ${c.dial}` : ''}{c.curr ? ` · ${c.curr}` : ''}{isAdded ? ' · added here' : ''}
                        </Text>
                      </View>
                      {busy === `c:${c.code}` ? <ActivityIndicator color={colors.primary} /> : (
                        <>
                          <TouchableOpacity
                            style={[styles.pill, on ? styles.pillOn : styles.pillOff]}
                            onPress={() => run(`c:${c.code}`, () => catalogueService.setCountryEnabled(catalogue, c.code, !on))}
                            accessibilityRole="button"
                          >
                            <Text style={[styles.pillText, on && styles.pillTextOn]}>{on ? 'OFFERED' : 'OFF'}</Text>
                          </TouchableOpacity>
                          {/* A shipped market is only ever disabled - removing
                              it would mean editing the app's own list. One
                              added here can be taken away again. */}
                          {!!isAdded && (
                            <TouchableOpacity
                              style={styles.removeBtn}
                              onPress={() => run(`c:${c.code}`, () => catalogueService.removeAddedCountry(catalogue, c.code))}
                              accessibilityRole="button"
                              accessibilityLabel={`Remove ${c.name}`}
                            >
                              <Text style={styles.removeText}>✕</Text>
                            </TouchableOpacity>
                          )}
                        </>
                      )}
                    </View>
                  );
                })}

                <Text style={styles.sectionTitle}>Add a market</Text>
                <View style={styles.card}>
                  <View style={styles.formRow}>
                    <TextInput style={[styles.input, styles.inputSmall]} value={newCountry.code} onChangeText={(v) => setNewCountry({ ...newCountry, code: v.toUpperCase().slice(0, 2) })} placeholder="LK" placeholderTextColor={colors.placeholder} autoCapitalize="characters" autoCorrect={false} />
                    <TextInput style={[styles.input, { flex: 1 }]} value={newCountry.name} onChangeText={(v) => setNewCountry({ ...newCountry, name: v })} placeholder="Sri Lanka" placeholderTextColor={colors.placeholder} />
                  </View>
                  <View style={styles.formRow}>
                    <TextInput style={[styles.input, styles.inputSmall]} value={newCountry.flag} onChangeText={(v) => setNewCountry({ ...newCountry, flag: v })} placeholder="🇱🇰" placeholderTextColor={colors.placeholder} />
                    <TextInput style={[styles.input, styles.inputMid]} value={newCountry.dial} onChangeText={(v) => setNewCountry({ ...newCountry, dial: v })} placeholder="+94" placeholderTextColor={colors.placeholder} keyboardType="phone-pad" />
                    <TextInput style={[styles.input, styles.inputMid]} value={newCountry.curr} onChangeText={(v) => setNewCountry({ ...newCountry, curr: v.toUpperCase().slice(0, 3) })} placeholder="LKR" placeholderTextColor={colors.placeholder} autoCapitalize="characters" />
                  </View>
                  <TouchableOpacity style={[styles.saveBtn, busy === 'newCountry' && styles.saveOff]} onPress={submitCountry} disabled={busy === 'newCountry'} accessibilityRole="button">
                    <Text style={styles.saveText}>{busy === 'newCountry' ? 'Adding...' : 'Add market'}</Text>
                  </TouchableOpacity>
                  <Text style={styles.note}>
                    A market needs an API provider that serves it before an order can complete.
                    Set that up in API Provider Management.
                  </Text>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.intro}>
                  Which operators each market offers. An operator turned off here is not sold and
                  not priced; one turned back on returns exactly as it ships.
                </Text>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {operatorCountries.map((code) => (
                    <TouchableOpacity key={code} style={[styles.chip, code === country && styles.chipOn]} onPress={() => setCountry(code)} accessibilityRole="button">
                      <Text style={[styles.chipText, code === country && styles.chipTextOn]}>{code}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={styles.summary}>{operatorRows.length} of {operatorList.length} offered in {country}</Text>

                {operatorList.map((name) => {
                  const on = !disabledOperators.has(name);
                  const isAdded = !shippedOperators.has(name);
                  const cover = coverageFor(name);
                  return (
                    <View key={name} style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {isAdded ? 'added here' : 'built in'}
                          {cover ? ` · ${cover.fulfil > 0 ? `${cover.fulfil} provider${cover.fulfil === 1 ? '' : 's'}` : 'no provider mapping'}` : ''}
                        </Text>
                        {/* The failure this prevents: an operator customers can
                            pick, whose order fails after the wallet is charged. */}
                        {!!(cover && cover.fulfil === 0 && on) && (
                          <Text style={styles.warn}>No provider can fulfil this yet &mdash; orders will fail.</Text>
                        )}
                      </View>
                      {busy === `o:${name}` ? <ActivityIndicator color={colors.primary} /> : (
                        <>
                          <TouchableOpacity
                            style={[styles.pill, on ? styles.pillOn : styles.pillOff]}
                            onPress={() => run(`o:${name}`, () => catalogueService.setOperatorEnabled(catalogue, country, name, !on))}
                            accessibilityRole="button"
                          >
                            <Text style={[styles.pillText, on && styles.pillTextOn]}>{on ? 'OFFERED' : 'OFF'}</Text>
                          </TouchableOpacity>
                          {!!isAdded && (
                            <TouchableOpacity
                              style={styles.removeBtn}
                              onPress={() => run(`o:${name}`, () => catalogueService.removeAddedOperator(catalogue, country, name))}
                              accessibilityRole="button"
                              accessibilityLabel={`Remove ${name}`}
                            >
                              <Text style={styles.removeText}>✕</Text>
                            </TouchableOpacity>
                          )}
                        </>
                      )}
                    </View>
                  );
                })}

                <Text style={styles.sectionTitle}>Add an operator to {country}</Text>
                <View style={styles.card}>
                  <TextInput style={styles.input} value={newOperator} onChangeText={setNewOperator} placeholder="Operator name" placeholderTextColor={colors.placeholder} autoCorrect={false} />
                  <TouchableOpacity style={[styles.saveBtn, busy === 'newOperator' && styles.saveOff]} onPress={submitOperator} disabled={busy === 'newOperator'} accessibilityRole="button">
                    <Text style={styles.saveText}>{busy === 'newOperator' ? 'Adding...' : 'Add operator'}</Text>
                  </TouchableOpacity>
                  <Text style={styles.note}>
                    The name has to match the operator code in API Provider Management, or no
                    provider will be able to serve it.
                  </Text>
                </View>
              </>
            )}

            {/* Packages are edited where they have always been edited. Pointing
                at it beats a second place to add them. */}
            <Text style={styles.sectionTitle}>Data packages</Text>
            {/* Pricing is an admin TAB, not a screen of its own - the same
                three steps AdminFeaturesScreen uses to open one. setScreen
                ('pricing') renders nothing. */}
            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() => { setAdminTab('pricing'); setAdminViewingSection(true); setScreen('adminHome'); }}
              accessibilityRole="button"
            >
              <Text style={styles.linkText}>Add, edit or remove packages in Admin &rsaquo; Pricing →</Text>
            </TouchableOpacity>
          </ScrollView>
        </>
      )}
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
    denied: { padding: 20, color: colors.textSecondary, fontSize: 13 },
    tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
    tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    tabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    tabText: { fontSize: 13, fontWeight: '700', color: colors.text },
    tabTextOn: { color: '#FFFFFF' },
    content: { paddingHorizontal: 12, paddingBottom: 40 },
    intro: { fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginBottom: 10 },
    summary: { fontSize: 12, fontWeight: '700', color: colors.text, marginBottom: 8 },
    chipRow: { gap: 8, paddingBottom: 10 },
    chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
    chipTextOn: { color: '#FFFFFF' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 10, marginBottom: 7, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    flag: { fontSize: 20 },
    rowName: { fontSize: 13.5, fontWeight: '700', color: colors.text },
    rowMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
    warn: { fontSize: 11, color: '#D9534F', marginTop: 3, fontWeight: '600' },
    pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.md, borderWidth: 1 },
    pillOn: { backgroundColor: `${colors.primary}1A`, borderColor: colors.primary },
    pillOff: { backgroundColor: 'transparent', borderColor: colors.border },
    pillText: { fontSize: 10.5, fontWeight: '800', color: colors.textSecondary },
    pillTextOn: { color: colors.primary },
    removeBtn: { paddingHorizontal: 8, paddingVertical: 6 },
    removeText: { fontSize: 14, color: '#D9534F', fontWeight: '800' },
    sectionTitle: { fontSize: 12, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 18, marginBottom: 8 },
    card: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12 },
    formRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, color: colors.text, backgroundColor: colors.bg },
    inputSmall: { width: 64, textAlign: 'center' },
    inputMid: { width: 86, textAlign: 'center' },
    saveBtn: { marginTop: 4, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.primary },
    saveOff: { opacity: 0.5 },
    saveText: { fontSize: 12.5, fontWeight: '800', color: '#FFFFFF' },
    note: { fontSize: 11, color: colors.textSecondary, lineHeight: 16, marginTop: 10 },
    linkBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    linkText: { fontSize: 12.5, fontWeight: '700', color: colors.primary },
  });
}
