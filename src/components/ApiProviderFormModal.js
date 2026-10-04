import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../theme/ThemeContext';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { API_SERVICES } from '../firebase/apiProviderService';
import { providerCountries, toggleCountry } from '../utils/providerReach';
import * as apiProviderService from '../firebase/apiProviderService';

const COUNTRIES = [
  { code: 'ALL', label: 'All countries' }, { code: 'MY', label: 'Malaysia' }, { code: 'BD', label: 'Bangladesh' },
  { code: 'SG', label: 'Singapore' }, { code: 'ID', label: 'Indonesia' }, { code: 'IN', label: 'India' },
  { code: 'PH', label: 'Philippines' },
];

const HELP_TEXT =
  'Placeholders {{phone}} {{amount}} {{operator}} {{requestId}} {{apiKey}} {{secretKey}} are filled in at request time. ' +
  'Keys are stored in Secret Manager and never shown again.';

/**
 * Every field, with a label and a word on what it is for.
 *
 * This used to be eighteen bare TextInputs whose placeholder was the field
 * name, so "responseIdPath" was both the label and the help. Configuring a
 * second provider for a feature meant guessing what each one wanted.
 */
const SECTIONS = [
  {
    title: 'Identity',
    fields: [
      { key: 'name', label: 'Provider name', hint: 'Shown in this list, e.g. "Success TopUp" or "Shohoz".' },
      { key: 'priority', label: 'Priority', numeric: true, hint: 'Highest wins when a feature has more than one provider for a country.' },
    ],
  },
  {
    title: 'Endpoint',
    fields: [
      { key: 'baseUrl', label: 'Base URL', placeholder: 'https://api.example.com', hint: 'HTTPS only. A domain name, not a raw IP.' },
      { key: 'endpointPath', label: 'Endpoint path', placeholder: '/v1/order', hint: 'No query string here - use the query template.' },
      { key: 'timeoutMs', label: 'Timeout (ms)', numeric: true, hint: '3000-60000.' },
    ],
  },
  {
    title: 'Credentials',
    fields: [
      { key: 'apiKey', label: 'API key', secret: true, has: 'hasApiKey' },
      { key: 'secretKey', label: 'API secret', secret: true, has: 'hasSecretKey' },
      { key: 'username', label: 'Username (basic auth)', has: 'hasUsername' },
      { key: 'password', label: 'Password (basic auth)', secret: true, has: 'hasPassword' },
    ],
  },
  {
    title: 'Request',
    fields: [
      { key: 'headers', label: 'Headers (JSON)', placeholder: '{"Authorization":"Bearer {{apiKey}}"}', has: 'hasCustomHeaders' },
      { key: 'queryTemplate', label: 'Query template (JSON)', placeholder: '{"ref":"{{requestId}}"}', has: 'hasQueryTemplate' },
      { key: 'requestTemplate', label: 'Request body template (JSON)', placeholder: '{"phone":"{{phone}}","amount":"{{amount}}"}', has: 'hasRequestTemplate' },
    ],
  },
  {
    title: 'Reading the response',
    fields: [
      { key: 'responseSuccessPath', label: 'Success path', placeholder: 'result', hint: 'Dotted path, e.g. data.status.' },
      { key: 'responseSuccessValue', label: 'Success value', placeholder: 'true' },
      { key: 'responseProcessingPath', label: 'Processing path' },
      { key: 'responseProcessingValue', label: 'Processing value' },
      { key: 'responseIdPath', label: 'Provider reference path', placeholder: 'data.trxid' },
      { key: 'responseMessagePath', label: 'Message path', placeholder: 'message' },
      { key: 'responsePinPath', label: 'PIN path', hint: 'Required for Recharge PIN providers.' },
    ],
  },
  {
    title: 'Package catalogue',
    optional: true,
    note:
      'Only for providers that sell a browsable product list - packages, routes, seats. ' +
      'Leave empty for a plain recharge or bill API. A known provider fills these from its preset.',
    fields: [
      { key: 'catalogPreset', label: 'Preset', placeholder: 'success-topup', hint: 'Leave blank to match on the provider name.' },
      { key: 'catalogPath', label: 'Catalogue path', placeholder: '/api/drives' },
      { key: 'catalogListPath', label: 'List path in the response', placeholder: 'drives', hint: 'Dotted, e.g. data.trips.' },
      { key: 'catalogSuccessPath', label: 'Catalogue success path', placeholder: 'result' },
      { key: 'catalogSuccessValue', label: 'Catalogue success value', placeholder: 'true' },
      { key: 'catalogTypes', label: 'Catalogue types', placeholder: 'regular, drive', hint: 'Comma separated. The first is the default.' },
      { key: 'catalogItemMap', label: 'Item map (JSON)', placeholder: '{"id":"id","price":["price","amount"],"name":"name"}', hint: 'Must map id and price.' },
      { key: 'catalogWindow', label: 'Selling window (JSON)', placeholder: '{"type":"drive","openUtcHour":4,"closeUtcHour":16,"label":"10am-10pm BD","noun":"Drive packages"}', hint: 'Hours in UTC. Leave empty to sell around the clock.' },
      { key: 'catalogRequestTemplate', label: 'Catalogue request body (JSON)', placeholder: '{"operator":"{{operator}}","type":"{{type}}"}', has: 'hasCatalogRequestTemplate' },
      { key: 'catalogQueryTemplate', label: 'Catalogue query (JSON)', placeholder: '{"product_code":"{{operator}}","account_number":"{{account}}"}', hint: 'For a catalogue fetched with GET. {{account}} is the customer\u2019s own number.' },
      { key: 'catalogPerAccount', label: 'Priced per phone number?', placeholder: 'true or false', hint: 'true when the provider personalises plans to the number. The number then becomes required, and no answer is ever reused for another number.' },
      { key: 'catalogOperatorCodes', label: 'Operator product codes (JSON)', placeholder: '{"Hotlink":"HI","CelcomDigi":["CEL","DI"]}', hint: 'Which product code each operator\u2019s plans come from. A list where one operator could be more than one product - every code is asked and the plan keeps the one that answered. An operator left out keeps its built-in package list.' },
      { key: 'operatorProductCodes', label: 'Operator product codes (JSON)', placeholder: '{"Hotlink":"H","U Mobile":"U"}', hint: 'The provider\u2019s code for each operator, for a top-up. Nothing is built in: tap Product list above to read the real codes from the provider. An operator left out has its top-ups refused rather than sent under its display name.' },
      { key: 'pinProductCodes', label: 'PIN product codes (JSON)', placeholder: '{"Hotlink":"HPIN","Celcom":{"10":"C10","30":"C30"}}', hint: 'A voucher PIN is a different product from airtime, so it has its own codes. One code per operator, or - where a range is sold as one product per denomination - an object keyed by amount.' },
      { key: 'gameProductCodes', label: 'Game product codes (JSON)', placeholder: '{"pubg-60":"PUBG60","ml-86":{"code":"ML86","amount":"5.80"}}', hint: 'Keyed by PACK, not by game - nobody buys "PUBG", they buy "60 UC". The pack ids are the ones in the Entertainment screen (pubg-60, ff-100, ml-86 and so on). Add an amount where the provider sets the price for that product: ours is the customer\u2019s sell price and sending it buys the wrong thing.' },
      { key: 'billerProductCodes', label: 'Biller product codes (JSON)', placeholder: '{"TNB":"TNB","JomPAY":"JOMPAY","Air Selangor":"AIRSEL"}', hint: 'Which product code each biller on the Bill Pay screen is, for reading a bill before paying it. TNB and JomPAY are built in; everything else comes from the provider\u2019s product list. A biller left out simply gets no bill details - it is never a reason a payment fails.' },
      { key: 'billPresentmentPath', label: 'Bill presentment path', placeholder: '/v2/bill-presentment', hint: 'Leave blank for the default.' },
    ],
  },
  { title: 'Notes', fields: [{ key: 'notes', label: 'Notes', hint: 'For whoever configures this next.' }] },
];

