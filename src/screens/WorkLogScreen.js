import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { showAlert } from '../utils/appAlert';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import { subscribeWorkLogEntriesInRange, saveWorkLogEntry, deleteWorkLogEntry, clockInNow, clockOutNow, dateKey } from '../firebase/workLogService';
import { subscribeSalarySettings } from '../firebase/salarySettingsService';
import { validateSalaryInputs, calculateHoursFromTimes } from '../utils/salaryCalculationService';
import { TimeField } from '../components/ui';
import { WORK_DAY_STATUS, WORK_DAY_STATUS_COLORS, OT_TYPES, OT_TYPE_LABELS } from '../data/salaryConstants';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const STATUS_ICON = {
  [WORK_DAY_STATUS.WORKED]: '🟢',
  [WORK_DAY_STATUS.REST_DAY]: '🔵',
  [WORK_DAY_STATUS.LEAVE]: '🔴',
};

function buildMonthGrid(year, month) {
  // month is 1-12. Returns a flat array of Date|null (null = padding cell
  // before day 1 or after the last day), sized to whole weeks.
  const firstOfMonth = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay(); // 0 = Sunday, matches WEEKDAY_LABELS order
  const cells = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month - 1, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * Combines PRD sections 12 (Work Log list) and 13 (Calendar view) into
 * one screen with a toggle, since they're two views over the exact same
 * data (one WorkLog entry per calendar day) rather than separate
 * concerns - matches how the calendar's "tap a date" opens the same edit
 * form the list view's row tap does (EditDayModal below).
 */
export default function WorkLogScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, authUser, setScreen } = useApp();

  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'list'
  const [cursor, setCursor] = useState(new Date());
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingDate, setEditingDate] = useState(null); // Date being edited, or null when modal closed
  const [settings, setSettings] = useState(null);
  const [todayEntry, setTodayEntry] = useState(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth() + 1;
  const todayKey = dateKey(new Date());

  useEffect(() => {
    if (!authUser) return undefined;
    return subscribeSalarySettings(authUser.uid, setSettings, () => {});
  }, [authUser]);

  // Independent of the calendar's viewed month, so Start Work / End Work
  // always reflects *today* even while browsing a past/future month.
  useEffect(() => {
    if (!authUser) return undefined;
    return subscribeWorkLogEntriesInRange(authUser.uid, todayKey, todayKey, (list) => setTodayEntry(list[0] || null), () => {});
  }, [authUser, todayKey]);

  useEffect(() => {
    if (!authUser) return undefined;
    setLoading(true);
    const start = dateKey(new Date(year, month - 1, 1));
    const end = dateKey(new Date(year, month, 0));
    const unsub = subscribeWorkLogEntriesInRange(
      authUser.uid,
      start,
      end,
      (list) => {
        setEntries(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [authUser, year, month]);

  const entryByDate = useMemo(() => {
    const map = {};
    entries.forEach((e) => { map[e.date] = e; });
    return map;
  }, [entries]);

  const totals = useMemo(() => {
    const daysWorked = entries.filter((e) => e.status === WORK_DAY_STATUS.WORKED).length;
    const normalHours = entries.reduce((s, e) => s + (e.hoursWorked || 0), 0);
    const otHours = entries.reduce((s, e) => s + (e.otHours || 0), 0);
    return { daysWorked, normalHours, otHours };
  }, [entries]);

  const changeMonth = (delta) => setCursor(new Date(year, month - 1 + delta, 1));

  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Work Log</Text>
        <TouchableOpacity style={styles.toggleBtn} onPress={() => setScreen('salaryReports')}>
          <Text style={styles.toggleIcon}>📊</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toggleBtn} onPress={() => setViewMode((m) => (m === 'calendar' ? 'list' : 'calendar'))}>
          <Text style={styles.toggleIcon}>{viewMode === 'calendar' ? '📋' : '📅'}</Text>
        </TouchableOpacity>
      </LinearGradient>

      <TodayClockCard authUser={authUser} settings={settings} todayEntry={todayEntry} />

      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => changeMonth(-1)}><Text style={styles.monthNavArrow}>‹</Text></TouchableOpacity>
        <Text style={styles.monthNavLabel}>{MONTH_NAMES[month - 1]} {year}</Text>
        <TouchableOpacity onPress={() => changeMonth(1)}><Text style={styles.monthNavArrow}>›</Text></TouchableOpacity>
      </View>

      <View style={styles.totalsRow}>
        <Text style={styles.totalsText}>Days Worked: {totals.daysWorked}</Text>
        <Text style={styles.totalsText}>Normal: {totals.normalHours}h</Text>
        <Text style={styles.totalsText}>OT: {totals.otHours}h</Text>
      </View>

      {loading ? (
        <View style={[styles.body, styles.center]}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : viewMode === 'calendar' ? (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((d, i) => <Text key={i} style={styles.weekdayLabel}>{d}</Text>)}
          </View>
          <View style={styles.calendarGrid}>
            {grid.map((date, i) => {
              if (!date) return <View key={i} style={styles.dayCell} />;
              const key = dateKey(date);
              const entry = entryByDate[key];
              return (
                <TouchableOpacity key={i} style={styles.dayCell} onPress={() => setEditingDate(date)}>
                  <Text style={styles.dayNumber}>{date.getDate()}</Text>
                  {!!entry && <Text style={styles.dayIcon}>{STATUS_ICON[entry.status] || '⚪'}</Text>}
                  {!!entry?.otHours && <View style={styles.otDot} />}
                </TouchableOpacity>
              );
            })}
          </View>
          <Legend />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {entries.length === 0 ? (
            <Text style={styles.emptyText}>No work logged for {MONTH_NAMES[month - 1]} yet. Tap + to add today's hours.</Text>
          ) : (
            entries.map((e) => (
              <TouchableOpacity key={e.id} style={styles.logRow} onPress={() => setEditingDate(new Date(`${e.date}T00:00:00`))}>
                <Text style={styles.logIcon}>{STATUS_ICON[e.status] || '⚪'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.logDate}>{formatDisplayDate(e.date)}</Text>
                  <Text style={styles.logDetail}>
                    {e.status === WORK_DAY_STATUS.WORKED ? `Normal: ${e.hoursWorked}h` : e.status === WORK_DAY_STATUS.REST_DAY ? 'Rest Day' : 'Leave'}
                    {e.otHours ? ` · OT: ${e.otHours}h (${OT_TYPE_LABELS[e.otType] || ''})` : ''}
                    {e.breakHours ? ` · Break: ${e.breakHours}h` : ''}
                  </Text>
                </View>
                <Text style={styles.logChevron}>›</Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setEditingDate(new Date())}>
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      <EditDayModal
        date={editingDate}
        existingEntry={editingDate ? entryByDate[dateKey(editingDate)] : null}
        onClose={() => setEditingDate(null)}
        userId={authUser?.uid}
        normalHoursPerDay={settings?.normalHoursPerDay}
      />
    </View>
  );
}

function Legend() {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <View style={styles.legendRow}>
      <LegendItem icon="🟢" label="Worked" />
      <LegendItem icon="🔵" label="Rest Day" />
      <LegendItem icon="🔴" label="Leave" />
      <View style={styles.legendItem}><View style={styles.otDot} /><Text style={styles.legendLabel}> OT logged</Text></View>
    </View>
  );
}

function LegendItem({ icon, label }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <View style={styles.legendItem}>
      <Text style={styles.legendIcon}>{icon}</Text>
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

/**
 * "Start Work" / "End Work" clock card for today (the actual feature
 * request behind this screen's totals - clock in, clock out, MySheba
 * works out normal vs OT hours from the two times using
 * calculateHoursFromTimes, instead of the user typing hours in by hand
 * every day). Sits above the calendar/list so it's the first thing
 * visible on the screen.
 */
function TodayClockCard({ authUser, settings, todayEntry }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const [busy, setBusy] = useState(false);
  // Break hours (e.g. lunch) for today's shift - entered while clocked
  // in and applied at End Work, same breakHours the manual EditDayModal
  // form takes, so a live clock-in/out day gets the same "subtract break,
  // then split basic/OT" treatment as a manually-entered one.
  const [breakHours, setBreakHours] = useState('');
  const clockedIn = !!todayEntry?.clockedIn;
  const finishedToday = !!todayEntry?.endTime && !clockedIn;

  const handleStart = async () => {
    setBusy(true);
    try {
      await clockInNow(authUser.uid);
      setBreakHours('');
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not start work.');
    } finally {
      setBusy(false);
    }
  };

  const handleEnd = async () => {
    setBusy(true);
    try {
      const result = await clockOutNow(authUser.uid, settings?.normalHoursPerDay, breakHours);
      if (result.belowMinimum) {
        showAlert('MySheba', 'That shift is under 1 hour after the break, so no salary hours were calculated for today.');
      }
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not end work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.clockCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.clockTitle}>Today's Work</Text>
        {clockedIn ? (
          <>
            <Text style={styles.clockSubtitle}>Started at {todayEntry.startTime}</Text>
            <View style={styles.breakRow}>
              <Text style={styles.breakLabel}>Break (hrs)</Text>
              <TextInput
                style={styles.breakInput}
                placeholder="0"
                value={breakHours}
                onChangeText={setBreakHours}
                keyboardType="decimal-pad"
              />
            </View>
          </>
        ) : finishedToday ? (
          <Text style={styles.clockSubtitle}>
            {todayEntry.startTime} – {todayEntry.endTime}
            {todayEntry.breakHours ? ` (break ${todayEntry.breakHours}h)` : ''} · Normal {todayEntry.hoursWorked}h
            {todayEntry.otHours ? ` · OT ${todayEntry.otHours}h` : ''}
          </Text>
        ) : (
          <Text style={styles.clockSubtitle}>Not started yet</Text>
        )}
      </View>
      {busy ? (
        <ActivityIndicator color={colors.primary} />
      ) : clockedIn ? (
        <TouchableOpacity style={styles.endBtn} onPress={handleEnd}>
          <Text style={styles.endBtnText}>End Work</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.startBtn} onPress={handleStart}>
          <Text style={styles.startBtnText}>{finishedToday ? 'Start Again' : 'Start Work'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function formatDisplayDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/** Edit-one-day form, shared by both the calendar's date tap and the
 * list's row tap (PRD section 13: "Tap a date -> Work Details -> then
 * allow the user to edit that day's record"). */
function EditDayModal({ date, existingEntry, onClose, userId, normalHoursPerDay }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const [status, setStatus] = useState(WORK_DAY_STATUS.WORKED);
  const [hoursWorked, setHoursWorked] = useState('8');
  const [otType, setOtType] = useState(OT_TYPES.NORMAL);
  const [otHours, setOtHours] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [breakHours, setBreakHours] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!date) return;
    if (existingEntry) {
      setStatus(existingEntry.status);
      setHoursWorked(String(existingEntry.hoursWorked || 0));
      setOtType(existingEntry.otType || OT_TYPES.NORMAL);
      setOtHours(existingEntry.otHours ? String(existingEntry.otHours) : '');
      setStartTime(existingEntry.startTime || '');
      setEndTime(existingEntry.endTime || '');
      setBreakHours(existingEntry.breakHours ? String(existingEntry.breakHours) : '');
      setNotes(existingEntry.notes || '');
    } else {
      setStatus(WORK_DAY_STATUS.WORKED);
      setHoursWorked('8');
      setOtType(OT_TYPES.NORMAL);
      setOtHours('');
      setStartTime('');
      setEndTime('');
      setBreakHours('');
      setNotes('');
    }
  }, [date, existingEntry]);

  if (!date) return null;

  // Fills Hours Worked / OT Hours from the Start/End time fields (minus
  // any Break Hours entered), same split Start Work / End Work computes
  // automatically - lets a manual entry (e.g. logging yesterday) use
  // clock times too, instead of only today's live Start Work button.
  const calculateFromTimes = () => {
    if (!startTime || !endTime) {
      showAlert('MySheba', 'Enter both a start and end time first.');
      return;
    }
    const { hoursWorked: normal, otHours: ot, belowMinimum } = calculateHoursFromTimes(
      startTime,
      endTime,
      normalHoursPerDay,
      breakHours
    );
    setHoursWorked(String(normal));
    setOtHours(ot > 0 ? String(ot) : '');
    if (belowMinimum) {
      showAlert('MySheba', 'That shift is under 1 hour after the break, so no salary hours were calculated for it.');
    }
  };

  const save = async () => {
    const errors = validateSalaryInputs({ hoursWorked, otHours, breakHours });
    if (errors.length > 0) {
      showAlert('MySheba', errors[0]);
      return;
    }
    setSaving(true);
    try {
      await saveWorkLogEntry(userId, dateKey(date), {
        status,
        hoursWorked: status === WORK_DAY_STATUS.WORKED ? hoursWorked : 0,
        otHours,
        otType: Number(otHours) > 0 ? otType : null,
        startTime: status === WORK_DAY_STATUS.WORKED ? startTime : '',
        endTime: status === WORK_DAY_STATUS.WORKED ? endTime : '',
        breakHours: status === WORK_DAY_STATUS.WORKED ? breakHours : 0,
        clockedIn: false,
        notes,
      });
      onClose();
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not save this entry.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await deleteWorkLogEntry(userId, dateKey(date));
      onClose();
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not delete this entry.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>

          <View style={styles.chipWrap}>
            {[
              [WORK_DAY_STATUS.WORKED, 'Worked'],
              [WORK_DAY_STATUS.REST_DAY, 'Rest Day'],
              [WORK_DAY_STATUS.LEAVE, 'Leave'],
            ].map(([val, label]) => (
              <TouchableOpacity key={val} style={[styles.chip, status === val && styles.chipActive]} onPress={() => setStatus(val)}>
                <Text style={[styles.chipText, status === val && styles.chipTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {status === WORK_DAY_STATUS.WORKED && (
            <>
              <Text style={styles.modalLabel}>Start Work / End Work (optional)</Text>
              <View style={styles.timeRow}>
                <View style={{ flex: 1 }}>
                  <TimeField placeholder="Start time" value={startTime} onChange={setStartTime} />
                </View>
                <View style={{ flex: 1 }}>
                  <TimeField placeholder="End time" value={endTime} onChange={setEndTime} />
                </View>
              </View>

              <Text style={styles.modalLabel}>Break Hours (e.g. lunch, optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                value={breakHours}
                onChangeText={setBreakHours}
                keyboardType="decimal-pad"
              />

              <TouchableOpacity style={styles.calcBtn} onPress={calculateFromTimes}>
                <Text style={styles.calcBtnText}>⚡ Calculate hours from times</Text>
              </TouchableOpacity>

              <Text style={styles.modalLabel}>Hours Worked</Text>
              <TextInput style={styles.input} value={hoursWorked} onChangeText={setHoursWorked} keyboardType="decimal-pad" />
            </>
          )}

          <Text style={styles.modalLabel}>OT Hours</Text>
          <TextInput style={styles.input} placeholder="0" value={otHours} onChangeText={setOtHours} keyboardType="decimal-pad" />

          {Number(otHours) > 0 && (
            <View style={styles.chipWrap}>
              {Object.values(OT_TYPES).map((t) => (
                <TouchableOpacity key={t} style={[styles.chip, otType === t && styles.chipActive]} onPress={() => setOtType(t)}>
                  <Text style={[styles.chipText, otType === t && styles.chipTextActive]}>{OT_TYPE_LABELS[t]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={styles.modalLabel}>Notes (optional)</Text>
          <TextInput style={[styles.input, styles.textArea]} value={notes} onChangeText={setNotes} multiline numberOfLines={3} />

          <View style={styles.modalActions}>
            {!!existingEntry && (
              <TouchableOpacity style={styles.deleteBtn} onPress={remove} disabled={saving}>
                <Text style={styles.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10, flex: 1 },
    toggleBtn: { padding: 4 },
    toggleIcon: { fontSize: 18 },
    monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.card },
    monthNavArrow: { fontSize: 24, color: colors.primary, fontWeight: '700', paddingHorizontal: 12 },
    monthNavLabel: { fontSize: 14, fontWeight: '700', color: colors.navy },
    totalsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8, backgroundColor: '#F1F3F4' },
    totalsText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
    clockCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, margin: 12, marginBottom: 0, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: '#E8E8E8' },
    clockTitle: { fontSize: 13, fontWeight: '700', color: colors.navy },
    clockSubtitle: { fontSize: 11, color: colors.textSecondary, marginTop: 4 },
    breakRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
    breakLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
    breakInput: { width: 60, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, color: colors.text },
    startBtn: { backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 16, borderRadius: radius.pill },
    startBtnText: { color: 'white', fontWeight: '700', fontSize: 12 },
    endBtn: { backgroundColor: colors.error, paddingVertical: 10, paddingHorizontal: 16, borderRadius: radius.pill },
    endBtnText: { color: 'white', fontWeight: '700', fontSize: 12 },
    timeRow: { flexDirection: 'row', gap: 8 },
    calcBtn: { alignSelf: 'flex-start', marginTop: 8 },
    calcBtnText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
    body: { padding: 16, paddingBottom: 90, flexGrow: 1 },
    weekdayRow: { flexDirection: 'row', marginBottom: 6 },
    weekdayLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: colors.textSecondary },
    calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    dayCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: '#F0F0F0', position: 'relative' },
    dayNumber: { fontSize: 12, color: colors.text, fontWeight: '600' },
    dayIcon: { fontSize: 10, marginTop: 2 },
    otDot: { position: 'absolute', top: 4, right: 8, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.warning },
    legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 16, justifyContent: 'center' },
    legendItem: { flexDirection: 'row', alignItems: 'center' },
    legendIcon: { fontSize: 12, marginRight: 4 },
    legendLabel: { fontSize: 11, color: colors.textSecondary },
    emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 30 },
    logRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E8E8E8' },
    logIcon: { fontSize: 18, marginRight: 10 },
    logDate: { fontSize: 13, fontWeight: '700', color: colors.navy },
    logDetail: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    logChevron: { fontSize: 18, color: colors.textSecondary },
    fab: { position: 'absolute', bottom: 24, right: 20, width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
    fabIcon: { fontSize: 28, color: 'white', fontWeight: '400', marginTop: -2 },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20, maxHeight: '85%' },
    modalTitle: { fontSize: 15, fontWeight: '700', color: colors.navy, marginBottom: 14 },
    modalLabel: { fontSize: 12, fontWeight: '700', color: colors.navy, marginTop: 12, marginBottom: 6 },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
    chipTextActive: { color: 'white' },
    input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.text },
    textArea: { minHeight: 60, textAlignVertical: 'top' },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
    deleteBtn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error },
    deleteBtnText: { color: colors.error, fontWeight: '700', fontSize: 13 },
    cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    cancelBtnText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
    saveBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
    saveBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
  });
}
