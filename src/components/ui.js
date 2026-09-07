import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, FlatList, Image } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { radius } from '../theme/theme';

import { useTheme } from "../theme/ThemeContext";

// Shared primitives used across all the step-wizard screens (recharge, mobile
// banking, internet, remittance, bus, train). Mirrors the original CSS
// component classes: .form-label, .form-input, .select-card, .grid-3,
// .amount-btn, .package-card, .summary-card, .method-card, .upload-box, .btn

export function FormLabel({ children, style }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return <Text style={[styles.label, style]}>{children}</Text>;
}

export function FormInput(props) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return <TextInput style={[styles.input, props.style]} placeholderTextColor="#999" {...props} />;
}

// Multiline variant of FormInput, used for free-text fields like a mailing
// address where a single line is too cramped.
export function FormTextArea(props) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <TextInput
      style={[styles.input, styles.textArea, props.style]}
      placeholderTextColor="#999"
      multiline
      numberOfLines={3}
      {...props}
    />
  );
}

// Generic tappable field that opens a searchable modal list - the same
// pattern as CityPicker/AirportPicker, generalized so it can drive any
// flat list of options (banks, branches, eWallet providers, cash-pickup
// networks, relationship, ID type, etc.) without a bespoke component per
// list. `items` may be plain strings or { key, name, subtitle } objects.
export function SearchPicker({ placeholder, title, value, onSelect, items, searchable = true }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const normalized = items.map((it) =>
    typeof it === 'string' ? { key: it, name: it, subtitle: '' } : { subtitle: '', ...it, key: it.key || it.name }
  );
  const filtered = searchable
    ? normalized.filter(
        (it) =>
          it.name.toLowerCase().includes(query.toLowerCase()) ||
          it.subtitle.toLowerCase().includes(query.toLowerCase())
      )
    : normalized;

  const onPick = (item) => {
    onSelect(item.key, item);
    setQuery('');
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity style={styles.fieldButton} onPress={() => setOpen(true)}>
        <Text style={value ? styles.fieldButtonText : styles.fieldButtonPlaceholder} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Text style={styles.fieldButtonChevron}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{title || placeholder}</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {searchable && (
              <TextInput
                style={styles.modalSearch}
                placeholder="Search"
                placeholderTextColor="#999"
                value={query}
                onChangeText={setQuery}
                autoFocus
              />
            )}
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.key}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.modalEmpty}>No matching option.</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.modalRow} onPress={() => onPick(item)}>
                  <Text style={styles.modalRowName}>{item.name}</Text>
                  {!!item.subtitle && <Text style={styles.modalRowState}>{item.subtitle}</Text>}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

// Tappable field that opens a searchable modal list of Malaysian cities.
// `value` is the city name string (kept in serviceData exactly as before -
// only the input method changed, not the data shape), `onSelect(cityName)`
// fires when the user taps a row.
export function CityPicker({ placeholder, value, onSelect, cities }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = cities.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.state.toLowerCase().includes(query.toLowerCase())
  );

  const onPick = (city) => {
    onSelect(city.name);
    setQuery('');
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity style={styles.fieldButton} onPress={() => setOpen(true)}>
        <Text style={value ? styles.fieldButtonText : styles.fieldButtonPlaceholder}>
          {value || placeholder}
        </Text>
        <Text style={styles.fieldButtonChevron}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select City</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalSearch}
              placeholder="Search city or state"
              placeholderTextColor="#999"
              value={query}
              onChangeText={setQuery}
              autoFocus
            />
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.modalEmpty}>No matching city.</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.modalRow} onPress={() => onPick(item)}>
                  <Text style={styles.modalRowName}>{item.name}</Text>
                  <Text style={styles.modalRowState}>{item.state}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

// Tappable field that opens a searchable modal list of world airports,
// grouped by country. Same pattern as CityPicker - `value` stays the
// airport name string in serviceData, `onSelect(airportName)` on tap.
export function AirportPicker({ placeholder, value, onSelect, airports }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = airports.filter(
    (a) =>
      a.name.toLowerCase().includes(query.toLowerCase()) ||
      a.country.toLowerCase().includes(query.toLowerCase())
  );

  const onPick = (airport) => {
    onSelect(airport.name);
    setQuery('');
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity style={styles.fieldButton} onPress={() => setOpen(true)}>
        <Text style={value ? styles.fieldButtonText : styles.fieldButtonPlaceholder}>
          {value || placeholder}
        </Text>
        <Text style={styles.fieldButtonChevron}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Airport</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalSearch}
              placeholder="Search airport or country"
              placeholderTextColor="#999"
              value={query}
              onChangeText={setQuery}
              autoFocus
            />
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.modalEmpty}>No matching airport.</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.modalRow} onPress={() => onPick(item)}>
                  <Text style={styles.modalRowName}>{item.name}</Text>
                  <Text style={styles.modalRowState}>{item.country}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

