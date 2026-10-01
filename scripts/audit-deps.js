#!/usr/bin/env node
'use strict';

/**
 * Dependency vulnerability gate.
 *
 * `npm audit` on its own is not a gate: it reports every advisory anywhere in
 * the tree, including ones in build-time CLI tooling that never ships, and ones
 * in code paths a React Native app cannot reach. Left unfiltered it reads as 27
 * vulnerabilities forever, nobody acts on it, and a genuinely reachable
 * advisory lands in the noise.
 *
 * So this gate fails only on high/critical advisories in *production*
 * dependencies that are not explicitly exempted below. Every exemption names
 * the advisory, says why it is not reachable here, and records what would make
 * it reachable again — so the next person can re-check it instead of trusting
 * a bare allowlist.
 *
 * Run `npm audit` (unfiltered, both trees) when you want the raw picture.
 */

const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/**
 * Advisories we have triaged and accepted, keyed by the package npm names.
 *
 * `why` must say why it cannot hurt this app, not that it is inconvenient to
 * fix. `recheckIf` is the condition that voids the exemption.
 */
const EXEMPT = {
  // ---- app tree (React Native bundle) -------------------------------------
  '@grpc/grpc-js': {
    tree: 'app',
    why:
      'gRPC is not reachable in React Native. @firebase/firestore resolves through its ' +
      '"react-native" export condition to dist/index.rn.js, which talks WebChannel over ' +
      'fetch/XHR and contains no grpc reference at all. The @grpc/grpc-js copy in the tree ' +
      'is pulled in by the Node entry point only and is never bundled by Metro.',
    recheckIf:
      'the app starts importing @firebase/firestore through its Node entry point, or runs ' +
      'Firestore code under Node (SSR, a script, a test harness) rather than on device.',
  },
  firebase: { tree: 'app', aliasOf: '@grpc/grpc-js' },
  '@firebase/firestore': { tree: 'app', aliasOf: '@grpc/grpc-js' },
  '@firebase/firestore-compat': { tree: 'app', aliasOf: '@grpc/grpc-js' },
  '@react-native-firebase/app': { tree: 'app', aliasOf: '@grpc/grpc-js' },
  '@react-native-firebase/auth': { tree: 'app', aliasOf: '@grpc/grpc-js' },
  '@react-native-firebase/messaging': { tree: 'app', aliasOf: '@grpc/grpc-js' },

  'brace-expansion': {
    tree: 'app',
    why:
      'ReDoS in glob pattern expansion, reached only through minimatch inside the Expo/Metro ' +
      'CLI toolchain. The patterns come from our own config files, not from user input, and ' +
      'none of this is bundled into the app.',
    recheckIf: 'brace-expansion or minimatch ever expands a pattern that came from a request or a user.',
  },
  'image-size': {
    tree: 'app',
    why:
      'Reached only by the Metro asset plugin while measuring images at bundle time. The ' +
      'images are the ones committed to this repo. Build-time only; not in the shipped bundle.',
    recheckIf: 'image-size is used at runtime, or to measure an image a user uploaded.',
  },
  postcss: {
    tree: 'app',
    why: 'Pulled in by expo -> @expo/metro-config for CSS handling at bundle time. Not in the shipped bundle.',
    recheckIf: 'the app processes CSS at runtime (it is a React Native app, so it does not).',
  },
  ajv: { tree: 'app', aliasOf: 'fast-uri' },
  'fast-uri': {
    tree: 'app',
    why:
      'Reached through ajv while validating app.config.js against the Expo schema, at build ' +
      'time. The input is our own config.',
    recheckIf: 'ajv is used to validate anything that arrives from a client.',
  },
  xcode: {
    tree: 'app',
    why: 'Used by expo prebuild to edit the generated iOS project. Build-time only; never bundled.',
    recheckIf: 'xcode is parsing a project file from an untrusted source.',
  },
  // The Expo packages below are each flagged purely for depending on one of the
  // build-time packages above; npm's only "fix" is an SDK 57 major bump.
  expo: { tree: 'app', aliasOf: 'postcss' },
  '@expo/cli': { tree: 'app', aliasOf: 'postcss' },
  '@expo/config': { tree: 'app', aliasOf: 'fast-uri' },
  '@expo/config-plugins': { tree: 'app', aliasOf: 'xcode' },
  '@expo/metro-config': { tree: 'app', aliasOf: 'postcss' },
  '@expo/prebuild-config': { tree: 'app', aliasOf: 'xcode' },
  'expo-asset': { tree: 'app', aliasOf: 'image-size' },
  'expo-constants': { tree: 'app', aliasOf: 'fast-uri' },
  'expo-dev-client': { tree: 'app', aliasOf: 'fast-uri' },
  'expo-dev-launcher': { tree: 'app', aliasOf: 'fast-uri' },
  'expo-manifests': { tree: 'app', aliasOf: 'fast-uri' },
  'expo-notifications': { tree: 'app', aliasOf: 'fast-uri' },
  'expo-updates': { tree: 'app', aliasOf: 'fast-uri' },
  uuid: {
    tree: 'app',
    why:
      'Missing buffer bounds check in uuid v3/v5/v6 when the caller supplies a `buf` argument. ' +
      'Every consumer in this tree calls uuid.v4() with no buffer.',
    recheckIf: 'any code calls uuid.v3/v5/v6 with a buffer, especially one sized from input.',
  },
};

