import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import ServiceArt, { hasServiceArt, serviceArtNames } from '../components/ServiceArt';
import PhotoTileIcon, { hasPhotoTileIcon, photoTileIconNames, photoIconFor } from '../components/PhotoTileIcon';
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

/**
 * Does this name artwork rather than text?
 *
 * Both kinds, because a superadmin choosing a picture from the pack and one
 * choosing a drawing are doing the same thing. Passed to the save, so what is
 * stored as `iconIsArt` matches what the grids will look for - get these two
 * out of step and a chosen picture is stored as an emoji and printed as its
 * own name.
 */
const isIconArtName = (value) => hasPhotoTileIcon(value) || hasServiceArt(value);

/** The drawing or picture a name stands for, at any size. */
function IconArt({ name, size, colors }) {
  if (hasPhotoTileIcon(name)) return <PhotoTileIcon art={name} size={size} />;
  return <ServiceArt name={name} size={size} color={colors.primary} />;
}

function iconPreview(tile, override, colors) {
  const chosen = override?.icon;
  if (chosen && override.iconIsArt) return <IconArt name={chosen} size={26} colors={colors} />;
  if (chosen) return <Text style={{ fontSize: 22 }}>{chosen}</Text>;
  // What the tile ships with: its own picture if it has one, then its drawing.
  const own = tile.art || tile.key;
  const photo = hasPhotoTileIcon(own) ? own : photoIconFor(own);
  if (photo) return <PhotoTileIcon art={photo} size={26} />;
  if (hasServiceArt(own)) return <ServiceArt name={own} size={26} color={colors.primary} />;
  return <Text style={{ fontSize: 22 }}>{serviceEmoji(tile.key)}</Text>;
}

// Pictures first: they are the ones somebody browsing for an icon wants to see,
// and the drawings are a long alphabetical list underneath.
const PICTURE_CHOICES = photoTileIconNames();
const DRAWING_CHOICES = serviceArtNames();

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
      await tileLabelService.saveTileLabel(editing.key, { name, icon }, { isArtName: isIconArtName });
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
            {/* Tapped, not typed. Every picture and drawing in the app is here,
                so a name nobody could guess - photoVerificationManagement - is
                a tile somebody taps rather than something they have to spell. */}
            <Text style={styles.hint}>Tap a picture, or paste an emoji below. Tap the chosen one again to go back to the default.</Text>
            <ScrollView style={styles.picker} contentContainerStyle={styles.pickerBody} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              <Text style={styles.pickerGroup}>Pictures</Text>
              <View style={styles.pickerRow}>
                {PICTURE_CHOICES.map((art) => (
                  <TouchableOpacity
                    key={art}
                    accessibilityRole="button"
                    accessibilityLabel={art}
                    onPress={() => setIcon(icon === art ? '' : art)}
                    style={[styles.swatch, icon === art && styles.swatchOn]}
                  >
                    <PhotoTileIcon art={art} size={30} />
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.pickerGroup}>Drawings</Text>
              <View style={styles.pickerRow}>
                {DRAWING_CHOICES.map((art) => (
                  <TouchableOpacity
                    key={art}
                    accessibilityRole="button"
                    accessibilityLabel={art}
                    onPress={() => setIcon(icon === art ? '' : art)}
                    style={[styles.swatch, icon === art && styles.swatchOn]}
                  >
                    <ServiceArt name={art} size={24} color={icon === art ? colors.onPrimary : colors.textSecondary} />
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <TextInput
              style={styles.input}
              value={icon}
              onChangeText={setIcon}
              placeholder="Or paste an emoji"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              // Long enough for the longest name in the pack. It was 12, which
              // silently truncated every picture name into an emoji nobody
              // could see.
              maxLength={40}
            />
            {/* Says which of the two it read the value as, before it is saved -
                a mistyped drawing name would otherwise silently become an
                emoji nobody can see. */}
            {!!icon.trim() && (
              <View style={styles.chosenRow}>
                <View style={styles.chosenBox}>
                  {isIconArtName(icon.trim())
                    ? <IconArt name={icon.trim()} size={26} colors={colors} />
                    : <Text style={{ fontSize: 20 }}>{icon.trim()}</Text>}
                </View>
                <Text style={[styles.hint, { flex: 1 }]}>
                  {isIconArtName(icon.trim())
                    ? `Recognised as the built-in "${icon.trim()}" icon.`
                    : 'Will be drawn as text. If you meant a built-in icon, tap one above.'}
                </Text>
              </View>
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
    picker: { maxHeight: 188, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 10, backgroundColor: colors.surface },
    pickerBody: { padding: 8 },
    pickerGroup: { fontSize: 10, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 2 },
    pickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
    swatch: { width: 42, height: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
    swatchOn: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primary },
    chosenRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
    chosenBox: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
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
