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
  'expo-updates': { tree: 'app', aliasOf: 'node-forge' },
  uuid: {
    tree: 'app',
    why:
      'Missing buffer bounds check in uuid v3/v5/v6 when the caller supplies a `buf` argument. ' +
      'Every consumer in this tree calls uuid.v4() with no buffer.',
    recheckIf: 'any code calls uuid.v3/v5/v6 with a buffer, especially one sized from input.',
  },
  // ---- Expo/RN 53 build-chain advisories -------------------------------
  // npm currently reports these through React Native's dependency tree and
  // recommends RN 0.87.1. That is an Expo-SDK-major upgrade, not a safe
  // security-only patch for this release. Metro/Jest/CLI packages execute
  // during bundling/testing and are not shipped in the Android runtime.
  '@jest/environment': { tree: 'app', aliasOf: 'metro' },
  '@jest/fake-timers': { tree: 'app', aliasOf: 'metro' },
  '@jest/transform': { tree: 'app', aliasOf: 'metro' },
  '@react-native/community-cli-plugin': { tree: 'app', aliasOf: 'metro' },
  'babel-jest': { tree: 'app', aliasOf: 'metro' },
  braces: { tree: 'app', aliasOf: 'metro' },
  'jest-environment-node': { tree: 'app', aliasOf: 'metro' },
  'jest-haste-map': { tree: 'app', aliasOf: 'metro' },
  'jest-message-util': { tree: 'app', aliasOf: 'metro' },
  metro: { tree: 'app', aliasOf: 'metro' },
  'metro-config': { tree: 'app', aliasOf: 'metro' },
  'metro-file-map': { tree: 'app', aliasOf: 'metro' },
  'metro-transform-worker': { tree: 'app', aliasOf: 'metro' },
  micromatch: { tree: 'app', aliasOf: 'metro' },
  'react-native': {
    tree: 'app',
    why:
      'npm currently reaches this package through its bundled build/test dependency tree and proposes ' +
      'react-native@0.87.1 as the fix. MySheba is pinned to React Native 0.79.6 by Expo SDK 53; ' +
      'the audit finding is not a direct CVE affecting the 0.79.6 runtime package. Independent package ' +
      'security data currently reports no known CVEs for react-native 0.79.6. Do not take an RN major ' +
      'upgrade as an audit-only change.',
    recheckIf:
      'npm reports a direct runtime advisory against react-native 0.79.6 itself, or MySheba moves to ' +
      'a compatible Expo/RN major where 0.87.1 is a supported upgrade.',
  },
  'react-native-google-mobile-ads': {
    tree: 'app',
    why:
      'npm currently recommends a downgrade to 13.6.1. The pinned 15.8.3 release has no direct known ' +
      'vulnerability in independent package security data, and downgrading would be an unrelated major ' +
      'compatibility regression. MySheba has additionally disabled the native AdMob initialization and ' +
      'banner rendering while the Android BannerAd crash is investigated.',
    recheckIf:
      'AdMob is re-enabled, a direct advisory is confirmed against 15.8.3, or a compatible non-downgrade ' +
      'security release becomes available.',
  },
  compression: {
    tree: 'app',
    why:
      'Compression is Expo CLI/dev-server tooling. It is not part of the shipped React Native runtime or APK. ' +
      'A non-major patched version is pinned in package overrides; regenerate the lockfile after pulling.',
    recheckIf:
      'compression becomes runtime application code or the lockfile still resolves a vulnerable version after install.',
  },
  'shell-quote': {
    tree: 'app',
    why:
      'shell-quote is build/dev tooling only and is not bundled into the Android runtime. The project pins a ' +
      'non-vulnerable 1.12.0 floor; regenerate the lockfile after pulling.',
    recheckIf:
      'shell-quote becomes runtime code or the lockfile resolves below 1.12.0.',
  },
  'source-map-js': {
    tree: 'app',
    why:
      'source-map-js is used by the build/source-map pipeline and is not shipped in the Android runtime. The ' +
      'project pins a non-vulnerable 1.2.2 floor; regenerate the lockfile after pulling.',
    recheckIf:
      'source-map-js is used to process attacker-controlled source maps or the lockfile resolves below 1.2.2.',
  },

  'node-forge': {
    tree: ['app', 'functions'],
    why:
      'GHSA: RSA PKCS#1 v1.5 signature *verification* accepts extra nested DigestAlgorithm ' +
      'elements, so a forged signature can be made to validate. It only bites code that ' +
      'verifies a PKCS#1 v1.5 signature against a trusted key. Neither tree does that.\n' +
      '  app: two paths, both build-time. expo-updates -> @expo/code-signing-certificates is ' +
      'the one that would verify (it checks OTA manifest signatures), but expo-updates code ' +
      'signing is not configured — there is no codeSigning/certificate key in app.base.json, ' +
      'app.config.js or eas.json — so no verification ever runs. The other path is ' +
      'expo -> @expo/cli, which is the dev/prebuild CLI. Confirmed by exporting the Android ' +
      'bundle: "node-forge", "code-signing-certificates", "pki.privateKeyFromPem" and ' +
      '"rsa.verify" each appear 0 times in the 6.9M Hermes bundle, so the library is not on a ' +
      'device at all.\n' +
      '  functions: firebase-admin requires node-forge in exactly one place, ' +
      'lib/app/credential-internal.js, as forge.pki.privateKeyFromPem(this.privateKey) — ' +
      'parsing our own service-account private key out of the runtime credentials. That is ' +
      'key parsing, not signature verification, and the input is ours, not an attacker\'s.\n' +
      '  Every fix npm offers is a major, and the app-tree ones are downgrades that predate ' +
      'the vulnerable range (expo-updates@0.11.7 against our 0.28.18) and cannot run on ' +
      'SDK 53. functions can move to firebase-admin@14 / firebase-functions@7 on purpose, as ' +
      'a deliberate upgrade rather than an audit-driven one.',
    recheckIf:
      'expo-updates code signing is turned on (a codeSigning or certificate key appears in the ' +
      'app config or eas.json), or node-forge starts showing up in an exported bundle, or ' +
      'firebase-admin gains a node-forge call beyond privateKeyFromPem, or we write anything ' +
      'that verifies an RSA PKCS#1 v1.5 signature.',
  },
  '@expo/code-signing-certificates': { tree: 'app', aliasOf: 'node-forge' },
  '@react-native-firebase/app-check': { tree: 'app', aliasOf: '@grpc/grpc-js' },
  'firebase-admin': { tree: 'functions', aliasOf: 'node-forge' },
  'firebase-functions': { tree: 'functions', aliasOf: 'node-forge' },
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

function treesOf(exempt) {
  return Array.isArray(exempt.tree) ? exempt.tree : [exempt.tree];
}

function appliesTo(exempt, treeName) {
  return Boolean(exempt) && treesOf(exempt).includes(treeName);
}

let blocking = 0;
let accepted = 0;
// Keyed per (package, tree): an exemption scoped to both trees that is only
// still reported in one of them has half rotted, and should say so.
const unused = new Set();
for (const [name, exempt] of Object.entries(EXEMPT)) {
  for (const treeName of treesOf(exempt)) unused.add(`${name} (${treeName})`);
}

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
    if (appliesTo(exempt, tree.name)) unused.delete(`${name} (${tree.name})`);

    if (vuln.severity !== 'high' && vuln.severity !== 'critical') continue;

    if (appliesTo(exempt, tree.name)) {
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
      console.error(`            An exemption exists but it is scoped to the ${treesOf(exempt).map((t) => `"${t}"`).join(' and ')} tree, not "${tree.name}".`);
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
