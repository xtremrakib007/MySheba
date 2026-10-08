import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { FormLabel, PackageCard } from './ui';
import { groupByCategory } from '../utils/packageCategory';
import { groupByValidity } from '../utils/packageValidity';

/**
 * A provider catalogue, by kind and then by how long it lasts.
 *
 * Sixty-three packs in one list is a wall of text. Two questions decide which
 * one somebody wants - what kind of pack, and how long it runs - so kind is a
 * row of chips across the top and validity is the headings underneath. Neither
 * alone was enough: grouped only by validity, a minute pack sits inside a 30-day
 * data section and has to be read to be ruled out.
 *
 * "All" is first and selected by default. A pack's kind can be a guess when the
 * provider sent none, and a wrong guess must not make a product unreachable - it
 * is still in All, just not where it was looked for. A chip for an empty kind is
 * never shown, so an operator that sells no voice packs has no Voice chip.
 *
 * The Internet and Offer Packs steps rendered this same block, differing only in
 * a label. The second dimension would have been written twice.
 */
export default function PackagePicker({ packages, label, selectedName, onSelect, priceOf, currencyOf }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [kind, setKind] = useState('all');

  const categories = useMemo(() => groupByCategory(packages), [packages]);
  // One kind is not a choice, so the chips are hidden rather than shown with a
  // single option beside All.
  const showChips = categories.length > 1;
  // Switching operator changes which kinds exist. A chip selected under the old
  // operator and absent from the new one would leave no chip lit and the whole
  // list showing, which reads as a bug; falling back to All is the honest state
  // and needs no effect to repair it.
  const active = categories.some((c) => c.key === kind) ? kind : 'all';
  const chosen = showChips ? categories.find((c) => c.key === active) : null;
  const shown = chosen ? chosen.packages : packages;

  return (
    <View>
      <FormLabel>{label}</FormLabel>
      {showChips ? (
        <View style={styles.chipRow}>
          <Chip label="All" active={active === 'all'} onPress={() => setKind('all')} count={packages.length} />
          {categories.map((c) => (
            <Chip key={c.key} label={c.label} active={active === c.key} onPress={() => setKind(c.key)} count={c.packages.length} />
          ))}
        </View>
      ) : null}
      {groupByValidity(shown).map((g) => (
        <View key={g.key}>
          <Text style={styles.validityHeading}>{g.label}</Text>
          {g.packages.map((p) => (
            <PackageCard
              key={p.id || p.name}
              name={p.name}
              // The kind is in the heading or the chip above, so repeating it on
              // every card only crowds out the data and validity.
              detail={[
                p.data,
                p.valid ? `Validity: ${p.valid}` : '',
                Array.isArray(p.features) && p.features.length ? p.features.join(' • ') : '',
                p.description,
                p.processingTime ? `Processing: ${p.processingTime}` : '',
              ].filter(Boolean).join(' • ')}
              price={priceOf(p)}
              currency={currencyOf(p)}
              selected={selectedName === p.name}
              onPress={() => onSelect(p)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function Chip({ label, active, onPress, count }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      <Text style={[styles.chipCount, active && styles.chipTextActive]}>{count}</Text>
    </TouchableOpacity>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12, fontWeight: '600', color: colors.text },
    chipCount: { fontSize: 10, color: colors.textSecondary },
    chipTextActive: { color: colors.onPrimary },
    validityHeading: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 12, marginBottom: 6 },
  });
}
