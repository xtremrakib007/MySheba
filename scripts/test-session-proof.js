#!/usr/bin/env node
'use strict';

/**
 * Session proof for a device that is already signed in.
 *
 * Sign-in deliberately lets people through when checkDeviceSession cannot be
 * reached - App Check enforcement once locked out every user of the app for ten
 * days, so availability wins and the device is marked "not checked yet". That
 * part is right.
 *
 * The other half was missing. Twenty call sites ask for session proof before
 * touching money, and with no local session id every one of them failed with
 * "Your secure session is missing. Please sign in again." Permanently: signing
 * in again while the check is still unreachable lands in the same state, and
 * the person has no reason to try, because they ARE signed in. registerCustomer
 * made it worse with a bare `catch (e) {}` that left no session id and no trace.
 *
 * getSessionProof now repairs the proof on demand. These checks run the real
 * module with the native pieces stubbed, because the thing worth proving is the
 * behaviour: that it repairs when it can, and refuses when the server says the
 * device needs verifying rather than inventing a session.
 */
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

let failed = 0;
function check(name, condition, detail) {
  if (condition) console.log(`  ok   ${name}`);
  else { failed += 1; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

/**
 * Load deviceSessionService with its native dependencies replaced.
 *
 * @param {object} opts
 * @param {object} opts.store       initial AsyncStorage contents
 * @param {object|null} opts.user   auth.currentUser
 * @param {Function} opts.onCheck   stands in for the checkDeviceSession callable
 */
function load({ store = {}, user = { uid: 'u1' }, onCheck = async () => ({ data: {} }) } = {}) {
  const storage = { ...store };
  const calls = [];
  const modules = {
    '@react-native-async-storage/async-storage': {
      // esbuild's CJS interop reads `.default` only when __esModule is set;
      // without it the whole stub object becomes the default export and every
      // method reads as undefined.
      __esModule: true,
      default: {
        getItem: async (k) => (k in storage ? storage[k] : null),
        setItem: async (k, v) => { storage[k] = v; },
        removeItem: async (k) => { delete storage[k]; },
      },
    },
    'react-native': { Platform: { OS: 'android' } },
    'expo-device': { modelName: 'Test', osName: 'Android', osVersion: '14' },
    'expo-crypto': { getRandomBytes: (n) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + 3) % 256) },
    'firebase/functions': {
      httpsCallable: (_fns, name) => async (payload) => {
        calls.push({ name, payload });
        return onCheck(payload);
      },
    },
    './config': { auth: { currentUser: user }, functions: {} },
  };

  const code = esbuild.transformSync(
    fs.readFileSync(path.join(ROOT, 'src', 'firebase', 'deviceSessionService.js'), 'utf8'),
    { loader: 'js', format: 'cjs' }
  ).code;

  const box = {
    module: { exports: {} },
    exports: {},
    console,
    require: (id) => {
      if (!(id in modules)) throw new Error(`unexpected require: ${id}`);
      return modules[id];
    },
  };
  box.module.exports = box.exports;
  vm.createContext(box);
  vm.runInContext(code, box);
  return { api: box.module.exports, storage, calls };
}

const SESSION_KEY = 'mysheba_local_session_id';
const DEVICE_KEY = 'mysheba_device_id';
const DEFERRED_KEY = 'mysheba_device_check_deferred';

