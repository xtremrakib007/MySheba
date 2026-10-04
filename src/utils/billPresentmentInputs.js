// When there is enough on screen to ask the provider to read a bill, and what
// to send when there is.
//
// Lifted out of the step so the "enough" part can be stated once. It differs by
// biller and getting it wrong is not silent-but-harmless: asking JomPAY before
// the amount is typed returns "The provided amount is invalid", which would put
// a validation error on screen for a field the customer has not reached yet.
//
// Returns null when it is too early, which is the normal state for most of the
// flow.

/** Billers that need more than an account number before a bill can be read. */
const NEEDS_AMOUNT = new Set(['jompay']);

export function presentmentRequest(serviceData) {
  const d = serviceData || {};
  const country = String(d.country || '').trim().toUpperCase();
  const provider = String(d.provider || '').trim();
  const accountNumber = String(d.accountNumber || '').trim();
  if (!country || !provider || !accountNumber) return null;

  const category = String(d.category || '').trim().toLowerCase();
  const amount = Number(d.amount);
  const hasAmount = Number.isFinite(amount) && amount > 0;

  if (NEEDS_AMOUNT.has(category)) {
    const billerCode = String(d.billerCode || '').trim();
    // JomPAY validates the biller code and the amount alongside the account,
    // so all three have to be there before the question means anything.
    if (!billerCode || !hasAmount) return null;
    const ref2 = String(d.ref2 || '').trim();
    return { country, provider, accountNumber, billerCode, ...(ref2 ? { ref2 } : {}), amount };
  }

  // Everything else is read from the account number alone. The amount is
  // deliberately NOT sent: it is what we are hoping to be told, and sending a
  // half-typed one invites "The provided amount is invalid" instead of a bill.
  return { country, provider, accountNumber };
}

/** A stable key for one request, so the same question is not asked twice. */
export function presentmentKey(request) {
  return request ? JSON.stringify(request) : '';
}
