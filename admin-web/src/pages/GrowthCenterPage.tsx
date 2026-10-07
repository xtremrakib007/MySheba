import { useEffect, useState } from 'react';
import { Gift, Megaphone, Users, TicketPercent, Save, Trash2, RefreshCw, TrendingUp } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';

type GrowthConfig = {
  referralEnabled:boolean;
  referralReward:number;
  referralNewUserReward:number;
  referralMinimumSpend:number;
  referralQualificationDays:number;
  referralMonthlyCap:number;
  firstTransactionReward:number;
  welcomeReward:number;
  minimumTransaction:number;
};
type Campaign = { id:string; name:string; code:string; type:string; active:boolean; rewardAmount:number; minimumTransaction:number; service:string; audience:string; budget:number; startAt:any; endAt:any };
type Dashboard = { users:number; customers:number; completedTransactions:number; qualifiedReferrals:number; rewardedReferrals:number; pendingRewards:number; activeCampaigns:number };
const defaults:GrowthConfig={
  referralEnabled:true,referralReward:5,referralNewUserReward:0,referralMinimumSpend:50,
  referralQualificationDays:30,referralMonthlyCap:0,firstTransactionReward:0,welcomeReward:0,minimumTransaction:0
};

export default function GrowthCenterPage(){
 const [config,setConfig]=useState(defaults); const [campaigns,setCampaigns]=useState<Campaign[]>([]); const [dash,setDash]=useState<Dashboard|null>(null);
 const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [message,setMessage]=useState('');
 const [form,setForm]=useState({id:'',name:'',code:'',type:'promo',active:true,rewardAmount:0,minimumTransaction:0,service:'',audience:'all',budget:0,startAt:'',endAt:''});
 const call=async(name:string,data:any={})=>(await httpsCallable<any,any>(functions,name)(data)).data;
 const load=async()=>{setLoading(true);setMessage('');try{const [c,cs,d]=await Promise.all([call('getGrowthConfig'),call('listGrowthCampaigns'),call('getGrowthDashboard')]);setConfig({...defaults,...c});setCampaigns(cs.campaigns||[]);setDash(d);}catch(_){setMessage('Could not load Growth Center.')}finally{setLoading(false)}};
 useEffect(()=>{load()},[]);
 const saveConfig=async()=>{setSaving(true);try{await call('saveGrowthConfig',config);setMessage('Growth settings saved.')}catch(e:any){setMessage(e?.message||'Only the superadmin can change growth settings.')}finally{setSaving(false)}};
 const saveCampaign=async()=>{if(!form.name.trim()){setMessage('Campaign name is required.');return}setSaving(true);try{await call('saveGrowthCampaign',form);setMessage('Campaign saved.');setForm({id:'',name:'',code:'',type:'promo',active:true,rewardAmount:0,minimumTransaction:0,service:'',audience:'all',budget:0,startAt:'',endAt:''});await load()}catch(e:any){setMessage(e?.message||'Could not save campaign.')}finally{setSaving(false)}};
 const edit=(c:Campaign)=>setForm({...form,...c,startAt:c.startAt?.toDate?c.startAt.toDate().toISOString().slice(0,16):(c.startAt||''),endAt:c.endAt?.toDate?c.endAt.toDate().toISOString().slice(0,16):(c.endAt||'')});
 const remove=async(id:string)=>{if(!confirm('Delete this campaign?'))return;try{await call('deleteGrowthCampaign',{id});await load()}catch(_){setMessage('Could not delete campaign.')}}
 const money=(key:keyof GrowthConfig)=><input type="number" min="0" step="0.01" value={Number(config[key])||0} onChange={e=>setConfig(p=>({...p,[key]:Number(e.target.value)||0}))} className="mt-2 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 text-sm"/>;
 const f=(key:string)=>(e:any)=>setForm(p=>({...p,[key]:e.target.type==='checkbox'?e.target.checked:e.target.value}));
 return <div className="space-y-6">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">Growth Center</h1><p className="mt-1 text-sm text-[var(--color-ink-soft)]">Acquisition, referrals, rewards, promo campaigns and conversion tracking.</p></div><button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-line)] px-4 py-2 text-sm font-bold"><RefreshCw size={16}/>Refresh</button></div>
  {message&&<div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] p-3 text-sm">{message}</div>}
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">{dash&&Object.entries({Users:dash.users,Customers:dash.customers,'Completed tx':dash.completedTransactions,'Qualified referrals':dash.qualifiedReferrals,'Rewarded referrals':dash.rewardedReferrals,'Pending rewards':dash.pendingRewards,'Active campaigns':dash.activeCampaigns}).map(([k,v])=><div key={k} className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-4"><div className="text-xs text-[var(--color-ink-soft)]">{k}</div><div className="mt-1 text-2xl font-bold">{v}</div></div>)}</div>

  <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
   <div className="flex items-center gap-2"><Gift size={20}/><h2 className="font-bold">Referral program</h2></div>
   <p className="mt-1 text-xs text-[var(--color-ink-soft)]">A referred customer qualifies after successful domestic or international mobile top-ups reach the minimum spend. The referral reward is credited automatically by the backend after verification.</p>
   <label className="mt-4 flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={config.referralEnabled} onChange={e=>setConfig(p=>({...p,referralEnabled:e.target.checked}))}/>Enable referral program</label>
   <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
    <label className="text-sm">Referrer reward{money('referralReward')}</label>
    <label className="text-sm">New-user reward (optional){money('referralNewUserReward')}</label>
    <label className="text-sm">Minimum qualifying top-up spend{money('referralMinimumSpend')}</label>
    <label className="text-sm">Qualification period (days)<input type="number" min="1" max="365" step="1" value={config.referralQualificationDays} onChange={e=>setConfig(p=>({...p,referralQualificationDays:Number(e.target.value)||30}))} className="mt-2 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 text-sm"/></label>
    <label className="text-sm">Monthly reward cap (0 = unlimited)<input type="number" min="0" step="1" value={config.referralMonthlyCap} onChange={e=>setConfig(p=>({...p,referralMonthlyCap:Number(e.target.value)||0}))} className="mt-2 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 text-sm"/></label>
   </div>
   <button onClick={saveConfig} disabled={loading||saving} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Save size={16}/>{saving?'Saving…':'Save referral settings'}</button>
   <div className="mt-5 grid gap-3 md:grid-cols-3">
    <div className="rounded-xl border border-[var(--color-line)] p-3"><div className="text-xs text-[var(--color-ink-soft)]">Qualification</div><div className="mt-1 font-bold">Invite → Register → RM{Number(config.referralMinimumSpend||50).toFixed(0)} top-up spend</div></div>
    <div className="rounded-xl border border-[var(--color-line)] p-3"><div className="text-xs text-[var(--color-ink-soft)]">Reward</div><div className="mt-1 font-bold">RM{Number(config.referralReward||5).toFixed(2)} automatically credited</div></div>
    <div className="rounded-xl border border-[var(--color-line)] p-3"><div className="text-xs text-[var(--color-ink-soft)]">Protection</div><div className="mt-1 font-bold">One reward per referred customer + deadline + backend idempotency</div></div>
   </div>
  </section>

  <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
   <div className="flex items-center gap-2"><TicketPercent size={20}/><h2 className="font-bold">Promo & acquisition campaigns</h2></div>
   <p className="mt-1 text-xs text-[var(--color-ink-soft)]">Campaign definitions are ready for attribution and future checkout enforcement. Keep rewards within your approved marketing budget.</p>
   <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
    <input placeholder="Campaign name" value={form.name} onChange={f('name')} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 text-sm"/>
    <input placeholder="Promo code (optional)" value={form.code} onChange={f('code')} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 text-sm"/>
    <select value={form.type} onChange={f('type')} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 text-sm"><option value="promo">Promo</option><option value="referral">Referral</option><option value="acquisition">Acquisition</option></select>
    <input placeholder="Service (optional)" value={form.service} onChange={f('service')} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 text-sm"/>
    <input type="number" min="0" step="0.01" placeholder="Reward RM" value={form.rewardAmount} onChange={f('rewardAmount')} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 text-sm"/>
    <input type="number" min="0" step="0.01" placeholder="Minimum transaction RM" value={form.minimumTransaction} onChange={f('minimumTransaction')} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 text-sm"/>
    <input type="number" min="0" step="0.01" placeholder="Budget RM" value={form.budget} onChange={f('budget')} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 text-sm"/>
    <input placeholder="Audience e.g. Malaysia new users" value={form.audience} onChange={f('audience')} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 text-sm"/>
    <input type="datetime-local" value={form.startAt} onChange={f('startAt')} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 text-sm"/>
    <input type="datetime-local" value={form.endAt} onChange={f('endAt')} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 text-sm"/>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={f('active')}/>Active</label>
    <div className="flex gap-2"><button onClick={saveCampaign} disabled={saving} className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white">Save campaign</button>{form.id&&<button onClick={()=>setForm({id:'',name:'',code:'',type:'promo',active:true,rewardAmount:0,minimumTransaction:0,service:'',audience:'all',budget:0,startAt:'',endAt:''})} className="rounded-xl border px-4 py-2 text-sm">Cancel</button>}</div>
   </div>
   <div className="mt-6 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-[var(--color-line)]"><th className="p-2">Campaign</th><th className="p-2">Code</th><th className="p-2">Type</th><th className="p-2">Reward</th><th className="p-2">Status</th><th className="p-2"></th></tr></thead><tbody>{campaigns.map(c=><tr key={c.id} className="border-b border-[var(--color-line)]"><td className="p-2 font-semibold">{c.name}</td><td className="p-2">{c.code||'—'}</td><td className="p-2">{c.type}</td><td className="p-2">RM {Number(c.rewardAmount||0).toFixed(2)}</td><td className="p-2">{c.active?'Active':'Paused'}</td><td className="p-2 text-right"><button onClick={()=>edit(c)} className="mr-2 underline">Edit</button><button onClick={()=>remove(c.id)} className="inline-flex items-center gap-1 text-red-600"><Trash2 size={14}/>Delete</button></td></tr>)}</tbody></table>{!campaigns.length&&<div className="p-6 text-center text-sm text-[var(--color-ink-soft)]">No campaigns yet.</div>}</div>
  </section>

  <div className="grid gap-4 md:grid-cols-3"><div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5"><Users size={20}/><h3 className="mt-3 font-bold">Referral loop</h3><p className="mt-1 text-sm text-[var(--color-ink-soft)]">Invite → register → qualifying top-up → automatic wallet credit.</p></div><div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5"><Megaphone size={20}/><h3 className="mt-3 font-bold">Campaign channels</h3><p className="mt-1 text-sm text-[var(--color-ink-soft)]">Use banners, announcements and push campaigns with campaign codes.</p></div><div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5"><TrendingUp size={20}/><h3 className="mt-3 font-bold">Measure conversion</h3><p className="mt-1 text-sm text-[var(--color-ink-soft)]">Monitor registered, qualified and rewarded referrals before scaling spend.</p></div></div>
 </div>
}