async function main() {
  console.log('\nWhen the proof is already there');
  {
    const { api, calls } = load({ store: { [SESSION_KEY]: 'sess-1', [DEVICE_KEY]: 'dev-1' } });
    const proof = await api.getSessionProof();
    check('it is returned as stored', proof.sessionId === 'sess-1' && proof.deviceId === 'dev-1', JSON.stringify(proof));
    check('and nothing is called to get it', calls.length === 0, JSON.stringify(calls));
  }

  console.log('\nWhen sign-in never stored one (the check was unreachable)');
  {
    const { api, storage, calls } = load({
      store: { [DEVICE_KEY]: 'dev-1', [DEFERRED_KEY]: '1' },
      onCheck: async () => ({ data: { sessionId: 'sess-repaired' } }),
    });
    const proof = await api.getSessionProof();
    check('the proof is repaired rather than refused', proof.sessionId === 'sess-repaired', JSON.stringify(proof));
    check('through checkDeviceSession', calls.length === 1 && calls[0].name === 'checkDeviceSession', JSON.stringify(calls));
    check('carrying this device id', calls[0].payload.deviceId === 'dev-1');
    check('and it is stored for next time', storage[SESSION_KEY] === 'sess-repaired');
    check('the deferred flag is cleared, because a check completed', !(DEFERRED_KEY in storage));

    // The expensive mistake would be repairing on every single call.
    const again = await api.getSessionProof();
    check('a second call reads storage instead of calling again', again.sessionId === 'sess-repaired' && calls.length === 1,
      `calls=${calls.length}`);
  }

  console.log('\nWhen the server will not hand one over');
  {
    const { api, storage } = load({
      store: { [DEVICE_KEY]: 'dev-1' },
      onCheck: async () => ({ data: { requiresOtp: true, reason: 'new-device' } }),
    });
    let message = '';
    try { await api.getSessionProof(); } catch (e) { message = e.message; }
    check('a device needing verification is refused', /verif/i.test(message), message);
    check('and no session is invented', !(SESSION_KEY in storage));
  }
  {
    const { api, storage } = load({ store: { [DEVICE_KEY]: 'dev-1' }, onCheck: async () => ({ data: {} }) });
    let message = '';
    try { await api.getSessionProof(); } catch (e) { message = e.message; }
    check('a response with no session id is refused', /secure session is missing/i.test(message), message);
    check('and nothing is stored', !(SESSION_KEY in storage));
  }
  {
    const { api, calls } = load({ store: { [DEVICE_KEY]: 'dev-1' }, user: null });
    let message = '';
    try { await api.getSessionProof(); } catch (e) { message = e.message; }
    check('a signed-out device is refused without calling anything', /sign in again/i.test(message) && calls.length === 0, message);
  }

  console.log('\nWhen the repair itself fails');
  {
    let attempt = 0;
    const { api } = load({
      store: { [DEVICE_KEY]: 'dev-1' },
      onCheck: async () => {
        attempt += 1;
        if (attempt === 1) throw new Error('network request failed');
        return { data: { sessionId: 'sess-later' } };
      },
    });
    let message = '';
    try { await api.getSessionProof(); } catch (e) { message = e.message; }
    check('the failure is surfaced', /network request failed/.test(message), message);
    // A cached rejected promise would make one bad moment permanent.
    const proof = await api.getSessionProof();
    check('and a later attempt can still succeed', proof.sessionId === 'sess-later', JSON.stringify(proof));
  }

  console.log('\nRegistration no longer loses the session silently');
  {
    const auth = fs.readFileSync(path.join(ROOT, 'src', 'firebase', 'authService.js'), 'utf8');
    const fn = auth.slice(auth.indexOf('export async function registerCustomer'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    // Comments mention the old `catch (e) {}` by name, so strip them first or
    // this matches the explanation rather than the code.
    const codeOnly = body.replace(/\/\/[^\n]*/g, '');
    check('the bare catch is gone', !/catch\s*\([^)]*\)\s*\{\s*\}/.test(codeOnly));
    check('an unreachable check marks the device unchecked', /setDeviceCheckDeferred\(\)/.test(body));
    check('and leaves a trace', /logActivity\('registerDeviceCheckUnreachable'/.test(body));
  }

  console.log('');
  if (failed) {
    console.error(`${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log('A signed-in device can always re-establish its session, or is told exactly why not.');
}

main().catch((err) => { console.error(err); process.exit(1); });
