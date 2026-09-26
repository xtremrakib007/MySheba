import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radius, shadows } from '../theme/theme';

// The patterns the Grid Style mockup repeats, as components rather than as
// copies in each screen.
//
// Screens 18-25 are the same object drawn again: a rounded card holding rows
// of [tinted icon square] [title over subtitle] [chevron]. Screens 14 and 17
// are that row with a signed amount instead of a chevron. Screens 26-29 are
// a pair of stat cards over a four-up tile grid. Hand-writing those across
// 68 screens is how a design drifts - one screen gets 14px of padding and
// another 16, and nobody can say which is right.
//
// Named uiRows rather than ui/ because src/components/ui.js already exists,
// and a ui/ directory beside it would make `from './ui'` ambiguous.
//
// Colour comes entirely from the active role palette, so these stay green
// for a customer, blue for admin and purple for superadmin while knowing
// nothing about roles.

export function SectionCard({ title, children, style }) {
  const { colors } = useTheme();
  const s = createStyles(colors);
  return (
    <View style={style}>
      {!!title && <Text style={s.sectionTitle}>{title}</Text>}
      <View style={s.card}>{children}</View>
    </View>
  );
}

export function ListRow({ icon, iconColor, title, subtitle, value, onPress, last, disabled }) {
  const { colors } = useTheme();
  const s = createStyles(colors);
  const tint = iconColor || colors.primary;
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap
      style={[s.row, !last && s.rowDivider, disabled && s.rowDisabled]}
      onPress={onPress}
      disabled={disabled || !onPress}
      activeOpacity={0.7}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      {!!icon && (
        <View style={[s.iconChip, { backgroundColor: `${tint}1A` }]}>
          <Text style={[s.iconGlyph, { color: tint }]}>{icon}</Text>
        </View>
      )}
      <View style={s.rowText}>
        <Text style={s.rowTitle} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={s.rowSubtitle} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {!!value && <Text style={s.rowValue} numberOfLines={1}>{value}</Text>}
      {!!onPress && <Text style={s.chevron}>{'›'}</Text>}
    </Wrap>
  );
}

export function ToggleRow({ icon, iconColor, title, subtitle, value, onValueChange, last }) {
  const { colors } = useTheme();
  const s = createStyles(colors);
  const tint = iconColor || colors.primary;
  return (
    <View style={[s.row, !last && s.rowDivider]}>
      {!!icon && (
        <View style={[s.iconChip, { backgroundColor: `${tint}1A` }]}>
          <Text style={[s.iconGlyph, { color: tint }]}>{icon}</Text>
        </View>
      )}
      <View style={s.rowText}>
        <Text style={s.rowTitle} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={s.rowSubtitle} numberOfLines={1}>{subtitle}</Text>}
      </View>
      <Switch
        value={!!value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={colors.onPrimary}
      />
    </View>
  );
}

// Screen 14's All / Top-Up / Bill / Internet row.
export function FilterChips({ options, value, onChange, style }) {
  const { colors } = useTheme();
  const s = createStyles(colors);
  return (
    <View style={[s.chipRow, style]}>
      {(options || []).map((opt) => {
        const key = typeof opt === 'string' ? opt : opt.key;
        const label = typeof opt === 'string' ? opt : opt.label;
        const on = key === value;
        return (
          <TouchableOpacity
            key={key}
            style={[s.chip, on && s.chipOn]}
            onPress={() => onChange(key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[s.chipText, on && s.chipTextOn]} numberOfLines={1}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Screens 14 and 17. The amount carries the sign and the colour, since it is
// the only thing most people read in a history list.
export function TxRow({ icon, iconColor, title, subtitle, amount, direction = 'out', onPress, last }) {
  const { colors } = useTheme();
  const s = createStyles(colors);
  const tint = iconColor || colors.primary;
  const inbound = direction === 'in';
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={[s.row, !last && s.rowDivider]} onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
      <View style={[s.iconChip, { backgroundColor: `${tint}1A` }]}>
        <Text style={[s.iconGlyph, { color: tint }]}>{icon}</Text>
      </View>
      <View style={s.rowText}>
        <Text style={s.rowTitle} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={s.rowSubtitle} numberOfLines={1}>{subtitle}</Text>}
      </View>
      <Text style={[s.amount, { color: inbound ? colors.success : colors.error }]} numberOfLines={1}>
        {inbound ? '+' : '-'}{amount}
      </Text>
    </Wrap>
  );
}

// The pair at the top of screens 26-29.
export function StatPair({ left, right }) {
  const { colors } = useTheme();
  const s = createStyles(colors);
  const Card = ({ item }) => (
    <View style={s.statCard}>
      <Text style={s.statLabel} numberOfLines={1}>{item?.label}</Text>
      <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{item?.value}</Text>
    </View>
  );
  return <View style={s.statRow}><Card item={left} /><Card item={right} /></View>;
}

// The four-up quick grid under the stats on screens 26-29.
export function QuickTiles({ items }) {
  const { colors } = useTheme();
  const s = createStyles(colors);
  return (
    <View style={s.quickGrid}>
      {(items || []).map((it) => {
        const tint = it.color || colors.primary;
        return (
          <TouchableOpacity
            key={it.key || it.label}
            style={s.quickTile}
            onPress={it.onPress}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={it.label}
          >
            <View style={[s.quickIcon, { backgroundColor: `${tint}1A` }]}>
              <Text style={[s.quickGlyph, { color: tint }]}>{it.icon}</Text>
            </View>
            <Text style={s.quickLabel} numberOfLines={1}>{it.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    sectionTitle: { fontSize: 13, fontWeight: '800', color: colors.textSecondary, marginBottom: 8, marginLeft: 4, letterSpacing: 0.2 },
    card: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadows.card },

    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, backgroundColor: colors.card },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
    rowDisabled: { opacity: 0.5 },
    rowText: { flex: 1, minWidth: 0 },
    rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
    rowSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    rowValue: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, maxWidth: '40%' },
    chevron: { fontSize: 22, color: colors.textSecondary, marginLeft: 2, marginTop: -2 },

    iconChip: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    iconGlyph: { fontSize: 18 },

    chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.tileBg || colors.surface, borderWidth: 1, borderColor: colors.border },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12.5, fontWeight: '700', color: colors.textSecondary },
    chipTextOn: { color: colors.onPrimary },

    amount: { fontSize: 14, fontWeight: '800' },

    statRow: { flexDirection: 'row', gap: 12 },
    statCard: { flex: 1, backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: 14, ...shadows.card },
    statLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
    statValue: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 6 },

    quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    // Two per row: grow from a 47% basis so the 12px gap is absorbed rather
    // than pushing a tile onto its own line, which is what a flat 50% does.
    quickTile: { flexGrow: 1, flexBasis: '47%', backgroundColor: colors.card, borderRadius: radius.tile, borderWidth: 1, borderColor: colors.border, paddingVertical: 16, alignItems: 'center', gap: 8, ...shadows.card },
    quickIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    quickGlyph: { fontSize: 20 },
    quickLabel: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  });
}
