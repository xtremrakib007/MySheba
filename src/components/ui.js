import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, FlatList, Image } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import CountryFlag from './CountryFlag';

export function FormLabel({ children, style }) { const { colors } = useTheme(); const styles = createStyles(colors); return <Text style={[styles.label, style]}>{children}</Text>; }
export function FormInput(props) { const { colors } = useTheme(); const styles = createStyles(colors); return <TextInput style={[styles.input, props.style]} placeholderTextColor={colors.textSecondary} {...props} />; }
export function FormTextArea(props) { const { colors } = useTheme(); const styles = createStyles(colors); return <TextInput style={[styles.input, styles.textArea, props.style]} placeholderTextColor={colors.textSecondary} multiline numberOfLines={3} {...props} />; }

export function SearchPicker({ placeholder, title, value, onSelect, items, searchable = true }) {
  const { colors } = useTheme(); const styles = createStyles(colors); const [open, setOpen] = useState(false); const [query, setQuery] = useState('');
  const normalized = (items || []).map((it) => typeof it === 'string' ? { key: it, name: it, subtitle: '' } : { subtitle: '', ...it, key: it.key || it.name });
  const filtered = searchable ? normalized.filter((it) => String(it.name).toLowerCase().includes(query.toLowerCase()) || String(it.subtitle).toLowerCase().includes(query.toLowerCase())) : normalized;
  const onPick = (item) => { onSelect(item.key, item); setQuery(''); setOpen(false); };
  return <>
    <TouchableOpacity style={styles.fieldButton} onPress={() => setOpen(true)}><Text style={value ? styles.fieldButtonText : styles.fieldButtonPlaceholder} numberOfLines={1}>{value || placeholder}</Text><Text style={styles.fieldButtonChevron}>▾</Text></TouchableOpacity>
    <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}><View style={styles.modalOverlay}><View style={styles.modalSheet}><View style={styles.modalHeader}><Text style={styles.modalTitle}>{title || placeholder}</Text><TouchableOpacity onPress={() => setOpen(false)}><Text style={styles.modalClose}>✕</Text></TouchableOpacity></View>{searchable && <TextInput style={styles.modalSearch} placeholder="Search" placeholderTextColor={colors.textSecondary} value={query} onChangeText={setQuery} autoFocus />}<FlatList data={filtered} keyExtractor={(item) => item.key} keyboardShouldPersistTaps="handled" ListEmptyComponent={<Text style={styles.modalEmpty}>No matching option.</Text>} renderItem={({ item }) => <TouchableOpacity style={styles.modalRow} onPress={() => onPick(item)}><Text style={styles.modalRowName}>{item.name}</Text>{!!item.subtitle && <Text style={styles.modalRowState}>{item.subtitle}</Text>}</TouchableOpacity>} /></View></View></Modal>
  </>;
}

