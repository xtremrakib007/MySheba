import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../theme/ThemeContext';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { API_SERVICES } from '../firebase/apiProviderService';

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
    ],
  },
  { title: 'Notes', fields: [{ key: 'notes', label: 'Notes', hint: 'For whoever configures this next.' }] },
];

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

  useEffect(() => {
    if (!visible) return;
    if (successTopUp) {
      setForm({ ...(provider || {}), ...SUCCESS_TOPUP_DEFAULTS });
      return;
    }
    if (provider) {
      const next = { ...provider };
      for (const key of ['catalogTypes', 'catalogItemMap', 'catalogWindow']) next[key] = toText(provider[key]);
      setForm(next);
      // Open the catalogue section straight away when there is something in it.
      setShowCatalog(Boolean(provider.catalogPath || provider.catalogPreset));
      return;
    }
    setForm({
      country: 'ALL', service: presetService || API_SERVICES[0], authType: 'none', method: 'POST',
      active: true, priority: 0, timeoutMs: 15000, endpointPath: '/',
      headers: '{}', queryTemplate: '{}', requestTemplate: '{}',
    });
    setShowCatalog(false);
  }, [visible, provider, successTopUp, presetService]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // `service` is the primary and is always in the list; the server keeps the
  // same invariant, so a document written here reads back the same way.
  const selectedServices = Array.isArray(form.services) && form.services.length
    ? form.services
    : [form.service].filter(Boolean);
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
              {form.service || '—'}{form.country && form.country !== 'ALL' ? ` · ${form.country}` : ''}
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

                <Text style={styles.sectionTitle}>Country</Text>
                <Text style={styles.fieldHint}>A country-specific provider is preferred over an &quot;All countries&quot; one.</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {COUNTRIES.map((x) => (
                    <TouchableOpacity key={x.code} onPress={() => set('country', x.code)} style={[styles.chip, form.country === x.code && styles.chipOn]}>
                      <Text style={form.country === x.code ? styles.chipOnText : null}>{x.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

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
                  {['none', 'apiKey', 'bearer', 'basic'].map((x) => (
                    <TouchableOpacity key={x} onPress={() => set('authType', x)} style={[styles.chip, form.authType === x && styles.chipOn]}>
                      <Text style={form.authType === x ? styles.chipOnText : null}>{x}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

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
