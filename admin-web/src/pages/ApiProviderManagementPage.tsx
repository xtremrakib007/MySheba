import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Database, KeyRound, Plus, RefreshCw, Save, Server, ShieldCheck, Trash2, Wifi } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../services/apiProviderService';

type FormState = {
  id?: string; name: string; country: string; countries: string[]; service: string; services: string[];
  baseUrl: string; endpointPath: string; method: string; authType: string; apiKey: string; secretKey: string;
  username: string; password: string; headers: string; queryTemplate: string; requestTemplate: string;
  responseSuccessPath: string; responseSuccessValue: string; responseProcessingPath: string; responseProcessingValue: string;
  responseIdPath: string; responseMessagePath: string; responsePinPath: string; timeoutMs: number; priority: number; active: boolean;
  catalogPreset: string; catalogPath: string; catalogMethod: string; catalogListPath: string; catalogFieldId: string;
  catalogPerAccount: string; catalogQueryTemplate: string; catalogOperatorCodes: string; catalogDynamicProductDiscovery: boolean; excludedCountries: string[];
  catalogItemMap: string; notes: string;
};

const EMPTY: FormState = {
  name:'', country:'MY', countries:['MY'], service:'Recharge', services:['Recharge'],
  baseUrl:'', endpointPath:'/v1/order', method:'POST', authType:'none', apiKey:'', secretKey:'',
  username:'', password:'', headers:'{}', queryTemplate:'{}', requestTemplate:'{}',
  responseSuccessPath:'', responseSuccessValue:'', responseProcessingPath:'', responseProcessingValue:'',
  responseIdPath:'', responseMessagePath:'', responsePinPath:'', timeoutMs:30000, priority:0, active:true,
  catalogPreset:'', catalogPath:'', catalogMethod:'GET', catalogListPath:'', catalogFieldId:'',
  catalogPerAccount:'false', catalogQueryTemplate:'{}', catalogOperatorCodes:'{}', catalogDynamicProductDiscovery:false, excludedCountries:['BD'], catalogItemMap:'{}', notes:'',
};

function text(v:any) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function fromProvider(p: api.ApiProvider): FormState {
  return {
    ...EMPTY, ...p,
    id:p.id,
    name:text(p.name), country:text(p.country || p.countries?.[0] || 'MY'),
    countries:Array.isArray(p.countries) && p.countries.length ? p.countries : [text(p.country || 'MY')],
    service:text(p.service || p.services?.[0] || 'Recharge'),
    services:Array.isArray(p.services) && p.services.length ? p.services : [text(p.service || 'Recharge')],
    baseUrl:text(p.baseUrl), endpointPath:text(p.endpointPath || '/v1/order'), method:text(p.method || 'POST'),
    authType:text(p.authType || 'none'), apiKey:'', secretKey:'', username:'', password:'',
    headers:text(p.headers || '{}'), queryTemplate:text(p.queryTemplate || '{}'), requestTemplate:text(p.requestTemplate || '{}'),
    responseSuccessPath:text(p.responseSuccessPath), responseSuccessValue:text(p.responseSuccessValue),
    responseProcessingPath:text(p.responseProcessingPath), responseProcessingValue:text(p.responseProcessingValue),
    responseIdPath:text(p.responseIdPath), responseMessagePath:text(p.responseMessagePath), responsePinPath:text(p.responsePinPath),
    timeoutMs:Number(p.timeoutMs || 30000), priority:Number(p.priority || 0), active:p.active !== false,
    catalogPreset:text(p.catalogPreset), catalogPath:text(p.catalogPath), catalogMethod:text(p.catalogMethod || 'GET'),
    catalogListPath:text(p.catalogListPath), catalogFieldId:text(p.catalogFieldId),
    catalogPerAccount:String(p.catalogPerAccount === true || p.catalogPerAccount === 'true'),
    catalogQueryTemplate:text(p.catalogQueryTemplate || '{}'), catalogOperatorCodes:text(p.catalogOperatorCodes || '{}'), catalogDynamicProductDiscovery:p.catalogDynamicProductDiscovery === true, excludedCountries:Array.isArray(p.excludedCountries) ? p.excludedCountries : [],
    catalogItemMap:text(p.catalogItemMap || '{}'), notes:text(p.notes),
  };
}

