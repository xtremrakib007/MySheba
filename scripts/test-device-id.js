#!/usr/bin/env node
/**
 * Every caller must get the same device id.
 *
 * getDeviceId was a bare read-then-write. On a device with nothing stored -
 * a fresh install, a reinstall, cleared app data - two callers arriving
 * together both read null, both generated an id, and both wrote. Last write
 * won, so one walked away with an id nobody else agreed with.
 *
 * That is not cosmetic. The device id decides whether a session was taken
 * over: sign-in sends it to the server as the active device, and the profile
 * listener compares the stored one against it. Two different values on one
 * phone read as "signed in on another device", and the person is signed out
 * with nobody else involved.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'firebase', 'deviceSessionService.js'), 'utf8');
const start = src.indexOf('let deviceIdPromise = null;');
const end = src.indexOf('export async function getLocalSessionId');
if (start < 0 || end < 0) {
  console.error('Device id test: could not find getDeviceId - has it been rewritten?');
  process.exit(1);
}
const body = src.slice(start, end).replace(/export /g, '');

let failed = 0;
const is = (label, got, want) => {
  if (got === want) { console.log(`  ok    ${label}`); return; }
  failed += 1;
  console.error(`  FAIL  ${label}\n          got ${got}, want ${want}`);
};

// A write has to be slower than a read, which is the realistic shape over a
// native bridge and the only way the race appears: with both the same speed
// the first caller finishes its whole read-generate-write before the next
// one's read resolves, and the bug hides.
function run(label, { slowRead = 0, slowWrite = 0, seeded = null } = {}) {
  let store = seeded;
  let writes = 0;
  let made = 0;
  const box = {
    AsyncStorage: {
      getItem: async () => { if (slowRead) await new Promise((r) => setTimeout(r, slowRead)); return store; },
      setItem: async (_k, v) => { writes += 1; if (slowWrite) await new Promise((r) => setTimeout(r, slowWrite)); store = v; },
    },
    DEVICE_ID_KEY: 'k',
    generateId: () => { made += 1; return `id-${made}`; },
    setTimeout,
    module: { exports: {} },
    console,
  };
  vm.createContext(box);
  vm.runInContext(`${body}\nmodule.exports = getDeviceId;`, box);
  return { getDeviceId: box.module.exports, stats: () => ({ writes, made, store }), label };
}

(async () => {
  console.log('Ten callers at once on a device with nothing stored:');
  {
    const t = run('cold', { slowRead: 5, slowWrite: 20 });
    const ids = await Promise.all(Array.from({ length: 10 }, () => t.getDeviceId()));
    is('all ten get the same id', new Set(ids).size, 1);
    is('only one id was generated', t.stats().made, 1);
    is('only one write', t.stats().writes, 1);
    is('the id returned is the one in storage', ids[0], t.stats().store);
  }

  console.log('\nAn id already in storage is reused, never replaced:');
  {
    const t = run('warm', { seeded: 'id-already-here' });
    const first = await t.getDeviceId();
    const second = await t.getDeviceId();
    is('returns the stored id', first, 'id-already-here');
    is('same id twice', first, second);
    is('nothing generated', t.stats().made, 0);
    is('nothing written', t.stats().writes, 0);
  }

  console.log('\nA failed read is not cached as the answer:');
  {
    let store = null; let calls = 0;
    const box = {
      AsyncStorage: {
        getItem: async () => { calls += 1; if (calls === 1) throw new Error('storage unavailable'); return store; },
        setItem: async (_k, v) => { store = v; },
      },
      DEVICE_ID_KEY: 'k', generateId: () => 'id-ok', setTimeout, module: { exports: {} }, console,
    };
    vm.createContext(box);
    vm.runInContext(`${body}\nmodule.exports = getDeviceId;`, box);
    const getDeviceId = box.module.exports;
    let threw = false;
    try { await getDeviceId(); } catch (e) { threw = true; }
    is('the first call surfaces the error', threw, true);
    is('a later call still returns an id', await getDeviceId(), 'id-ok');
  }

  console.log(failed ? `\n${failed} failure(s).` : '\nDevice id: all checks pass.');
  process.exit(failed ? 1 : 0);
})();
