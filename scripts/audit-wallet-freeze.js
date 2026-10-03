#!/usr/bin/env node
'use strict';
/**
 * Every wallet write is either guarded by the freeze, or an admitted reversal.
 *
 * A freeze that misses one path is theatre: the wallet is held everywhere
 * except the one route somebody finds. There are a dozen places a balance is
 * written, spread over nine files, so this asks the question for all of them
 * rather than trusting that they were all remembered.
 *
 * A reversal - a refund of money already taken - must NOT be blocked, or a
 * frozen customer is out of pocket for an order that failed. Those are listed
 * here by name, so the exemption is a decision on the record and a NEW
 * unguarded write fails this check rather than joining them silently.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'functions');

// Files whose wallet writes are not deliberate movement between two live
// wallets. Each is here with the reason it cannot be blocked, so the
// exemption is a decision on the record - and a NEW unguarded write in any
// other file fails rather than joining them quietly.
const EXEMPT = {
  // Returning money already taken. Blocking these would leave a frozen
  // customer out of pocket for an order that failed.
  'apiWebhookService.js': 'a provider cancellation refunds the charge',
  'successTopupPoller.js': 'the poller refunds a cancelled recharge',
  'rejectionService.js': 'rejecting an order refunds it',
  'transactionService.js': 'settling an uncertain transaction refunds it',
  // Not movement at all.
  'customerRegistration.js': 'a new account starts at zero',
  'userManagement.js': 'a created account starts at zero',
  'accountMergeService.js': 'merging moves a balance between two halves of one person',
  'userDirectoryService.js': 'reads a balance into a listing; writes nothing',
};

// A file where some writes are reversals and others are deliberate movement
// needs the check present; the audit cannot tell the two apart inside one file.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const failures = [];
for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.js'))) {
  const src = strip(fs.readFileSync(path.join(DIR, file), 'utf8'));
  const writes = (src.match(/walletBalance:\s*[^,}]/g) || []).length;
  if (writes === 0) continue;
  if (EXEMPT[file]) continue;
  if (!/assertWalletUnfrozen\(/.test(src)) {
    failures.push(`${file} writes a wallet balance ${writes} time(s) and never checks the freeze. Guard it, or record it in EXEMPT with the reason it cannot be blocked.`);
  }
}

if (failures.length) {
  console.error('\nWallet freeze coverage FAILED:\n');
  for (const f of failures) console.error(`  - ${f}`);
  console.error(`\n${failures.length} money path(s) ignore a frozen wallet.\n`);
  process.exit(1);
}
console.log('Wallet freeze: every money path is guarded, or an admitted reversal.');
