import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

const reportFn = httpsCallable(functions, 'getLedgerReport');

/**
 * The raw money movements for a date range, plus everyone they mention.
 *
 * Reading other people's top-ups and transfers is what firestore.rules exists
 * to refuse, so this goes through a callable that checks the `reports`
 * capability. Shaping, filtering and the export stay on the client, in
 * src/utils/ledger.js, where they are tested without a network.
 *
 * `truncated` flags a source that hit the per-source cap. A total built from a
 * window that closed early is not wrong so much as short, and the only way a
 * reader can tell is if we say so.
 */
export async function getLedgerReport({ fromMs, toMs, limitPerSource } = {}) {
  const { data } = await reportFn({ fromMs, toMs, limitPerSource });
  return {
    sources: data?.sources || {},
    names: data?.names || {},
    range: data?.range || null,
    truncated: data?.truncated || {},
  };
}
