import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Switch, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { showAlert } from '../utils/appAlert';
import HeaderDecor from '../components/HeaderDecor';
import ServiceArt, { hasServiceArt } from '../components/ServiceArt';
import * as webviewConfigService from '../firebase/webviewConfigService';

// An icon is either the name of a drawing the app ships or a single emoji.
// Offering the drawings by name is what keeps a new tile looking like the rest
// of the grid instead of an emoji among vector marks.
const SUGGESTED_ART = ['visa', 'passport', 'fomema', 'mydigital', 'train', 'bus', 'flight', 'documents', 'support', 'moreFeaturesTile'];

function IconPreview({ icon, color }) {
  if (hasServiceArt(icon)) return <ServiceArt name={icon} size={26} color={color} />;
  return <Text style={{ fontSize: 22 }}>{icon || '🌐'}</Text>;
}

export default function WebviewManagementScreen() {
  const { colors, brandGradient } = useTheme();
  const { profile, goBackOrHome, webviewPages } = useApp();
  const isSuperadmin = profile?.role === 'superadmin';
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [editing, setEditing] = useState(null); // { key, name, url, title, icon, active, custom, isNew }
  const [busy, setBusy] = useState(false);

  const pages = useMemo(
    () => Object.values(webviewPages || {}).sort((a, b) => Number(a.custom) - Number(b.custom) || String(a.name).localeCompare(String(b.name))),
    [webviewPages],
  );

  const startNew = () => setEditing({
    key: webviewConfigService.newCustomKey(),
    name: '', url: 'https://', title: '', icon: '🌐', active: true, custom: true, isNew: true,
  });

  const save = async () => {
    if (busy || !editing) return;
    setBusy(true);
    try {
      await webviewConfigService.saveWebviewPage(editing.key, editing);
      setEditing(null);
    } catch (e) {
      showAlert('WebView Pages', e?.message || 'Could not save this page.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (page) => {
    showAlert('Delete WebView', `Remove "${page.name}" from the grid? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try { await webviewConfigService.deleteWebviewPage(page.key); setEditing(null); }
          catch (e) { showAlert('WebView Pages', e?.message || 'Could not delete this page.'); }
        },
      },
    ]);
  };

  const toggleActive = async (page) => {
    try { await webviewConfigService.saveWebviewPage(page.key, { ...page, active: !page.active }); }
    catch (e) { showAlert('WebView Pages', e?.message || 'Could not update this page.'); }
  };

  if (!isSuperadmin) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.bg }]}>
        <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
          <HeaderDecor />
          <TouchableOpacity onPress={goBackOrHome} style={styles.back}><Text style={styles.backText}>←</Text></TouchableOpacity>
          <Text style={styles.title}>🌐 WebView Pages</Text>
        </LinearGradient>
        <View style={styles.center}><Text style={styles.denied}>Only a Superadmin can manage WebView pages.</Text></View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity onPress={editing ? () => setEditing(null) : goBackOrHome} style={styles.back}><Text style={styles.backText}>←</Text></TouchableOpacity>
        <Text style={styles.title}>{editing ? (editing.isNew ? 'New WebView' : 'Edit WebView') : '🌐 WebView Pages'}</Text>
      </LinearGradient>

      {editing ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.hint}>
            The address opens inside the app. It must start with https:// — a plain http page is sent in the
            clear, and this is where people check immigration and medical status.
          </Text>

          <Text style={styles.label}>Tile name</Text>
          <TextInput style={styles.input} value={editing.name} onChangeText={(v) => setEditing({ ...editing, name: v })}
            placeholder="e.g. EPF Check" placeholderTextColor={colors.placeholder} maxLength={40} />

          <Text style={styles.label}>Address</Text>
          <TextInput style={styles.input} value={editing.url} onChangeText={(v) => setEditing({ ...editing, url: v.trim() })}
            placeholder="https://example.gov.my/status" placeholderTextColor={colors.placeholder}
            autoCapitalize="none" keyboardType="url" />

          <Text style={styles.label}>Header title <Text style={styles.optional}>— optional, defaults to the tile name</Text></Text>
          <TextInput style={styles.input} value={editing.title} onChangeText={(v) => setEditing({ ...editing, title: v })}
            placeholder="🏥 FOMEMA Status Check" placeholderTextColor={colors.placeholder} maxLength={60} />

          <Text style={styles.label}>Icon</Text>
          <View style={styles.iconRow}>
            <View style={styles.iconPreview}><IconPreview icon={editing.icon} color={colors.primary} /></View>
            <TextInput style={[styles.input, styles.iconInput]} value={editing.icon} onChangeText={(v) => setEditing({ ...editing, icon: v })}
              placeholder="🌐" placeholderTextColor={colors.placeholder} maxLength={8} autoCapitalize="none" />
          </View>
          <Text style={styles.hintSmall}>Paste an emoji, or use one of the app&apos;s own drawings:</Text>
          <View style={styles.chipRow}>
            {SUGGESTED_ART.map((art) => (
              <TouchableOpacity key={art} onPress={() => setEditing({ ...editing, icon: art })}
                style={[styles.chip, editing.icon === art && styles.chipOn]}>
                <ServiceArt name={art} size={18} color={editing.icon === art ? colors.onPrimary : colors.textSecondary} />
                <Text style={editing.icon === art ? styles.chipOnText : styles.chipText}>{art}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.label}>Shown in the grid</Text>
            <Switch value={editing.active !== false} onValueChange={(v) => setEditing({ ...editing, active: v })}
              trackColor={{ false: colors.border, true: colors.primary }} thumbColor={colors.onPrimary} />
          </View>

          <TouchableOpacity style={[styles.saveBtn, busy && styles.saveBtnBusy]} onPress={save} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.saveText}>Save</Text>}
          </TouchableOpacity>

          {!!editing.custom && !editing.isNew && (
            <TouchableOpacity style={styles.deleteBtn} onPress={() => remove(editing)} disabled={busy}>
              <Text style={styles.deleteText}>Delete this WebView</Text>
            </TouchableOpacity>
          )}
          {!editing.custom && (
            <Text style={styles.hintSmall}>
              This page ships with the app, so it cannot be deleted — turn it off to take it out of the grid.
            </Text>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.hint}>
            Change where a tile goes and how it looks, or add a new one. Changes are live — no rebuild.
          </Text>
          <TouchableOpacity style={styles.addBtn} onPress={startNew}>
            <Text style={styles.addText}>+ Add a WebView page</Text>
          </TouchableOpacity>

          {pages.map((page) => (
            <View key={page.key} style={styles.row}>
              <View style={styles.rowIcon}><IconPreview icon={page.icon} color={colors.primary} /></View>
              <TouchableOpacity style={styles.rowBody} onPress={() => setEditing({ ...page, isNew: false })}>
                <Text style={styles.rowName} numberOfLines={1}>{page.name}</Text>
                <Text style={styles.rowUrl} numberOfLines={1}>{page.url}</Text>
                <Text style={styles.rowMeta}>{page.custom ? 'Added here' : 'Built in'}</Text>
              </TouchableOpacity>
              <Switch value={page.active !== false} onValueChange={() => toggleActive(page)}
                trackColor={{ false: colors.border, true: colors.primary }} thumbColor={colors.onPrimary} />
            </View>
          ))}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, overflow: 'hidden' },
    back: { padding: 4 }, backText: { color: 'white', fontSize: 22 },
    title: { color: 'white', fontWeight: '800', fontSize: 16 },
    content: { padding: 14, paddingBottom: 48 },
    hint: { fontSize: 12, lineHeight: 18, color: colors.textSecondary, marginBottom: 12 },
    hintSmall: { fontSize: 11, lineHeight: 16, color: colors.textSecondary, marginTop: 8, marginBottom: 6 },
    label: { fontSize: 12, fontWeight: '800', color: colors.text, marginTop: 12, marginBottom: 5 },
    optional: { fontWeight: '500', color: colors.textSecondary },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.text, backgroundColor: colors.inputBg },
    iconRow: { flexDirection: 'row', alignItems: 'center' },
    iconPreview: { width: 44, height: 44, borderRadius: 11, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: 8, backgroundColor: colors.card },
    iconInput: { flex: 1 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: colors.border, marginRight: 6, marginBottom: 6 },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 11, color: colors.textSecondary },
    chipOnText: { fontSize: 11, color: colors.onPrimary, fontWeight: '700' },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
    saveBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 18 },
    saveBtnBusy: { opacity: 0.7 },
    saveText: { color: colors.onPrimary, fontWeight: '800', fontSize: 14 },
    deleteBtn: { alignItems: 'center', paddingVertical: 13, marginTop: 6 },
    deleteText: { color: colors.error, fontWeight: '700', fontSize: 13 },
    addBtn: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 14 },
    addText: { color: colors.primary, fontWeight: '800', fontSize: 13 },
    row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 14, padding: 11, marginBottom: 8 },
    rowIcon: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 10, backgroundColor: colors.bg },
    rowBody: { flex: 1, marginRight: 8 },
    rowName: { fontSize: 13, fontWeight: '800', color: colors.text },
    rowUrl: { fontSize: 10.5, color: colors.textSecondary, marginTop: 2 },
    rowMeta: { fontSize: 9.5, color: colors.textSecondary, marginTop: 3, fontWeight: '700' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
    denied: { textAlign: 'center', color: colors.textSecondary },
  });
}
