import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import ServiceArt, { hasServiceArt } from '../components/ServiceArt';
import { serviceEmoji } from '../components/serviceEmoji';
import { showAlert } from '../utils/appAlert';
import { editableTiles } from '../components/serviceTiles';
import * as tileLabelService from '../firebase/tileLabelService';

/**
 * Renaming and re-iconing every tile, without a release.
 *
 * WebView tiles have been editable for a while; nothing else was. "Mobile
 * Top-Up", "Support Inbox" and the rest were literals, so matching the words
 * staff actually use, or giving a tile a clearer picture, meant a store build.
 *
 * Only the label and the icon. Where a tile GOES is not editable here, and
 * deliberately: a badly named tile is a bad name, but a tile repointed at
 * another feature would be a way to dress one thing up as another. Switching a
 * tile off is Grid Access, and a WebView's address is WebView Pages.
 *
 * The list is derived from the declared tile lists, so a tile added anywhere
 * shows up here on its own - an editor that quietly covered most of the app
 * would be worse than none.
 */

function iconPreview(tile, override, colors) {
  const chosen = override?.icon;
  if (chosen && override.iconIsArt) return <ServiceArt name={chosen} size={26} color={colors.primary} />;
  if (chosen) return <Text style={{ fontSize: 22 }}>{chosen}</Text>;
  if (hasServiceArt(tile.art || tile.key)) return <ServiceArt name={tile.art || tile.key} size={26} color={colors.primary} />;
  return <Text style={{ fontSize: 22 }}>{serviceEmoji(tile.key)}</Text>;
}

export default function TileLabelsScreen() {
  const { goBackOrHome, tileLabels, profile } = useApp();
  const { colors, brandGradient } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const groups = useMemo(() => editableTiles(), []);

  const [editing, setEditing] = useState(null); // tile being edited
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  // Superadmin only, mirroring firestore.rules. This is not the boundary - the
  // rules are - it just keeps the screen honest about who it is for.
  const allowed = profile?.role === 'superadmin';

  const open = (tile) => {
    const current = tileLabels?.[tile.key] || {};
    setEditing(tile);
    setName(current.name || '');
    setIcon(current.icon || '');
  };

  const save = async () => {
    if (!editing || busy) return;
    setBusy(true);
    try {
      await tileLabelService.saveTileLabel(editing.key, { name, icon }, { isArtName: hasServiceArt });
      setEditing(null);
    } catch (e) {
      showAlert('Could not save', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!editing || busy) return;
    setBusy(true);
    try {
      await tileLabelService.resetTileLabel(editing.key);
      setEditing(null);
    } catch (e) {
      showAlert('Could not reset', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const term = search.trim().toLowerCase();
  const matches = (tile) => !term
    || String(tile.name || '').toLowerCase().includes(term)
    || String(tile.key || '').toLowerCase().includes(term);

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tile Names & Icons</Text>
      </LinearGradient>

      {!allowed ? (
        <Text style={styles.denied}>Only a superadmin can rename tiles.</Text>
      ) : (
        <>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.search}
              value={search}
              onChangeText={setSearch}
              placeholder="Search a tile by name"
              placeholderTextColor={colors.placeholder}
              autoCorrect={false}
            />
          </View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.intro}>
              Changing a name or icon here changes it everywhere that tile appears. Where it goes,
              whether it is switched on, and a WebView&apos;s address are set elsewhere.
            </Text>
            {groups.map((group) => {
              const tiles = group.tiles.filter(matches);
              if (!tiles.length) return null;
              return (
                <View key={group.label} style={styles.group}>
                  <Text style={styles.groupTitle}>{group.label}</Text>
                  {tiles.map((tile) => {
                    const override = tileLabels?.[tile.key];
                    const changed = !!(override && (override.name || override.icon));
                    return (
                      <TouchableOpacity key={tile.key} style={styles.row} onPress={() => open(tile)} activeOpacity={0.7}>
                        <View style={styles.iconBox}>{iconPreview(tile, override, colors)}</View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowName} numberOfLines={1}>{override?.name || tile.name}</Text>
                          {/* The shipped name, so it is obvious what was changed
                              and what it was called before. */}
                          <Text style={styles.rowMeta} numberOfLines={1}>
                            {changed ? `was ${tile.name} · ${tile.key}` : tile.key}
                          </Text>
                        </View>
                        {!!changed && <View style={styles.editedDot} />}
                        <Text style={styles.chevron}>›</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>
        </>
      )}

      {!!editing && (
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{editing.name}</Text>
            <Text style={styles.sheetKey}>{editing.key}</Text>

            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={editing.name}
              placeholderTextColor={colors.placeholder}
              maxLength={40}
            />

            <Text style={styles.label}>Icon</Text>
            <Text style={styles.hint}>
              Paste an emoji, or type the name of a built-in drawing such as {'"'}recharge{'"'} or {'"'}support{'"'}.
            </Text>
            <TextInput
              style={styles.input}
              value={icon}
              onChangeText={setIcon}
              placeholder="Leave empty to keep the default"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              maxLength={12}
            />
            {/* Says which of the two it read the value as, before it is saved -
                a mistyped drawing name would otherwise silently become an
                emoji nobody can see. */}
            {!!icon.trim() && (
              <Text style={styles.hint}>
                {hasServiceArt(icon.trim())
                  ? `Recognised as the built-in "${icon.trim()}" drawing.`
                  : 'Will be drawn as text. If you meant a built-in drawing, check the spelling.'}
              </Text>
            )}

            <View style={styles.sheetRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(null)} disabled={busy}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.resetBtn} onPress={reset} disabled={busy}>
                <Text style={styles.resetText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={busy}>
                {busy ? <ActivityIndicator color={colors.onPrimary} size="small" /> : <Text style={styles.saveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
    denied: { textAlign: 'center', color: colors.textSecondary, fontSize: 13, marginTop: 40, paddingHorizontal: 30, lineHeight: 19 },
    searchRow: { paddingHorizontal: 16, paddingTop: 12 },
    search: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: colors.text },
    content: { padding: 16, paddingBottom: 40 },
    intro: { fontSize: 11.5, color: colors.textSecondary, lineHeight: 17, marginBottom: 14 },
    group: { marginBottom: 18 },
    groupTitle: { fontSize: 11, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 11, marginBottom: 8 },
    iconBox: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    rowName: { fontSize: 14, fontWeight: '700', color: colors.text },
    rowMeta: { fontSize: 10.5, color: colors.textSecondary, marginTop: 2 },
    editedDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
    chevron: { fontSize: 18, color: colors.textSecondary },
    sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: 20, paddingBottom: 26 },
    sheetTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
    sheetKey: { fontSize: 11, color: colors.textSecondary, marginTop: 2, marginBottom: 14 },
    label: { fontSize: 12, fontWeight: '700', color: colors.text, marginBottom: 5 },
    hint: { fontSize: 11, color: colors.textSecondary, lineHeight: 16, marginBottom: 7 },
    input: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, color: colors.text, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14, marginBottom: 12 },
    sheetRow: { flexDirection: 'row', gap: 9, marginTop: 6 },
    cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    cancelText: { color: colors.text, fontWeight: '700', fontSize: 13 },
    resetBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error, alignItems: 'center' },
    resetText: { color: colors.error, fontWeight: '700', fontSize: 13 },
    saveBtn: { flex: 1.2, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
    saveText: { color: colors.onPrimary, fontWeight: '800', fontSize: 13 },
  });
}