const AUTH_TYPES = ['none', 'apiKey', 'bearer', 'basic', 'iimmpactHmac'];
const AUTH_LABELS = { iimmpactHmac: 'iimmpact (HMAC)' };

// One tap instead of fourteen fields, two of which are spelling traps:
// `Succesful` has one s because iimmpact's own docs say the typo is permanent,
// and the pending statuses have to be listed or an Accepted reply is read as a
// refusal and refunded. Nothing here is locked - every value is an ordinary
// form field afterwards - it just stops the integration starting out wrong.
//
// Staging is https://staging.iimmpact.com and production is
// https://api.iimmpact.com; the preset uses production, so change the base URL
// while testing.
const IIMMPACT_DEFAULTS = {
  name: 'iimmpact',
  baseUrl: 'https://api.iimmpact.com',
  endpointPath: '/v2/topup',
  method: 'POST',
  authType: 'iimmpactHmac',
  headers: '{}',
  queryTemplate: '{}',
  responseSuccessPath: 'data.status',
  // Both spellings: /v2/topup answers Succesful, /v2/transactions answers Successful.
  responseSuccessValue: 'Succesful, Successful',
  // Accepted and Processing both mean "created, not finished". Listing them
  // keeps the charge pending instead of refunding a live transaction.
  responseProcessingPath: 'data.status',
  responseProcessingValue: 'Accepted, Processing',
  // refid is the reference we sent, echoed back - it is what the webhook
  // matcher looks for on the transaction.
  responseIdPath: 'data.refid',
  responseMessagePath: 'data.remarks',
  responsePinPath: 'data.pin',
  timeoutMs: 30000,
};

