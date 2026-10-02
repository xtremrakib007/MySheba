import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { showAlert } from '../utils/appAlert';
import HeaderDecor from '../components/HeaderDecor';
import * as gridService from '../firebase/gridManagementService';
import * as userManagementService from '../firebase/userManagementService';
import { TOGGLEABLE_ROLES, ROLE_LABEL } from '../firebase/featureAccessService';
import { countries } from '../data/countries';
import { countryLabel, countryCodeOf } from '../utils/phoneCountry';

// Roles a tile can be hidden from, taken from the one role vocabulary this app
// has rather than a new list: an invented role string would store an override
// that can never match a viewer. Customer is added because it is the role most
// of these tiles exist for, and TOGGLEABLE_ROLES leaves it out for its own
// reasons; superadmin is left out on purpose, because hiding a tile from the
// person who manages the tiles is a trap rather than a feature.
const ROLES = ['customer', ...TOGGLEABLE_ROLES]
  .map((key) => ({ key, label: key === 'customer' ? 'Customer' : (ROLE_LABEL[key] || key) }));

// The markets this app serves, from the same list Recharge and Remittance use.
// Flags and names come from there too, so neither can drift, and a market added
// there shows up here without a second edit. A user's country is derived from
// their signup dial code (see utils/phoneCountry), so these ISO codes are
// exactly what isGridActive will be comparing against.
const COUNTRIES = countries.map((c) => ({ key: c.code, label: `${c.flag} ${c.name}` }));

const SCOPES = [
  { key: 'global', label: 'Everyone' },
  { key: 'byRole', label: 'By role' },
  { key: 'byCountry', label: 'By country' },
  { key: 'byUser', label: 'By user' },
];

