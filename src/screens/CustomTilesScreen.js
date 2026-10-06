import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, ActivityIndicator, Switch } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import ServiceArt, { hasServiceArt } from '../components/ServiceArt';
import PhotoTileIcon, { hasPhotoTileIcon, photoTileIconNames } from '../components/PhotoTileIcon';
import { showAlert } from '../utils/appAlert';
import { TILE_CATEGORIES } from '../components/serviceTiles';
import {
  CUSTOM_TILE_SERVICES, SEED_FIELDS, SERVICE_STEP_COUNTS, describeCustomTile, cleanCustomTile,
} from '../utils/customTiles';
import * as customTileService from '../firebase/customTileService';

/**
 * Adding a feature grid tile, without a release.
 *
 * A tile added here is a SHORTCUT into a service the app already has, with
 * some of the first steps answered - which is exactly what the JomPAY and
 * Touch 'n Go tiles are, only those were written by hand.
 *
 * IT CANNOT POINT AT A SCREEN, and that is the point. Tile Names & Icons
 * already refuses to change a tile's destination for the same reason: a tile
 * whose destination is free-form is a way to dress one feature up as another.
 * So the destination is one of the service flows that exist, and the worst a
 * badly made tile can do is land somebody on the wrong step of a real service.
 *
 * Where it sits is Home Screen Tiles. Whether it shows at all, and for whom,
 * is Grid Access - a tile added here scopes per role, country and person like
 * any other.
 */
const PICTURES = photoTileIconNames();

function Preview({ tile, colors }) {
  const art = tile.art || '';
  if (hasPhotoTileIcon(art)) return <PhotoTileIcon art={art} size={26} />;
  if (hasServiceArt(art)) return <ServiceArt name={art} size={26} color={colors.primary} />;
  return <Text style={{ fontSize: 22 }}>{tile.icon || '\u{1F310}'}</Text>;
}

const BLANK = { name: '', service: 'recharge', startStep: 0, cat: 'recharge', home: true, icon: '', art: '', seed: {} };

