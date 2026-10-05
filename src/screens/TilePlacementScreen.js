import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Switch, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import ServiceArt, { hasServiceArt } from '../components/ServiceArt';
import PhotoTileIcon, { hasPhotoTileIcon, photoIconFor } from '../components/PhotoTileIcon';
import { serviceEmoji } from '../components/serviceEmoji';
import { showAlert } from '../utils/appAlert';
import { placeableTiles, tileOnHome } from '../components/serviceTiles';
import * as tilePlacementService from '../firebase/tilePlacementService';

/**
 * Choosing which tiles sit on each role's home screen.
 *
 * The home screen was whatever the code declared, so swapping a tile on it for
 * another one meant a release. For admin and superadmin the declaration was
 * also simply wrong: nothing in the Control Center's list is flagged for home,
 * so every tile was on the home grid and More Features had nothing left to
 * show - the same destinations twice, and no way to move any of them.
 *
 * A tile turned off here is NOT hidden. It moves to More Features (for admin
 * and superadmin, to the More Features section of the Control Center itself,
 * which is where those tiles can actually be routed from). That is the rule
 * this app holds itself to: a finished feature lands on the home screen or in
 * More Features, never nowhere. Hiding a tile outright is Grid Access, and it
 * still wins - a tile switched off there is off wherever it was placed.
 *
 * Per role, because the roles do not share a home screen and never did.
 */
const ROLE_LABELS = {
  customer: 'Customer',
  dealer: 'Dealer',
  reseller: 'Reseller',
  support: 'Support Agent',
  finance: 'Finance',
  admin: 'Admin',
  superadmin: 'Superadmin',
};

/** The tile's own picture, at row size. Same precedence the grids use. */
function TileIcon({ tile, colors }) {
  const own = tile.art || tile.key;
  const photo = hasPhotoTileIcon(own) ? own : photoIconFor(own);
  if (photo) return <PhotoTileIcon art={photo} size={24} />;
  if (hasServiceArt(own)) return <ServiceArt name={own} size={24} color={colors.primary} />;
  return <Text style={{ fontSize: 20 }}>{tile.emoji || serviceEmoji(tile.key)}</Text>;
}

export default function TilePlacementScreen() {
  const { goBackOrHome, profile, tilePlacement, webviewPages, tileLabels } = useApp();
  const { colors, brandGradient } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [role, setRole] = useState('superadmin');
  const [busyKey, setBusyKey] = useState('');

  // Superadmin only, mirroring firestore.rules. This is not the boundary - the
  // rules are - it just keeps the screen honest about who it is for.
  const allowed = profile?.role === 'superadmin';

  const { tiles, declaredDefault } = useMemo(
    () => placeableTiles({ role, webviewPages, tileLabels, hasArt: hasServiceArt }),
    [role, webviewPages, tileLabels],
  );
  const overrides = tilePlacementService.placementFor(tilePlacement, role);
  const onHomeCount = tiles.filter((tile) => tileOnHome(tile, overrides, declaredDefault)).length;

  const toggle = async (tile, next) => {
    if (busyKey) return;
    setBusyKey(tile.key);
    try {
      // Back to the default rather than storing a value equal to it: an
      // override that says what the code already says is a row that stays
      // behind after the feature's own flag changes, and then says the
      // opposite of what it was set for.
      if (next === tileOnHome(tile, null, declaredDefault)) {
        await tilePlacementService.clearTilePlacement(role, tile.key);
      } else {
        await tilePlacementService.setTileOnHome(role, tile.key, next);
      }
    } catch (e) {
      showAlert('Could not save', e?.message || 'Please try again.');
    } finally {
      setBusyKey('');
    }
  };

  const resetRole = () => {
    showAlert(
      'Reset this role?',
      `Every tile goes back to where ${ROLE_LABELS[role] || role} ships with it. Nothing is hidden either way.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          onPress: async () => {
            try {
              await tilePlacementService.resetRolePlacement(role);
            } catch (e) {
              showAlert('Could not reset', e?.message || 'Please try again.');
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Home Screen Tiles</Text>
      </LinearGradient>

      {!allowed ? (
        <Text style={styles.denied}>Only a superadmin can move tiles between screens.</Text>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roleRow}>
            {tilePlacementService.PLACEMENT_ROLES.map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.roleChip, r === role && styles.roleChipOn]}
                onPress={() => setRole(r)}
                accessibilityRole="button"
              >
                <Text style={[styles.roleChipText, r === role && styles.roleChipTextOn]}>{ROLE_LABELS[r] || r}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.intro}>
              On means the tile is on this role&apos;s home screen. Off moves it to More Features -
              it is not hidden, and nothing changes about where it goes or what it is called.
            </Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summary}>
                {onHomeCount} of {tiles.length} on the home screen
              </Text>
              <TouchableOpacity onPress={resetRole} accessibilityRole="button">
                <Text style={styles.resetLink}>Reset role</Text>
              </TouchableOpacity>
            </View>

            {tiles.map((tile) => {
              const on = tileOnHome(tile, overrides, declaredDefault);
              const moved = typeof overrides[tile.key] === 'boolean';
              return (
                <View key={tile.key} style={styles.row}>
                  <View style={styles.iconBox}><TileIcon tile={tile} colors={colors} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{tile.name}</Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {moved ? `${on ? 'added to' : 'moved off'} home · ${tile.key}` : tile.key}
                    </Text>
                  </View>
                  {busyKey === tile.key
                    ? <ActivityIndicator color={colors.primary} />
                    : <Switch
                        value={on}
                        onValueChange={(next) => toggle(tile, next)}
                        trackColor={{ true: colors.primary, false: colors.border }}
                        accessibilityLabel={`${tile.name} on the home screen`}
                      />}
                </View>
              );
            })}
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
    roleRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
    roleChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    roleChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    roleChipText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
    roleChipTextOn: { color: '#FFFFFF' },
    content: { paddingHorizontal: 12, paddingBottom: 40 },
    intro: { fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginBottom: 12 },
    summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    summary: { fontSize: 12, fontWeight: '700', color: colors.text },
    resetLink: { fontSize: 12, fontWeight: '700', color: colors.primary },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 10, marginBottom: 7, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    iconBox: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.primary}12` },
    rowName: { fontSize: 13.5, fontWeight: '700', color: colors.text },
    rowMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  });
}
