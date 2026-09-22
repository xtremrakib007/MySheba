import {
  collection, query, where, orderBy, limit, getDocs, getCountFromServer, Timestamp,
} from 'firebase/firestore';
import { db } from './config';

const DAY_MS = 24 * 60 * 60 * 1000;
const MODULES = {
};
// Report kinds are keyed the same way MODULES is - the modules that filed
// reports have been retired, so there is nothing left to count, but
// getReportStats below still needs the map to exist.
const REPORT_KINDS = {
};
async function countOf(collectionName, ...constraints) { const snap = await getCountFromServer(query(collection(db, collectionName), ...constraints)); return snap.data().count; }
async function getModuleStats() { const entries = await Promise.all(Object.entries(MODULES).map(async ([key,cfg]) => { const weekAgo=Timestamp.fromMillis(Date.now()-7*DAY_MS); const [total,active,closed,newThisWeek]=await Promise.all([countOf(cfg.collection),countOf(cfg.collection,where('status','==','active')),cfg.closedStatus?countOf(cfg.collection,where('status','==',cfg.closedStatus)):Promise.resolve(0),countOf(cfg.collection,where('createdAt','>=',weekAgo))]); return [key,{...cfg,total,active,closed,newThisWeek}]; })); return Object.fromEntries(entries); }
async function getUserStats() { const roles=['customer','dealer','reseller','admin','superadmin']; const [total,verified,...byRole]=await Promise.all([countOf('users'),countOf('users',where('verified','==',true)),...roles.map(r=>countOf('users',where('role','==',r)))]); return {total,verified,byRole:Object.fromEntries(roles.map((r,i)=>[r,byRole[i]]))}; }
async function getReportStats() { const kinds=Object.entries(REPORT_KINDS); const counts=await Promise.all(kinds.map(([,cfg])=>countOf(cfg.collection))); const resolved=await Promise.all(kinds.map(([,cfg])=>countOf(cfg.collection,where('status','==','resolved')))); const byKind=kinds.map(([kind,cfg],i)=>({kind,label:cfg.label,total:counts[i],open:counts[i]-resolved[i]})); return {total:counts.reduce((a,b)=>a+b,0),open:byKind.reduce((a,k)=>a+k.open,0),byKind}; }
async function getWeeklyTrend() { const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-(6-i));return d;}); const totals=days.map(()=>0),weekStart=Timestamp.fromMillis(days[0].getTime()); await Promise.all(Object.values(MODULES).map(async cfg=>{const snap=await getDocs(query(collection(db,cfg.collection),where('createdAt','>=',weekStart),orderBy('createdAt','asc'),limit(500))); snap.forEach(d=>{const ts=d.data().createdAt;if(!ts?.seconds)return;const dayIdx=Math.floor((ts.seconds*1000-weekStart.toMillis())/DAY_MS);if(dayIdx>=0&&dayIdx<7)totals[dayIdx]+=1;});})); return days.map((d,i)=>({label:d.toLocaleDateString(undefined,{weekday:'short'}),count:totals[i]})); }
export async function getDashboard() { const [modules,users,reports,reviews,trend,topCategories,conversations]=await Promise.all([getModuleStats().catch(()=>({})),getUserStats().catch(()=>({total:0,verified:0,byRole:{}})),getReportStats().catch(()=>({total:0,open:0,byKind:[]})),Promise.resolve({count:0,avg:0}),getWeeklyTrend().catch(()=>[]),Promise.resolve([]),countOf('chats').catch(()=>0)]); return {modules,users,reports,reviews,trend,topCategories,conversations}; }