const TREES = [
  { name: 'app', cwd: ROOT },
  { name: 'functions', cwd: path.join(ROOT, 'functions') },
];

function audit(cwd) {
  // npm audit exits non-zero when it finds anything, so the throw carries the
  // report we actually want; only a missing/garbled stdout is a real error.
  let out;
  try {
    out = execFileSync('npm', ['audit', '--omit=dev', '--json'], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (err) {
    out = err.stdout;
  }
  if (!out || !out.trim()) throw new Error('npm audit produced no output (offline? no lockfile?)');
  const report = JSON.parse(out);
  if (report.error) throw new Error(`npm audit failed: ${report.error.summary || report.error.code}`);
  return report;
}

function titlesFor(vuln) {
  const out = [];
  for (const via of vuln.via || []) if (typeof via === 'object' && via.title) out.push(`${via.title} (${via.severity})`);
  return out;
}

let blocking = 0;
let accepted = 0;
const unused = new Set(Object.keys(EXEMPT));

for (const tree of TREES) {
  let report;
  try {
    report = audit(tree.cwd);
  } catch (err) {
    console.error(`FAIL ${tree.name}: could not audit — ${err.message}`);
    process.exitCode = 1;
    continue;
  }

  const counts = report.metadata.vulnerabilities;
  console.log(`\n${tree.name}: ${counts.critical} critical, ${counts.high} high, ${counts.moderate} moderate (production dependencies)`);

  for (const [name, vuln] of Object.entries(report.vulnerabilities || {})) {
    const exempt = EXEMPT[name];
    // An exemption is in use as long as npm still reports the package at any
    // severity; the moderate entries are documentation, not gate bypasses.
    if (exempt && exempt.tree === tree.name) unused.delete(name);

    if (vuln.severity !== 'high' && vuln.severity !== 'critical') continue;

    if (exempt && exempt.tree === tree.name) {
      accepted += 1;
      continue;
    }

    blocking += 1;
    console.error(`\n  BLOCKING  ${vuln.severity.toUpperCase()}  ${name}  (${vuln.range})`);
    for (const t of titlesFor(vuln)) console.error(`            ${t}`);
    if (!exempt) {
      const fix = vuln.fixAvailable;
      if (fix && typeof fix === 'object') {
        console.error(`            fix: ${fix.name}@${fix.version}${fix.isSemVerMajor ? ' (MAJOR — review before taking it)' : ''}`);
      } else if (fix) {
        console.error('            fix: available without a major bump — run `npm audit fix`');
      } else {
        console.error('            no fix published yet');
      }
      console.error('            Either upgrade, or add a triaged exemption in scripts/audit-deps.js');
      console.error('            saying why it is unreachable here.');
    } else {
      console.error(`            An exemption exists but it is scoped to the "${exempt.tree}" tree, not "${tree.name}".`);
    }
  }
}

// A stale exemption is how an allowlist rots: the advisory is gone or the
// dependency was dropped, and the entry keeps vouching for nothing.
if (unused.size) {
  console.log(`\nStale exemptions (no longer reported — delete them from scripts/audit-deps.js):`);
  for (const name of unused) console.log(`  - ${name}`);
}

console.log('');
if (blocking) {
  console.error(`${blocking} high/critical advisory(ies) in production dependencies are not triaged. Failing.`);
  process.exit(1);
}
console.log(`No untriaged high/critical advisories in production dependencies (${accepted} triaged and accepted).`);
console.log('Run `npm audit` for the full unfiltered report, including build-time tooling.');
