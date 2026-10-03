import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, FlatList, Image } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import CountryFlag from './CountryFlag';
import { DatePickerModal, TimePickerModal } from './DateTimePickerModal';

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
    <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}><View style={styles.modalOverlay}><View style={styles.modalSheet}><View style={styles.modalHeader}><Text style={styles.modalTitle}>{title || placeholder}</Text><TouchableOpacity onPress={() => setOpen(false)}><Text style={styles.modalClose}>✕</Text></TouchableOpacity></View>{!!searchable && <TextInput style={styles.modalSearch} placeholder="Search" placeholderTextColor={colors.textSecondary} value={query} onChangeText={setQuery} autoFocus />}<FlatList data={filtered} keyExtractor={(item) => item.key} keyboardShouldPersistTaps="handled" ListEmptyComponent={<Text style={styles.modalEmpty}>No matching option.</Text>} renderItem={({ item }) => <TouchableOpacity style={styles.modalRow} onPress={() => onPick(item)}><Text style={styles.modalRowName}>{item.name}</Text>{!!item.subtitle && <Text style={styles.modalRowState}>{item.subtitle}</Text>}</TouchableOpacity>} /></View></View></Modal>
  </>;
}

export function CityPicker({ placeholder, value, onSelect, cities }) { const { colors } = useTheme(); const styles = createStyles(colors); const [open, setOpen] = useState(false); const [query, setQuery] = useState(''); const filtered=(cities||[]).filter(c=>c.name.toLowerCase().includes(query.toLowerCase())||c.state.toLowerCase().includes(query.toLowerCase())); const onPick=c=>{onSelect(c.name);setQuery('');setOpen(false);}; return <><TouchableOpacity style={styles.fieldButton} onPress={()=>setOpen(true)}><Text style={value?styles.fieldButtonText:styles.fieldButtonPlaceholder}>{value||placeholder}</Text><Text style={styles.fieldButtonChevron}>▾</Text></TouchableOpacity><Modal visible={open} animationType="slide" transparent onRequestClose={()=>setOpen(false)}><View style={styles.modalOverlay}><View style={styles.modalSheet}><View style={styles.modalHeader}><Text style={styles.modalTitle}>Select City</Text><TouchableOpacity onPress={()=>setOpen(false)}><Text style={styles.modalClose}>✕</Text></TouchableOpacity></View><TextInput style={styles.modalSearch} placeholder="Search city or state" placeholderTextColor={colors.textSecondary} value={query} onChangeText={setQuery} autoFocus/><FlatList data={filtered} keyExtractor={item=>item.id} keyboardShouldPersistTaps="handled" ListEmptyComponent={<Text style={styles.modalEmpty}>No matching city.</Text>} renderItem={({item})=><TouchableOpacity style={styles.modalRow} onPress={()=>onPick(item)}><Text style={styles.modalRowName}>{item.name}</Text><Text style={styles.modalRowState}>{item.state}</Text></TouchableOpacity>}/></View></View></Modal></>; }
export function AirportPicker({ placeholder, value, onSelect, airports }) { const { colors } = useTheme(); const styles=createStyles(colors); const [open,setOpen]=useState(false); const [query,setQuery]=useState(''); const filtered=(airports||[]).filter(a=>a.name.toLowerCase().includes(query.toLowerCase())||a.country.toLowerCase().includes(query.toLowerCase())); const onPick=a=>{onSelect(a.name);setQuery('');setOpen(false);}; return <><TouchableOpacity style={styles.fieldButton} onPress={()=>setOpen(true)}><Text style={value?styles.fieldButtonText:styles.fieldButtonPlaceholder}>{value||placeholder}</Text><Text style={styles.fieldButtonChevron}>▾</Text></TouchableOpacity><Modal visible={open} animationType="slide" transparent onRequestClose={()=>setOpen(false)}><View style={styles.modalOverlay}><View style={styles.modalSheet}><View style={styles.modalHeader}><Text style={styles.modalTitle}>Select Airport</Text><TouchableOpacity onPress={()=>setOpen(false)}><Text style={styles.modalClose}>✕</Text></TouchableOpacity></View><TextInput style={styles.modalSearch} placeholder="Search airport or country" placeholderTextColor={colors.textSecondary} value={query} onChangeText={setQuery} autoFocus/><FlatList data={filtered} keyExtractor={item=>item.id} keyboardShouldPersistTaps="handled" ListEmptyComponent={<Text style={styles.modalEmpty}>No matching airport.</Text>} renderItem={({item})=><TouchableOpacity style={styles.modalRow} onPress={()=>onPick(item)}><Text style={styles.modalRowName}>{item.name}</Text><Text style={styles.modalRowState}>{item.country}</Text></TouchableOpacity>}/></View></View></Modal></>; }

