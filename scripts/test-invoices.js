#!/usr/bin/env node
'use strict';
/**
 * Invoices, and the two names on each one.
 *
 * An invoice is kept so that a payment to a provider, or money put into the
 * business, can be answered for months later. The answer anybody wants is not
 * the amount - that is on the bank statement - it is who decided. So the record
 * carries who raised it and who approved it, each with the moment they did.
 *
 * Which makes one rule load-bearing: the same person cannot do both. Without
 * it the two names are the same name and the record proves nothing it claims
 * to. Most of what follows is that rule, approached from different directions.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const rules = require('../functions/invoiceRules');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (error) { console.error('  FAIL  ' + name + '\n        ' + (error && error.message)); process.exitCode = 1; }
}

console.log('\nWhat counts as an invoice');

test('the two kinds are the two that were asked for', () => {
  assert.deepStrictEqual(rules.INVOICE_KINDS, ['investment', 'providerPayment']);
  for (const kind of rules.INVOICE_KINDS) {
    assert.strictEqual(rules.readInvoice({ kind, party: 'iimmpact', amount: 10 }).ok, true, kind);
  }
  assert.strictEqual(rules.readInvoice({ kind: 'expense', party: 'a', amount: 10 }).ok, false);
  assert.strictEqual(rules.readInvoice({ kind: '', party: 'a', amount: 10 }).ok, false);
});

test('it has to name who it is for', () => {
  // A provider payment with a blank payee cannot be reconciled against
  // anything, which defeats keeping it.
  assert.strictEqual(rules.readInvoice({ kind: 'investment', party: '  ', amount: 10 }).ok, false);
  assert.strictEqual(rules.readInvoice({ kind: 'investment', amount: 10 }).ok, false);
});

test('the amount is a whole number of cents, above zero', () => {
  const ok = (amount) => rules.readInvoice({ kind: 'investment', party: 'a', amount }).ok;
  assert.strictEqual(ok(0.01), true);
  assert.strictEqual(ok(1500.5), true);
  assert.strictEqual(ok('250.25'), true, 'a form sends strings');
  for (const bad of [0, -1, 10.005, NaN, Infinity, null, undefined, '', 'abc', {}, rules.MAX_AMOUNT + 1]) {
    assert.strictEqual(ok(bad), false, 'accepted ' + JSON.stringify(bad));
  }
});

test('money() keeps the value it accepted', () => {
  assert.strictEqual(rules.money(1500.5), 1500.5);
  assert.strictEqual(rules.money('0.07'), 0.07);
  assert.strictEqual(rules.money(10.005), null);
});

test('currency defaults to MYR and must be a code', () => {
  assert.strictEqual(rules.readInvoice({ kind: 'investment', party: 'a', amount: 1 }).invoice.currency, 'MYR');
  assert.strictEqual(rules.readInvoice({ kind: 'investment', party: 'a', amount: 1, currency: 'usd' }).invoice.currency, 'USD');
  assert.strictEqual(rules.readInvoice({ kind: 'investment', party: 'a', amount: 1, currency: 'ringgit' }).ok, false);
});

console.log('\nThe rule the record depends on');

test('nobody approves their own invoice', () => {
  // The whole point. If this passes, both names on the record can be one
  // person and the second one is decoration.
  const invoice = { status: 'pending', createdBy: 'finance-1' };
  const self = rules.approvalDecision({ invoice, actorUid: 'finance-1' });
  assert.strictEqual(self.ok, false);
  assert.ok(/somebody other than the person who raised it/.test(self.reason), self.reason);
});

test('somebody else can', () => {
  assert.strictEqual(rules.approvalDecision({ status: 'x' }).ok, false, 'a non-invoice is not approvable');
  assert.strictEqual(
    rules.approvalDecision({ invoice: { status: 'pending', createdBy: 'finance-1' }, actorUid: 'finance-2' }).ok,
    true);
});

test('a decision cannot be made twice', () => {
  for (const status of ['approved', 'rejected']) {
    const out = rules.approvalDecision({ invoice: { status, createdBy: 'a' }, actorUid: 'b' });
    assert.strictEqual(out.ok, false, status);
    // Named, or the second approver goes hunting for a permission problem.
    assert.ok(out.reason.includes(status), out.reason);
  }
});

test('an unsigned caller decides nothing', () => {
  assert.strictEqual(rules.approvalDecision({ invoice: { status: 'pending', createdBy: 'a' }, actorUid: '' }).ok, false);
  assert.strictEqual(rules.approvalDecision({ invoice: { status: 'pending', createdBy: 'a' } }).ok, false);
});

test('a missing invoice is refused, not treated as approvable', () => {
  assert.strictEqual(rules.approvalDecision({ invoice: null, actorUid: 'b' }).ok, false);
});

console.log('\nInvoice numbers');

test('they are unique-shaped and sorted by year', () => {
  assert.strictEqual(rules.invoiceNumber(2026, 1), 'MSI-2026-00001');
  assert.strictEqual(rules.invoiceNumber(2026, 42), 'MSI-2026-00042');
  assert.ok(rules.invoiceNumber(2026, 2) > rules.invoiceNumber(2026, 1), 'they must sort');
});

test('nonsense gets no number at all', () => {
  for (const [y, n] of [[1999, 1], [2026, 0], [2026, -1], [2026, 1.5], ['x', 1], [2026, 1000000]]) {
    assert.strictEqual(rules.invoiceNumber(y, n), '', y + '/' + n);
  }
});

console.log('\nWhat the service writes, and refuses to');

const service = read('functions/invoiceService.js');

test('both names and both times are server-written', () => {
  // A date the client could choose is not evidence of anything.
  for (const field of ['createdBy', 'createdByName', 'createdByRole', 'approvedBy', 'approvedByName', 'approvedByRole']) {
    assert.ok(new RegExp(field + ':').test(service), field + ' is not recorded');
  }
  assert.ok(/createdAt: admin\.firestore\.FieldValue\.serverTimestamp\(\)/.test(service));
  assert.ok(/approvedAt: admin\.firestore\.FieldValue\.serverTimestamp\(\)/.test(service));
});

test('the self-approval rule is checked inside the transaction', () => {
  // Outside it, two approvers pressing at once both read 'pending' and both
  // win, and the last write silently replaces the first approver's name.
  const decide = /function decide\(action\)[\s\S]*?\n\}/.exec(service);
  assert.ok(decide, 'decide() must be findable');
  const body = decide[0];
  const txAt = body.indexOf('runTransaction');
  const checkAt = body.indexOf('approvalDecision(');
  assert.ok(txAt >= 0 && checkAt > txAt, 'approvalDecision must run inside runTransaction');
  assert.ok(body.indexOf('tx.get(ref)') < checkAt, 'and against a document read inside it');
});

test('approve and reject share one implementation', () => {
  // Two copies is how one of them ends up without the self-approval check.
  assert.ok(/exports\.approveInvoice = decide\('approved'\)/.test(service));
  assert.ok(/exports\.rejectInvoice = decide\('rejected'\)/.test(service));
});

test('raising one needs finance, and reading allows reports', () => {
  // Scoped to each callable's own body: searching the whole file matched
  // decide()'s capability check, so dropping createInvoice's changed nothing.
  const create = /exports\.createInvoice = onCall\([\s\S]*?\n\}\);/.exec(service);
  assert.ok(create, 'createInvoice must be findable');
  assert.ok(/actorOf\(db, request, 'finance'\)/.test(create[0]), 'raising must need finance');

  const decide = /function decide\(action\)[\s\S]*?\n\}/.exec(service);
  assert.ok(/actorOf\(db, request, 'finance'\)/.test(decide[0]), 'deciding must need finance');

  const list = /exports\.listInvoices = onCall\([\s\S]*?\n\}\);/.exec(service);
  assert.ok(list, 'listInvoices must be findable');
  assert.ok(/actorOf\(db, request, 'reports'\)/.test(list[0]), 'reading must also allow reports');
  // And reading must not be the only thing finance can do with it.
  assert.ok(/actorOf\(db, request, 'finance'\)/.test(list[0]), 'finance reads it too');
});

test('a rejection has to say why', () => {
  assert.ok(/action === 'rejected' && !note/.test(service),
    'a rejection with no reason tells the person who raised it nothing');
});

test('the number comes from a counter, not a count', () => {
  // Counting the collection hands the same number to two people raising an
  // invoice in the same second.
  assert.ok(/async function nextNumber\(tx, db, year\)/.test(service));
  assert.ok(/tx\.get\(ref\)/.test(service));
  assert.ok(!/\.count\(\)/.test(service), 'a count would not be unique');
});

console.log('\nNobody writes an invoice from a client');

test('the rules close every write', () => {
  const text = read('firestore.rules');
  const line = text.split('\n').find((l) => l.includes('match /invoices/{id}'));
  assert.ok(line, 'the invoices rule must exist');
  assert.ok(/allow create, update, delete: if false;/.test(line),
    'a client that could write here could approve its own invoice');
  assert.ok(/allow read: if activeProfile\(\) && \(can\('finance'\) \|\| can\('reports'\)\)/.test(line));
  // The counter decides invoice numbers; a client that could edit it could
  // reissue one.
  const counter = text.split('\n').find((l) => l.includes('match /counters/{id}'));
  assert.ok(counter && /allow read, write: if false;/.test(counter), 'the counter must be server-only');
});

test('the callables are actually registered', () => {
  const index = read('functions/index.js');
  for (const fn of ['createInvoice', 'approveInvoice', 'rejectInvoice', 'listInvoices']) {
    assert.ok(new RegExp('exports\\.' + fn + ' = require').test(index), fn + ' is not deployed');
  }
});

console.log('\nThe screen reaches it');

test('every staff grid that should have it, has it', () => {
  // The capability tile covers support and finance. Admin and superadmin read
  // their own arrays instead, and the superadmin one was missed - the feature
  // was built, deployed and invisible to the person who owns the system.
  const tiles = read('src/components/serviceTiles.js');
  for (const role of ['admin', 'superadmin']) {
    const block = new RegExp('\\n  ' + role + ': \\[([\\s\\S]*?)\\n  \\],').exec(tiles);
    assert.ok(block, role + ' grid must be findable');
    assert.ok(/kind: 'staffInvoices'/.test(block[1]), role + ' has no Invoices tile');
  }
  // And not where it does not belong: these roles hold no finance capability.
  for (const role of ['dealer', 'reseller']) {
    const block = new RegExp('\\n  ' + role + ': \\[([\\s\\S]*?)\\n  \\],').exec(tiles);
    if (block) assert.ok(!/staffInvoices/.test(block[1]), role + ' must not see Invoices');
  }
});

test('the Admin Features hub lists it, gates it, and routes it', () => {
  // Three separate lists in one file, and a tile added to only the first is a
  // tile that renders and does nothing when tapped.
  const hub = read('src/screens/AdminFeaturesScreen.js');
  assert.ok(/key: 'invoices'[^}]*name: 'Invoices'/.test(hub), 'no hub tile');
  assert.ok(/invoices: \['finance', 'reports'\]/.test(hub), 'no capability gate');
  const routes = /const SCREEN_FEATURES = \[([^\]]*)\]/.exec(hub);
  assert.ok(routes, 'SCREEN_FEATURES must be findable');
  assert.ok(/'invoices'/.test(routes[1]), 'the hub tile leads nowhere');
});

test('the tile exists for finance and for reports', () => {
  const tiles = read('src/components/serviceTiles.js');
  assert.ok(/key: 'invoices'[^}]*kind: 'staffInvoices'[^}]*needs: \['finance', 'reports'\]/.test(tiles),
    'the capability tile must open for finance and reports');
  assert.ok(/invoices: \['finance', 'reports'\]/.test(tiles), 'and for an admin holding either');
});

test('the tile leads somewhere', () => {
  // A tile whose kind nothing routes does nothing when tapped.
  assert.ok(/s\.kind === 'staffInvoices'\) return setScreen\('invoices'\)/.test(read('src/components/ServiceGrid.js')));
  const app = read('App.js');
  assert.ok(/import InvoicesScreen from/.test(app), 'the screen must be imported');
  assert.ok(/renderedScreen === 'invoices' && <InvoicesScreen \/>/.test(app), 'and rendered');
  assert.ok(/staffInvoices: /.test(read('src/components/ServiceArt.js')), 'and have artwork');
});

test('the screen shows both names and both times on every invoice', () => {
  // The reason the record exists. A row that only said "approved" answers
  // nothing anybody asks of a payment later.
  const screen = read('src/screens/InvoicesScreen.js');
  for (const field of ['createdByName', 'createdAt', 'approvedByName', 'approvedAt']) {
    assert.ok(screen.includes(field), 'the screen omits ' + field);
  }
  // Whether the approver's name is shown must depend on the approver's name.
  // Checking only that the field is mentioned somewhere passed when the
  // condition was replaced by a constant - the name still appeared, in the
  // branch that had become unreachable.
  assert.ok(/\{item\.approvedByName \|\| item\.approvedBy\s*\?/.test(screen),
    'the approved-by line must be conditioned on there being an approver');
  assert.ok(/nobody yet/.test(screen), 'an unapproved invoice must say so, not just omit a line');
  assert.ok(/hour: '2-digit', minute: '2-digit'/.test(screen), 'the time matters, not just the date');
});

test('the screen does not offer self-approval', () => {
  // The server refuses it inside the transaction either way; a button that
  // exists only to produce an error is worse than no button.
  const screen = read('src/screens/InvoicesScreen.js');
  assert.ok(/mine \? \(/.test(screen), 'an invoice you raised must take the other branch');
  assert.ok(/somebody else in finance has to approve it/.test(screen), 'and say why');
});

console.log('\nThe admin site reaches it too');

test('the page is routed and gated like the app tile', () => {
  const app = read('admin-web/src/App.tsx');
  assert.ok(/import InvoicesPage from '\.\/pages\/InvoicesPage'/.test(app), 'the page must be imported');
  assert.ok(/<Route path="\/invoices" element=\{<InvoicesPage \/>\} \/>/.test(app), 'and routed');
  const nav = read('admin-web/src/routes/navConfig.ts');
  assert.ok(/'\/invoices': \['finance', 'reports'\]/.test(nav), 'and open to finance and reports');
  assert.ok(/path: '\/invoices'/.test(nav), 'and listed in the navigation');
});

test('the web page shows both names and both times as well', () => {
  // Same reason as the app screen: a row that only said "approved" answers
  // nothing anybody asks of a payment later.
  const page = read('admin-web/src/pages/InvoicesPage.tsx');
  for (const field of ['createdByName', 'createdAt', 'approvedByName', 'approvedAt']) {
    assert.ok(page.includes(field), 'the web page omits ' + field);
  }
  assert.ok(/hour: '2-digit', minute: '2-digit'/.test(page), 'the time matters, not just the date');
  assert.ok(/nobody yet/.test(page), 'an unapproved invoice must say so');
  assert.ok(/invoice\.approvedByName \|\| invoice\.approvedBy\s*\?/.test(page),
    'and that line must be conditioned on there being an approver');
});

test('the web page does not offer self-approval either', () => {
  const page = read('admin-web/src/pages/InvoicesPage.tsx');
  assert.ok(/mine \? \(/.test(page), 'an invoice you raised must take the other branch');
  assert.ok(/somebody else in finance has to approve it/.test(page), 'and say why');
});

test('both clients call the same callables rather than copying the rules', () => {
  // The rules live in functions/invoiceRules.js and are enforced in the
  // transaction. Two clients reimplementing them is two chances to disagree
  // with the server about who may approve what.
  const web = read('admin-web/src/services/invoiceService.ts');
  const appSvc = read('src/firebase/invoiceService.js');
  for (const fn of ['createInvoice', 'approveInvoice', 'rejectInvoice', 'listInvoices']) {
    assert.ok(new RegExp("'" + fn + "'").test(web), 'the web service does not call ' + fn);
    assert.ok(new RegExp("'" + fn + "'").test(appSvc), 'the app service does not call ' + fn);
  }
  for (const src of [web, appSvc]) {
    assert.ok(!/createdBy ===/.test(src), 'a client must not decide self-approval for itself');
  }
});


console.log('\nAnd the filter works once there are invoices to filter');

test('the kind filter has the index its query needs', () => {
  // listInvoices filters by kind and orders by createdAt, which Firestore
  // cannot answer without a composite index. Without it the chips do not
  // return a narrower list - they fail, and only once somebody uses them.
  const service = read('functions/invoiceService.js');
  assert.ok(/where\('kind', '==', kind\)\.orderBy\('createdAt', 'desc'\)/.test(service),
    'the query this index exists for must still be the query that runs');

  const defined = JSON.parse(read('firestore.indexes.json')).indexes
    .find((index) => index.collectionGroup === 'invoices');
  assert.ok(defined, 'invoices has no index defined');
  assert.deepStrictEqual(
    defined.fields.map((f) => f.fieldPath + ' ' + f.order),
    ['kind ASCENDING', 'createdAt DESCENDING'],
    'the index must match the query: equality first, then the sort',
  );
});

test('the rules deploy sends the indexes too', () => {
  // An index that only exists in this repo is the same failure as a rule that
  // only exists in this repo, and it looks the same to the person using it.
  const deploy = read('scripts/deploy-rules.js');
  assert.ok(/'--only', 'firestore:rules,firestore:indexes'/.test(deploy),
    'deploy:rules must send the indexes alongside the rules');
  assert.ok(/shipPaths: \['firestore\.rules', 'firestore\.indexes\.json'\]/.test(deploy),
    'and must refuse a checkout that is stale in either file');
});


// ---------------------------------------------------------------------------
// The printable sheet. This is the artefact a payment is justified with months
// later, so the two names and the status have to survive the trip to paper.
// ---------------------------------------------------------------------------
const { renderInvoiceHtml } = require('../functions/invoiceDocument');

const SAMPLE = {
  number: 'MSI-2026-00003', kind: 'providerPayment', party: 'Server Payment',
  amount: 40, currency: 'MYR', reference: 'INV-88', notes: 'Monthly server bill',
  status: 'approved',
  createdByName: 'Raisa', createdByRole: 'superadmin', createdAt: Date.UTC(2026, 9, 5, 14, 35),
  approvedByName: 'Karim', approvedByRole: 'finance', approvedAt: Date.UTC(2026, 9, 5, 15, 32),
};

console.log('\nThe printed sheet says what the record says');

test('both names and both moments are on the paper', () => {
  const html = renderInvoiceHtml(SAMPLE);
  for (const text of ['MSI-2026-00003', 'Server Payment', 'MYR 40.00', 'INV-88', 'Monthly server bill',
    'Raisa (superadmin)', 'Karim (finance)']) {
    assert.ok(html.includes(text), 'the sheet omits ' + text);
  }
  // The time, not just the date - the whole reason these are kept. Written out
  // in full rather than as a shape, so a timezone slip shows up here.
  assert.ok(html.includes('05 Oct 2026 at 14:35 UTC'), 'the raised moment is wrong or missing');
  assert.ok(html.includes('05 Oct 2026 at 15:32 UTC'), 'the approved moment is wrong or missing');
});

test('an unapproved invoice cannot be mistaken for an approved one', () => {
  // A pending invoice that printed looking approved is the worst thing this
  // document could do, so it says so in words, not only in a colour.
  const pending = renderInvoiceHtml({ ...SAMPLE, status: 'pending', approvedByName: '', approvedByRole: '', approvedAt: null });
  assert.ok(/NOT YET APPROVED/.test(pending));
  assert.ok(/not payable/.test(pending));
  const rejected = renderInvoiceHtml({ ...SAMPLE, status: 'rejected' });
  assert.ok(/REJECTED/.test(rejected) && /not payable/.test(rejected));
  assert.ok(/Rejected by/.test(rejected), 'a rejection must not print as an approval');
  // And the approved one carries no such notice.
  assert.ok(!/not payable/.test(renderInvoiceHtml(SAMPLE)));
});

test('the direction of the money is named correctly', () => {
  assert.ok(/Paid to/.test(renderInvoiceHtml(SAMPLE)));
  assert.ok(/Received from/.test(renderInvoiceHtml({ ...SAMPLE, kind: 'investment' })),
    'an investment is money coming in, and must not read as a payment out');
});

test('a name cannot smuggle markup onto the sheet', () => {
  const html = renderInvoiceHtml({ ...SAMPLE, party: '<script>alert(1)</script>', notes: 'a & b < c' });
  assert.ok(!/<script>alert/.test(html), 'party is not escaped');
  assert.ok(html.includes('&lt;script&gt;'), 'it must be escaped, not stripped');
  assert.ok(html.includes('a &amp; b &lt; c'));
});

test('a half-filled invoice still prints', () => {
  // Rendering is the last step before somebody needs the document. It must not
  // be the thing that fails.
  for (const input of [null, undefined, {}, { number: 'X' }, { amount: 'nonsense', createdAt: 'yesterday' }]) {
    const html = renderInvoiceHtml(input);
    assert.ok(typeof html === 'string' && html.startsWith('<!DOCTYPE html>'), 'failed on ' + JSON.stringify(input));
  }
  // A missing approver prints as missing, not as an empty "Approved by".
  assert.ok(!/Approved by/.test(renderInvoiceHtml({ ...SAMPLE, status: 'pending', approvedByName: '', approvedByRole: '' })));
  // An unreadable time prints as nothing rather than as 1970.
  assert.ok(!/1970/.test(renderInvoiceHtml({ ...SAMPLE, createdAt: 'yesterday', approvedAt: 0 })));
});

console.log('\nAnd both clients can get it');

test('the document is built on the server, from the stored record', () => {
  // Not in a browser tab from whatever it had in state: this sheet has to say
  // what the record says.
  const service = read('functions/invoiceService.js');
  assert.ok(/exports\.getInvoiceDocument = onCall/.test(service));
  assert.ok(/renderInvoiceHtml\(\{/.test(service), 'it must render from the document it just read');
  assert.ok(/const snap = await db\.collection\(COLLECTION\)\.doc\(id\)\.get\(\)/.test(service));
  assert.ok(/exports\.getInvoiceDocument = require\('\.\/invoiceService'\)/.test(read('functions/index.js')),
    'and must be deployable');
});

test('reading a document needs the same capability as reading the list', () => {
  const service = read('functions/invoiceService.js');
  const body = /exports\.getInvoiceDocument = onCall[\s\S]*$/.exec(service)[0];
  assert.ok(/actorOf\(db, request, 'finance'\)/.test(body), 'finance must be checked');
  assert.ok(/actorOf\(db, request, 'reports'\)/.test(body), 'and reports must be able to look back');
  assert.ok(/invalid-argument/.test(body), 'an invoice id is still required');
});

test('both clients ask for it and print it', () => {
  const web = read('admin-web/src/services/invoiceService.ts');
  const webPage = read('admin-web/src/pages/InvoicesPage.tsx');
  const app = read('src/firebase/invoiceService.js');
  const appScreen = read('src/screens/InvoicesScreen.js');

  for (const src of [web, app]) assert.ok(/'getInvoiceDocument'/.test(src), 'a client does not call the callable');
  assert.ok(/win\.print\(\)/.test(web), 'the browser must open its print dialog');
  // Opened on the click, not after the await, or a pop-up blocker refuses it.
  assert.ok(web.indexOf("window.open('', '_blank')") < web.indexOf('await documentFn('),
    'the window must be opened before the call, or pop-up blockers refuse it');
  assert.ok(/printHtml\(doc\.html\)/.test(appScreen), 'the app must print what the server built');
  assert.ok(/Print \/ Download/.test(webPage) && /Print \/ Save PDF/.test(appScreen), 'both need a button');
});

test('every invoice can be printed, not only approved ones', () => {
  // The notice on an unapproved sheet is only worth writing if an unapproved
  // sheet can be printed.
  const webPage = read('admin-web/src/pages/InvoicesPage.tsx');
  const printBlock = /\{\/\* Every invoice[\s\S]*?<\/button>/.exec(webPage);
  assert.ok(printBlock, 'the print button must be findable');
  assert.ok(!/pending|mayDecide|status ===/.test(printBlock[0]), 'the button must not be gated on status');
});

console.log('\n' + passed + ' checks passed.\n');
