import { collection, getDocs, limit, onSnapshot, orderBy, query, where, type DocumentData } from 'firebase/firestore';
import { db } from '../firebase/config';
import type { AdminUserRow } from './userManagementService';
import { filterBySearch } from './userManagementService';

export interface InvestigationTransaction {
  id: string;
  service: string;
  amount: number;
  total: number;
  status: string;
  approved: boolean;
  rejected: boolean;
  customerId: string | null;
  createdAt: string | null;
}

export interface InvestigationTicket {
  id: string;
  subject: string;
  message: string;
  status: string;
  userId: string | null;
  createdAt: string | null;
}

export interface InvestigationLog {
  id: string;
  type: 'activity' | 'audit';
  summary: string;
  createdAt: string | null;
  raw: Record<string, unknown>;
}

function dateValue(v: unknown): string | null {
  if (v && typeof (v as { toDate?: () => Date }).toDate === 'function') return (v as { toDate: () => Date }).toDate().toLocaleString();
  return typeof v === 'string' ? v : null;
}

function userFromDoc(d: { id: string; data: () => DocumentData }): AdminUserRow {
  const data = d.data();
  return {
    uid: d.id,
    name: data.name ?? data.displayName ?? '(no name)',
    email: data.email ?? null,
    phone: data.phone ?? data.phoneNumber ?? null,
    role: data.role ?? 'user',
    disabled: Boolean(data.disabled),
    dealerCode: data.dealerCode,
    resellerCode: data.resellerCode,
    features: { mobileBanking: true, recharge: true, remittance: true, travel: true, marketplace: true, ticketReseller: false, ...(data.features ?? {}) },
  };
}

export async function searchInvestigationUsers(term: string): Promise<AdminUserRow[]> {
  const snap = await getDocs(query(collection(db, 'users'), orderBy('name'), limit(500)));
  return filterBySearch(snap.docs.map(userFromDoc), term).slice(0, 50);
}

export async function getInvestigationTransactions(uid: string): Promise<InvestigationTransaction[]> {
  try {
    const snap = await getDocs(query(collection(db, 'transactions'), where('customerId', '==', uid), orderBy('createdAt', 'desc'), limit(100)));
    return snap.docs.map(d => { const x=d.data(); return { id:d.id, service:x.service??'', amount:Number(x.amount??0), total:Number(x.total??0), status:x.status??'pending', approved:x.approved===true, rejected:x.rejected===true, customerId:x.customerId??null, createdAt:dateValue(x.createdAt) }; });
  } catch (err) { console.warn('Investigation transaction query failed', err); return []; }
}

export async function getInvestigationTickets(uid: string): Promise<InvestigationTicket[]> {
  try {
    const snap = await getDocs(query(collection(db, 'supportTickets'), where('userId', '==', uid), limit(100)));
    return snap.docs.map(d => { const x=d.data(); return { id:d.id, subject:x.subject??'(no subject)', message:x.message??'', status:x.status??'open', userId:x.userId??null, createdAt:dateValue(x.createdAt) }; }).sort((a,b)=>(b.createdAt??'').localeCompare(a.createdAt??''));
  } catch (err) { console.warn('Investigation ticket query failed', err); return []; }
}

function matchesUid(data: Record<string, unknown>, uid: string): boolean {
  return Object.values(data).some(v => typeof v === 'string' && v === uid);
}
function mapLog(d: { id: string; data: () => DocumentData }, type: 'activity'|'audit'): InvestigationLog | null {
  const x=d.data();
  if (!matchesUid(x,d.__uid ?? '')) return null;
  const preferred = x.action ?? x.event ?? x.type ?? x.message ?? x.description ?? 'Account event';
  return { id:d.id, type, summary:String(preferred), createdAt:dateValue(x.createdAt), raw:x };
}

// Read-only, best-effort investigation history. These collections are superadmin-scoped by the existing rules.
export async function getInvestigationLogs(uid: string): Promise<InvestigationLog[]> {
  const result: InvestigationLog[] = [];
  for (const [name,type] of [['userAuditLog','audit'],['activityLog','activity']] as const) {
    try {
      const snap=await getDocs(query(collection(db,name),orderBy('createdAt','desc'),limit(100)));
      snap.docs.forEach(d=>{const x=d.data();if(matchesUid(x,uid)){const preferred=x.action??x.event??x.type??x.message??x.description??'Account event';result.push({id:d.id,type,summary:String(preferred),createdAt:dateValue(x.createdAt),raw:x});}});
    } catch (err) { console.warn(`Investigation ${name} query failed`, err); }
  }
  return result.sort((a,b)=>(b.createdAt??'').localeCompare(a.createdAt??'')).slice(0,100);
}
