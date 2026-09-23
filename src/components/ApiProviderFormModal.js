import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { API_SERVICES } from '../firebase/apiProviderService';

// Kept as a string, not JSX text: the copy contains {{placeholders}} and a
// literal JSON example, and in JSX a brace opens an expression - the
// {"successtopup_key": ...} example parsed as an object literal and the file
// failed to compile, which took the whole bundle with it.
const HELP_TEXT = 'For SuccessTopUp-style providers, put the API key and secret key in dedicated fields, then reference {{apiKey}} and {{secretKey}} inside Request Template (for example {"successtopup_key":"{{apiKey}}","successtopup_secret":"{{secretKey}}"}). The secret key stays server-side. For Recharge PIN, set Response PIN Path to the JSON field containing the real voucher PIN (for example data.pin). Never generate a PIN in the app. Templates support variables such as {{requestId}}, {{uid}}, {{phone}}, {{amount}}, {{country}}, {{operator}}, {{packageCode}} and {{details}}.';

export default function ApiProviderFormModal({ visible, provider, onClose, onSave }) {
  const [form, setForm] = useState({});
  useEffect(() => setForm(provider || { service: API_SERVICES[0], authType: 'none', method: 'POST', active: true, priority: 0, timeoutMs: 15000, endpointPath: '/', headers: '{}', queryTemplate: '{}', requestTemplate: '{}', responseSuccessPath: '', responseSuccessValue: '', responseIdPath: '', responseMessagePath: '', responsePinPath: '' }), [provider, visible]);
  const set = (k, v) => setForm((x) => ({ ...x, [k]: v }));
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={styles.card}>
      <Text style={styles.title}>{provider ? 'Edit API Provider' : 'Add API Provider'}</Text>
      <ScrollView>
        <Text style={styles.label}>Service</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {API_SERVICES.map((x) => <TouchableOpacity key={x} onPress={() => set('service', x)} style={[styles.chip, form.service === x && styles.chipOn]}><Text>{x}</Text></TouchableOpacity>)}
        </ScrollView>
        {['name','baseUrl','endpointPath','apiKey','secretKey','username','password','priority','timeoutMs','headers','queryTemplate','requestTemplate','responseSuccessPath','responseSuccessValue','responseIdPath','responseMessagePath','responsePinPath','notes'].map((k) => <TextInput key={k} style={styles.input} placeholder={k === 'baseUrl' ? 'https://api.example.com (https only, no raw IPs)' : k === 'endpointPath' ? '/v1/order' : k === 'headers' ? '{"Authorization":"Bearer {{requestId}}"}' : k === 'requestTemplate' ? '{"phone":"{{phone}}","amount":"{{amount}}","requestId":"{{requestId}}"}' : k} value={String(form[k] ?? '')} onChangeText={(v) => set(k, v)} secureTextEntry={k === 'apiKey' || k === 'secretKey' || k === 'password'} keyboardType={k === 'priority' || k === 'timeoutMs' ? 'numeric' : 'default'} />)}
        <Text style={styles.label}>HTTP method</Text><ScrollView horizontal>{['GET','POST','PUT','PATCH'].map((x) => <TouchableOpacity key={x} onPress={() => set('method', x)} style={[styles.chip, form.method === x && styles.chipOn]}><Text>{x}</Text></TouchableOpacity>)}</ScrollView><Text style={styles.help}>{HELP_TEXT}</Text><Text style={styles.label}>Authentication</Text>
        <ScrollView horizontal>{['none','apiKey','bearer','basic'].map((x) => <TouchableOpacity key={x} onPress={() => set('authType', x)} style={[styles.chip, form.authType === x && styles.chipOn]}><Text>{x}</Text></TouchableOpacity>)}</ScrollView>
        <TouchableOpacity onPress={() => set('active', !form.active)} style={styles.toggle}><Text>{form.active ? '✓ Active' : '○ Inactive'}</Text></TouchableOpacity>
      </ScrollView>
      <View style={styles.row}><TouchableOpacity onPress={onClose} style={styles.cancel}><Text>Cancel</Text></TouchableOpacity><TouchableOpacity onPress={() => onSave(form)} style={styles.save}><Text style={{ color: 'white', fontWeight: '700' }}>Save API</Text></TouchableOpacity></View>
    </View></View>
  </Modal>;
}
const styles = StyleSheet.create({ backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.45)',justifyContent:'flex-end'},card:{backgroundColor:'white',borderTopLeftRadius:20,borderTopRightRadius:20,padding:18,maxHeight:'90%'},title:{fontSize:19,fontWeight:'800',marginBottom:12},label:{fontWeight:'700',marginTop:10,marginBottom:7},help:{fontSize:11,opacity:.65,lineHeight:16,marginBottom:8},input:{borderWidth:1,borderColor:'#ddd',borderRadius:9,padding:11,marginBottom:9},chip:{paddingVertical:9,paddingHorizontal:12,borderWidth:1,borderColor:'#ddd',borderRadius:18,marginRight:7,marginBottom:8},chipOn:{backgroundColor:'#E3F2FD',borderColor:'#2196F3'},toggle:{padding:12,marginVertical:10},row:{flexDirection:'row',justifyContent:'flex-end',gap:10},cancel:{padding:12},save:{padding:12,borderRadius:9,backgroundColor:'#1976D2'}});
