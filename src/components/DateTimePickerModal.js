import React, { useMemo, useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import {
  MONTHS,
  daysInMonth,
  parseISODate,
  toISODate,
  clampDate,
  yearRange,
  isMonthSelectable,
  isDaySelectable,
  parseDisplayTime,
  formatDisplayTime,
} from '../utils/dateFieldUtils';

// Date and time pickers built from plain views.
//
// The fields they replace called a `DateTimePicker` that was never imported
// and whose package was never installed, so every one of them threw on tap.
// A native picker cannot be added over the air - it needs a new build in
// the store - and these had to reach people already on 5.4.1.12, so they
// are ordinary React Native components.
//
// Three columns rather than a calendar grid, because the same control has
// to serve a date of birth ninety years back and a passport expiry ten
// years forward. Picking a year from a list beats paging a calendar 1,080
// times.

function Column({ data, selected, onSelect, width, label, colors }) {
  const styles = createStyles(colors);
  return (
    <View style={[styles.column, { width }]}>
      <Text style={styles.columnLabel}>{label}</Text>
      <ScrollView style={styles.columnScroll} showsVerticalScrollIndicator={false}>
        {data.map((item) => {
          const isSelected = item.value === selected;
          return (
            <TouchableOpacity
              key={item.value}
              style={[styles.option, isSelected && styles.optionSelected, item.disabled && styles.optionDisabled]}
              disabled={item.disabled}
              onPress={() => onSelect(item.value)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.optionText,
                  isSelected && styles.optionTextSelected,
                  item.disabled && styles.optionTextDisabled,
                ]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function DatePickerModal({ visible, value, onConfirm, onCancel, minimumDate, maximumDate, title }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const today = new Date();

  const initial = useMemo(() => {
    const parsed = parseISODate(value);
    const base = parsed || {
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate(),
    };
    return clampDate(base, minimumDate, maximumDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, visible]);

  const [parts, setParts] = useState(initial);
  // Reopening with a different value must not keep the last one on screen.
  useEffect(() => { if (visible) setParts(initial); }, [visible, initial]);

  const years = useMemo(
    () => yearRange(minimumDate, maximumDate, today).map((y) => ({ value: y, label: String(y) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [minimumDate, maximumDate],
  );

  const months = MONTHS.map((name, i) => ({
    value: i + 1,
    label: name.slice(0, 3),
    disabled: !isMonthSelectable(parts.year, i + 1, minimumDate, maximumDate),
  }));

  const days = Array.from({ length: daysInMonth(parts.year, parts.month) }, (_, i) => ({
    value: i + 1,
    label: String(i + 1),
    disabled: !isDaySelectable(parts.year, parts.month, i + 1, minimumDate, maximumDate),
  }));

  // Every change re-clamps, so moving to a shorter month or past a bound
  // corrects the whole selection rather than leaving an impossible date.
  const change = (patch) => setParts((p) => clampDate({ ...p, ...patch }, minimumDate, maximumDate));

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title || 'Select date'}</Text>
          <View style={styles.columns}>
            <Column colors={colors} label="Day" width="26%" data={days} selected={parts.day} onSelect={(day) => change({ day })} />
            <Column colors={colors} label="Month" width="34%" data={months} selected={parts.month} onSelect={(month) => change({ month })} />
            <Column colors={colors} label="Year" width="34%" data={years} selected={parts.year} onSelect={(year) => change({ year })} />
          </View>
          <Text style={styles.preview}>{toISODate(parts)}</Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={() => onConfirm(toISODate(parts))}>
              <Text style={styles.confirmText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const HOURS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
const MINUTES = Array.from({ length: 60 }, (_, i) => ({ value: i, label: String(i).padStart(2, '0') }));
const SUFFIXES = [{ value: 'AM', label: 'AM' }, { value: 'PM', label: 'PM' }];

export function TimePickerModal({ visible, value, onConfirm, onCancel, title }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const initial = useMemo(() => parseDisplayTime(value) || { hour12: 9, minute: 0, suffix: 'AM' },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value, visible]);
  const [time, setTime] = useState(initial);
  useEffect(() => { if (visible) setTime(initial); }, [visible, initial]);

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title || 'Select time'}</Text>
          <View style={styles.columns}>
            <Column colors={colors} label="Hour" width="30%" data={HOURS} selected={time.hour12} onSelect={(hour12) => setTime((t) => ({ ...t, hour12 }))} />
            <Column colors={colors} label="Min" width="30%" data={MINUTES} selected={time.minute} onSelect={(minute) => setTime((t) => ({ ...t, minute }))} />
            <Column colors={colors} label="AM/PM" width="34%" data={SUFFIXES} selected={time.suffix} onSelect={(suffix) => setTime((t) => ({ ...t, suffix }))} />
          </View>
          <Text style={styles.preview}>{formatDisplayTime(time)}</Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={() => onConfirm(formatDisplayTime(time))}>
              <Text style={styles.confirmText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 22 },
    sheet: { width: '100%', maxWidth: 380, backgroundColor: colors.card, borderRadius: radius.sheet, padding: 16 },
    title: { fontSize: 15, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 10 },
    columns: { flexDirection: 'row', justifyContent: 'space-between', height: 210 },
    column: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden' },
    columnLabel: { fontSize: 10, fontWeight: '700', color: colors.textSecondary, textAlign: 'center', paddingVertical: 4, backgroundColor: colors.inputBg },
    columnScroll: { flex: 1 },
    option: { paddingVertical: 9, alignItems: 'center' },
    optionSelected: { backgroundColor: colors.primary },
    optionDisabled: { opacity: 0.3 },
    optionText: { fontSize: 13, color: colors.text },
    optionTextSelected: { color: '#FFFFFF', fontWeight: '800' },
    optionTextDisabled: { color: colors.textSecondary },
    preview: { textAlign: 'center', marginTop: 12, fontSize: 14, fontWeight: '700', color: colors.primary },
    actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
    cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.tile, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' },
    cancelText: { color: colors.text, fontWeight: '700', fontSize: 13 },
    confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.tile, backgroundColor: colors.primary, alignItems: 'center' },
    confirmText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  });
}