export function CityPicker({ placeholder, value, onSelect, cities }) { const { colors } = useTheme(); const styles = createStyles(colors); const [open, setOpen] = useState(false); const [query, setQuery] = useState(''); const filtered=(cities||[]).filter(c=>c.name.toLowerCase().includes(query.toLowerCase())||c.state.toLowerCase().includes(query.toLowerCase())); const onPick=c=>{onSelect(c.name);setQuery('');setOpen(false);}; return <><TouchableOpacity style={styles.fieldButton} onPress={()=>setOpen(true)}><Text style={value?styles.fieldButtonText:styles.fieldButtonPlaceholder}>{value||placeholder}</Text><Text style={styles.fieldButtonChevron}>▾</Text></TouchableOpacity><Modal visible={open} animationType="slide" transparent onRequestClose={()=>setOpen(false)}><View style={styles.modalOverlay}><View style={styles.modalSheet}><View style={styles.modalHeader}><Text style={styles.modalTitle}>Select City</Text><TouchableOpacity onPress={()=>setOpen(false)}><Text style={styles.modalClose}>✕</Text></TouchableOpacity></View><TextInput style={styles.modalSearch} placeholder="Search city or state" placeholderTextColor={colors.textSecondary} value={query} onChangeText={setQuery} autoFocus/><FlatList data={filtered} keyExtractor={item=>item.id} keyboardShouldPersistTaps="handled" ListEmptyComponent={<Text style={styles.modalEmpty}>No matching city.</Text>} renderItem={({item})=><TouchableOpacity style={styles.modalRow} onPress={()=>onPick(item)}><Text style={styles.modalRowName}>{item.name}</Text><Text style={styles.modalRowState}>{item.state}</Text></TouchableOpacity>}/></View></View></Modal></>; }
export function AirportPicker({ placeholder, value, onSelect, airports }) { const { colors } = useTheme(); const styles=createStyles(colors); const [open,setOpen]=useState(false); const [query,setQuery]=useState(''); const filtered=(airports||[]).filter(a=>a.name.toLowerCase().includes(query.toLowerCase())||a.country.toLowerCase().includes(query.toLowerCase())); const onPick=a=>{onSelect(a.name);setQuery('');setOpen(false);}; return <><TouchableOpacity style={styles.fieldButton} onPress={()=>setOpen(true)}><Text style={value?styles.fieldButtonText:styles.fieldButtonPlaceholder}>{value||placeholder}</Text><Text style={styles.fieldButtonChevron}>▾</Text></TouchableOpacity><Modal visible={open} animationType="slide" transparent onRequestClose={()=>setOpen(false)}><View style={styles.modalOverlay}><View style={styles.modalSheet}><View style={styles.modalHeader}><Text style={styles.modalTitle}>Select Airport</Text><TouchableOpacity onPress={()=>setOpen(false)}><Text style={styles.modalClose}>✕</Text></TouchableOpacity></View><TextInput style={styles.modalSearch} placeholder="Search airport or country" placeholderTextColor={colors.textSecondary} value={query} onChangeText={setQuery} autoFocus/><FlatList data={filtered} keyExtractor={item=>item.id} keyboardShouldPersistTaps="handled" ListEmptyComponent={<Text style={styles.modalEmpty}>No matching airport.</Text>} renderItem={({item})=><TouchableOpacity style={styles.modalRow} onPress={()=>onPick(item)}><Text style={styles.modalRowName}>{item.name}</Text><Text style={styles.modalRowState}>{item.country}</Text></TouchableOpacity>}/></View></View></Modal></>; }

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function dateFromKey(value) {
  if (!value || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}
function startOfDay(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function sameDay(a, b) {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function DateField({ placeholder, value, onChange, minimumDate, maximumDate }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const selectedDate = dateFromKey(value) || new Date();
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const openPicker = () => {
    const current = dateFromKey(value) || new Date();
    setVisibleMonth(new Date(current.getFullYear(), current.getMonth(), 1));
    setOpen(true);
  };
  const changeMonth = (offset) => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  const firstWeekday = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1).getDay();
  const dayCount = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  const minDay = minimumDate instanceof Date && !Number.isNaN(minimumDate.getTime()) ? startOfDay(minimumDate) : null;
  const maxDay = maximumDate instanceof Date && !Number.isNaN(maximumDate.getTime()) ? startOfDay(maximumDate) : null;
  const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: dayCount }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const chooseDay = (day) => {
    const chosen = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day);
    if ((minDay && chosen < minDay) || (maxDay && chosen > maxDay)) return;
    onChange(dateKey(chosen));
    setOpen(false);
  };
  return <>
    <TouchableOpacity style={styles.fieldButton} onPress={openPicker} accessibilityRole="button" accessibilityLabel={placeholder || 'Select date'}>
      <Text style={value ? styles.fieldButtonText : styles.fieldButtonPlaceholder} numberOfLines={1}>{value || placeholder}</Text>
      <Text style={styles.fieldButtonIcon}>📅</Text>
    </TouchableOpacity>
    <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.datePickerSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{placeholder || 'Select date'}</Text>
            <TouchableOpacity onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close date picker"><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
          </View>
          <View style={styles.calendarMonthRow}>
            <TouchableOpacity style={styles.calendarNavButton} onPress={() => changeMonth(-1)} accessibilityLabel="Previous month"><Text style={styles.calendarNavText}>‹</Text></TouchableOpacity>
            <Text style={styles.calendarMonthTitle}>{visibleMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
            <TouchableOpacity style={styles.calendarNavButton} onPress={() => changeMonth(1)} accessibilityLabel="Next month"><Text style={styles.calendarNavText}>›</Text></TouchableOpacity>
          </View>
          <View style={styles.calendarGrid}>
            {weekdays.map((day) => <View key={day} style={styles.calendarCell}><Text style={styles.calendarWeekday}>{day}</Text></View>)}
            {cells.map((day, index) => {
              if (!day) return <View key={`empty-${index}`} style={styles.calendarCell} />;
              const candidate = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day);
              const disabled = (minDay && candidate < minDay) || (maxDay && candidate > maxDay);
              const selected = sameDay(candidate, dateFromKey(value));
              return <TouchableOpacity key={`day-${day}`} style={[styles.calendarCell, styles.calendarDay, selected && styles.calendarDaySelected, disabled && styles.calendarDayDisabled]} onPress={() => chooseDay(day)} disabled={!!disabled} accessibilityRole="button" accessibilityLabel={candidate.toDateString()} accessibilityState={{ selected, disabled: !!disabled }}>
                <Text style={[styles.calendarDayText, selected && styles.calendarDayTextSelected]}>{day}</Text>
              </TouchableOpacity>;
            })}
          </View>
          <TouchableOpacity style={styles.calendarCancelButton} onPress={() => setOpen(false)}><Text style={styles.calendarCancelText}>Cancel</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  </>;
}

