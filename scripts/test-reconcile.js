#!/usr/bin/env node
'use strict';

/**
 * Settling transactions whose provider outcome was never confirmed.
 *
 * When a provider call fails ambiguously, walletService marks the transaction
 * `unknown` and deliberately neither refunds nor retries: the response may have
 * been lost AFTER the provider delivered, so refunding would pay out twice and
 * retrying would recharge twice. That is correct.
 *
 * What was missing was the other half. reconcileUnknownTransaction has existed
 * in functions/transactionService.js since the guard was written, and nothing
 * called it - not the app, not the admin console - so every one of these sat
 * permanently stuck with the customer's wallet already charged and no way for
 * anyone to finish the job.
 *
 * These checks hold that surface in place, because the failure is silent: the
 * money is taken and nobody sees a stack trace.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let failed = 0;
function check(name, condition, detail) {
  if (condition) console.log(`  ok   ${name}`);
  else { failed += 1; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

console.log('\nThe callable is reachable from a human surface');

const clientService = read('src/firebase/transactionService.js');
check(
  'the app can call reconcileUnknownTransaction',
  // Named through callWithSessionProof now rather than httpsCallable directly,
  // so the call is checked by the name it sends, not by the helper it uses.
  /callWithSessionProof\('reconcileUnknownTransaction'/.test(clientService)
);
check(
  'and can list the transactions needing it',
  /where\('status', '==', 'unknown'\)/.test(clientService)
);

const sidebar = read('src/components/Sidebar.js');
const app = read('App.js');
check('a screen is reachable from the sidebar', /key: 'reconcileTransactions'/.test(sidebar));
check('and App.js renders it', /renderedScreen === 'reconcileTransactions'/.test(app));
check('the screen file exists', fs.existsSync(path.join(ROOT, 'src/screens/ReconcileTransactionsScreen.js')));

console.log('\nThe backend still guards the money');

const backend = read('functions/transactionService.js');
// Settling refunds or confirms a charge, so finance settles it too - that is
// the role whose job this is. Asserting the named list rather than a literal
// array in one gate: there are two gates, and the point is that they agree.
check('finance, admin and superadmin may settle',
  /const RECONCILE_ROLES = \['finance', 'admin', 'superadmin'\]/.test(backend)
  && (backend.match(/RECONCILE_ROLES/g) || []).length >= 3);
// And no further: a dealer or a reseller settling their own uncertain order
// would be marking their own homework against the customer's wallet.
check('and nobody else', !/RECONCILE_ROLES = \[[^\]]*(dealer|reseller|support|customer)/.test(backend));
check('only an unknown transaction may be settled', /Only unknown transactions can be reconciled/.test(backend));
check('the outcome is limited to completed or failed', /\['completed', 'failed'\]\.includes\(outcome\)/.test(backend));
check('a provider reference is required', /Provider confirmation\/reference is required/.test(backend));
check(
  'a refund cannot be paid twice',
  /rejectionRefunded === true \|\| order\.apiRefunded === true/.test(backend)
);
check('settling as failed refunds the wallet', /walletBalance: nextBalance/.test(backend));
check('and records who did it', /reconciledBy: currentActor\.uid/.test(backend));

console.log('\nA stale session is refreshed, not handed back to the user');
// "This admin device session is no longer active. Please sign in again. [403]"
// on a signed-in admin. getSessionProof repairs only a MISSING session, so a
// stale one - signing in anywhere else rotates activeSessionId - was sent,
// refused, and never retried.
const client = read('src/firebase/transactionService.js');
const sessions = read('src/firebase/deviceSessionService.js');
check('both refund paths refresh and retry once',
  (client.match(/callWithSessionProof\('(reconcileUnknownTransaction|rejectTransaction)'/g) || []).length === 2);
check('the retry clears the cached repair, which holds the refused id',
  /repairPromise = null;\n  const sessionId = await repairSessionProof\(\)/.test(sessions));
check('and only a session refusal is retried, not any failure',
  /isSessionRejection/.test(sessions)
  && /if \(!isSessionRejection\(error\)\) throw error;/.test(sessions));

console.log('\nThe client refuses a decision it cannot justify');

// These run before the callable, so a mistake never reaches the money path.
const fn = clientService.slice(clientService.indexOf('export async function reconcileUnknownTransaction'));
const body = fn.slice(0, fn.indexOf('\n}') + 2);
check('an unknown outcome is rejected', /\['completed', 'failed'\]\.includes\(outcome\)/.test(body));
check('an empty provider reference is rejected', /if \(!reference\) throw/.test(body));
// The proof is attached by the helper, which also refreshes it once if the
// backend refuses it - what getSessionProof alone never did.
check('the session proof is attached', /callWithSessionProof\(/.test(body));

console.log('\nThe screen makes the consequence explicit');

const screen = read('src/screens/ReconcileTransactionsScreen.js');
check('both outcomes are confirmed before sending', /Alert\.alert\(\s*outcome === 'completed' \? 'Confirm delivery'/.test(screen));
check('the refund amount is named in the question', /refund \$\{amount\.toFixed\(2\)\}/.test(screen));
check('the customer is identified', /customerPhone \|\| item\.customerId/.test(screen));
check("the provider's own error is shown", /apiExecution\?\.error/.test(screen));
check(
  'a provider-reported success is flagged, since that one is probably delivered',
  /providerSucceeded === true/.test(screen)
);

console.log('');
if (failed) {
  console.error(`${failed} check(s) failed.`);
  process.exit(1);
}
console.log('Uncertain transactions can be settled by a human, with the money guarded.');