// Tappable field that opens the native OS date picker.
// `value` stays a 'YYYY-MM-DD' string in serviceData, same as the old
// free-text field, so nothing downstream (summary screen, Firestore) needs
// to change - only how the string gets set.
export function DateField({ placeholder, value, onChange, minimumDate }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const [open, setOpen] = useState(false);

  const dateValue = value ? new Date(`${value}T00:00:00`) : new Date();

  const onNativeChange = (event, selected) => {
    // Android fires 'dismissed' if the user cancels - only commit on 'set',
    // and always close since the Android dialog is not modal-persistent.
    setOpen(false);
    if (event.type === 'dismissed' || !selected) return;
    const y = selected.getFullYear();
    const m = String(selected.getMonth() + 1).padStart(2, '0');
    const d = String(selected.getDate()).padStart(2, '0');
    onChange(`${y}-${m}-${d}`);
  };

  return (
    <>
      <TouchableOpacity style={styles.fieldButton} onPress={() => setOpen(true)}>
        <Text style={value ? styles.fieldButtonText : styles.fieldButtonPlaceholder}>
          {value || placeholder}
        </Text>
        <Text style={styles.fieldButtonIcon}>📅</Text>
      </TouchableOpacity>
      {open && (
        <DateTimePicker
          value={dateValue}
          mode="date"
          display="default"
          minimumDate={minimumDate}
          onChange={onNativeChange}
        />
      )}
    </>
  );
}

// Tappable field that opens the native OS time picker.
// `value` stays a display string like '08:00 AM' in serviceData.
export function TimeField({ placeholder, value, onChange }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const [open, setOpen] = useState(false);

  const timeValue = parseDisplayTime(value) || new Date();

  const onNativeChange = (event, selected) => {
    setOpen(false);
    if (event.type === 'dismissed' || !selected) return;
    let hours = selected.getHours();
    const minutes = String(selected.getMinutes()).padStart(2, '0');
    const suffix = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    onChange(`${String(hours).padStart(2, '0')}:${minutes} ${suffix}`);
  };

  return (
    <>
      <TouchableOpacity style={styles.fieldButton} onPress={() => setOpen(true)}>
        <Text style={value ? styles.fieldButtonText : styles.fieldButtonPlaceholder}>
          {value || placeholder}
        </Text>
        <Text style={styles.fieldButtonIcon}>🕐</Text>
      </TouchableOpacity>
      {open && <DateTimePicker value={timeValue} mode="time" display="default" onChange={onNativeChange} />}
    </>
  );
}

function parseDisplayTime(str) {
  if (!str) return null;
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(str.trim());
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const isPM = match[3].toUpperCase() === 'PM';
  if (hours === 12) hours = 0;
  if (isPM) hours += 12;
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

export function Grid3({ children }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return <View style={styles.grid3}>{children}</View>;
}

// Two-column layout for the operator picker (matches the reference "Select
// Operator" screens - a big logo tile per row-pair rather than 3 cramped
// columns). Same gap/wrap behavior as Grid3, just wider cards.
export function Grid2({ children }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return <View style={styles.grid2}>{children}</View>;
}

export function SelectCard({ flag, name, selected, onPress }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={[styles.selectCard, selected && styles.selectCardSelected]} onPress={onPress}>
      <Text style={styles.selectFlag}>{flag}</Text>
      <Text style={styles.selectName}>{name}</Text>
    </TouchableOpacity>
  );
}

// Used on the Recharge / Internet "Select Operator" step (see
// src/data/operatorBrand.js). Shows a real logo image if one's been
// supplied; otherwise falls back to a colored badge with the operator's
// initials so the grid still reads clearly at a glance. Pass `wide` for the
// 2-column layout (bigger logo box, name below it) that matches the
// reference operator-grid screens - use it with <Grid2> instead of <Grid3>.
export function OperatorCard({ name, logo, color, initials, selected, onPress, wide }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <TouchableOpacity
      style={[styles.selectCard, wide && styles.operatorCardWide, selected && styles.selectCardSelected]}
      onPress={onPress}
    >
      {logo ? (
        <Image
          source={logo}
          style={wide ? styles.operatorLogoWide : styles.operatorLogo}
          resizeMode="contain"
        />
      ) : (
        <View style={[styles.operatorBadge, wide && styles.operatorBadgeWide, { backgroundColor: color || colors.primary }]}>
          <Text style={styles.operatorBadgeText}>{initials}</Text>
        </View>
      )}
      <Text style={[styles.selectName, wide && styles.operatorNameWide]} numberOfLines={1}>{name}</Text>
    </TouchableOpacity>
  );
}