export function TimeField({ placeholder, value, onChange }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const parsed = parseDisplayTime(value) || new Date();
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState(parsed.getHours() % 12 || 12);
  const [minute, setMinute] = useState(parsed.getMinutes());
  const [suffix, setSuffix] = useState(parsed.getHours() >= 12 ? 'PM' : 'AM');
  const openPicker = () => {
    const current = parseDisplayTime(value) || new Date();
    setHour(current.getHours() % 12 || 12);
    setMinute(current.getMinutes());
    setSuffix(current.getHours() >= 12 ? 'PM' : 'AM');
    setOpen(true);
  };
  const adjustHour = (delta) => setHour((current) => ((current - 1 + delta + 12) % 12) + 1);
  const adjustMinute = (delta) => setMinute((current) => (current + delta + 60) % 60);
  const saveTime = () => {
    onChange(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${suffix}`);
    setOpen(false);
  };
  return <>
    <TouchableOpacity style={styles.fieldButton} onPress={openPicker} accessibilityRole="button" accessibilityLabel={placeholder || 'Select time'}>
      <Text style={value ? styles.fieldButtonText : styles.fieldButtonPlaceholder} numberOfLines={1}>{value || placeholder}</Text>
      <Text style={styles.fieldButtonIcon}>🕐</Text>
    </TouchableOpacity>
    <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.timePickerSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{placeholder || 'Select time'}</Text>
            <TouchableOpacity onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close time picker"><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
          </View>
          <View style={styles.timePickerControls}>
            <View style={styles.timePickerColumn}>
              <Text style={styles.timePickerLabel}>Hour</Text>
              <TouchableOpacity style={styles.timeAdjustButton} onPress={() => adjustHour(1)}><Text style={styles.timeAdjustText}>＋</Text></TouchableOpacity>
              <Text style={styles.timeValue}>{String(hour).padStart(2, '0')}</Text>
              <TouchableOpacity style={styles.timeAdjustButton} onPress={() => adjustHour(-1)}><Text style={styles.timeAdjustText}>−</Text></TouchableOpacity>
            </View>
            <Text style={styles.timeSeparator}>:</Text>
            <View style={styles.timePickerColumn}>
              <Text style={styles.timePickerLabel}>Minute</Text>
              <TouchableOpacity style={styles.timeAdjustButton} onPress={() => adjustMinute(1)}><Text style={styles.timeAdjustText}>＋</Text></TouchableOpacity>
              <Text style={styles.timeValue}>{String(minute).padStart(2, '0')}</Text>
              <TouchableOpacity style={styles.timeAdjustButton} onPress={() => adjustMinute(-1)}><Text style={styles.timeAdjustText}>−</Text></TouchableOpacity>
            </View>
            <View style={styles.timePickerColumn}>
              <Text style={styles.timePickerLabel}>AM / PM</Text>
              <TouchableOpacity style={styles.timeSuffixButton} onPress={() => setSuffix((current) => current === 'AM' ? 'PM' : 'AM')}><Text style={styles.timeSuffixText}>{suffix}</Text></TouchableOpacity>
            </View>
          </View>
          <View style={styles.timePickerActions}>
            <TouchableOpacity style={styles.calendarCancelButton} onPress={() => setOpen(false)}><Text style={styles.calendarCancelText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={styles.timeSaveButton} onPress={saveTime}><Text style={styles.timeSaveText}>Use time</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  </>;
}
function parseDisplayTime(str) {
  if (!str) return null;
  const match = /^(\\d{1,2}):(\\d{2})\\s*(AM|PM)$/i.exec(str.trim());
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;
  if (hours === 12) hours = 0;
  if (match[3].toUpperCase() === 'PM') hours += 12;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export function Grid3({ children }) { const { colors }=useTheme(); const styles=createStyles(colors); return <View style={styles.grid3}>{children}</View>; }
export function Grid2({ children }) { const { colors }=useTheme(); const styles=createStyles(colors); return <View style={styles.grid2}>{children}</View>; }

// Country selector: deliberately uses the same crisp, logo-forward visual language as OperatorCard.
export function SelectCard({ code, flag, name, selected, onPress }) { const { colors }=useTheme(); const styles=createStyles(colors); return <TouchableOpacity style={[styles.selectCard,selected&&styles.selectCardSelected]} onPress={onPress}><View style={styles.countryFlagWrap}><CountryFlag code={code} emoji={flag} size={42} /></View><Text style={styles.selectName} numberOfLines={2}>{String(name||'')}</Text></TouchableOpacity>; }

export function OperatorCard({ name, logo, color, initials, selected, onPress, wide }) { const { colors }=useTheme(); const styles=createStyles(colors); return <TouchableOpacity style={[styles.selectCard,wide&&styles.operatorCardWide,selected&&styles.selectCardSelected]} onPress={onPress}>{logo?<Image source={logo} style={wide?styles.operatorLogoWide:styles.operatorLogo} resizeMode="contain"/>:<View style={[styles.operatorBadge,wide&&styles.operatorBadgeWide,{backgroundColor:color||colors.primary}]}><Text style={styles.operatorBadgeText}>{initials}</Text></View>}<Text style={[styles.selectName,wide&&styles.operatorNameWide]} numberOfLines={1}>{String(name||'')}</Text></TouchableOpacity>; }
export function AmountButton({ label, selected, onPress }) { const { colors }=useTheme(); const styles=createStyles(colors); return <TouchableOpacity style={[styles.amountBtn,selected&&styles.amountBtnSelected]} onPress={onPress}><Text style={[styles.amountBtnText,selected&&styles.amountBtnTextSelected]}>{label}</Text></TouchableOpacity>; }
export function PackageCard({ name, detail, price, currency='MYR', selected, onPress }) { const { colors }=useTheme(); const styles=createStyles(colors); return <TouchableOpacity style={[styles.packageCard,selected&&styles.packageCardSelected]} onPress={onPress}><View><Text style={styles.pkgName}>{name}</Text><Text style={styles.pkgDetail}>{detail}</Text></View><Text style={styles.pkgPrice}>{currency} {price}</Text></TouchableOpacity>; }
export function MethodCard({ icon,bg,name,detail,onPress }) { const { colors }=useTheme(); const styles=createStyles(colors); return <TouchableOpacity style={styles.methodCard} onPress={onPress}><View style={[styles.methodIcon,{backgroundColor:bg}]}><Text style={{fontSize:22}}>{icon}</Text></View><View><Text style={styles.methodName}>{name}</Text><Text style={styles.methodDetail}>{detail}</Text></View></TouchableOpacity>; }
export function UploadBox({ label,onPress }) { const { colors }=useTheme(); const styles=createStyles(colors); return <TouchableOpacity style={styles.uploadBox} onPress={onPress}><Text style={styles.uploadText}>{label}</Text></TouchableOpacity>; }
export function SummaryCard({ title,rows,totalLabel,totalValue }) { const { colors }=useTheme(); const styles=createStyles(colors); return <View style={styles.summaryCard}>{!!title&&<Text style={styles.summaryTitle}>{title}</Text>}{(rows||[]).map(r=><View key={r.label} style={styles.summaryRow}><Text style={styles.summaryRowLabel}>{r.label}</Text><Text style={styles.summaryRowValue}>{r.value}</Text></View>)}{totalLabel&&<View style={styles.summaryRowTotal}><Text style={styles.summaryTotalText}>{totalLabel}</Text><Text style={styles.summaryTotalText}>{totalValue}</Text></View>}</View>; }
export function TxOptionCard({ title,badge,badgeColor,detail,price,selected,onPress }) { const { colors }=useTheme(); const styles=createStyles(colors); return <TouchableOpacity style={[styles.txCard,selected&&styles.txCardSelected]} onPress={onPress}><View style={styles.txHeader}><Text style={styles.txService}>{title}</Text>{!!badge&&<View style={[styles.badge,{backgroundColor:badgeColor||'#E8F5E9'}]}><Text style={styles.badgeText}>{badge}</Text></View>}</View>{!!detail&&<Text style={styles.txDetail}>{detail}</Text>}{!!price&&<Text style={styles.txAmount}>{price}</Text>}</TouchableOpacity>; }
export function PrimaryButton({ label,onPress,style,disabled }) { const { colors }=useTheme(); const styles=createStyles(colors); return <TouchableOpacity style={[styles.primaryBtn,disabled&&styles.btnDisabled,style]} onPress={onPress} disabled={disabled}><Text style={styles.primaryBtnText}>{label}</Text></TouchableOpacity>; }
export function OutlineButton({ label,onPress,style }) { const { colors }=useTheme(); const styles=createStyles(colors); return <TouchableOpacity style={[styles.outlineBtn,style]} onPress={onPress}><Text style={styles.outlineBtnText}>{label}</Text></TouchableOpacity>; }
export function OrDivider({ label='OR' }) { const { colors }=useTheme(); const styles=createStyles(colors); return <View style={styles.orDivider}><View style={styles.orDividerLine}/><Text style={styles.orDividerText}>{label}</Text><View style={styles.orDividerLine}/></View>; }
export function GoogleButton({ onPress,disabled,label='Continue with Google' }) { const { colors }=useTheme(); const styles=createStyles(colors); return <TouchableOpacity style={[styles.googleBtn,disabled&&styles.btnDisabled]} onPress={onPress} disabled={disabled} activeOpacity={0.8}><Text style={styles.googleG}>G</Text><Text style={styles.googleBtnText}>{label}</Text></TouchableOpacity>; }

function createStyles(colors){return StyleSheet.create({
  label:{fontWeight:'600',marginBottom:5,fontSize:13,color:colors.text},input:{width:'100%',paddingVertical:13,paddingHorizontal:12,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,fontSize:14,color:colors.text,backgroundColor:colors.card,marginBottom:10},textArea:{minHeight:80,textAlignVertical:'top',paddingTop:12},
  fieldButton:{width:'100%',flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingVertical:12,paddingHorizontal:14,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.card,marginBottom:10},fieldButtonText:{fontSize:14,color:colors.text},fieldButtonPlaceholder:{fontSize:14,color:colors.textSecondary},fieldButtonChevron:{fontSize:14,color:colors.textSecondary},fieldButtonIcon:{fontSize:15},
  modalOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.55)',justifyContent:'flex-end'},modalSheet:{backgroundColor:colors.card,borderTopLeftRadius:radius.xl,borderTopRightRadius:radius.xl,maxHeight:'75%',paddingTop:12},modalHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:18,paddingBottom:10},modalTitle:{fontSize:16,fontWeight:'700',color:colors.text},modalClose:{fontSize:18,color:colors.textSecondary,padding:4},modalSearch:{marginHorizontal:16,marginBottom:6,paddingVertical:10,paddingHorizontal:14,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,fontSize:14,color:colors.text,backgroundColor:colors.card},modalRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingVertical:14,paddingHorizontal:18,borderBottomWidth:1,borderBottomColor:colors.border},modalRowName:{fontSize:14,fontWeight:'500',color:colors.text},modalRowState:{fontSize:12,color:colors.textSecondary},modalEmpty:{textAlign:'center',color:colors.textSecondary,paddingVertical:30,fontSize:13},
  datePickerSheet:{backgroundColor:colors.card,borderTopLeftRadius:radius.xl,borderTopRightRadius:radius.xl,maxHeight:'85%',paddingTop:12,paddingBottom:18},calendarMonthRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:18,paddingBottom:12},calendarNavButton:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:colors.tileBg},calendarNavText:{fontSize:28,color:colors.primary,lineHeight:32},calendarMonthTitle:{fontSize:16,fontWeight:'700',color:colors.text},calendarGrid:{flexDirection:'row',flexWrap:'wrap',paddingHorizontal:8},calendarCell:{width:'14.2857%',height:42,alignItems:'center',justifyContent:'center'},calendarWeekday:{fontSize:12,fontWeight:'700',color:colors.textSecondary},calendarDay:{borderRadius:21},calendarDaySelected:{backgroundColor:colors.primary},calendarDayDisabled:{opacity:0.28},calendarDayText:{fontSize:14,color:colors.text},calendarDayTextSelected:{color:colors.onPrimary||'#FFFFFF',fontWeight:'700'},calendarCancelButton:{alignSelf:'flex-end',paddingHorizontal:18,paddingVertical:12},calendarCancelText:{fontSize:14,fontWeight:'600',color:colors.textSecondary},timePickerSheet:{backgroundColor:colors.card,borderTopLeftRadius:radius.xl,borderTopRightRadius:radius.xl,paddingTop:12,paddingBottom:20},timePickerControls:{flexDirection:'row',alignItems:'center',justifyContent:'center',paddingVertical:18,gap:12},timePickerColumn:{alignItems:'center',justifyContent:'center',minWidth:64},timePickerLabel:{fontSize:12,color:colors.textSecondary,marginBottom:8},timeAdjustButton:{width:44,height:38,borderRadius:radius.md,alignItems:'center',justifyContent:'center',backgroundColor:colors.tileBg},timeAdjustText:{fontSize:22,color:colors.primary},timeValue:{fontSize:28,fontWeight:'700',color:colors.text,paddingVertical:10,fontVariant:['tabular-nums']},timeSeparator:{fontSize:26,fontWeight:'700',color:colors.text,marginTop:22},timeSuffixButton:{minWidth:56,height:44,alignItems:'center',justifyContent:'center',backgroundColor:colors.tileBg,borderRadius:radius.md,marginTop:12},timeSuffixText:{fontSize:15,fontWeight:'700',color:colors.primary},timePickerActions:{flexDirection:'row',justifyContent:'flex-end',alignItems:'center',paddingHorizontal:18,gap:12},timeSaveButton:{backgroundColor:colors.primary,paddingHorizontal:18,paddingVertical:12,borderRadius:radius.md},timeSaveText:{fontSize:14,fontWeight:'700',color:colors.onPrimary||'#FFFFFF'},
  grid3:{flexDirection:'row',flexWrap:'wrap',gap:10},grid2:{flexDirection:'row',flexWrap:'wrap',gap:12},
  selectCard:{width:'30%',height:110,backgroundColor:colors.tileBg,borderWidth:1.5,borderColor:colors.tileBorder,borderRadius:radius.card,paddingVertical:10,paddingHorizontal:4,alignItems:'center',justifyContent:'center',marginBottom:10,shadowColor:'#000',shadowOpacity:0.08,shadowRadius:3,shadowOffset:{width:0,height:1},elevation:2},selectCardSelected:{borderColor:colors.primary,backgroundColor:colors.card,borderWidth:2},countryFlagWrap:{alignItems:'center',justifyContent:'center',marginBottom:6},countryFlag:{fontSize:28},selectName:{fontSize:11,fontWeight:'700',marginTop:2,textAlign:'center',color:colors.text},operatorLogo:{width:40,height:40},operatorBadge:{width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center'},operatorBadgeText:{color:'white',fontSize:13,fontWeight:'700'},operatorCardWide:{width:'47%',paddingVertical:20,paddingHorizontal:10},operatorLogoWide:{width:'100%',height:64},operatorBadgeWide:{width:64,height:64,borderRadius:16},operatorNameWide:{fontSize:13,marginTop:10},
  amountBtn:{flexBasis:'31%',paddingVertical:11,borderWidth:1.5,borderColor:colors.tileBorder,borderRadius:radius.tile,backgroundColor:colors.card,alignItems:'center',marginBottom:8},amountBtnSelected:{backgroundColor:colors.primary,borderColor:colors.primary},amountBtnText:{fontWeight:'500',fontSize:13,color:colors.text},amountBtnTextSelected:{color:'white'},packageCard:{backgroundColor:colors.card,borderWidth:1.5,borderColor:colors.tileBorder,borderRadius:radius.card,padding:14,marginBottom:8,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},packageCardSelected:{borderColor:colors.primary,backgroundColor:colors.card},pkgName:{fontWeight:'600',fontSize:14,color:colors.text},pkgDetail:{fontSize:12,color:colors.textSecondary},pkgPrice:{fontWeight:'700',fontSize:16,color:colors.primary},methodCard:{backgroundColor:colors.card,borderWidth:1.5,borderColor:colors.tileBorder,borderRadius:radius.card,padding:14,marginBottom:8,flexDirection:'row',alignItems:'center',gap:12},methodIcon:{width:44,height:44,borderRadius:radius.md,alignItems:'center',justifyContent:'center',marginRight:12},methodName:{fontWeight:'600',fontSize:14,color:colors.text},methodDetail:{fontSize:11,color:colors.textSecondary},uploadBox:{width:'100%',height:90,borderWidth:2,borderColor:colors.tileBorder,borderStyle:'dashed',borderRadius:radius.card,alignItems:'center',justifyContent:'center'},uploadText:{color:colors.textSecondary,fontSize:13,textAlign:'center'},summaryCard:{backgroundColor:colors.card,padding:16,borderRadius:radius.sheet,marginBottom:10,borderWidth:1.5,borderColor:colors.tileBorder},summaryTitle:{fontWeight:'600',fontSize:14,color:colors.text,marginBottom:6},summaryRow:{flexDirection:'row',justifyContent:'space-between',paddingVertical:5},summaryRowLabel:{color:colors.text,fontSize:13,flexShrink:1,paddingRight:8},summaryRowValue:{color:colors.text,fontSize:13,textAlign:'right',flexShrink:1},summaryRowTotal:{flexDirection:'row',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTopWidth:1,borderTopColor:colors.border},summaryTotalText:{fontWeight:'700',fontSize:16,color:colors.primary},txCard:{backgroundColor:colors.card,borderRadius:radius.card,padding:14,marginBottom:8,borderWidth:1.5,borderColor:colors.tileBorder},txCardSelected:{borderColor:colors.primary,borderWidth:2},txHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:6},txService:{fontWeight:'600',fontSize:14,color:colors.text},txDetail:{fontSize:11,color:colors.textSecondary,marginVertical:2},txAmount:{fontWeight:'700',fontSize:16,color:colors.primary},badge:{paddingVertical:3,paddingHorizontal:10,borderRadius:radius.md},badgeText:{fontSize:10,fontWeight:'600',color:'#2E7D32'},primaryBtn:{flex:1,backgroundColor:colors.primary,paddingVertical:14,borderRadius:radius.tile,alignItems:'center',borderWidth:1.5,borderColor:colors.goldLight},primaryBtnText:{color:'white',fontWeight:'600',fontSize:14},outlineBtn:{flex:1,backgroundColor:colors.card,borderWidth:2,borderColor:colors.primary,paddingVertical:14,borderRadius:radius.tile,alignItems:'center'},outlineBtnText:{color:colors.primary,fontWeight:'600'},googleBtn:{width:'100%',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,paddingVertical:12,backgroundColor:colors.card},googleG:{fontSize:16,fontWeight:'700',color:'#4285F4'},googleBtnText:{fontSize:14,fontWeight:'600',color:colors.text},orDivider:{flexDirection:'row',alignItems:'center',marginVertical:16,gap:10},orDividerLine:{flex:1,height:1,backgroundColor:colors.border},orDividerText:{fontSize:12,color:colors.textSecondary,fontWeight:'600'},btnDisabled:{opacity:0.5},
});}