// Date and time fields.
//
// Both of these used to render `<DateTimePicker .../>` - a bare identifier
// that was never imported, from a package that is not a dependency. Tapping
// any date field in the app threw "Property 'DateTimePicker' doesn't exist"
// and took the screen down with it: KYC, payslips, documents, notes, banner
// ads, salary reports, ad analytics, the travel inquiry.
//
// They use the in-app pickers now, which are ordinary views. That also
// matters for how the fix travels: a native module cannot ship over the
// air, so adding the real package would have left everyone already on
// 5.4.1.12 with the same crash until they installed a new build.
//
// DateField also accepts maximumDate now. Callers have always passed it -
// VerifyIdentityScreen bounds a date of birth with it, RemittanceReceiverStep
// too - and it was being dropped on the floor.
export function DateField({ placeholder, value, onChange, minimumDate, maximumDate }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity style={styles.fieldButton} onPress={() => setOpen(true)}>
        <Text style={value ? styles.fieldButtonText : styles.fieldButtonPlaceholder}>{value || placeholder}</Text>
        <Text style={styles.fieldButtonIcon}>📅</Text>
      </TouchableOpacity>
      <DatePickerModal
        visible={open}
        value={value}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        title={placeholder || 'Select date'}
        onCancel={() => setOpen(false)}
        onConfirm={(next) => { setOpen(false); onChange(next); }}
      />
    </>
  );
}

export function TimeField({ placeholder, value, onChange }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity style={styles.fieldButton} onPress={() => setOpen(true)}>
        <Text style={value ? styles.fieldButtonText : styles.fieldButtonPlaceholder}>{value || placeholder}</Text>
        <Text style={styles.fieldButtonIcon}>🕐</Text>
      </TouchableOpacity>
      <TimePickerModal
        visible={open}
        value={value}
        title={placeholder || 'Select time'}
        onCancel={() => setOpen(false)}
        onConfirm={(next) => { setOpen(false); onChange(next); }}
      />
    </>
  );
}

export function Grid3({ children }) { const { colors }=useTheme(); const styles=createStyles(colors); return <View style={styles.grid3}>{children}</View>; }
export function Grid2({ children }) { const { colors }=useTheme(); const styles=createStyles(colors); return <View style={styles.grid2}>{children}</View>; }

// Country selector: deliberately uses the same crisp, logo-forward visual language as OperatorCard.
export function SelectCard({ code, flag, name, selected, onPress }) { const { colors }=useTheme(); const styles=createStyles(colors); return <TouchableOpacity style={[styles.selectCard,selected&&styles.selectCardSelected]} onPress={onPress}><View style={styles.countryFlagWrap}><CountryFlag code={code} emoji={flag} size={42} /></View><Text style={styles.selectName} numberOfLines={2}>{String(name||'')}</Text></TouchableOpacity>; }