export default function GridManagementScreen() {
  const { colors, brandGradient } = useTheme();
  const { profile, goBackOrHome, gridManagement } = useApp();
  const [busy, setBusy] = useState(null);
  const [scope, setScope] = useState('global');
  const [who, setWho] = useState('');
  const [users, setUsers] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const isSuperadmin = profile?.role === 'superadmin';

  const styles = useMemo(() => createStyles(colors), [colors]);

  // Only loaded when picking a user, so the usual visit does not page the whole
  // directory for nothing.
  useEffect(() => {
    if (!isSuperadmin || scope !== 'byUser') return undefined;
    setUsers(null);
    setLoadError('');
    return userManagementService.subscribeAllUsers(
      (list) => { setUsers(list); setLoadError(''); },
      // Without this the spinner below would turn forever on a failed load.
      (e) => { setUsers([]); setLoadError(e?.message || 'Could not load the user directory.'); },
    );
  }, [isSuperadmin, scope]);

  const scoped = scope !== 'global';
  const overrides = scoped ? gridService.overridesFor(gridManagement, scope, who) : {};

  const set = async (key, action) => {
    if (busy || !isSuperadmin) return;
    if (scoped && !who) { showAlert('MySheba', 'Choose who this applies to first.'); return; }
    setBusy(key);
    try {
      if (action === 'inherit') await gridService.clearGridOverride(key, scope, who);
      else await gridService.setGridActive(key, action === 'on', scoped ? { scope, who } : {});
    } catch (e) {
      showAlert('MySheba', e?.message || 'Could not update grid status.');
    } finally {
      setBusy(null);
    }
  };

  const matches = (u) => {
    const q = search.trim().toLowerCase();
    if (!q) return false;
    return [u.name, u.phone, u.userId].some((v) => String(v || '').toLowerCase().includes(q));
  };
  const found = search.trim() ? (users || []).filter(matches).slice(0, 8) : [];
  const chosenUser = (users || []).find((u) => u.id === who);

  const whoLabel = scope === 'byRole' ? (ROLES.find((r) => r.key === who) || {}).label
    : scope === 'byCountry' ? (COUNTRIES.find((c) => c.key === who) || {}).label
      : chosenUser ? (chosenUser.name || chosenUser.phone || who) : '';

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity onPress={goBackOrHome} style={styles.back}><Text style={styles.backText}>←</Text></TouchableOpacity>
        <Text style={styles.title}>🧩 Grid Management</Text>
      </LinearGradient>

      {!isSuperadmin ? (
        <View style={styles.center}><Text style={styles.denied}>Only a Superadmin can manage feature grids.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.hint}>
            Turn a tile off for everyone, or just for one role, country or person. The most specific rule
            wins: a user setting beats a country one, which beats a role one, which beats the default for
            everyone. Changes are live and need no rebuild.
          </Text>

          <View style={styles.chipRow}>
            {SCOPES.map((s) => (
              <TouchableOpacity key={s.key} onPress={() => { setScope(s.key); setWho(''); setSearch(''); }}
                style={[styles.chip, scope === s.key && styles.chipOn]}>
                <Text style={scope === s.key ? styles.chipOnText : styles.chipText}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {scope === 'byRole' && (
            <View style={styles.chipRow}>
              {ROLES.map((r) => (
                <TouchableOpacity key={r.key} onPress={() => setWho(r.key)} style={[styles.chip, who === r.key && styles.chipOn]}>
                  <Text style={who === r.key ? styles.chipOnText : styles.chipText}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {scope === 'byCountry' && (
            <View style={styles.chipRow}>
              {COUNTRIES.map((c) => (
                <TouchableOpacity key={c.key} onPress={() => setWho(c.key)} style={[styles.chip, who === c.key && styles.chipOn]}>
                  <Text style={who === c.key ? styles.chipOnText : styles.chipText}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {scope === 'byUser' && (
            <View>
              <TextInput style={styles.input} placeholder="Search name, phone or ID" placeholderTextColor={colors.placeholder}
                value={search} onChangeText={(v) => { setSearch(v); setWho(''); }} autoCapitalize="none" />
              {users === null && <ActivityIndicator style={styles.loading} color={colors.primary} />}
              {!!loadError && <Text style={styles.error}>{loadError}</Text>}
              {found.map((u) => (
                <TouchableOpacity key={u.id} onPress={() => { setWho(u.id); setSearch(u.name || u.phone || ''); }}
                  style={[styles.userRow, who === u.id && styles.userRowOn]}>
                  <Text style={styles.userName}>{u.name || '—'}</Text>
                  <Text style={styles.userMeta}>{u.phone || '—'} · {u.role} · {countryLabel(u)}</Text>
                </TouchableOpacity>
              ))}
              {!!chosenUser && (
                <Text style={styles.chosen}>
                  Editing {chosenUser.name || chosenUser.phone}
                  {countryCodeOf(chosenUser) ? ` · ${countryCodeOf(chosenUser)}` : ''}
                </Text>
              )}
            </View>
          )}

          {scoped && !who ? (
            <Text style={styles.pick}>Choose {scope === 'byRole' ? 'a role' : scope === 'byCountry' ? 'a country' : 'a user'} to see what is overridden.</Text>
          ) : (
            <>
              {scoped ? (
                <Text style={styles.editing}>
                  Overrides for {whoLabel || who}. &quot;Default&quot; means no override — it follows the rule below it.
                </Text>
              ) : null}
              {gridService.GRID_DEFS.map((g) => {
                const globalActive = gridService.isGridActive(gridManagement, g.key);
                // Not globalActive: for a user, Default means their country's
                // rule, then their role's, then the global one.
                const inherited = gridService.inheritedActive(gridManagement, g.key, scope, who, {
                  role: chosenUser?.role || '',
                  country: countryCodeOf(chosenUser),
                });
                const override = Object.prototype.hasOwnProperty.call(overrides, g.key) ? overrides[g.key] : null;
                return (
                  <View key={g.key} style={styles.row}>
                    <View style={styles.info}>
                      <Text style={styles.name}>{g.name}</Text>
                      <Text style={styles.key}>{g.key}{scoped && override === null ? ` · default ${inherited ? 'on' : 'off'}` : ''}</Text>
                    </View>
                    {busy === g.key ? <ActivityIndicator color={colors.primary} /> : scoped ? (
                      <View style={styles.tri}>
                        {[['inherit', 'Default', override === null], ['on', 'On', override === true], ['off', 'Off', override === false]].map(([action, label, on]) => (
                          <TouchableOpacity key={action} onPress={() => set(g.key, action)} style={[styles.triBtn, on && (action === 'off' ? styles.triOff : styles.triOn)]}>
                            <Text style={[styles.triText, on && styles.triTextOn]}>{label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : (
                      <TouchableOpacity onPress={() => set(g.key, globalActive ? 'off' : 'on')} style={[styles.toggle, globalActive ? styles.on : styles.off]}>
                        <Text style={styles.toggleText}>{globalActive ? 'ACTIVE' : 'OFF'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, overflow: 'hidden' },
    back: { padding: 4 }, backText: { color: 'white', fontSize: 22 },
    title: { color: 'white', fontWeight: '800', fontSize: 16 },
    content: { padding: 14, paddingBottom: 40 },
    hint: { fontSize: 12, lineHeight: 18, marginBottom: 12, color: colors.textSecondary },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
    chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: colors.border, marginRight: 7, marginBottom: 7 },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { color: colors.text, fontSize: 12 },
    chipOnText: { color: colors.onPrimary, fontWeight: '700', fontSize: 12 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 13, marginBottom: 8 },
    loading: { marginVertical: 10 },
    error: { fontSize: 12, color: colors.error, marginBottom: 8 },
    userRow: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, marginBottom: 6 },
    userRowOn: { borderColor: colors.primary },
    userName: { fontWeight: '800', fontSize: 13, color: colors.text },
    userMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    chosen: { fontSize: 12, fontWeight: '700', color: colors.primary, marginTop: 4, marginBottom: 8 },
    pick: { fontSize: 12, color: colors.textSecondary, marginTop: 14, textAlign: 'center' },
    editing: { fontSize: 11, color: colors.textSecondary, marginBottom: 10, lineHeight: 16 },
    row: { minHeight: 62, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
    info: { flex: 1 },
    name: { fontSize: 14, fontWeight: '800', color: colors.text },
    key: { fontSize: 10, marginTop: 2, color: colors.textSecondary },
    toggle: { minWidth: 72, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 10, alignItems: 'center' },
    on: { backgroundColor: colors.primary }, off: { backgroundColor: '#6B7280' },
    toggleText: { color: 'white', fontSize: 10, fontWeight: '800' },
    tri: { flexDirection: 'row' },
    triBtn: { paddingVertical: 7, paddingHorizontal: 9, borderRadius: 8, borderWidth: 1, borderColor: colors.border, marginLeft: 5 },
    triOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    triOff: { backgroundColor: colors.error, borderColor: colors.error },
    triText: { fontSize: 10, fontWeight: '800', color: colors.textSecondary },
    triTextOn: { color: 'white' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
    denied: { textAlign: 'center', color: colors.textSecondary },
  });
}
