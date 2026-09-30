import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import ApiProviderFormModal from '../components/ApiProviderFormModal';
import ApiWebhookFormModal from '../components/ApiWebhookFormModal';
import * as apiService from '../firebase/apiProviderService';
import * as webhookService from '../firebase/apiWebhookService';

export default function ApiProviderManagementScreen() {
  const { profile, goBackOrHome } = useApp();
  const { colors, brandGradient } = useTheme();
  const [items,setItems]=useState([]);
  const [webhooks,setWebhooks]=useState({});
  const [editing,setEditing]=useState(null);
  const [webhookProvider,setWebhookProvider]=useState(null);
  const [show,setShow]=useState(false);
  const [showWebhook,setShowWebhook]=useState(false);
  const [loading,setLoading]=useState(true);
  const [modes,setModes]=useState(Object.fromEntries(apiService.API_SERVICES.map((x)=>[x,'legacy'])));
  const [savingModes,setSavingModes]=useState(false);
  const [successTopUpSetup,setSuccessTopUpSetup]=useState(false);

  const load=async()=>{
    try{
      setLoading(true);
      const [providers,settings,hookList]=await Promise.all([
        apiService.listApiProviders(),
        apiService.getServiceApiSettings(),
        webhookService.listApiWebhooks()
      ]);
      setItems(providers);
      setModes(settings.modes||{});
      setWebhooks(Object.fromEntries((hookList||[]).map((x)=>[x.providerId,x])));
    }catch(e){
      Alert.alert('API settings',e.message||'Unable to load APIs');
    }finally{setLoading(false);}
  };
  useEffect(()=>{if(profile?.role==='superadmin')load();},[profile?.role]);

  const save=async(v)=>{
    try{
      const result=await apiService.saveApiProvider(v);
      setShow(false);setEditing(null);setSuccessTopUpSetup(false);await load();
      if(result?.successTopUp){
        Alert.alert('Success TopUp configured',
          'API key and API secret saved. Recharge API mode and webhook were configured automatically.\\n\\nWebhook URL:\\n'+result.webhookUrl+'\\n\\nWebhook token:\\n'+result.webhookToken,
          [{text:'OK'}]);
      }
    }catch(e){Alert.alert('Save failed',e.message||'Unable to save API');}
  };
  const saveWebhook=async(v)=>{
    try{
      const result=await webhookService.saveApiWebhook(v);
      setShowWebhook(false);
      setWebhookProvider(null);
      Alert.alert('Webhook saved',result.webhookUrl||'Webhook configuration updated.');
      load();
    }catch(e){Alert.alert('Webhook save failed',e.message||'Unable to save webhook');}
  };
  const remove=(id)=>Alert.alert('Delete API','Remove this API provider?',[{text:'Cancel'},{text:'Delete',style:'destructive',onPress:async()=>{await apiService.deleteApiProvider(id);await webhookService.deleteApiWebhook(id).catch(()=>{});load();}}]);

  return <View style={[styles.screen,{backgroundColor:colors.bg}]}>
    <LinearGradient colors={brandGradient} style={styles.header}>
      <HeaderDecor/><TouchableOpacity onPress={goBackOrHome}><Text style={styles.back}>←</Text></TouchableOpacity>
      <Text style={styles.headerTitle}>🔌 API Management</Text>
    </LinearGradient>
    <View style={styles.intro}>
      <Text style={styles.h}>Service APIs</Text>
      <Text style={styles.p}>Configure providers and choose, per service, whether MySheba uses the API integration. API credentials and webhook credentials stay server-side.</Text>
      <View style={styles.modeCard}>
        <Text style={styles.modeTitle}>⚙️ Processing Mode</Text>
        {apiService.API_SERVICES.map((service)=><View key={service} style={styles.modeRow}>
          <View style={{flex:1}}><Text style={styles.modeName}>{service}</Text><Text style={styles.modeSub}>{modes[service]==='api'?'API mode':'Previous logic'}</Text></View>
          <TouchableOpacity style={[styles.modeBtn,modes[service]==='legacy'&&styles.modeOn]} onPress={()=>setModes((m)=>({...m,[service]:'legacy'}))}><Text>Previous</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.modeBtn,modes[service]==='api'&&styles.modeOn]} onPress={()=>setModes((m)=>({...m,[service]:'api'}))}><Text>API</Text></TouchableOpacity>
        </View>)}
        <TouchableOpacity disabled={savingModes} style={styles.saveModes} onPress={async()=>{
          try{setSavingModes(true);await apiService.saveServiceApiSettings(modes);Alert.alert('Saved','Service processing modes updated.');}
          catch(e){Alert.alert('Save failed',e.message||'Unable to save modes');}
          finally{setSavingModes(false);}
        }}><Text style={styles.saveModesText}>{savingModes?'Saving…':'Save Processing Modes'}</Text></TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.add} onPress={()=>{setEditing(null);setSuccessTopUpSetup(true);setShow(true);}}><Text style={styles.addText}>+ Configure Success TopUp</Text></TouchableOpacity>
      <TouchableOpacity style={styles.addOther} onPress={()=>{setEditing(null);setSuccessTopUpSetup(false);setShow(true);}}><Text style={styles.addOtherText}>+ Add Other API Provider</Text></TouchableOpacity>
    </View>
    <FlatList data={items} keyExtractor={(x)=>x.id} refreshing={loading} onRefresh={load} contentContainerStyle={{padding:14,paddingBottom:40}}
      ListEmptyComponent={<Text style={styles.empty}>{loading?'Loading…':'No API providers configured.'}</Text>}
      renderItem={({item})=>{
        const hook=webhooks[item.id];
        return <View style={styles.item}>
          <View style={{flex:1}}>
            <Text style={styles.name}>{item.name}</Text>
            <Text>{item.service} • Priority {item.priority ?? 0}</Text>
            <Text numberOfLines={1} style={styles.url}>{item.baseUrl}</Text>
            <Text>{item.active?'Active':'Inactive'} • {item.authType || 'none'} • API Secret {item.hasSecretKey?'configured':'not set'}</Text>
            <Text style={styles.webhookState}>{hook?.enabled ? '🔔 Webhook active' : '🔕 Webhook not configured'}</Text>
          </View>
          <View>
            <TouchableOpacity onPress={()=>{setEditing(item);setShow(true);}}><Text style={styles.action}>Edit API</Text></TouchableOpacity>
            <TouchableOpacity onPress={()=>{setWebhookProvider(item);setShowWebhook(true);}}><Text style={styles.webhookAction}>Webhook</Text></TouchableOpacity>
            <TouchableOpacity onPress={()=>remove(item.id)}><Text style={styles.delete}>Delete</Text></TouchableOpacity>
          </View>
        </View>;
      }}
    />
    <ApiProviderFormModal visible={show} provider={editing} successTopUp={successTopUpSetup || editing?.name === 'Success TopUp'} onClose={()=>{setShow(false);setSuccessTopUpSetup(false);}} onSave={save}/>
    <ApiWebhookFormModal visible={showWebhook} provider={webhookProvider} config={webhookProvider?webhooks[webhookProvider.id]:null} onClose={()=>setShowWebhook(false)} onSave={saveWebhook}/>
  </View>;
}
const styles=StyleSheet.create({
  screen:{flex:1},header:{flexDirection:'row',alignItems:'center',padding:12,gap:10,overflow:'hidden'},back:{color:'white',fontSize:22},
  headerTitle:{color:'white',fontSize:17,fontWeight:'800'},intro:{padding:16},h:{fontSize:20,fontWeight:'800'},p:{marginTop:6,lineHeight:20,opacity:.75},
  modeCard:{marginTop:10,backgroundColor:'white',borderRadius:12,padding:12},modeTitle:{fontWeight:'800',marginBottom:4},
  modeRow:{flexDirection:'row',alignItems:'center',gap:6,paddingVertical:7},modeName:{fontWeight:'700'},modeSub:{fontSize:11,opacity:.6},
  modeBtn:{paddingVertical:7,paddingHorizontal:9,borderWidth:1,borderColor:'#ddd',borderRadius:8},modeOn:{backgroundColor:'#E3F2FD',borderColor:'#2196F3'},
  saveModes:{marginTop:8,backgroundColor:'#455A64',padding:11,borderRadius:9,alignItems:'center'},saveModesText:{color:'white',fontWeight:'800'},
  add:{marginTop:14,backgroundColor:'#1976D2',padding:12,borderRadius:9,alignItems:'center'},addText:{color:'white',fontWeight:'800'},
  addOther:{marginTop:8,borderWidth:1,borderColor:'#1976D2',padding:12,borderRadius:9,alignItems:'center'},addOtherText:{color:'#1976D2',fontWeight:'800'},
  item:{backgroundColor:'white',borderRadius:12,padding:14,marginBottom:10,flexDirection:'row',gap:12},name:{fontSize:16,fontWeight:'800'},url:{marginTop:4,opacity:.7},
  action:{fontWeight:'800',padding:5},webhookAction:{fontWeight:'800',padding:5},delete:{color:'#C62828',fontWeight:'800',padding:5},
  webhookState:{marginTop:5,fontWeight:'700'},empty:{textAlign:'center',padding:30,opacity:.6}
});
