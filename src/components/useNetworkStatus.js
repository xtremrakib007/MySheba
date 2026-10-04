import { useEffect, useRef, useState } from 'react';
import * as apiProviderService from '../firebase/apiProviderService';

/**
 * The interruption notice for whatever the customer has selected, or ''.
 *
 * Shared by the steps that know a product code, so the one rule that matters -
 * that this never blocks anything - is in one place. The hook returns a string
 * and nothing else: there is no status to branch on, no "blocked" to check, and
 * so no way for a caller to accidentally turn a warning into a gate.
 *
 * `active` is the step gate. Asking from a step where the product is not chosen
 * yet would warn about the wrong thing, or about nothing.
 */
export function useNetworkStatus({ service, country, provider, operator, productCode, active }) {
  const [notice, setNotice] = useState('');
  const key = active && country && (provider || operator)
    ? JSON.stringify({ service, country, provider: provider || '', operator: operator || '', productCode: productCode || '' })
    : '';
  const askedFor = useRef('');

  useEffect(() => {
    let alive = true;
    if (!key) {
      askedFor.current = '';
      setNotice('');
      return () => { alive = false; };
    }
    if (askedFor.current === key) return () => { alive = false; };
    askedFor.current = key;
    apiProviderService.getNetworkStatus(JSON.parse(key)).then((result) => {
      // Compared against the ref rather than trusting `alive` alone: a reply
      // for the operator the customer has just moved away from would otherwise
      // post a warning about the wrong one.
      if (alive && askedFor.current === key) setNotice(result.notice || '');
    });
    return () => { alive = false; };
  }, [key]);

  return notice;
}