// Per-service bodies. `product` is iimmpact's product code and differs per
// country and operator, so it is left as a placeholder the operator fills in
// from /v2/product-list rather than guessed here.
const IIMMPACT_BODIES = {
  // operatorCode, not operator: {{operator}} is the name the customer picked
  // ('Hotlink'), and a name is not a product. The server resolves the code from
  // Operator product codes below and refuses the charge if there is none,
  // rather than sending a display name and letting the provider guess.
  Recharge: { refid: '{{requestId}}', product: '{{operatorCode}}', account: '{{phone}}', amount: '{{amount}}' },
  // operatorCode, not operator: for a per-number plan the server resolves which
  // product the plan was actually found under, and {{operator}} is the display
  // name the customer picked ('CelcomDigi'), not a product code.
  Internet: { refid: '{{requestId}}', product: '{{operatorCode}}', account: '{{phone}}', amount: '{{amount}}', extras: { subproduct_code: '{{packageId}}' } },
  'Recharge PIN': { refid: '{{requestId}}', product: '{{operatorCode}}', account: '{{phone}}', amount: '{{amount}}' },
  'Bill Payment': { refid: '{{requestId}}', product: '{{provider}}', account: '{{accountNumber}}', amount: '{{amount}}' },
  // A game top-up has no phone number: the account IS the player's in-game id.
  // `extras.server_id` is the key Mobile Legends and its like need for a zone,
  // and it is a GUESS - iimmpact documents extras for subproduct_code,
  // ic_number, biller_code and ref2 only. Check it against their product list
  // or support before selling a game that needs a zone; the games that do not
  // ignore the field.
  Entertainment: { refid: '{{requestId}}', product: '{{operatorCode}}', account: '{{playerId}}', amount: '{{amount}}', extras: { server_id: '{{serverId}}' } },
};

// JomPAY is its own body: the biller code and the payer's IC are mandatory and
// ref2 is required by some billers. ref2 is sent as an empty string when the
// bill does not show one, which iimmpact accepts.
const IIMMPACT_JOMPAY_BODY = {
  refid: '{{requestId}}', product: 'JOMPAY', account: '{{accountNumber}}', amount: '{{amount}}',
  extras: { biller_code: '{{billerCode}}', ic_number: '{{icNumber}}', ref2: '{{ref2}}' },
};

