#!/usr/bin/env node
'use strict';
/**
 * Run the firestore.rules behaviour tests, emulator and all, in one command.
 *
 * WHY THIS EXISTS. test:rules needs a Firestore emulator on 127.0.0.1:8080 and
 * said so only in a comment at the top of the test file - "start it in another
 * terminal". So it was never run. It sat in the gate list failing with "fetch
 * failed", got called environmental, and stopped being read as a result.
 *
 * The first time it actually ran it found three wrong expectations, and the
 * rule added alongside it had no coverage at all. A gate nobody can run is a
 * gate that is not protecting anything, so the emulator is started here.
 *
 * It needs Java and the emulator jar. Both come with firebase-tools, and the
 * jar is cached under ~/.cache/firebase/emulators once `firebase emulators`
 * has run on the machine. When either is missing this exits 0 with a message
 * rather than failing: a missing local tool is not a broken rule, and a red
 * gate for the wrong reason is how the last one came to be ignored.
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 8080;
const HOST = '127.0.0.1';

function findJar() {
  const dir = path.join(os.homedir(), '.cache', 'firebase', 'emulators');
  if (!fs.existsSync(dir)) return '';
  const jars = fs.readdirSync(dir)
    .filter((f) => /^cloud-firestore-emulator-v[\d.]+\.jar$/.test(f))
    .sort();
  return jars.length ? path.join(dir, jars[jars.length - 1]) : '';
}

function skip(why) {
  console.log(`\ntest:rules — SKIPPED. ${why}`);
  console.log('To run it: install firebase-tools and Java, then `npx firebase emulators:start --only firestore`');
  console.log('and in another terminal `npm run test:rules`.\n');
  process.exit(0);
}

const jar = findJar();
if (!jar) skip('no Firestore emulator jar is cached on this machine.');
if (spawnSync('java', ['-version'], { stdio: 'ignore' }).error) skip('Java is not installed.');

const emulator = spawn('java', ['-jar', jar, '--host', HOST, '--port', String(PORT)], { stdio: 'ignore' });
let stopped = false;
const stop = () => { if (!stopped) { stopped = true; try { emulator.kill('SIGTERM'); } catch (e) { /* already gone */ } } };
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });

async function waitForEmulator() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://${HOST}:${PORT}/`);
      if (res.ok) return true;
    } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

(async () => {
  console.log(`Starting the Firestore emulator on ${HOST}:${PORT}...`);
  if (!await waitForEmulator()) {
    stop();
    console.error('\nThe emulator did not come up within 60s.\n');
    process.exit(1);
  }
  const run = spawnSync(process.execPath, [path.join(__dirname, 'test-firestore-rules.mjs')], {
    stdio: 'inherit',
    env: { ...process.env, FIRESTORE_EMULATOR_HOST: `${HOST}:${PORT}` },
  });
  stop();
  process.exit(run.status === null ? 1 : run.status);
})();