export default function CustomTilesScreen() {
  const { goBackOrHome, profile, customTiles, rawCustomTiles } = useApp();
  const { colors, brandGradient } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const categoryKeys = useMemo(() => TILE_CATEGORIES.map((c) => c.key), []);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const allowed = profile?.role === 'superadmin';

  const open = (tile) => {
    if (!tile) { setEditing({ ...BLANK, key: customTileService.newCustomTileKey(), isNew: true }); return; }
    const stored = (rawCustomTiles && rawCustomTiles[tile.key]) || {};
    setEditing({
      key: tile.key,
      name: tile.name,
      service: tile.service,
      startStep: tile.startStep,
      cat: tile.cat,
      home: tile.home !== false,
      icon: stored.icon || '',
      art: stored.art || '',
      seed: { ...tile.seed },
      isNew: false,
    });
  };

  // The same function the grids read through, so the preview and the Save
  // button agree with what will actually be drawn.
  const valid = editing ? cleanCustomTile(editing.key, editing, categoryKeys) : null;
  const maxStep = editing ? (SERVICE_STEP_COUNTS[editing.service] || 1) - 1 : 0;

  const save = async () => {
    if (!editing || busy) return;
    setBusy(true);
    try {
      await customTileService.saveCustomTile(editing.key, editing, categoryKeys);
      setEditing(null);
    } catch (e) {
      showAlert('Could not save', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!editing || editing.isNew) return;
    showAlert('Delete this tile?', `"${editing.name}" is removed from every grid. Nothing else changes.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        onPress: async () => {
          setBusy(true);
          try { await customTileService.deleteCustomTile(editing.key); setEditing(null); }
          catch (e) { showAlert('Could not delete', e?.message || 'Please try again.'); }
          finally { setBusy(false); }
        },
      },
    ]);
  };

  const setSeed = (field, value) => setEditing((e) => ({ ...e, seed: { ...e.seed, [field]: value } }));

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={editing ? () => setEditing(null) : goBackOrHome} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{editing ? (editing.isNew ? 'New Tile' : 'Edit Tile') : 'Feature Tiles'}</Text>
      </LinearGradient>

      {!allowed ? (
        <Text style={styles.denied}>Only a superadmin can add feature tiles.</Text>
      ) : !editing ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.intro}>
            A tile here opens a service the app already has, with the first steps already
            answered &mdash; the way JomPAY opens Bill Payment with JomPAY chosen. It cannot be
            pointed at a screen, which is what stops a tile being made to look like one feature
            and open another.
          </Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => open(null)} accessibilityRole="button">
            <Text style={styles.addText}>+ Add a feature tile</Text>
          </TouchableOpacity>

          {customTiles.length === 0 ? (
            <Text style={styles.empty}>No added tiles yet.</Text>
          ) : customTiles.map((tile) => (
            <TouchableOpacity key={tile.key} style={styles.row} onPress={() => open(tile)} activeOpacity={0.7}>
              <View style={styles.iconBox}><Preview tile={tile} colors={colors} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName} numberOfLines={1}>{tile.name}</Text>
                <Text style={styles.rowMeta} numberOfLines={2}>{describeCustomTile(tile)}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}

          <Text style={styles.note}>
            Where a tile sits is Home Screen Tiles. Who sees it is Grid Access &mdash; an added
            tile can be limited by role, country or person like any other.
          </Text>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={editing.name} onChangeText={(v) => setEditing({ ...editing, name: v })} placeholder="Celcom Reload" placeholderTextColor={colors.placeholder} maxLength={40} />

          <Text style={styles.label}>Opens</Text>
          <View style={styles.chips}>
            {CUSTOM_TILE_SERVICES.map((svc) => (
              <TouchableOpacity
                key={svc}
                style={[styles.chip, editing.service === svc && styles.chipOn]}
                // A shorter flow may not reach the chosen step, so the step is
                // brought back inside the new service rather than left past
                // the end of it.
                onPress={() => setEditing((e) => ({ ...e, service: svc, startStep: Math.min(e.startStep, (SERVICE_STEP_COUNTS[svc] || 1) - 1) }))}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, editing.service === svc && styles.chipTextOn]}>{svc}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Start at step</Text>
          <View style={styles.chips}>
            {Array.from({ length: maxStep + 1 }, (_, i) => i).map((i) => (
              <TouchableOpacity key={i} style={[styles.chip, editing.startStep === i && styles.chipOn]} onPress={() => setEditing({ ...editing, startStep: i })} accessibilityRole="button">
                <Text style={[styles.chipText, editing.startStep === i && styles.chipTextOn]}>{i + 1}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hint}>
            Every step you skip has to be answered below, or the tile lands on a step whose
            earlier answers are missing. Step 1 needs nothing.
          </Text>

          <Text style={styles.label}>Answers</Text>
          {SEED_FIELDS.map((field) => (
            <View key={field} style={styles.seedRow}>
              <Text style={styles.seedLabel}>{field}</Text>
              <TextInput
                style={[styles.input, styles.seedInput]}
                value={String(editing.seed?.[field] ?? '')}
                onChangeText={(v) => setSeed(field, v)}
                placeholder="—"
                placeholderTextColor={colors.placeholder}
                keyboardType={field === 'amount' ? 'numeric' : 'default'}
                autoCorrect={false}
              />
            </View>
          ))}

          <Text style={styles.label}>Category</Text>
          <View style={styles.chips}>
            {TILE_CATEGORIES.map((c) => (
              <TouchableOpacity key={c.key} style={[styles.chip, editing.cat === c.key && styles.chipOn]} onPress={() => setEditing({ ...editing, cat: c.key })} accessibilityRole="button">
                <Text style={[styles.chipText, editing.cat === c.key && styles.chipTextOn]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.label}>On the home screen</Text>
            <Switch value={editing.home !== false} onValueChange={(v) => setEditing({ ...editing, home: v })} trackColor={{ true: colors.primary, false: colors.border }} />
          </View>

          <Text style={styles.label}>Icon</Text>
          <TextInput style={styles.input} value={editing.icon} onChangeText={(v) => setEditing({ ...editing, icon: v })} placeholder="An emoji, e.g. 📶" placeholderTextColor={colors.placeholder} maxLength={40} />
          <Text style={styles.label}>...or a picture</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <TouchableOpacity style={[styles.chip, !editing.art && styles.chipOn]} onPress={() => setEditing({ ...editing, art: '' })} accessibilityRole="button">
              <Text style={[styles.chipText, !editing.art && styles.chipTextOn]}>None</Text>
            </TouchableOpacity>
            {PICTURES.slice(0, 40).map((name) => (
              <TouchableOpacity key={name} style={[styles.artChip, editing.art === name && styles.chipOn]} onPress={() => setEditing({ ...editing, art: name })} accessibilityRole="button">
                <PhotoTileIcon art={name} size={24} />
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.previewCard}>
            <View style={styles.iconBox}><Preview tile={editing} colors={colors} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName} numberOfLines={1}>{editing.name || 'Untitled'}</Text>
              <Text style={styles.rowMeta} numberOfLines={2}>
                {valid ? describeCustomTile(valid) : 'Not valid yet'}
              </Text>
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.saveBtn, (!valid || busy) && styles.saveOff]} onPress={save} disabled={!valid || busy} accessibilityRole="button">
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>{editing.isNew ? 'Add tile' : 'Save'}</Text>}
            </TouchableOpacity>
            {!editing.isNew && (
              <TouchableOpacity style={styles.deleteBtn} onPress={remove} disabled={busy} accessibilityRole="button">
                <Text style={styles.deleteText}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
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
    content: { padding: 12, paddingBottom: 48 },
    intro: { fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginBottom: 12 },
    empty: { fontSize: 12.5, color: colors.textSecondary, paddingVertical: 14 },
    addBtn: { paddingVertical: 11, paddingHorizontal: 12, marginBottom: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, backgroundColor: `${colors.primary}12` },
    addText: { fontSize: 13, fontWeight: '800', color: colors.primary },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 10, marginBottom: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    iconBox: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.primary}12` },
    rowName: { fontSize: 13.5, fontWeight: '700', color: colors.text },
    rowMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2, lineHeight: 15 },
    chevron: { fontSize: 20, color: colors.textSecondary },
    note: { fontSize: 11.5, color: colors.textSecondary, lineHeight: 16, marginTop: 14 },
    label: { fontSize: 11.5, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 6 },
    hint: { fontSize: 11, color: colors.textSecondary, lineHeight: 16, marginTop: 6 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 11, paddingVertical: 9, fontSize: 13, color: colors.text, backgroundColor: colors.card },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    chip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    artChip: { padding: 6, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12, fontWeight: '700', color: colors.text },
    chipTextOn: { color: '#FFFFFF' },
    seedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
    seedLabel: { width: 72, fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
    seedInput: { flex: 1 },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    previewCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, padding: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, backgroundColor: `${colors.primary}0D` },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 },
    saveBtn: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: radius.md, backgroundColor: colors.primary, minWidth: 110, alignItems: 'center' },
    saveOff: { opacity: 0.45 },
    saveText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
    deleteBtn: { paddingHorizontal: 12, paddingVertical: 11 },
    deleteText: { fontSize: 13, fontWeight: '700', color: '#D9534F' },
  });
}