export function OperatorCard({ name, logo, color, initials, selected, onPress, wide }) { const { colors }=useTheme(); const styles=createStyles(colors); return <TouchableOpacity style={[styles.selectCard,wide&&styles.operatorCardWide,selected&&styles.selectCardSelected]} onPress={onPress}>{logo?<View style={wide?styles.operatorLogoChipWide:styles.operatorLogoChip}><Image source={logo} style={wide?styles.operatorLogoWide:styles.operatorLogo} resizeMode="contain"/></View>:<View style={[styles.operatorBadge,wide&&styles.operatorBadgeWide,{backgroundColor:color||colors.primary}]}><Text style={styles.operatorBadgeText}>{initials}</Text></View>}<Text style={[styles.selectName,wide&&styles.operatorNameWide]} numberOfLines={2}>{String(name||'')}</Text></TouchableOpacity>; }
export function AmountButton({ label, selected, onPress }) { const { colors }=useTheme(); const styles=createStyles(colors); return <TouchableOpacity style={[styles.amountBtn,selected&&styles.amountBtnSelected]} onPress={onPress}><Text style={[styles.amountBtnText,selected&&styles.amountBtnTextSelected]}>{label}</Text></TouchableOpacity>; }
// The name block flexes and the price does not: a Bangladesh package name runs
// to two lines of Bengali, and in an unflexed View it pushed the price off the
// card entirely - "BDT 1..." with the rest past the edge. `subPrice` carries
// what the wallet is actually charged, because a catalogue priced in BDT says
// nothing about what leaves a MYR wallet until you have chosen one.
export function PackageCard({ name, detail, price, currency='MYR', subPrice, selected, onPress }) { const { colors }=useTheme(); const styles=createStyles(colors); return <TouchableOpacity style={[styles.packageCard,selected&&styles.packageCardSelected]} onPress={onPress}><View style={styles.pkgText}><Text style={styles.pkgName}>{name}</Text>{!!detail&&<Text style={styles.pkgDetail}>{detail}</Text>}</View><View style={styles.pkgPriceWrap}><Text style={styles.pkgPrice} numberOfLines={1}>{currency} {price}</Text>{!!subPrice&&<Text style={styles.pkgSubPrice} numberOfLines={1}>{subPrice}</Text>}</View></TouchableOpacity>; }
export function MethodCard({ icon,bg,name,detail,onPress }) { const { colors }=useTheme(); const styles=createStyles(colors); return <TouchableOpacity style={styles.methodCard} onPress={onPress}><View style={[styles.methodIcon,{backgroundColor:bg}]}><Text style={{fontSize:22}}>{icon}</Text></View><View><Text style={styles.methodName}>{name}</Text><Text style={styles.methodDetail}>{detail}</Text></View></TouchableOpacity>; }
export function UploadBox({ label,onPress }) { const { colors }=useTheme(); const styles=createStyles(colors); return <TouchableOpacity style={styles.uploadBox} onPress={onPress}><Text style={styles.uploadText}>{label}</Text></TouchableOpacity>; }
export function SummaryCard({ title,rows,totalLabel,totalValue }) { const { colors }=useTheme(); const styles=createStyles(colors); return <View style={styles.summaryCard}>{!!title&&<Text style={styles.summaryTitle}>{title}</Text>}{(rows||[]).map(r=><View key={r.label} style={styles.summaryRow}><Text style={styles.summaryRowLabel}>{r.label}</Text><Text style={styles.summaryRowValue}>{r.value}</Text></View>)}{!!totalLabel&&<View style={styles.summaryRowTotal}><Text style={styles.summaryTotalText}>{totalLabel}</Text><Text style={styles.summaryTotalText}>{totalValue}</Text></View>}</View>; }
export function TxOptionCard({ title,badge,badgeColor,detail,price,selected,onPress }) { const { colors }=useTheme(); const styles=createStyles(colors); return <TouchableOpacity style={[styles.txCard,selected&&styles.txCardSelected]} onPress={onPress}><View style={styles.txHeader}><Text style={styles.txService}>{title}</Text>{!!badge&&<View style={[styles.badge,{backgroundColor:badgeColor||'#E8F5E9'}]}><Text style={styles.badgeText}>{badge}</Text></View>}</View>{!!detail&&<Text style={styles.txDetail}>{detail}</Text>}{!!price&&<Text style={styles.txAmount}>{price}</Text>}</TouchableOpacity>; }
export function PrimaryButton({ label,onPress,style,disabled }) { const { colors }=useTheme(); const styles=createStyles(colors); return <TouchableOpacity style={[styles.primaryBtn,disabled&&styles.btnDisabled,style]} onPress={onPress} disabled={disabled}><Text style={styles.primaryBtnText}>{label}</Text></TouchableOpacity>; }
export function OutlineButton({ label,onPress,style }) { const { colors }=useTheme(); const styles=createStyles(colors); return <TouchableOpacity style={[styles.outlineBtn,style]} onPress={onPress}><Text style={styles.outlineBtnText}>{label}</Text></TouchableOpacity>; }
export function OrDivider({ label='OR' }) { const { colors }=useTheme(); const styles=createStyles(colors); return <View style={styles.orDivider}><View style={styles.orDividerLine}/><Text style={styles.orDividerText}>{label}</Text><View style={styles.orDividerLine}/></View>; }
export function GoogleButton({ onPress,disabled,label='Continue with Google' }) { const { colors }=useTheme(); const styles=createStyles(colors); return <TouchableOpacity style={[styles.googleBtn,disabled&&styles.btnDisabled]} onPress={onPress} disabled={disabled} activeOpacity={0.8}><Text style={styles.googleG}>G</Text><Text style={styles.googleBtnText}>{label}</Text></TouchableOpacity>; }

