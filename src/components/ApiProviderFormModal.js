import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { API_SERVICES } from '../firebase/apiProviderService';

const COUNTRIES = [{code:'BD',label:'🇧🇩 Bangladesh'},{code:'MY',label:'🇲🇾 Malaysia'},{code:'SG',label:'🇸🇬 Singapore'},{code:'ID',label:'🇮🇩 Indonesia'},{code:'IN',label:'🇮🇳 India'},{code:'PH',label:'🇵🇭 Philippines'},{code:'ALL',label:'🌍 All countries'}];

const HELP_TEXT = 'Success TopUp is preconfigured by MySheba. Enter only the API key and API secret. The same credentials configure mobile recharge plus Bangladesh bill payment server-side; secrets never go to the customer app.';

export default function ApiProviderFormModal({ visible, provider, onClose, onSave, successTopUp = false }) {
  const special = successTopUp || provider?.name === 'Success TopUp';
  const [form, setForm] = useState({});
  useEffect(() => {
    if (special) {
      setForm({ ...(provider || {}), name: 'Success TopUp', country: 'BD', service: 'Recharge', baseUrl: 'https://api.successtopup.com', endpointPath: '/api/recharge', method: 'POST', authType: 'none', headers: '{}', queryTemplate: '{}', requestTemplate: JSON.stringify({ number: '{{phone}}', type: 'prepaid', operator: '{{operator}}', amount: '{{amount}}', trxid: '{{requestId}}', successtopup_key: '{{apiKey}}', successtopup_secret: '{{secretKey}}' }), responseSuccessPath: 'result', responseSuccessValue: 'true', responseMessagePath: 'message', apiKey: '', secretKey: '', active: true });
    } else {
      setForm(provider || { country: 'ALL', service: API_SERVICES[0], authType: 'none', method: 'POST', active: true, priority: 0, timeoutMs: 15000, endpointPath: '/', headers: '{}', queryTemplate: '{}', requestTemplate: '{}', responseSuccessPath: '', responseSuccessValue: '', responseIdPath: '', responseMessagePath: '', responsePinPath: '' });
    }
  }, [provider, visible, special]);
  const set = (k, v) => setForm((x) => ({ ...x, [k]: v }));
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={styles.card}>
      <Text style={styles.title}>{special ? 'Success TopUp Setup' : (provider ? 'Edit API Provider' : 'Add API Provider')}</Text>
      <ScrollView>
        {special ? <>
          <Text style={styles.provider}>Success TopUp: Recharge + Bangladesh Bills</Text>
          <Text style={styles.help}>{HELP_TEXT}</Text>
          <Text style={styles.label}>API Key</Text>
          <TextInput style={styles.input} placeholder={provider?.hasApiKey ? 'Leave blank to keep current API key' : 'Success TopUp API key'} value={String(form.apiKey || '')} onChangeText={(v) => set('apiKey', v)} secureTextEntry autoCapitalize="none" />
          <Text style={styles.label}>API Secret</Text>
          <TextInput style={styles.input} placeholder={provider?.hasSecretKey ? 'Leave blank to keep current API secret' : 'Success TopUp API secret'} value={String(form.secretKey || '')} onChangeText={(v) => set('secretKey', v)} secureTextEntry autoCapitalize="none" />
          <View style={styles.fixedBox}>
            <Text style={styles.fixedTitle}>Automatic configuration</Text>
            <Text>• HTTPS Success TopUp recharge + bill endpoints</Text>
            <Text>• Bangladesh electricity, gas, water and internet bills</Text>
            <Text>• Bangladesh postpaid mobile bills (GP, Robi, Banglalink)</Text>
            <Text>• Success / Processing / Cancel handling for recharge</Text>
            <Text>• Status polling and wallet refund protection</Text>
            <Text>• Webhook configuration</Text>
          </View>
        </> : <>
          <Text style={styles.label}>Country</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>{COUNTRIES.map((x) => <TouchableOpacity key={x.code} onPress={() => set('country', x.code)} style={[styles.chip, form.country === x.code && styles.chipOn]}><Text>{x.label}</Text></TouchableOpacity>)}</ScrollView>
          <Text style={styles.label}>Service</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>{API_SERVICES.map((x) => <TouchableOpacity key={x} onPress={() => set('service', x)} style={[styles.chip, form.service === x && styles.chipOn]}><Text>{x}</Text></TouchableOpacity>)}</ScrollView>
          {['name','baseUrl','endpointPath','apiKey','secretKey','username','password','priority','timeoutMs','headers','queryTemplate','requestTemplate','responseSuccessPath','responseSuccessValue','responseIdPath','responseMessagePath','responsePinPath','notes'].map((k) => <TextInput key={k} style={styles.input} placeholder={k === 'baseUrl' ? 'https://api.example.com (https only, no raw IPs)' : k === 'endpointPath' ? '/v1/order' : k === 'headers' ? '{"Authorization":"Bearer {{requestId}}"}' : k === 'requestTemplate' ? '{"phone":"{{phone}}","amount":"{{amount}}","requestId":"{{requestId}}"}' : k} value={String(form[k] ?? '')} onChangeText={(v) => set(k, v)} secureTextEntry={k === 'apiKey' || k === 'secretKey' || k === 'password'} keyboardType={k === 'priority' || k === 'timeoutMs' ? 'numeric' : 'default'} />)}
          <Text style={styles.label}>HTTP method</Text><ScrollView horizontal>{['GET','POST','PUT','PATCH'].map((x) => <TouchableOpacity key={x} onPress={() => set('method', x)} style={[styles.chip, form.method === x && styles.chipOn]}><Text>{x}</Text></TouchableOpacity>)}</ScrollView>
          <Text style={styles.help}>{HELP_TEXT}</Text>
          <Text style={styles.label}>Authentication</Text><ScrollView horizontal>{['none','apiKey','bearer','basic'].map((x) => <TouchableOpacity key={x} onPress={() => set('authType', x)} style={[styles.chip, form.authType === x && styles.chipOn]}><Text>{x}</Text></TouchableOpacity>)}</ScrollView>
        </>}
        {!special && <TouchableOpacity onPress={() => set('active', !form.active)} style={styles.toggle}><Text>{form.active ? '✓ Active' : '○ Inactive'}</Text></TouchableOpacity>}
      </ScrollView>
      <View style={styles.row}><TouchableOpacity onPress={onClose} style={styles.cancel}><Text>Cancel</Text></TouchableOpacity><TouchableOpacity onPress={() => onSave(form)} style={styles.save}><Text style={{ color: 'white', fontWeight: '700' }}>Save</Text></TouchableOpacity></View>
    </View></View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.45)',justifyContent:'flex-end'},
  card:{backgroundColor:'white',borderTopLeftRadius:20,borderTopRightRadius:20,padding:18,maxHeight:'90%'},
  title:{fontSize:19,fontWeight:'800',marginBottom:12},provider:{fontWeight:'800',marginBottom:8},
  label:{fontWeight:'700',marginTop:10,marginBottom:7},help:{fontSize:11,opacity:.7,lineHeight:16,marginBottom:8},
  input:{borderWidth:1,borderColor:'#ddd',borderRadius:9,padding:11,marginBottom:9},
  chip:{paddingVertical:9,paddingHorizontal:12,borderWidth:1,borderColor:'#ddd',borderRadius:18,marginRight:7,marginBottom:8},chipOn:{backgroundColor:'#E3F2FD',borderColor:'#2196F3'},
  fixedBox:{marginTop:8,marginBottom:8,padding:12,borderRadius:10,backgroundColor:'#F5F7FA',gap:4},fixedTitle:{fontWeight:'800',marginBottom:4},
  toggle:{padding:12,marginVertical:10},row:{flexDirection:'row',justifyContent:'flex-end',gap:10},cancel:{padding:12},save:{padding:12,borderRadius:9,backgroundColor:'#1976D2'}
});