function parseJson(value:string, label:string) {
  try { return JSON.parse(value || '{}'); } catch { throw new Error(label + ' must contain valid JSON.'); }
}

function applyIimmpact(f:FormState):FormState {
  return {
    ...f,
    name:f.name || 'iimmpact',
    baseUrl:'https://api.iimmpact.com',
    endpointPath:'/v2/topup',
    method:'POST',
    authType:'iimmpactHmac',
    responseSuccessPath:'data.status',
    responseSuccessValue:'Succesful, Successful',
    responseProcessingPath:'data.status',
    responseProcessingValue:'Accepted, Processing',
    responseIdPath:'data.refid',
    responseMessagePath:'data.remarks',
    responsePinPath:'data.pin',
    catalogPreset:'iimmpact-catalog',
    catalogPath:'/v2/catalog',
    catalogMethod:'GET',
    catalogListPath:'products',
    catalogFieldId:'plan',
    catalogPerAccount:'true',
    catalogQueryTemplate:'{}',
    catalogOperatorCodes:'{}',
    catalogDynamicProductDiscovery:true,
    excludedCountries:['BD'],
    services:['Recharge','Internet','Bill Payment','Recharge PIN','Entertainment','eSIM'],
    service:'Recharge',
    countries:['ALL'],
    country:'ALL',
    active:true,
  };
}

function Field({label,value,onChange,type='text',placeholder,secret=false,disabled=false}:{label:string;value:any;onChange:(v:string)=>void;type?:string;placeholder?:string;secret?:boolean;disabled?:boolean}) {
  return <label className="block">
    <span className="mb-1.5 block text-xs font-bold text-[var(--color-ink-soft)]">{label}</span>
    <input type={secret?'password':type} value={String(value ?? '')} disabled={disabled} placeholder={placeholder}
      onChange={e=>onChange(e.target.value)}
      className="w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)] disabled:opacity-60" />
  </label>;
}

function TextArea({label,value,onChange,placeholder}:{label:string;value:string;onChange:(v:string)=>void;placeholder?:string}) {
  return <label className="block">
    <span className="mb-1.5 block text-xs font-bold text-[var(--color-ink-soft)]">{label}</span>
    <textarea value={value} placeholder={placeholder} onChange={e=>onChange(e.target.value)} rows={4}
      className="w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2.5 font-mono text-xs outline-none focus:border-[var(--color-primary)]" />
  </label>;
}

