import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';

export default function ApiWebhookFormModal({ visible, provider, config, onClose, onSave }) {
  const [form, setForm] = useState({});
  useEffect(() => setForm({
    providerId: provider?.id || '',
    enabled: config?.enabled !== false,
    authHeader: config?.authHeader || 'x-webhook-token',
    webhookToken: '',
    transactionIdPath: config?.transactionIdPath || 'transactionId',
    statusPath: config?.statusPath || 'status',
    messagePath: config?.messagePath || 'message',
    successStatus: config?.successStatus || 'Success',
    processingStatus: config?.processingStatus || 'Processing',
    cancelStatus: config?.cancelStatus || 'Cancel',
  }), [provider, config, visible]);
  const set = (k, v) => setForm((x) => ({ ...x, [k]: v }));
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={styles.card}>
      <Text style={styles.title}>Webhook Configuration</Text>
      <ScrollView>
        <Text style={styles.provider}>Provider: {provider?.name || 'API Provider'}</Text>
        <Text style={styles.label}>Webhook URL</Text>
        <Text selectable style={styles.url}>{config?.webhookUrl || 'Save the configuration to generate the webhook URL.'}</Text>
        <Text style={styles.help}>Give this URL to the provider. Webhooks are received by MySheba server-side; the mobile app does not receive provider callbacks.</Text>
        {['authHeader','webhookToken','transactionIdPath','statusPath','messagePath','successStatus','processingStatus','cancelStatus'].map((k) =>
          <TextInput key={k} style={styles.input}
            placeholder={k === 'webhookToken' ? 'Webhook token' : k}
            value={String(form[k] ?? '')}
            onChangeText={(v) => set(k, v)}
            secureTextEntry={k === 'webhookToken'}
          />
        )}
        <TouchableOpacity onPress={() => set('enabled', !form.enabled)} style={styles.toggle}><Text>{form.enabled ? '✓ Webhook Active' : '○ Webhook Inactive'}</Text></TouchableOpacity>
        <Text style={styles.help}>SuccessTopUp defaults: header x-webhook-token, transactionIdPath transactionId, statusPath status, statuses Success / Processing / Cancel.</Text>
      </ScrollView>
      <View style={styles.row}><TouchableOpacity onPress={onClose} style={styles.cancel}><Text>Cancel</Text></TouchableOpacity><TouchableOpacity onPress={() => onSave(form)} style={styles.save}><Text style={{color:'white',fontWeight:'700'}}>Save Webhook</Text></TouchableOpacity></View>
    </View></View>
  </Modal>;
}
const styles=StyleSheet.create({
  backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.45)',justifyContent:'flex-end'},
  card:{backgroundColor:'white',borderTopLeftRadius:20,borderTopRightRadius:20,padding:18,maxHeight:'90%'},
  title:{fontSize:19,fontWeight:'800',marginBottom:10},provider:{fontWeight:'700',marginBottom:8},
  label:{fontWeight:'700',marginTop:8},url:{fontSize:12,marginTop:6,marginBottom:8},help:{fontSize:11,opacity:.65,lineHeight:16,marginBottom:8},
  input:{borderWidth:1,borderColor:'#ddd',borderRadius:9,padding:11,marginBottom:9},toggle:{padding:12,marginVertical:10},
  row:{flexDirection:'row',justifyContent:'flex-end',gap:10},cancel:{padding:12},save:{padding:12,borderRadius:9,backgroundColor:'#1976D2'}
});