const SUCCESS_TOPUP_DEFAULTS = {
  name: 'Success TopUp', country: 'BD', service: 'Recharge',
  baseUrl: 'https://api.successtopup.com', endpointPath: '/api/recharge', method: 'POST', authType: 'none',
  headers: '{}', queryTemplate: '{}',
  requestTemplate: JSON.stringify({ number: '{{phone}}', type: 'prepaid', operator: '{{operator}}', amount: '{{amount}}', trxid: '{{requestId}}', successtopup_key: '{{apiKey}}', successtopup_secret: '{{secretKey}}' }),
  responseSuccessPath: 'result', responseSuccessValue: 'true', responseMessagePath: 'message',
  apiKey: '', secretKey: '', active: true,
};

/** JSON-ish values arrive as objects and must be edited as text. */
function toText(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function ApiProviderFormModal({ visible, provider, successTopUp = false, presetService, onClose, onSave }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [form, setForm] = useState({});
  const [showCatalog, setShowCatalog] = useState(false);
  const [products, setProducts] = useState([]);
  const [productsBusy, setProductsBusy] = useState(false);
  const [productsError, setProductsError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setProducts([]); setProductsError(''); setProductsBusy(false);
    if (successTopUp) {
      setForm({ ...(provider || {}), ...SUCCESS_TOPUP_DEFAULTS });
      return;
    }
    if (provider) {
      const next = { ...provider };
      for (const key of ['catalogTypes', 'catalogItemMap', 'catalogWindow', 'catalogQueryTemplate', 'catalogOperatorCodes', 'catalogPerAccount', 'billerProductCodes', 'operatorProductCodes', 'pinProductCodes', 'gameProductCodes']) next[key] = toText(provider[key]);
      setForm(next);
      // Open the catalogue section straight away when there is something in it.
      setShowCatalog(Boolean(provider.catalogPath || provider.catalogPreset || provider.catalogPerAccount || provider.billerProductCodes || provider.operatorProductCodes || provider.pinProductCodes || provider.gameProductCodes));
      return;
    }
    setForm({
      country: 'ALL', countries: ['ALL'], service: presetService || API_SERVICES[0], authType: 'none', method: 'POST',
      active: true, priority: 0, timeoutMs: 15000, endpointPath: '/',
      headers: '{}', queryTemplate: '{}', requestTemplate: '{}',
    });
    setShowCatalog(false);
  }, [visible, provider, successTopUp, presetService]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Only for a provider that already exists: the call signs with its stored
  // credentials, so there is nothing to read from an unsaved form.
  const loadProductCodes = async () => {
    if (productsBusy || !provider?.id) return;
    setProductsBusy(true); setProductsError(''); setProducts([]);
    try {
      setProducts(await apiProviderService.listProviderProductCodes(provider.id));
    } catch (error) {
      setProductsError(String(error?.message || 'Could not read the product list.'));
    } finally {
      setProductsBusy(false);
    }
  };

  // The preset keeps whatever is already typed - name, country, credentials,
  // the chosen feature - and only fills the wiring. Re-tapping it after
  // switching feature re-picks that feature's request body.
  const applyIimmpactPreset = () => setForm((f) => {
    const service = f.service || presetService || API_SERVICES[0];
    const body = service === 'Bill Payment' && String(f.name || '').toLowerCase().includes('jompay')
      ? IIMMPACT_JOMPAY_BODY
      : (IIMMPACT_BODIES[service] || IIMMPACT_BODIES.Recharge);
    // Only the Internet record gets the per-number catalogue: it is what turns
    // the package step into "plans available on this number". Every other
    // feature is a plain charge with no catalogue to browse.
    const catalogue = service === 'Internet'
      ? { catalogPreset: 'iimmpact-subproducts', catalogPath: '/v2/subproducts', catalogMethod: 'GET', catalogPerAccount: 'true' }
      : {};
    return {
      ...f,
      ...IIMMPACT_DEFAULTS,
      ...catalogue,
      // Never clobber a name the operator already chose, or the preset would
      // rename "iimmpact JomPAY" back to "iimmpact" and break the JomPAY body
      // choice above on the next tap.
      name: f.name || IIMMPACT_DEFAULTS.name,
      service,
      requestTemplate: JSON.stringify(body),
    };
  });

  // `service` is the primary and is always in the list; the server keeps the
  // same invariant, so a document written here reads back the same way.
  const selectedServices = Array.isArray(form.services) && form.services.length
    ? form.services
    : [form.service].filter(Boolean);
  // One list, with the first entry mirrored into `country` so every reader
  // written before a provider could serve several goes on working.
  const selectedCountries = providerCountries(form);
  const toggleFormCountry = (code) => setForm((f) => {
    const countries = toggleCountry(providerCountries(f), code);
    return { ...f, countries, country: countries[0] };
  });

  const toggleService = (name) => setForm((f) => {
    const current = Array.isArray(f.services) && f.services.length ? f.services : [f.service].filter(Boolean);
    const next = current.includes(name) ? current.filter((x) => x !== name) : [...current, name];
    // Never leave a provider serving nothing: the last feature cannot be
    // unpicked, it has to be swapped by picking another first.
    if (!next.length) return f;
    return { ...f, services: next, service: next[0] };
  });

  const renderField = (f) => (
    <View key={f.key} style={styles.field}>
      <Text style={styles.fieldLabel}>{f.label}</Text>
      {!!f.hint && <Text style={styles.fieldHint}>{f.hint}</Text>}
      <TextInput
        style={styles.input}
        placeholder={f.has && provider?.[f.has] ? 'Configured — leave blank to keep it' : (f.placeholder || '')}
        placeholderTextColor="#9AA5A5"
        value={String(form[f.key] ?? '')}
        onChangeText={(v) => set(f.key, v)}
        secureTextEntry={!!f.secret}
        autoCapitalize="none"
        keyboardType={f.numeric ? 'numeric' : 'default'}
      />
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>
            {successTopUp ? 'Success TopUp Setup' : provider ? `Edit ${provider.name || 'provider'}` : 'Add API provider'}
          </Text>
          {!successTopUp && (
            <Text style={styles.subtitle}>
              {form.service || '—'}{selectedCountries.includes('ALL') ? '' : ` · ${selectedCountries.join(', ')}`}
            </Text>
          )}

          <ScrollView>
            {successTopUp ? (
              <>
                <Text style={styles.provider}>Success TopUp: Recharge + Bangladesh Bills</Text>
                <Text style={styles.help}>{HELP_TEXT}</Text>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>API Key</Text>
                  <TextInput style={styles.input} placeholderTextColor={colors.placeholder} placeholder={provider?.hasApiKey ? 'Leave blank to keep current API key' : 'Success TopUp API key'} value={String(form.apiKey || '')} onChangeText={(v) => set('apiKey', v)} secureTextEntry autoCapitalize="none" />
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>API Secret</Text>
                  <TextInput style={styles.input} placeholderTextColor={colors.placeholder} placeholder={provider?.hasSecretKey ? 'Leave blank to keep current API secret' : 'Success TopUp API secret'} value={String(form.secretKey || '')} onChangeText={(v) => set('secretKey', v)} secureTextEntry autoCapitalize="none" />
                </View>
                <View style={styles.fixedBox}>
                  <Text style={styles.fixedTitle}>Automatic configuration</Text>
                  <Text>• HTTPS Success TopUp recharge + bill endpoints</Text>
                  <Text>• Bangladesh electricity, gas, water and internet bills</Text>
                  <Text>• Bangladesh postpaid mobile bills (GP, Robi, Banglalink)</Text>
                  <Text>• Success / Processing / Cancel handling for recharge</Text>
                  <Text>• Status polling and wallet refund protection</Text>
                  <Text>• Webhook configuration</Text>
                </View>
              </>
            ) : (
              <>
                <TouchableOpacity onPress={applyIimmpactPreset} style={styles.preset}>
                  <Text style={styles.presetText}>Fill iimmpact defaults</Text>
                </TouchableOpacity>
                <Text style={styles.fieldHint}>
                  Sets the endpoint, the HMAC signing, the status values and the response paths for the
                  feature picked below, then leaves everything editable. The API key and HMAC secret are
                  still yours to paste in, and `product` in the request body has to be the product code
                  from iimmpact&apos;s product list.
                </Text>

                <Text style={styles.sectionTitle}>Features</Text>
                <Text style={styles.fieldHint}>
                  Everything this one API serves. Bangladesh recharge and Bangladesh internet are usually the
                  same account, so tap both rather than entering the credentials twice. The first one picked
                  is the primary.
                </Text>
                <View style={styles.chipWrap}>
                  {API_SERVICES.map((x) => {
                    const on = selectedServices.includes(x);
                    return (
                      <TouchableOpacity key={x} onPress={() => toggleService(x)} style={[styles.chip, on && styles.chipOn]}>
                        <Text style={on ? styles.chipOnText : styles.chipText}>{on ? `\u2713 ${x}` : x}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.fieldHint}>
                  {selectedServices.length > 1
                    ? `One provider for ${selectedServices.length} features. Primary: ${form.service}.`
                    : 'Tap another to have this provider serve it too.'}
                </Text>

                <Text style={styles.sectionTitle}>Countries</Text>
                <Text style={styles.fieldHint}>
                  Tap each country this provider serves. A country-specific provider is preferred over an
                  &quot;All countries&quot; one, so picking countries by name beats leaving it on All.
                </Text>
                <View style={styles.chipWrap}>
                  {COUNTRIES.map((x) => {
                    const on = selectedCountries.includes(x.code);
                    return (
                      <TouchableOpacity key={x.code} onPress={() => toggleFormCountry(x.code)} style={[styles.chip, on && styles.chipOn]}>
                        <Text style={on ? styles.chipOnText : null}>{x.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.fieldHint}>
                  {selectedCountries.includes('ALL')
                    ? 'Serving every country. Tap a country by name to narrow it.'
                    : `Serving ${selectedCountries.length} ${selectedCountries.length === 1 ? 'country' : 'countries'}. Tap All countries to serve the rest as well.`}
                </Text>

                {SECTIONS.map((section) => {
                  if (section.optional) {
                    return (
                      <View key={section.title}>
                        <TouchableOpacity onPress={() => setShowCatalog((v) => !v)} style={styles.disclosure}>
                          <Text style={styles.sectionTitle}>{showCatalog ? '▾' : '▸'} {section.title}</Text>
                        </TouchableOpacity>
                        {showCatalog ? (
                          <>
                            <Text style={styles.fieldHint}>{section.note}</Text>
                            {provider?.id ? (
                              <>
                                <TouchableOpacity onPress={loadProductCodes} disabled={productsBusy} style={styles.preset}>
                                  <Text style={styles.presetText}>{productsBusy ? 'Reading\u2026' : 'Product list from the provider'}</Text>
                                </TouchableOpacity>
                                <Text style={styles.fieldHint}>
                                  The codes for the maps below. Nothing is built in, so this reads them from the
                                  provider itself rather than anybody guessing: a wrong code is a real top-up
                                  sent to the wrong product.
                                </Text>
                                {!!productsError && <Text style={styles.fieldHint}>{productsError}</Text>}
                                {products.map((p) => (
                                  <Text key={p.code} selectable style={styles.productRow}>
                                    {p.code}{p.name ? `  \u2014  ${p.name}` : ''}{p.category ? `  (${p.category})` : ''}
                                  </Text>
                                ))}
                              </>
                            ) : null}
                            {section.fields.map(renderField)}
                          </>
                        ) : null}
                      </View>
                    );
                  }
                  return (
                    <View key={section.title}>
                      <Text style={styles.sectionTitle}>{section.title}</Text>
                      {section.fields.map(renderField)}
                    </View>
                  );
                })}

                <Text style={styles.sectionTitle}>HTTP method</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {['GET', 'POST', 'PUT', 'PATCH'].map((x) => (
                    <TouchableOpacity key={x} onPress={() => set('method', x)} style={[styles.chip, form.method === x && styles.chipOn]}>
                      <Text style={form.method === x ? styles.chipOnText : null}>{x}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={styles.sectionTitle}>Authentication</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {AUTH_TYPES.map((x) => (
                    <TouchableOpacity key={x} onPress={() => set('authType', x)} style={[styles.chip, form.authType === x && styles.chipOn]}>
                      <Text style={form.authType === x ? styles.chipOnText : null}>{AUTH_LABELS[x] || x}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {form.authType === 'iimmpactHmac' && (
                  <Text style={styles.fieldHint}>
                    iimmpact signs every request, so the API key and HMAC secret go in the Credentials
                    section and no header template is needed. Paste the secret exactly as the dashboard
                    shows it - it is base64 and a re-typed or hex version fails every call with a 401.
                  </Text>
                )}

                <Text style={styles.help}>{HELP_TEXT}</Text>
              </>
            )}

            {!successTopUp && (
              <TouchableOpacity onPress={() => set('active', !form.active)} style={styles.toggle}>
                <Text>{form.active ? '✓ Active' : '○ Inactive'}</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          <View style={styles.row}>
            <TouchableOpacity onPress={onClose} style={styles.cancel}><Text>Cancel</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => onSave(form)} style={styles.save}>
              <Text style={styles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Themed. Built at module level, so the sheet was hardcoded white and most of
// its labels carried no colour at all - the same fault as the screen that
// opens it, and the reason that screen read as blank.
function createStyles(colors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'flex-end' },
    card: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, maxHeight: '90%' },
    title: { fontSize: 19, fontWeight: '800', color: colors.text },
    subtitle: { fontSize: 12, marginTop: 2, marginBottom: 10, color: colors.textSecondary },
    provider: { fontWeight: '800', marginBottom: 8, color: colors.text },
    sectionTitle: { fontWeight: '800', fontSize: 13, marginTop: 18, marginBottom: 4, color: colors.primary },
    disclosure: { paddingVertical: 2 },
    field: { marginTop: 10 },
    fieldLabel: { fontWeight: '700', fontSize: 12, marginBottom: 4, color: colors.text },
    fieldHint: { fontSize: 11, lineHeight: 15, marginBottom: 6, color: colors.textSecondary },
    help: { fontSize: 11, lineHeight: 16, marginTop: 12, color: colors.textSecondary },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.text, backgroundColor: colors.inputBg },
    chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: colors.border, marginRight: 7, marginTop: 4 },
    chipText: { color: colors.text, fontSize: 12 },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap' },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipOnText: { color: colors.onPrimary, fontWeight: '700' },
    preset: { alignSelf: 'flex-start', paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: colors.primary, marginBottom: 8 },
    presetText: { color: colors.primary, fontWeight: '800', fontSize: 12.5 },
    productRow: { fontSize: 11.5, lineHeight: 17, color: colors.text, fontFamily: 'monospace' },
    toggle: { marginTop: 16, paddingVertical: 10 },
    toggleText: { color: colors.primary, fontWeight: '700' },
    row: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, gap: 10 },
    cancel: { paddingHorizontal: 18, paddingVertical: 12 },
    cancelText: { color: colors.textSecondary, fontWeight: '700' },
    save: { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
    saveText: { color: colors.onPrimary, fontWeight: '700' },
    fixedBox: { backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginTop: 14 },
    fixedTitle: { fontWeight: '800', marginBottom: 6, color: colors.text },
  });
}
