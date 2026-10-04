import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import ApiProviderFormModal from '../components/ApiProviderFormModal';
import ApiWebhookFormModal from '../components/ApiWebhookFormModal';
import * as apiService from '../firebase/apiProviderService';
import { servesCountry, providerCountries } from '../utils/providerReach';
import * as webhookService from '../firebase/apiWebhookService';

// Mirrors ALLOWED_COUNTRIES in functions/apiProviderService.js, minus 'ALL'.
// 'ALL' is how far a provider reaches, not where an order comes from.
//
// The two are checked against each other by scripts/test-api-countries.js: a
// country the backend accepts but this list omits cannot be given a mode or a
// provider from the only screen that sets them, which is how NP, PK, MM and KH
// came to be chargeable countries nobody could configure.
const SCOPE_COUNTRIES=['BD','MY','SG','ID','IN','PH','NP','PK','MM','KH'];

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
  // The matrix the backend resolves against, and which row is being edited.
  // DEFAULT is the service-wide fallback a country row inherits when it says
  // nothing; it is not a country, which is why it is not in COUNTRIES.
  const [countryModes,setCountryModes]=useState({});
  const [scope,setScope]=useState('BD');
  // Which features can never be API, from the server rather than a second copy
  // of the list here: the two would drift and the screen would offer a toggle
  // the backend refuses.
  const [nonApiServices,setNonApiServices]=useState([]);
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
      setCountryModes(settings.countryModes||{});
      setNonApiServices(settings.nonApiServices||[]);
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
  // The token is returned once, by these calls only. Re-reading the list never
  // carries it, so it is handed straight to the modal rather than into state
  // that a background refresh could overwrite with an empty string.
  const revealToken=async()=>{
    try{const r=await webhookService.revealApiWebhookToken(webhookProvider.id);return r?.webhookToken||'';}
    catch(e){Alert.alert('Webhook token',e.message||'Could not read the webhook token.');return '';}
  };
  const rotateToken=async()=>{
    return new Promise((resolve)=>{
      Alert.alert('Rotate webhook token',
        'A new token is generated now. Success TopUp callbacks signed with the old token are rejected until you paste the new one into their API settings page.',
        [{text:'Cancel',style:'cancel',onPress:()=>resolve('')},
         {text:'Rotate',style:'destructive',onPress:async()=>{
           try{const r=await webhookService.rotateApiWebhookToken(webhookProvider.id);await load();resolve(r?.webhookToken||'');}
           catch(e){Alert.alert('Rotate failed',e.message||'Could not rotate the webhook token.');resolve('');}
         }}]);
    });
  };
  const loadUnmatched=async()=>{
    try{return await webhookService.listApiWebhookUnmatched(webhookProvider.id);}
    catch(e){Alert.alert('Unmatched callbacks',e.message||'Could not read unmatched callbacks.');return [];}
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
  // A provider can serve several features now, so it appears under each one it
  // was given rather than only under its primary. `services` is projected with
  // the primary already in it, and falls back to `service` for a document
  // written before multi-feature support.
  const servicesOf=(x)=>(Array.isArray(x.services)&&x.services.length?x.services:[x.service].filter(Boolean));
  // Our float with the provider, not a customer's wallet - the callable is
  // superadmin-gated, and this only ever renders inside a superadmin screen.
  // Two numbers because drives are funded separately: drives can be empty
  // while the account is healthy, and that is the case worth seeing.
  const [balance,setBalance]=useState(null);
  const [balanceBusy,setBalanceBusy]=useState(false);
  const isSuccessTopUp=(x)=>String(x?.name||'').trim().toLowerCase()==='success topup';
  // null is "not reported", which is not the same as the zero the provider
  // documents as a real balance.
  const fmtBalance=(v)=>v===null||v===undefined?'—':`BDT ${Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const checkBalance=async()=>{
    if(balanceBusy)return;
    setBalanceBusy(true);
    try{const data=await apiService.getSuccessTopUpBalance();setBalance(data);}
    catch(e){Alert.alert('Balance',e.message||'Could not read the Success TopUp balance.');}
    finally{setBalanceBusy(false);}
  };

  const providersFor=(service)=>items.filter((x)=>servicesOf(x).includes(service)).sort((a,b)=>Number(b.priority||0)-Number(a.priority||0));
  // A provider only counts for a country if it serves that country, or serves
  // everywhere. This mirrors resolveExecutionMode on the server, so the
  // warning below matches what a real order would actually do.
  const servesScope=(p)=>scope==='DEFAULT'||servesCountry(p,scope);
  const modeFor=(service)=>{
    if(scope==='DEFAULT')return modes[service]==='api'?'api':'legacy';
    const row=countryModes[scope]||{};
    if(row[service]==='api'||row[service]==='legacy')return row[service];
    return modes[service]==='api'?'api':'legacy';
  };
  const inherited=(service)=>scope!=='DEFAULT'&&!(countryModes[scope]||{})[service];
  const setMode=(service,value)=>{
    if(scope==='DEFAULT'){setModes((m)=>({...m,[service]:value}));return;}
    setCountryModes((m)=>({...m,[scope]:{...(m[scope]||{}),[service]:value}}));
  };

  const renderFeature=({item:service})=>{
    const mine=providersFor(service);
    const mode=modeFor(service);
    const serving=mine.filter(servesScope);
    // Shown rather than hidden: a missing row reads as something broken, and
    // the reason is worth saying once in the place somebody would look for it.
    const fixedManual=nonApiServices.includes(service);
    return <View style={styles.feature}>
      <View style={styles.featureHead}>
        <View style={{flex:1}}>
          <Text style={styles.featureName}>{service}</Text>
          <Text style={styles.featureSub}>{serving.length?`${serving.length} provider${serving.length>1?'s':''}`:'No provider'} • {mode==='api'?'API mode':'Manual order'}{inherited(service)?' • inherited':''}</Text>
        </View>
        {fixedManual
          ? <Text style={styles.featureSub}>Manual only</Text>
          : <>
            <TouchableOpacity style={[styles.modeBtn,mode==='legacy'&&styles.modeOn]} onPress={()=>setMode(service,'legacy')}><Text style={styles.modeBtnText}>Manual</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.modeBtn,mode==='api'&&styles.modeOn]} onPress={()=>setMode(service,'api')}><Text style={styles.modeBtnText}>API</Text></TouchableOpacity>
          </>}
      </View>

      {fixedManual?<Text style={styles.featureSub}>A payout, not a product purchase - the customer pays here and somebody abroad receives their own currency. No top-up provider does that, so this always goes to a dealer.</Text>:null}

      {!fixedManual&&mode==='api'&&!serving.length?<Text style={styles.warn}>{scope==='DEFAULT'?'API mode is on but no provider is configured — this feature will fail until one is added.':`No provider serves ${scope}, so ${scope} orders go to a dealer as a manual request regardless of this setting.`}</Text>:null}

      {mine.map((item)=>{
        const hook=webhooks[item.id];
        return <View key={item.id} style={styles.item}>
          <View style={{flex:1}}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>{providerCountries(item).map(countryLabel).join(', ')} • Priority {item.priority ?? 0} • {item.active?'Active':'Inactive'}</Text>
            {servicesOf(item).length>1&&<Text style={styles.meta}>Also serves {servicesOf(item).filter((x)=>x!==service).join(', ')}</Text>}
            <Text numberOfLines={1} style={styles.url}>{item.baseUrl}</Text>
            <Text style={styles.meta}>{item.authType||'none'} • API secret {item.hasSecretKey?'configured':'not set'}{item.catalogPath?' • catalogue':''}</Text>
            <Text style={styles.webhookState}>{hook?.enabled?'🔔 Webhook active':'🔕 Webhook not configured'}</Text>
            {isSuccessTopUp(item)&&!!balance?<Text style={styles.balance}>
              Account {fmtBalance(balance.balance)} • Drives {fmtBalance(balance.driveBalance)}
            </Text>:null}
          </View>
          <View>
            <TouchableOpacity onPress={()=>testApi(item)}><Text style={styles.action}>Test</Text></TouchableOpacity>
            {isSuccessTopUp(item)?<TouchableOpacity onPress={checkBalance} disabled={balanceBusy}>
              <Text style={styles.action}>{balanceBusy?'…':'Balance'}</Text>
            </TouchableOpacity>:null}
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
        <Text style={styles.p}>Pick a country, then choose per feature whether it runs on the API or goes to a dealer as a manual request with accept and reject. A country with no provider stays manual whatever this says. Every feature can use its own API from its own provider, and a different one per country. Set a feature to API mode, add a provider for it, and the highest-priority active provider matching the customer&apos;s country handles it. Keys and webhook credentials are kept server-side.</Text>
        <Text style={styles.scopeLabel}>Country</Text>
        <View style={styles.scopeRow}>
          {['DEFAULT',...SCOPE_COUNTRIES].map((code)=>
            <TouchableOpacity key={code} style={[styles.scopeChip,scope===code&&styles.scopeChipOn]} onPress={()=>setScope(code)}>
              <Text style={[styles.scopeChipText,scope===code&&styles.scopeChipTextOn]}>{code==='DEFAULT'?'Default':code}</Text>
            </TouchableOpacity>)}
        </View>
        <Text style={styles.scopeHint}>{scope==='DEFAULT'?'The fallback every country inherits when it has no setting of its own.':`Settings for ${scope}. Anything left untouched follows Default.`}</Text>
        <TouchableOpacity style={styles.add} onPress={()=>{setEditing(null);setPresetService('');setSuccessTopUpSetup(true);setShow(true);}}><Text style={styles.addText}>+ Configure Success TopUp (Recharge + BD Internet + BD Bills)</Text></TouchableOpacity>
      </View>}
      ListFooterComponent={<TouchableOpacity disabled={savingModes} style={styles.saveModes} onPress={async()=>{
        try{setSavingModes(true);await apiService.saveServiceApiSettings(modes,countryModes);Alert.alert('Saved','Processing modes updated for every country.');}
        catch(e){Alert.alert('Save failed',e.message||'Unable to save modes');}
        finally{setSavingModes(false);}
      }}><Text style={styles.saveModesText}>{savingModes?'Saving…':'Save Processing Modes'}</Text></TouchableOpacity>}
    />
    <ApiProviderFormModal visible={show} provider={editing} presetService={presetService} successTopUp={successTopUpSetup || editing?.name === 'Success TopUp'} onClose={()=>{setShow(false);setSuccessTopUpSetup(false);setPresetService('');}} onSave={save}/>
    <ApiWebhookFormModal visible={showWebhook} provider={webhookProvider} config={webhookProvider?webhooks[webhookProvider.id]:null} onClose={()=>setShowWebhook(false)} onSave={saveWebhook} onReveal={revealToken} onRotate={rotateToken} onUnmatched={loadUnmatched}/>
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
    scopeLabel: { fontWeight: '800', marginTop: 10, marginBottom: 6, color: colors.text },
    scopeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    scopeChip: { paddingVertical: 7, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
    scopeChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    scopeChipText: { fontWeight: '700', fontSize: 12, color: colors.text },
    scopeChipTextOn: { color: colors.onPrimary },
    scopeHint: { fontSize: 11, lineHeight: 16, marginTop: 7, color: colors.textSecondary },
    modeBtnText: { fontWeight: '700', fontSize: 12, color: colors.text },
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
    balance: { marginTop: 5, fontWeight: '800', fontSize: 12, color: colors.primary },
  });
}
