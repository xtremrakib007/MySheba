import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Edit2, Globe2, Layers3, Megaphone, Plus, Save, Search, Smartphone, Trash2, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import * as service from '../services/platformControlService';

const SERVICE_KEYS = ['recharge','internet','billpayment','mobilebanking','remittance','offerpacks','entertainment','rechargePin','bus','train','flight','topup','history','support','myAccount','profile','walletTransfer','myDocuments','salary','kyc'];
const ROLE_OPTIONS = [
  { value:'customer', label:'Customer' }, { value:'dealer', label:'Dealer' },
  { value:'reseller', label:'Reseller' }, { value:'support', label:'Support Agent' },
  { value:'finance', label:'Finance' }, { value:'admin', label:'Admin' },
  { value:'superadmin', label:'Superadmin' },
];
function csv(v: string[] | undefined){ return (v||[]).join(', '); }

export default function PlatformControlCenterPage(){
  const { profile } = useAuth();
  const [tab,setTab]=useState<'features'|'grid'|'countries'|'operators'|'webviews'|'ads'>('features');
  const [data,setData]=useState<service.CatalogAdmin|null>(null);
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  const [feature,setFeature]=useState<any>({key:'',name:'',description:'',icon:'✨',kind:'webview',webviewKey:'',serviceKey:'recharge',screenKey:'moreFeatures',enabled:true,home:true,roles:[],countries:[],sortOrder:999});
  const [country,setCountry]=useState<any>({code:'',name:'',flag:'🌍',dial:'',currency:'MYR',enabled:true,sortOrder:999});
  const [operator,setOperator]=useState<any>({id:'',name:'',country:'MY',logo:'',enabled:true,recharge:true,internet:true,offerPacks:true,entertainment:true,sortOrder:999});
  const [target,setTarget]=useState<any>(null);
  const [webviewEdit,setWebviewEdit]=useState<any>(null);
  const [ads,setAds]=useState<Record<string,boolean>>({});
  const [grid,setGrid]=useState<any>(null);
  const [gridScope,setGridScope]=useState<'global'|'byRole'|'byCountry'|'byUser'>('global');
  const [gridWho,setGridWho]=useState('');

  async function load(){ setBusy(true); setError(''); try { const x=await service.listCatalog(); setData(x); setAds(x.ads||{}); const g=await service.getGridManagementAdmin(); setGrid(g); } catch(e:any){ setError(e?.message||'Could not load platform controls.'); } finally{setBusy(false);} }
  useEffect(()=>{ if(profile?.role==='superadmin') load(); },[profile?.role]);
  if(profile?.role!=='superadmin') return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">Only Superadmin can manage platform controls.</div>;
  async function run(fn:()=>Promise<any>){ setBusy(true); setError(''); try{ await fn(); await load(); }catch(e:any){setError(e?.message||'Operation failed.');}finally{setBusy(false);} }

  const countryOptions=(data?.countries||[]).map(c=>({value:String(c.code).toUpperCase(),label:`${c.flag||'🌍'} ${c.name} (${c.code})`}));

  return <div className="mx-auto max-w-[1500px] space-y-5 pb-10">
    <div className="rounded-3xl bg-gradient-to-r from-[#0b2447] via-[#155e9c] to-[#00a99d] p-6 text-white shadow-lg">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Superadmin</p>
      <h1 className="mt-1 text-2xl font-extrabold md:text-3xl">Platform Control Center</h1>
      <p className="mt-2 max-w-3xl text-sm text-white/75">Control tiles, features, countries, operators, WebView targeting and Google Ads from one server-owned panel. Changes are live and do not require an app build.</p>
    </div>
    <div className="flex flex-wrap gap-2">{[['features','Features',Layers3],['grid','Grid Controls',Layers3],['countries','Countries',Globe2],['operators','Operators',Smartphone],['webviews','WebViews',Users],['ads','Google Ads',Megaphone]].map(([k,l,I]:any)=><button key={k} onClick={()=>setTab(k)} className={tab===k?'rounded-xl bg-[#0b2447] px-4 py-2 text-sm font-bold text-white':'rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700'}><I size={16} className="mr-2 inline"/>{l}</button>)}</div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

    {tab==='features' && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-extrabold text-[#0b2447]">Dynamic Features & Grid Tiles</h2><p className="mt-1 text-xs text-slate-500">Create a new tile targeting an existing service, supported screen, or a Superadmin WebView. Built-in service code remains protected.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {(['key', 'name', 'description', 'icon', 'sortOrder'] as const).map(k => (
          <input
            key={k}
            value={feature[k] ?? ''}
            onChange={e =>
              setFeature({
                ...feature,
                [k]: k === 'sortOrder' ? Number(e.target.value) : e.target.value,
              })
            }
            placeholder={k}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        ))}
        <select value={feature.kind} onChange={e=>setFeature({...feature,kind:e.target.value})} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="webview">WebView</option><option value="service">Existing Service</option><option value="screen">Existing Screen</option></select>
        {feature.kind==='webview' && <input value={feature.webviewKey} onChange={e=>setFeature({...feature,webviewKey:e.target.value})} placeholder="WebView key" className="rounded-xl border border-slate-200 px-3 py-2 text-sm"/>}
        {feature.kind==='service' && <select value={feature.serviceKey} onChange={e=>setFeature({...feature,serviceKey:e.target.value})} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">{SERVICE_KEYS.map(k=><option key={k}>{k}</option>)}</select>}
        {feature.kind==='screen' && <select value={feature.screenKey} onChange={e=>setFeature({...feature,screenKey:e.target.value})} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">{['moreFeatures','history','topup','profile','myAccount','transferPoints','verifyIdentity','support'].map(k=><option key={k}>{k}</option>)}</select>}
        <MultiSelect label="Roles" placeholder="All roles" options={ROLE_OPTIONS} selected={feature.roles||[]} onChange={roles=>setFeature({...feature,roles})}/>
        <MultiSelect label="Countries" placeholder="All countries" options={countryOptions} selected={feature.countries||[]} onChange={countries=>setFeature({...feature,countries})}/><label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"><input type="checkbox" checked={feature.enabled!==false} onChange={e=>setFeature({...feature,enabled:e.target.checked})}/>Enabled</label><label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"><input type="checkbox" checked={feature.home!==false} onChange={e=>setFeature({...feature,home:e.target.checked})}/>Show on Home</label>
      </div>
      <button disabled={busy} onClick={()=>run(()=>service.saveFeature(feature))} className="mt-3 rounded-xl bg-[#00a99d] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Save size={15} className="mr-2 inline"/>Save Feature</button>
      <div className="mt-6 divide-y">{data?.features.map(f=><div key={f.id} className="flex flex-wrap items-center gap-3 py-3"><span className="text-xl">{f.icon||'✨'}</span><div className="min-w-[180px] flex-1"><b>{f.name}</b><small className="ml-2 text-slate-400">{f.key}</small><div className="text-xs text-slate-500">{f.kind} · {f.roles?.length?csv(f.roles):'all roles'} · {f.countries?.length?csv(f.countries):'all countries'}</div></div><button onClick={()=>setFeature({...f})} className="rounded-lg border border-slate-200 px-3 py-2 text-slate-600"><Edit2 size={15}/></button><button onClick={()=>run(()=>service.deleteFeature(f.id))} className="rounded-lg border border-red-200 px-3 py-2 text-red-600"><Trash2 size={15}/></button></div>)}</div>
    </section>}

    {tab==='grid' && grid && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-extrabold text-[#0b2447]">Every Home Grid / Tile</h2><p className="mt-1 text-xs text-slate-500">Turn every built-in tile on/off globally or override it for a role, country, or one user. Custom tiles are managed under Features.</p></div>
        <button disabled={busy} onClick={()=>run(()=>service.updateGridManagement(grid))} className="rounded-xl bg-[#00a99d] px-4 py-2 text-sm font-bold text-white"><Save size={15} className="mr-2 inline"/>Save Grid Controls</button><button disabled={busy} onClick={()=>{const x=window.prompt('This only removes transactions explicitly flagged isTest=true or testMode=true. Type DELETE TEST TRANSACTIONS to continue.',''); if(x==='DELETE TEST TRANSACTIONS') run(async()=>{const r=await service.purgeFlaggedTestTransactions(x); window.alert(`Removed ${r?.deleted||0} flagged test transaction(s).`);});}} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-700">Remove Test Transactions</button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <select value={gridScope} onChange={e=>{setGridScope(e.target.value as any);setGridWho('')}} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
          <option value="global">Global default</option><option value="byRole">By role</option><option value="byCountry">By country</option><option value="byUser">By user ID</option>
        </select>
        {gridScope==='byRole' && <select value={gridWho} onChange={e=>setGridWho(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">Choose role</option>{ROLE_OPTIONS.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select>}
        {gridScope==='byCountry' && <select value={gridWho} onChange={e=>setGridWho(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">Choose country</option>{countryOptions.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select>}
        {gridScope==='byUser' && <input value={gridWho} onChange={e=>setGridWho(e.target.value.trim())} placeholder="Paste user UID" className="rounded-xl border border-slate-200 px-3 py-2 text-sm"/>}
      </div>
      {gridScope!=='global' && !gridWho && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Choose a target before changing a scoped grid.</div>}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(grid.defs||[]).map((d:any)=>{
          const active = gridScope==='global' ? grid.global?.[d.key] !== false : grid[gridScope]?.[gridWho]?.[d.key] ?? grid.global?.[d.key] !== false;
          const hasOverride = gridScope!=='global' && typeof grid[gridScope]?.[gridWho]?.[d.key] === 'boolean';
          const toggle = () => {
            if(gridScope!=='global' && !gridWho) return;
            if(gridScope==='global') setGrid({...grid,global:{...grid.global,[d.key]:!active}});
            else setGrid({...grid,[gridScope]:{...grid[gridScope],[gridWho]:{...(grid[gridScope]?.[gridWho]||{}),[d.key]:!active}}});
          };
          const clear = () => {
            if(gridScope==='global'||!gridWho) return;
            const next={...grid,[gridScope]:{...grid[gridScope]}};
            const row={...(next[gridScope]?.[gridWho]||{})}; delete row[d.key];
            if(Object.keys(row).length) next[gridScope][gridWho]=row; else delete next[gridScope][gridWho];
            setGrid(next);
          };
          return <div key={d.key} className="flex items-center gap-3 rounded-xl border border-slate-200 p-4">
            <button type="button" onClick={toggle} disabled={gridScope!=='global'&&!gridWho} className={active?'h-10 w-10 rounded-xl bg-emerald-100 text-emerald-700':'h-10 w-10 rounded-xl bg-slate-100 text-slate-400'}>{active?'✓':'×'}</button>
            <div className="min-w-0 flex-1"><b className="text-sm">{d.name}</b><div className="text-[11px] text-slate-400">{d.key}{hasOverride?' · override':''}</div></div>
            {hasOverride && <button type="button" onClick={clear} className="text-xs font-bold text-slate-500">Default</button>}
          </div>;
        })}
      </div>
    </section>}
    {tab==='countries' && <CatalogSection title="Country Catalogue" icon={<Globe2 size={18}/>} rows={data?.countries||[]} fields={country} setFields={setCountry} onSave={()=>run(()=>service.saveCountry(country))} onEdit={r=>setCountry({...r})} onDelete={id=>run(()=>service.deleteCountry(id))} labels={['code','name','flag','dial','currency','sortOrder']}/>}
    {tab==='operators' && <CatalogSection title="Operator Catalogue" icon={<Smartphone size={18}/>} rows={data?.operators||[]} fields={operator} setFields={setOperator} onSave={()=>run(()=>service.saveOperator(operator))} onEdit={r=>setOperator({...r})} onDelete={id=>run(()=>service.deleteOperator(id))} labels={['id','name','country','logo','sortOrder']}/>}

    {tab==='webviews' && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-extrabold text-[#0b2447]">WebView Management</h2><p className="mt-1 text-xs text-slate-500">Add, edit, disable and target WebViews. Built-in pages can be edited or disabled; custom wv_ pages can also be removed.</p></div><button onClick={()=>setWebviewEdit({key:'wv_'+Math.random().toString(36).slice(2,10),name:'',url:'https://',title:'',icon:'🌐',active:true,home:true,mobile:true,desktop:true,roles:[],countries:[],users:[]})} className="rounded-xl bg-[#0b2447] px-4 py-2 text-sm font-bold text-white"><Plus size={15} className="mr-2 inline"/>Add WebView</button></div>
      {webviewEdit && <div className="mt-4 rounded-2xl border border-teal-200 bg-teal-50/40 p-4"><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">{(['key','name','url','title','icon'] as const).map(k=><input key={k} value={webviewEdit[k]??''} disabled={k==='key' && !String(webviewEdit.key).startsWith('wv_')} onChange={e=>setWebviewEdit({...webviewEdit,[k]:e.target.value})} placeholder={k} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"/>)}<label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><input type="checkbox" checked={webviewEdit.active!==false} onChange={e=>setWebviewEdit({...webviewEdit,active:e.target.checked})}/>Active</label><label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><input type="checkbox" checked={webviewEdit.home!==false} onChange={e=>setWebviewEdit({...webviewEdit,home:e.target.checked})}/>Home tile</label><label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><input type="checkbox" checked={webviewEdit.mobile!==false} onChange={e=>setWebviewEdit({...webviewEdit,mobile:e.target.checked})}/>📱 Mobile View</label><label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><input type="checkbox" checked={webviewEdit.desktop!==false} onChange={e=>setWebviewEdit({...webviewEdit,desktop:e.target.checked})}/>🖥️ Desktop View</label></div><div className="mt-3 flex justify-end gap-2"><button onClick={()=>setWebviewEdit(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">Cancel</button><button onClick={()=>run(async()=>{await service.saveWebviewPage(webviewEdit);setWebviewEdit(null);})} className="rounded-xl bg-[#00a99d] px-4 py-2 text-sm font-bold text-white"><Save size={15} className="mr-2 inline"/>Save WebView</button></div></div>}
      <h3 className="mt-6 font-extrabold text-[#0b2447]">Access Targeting</h3>
      <p className="mt-1 text-xs text-slate-500">Leave a selector empty for unrestricted access. Otherwise the user must match every non-empty targeting dimension.</p>
      <div className="mt-4 space-y-3">{(data?.webviews||[]).map((w:any)=><div key={w.key} className="rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-3"><span className="text-lg">{w.icon||'🌐'}</span><div className="min-w-0 flex-1"><b>{w.name||w.title}</b><div className="truncate text-xs text-slate-500">{w.key} · {w.url} · {w.active===false?'disabled':'active'} · {w.mobile===false?'mobile off':'mobile on'} · {w.desktop===false?'desktop off':'desktop on'}</div></div><button onClick={()=>setWebviewEdit({...w})} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">Edit</button>{w.custom&&<button onClick={()=>run(()=>service.deleteWebviewPage(w.key))} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600">Remove</button>}<button onClick={()=>setTarget({key:w.key,roles:w.roles||[],countries:w.countries||[],users:w.users||[]})} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">{target?.key===w.key?'Close':'Target'}</button></div>
        {target?.key===w.key&&<div className="mt-4 grid gap-4 md:grid-cols-3">
          <MultiSelect label="Roles" placeholder="All roles" options={ROLE_OPTIONS} selected={target.roles||[]} onChange={roles=>setTarget({...target,roles})}/>
          <MultiSelect label="Countries" placeholder="All countries" options={countryOptions} selected={target.countries||[]} onChange={countries=>setTarget({...target,countries})}/>
          <UserMultiSelect selected={target.users||[]} onChange={users=>setTarget({...target,users})}/>
          <div className="md:col-span-3 flex justify-end"><button disabled={busy} onClick={()=>run(()=>service.targetWebview(target))} className="rounded-lg bg-[#00a99d] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Save size={15} className="mr-2 inline"/>Save Targeting</button></div>
        </div>}
      </div>)}</div>
    </section>}

    {tab==='ads' && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-extrabold text-[#0b2447]">Google Ads Controls</h2><p className="mt-1 text-xs text-slate-500">These controls govern Google/AdMob and MySheba advertising independently. AdMob can be disabled without disabling the rest of the ad system.</p><div className="mt-5 grid gap-3 md:grid-cols-2">{['adsEnabled','bannerAdsEnabled','nativeAdsEnabled','interstitialAdsEnabled','directAdsEnabled','admobEnabled','admobBannerEnabled'].map(k=><label key={k} className="flex items-center justify-between rounded-xl border border-slate-200 p-4"><span className="text-sm font-bold">{k}</span><input type="checkbox" checked={ads[k]!==false} onChange={e=>setAds({...ads,[k]:e.target.checked})}/></label>)}</div><button disabled={busy} onClick={()=>run(()=>service.updateAds(ads))} className="mt-4 rounded-xl bg-[#00a99d] px-4 py-2 text-sm font-bold text-white"><Save size={15} className="mr-2 inline"/>Save Google Ads Controls</button></section>}
    {busy && <div className="text-xs text-slate-500">Saving/loading…</div>}
  </div>;
}

function MultiSelect({label,placeholder,options,selected,onChange}:{label:string;placeholder:string;options:{value:string;label:string}[];selected:string[];onChange:(v:string[])=>void}){
  const [open,setOpen]=useState(false); const [q,setQ]=useState('');
  const filtered=useMemo(()=>options.filter(o=>`${o.label} ${o.value}`.toLowerCase().includes(q.toLowerCase())),[options,q]);
  const toggle=(value:string)=>onChange(selected.includes(value)?selected.filter(x=>x!==value):[...selected,value]);
  return <div className="relative min-w-0">
    <label className="mb-1 block text-xs font-bold text-slate-600">{label}</label>
    <button type="button" onClick={()=>setOpen(!open)} className="flex min-h-[42px] w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm">
      <span className="min-w-0 flex-1 truncate">{selected.length?selected.map(v=>options.find(o=>o.value===v)?.label||v).join(', '):placeholder}</span><ChevronDown size={16} className="shrink-0"/>
    </button>
    {open&&<><div className="fixed inset-0 z-30" onClick={()=>setOpen(false)}/><div className="absolute z-40 mt-1 w-full min-w-[240px] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2"><Search size={15} className="text-slate-400"/><input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`} className="w-full border-0 px-1 py-2 text-sm outline-none"/></div>
      <div className="mt-2 max-h-56 overflow-auto">{filtered.map(o=><button type="button" key={o.value} onClick={()=>toggle(o.value)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50"><span className={selected.includes(o.value)?'flex h-5 w-5 items-center justify-center rounded border border-[#00a99d] bg-[#00a99d] text-white':'h-5 w-5 rounded border border-slate-300'}>{selected.includes(o.value)&&<Check size={13}/>}</span><span>{o.label}</span></button>)}{!filtered.length&&<div className="px-2 py-3 text-xs text-slate-400">No matches.</div>}</div>
      {selected.length>0&&<button type="button" onClick={()=>onChange([])} className="mt-2 w-full rounded-lg border border-slate-200 py-2 text-xs font-bold text-slate-600">Clear selection</button>}
    </div></>}
  </div>;
}

function UserMultiSelect({selected,onChange}:{selected:string[];onChange:(v:string[])=>void}){
  const [open,setOpen]=useState(false); const [q,setQ]=useState(''); const [results,setResults]=useState<service.UserLookup[]>([]); const [loading,setLoading]=useState(false);
  useEffect(()=>{ let cancelled=false; const timer=setTimeout(async()=>{ if(q.trim().length<2){setResults([]);return;} setLoading(true); try{const rows=await service.searchUsers(q.trim()); if(!cancelled)setResults(rows);}catch{if(!cancelled)setResults([]);}finally{if(!cancelled)setLoading(false);} },350); return()=>{cancelled=true;clearTimeout(timer);}; },[q]);
  const toggle=(uid:string)=>onChange(selected.includes(uid)?selected.filter(x=>x!==uid):[...selected,uid]);
  return <div className="relative min-w-0">
    <label className="mb-1 block text-xs font-bold text-slate-600">Users</label>
    <button type="button" onClick={()=>setOpen(!open)} className="flex min-h-[42px] w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm"><span className="min-w-0 flex-1 truncate">{selected.length?`${selected.length} user${selected.length===1?'':'s'} selected`:'All users'}</span><ChevronDown size={16} className="shrink-0"/></button>
    {open&&<><div className="fixed inset-0 z-30" onClick={()=>setOpen(false)}/><div className="absolute z-40 mt-1 w-full min-w-[300px] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2"><Search size={15} className="text-slate-400"/><input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search name, phone or user ID…" className="w-full border-0 px-1 py-2 text-sm outline-none"/></div>
      <div className="mt-2 max-h-64 overflow-auto">{loading&&<div className="px-2 py-3 text-xs text-slate-400">Searching…</div>}{!loading&&q.trim().length<2&&<div className="px-2 py-3 text-xs text-slate-400">Type at least 2 characters.</div>}{!loading&&q.trim().length>=2&&!results.length&&<div className="px-2 py-3 text-xs text-slate-400">No matching active users.</div>}{results.map(u=><button type="button" key={u.uid} onClick={()=>toggle(u.uid)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-50"><span className={selected.includes(u.uid)?'flex h-5 w-5 items-center justify-center rounded border border-[#00a99d] bg-[#00a99d] text-white':'h-5 w-5 rounded border border-slate-300'}>{selected.includes(u.uid)&&<Check size={13}/>}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{u.name||'Unnamed user'}</span><span className="block truncate text-xs text-slate-500">{u.phone||u.userId||u.uid} · {u.role}</span></span></button>)}</div>
      {selected.length>0&&<button type="button" onClick={()=>onChange([])} className="mt-2 w-full rounded-lg border border-slate-200 py-2 text-xs font-bold text-slate-600">Clear selected users</button>}
    </div></>}
  </div>;
}

function CatalogSection({title,icon,rows,fields,setFields,onSave,onEdit,onDelete,labels}:{title:string;icon:any;rows:any[];fields:any;setFields:(x:any)=>void;onSave:()=>void;onEdit:(row:any)=>void;onDelete:(id:string)=>void;labels:string[]}){
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 font-extrabold text-[#0b2447]">{icon}{title}</h2><div className="mt-4 grid gap-2 md:grid-cols-3 lg:grid-cols-6">{labels.map(k=><input key={k} value={fields[k]??''} onChange={e=>setFields({...fields,[k]:k==='sortOrder'?Number(e.target.value):e.target.value})} placeholder={k} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"/>)}</div><button onClick={onSave} className="mt-3 rounded-xl bg-[#00a99d] px-4 py-2 text-sm font-bold text-white"><Plus size={15} className="mr-2 inline"/>Save</button><div className="mt-5 divide-y">{rows.map((r:any)=><div key={r.id} className="flex items-center gap-3 py-3"><span className="min-w-0 flex-1"><b>{r.name||r.code}</b><small className="ml-2 text-slate-400">{r.code||r.id}{r.country ? ' · '+r.country : ''}</small></span><button onClick={()=>onEdit(r)} className="rounded-lg border border-slate-200 p-2 text-slate-600"><Edit2 size={15}/></button><button onClick={()=>onDelete(r.id||r.code)} className="rounded-lg border border-red-200 p-2 text-red-600"><Trash2 size={15}/></button></div>)}</div></section>;
}