export default function ApiProviderManagementPage() {
  const { profile } = useAuth();
  const editable = profile?.role === 'superadmin';
  const [providers,setProviders]=useState<api.ApiProvider[]>([]);
  const [selected,setSelected]=useState<api.ApiProvider|null>(null);
  const [form,setForm]=useState<FormState>(EMPTY);
  const [tab,setTab]=useState<'providers'|'catalog'|'options'>('providers');
  const [loading,setLoading]=useState(true); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const [catalog,setCatalog]=useState<any>(null); const [productCode,setProductCode]=useState('');
  const [options,setOptions]=useState<any>(null); const [fieldId,setFieldId]=useState('plan'); const [accountNumber,setAccountNumber]=useState(''); const [billerCode,setBillerCode]=useState('');

  async function load() {
    setLoading(true); setError('');
    try { setProviders(await api.listApiProviders()); }
    catch(e:any){ setError(e?.message || 'Could not load API providers.'); }
    finally{setLoading(false);}
  }
  useEffect(()=>{ if(editable) void load(); },[editable]);

  const iimmpactProviders=useMemo(()=>providers.filter(p=>p.authType==='iimmpactHmac' || String(p.name||'').toLowerCase()==='iimmpact'),[providers]);
  const set=(key:keyof FormState,value:any)=>setForm(f=>({...f,[key]:value}));

  function newProvider(preset=false){ const next=preset?applyIimmpact({...EMPTY}):{...EMPTY}; setSelected(null); setForm(next); setTab('providers'); setCatalog(null); setOptions(null); }
  function editProvider(p:api.ApiProvider){ setSelected(p); setForm(fromProvider(p)); setTab('providers'); setCatalog(null); setOptions(null); }

  async function save() {
    setBusy(true); setError('');
    try {
      if (!form.name.trim() || !form.baseUrl.trim()) throw new Error('Provider name and Base URL are required.');
      if (!form.services.length) throw new Error('Select at least one service.');
      const payload:any = {
        ...form, country:form.countries[0] || form.country, countries:form.countries, service:form.services[0], services:form.services,
        timeoutMs:Math.max(3000,Math.min(60000,Number(form.timeoutMs)||30000)), priority:Number(form.priority)||0,
        headers:parseJson(form.headers,'Headers'), queryTemplate:parseJson(form.queryTemplate,'Query template'), requestTemplate:parseJson(form.requestTemplate,'Request template'),
        catalogQueryTemplate:parseJson(form.catalogQueryTemplate,'Catalog query'), catalogOperatorCodes:parseJson(form.catalogOperatorCodes,'Operator product codes'), catalogItemMap:parseJson(form.catalogItemMap,'Catalog item map'), catalogDynamicProductDiscovery:form.catalogDynamicProductDiscovery, excludedCountries:form.excludedCountries,
        catalogPerAccount:form.catalogPerAccount==='true', active:form.active,
      };
      delete payload.apiKey; delete payload.secretKey; delete payload.username; delete payload.password; delete payload.id;
      if(form.apiKey) payload.apiKey=form.apiKey;
      if(form.secretKey) payload.secretKey=form.secretKey;
      if(form.username) payload.username=form.username;
      if(form.password) payload.password=form.password;
      if(selected?.id) payload.id=selected.id;
      await api.saveApiProvider(payload);
      await load(); if(selected?.id){ const fresh=(await api.listApiProviders()).find(p=>p.id===selected.id); if(fresh) editProvider(fresh); }
      else newProvider(false);
    } catch(e:any){ setError(e?.message || 'Could not save provider.'); }
    finally{setBusy(false);}
  }

  async function remove() {
    if(!selected?.id || !confirm('Delete this API provider? This does not delete transactions.')) return;
    setBusy(true); setError('');
    try { await api.deleteApiProvider(selected.id); setSelected(null); newProvider(false); await load(); }
    catch(e:any){setError(e?.message || 'Could not delete provider.');} finally{setBusy(false);}
  }

  async function test() {
    if(!selected?.id) return setError('Save the provider before testing it.');
    setBusy(true); setError('');
    try { const result=await api.testApiProvider(selected.id); window.alert(result?.message || 'Provider test completed.'); }
    catch(e:any){setError(e?.message || 'Provider test failed.');} finally{setBusy(false);}
  }

  async function loadCatalog() {
    if(!selected?.id) return setError('Save/select an IIMMPACT provider first.');
    setBusy(true); setError('');
    try { setCatalog(await api.getIimmpactCatalog(selected.id,productCode.trim(),false)); setTab('catalog'); }
    catch(e:any){setError(e?.message || 'Could not load IIMMPACT catalog.');} finally{setBusy(false);}
  }

  async function loadOptions() {
    if(!selected?.id || !productCode.trim() || !fieldId.trim()) return setError('Select a provider, product code and field ID.');
    setBusy(true); setError('');
    try { setOptions(await api.getIimmpactOptions({providerId:selected.id,productCode:productCode.trim(),fieldId:fieldId.trim(),accountNumber:accountNumber.trim(),billerCode:billerCode.trim(),page:1,limit:250})); setTab('options'); }
    catch(e:any){setError(e?.message || 'Could not load IIMMPACT options.');} finally{setBusy(false);}
  }

  if(!editable) return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">Only Superadmin can manage API providers.</div>;

  return <div className="mx-auto max-w-[1500px] space-y-5 pb-10">
    <div className="rounded-3xl bg-gradient-to-r from-[#0b2447] via-[#155e9c] to-[#00a99d] p-6 text-white shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Superadmin</p><h1 className="mt-1 text-2xl font-extrabold md:text-3xl">API Provider Management</h1><p className="mt-2 max-w-3xl text-sm text-white/75">Configure provider credentials, service reach, endpoints and catalog behaviour. IIMMPACT discovery uses the live server-side catalog and never exposes wholesale cost to customers.</p></div>
        <div className="flex gap-2"><button onClick={()=>newProvider(false)} className="rounded-xl bg-white/15 px-3 py-2 text-sm font-bold hover:bg-white/25"><Plus size={15} className="mr-1 inline"/>New</button><button onClick={()=>newProvider(true)} className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-[#0b2447]"><Wifi size={15} className="mr-1 inline"/>IIMMPACT preset</button></div>
      </div>
    </div>

    <div className="flex flex-wrap gap-2">
      {(['providers','catalog','options'] as const).map(k=><button key={k} onClick={()=>setTab(k)} className={tab===k?'rounded-xl bg-[#0b2447] px-4 py-2 text-sm font-bold text-white':'rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700'}>{k==='providers'?'Providers':k==='catalog'?'IIMMPACT Catalog':'IIMMPACT Options'}</button>)}
      <button onClick={()=>void load()} disabled={loading} className="ml-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"><RefreshCw size={15} className={loading?'mr-1 inline animate-spin':'mr-1 inline'}/>Refresh</button>
    </div>

    {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertTriangle size={17} className="mt-0.5 shrink-0"/>{error}</div>}

    {tab==='providers' && <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
      <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-extrabold">Configured providers</h2><span className="text-xs text-[var(--color-ink-soft)]">{providers.length}</span></div>
        <div className="space-y-2">
          {providers.map(p=><button key={p.id} onClick={()=>editProvider(p)} className={selected?.id===p.id?'w-full rounded-xl border border-[var(--color-primary)] bg-[var(--color-primary)]/5 p-3 text-left':'w-full rounded-xl border border-[var(--color-line)] p-3 text-left hover:border-[var(--color-primary)]'}>
            <div className="flex items-center gap-2"><Server size={16} className="shrink-0 text-[var(--color-primary)]"/><span className="min-w-0 flex-1 truncate text-sm font-bold">{p.name || 'Unnamed provider'}</span><ChevronRight size={15}/></div>
            <div className="mt-1 text-[11px] text-[var(--color-ink-soft)]">{(p.services||[p.service]).filter(Boolean).join(', ')} · {(p.countries||[p.country]).filter(Boolean).join(', ')}</div>
            <div className="mt-2 flex gap-1.5 text-[10px] font-bold"><span className="rounded-full bg-slate-100 px-2 py-0.5">{p.authType || 'none'}</span>{p.active===false?<span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">Disabled</span>:<span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">Active</span>}</div>
          </button>)}
          {!loading && providers.length===0 && <div className="rounded-xl border border-dashed border-[var(--color-line)] p-6 text-center text-sm text-[var(--color-ink-soft)]">No providers configured.</div>}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-extrabold">{selected?'Edit provider':'Create provider'}</h2><p className="mt-1 text-xs text-[var(--color-ink-soft)]">Secrets are write-only. Leave credential fields blank when editing to keep the existing secret.</p></div>{selected && <div className="flex gap-2"><button disabled={busy} onClick={()=>void test()} className="rounded-xl border border-[var(--color-line)] px-3 py-2 text-xs font-bold"><CheckCircle2 size={14} className="mr-1 inline"/>Test API</button><button disabled={busy} onClick={()=>void remove()} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700"><Trash2 size={14} className="mr-1 inline"/>Delete</button></div>}</div>

        <div className="mt-5 space-y-6">
          <div><h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold"><Server size={16}/> Identity & Reach</h3><div className="grid gap-3 md:grid-cols-2">
            <Field label="Provider name" value={form.name} onChange={v=>set('name',v)} placeholder="iimmpact"/>
            <Field label="Priority" value={form.priority} onChange={v=>set('priority',Number(v))} type="number"/>
            <Field label="Base URL" value={form.baseUrl} onChange={v=>set('baseUrl',v)} placeholder="https://api.example.com"/>
            <Field label="Endpoint path" value={form.endpointPath} onChange={v=>set('endpointPath',v)} placeholder="/v1/order"/>
            <Field label="Timeout (ms)" value={form.timeoutMs} onChange={v=>set('timeoutMs',Number(v))} type="number"/>
            <label className="flex items-center gap-3 rounded-xl border border-[var(--color-line)] px-3 py-2.5"><input type="checkbox" checked={form.active} onChange={e=>set('active',e.target.checked)}/><span className="text-sm font-semibold">Provider active</span></label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">{api.COUNTRIES.map(([code,label])=><button type="button" key={code} onClick={()=>set('countries',form.countries.includes(code)?form.countries.filter(x=>x!==code):[...form.countries,code])} className={form.countries.includes(code)?'rounded-full bg-[#0b2447] px-3 py-1.5 text-xs font-bold text-white':'rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600'}>{code} · {label}</button>)}</div></div>

          <div><h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold"><ShieldCheck size={16}/> Services</h3><div className="flex flex-wrap gap-2">{api.API_SERVICES.map(s=><button type="button" key={s} onClick={()=>{const next=form.services.includes(s)?form.services.filter(x=>x!==s):[...form.services,s]; if(next.length)set('services',next)}} className={form.services.includes(s)?'rounded-full bg-teal-600 px-3 py-1.5 text-xs font-bold text-white':'rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600'}>{s}</button>)}</div></div>

          <div><h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold"><KeyRound size={16}/> Authentication</h3><div className="grid gap-3 md:grid-cols-2">
            <label><span className="mb-1.5 block text-xs font-bold text-[var(--color-ink-soft)]">Auth type</span><select value={form.authType} onChange={e=>set('authType',e.target.value)} className="w-full rounded-xl border border-[var(--color-line)] px-3 py-2.5 text-sm"><option>none</option><option>apiKey</option><option>bearer</option><option>basic</option><option>iimmpactHmac</option></select></label>
            <Field label="API key" value={form.apiKey} onChange={v=>set('apiKey',v)} secret disabled={false} placeholder={selected?.hasApiKey?'Configured — leave blank to keep':'API key'}/>
            <Field label="API secret" value={form.secretKey} onChange={v=>set('secretKey',v)} secret placeholder={selected?.hasSecretKey?'Configured — leave blank to keep':'API secret'}/>
            <Field label="Username" value={form.username} onChange={v=>set('username',v)} placeholder={selected?.hasUsername?'Configured — leave blank to keep':'Basic auth username'}/>
            <Field label="Password" value={form.password} onChange={v=>set('password',v)} secret placeholder={selected?.hasPassword?'Configured — leave blank to keep':'Basic auth password'}/>
          </div></div>

          <div><h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold"><Database size={16}/> Request & Response</h3><div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3"><TextArea label="Headers JSON" value={form.headers} onChange={v=>set('headers',v)} placeholder='{"Authorization":"Bearer {{apiKey}}"}'/><TextArea label="Query template JSON" value={form.queryTemplate} onChange={v=>set('queryTemplate',v)}/><TextArea label="Request body JSON" value={form.requestTemplate} onChange={v=>set('requestTemplate',v)}/></div>
            <div className="grid gap-3 md:grid-cols-2"><Field label="Success path" value={form.responseSuccessPath} onChange={v=>set('responseSuccessPath',v)} placeholder="data.status"/><Field label="Success value" value={form.responseSuccessValue} onChange={v=>set('responseSuccessValue',v)}/><Field label="Processing path" value={form.responseProcessingPath} onChange={v=>set('responseProcessingPath',v)}/><Field label="Processing value" value={form.responseProcessingValue} onChange={v=>set('responseProcessingValue',v)}/><Field label="Provider reference path" value={form.responseIdPath} onChange={v=>set('responseIdPath',v)}/><Field label="Message path" value={form.responseMessagePath} onChange={v=>set('responseMessagePath',v)}/><Field label="PIN path" value={form.responsePinPath} onChange={v=>set('responsePinPath',v)}/></div>
          </div></div>

          <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-extrabold text-teal-900">IIMMPACT Catalog Configuration</h3><p className="mt-1 text-xs text-teal-800/70">Use the preset for the live /v2/catalog migration. Product discovery is separate from /v2/options.</p></div><button type="button" onClick={()=>setForm(applyIimmpact(form))} className="rounded-xl bg-teal-700 px-3 py-2 text-xs font-bold text-white">Apply IIMMPACT preset</button></div>
            <div className="mt-4 grid gap-3 md:grid-cols-2"><Field label="Catalog preset" value={form.catalogPreset} onChange={v=>set('catalogPreset',v)} placeholder="iimmpact-catalog"/><Field label="Catalog path" value={form.catalogPath} onChange={v=>set('catalogPath',v)} placeholder="/v2/catalog"/><Field label="Catalog method" value={form.catalogMethod} onChange={v=>set('catalogMethod',v)}/><Field label="Catalog list path" value={form.catalogListPath} onChange={v=>set('catalogListPath',v)} placeholder="products"/><Field label="Options field ID" value={form.catalogFieldId} onChange={v=>set('catalogFieldId',v)} placeholder="plan"/><Field label="Per-account catalog" value={form.catalogPerAccount} onChange={v=>set('catalogPerAccount',v)} placeholder="true or false"/></div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2"><TextArea label="Catalog query JSON" value={form.catalogQueryTemplate} onChange={v=>set('catalogQueryTemplate',v)}/><TextArea label="Legacy operator product codes JSON (optional)" value={form.catalogOperatorCodes} onChange={v=>set('catalogOperatorCodes',v)}/></div><div className="mt-3 flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 rounded-xl border border-teal-200 bg-white px-3 py-2 text-xs font-bold"><input type="checkbox" checked={form.catalogDynamicProductDiscovery} onChange={e=>set('catalogDynamicProductDiscovery',e.target.checked)}/> Discover products/operators from live IIMMPACT catalog</label><span className="text-xs text-teal-900/70">No hardcoded operator list. New active IIMMPACT products appear without an app release.</span></div><div className="mt-3"><span className="mb-1.5 block text-xs font-bold text-[var(--color-ink-soft)]">Excluded countries</span><div className="flex flex-wrap gap-2">{api.COUNTRIES.filter(([code])=>code!=='ALL').map(([code,label])=><button type="button" key={code} onClick={()=>set('excludedCountries',form.excludedCountries.includes(code)?form.excludedCountries.filter(x=>x!==code):[...form.excludedCountries,code])} className={form.excludedCountries.includes(code)?'rounded-full bg-red-600 px-3 py-1.5 text-xs font-bold text-white':'rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600'}>{code} · {label}</button>)}</div></div>
            {selected && iimmpactProviders.some(p=>p.id===selected.id) && <div className="mt-4 flex flex-wrap gap-2"><button onClick={()=>void loadCatalog()} disabled={busy} className="rounded-xl bg-[#0b2447] px-4 py-2 text-xs font-bold text-white"><Database size={14} className="mr-1 inline"/>Load live catalog</button><button onClick={()=>setTab('options')} className="rounded-xl border border-teal-300 px-4 py-2 text-xs font-bold text-teal-800">Open options tester</button></div>}
          </div>

          <TextArea label="Notes" value={form.notes} onChange={v=>set('notes',v)}/>

          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--color-line)] pt-4"><button onClick={()=>newProvider(false)} className="rounded-xl border border-[var(--color-line)] px-4 py-2.5 text-sm font-bold">Reset</button><button disabled={busy} onClick={()=>void save()} className="rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save size={15} className="mr-1 inline"/>{busy?'Saving…':'Save provider'}</button></div>
        </div>
      </section>
    </div>}

    {tab==='catalog' && <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-extrabold">Live IIMMPACT Catalog</h2><p className="mt-1 text-xs text-[var(--color-ink-soft)]">Read-only provider discovery. No customer pricing/cost is changed here.</p></div><button onClick={()=>void loadCatalog()} disabled={busy||!selected} className="rounded-xl bg-[var(--color-primary)] px-3 py-2 text-xs font-bold text-white"><RefreshCw size={14} className="mr-1 inline"/>Refresh catalog</button></div>
      <div className="mt-4 grid gap-3 md:grid-cols-3"><Field label="Product code (optional)" value={productCode} onChange={setProductCode} placeholder="Leave blank for full catalog"/><div className="md:col-span-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Selected provider: <b>{selected?.name || '—'}</b></div></div>
      {catalog && <div className="mt-5"><div className="mb-3 flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full bg-slate-100 px-3 py-1">{Object.keys(catalog.products||{}).length} products</span>{catalog.last_updated&&<span className="rounded-full bg-slate-100 px-3 py-1">Updated {String(catalog.last_updated)}</span>}</div><div className="overflow-auto rounded-xl border border-slate-200"><table className="min-w-full text-left text-xs"><thead className="bg-slate-50"><tr><th className="px-3 py-2">Code</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Processing</th><th className="px-3 py-2">Fields</th><th className="px-3 py-2">Active</th></tr></thead><tbody>{Object.values(catalog.products||{}).map((p:any)=><tr key={p.code} className="border-t border-slate-100"><td className="px-3 py-2 font-mono">{p.code}</td><td className="px-3 py-2 font-semibold">{p.name||'—'}</td><td className="px-3 py-2">{p.processing_time||'—'}</td><td className="px-3 py-2">{Array.isArray(p.fields)?p.fields.map((f:any)=>f?.id).filter(Boolean).join(', '):'—'}</td><td className="px-3 py-2">{p.is_active===false?'No':'Yes'}</td></tr>)}</tbody></table></div></div>}
      {!catalog && <div className="mt-8 rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">Load the live catalog to inspect IIMMPACT products without making a transaction.</div>}
    </section>}

    {tab==='options' && <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
      <h2 className="font-extrabold">IIMMPACT Options Tester</h2><p className="mt-1 text-xs text-[var(--color-ink-soft)]">Use this for /v2/options. Customer-facing screens never receive wholesale cost or loss-risk fields.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4"><Field label="Product code" value={productCode} onChange={setProductCode} placeholder="e.g. HI"/><Field label="Field ID" value={fieldId} onChange={setFieldId} placeholder="plan"/><Field label="Account / phone (optional)" value={accountNumber} onChange={setAccountNumber}/><Field label="Biller code (optional)" value={billerCode} onChange={setBillerCode}/></div>
      <button onClick={()=>void loadOptions()} disabled={busy} className="mt-3 rounded-xl bg-[#0b2447] px-4 py-2 text-xs font-bold text-white">Load options</button>
      {options && <div className="mt-5 overflow-auto rounded-xl border border-slate-200"><table className="min-w-full text-left text-xs"><thead className="bg-slate-50"><tr><th className="px-3 py-2">Code</th><th className="px-3 py-2">Label</th><th className="px-3 py-2">Price</th><th className="px-3 py-2">Validity</th></tr></thead><tbody>{(options.items||[]).map((x:any,i:number)=><tr key={String(x.code||i)} className="border-t border-slate-100"><td className="px-3 py-2 font-mono">{x.code||'—'}</td><td className="px-3 py-2">{x.label||x.name||'—'}</td><td className="px-3 py-2">{x.price ?? x.denomination ?? '—'}</td><td className="px-3 py-2">{x.validity||x.valid||x.duration||'—'}</td></tr>)}</tbody></table></div>}
      {!options && <div className="mt-8 rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">Enter a product code and field ID to query /v2/options.</div>}
    </section>}

    <div className="flex items-center gap-2 text-xs text-[var(--color-ink-soft)]"><KeyRound size={14}/> Credentials are sent only to Firebase callable functions; this page never writes API secrets directly to Firestore.</div>
  </div>;
}
