#!/usr/bin/env node
/**
 * A top-up is verified by one step and paid by another.
 *
 * The whole point of splitting approveTopup in two is that verifying does
 * not move money - finance confirms the payment arrived, an admin releases
 * it. If verifyTopup ever writes walletBalance the split is decorative: one
 * person would again be able to credit a wallet alone, and the second
 * signature on the record would mean nothing.
 *
 * These are read out of the deployed source rather than asserted against a
 * copy of it, so the checks fail if the functions change underneath them.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const review = fs.readFileSync(path.join(ROOT, 'functions', 'secureTopupReview.js'), 'utf8');
const instant = fs.readFileSync(path.join(ROOT, 'functions', 'adminTopUpService.js'), 'utf8');

/** The body of one exported callable. */
function body(src, name) {
  const start = src.indexOf(`exports.${name} = onCall(`);
  if (start < 0) return null;
  const after = src.slice(start + 10);
  const next = after.search(/\nexports\.[a-zA-Z]+ = onCall\(/);
  return next < 0 ? after : after.slice(0, next);
}

function roleList(src, name) {
  const m = src.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`));
  return m ? m[1].split(',').map((r) => r.trim().replace(/'/g, '')).filter(Boolean) : null;
}

let failed = 0;
const is = (label, got, want) => {
  const g = JSON.stringify(got); const w = JSON.stringify(want);
  if (g === w) { console.log(`  ok    ${label}`); return; }
  failed += 1;
  console.error(`  FAIL  ${label}\n          got ${g}, want ${w}`);
};
const has = (label, hay, needle, want = true) => {
  const got = hay != null && hay.includes(needle);
  if (got === want) { console.log(`  ok    ${label}`); return; }
  failed += 1;
  console.error(`  FAIL  ${label}\n          ${want ? 'expected' : 'did NOT expect'} ${JSON.stringify(needle)}`);
};

const verify = body(review, 'verifyTopup');
const complete = body(review, 'completeTopup');
const approve = body(review, 'approveTopup');

console.log('Who may do what:');
is('only a superadmin can add money directly', roleList(instant, 'INSTANT_TOPUP_ROLES'), ['superadmin']);
is('an admin or superadmin completes', roleList(review, 'COMPLETER_ROLES'), ['admin', 'superadmin']);

console.log('\nVerifying must not move money:');
if (!verify) { failed += 1; console.error('  FAIL  verifyTopup is not exported'); }
has('verifyTopup does not write walletBalance', verify, 'walletBalance', false);
has('verifyTopup requires a pending request', verify, "status !== 'pending'");
has('verifyTopup records who verified', verify, 'verifiedBy');
has('verifyTopup sets the verified status', verify, "status: 'verified'");

console.log('\nCompleting is the step that pays:');
if (!complete) { failed += 1; console.error('  FAIL  completeTopup is not exported'); }
has('completeTopup writes walletBalance', complete, 'walletBalance');
has('completeTopup refuses anything not verified', complete, "status !== 'verified'");
has('completeTopup records who completed', complete, 'completedBy');
has('completeTopup checks the completer roles', complete, 'COMPLETER_ROLES');
has('completeTopup keeps approved as the terminal status', complete, "status: 'approved'");

console.log('\nThe one-step path is superadmin only, and records both actors:');
has('approveTopup requires superadmin', approve, "caller.role !== 'superadmin'");
has('approveTopup records a verifier', approve, 'verifiedBy');
has('approveTopup records a completer', approve, 'completedBy');

console.log('\nBoth callables are actually exported to the app:');
for (const entry of ['index.js', 'secureIndexV2.js']) {
  const src = fs.readFileSync(path.join(ROOT, 'functions', entry), 'utf8');
  has(`${entry} exports verifyTopup`, src, 'verifyTopup');
  has(`${entry} exports completeTopup`, src, 'completeTopup');
}

console.log(failed ? `\n${failed} failure(s).` : '\nTop-up flow: all checks pass.');
process.exit(failed ? 1 : 0);
