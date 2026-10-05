// Invoices: raising one, deciding one, and reading the history.
//
// Every one of these is a callable. Nothing here writes Firestore directly,
// because firestore.rules closes every client write to invoices - a client that
// could write one could approve its own, which is the one thing the record
// exists to prevent.
//
// Mirrors src/firebase/invoiceService.js in the app. Both call the same four
// functions, so the two stay in step by calling rather than by copying rules.
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';

export type InvoiceKind = 'investment' | 'providerPayment';
export type InvoiceStatus = 'pending' | 'approved' | 'rejected';

export interface Invoice {
  id: string;
  number: string;
  kind: InvoiceKind | '';
  party: string;
  amount: number;
  currency: string;
  reference: string;
  notes: string;
  status: InvoiceStatus | '';
  createdBy: string;
  createdByName: string;
  createdByRole: string;
  createdAt: number | null;
  approvedBy: string;
  approvedByName: string;
  approvedByRole: string;
  approvedAt: number | null;
  decisionNote: string;
}

export const INVOICE_KINDS: { key: InvoiceKind; label: string }[] = [
  { key: 'investment', label: 'Investment' },
  { key: 'providerPayment', label: 'Provider payment' },
];

export function invoiceKindLabel(kind: string): string {
  return INVOICE_KINDS.find((k) => k.key === kind)?.label ?? kind ?? '';
}

const createFn = httpsCallable(functions, 'createInvoice');
const approveFn = httpsCallable(functions, 'approveInvoice');
const rejectFn = httpsCallable(functions, 'rejectInvoice');
const listFn = httpsCallable(functions, 'listInvoices');
const documentFn = httpsCallable(functions, 'getInvoiceDocument');

export interface NewInvoice {
  kind: InvoiceKind;
  party: string;
  amount: string | number;
  currency: string;
  reference?: string;
  notes?: string;
}

export async function createInvoice(input: NewInvoice): Promise<{ id: string; number: string }> {
  const { data } = await createFn(input);
  return data as { id: string; number: string };
}

export async function approveInvoice(invoiceId: string, note = ''): Promise<void> {
  await approveFn({ invoiceId, note });
}

// The server refuses a rejection with no reason, so the screen collects one
// rather than letting the call fail.
export async function rejectInvoice(invoiceId: string, note: string): Promise<void> {
  await rejectFn({ invoiceId, note });
}

export async function listInvoices(kind = '', limit = 50): Promise<Invoice[]> {
  const { data } = await listFn({ kind, limit });
  return ((data as { invoices?: Invoice[] })?.invoices) ?? [];
}

/**
 * Open one invoice as a printable sheet.
 *
 * The HTML comes from the server, built from the stored record - see
 * functions/invoiceDocument.js. The browser's own print dialog is what turns
 * it into paper or a PDF, which is also why there is no PDF library here:
 * "Save as PDF" is a destination in that dialog on every desktop browser.
 */
export async function openInvoiceDocument(invoiceId: string): Promise<void> {
  if (!invoiceId) throw new Error('That invoice is no longer available.');
  // Opened before the await. A window.open() that happens after one is not
  // tied to the click any more, and pop-up blockers refuse it.
  const win = window.open('', '_blank');
  if (!win) throw new Error('Allow pop-ups for this site to print an invoice.');
  try {
    const { data } = await documentFn({ invoiceId });
    const html = (data as { html?: string })?.html;
    if (!html) throw new Error('That invoice could not be prepared.');
    win.document.write(html);
    win.document.close();
    // Let the sheet lay out before the dialog covers it, so what they see
    // behind the preview is the invoice and not a blank page.
    win.setTimeout(() => win.print(), 250);
  } catch (err) {
    win.close();
    throw err;
  }
}
