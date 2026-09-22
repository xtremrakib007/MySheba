// Superadmin view of the prepaid recharge PIN (e-PIN) inventory.
//
// The codes themselves are never readable from a client — firestore.rules
// denies every read of rechargePins. Everything here goes through the Cloud
// Functions in functions/rechargePinService.js: stock comes back as counts,
// and uploads are validated and de-duplicated server-side.

import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';

export interface PinStockRow {
  country: string;
  operator: string;
  denomination: number;
  currency: string;
  available: number;
  expired: number;
}

export interface UploadResult {
  added: number;
  duplicates: number;
  batchId: string;
}

export interface PinUploadInput {
  country: string;
  operator: string;
  currency: string;
  denomination: number;
  /** ISO date; the whole batch expires then. */
  expiresAt?: string | null;
  pins: { pin: string; serial?: string }[];
}

/**
 * Parses pasted lines into PIN entries. One PIN per line, with an optional
 * serial after a comma, semicolon, tab or space — the shape operator PIN
 * files usually come in.
 */
export function parsePinLines(text: string): { pin: string; serial?: string }[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [pin, serial] = line.split(/[,;\t]|\s{2,}/).map((part) => part.trim());
      return serial ? { pin, serial } : { pin };
    })
    .filter((entry) => Boolean(entry.pin));
}

export async function fetchPinStock(): Promise<PinStockRow[]> {
  const { data } = await httpsCallable(functions, 'rechargePinStock')({});
  const rows = (data as { rows?: PinStockRow[] })?.rows;
  return Array.isArray(rows) ? rows : [];
}

export async function uploadPins(input: PinUploadInput): Promise<UploadResult> {
  const { data } = await httpsCallable(functions, 'uploadRechargePins')(input);
  return data as UploadResult;
}