export function AmountButton({ label, selected, onPress }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={[styles.amountBtn, selected && styles.amountBtnSelected]} onPress={onPress}>
      <Text style={[styles.amountBtnText, selected && styles.amountBtnTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function PackageCard({ name, detail, price, currency = 'MYR', selected, onPress }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={[styles.packageCard, selected && styles.packageCardSelected]} onPress={onPress}>
      <View>
        <Text style={styles.pkgName}>{name}</Text>
        <Text style={styles.pkgDetail}>{detail}</Text>
      </View>
      <Text style={styles.pkgPrice}>{currency} {price}</Text>
    </TouchableOpacity>
  );
}

export function MethodCard({ icon, bg, name, detail, onPress }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={styles.methodCard} onPress={onPress}>
      <View style={[styles.methodIcon, { backgroundColor: bg }]}><Text style={{ fontSize: 22 }}>{icon}</Text></View>
      <View>
        <Text style={styles.methodName}>{name}</Text>
        <Text style={styles.methodDetail}>{detail}</Text>
      </View>
    </TouchableOpacity>
  );
}

export function UploadBox({ label, onPress }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={styles.uploadBox} onPress={onPress}>
      <Text style={styles.uploadText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function SummaryCard({ title, rows, totalLabel, totalValue }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <View style={styles.summaryCard}>
      {!!title && <Text style={styles.summaryTitle}>{title}</Text>}
      {rows.map((r) => (
        <View key={r.label} style={styles.summaryRow}>
          <Text>{r.label}</Text>
          <Text>{r.value}</Text>
        </View>
      ))}
      {totalLabel && (
        <View style={styles.summaryRowTotal}>
          <Text style={styles.summaryTotalText}>{totalLabel}</Text>
          <Text style={styles.summaryTotalText}>{totalValue}</Text>
        </View>
      )}
    </View>
  );
}

export function TxOptionCard({ title, badge, badgeColor, detail, price, selected, onPress }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={[styles.txCard, selected && styles.txCardSelected]} onPress={onPress}>
      <View style={styles.txHeader}>
        <Text style={styles.txService}>{title}</Text>
        {!!badge && <View style={[styles.badge, { backgroundColor: badgeColor || '#E8F5E9' }]}><Text style={styles.badgeText}>{badge}</Text></View>}
      </View>
      {!!detail && <Text style={styles.txDetail}>{detail}</Text>}
      {!!price && <Text style={styles.txAmount}>{price}</Text>}
    </TouchableOpacity>
  );
}

export function PrimaryButton({ label, onPress, style, disabled }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={[styles.primaryBtn, disabled && styles.btnDisabled, style]} onPress={onPress} disabled={disabled}>
      <Text style={styles.primaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function OutlineButton({ label, onPress, style }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={[styles.outlineBtn, style]} onPress={onPress}>
      <Text style={styles.outlineBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function OrDivider({ label = 'OR' }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <View style={styles.orDivider}>
      <View style={styles.orDividerLine} />
      <Text style={styles.orDividerText}>{label}</Text>
      <View style={styles.orDividerLine} />
    </View>
  );
}

// "Continue with Google" button shared by Login + Register - both call the
// same authService.signInWithGoogle()/AppContext.doGoogleLogin() under the
// hood, since Firebase treats a first-time Google credential as sign-up
// and every time after as sign-in.
export function GoogleButton({ onPress, disabled, label = 'Continue with Google' }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={[styles.googleBtn, disabled && styles.btnDisabled]} onPress={onPress} disabled={disabled} activeOpacity={0.8}>
      <Text style={styles.googleG}>G</Text>
      <Text style={styles.googleBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    label: { fontWeight: '500', marginBottom: 5, fontSize: 13 },
    input: { width: '100%', paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, fontSize: 14, backgroundColor: 'white', marginBottom: 10 },
    textArea: { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 },
    // CityPicker / DateField / TimeField - tappable "input-lookalike" buttons
    fieldButton: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: 'white', marginBottom: 10 },
    fieldButtonText: { fontSize: 14, color: colors.text },
    fieldButtonPlaceholder: { fontSize: 14, color: '#999' },
    fieldButtonChevron: { fontSize: 14, color: '#999' },
    fieldButtonIcon: { fontSize: 15 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: 'white', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '75%', paddingTop: 12 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 10 },
    modalTitle: { fontSize: 16, fontWeight: '700' },
    modalClose: { fontSize: 18, color: '#999', padding: 4 },
    modalSearch: { marginHorizontal: 16, marginBottom: 6, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, fontSize: 14, backgroundColor: '#F5F5F5' },
    modalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
    modalRowName: { fontSize: 14, fontWeight: '500', color: colors.text },
    modalRowState: { fontSize: 12, color: '#999' },
    modalEmpty: { textAlign: 'center', color: '#999', paddingVertical: 30, fontSize: 13 },
    grid3: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    selectCard: { width: '30%', backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 4, alignItems: 'center', marginBottom: 10 },
    selectCardSelected: { borderColor: colors.primary, backgroundColor: '#F0F7FF' },
    selectFlag: { fontSize: 28 },
    selectName: { fontSize: 11, fontWeight: '600', marginTop: 4, textAlign: 'center' },
    operatorLogo: { width: 40, height: 40 },
    operatorBadge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    operatorBadgeText: { color: 'white', fontSize: 13, fontWeight: '700' },
    // Wide variant - two cards per row, taller logo box, bolder name below.
    // Mirrors the reference "Select Operator" screens (logo-forward tiles).
    operatorCardWide: { width: '47%', paddingVertical: 20, paddingHorizontal: 10 },
    operatorLogoWide: { width: '100%', height: 64 },
    operatorBadgeWide: { width: 64, height: 64, borderRadius: 16 },
    operatorNameWide: { fontSize: 13, marginTop: 10 },
    amountBtn: { flexBasis: '31%', paddingVertical: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: 'white', alignItems: 'center', marginBottom: 8 },
    amountBtnSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    amountBtnText: { fontWeight: '500', fontSize: 13 },
    amountBtnTextSelected: { color: 'white' },
    packageCard: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    packageCardSelected: { borderColor: colors.primary, backgroundColor: '#F0F7FF' },
    pkgName: { fontWeight: '600', fontSize: 14 },
    pkgDetail: { fontSize: 12, color: '#999' },
    pkgPrice: { fontWeight: '700', fontSize: 16, color: colors.primary },
    methodCard: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
    methodIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    methodName: { fontWeight: '600', fontSize: 14 },
    methodDetail: { fontSize: 11, color: '#999' },
    uploadBox: { width: '100%', height: 90, borderWidth: 2, borderColor: '#CCC', borderStyle: 'dashed', borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    uploadText: { color: '#999', fontSize: 13, textAlign: 'center' },
    summaryCard: { backgroundColor: '#F8F9FA', padding: 14, borderRadius: radius.lg, marginBottom: 10 },
    summaryTitle: { fontWeight: '600', fontSize: 14, marginBottom: 6 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
    summaryRowTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: '#DDD' },
    summaryTotalText: { fontWeight: '700', fontSize: 16, color: colors.primary },
    txCard: { backgroundColor: 'white', borderRadius: radius.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
    txCardSelected: { borderColor: colors.primary, borderWidth: 2 },
    txHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    txService: { fontWeight: '600', fontSize: 14 },
    txDetail: { fontSize: 11, color: '#999', marginVertical: 2 },
    txAmount: { fontWeight: '700', fontSize: 16, color: colors.primary },
    badge: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: radius.md },
    badgeText: { fontSize: 10, fontWeight: '600', color: '#2E7D32' },
    primaryBtn: { flex: 1, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: radius.md, alignItems: 'center' },
    primaryBtnText: { color: 'white', fontWeight: '600', fontSize: 14 },
    outlineBtn: { flex: 1, backgroundColor: 'white', borderWidth: 2, borderColor: colors.primary, paddingVertical: 12, borderRadius: radius.md, alignItems: 'center' },
    outlineBtnText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
    googleBtn: {
      width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
      borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12,
      backgroundColor: 'white',
    },
    googleG: { fontSize: 16, fontWeight: '700', color: '#4285F4' },
    googleBtnText: { fontSize: 14, fontWeight: '600', color: colors.text },
    orDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 10 },
    orDividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
    orDividerText: { fontSize: 12, color: '#999', fontWeight: '600' },
    btnDisabled: { opacity: 0.5 },
  });
}
