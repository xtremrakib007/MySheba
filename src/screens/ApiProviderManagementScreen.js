import React, { useEffect, useMemo, useState } from 'react';
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
  const styles = useMemo(() => createStyles(colors), [colors]);
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
  const [presetService,setPresetService]=useState('');

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
          'API key and API secret saved. Bangladesh Recharge, Internet and Bill Payment API modes were configured automatically.\\n\\nWebhook URL:\\n'+result.webhookUrl+'\\n\\nWebhook token:\\n'+result.webhookToken,
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
  const testApi=async(item)=>{
    try{
      Alert.alert('Testing API','Checking the saved credentials and provider connection. No recharge, bill payment, or wallet charge will be created.');
      const result=await apiService.testApiProvider(item.id);
      Alert.alert('API connection OK',result?.message||'API credentials are valid and the provider is reachable.');
    }catch(e){Alert.alert('API test failed',e.message||'Unable to connect to the provider.');}
  };

  // One card per feature, holding that feature's own providers.
  //
  // This was a flat list of every provider with the feature buried in a line of
  // run-on text, and a single "Add API Provider" button. With twelve features
  // across seven countries there was no way to see what served what, so the
  // system looked like it could only do Success TopUp - when a separate
  // provider per feature per country is exactly what it has always supported.
  const countryLabel=(c)=>c==='BD'?'🇧🇩 Bangladesh':c==='MY'?'🇲🇾 Malaysia':c==='SG'?'🇸🇬 Singapore':c==='ID'?'🇮🇩 Indonesia':c==='IN'?'🇮🇳 India':c==='PH'?'🇵🇭 Philippines':'🌍 All countries';
  const providersFor=(service)=>items.filter((x)=>x.service===service).sort((a,b)=>Number(b.priority||0)-Number(a.priority||0));

  const renderFeature=({item:service})=>{
    const mine=providersFor(service);
    const mode=modes[service]==='api'?'api':'legacy';
    return <View style={styles.feature}>
      <View style={styles.featureHead}>
        <View style={{flex:1}}>
          <Text style={styles.featureName}>{service}</Text>
          <Text style={styles.featureSub}>{mine.length?`${mine.length} provider${mine.length>1?'s':''}`:'No provider'} • {mode==='api'?'API mode':'Previous logic'}</Text>
        </View>
        <TouchableOpacity style={[styles.modeBtn,mode==='legacy'&&styles.modeOn]} onPress={()=>setModes((m)=>({...m,[service]:'legacy'}))}><Text>Previous</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.modeBtn,mode==='api'&&styles.modeOn]} onPress={()=>setModes((m)=>({...m,[service]:'api'}))}><Text>API</Text></TouchableOpacity>
      </View>

      {mode==='api'&&!mine.length&&<Text style={styles.warn}>API mode is on but no provider is configured — this feature will fail until one is added.</Text>}

      {mine.map((item)=>{
        const hook=webhooks[item.id];
        return <View key={item.id} style={styles.item}>
          <View style={{flex:1}}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>{countryLabel(item.country)} • Priority {item.priority ?? 0} • {item.active?'Active':'Inactive'}</Text>
            <Text numberOfLines={1} style={styles.url}>{item.baseUrl}</Text>
            <Text style={styles.meta}>{item.authType||'none'} • API secret {item.hasSecretKey?'configured':'not set'}{item.catalogPath?' • catalogue':''}</Text>
            <Text style={styles.webhookState}>{hook?.enabled?'🔔 Webhook active':'🔕 Webhook not configured'}</Text>
          </View>
          <View>
            <TouchableOpacity onPress={()=>testApi(item)}><Text style={styles.action}>Test</Text></TouchableOpacity>
            <TouchableOpacity onPress={()=>{setEditing(item);setPresetService('');setShow(true);}}><Text style={styles.action}>Edit</Text></TouchableOpacity>
            <TouchableOpacity onPress={()=>{setWebhookProvider(item);setShowWebhook(true);}}><Text style={styles.webhookAction}>Webhook</Text></TouchableOpacity>
            <TouchableOpacity onPress={()=>remove(item.id)}><Text style={styles.delete}>Delete</Text></TouchableOpacity>
          </View>
        </View>;
      })}

      <TouchableOpacity style={styles.addForFeature} onPress={()=>{setEditing(null);setSuccessTopUpSetup(false);setPresetService(service);setShow(true);}}>
        <Text style={styles.addForFeatureText}>+ Add provider for {service}</Text>
      </TouchableOpacity>
    </View>;
  };

  return <View style={[styles.screen,{backgroundColor:colors.bg}]}>
    <LinearGradient colors={brandGradient} style={styles.header}>
      <HeaderDecor/><TouchableOpacity onPress={goBackOrHome}><Text style={styles.back}>←</Text></TouchableOpacity>
      <Text style={styles.headerTitle}>🔌 API Management</Text>
    </LinearGradient>
    <FlatList
      data={apiService.API_SERVICES}
      keyExtractor={(x)=>x}
      refreshing={loading}
      onRefresh={load}
      contentContainerStyle={{padding:14,paddingBottom:40}}
      renderItem={renderFeature}
      ListHeaderComponent={<View style={styles.intro}>
        <Text style={styles.h}>Service APIs</Text>
        <Text style={styles.p}>Every feature can use its own API from its own provider, and a different one per country. Set a feature to API mode, add a provider for it, and the highest-priority active provider matching the customer&apos;s country handles it. Keys and webhook credentials are kept server-side.</Text>
        <TouchableOpacity style={styles.add} onPress={()=>{setEditing(null);setPresetService('');setSuccessTopUpSetup(true);setShow(true);}}><Text style={styles.addText}>+ Configure Success TopUp (Recharge + BD Internet + BD Bills)</Text></TouchableOpacity>
      </View>}
      ListFooterComponent={<TouchableOpacity disabled={savingModes} style={styles.saveModes} onPress={async()=>{
        try{setSavingModes(true);await apiService.saveServiceApiSettings(modes);Alert.alert('Saved','Service processing modes updated.');}
        catch(e){Alert.alert('Save failed',e.message||'Unable to save modes');}
        finally{setSavingModes(false);}
      }}><Text style={styles.saveModesText}>{savingModes?'Saving…':'Save Processing Modes'}</Text></TouchableOpacity>}
    />
    <ApiProviderFormModal visible={show} provider={editing} presetService={presetService} successTopUp={successTopUpSetup || editing?.name === 'Success TopUp'} onClose={()=>{setShow(false);setSuccessTopUpSetup(false);setPresetService('');}} onSave={save}/>
    <ApiWebhookFormModal visible={showWebhook} provider={webhookProvider} config={webhookProvider?webhooks[webhookProvider.id]:null} onClose={()=>setShowWebhook(false)} onSave={saveWebhook}/>
  </View>;
}
// Themed, like every other screen. This stylesheet was built at module level
// with no colours argument, so the cards were hardcoded white and most text
// carried no colour at all - it fell back to whatever the platform default
// was. Every label without an explicit colour rendered invisible on the card,
// which is why "Delete" and "+ Add provider" were the only readable text on
// the screen: they were the only two with a colour set.
function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, overflow: 'hidden' },
    // On the brand gradient, so these two stay white.
    back: { color: 'white', fontSize: 22 },
    headerTitle: { color: 'white', fontSize: 17, fontWeight: '800' },
    intro: { padding: 16 },
    h: { fontSize: 20, fontWeight: '800', color: colors.text },
    p: { marginTop: 6, lineHeight: 20, color: colors.textSecondary },
    feature: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, marginBottom: 12 },
    featureHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    featureName: { fontWeight: '800', fontSize: 15, color: colors.text },
    featureSub: { fontSize: 11, marginTop: 2, color: colors.textSecondary },
    warn: { marginTop: 8, fontSize: 11, lineHeight: 16, color: colors.warning },
    addForFeature: { marginTop: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
    addForFeatureText: { fontWeight: '700', fontSize: 12, color: colors.primary },
    meta: { fontSize: 12, marginTop: 2, color: colors.textSecondary },
    modeBtn: { paddingVertical: 7, paddingHorizontal: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
    modeOn: { backgroundColor: colors.surface, borderColor: colors.primary },
    modeText: { color: colors.text, fontSize: 12, fontWeight: '600' },
    saveModes: { marginTop: 8, backgroundColor: colors.primary, padding: 11, borderRadius: 9, alignItems: 'center' },
    saveModesText: { color: colors.onPrimary, fontWeight: '800' },
    add: { marginTop: 14, backgroundColor: colors.primary, padding: 12, borderRadius: 9, alignItems: 'center' },
    addText: { color: colors.onPrimary, fontWeight: '800' },
    item: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', gap: 12 },
    name: { fontSize: 16, fontWeight: '800', color: colors.text },
    url: { marginTop: 4, color: colors.textSecondary },
    action: { fontWeight: '800', padding: 5, color: colors.primary },
    webhookAction: { fontWeight: '800', padding: 5, color: colors.primary },
    delete: { fontWeight: '800', padding: 5, color: colors.error },
    webhookState: { marginTop: 5, fontWeight: '700', color: colors.textSecondary },
  });
}