function createStyles(colors){return StyleSheet.create({
  label:{fontWeight:'600',marginBottom:5,fontSize:13,color:colors.text},input:{width:'100%',paddingVertical:13,paddingHorizontal:12,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,fontSize:14,color:colors.text,backgroundColor:colors.card,marginBottom:10},textArea:{minHeight:80,textAlignVertical:'top',paddingTop:12},
  fieldButton:{width:'100%',flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingVertical:12,paddingHorizontal:14,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.card,marginBottom:10},fieldButtonText:{fontSize:14,color:colors.text},fieldButtonPlaceholder:{fontSize:14,color:colors.textSecondary},fieldButtonChevron:{fontSize:14,color:colors.textSecondary},fieldButtonIcon:{fontSize:15},
  modalOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.55)',justifyContent:'flex-end'},modalSheet:{backgroundColor:colors.card,borderTopLeftRadius:radius.xl,borderTopRightRadius:radius.xl,maxHeight:'75%',paddingTop:12},modalHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:18,paddingBottom:10},modalTitle:{fontSize:16,fontWeight:'700',color:colors.text},modalClose:{fontSize:18,color:colors.textSecondary,padding:4},modalSearch:{marginHorizontal:16,marginBottom:6,paddingVertical:10,paddingHorizontal:14,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,fontSize:14,color:colors.text,backgroundColor:colors.card},modalRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingVertical:14,paddingHorizontal:18,borderBottomWidth:1,borderBottomColor:colors.border},modalRowName:{fontSize:14,fontWeight:'500',color:colors.text},modalRowState:{fontSize:12,color:colors.textSecondary},modalEmpty:{textAlign:'center',color:colors.textSecondary,paddingVertical:30,fontSize:13},
  grid3:{flexDirection:'row',flexWrap:'wrap',gap:10},grid2:{flexDirection:'row',flexWrap:'wrap',gap:12},
  selectCard:{width:'30%',height:110,backgroundColor:colors.tileBg,borderWidth:1.5,borderColor:colors.tileBorder,borderRadius:radius.card,paddingVertical:10,paddingHorizontal:4,alignItems:'center',justifyContent:'center',marginBottom:10,shadowColor:'#000',shadowOpacity:0.08,shadowRadius:3,shadowOffset:{width:0,height:1},elevation:2},selectCardSelected:{borderColor:colors.primary,backgroundColor:colors.card,borderWidth:2},countryFlagWrap:{alignItems:'center',justifyContent:'center',marginBottom:6},countryFlag:{fontSize:28},selectName:{fontSize:11,fontWeight:'700',marginTop:2,textAlign:'center',color:colors.text},operatorLogo:{width:40,height:40},
  // Brand logos are supplied as opaque JPEGs as often as transparent PNGs,
  // so on a dark tile they read as a white rectangle with the mark lost
  // inside it. A white chip makes that deliberate and keeps every logo
  // legible; on a light tile it is the same colour as the card, so nothing
  // changes there.
  operatorLogoChip:{backgroundColor:'#FFFFFF',borderRadius:8,padding:3,alignItems:'center',justifyContent:'center'},
  operatorLogoChipWide:{backgroundColor:'#FFFFFF',borderRadius:8,padding:4,width:'100%',alignItems:'center',justifyContent:'center'},operatorBadge:{width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center'},operatorBadgeText:{color:'white',fontSize:13,fontWeight:'700'},operatorCardWide:{width:'47%',paddingVertical:20,paddingHorizontal:10},operatorLogoWide:{width:'100%',height:64},operatorBadgeWide:{width:64,height:64,borderRadius:16},operatorNameWide:{fontSize:13,marginTop:10},
  amountBtn:{flexBasis:'31%',paddingVertical:11,borderWidth:1.5,borderColor:colors.tileBorder,borderRadius:radius.tile,backgroundColor:colors.card,alignItems:'center',marginBottom:8},amountBtnSelected:{backgroundColor:colors.primary,borderColor:colors.primary},amountBtnText:{fontWeight:'500',fontSize:13,color:colors.text},amountBtnTextSelected:{color:'white'},packageCard:{backgroundColor:colors.card,borderWidth:1.5,borderColor:colors.tileBorder,borderRadius:radius.card,padding:14,marginBottom:8,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},packageCardSelected:{borderColor:colors.primary,backgroundColor:colors.card},pkgText:{flex:1,paddingRight:10},pkgPriceWrap:{flexShrink:0,alignItems:'flex-end'},pkgName:{fontWeight:'600',fontSize:14,color:colors.text},pkgDetail:{fontSize:12,color:colors.textSecondary,marginTop:2},pkgPrice:{fontWeight:'700',fontSize:16,color:colors.primary},pkgSubPrice:{fontSize:11,color:colors.textSecondary,marginTop:2},methodCard:{backgroundColor:colors.card,borderWidth:1.5,borderColor:colors.tileBorder,borderRadius:radius.card,padding:14,marginBottom:8,flexDirection:'row',alignItems:'center',gap:12},methodIcon:{width:44,height:44,borderRadius:radius.md,alignItems:'center',justifyContent:'center',marginRight:12},methodName:{fontWeight:'600',fontSize:14,color:colors.text},methodDetail:{fontSize:11,color:colors.textSecondary},uploadBox:{width:'100%',height:90,borderWidth:2,borderColor:colors.tileBorder,borderStyle:'dashed',borderRadius:radius.card,alignItems:'center',justifyContent:'center'},uploadText:{color:colors.textSecondary,fontSize:13,textAlign:'center'},summaryCard:{backgroundColor:colors.card,padding:16,borderRadius:radius.sheet,marginBottom:10,borderWidth:1.5,borderColor:colors.tileBorder},summaryTitle:{fontWeight:'600',fontSize:14,color:colors.text,marginBottom:6},summaryRow:{flexDirection:'row',justifyContent:'space-between',paddingVertical:5},summaryRowLabel:{color:colors.text,fontSize:13,flexShrink:1,paddingRight:8},summaryRowValue:{color:colors.text,fontSize:13,textAlign:'right',flexShrink:1},summaryRowTotal:{flexDirection:'row',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTopWidth:1,borderTopColor:colors.border},summaryTotalText:{fontWeight:'700',fontSize:16,color:colors.primary},txCard:{backgroundColor:colors.card,borderRadius:radius.card,padding:14,marginBottom:8,borderWidth:1.5,borderColor:colors.tileBorder},txCardSelected:{borderColor:colors.primary,borderWidth:2},txHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:6},txService:{fontWeight:'600',fontSize:14,color:colors.text},txDetail:{fontSize:11,color:colors.textSecondary,marginVertical:2},txAmount:{fontWeight:'700',fontSize:16,color:colors.primary},badge:{paddingVertical:3,paddingHorizontal:10,borderRadius:radius.md},badgeText:{fontSize:10,fontWeight:'600',color:'#2E7D32'},primaryBtn:{flex:1,backgroundColor:colors.primary,paddingVertical:14,borderRadius:radius.tile,alignItems:'center',borderWidth:1.5,borderColor:colors.goldLight},primaryBtnText:{color:'white',fontWeight:'600',fontSize:14},outlineBtn:{flex:1,backgroundColor:colors.card,borderWidth:2,borderColor:colors.primary,paddingVertical:14,borderRadius:radius.tile,alignItems:'center'},outlineBtnText:{color:colors.primary,fontWeight:'600'},googleBtn:{width:'100%',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,paddingVertical:12,backgroundColor:colors.card},googleG:{fontSize:16,fontWeight:'700',color:'#4285F4'},googleBtnText:{fontSize:14,fontWeight:'600',color:colors.text},orDivider:{flexDirection:'row',alignItems:'center',marginVertical:16,gap:10},orDividerLine:{flex:1,height:1,backgroundColor:colors.border},orDividerText:{fontSize:12,color:colors.textSecondary,fontWeight:'600'},btnDisabled:{opacity:0.5},
});}
