// Invoices: raising one, deciding one, and reading the history.
//
// Every one of these is a callable. Nothing here writes Firestore directly,
// because firestore.rules closes every client write to invoices - a client that
// could write one could approve its own, which is the one thing the record
// exists to prevent.
import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

const createFn = httpsCallable(functions, 'createInvoice');
const approveFn = httpsCallable(functions, 'approveInvoice');
const rejectFn = httpsCallable(functions, 'rejectInvoice');
const listFn = httpsCallable(functions, 'listInvoices');
const documentFn = httpsCallable(functions, 'getInvoiceDocument');

export const INVOICE_KINDS = [
  { key: 'investment', label: 'Investment' },
  { key: 'providerPayment', label: 'Provider payment' },
];

export function invoiceKindLabel(kind) {
  const found = INVOICE_KINDS.find((k) => k.key === kind);
  return found ? found.label : kind || '';
}

export async function createInvoice({ kind, party, amount, currency, reference, notes }) {
  const { data } = await createFn({ kind, party, amount, currency, reference, notes });
  return data;
}

export async function approveInvoice(invoiceId, note) {
  const { data } = await approveFn({ invoiceId, note: note || '' });
  return data;
}

// The server refuses a rejection with no reason, so the screen asks for one
// rather than letting the call fail.
export async function rejectInvoice(invoiceId, note) {
  const { data } = await rejectFn({ invoiceId, note });
  return data;
}

export async function listInvoices({ kind, limit } = {}) {
  const { data } = await listFn({ kind: kind || '', limit: limit || 50 });
  return data?.invoices || [];
}

/**
 * The invoice as a printable sheet.
 *
 * The HTML is built on the server from the stored record
 * (functions/invoiceDocument.js), so the sheet printed from a phone and the
 * one printed from the admin site are the same document.
 */
export async function getInvoiceDocument(invoiceId) {
  if (!invoiceId) throw new Error('That invoice is no longer available.');
  const { data } = await documentFn({ invoiceId });
  if (!data?.html) throw new Error('That invoice could not be prepared.');
  return data;
}
