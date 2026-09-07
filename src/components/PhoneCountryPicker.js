import React from 'react';
import { Modal, View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { phoneCountries } from '../data/phoneCountries';

export default function PhoneCountryPicker({ visible, value, onSelect, onClose }) {
  const [q, setQ] = React.useState('');
  const list = phoneCountries.filter(c => !q || `${c.name} ${c.dial}`.toLowerCase().includes(q.toLowerCase()));
  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={styles.sheet}>
      <View style={styles.header}><Text style={styles.title}>Select country</Text><TouchableOpacity onPress={onClose}><Text style={styles.close}>✕</Text></TouchableOpacity></View>
      <TextInput value={q} onChangeText={setQ} placeholder="Search country or code" style={styles.search} autoCapitalize="none" />
      <FlatList data={list} keyExtractor={x=>x.code} keyboardShouldPersistTaps="handled" renderItem={({item}) => <TouchableOpacity style={[styles.row, value?.code===item.code && styles.selected]} onPress={()=>{onSelect(item);setQ('');}}><Text style={styles.flag}>{item.flag}</Text><Text style={styles.name}>{item.name}</Text><Text style={styles.dial}>{item.dial}</Text></TouchableOpacity>} />
    </View></View>
  </Modal>;
}
const styles=StyleSheet.create({backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.45)',justifyContent:'flex-end'},sheet:{height:'82%',backgroundColor:'white',borderTopLeftRadius:20,borderTopRightRadius:20,padding:16},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:12},title:{fontSize:18,fontWeight:'700'},close:{fontSize:20,padding:6},search:{borderWidth:1,borderColor:'#ddd',borderRadius:10,paddingHorizontal:12,paddingVertical:10,marginBottom:8},row:{flexDirection:'row',alignItems:'center',paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#eee'},selected:{backgroundColor:'#f0faf9'},flag:{fontSize:22,width:38},name:{flex:1,fontSize:14},dial:{fontSize:14,fontWeight:'600'}});
