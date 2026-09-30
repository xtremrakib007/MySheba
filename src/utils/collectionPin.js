// The collection PIN, client side.
//
// Keep these in step with functions/transactionService.js, which is the only
// thing that actually decides: it mints the PIN and rejects a completion whose
// PIN does not match. Everything here is so the operator is told the rule
// before they submit rather than after a round trip.
//
// The length is a RANGE, not a fixed number. Remittance mints 10 digits
// because 4 is 10,000 possibilities standing in front of a cash handover, and
// orders placed before that change still carry 4-digit PINs and must still
// complete. A range covers both without the app needing to know which service
// minted which length.
//
// This file exists because the same check was written out three times - in the
// Dealer, Reseller and Admin screens - and a fourth copy is how they drift
// apart. That is not hypothetical in this codebase: a duplicated staff-role
// list is what made device verification impossible to complete.
export const PIN_MIN = 4;
export const PIN_MAX = 12;

export const PIN_PROMPT_TITLE = 'Enter the collection code:';
export const PIN_PROMPT_PLACEHOLDER = `${PIN_MIN}-${PIN_MAX} digit code`;
export const PIN_INVALID_MESSAGE = `Enter the collection code (${PIN_MIN}-${PIN_MAX} digits).`;
export const COLLECTION_PIN_SERVICES = new Set(['Mobile Banking', 'Remittance']);
export function requiresCollectionPin(service) {
  return COLLECTION_PIN_SERVICES.has(String(service || '').trim());
}

/** Whether this is a syntactically valid collection PIN. The server decides
 *  whether it is the RIGHT one. */
export function isValidCollectionPin(pin) {
  return typeof pin === 'string' && new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin);
}
