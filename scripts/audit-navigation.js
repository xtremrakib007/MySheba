#!/usr/bin/env node
/**
 * Checks that every navigation target in the app resolves to something that
 * can actually handle it.
 *
 * The retired-module cleanup removed screens, services and whole features
 * but left the things pointing at them behind. Those never fail loudly: a
 * tile whose key matches no tab and no screen just opens an empty page, and
 * a setScreen() to a screen App.js no longer renders does nothing at all.
 * Neither shows up in a lint run or a syntax check, so they shipped.
 *
 * Run with `npm run audit:nav`. Exits non-zero on any unresolved target, so
 * it can gate a build.
 *
 * Only code reachable from the app entry point is checked. Files that
 * nothing imports (screens left behind by the same cleanup) cannot be
 * reached by a user, so a dangling target inside one is dead code rather
 * than a live bug - it is reported as a note, not a failure.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));

// ---- which files a user can actually reach ----
const EXTS = ['', '.js', '.jsx', '.ts', '.tsx', '.json', '/index.js', '/index.tsx'];
function resolveFrom(base) {
  for (const e of EXTS) {
    const p = base + e;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}
// A commented-out import is not an import. Without this the audit reads
// example code in comments - src/data/busLogos.js documents how to wire a
// licensed logo in with three commented `require` lines - and reports the
// files they name as broken imports.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => (/^\s*\/\//.test(line) ? '' : line))
    .join('\n');
}

function reachableFiles() {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file) || !/\.(js|jsx|ts|tsx)$/.test(file)) return;
    seen.add(file);
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    for (const m of src.matchAll(/(?:from\s+|require\(\s*|import\(\s*)['"](\.[^'"]+)['"]/g)) {
      const target = resolveFrom(path.resolve(path.dirname(file), m[1]));
      if (target) walk(target);
    }
  };
  walk(path.join(root, 'index.js'));
  return seen;
}

// ---- helpers ----
const arrayKeys = (src, name) => {
  const m = src.match(new RegExp(`const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\n\\];`));
  return m ? [...m[1].matchAll(/key: '([a-zA-Z]+)'/g)].map((x) => x[1]) : [];
};
const objectKeys = (src, name) => {
  const m = src.match(new RegExp(`${name}\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  return m ? [...m[1].matchAll(/([a-zA-Z]+):/g)].map((x) => x[1]) : [];
};
const matches = (src, re) => [...src.matchAll(re)].map((m) => m[1]);

const failures = [];
const notes = [];
let checked = 0;
function check(group, name, verdict, ok) {
  checked += 1;
  if (!ok) failures.push({ group, name, verdict });
}

const reachable = reachableFiles();
const isReachable = (f) => reachable.has(path.join(root, f));

// ---- the handlers ----
const app = read('App.js');
const screens = new Set(matches(app, /renderedScreen === '([a-zA-Z]+)'/g));
const adminTabs = new Set(matches(read('src/screens/AdminHomeScreen.js'), /adminTab === '([a-zA-Z]+)'/g));
const dealerTabs = new Set(arrayKeys(read('src/screens/DealerHomeScreen.js'), 'FEATURES'));
const resellerTabs = new Set(arrayKeys(read('src/screens/ResellerHomeScreen.js'), 'FEATURES'));

// ---- 0. every role landing screen is mounted by App.js ----
check('role/home', 'staffHome', 'Support Agent and Finance home screen is not mounted', /renderedScreen === 'staffHome'\s*&&\s*<StaffHomeScreen\s*\/>/.test(app) && /import StaffHomeScreen from '\.\/src\/screens\/StaffHomeScreen'/.test(app));

// ---- 1. every setScreen() target is a screen App.js renders ----
for (const file of fs.readdirSync(path.join(root, 'src/screens'))) {
  if (!file.endsWith('.js')) continue;
  const rel = `src/screens/${file}`;
  for (const target of new Set(matches(read(rel), /setScreen\('([a-zA-Z]+)'\)/g))) {
    if (screens.has(target)) { checked += 1; continue; }
    if (isReachable(rel)) check('setScreen', `${file} -> '${target}'`, 'App.js renders no such screen', false);
    else notes.push(`${file} -> setScreen('${target}') has no screen, but nothing imports ${file}`);
  }
}

// ---- 2. admin feature tiles ----
const adminFeat = read('src/screens/AdminFeaturesScreen.js');
const screenFeatures = new Set(
  ((adminFeat.match(/SCREEN_FEATURES = \[([^\]]*)\]/) || [, ''])[1].match(/[a-zA-Z]+/g)) || []
);
// A tile key and its screen name are not always the same; openItem consults
// SCREEN_FOR for the ones that differ, so read that too rather than assuming
// key === screen and reporting a working tile as broken.
const screenFor = Object.fromEntries(
  [...((adminFeat.match(/SCREEN_FOR = \{([^}]*)\}/) || [, ''])[1]).matchAll(/([a-zA-Z]+)\s*:\s*'([a-zA-Z]+)'/g)].map((m) => [m[1], m[2]])
);
for (const group of ['OPERATIONS', 'FINANCE', 'USERS', 'PLATFORM', 'SYSTEM']) {
  for (const key of arrayKeys(adminFeat, group)) {
    if (key === 'rates') { checked += 1; continue; } // openItem intercepts it
    const target = screenFor[key] || key;
    const ok = screenFeatures.has(key) ? screens.has(target) : adminTabs.has(key);
    const via = screenFeatures.has(key) ? `setScreen('${target}'), but no such screen` : 'adminTab, but AdminHomeScreen has no branch';
    check(`admin/${group.toLowerCase()}`, key, via, ok);
  }
}

// ---- 2b. admin section selectors must render every category's own grid ----
check(
  'admin/section-routing',
  'platform',
  'Platform & Content selector falls through to System Control',
  /section === 'platform'\s*\?\s*PLATFORM/.test(adminFeat)
);

// ---- 2c. support and finance Reports tiles must render role-specific content ----
const reportsScreen = read('src/screens/ReportsScreen.js');
check('reports/support', 'support', 'Reports screen has no Support Agent renderer', /role === 'support'\s*&&\s*<SupportReports/.test(reportsScreen));
check('reports/finance', 'finance', 'Reports screen has no Finance renderer', /role === 'finance'\s*&&\s*<FinanceReports/.test(reportsScreen));
check('reports/reseller', 'reseller', 'Reports screen has no Reseller renderer', /role === 'reseller'\s*&&\s*<ResellerReports/.test(reportsScreen));
check('reports/access', 'staff', 'Reports screen does not enforce staff reports capability', /\['admin', 'superadmin', 'support', 'finance'\]\.includes\(role\)\s*&&\s*!can\('reports'\)/.test(reportsScreen));
const accountGridSource = read('src/components/AccountToolsGrid.js');
check('account/home-grid', 'reports', 'staff Reports tile ignores capability revocation', /item\.key === 'reports'[\s\S]*?\['admin', 'superadmin', 'support', 'finance'\]\.includes\(profile\?\.role\)[\s\S]*?!can\('reports'\)/.test(accountGridSource));

// ---- 3. dealer + reseller dashboards ----
for (const key of arrayKeys(read('src/screens/DealerFeaturesScreen.js'), 'DASHBOARD_TOOL_DEFS')) {
  if (key === 'topup') { check('dealer/dashboard', key, 'setScreen, but no such screen', screens.has('topup')); continue; }
  check('dealer/dashboard', key, 'dealerTab, but DealerHomeScreen has no such status', dealerTabs.has(key));
}
for (const key of arrayKeys(read('src/screens/ResellerFeaturesScreen.js'), 'DASHBOARD_TOOL_DEFS')) {
  check('reseller/dashboard', key, 'resellerTab, but ResellerHomeScreen has no such list', resellerTabs.has(key));
}

// ---- 4. the shared Tools grid both roles render from FEATURE_DEFS ----
for (const key of arrayKeys(read('src/firebase/featureAccessService.js'), 'FEATURE_DEFS')) {
  check('tools (dealer+reseller)', key, 'setScreen, but no such screen', screens.has(key));
}

// ---- 4b. the dashboard and common-account grids mounted on role homepages ----
const roleHomeGrid = read('src/components/RoleToolsGrid.js');
for (const key of arrayKeys(roleHomeGrid, 'DEALER_DASHBOARD')) {
  if (key === 'topup') { check('dealer/home-grid', key, 'setScreen, but no such screen', screens.has('topup')); continue; }
  check('dealer/home-grid', key, 'dealerTab, but DealerHomeScreen has no such status', dealerTabs.has(key));
}
for (const key of arrayKeys(roleHomeGrid, 'RESELLER_DASHBOARD')) {
  check('reseller/home-grid', key, 'resellerTab, but ResellerHomeScreen has no such status', resellerTabs.has(key));
}
for (const key of arrayKeys(read('src/components/AccountToolsGrid.js'), 'ITEMS')) {
  check('account/home-grid', key, 'setScreen, but no such screen', screens.has(key));
}

// ---- 4c. every managed grid key is allowed by the Firestore rules whitelist ----
const gridDefs = read('src/firebase/gridManagementService.js');
const rules = read('firestore.rules');
const gridRuleLines = rules.split('\n').filter((line) => line.includes('match /settings/gridManagement'));
const gridRuleLine = gridRuleLines[0] || '';
const createGridWhitelist = (gridRuleLine.match(/allow create:[\s\S]*?hasOnly\(\[([^\]]*)\]\)/) || [, ''])[1];
const updateGridWhitelist = (gridRuleLine.match(/allow update:[\s\S]*?hasOnly\(\[([^\]]*)\]\)/) || [, ''])[1];
for (const key of matches(gridDefs, /\['([a-zA-Z]+)','[^']+'\]/g)) {
  const allowedOnCreate = createGridWhitelist.includes("'" + key + "'");
  const allowedOnUpdate = updateGridWhitelist.includes("'" + key + "'");
  check('grid-management', key, 'missing Firestore create/update whitelist entry', gridRuleLines.length === 1 && allowedOnCreate && allowedOnUpdate);
}

// ---- 4d. the shared date field must not reference an undefined native picker ----
const sharedUi = read('src/components/ui.js');
const pickerReferenced = /\bDateTimePicker\b/.test(sharedUi);
const pickerImported = /import\s+DateTimePicker\s+from\s+['"][^'"]+['"]/.test(sharedUi);
check('shared-ui', 'DateTimePicker', 'referenced without an import', !pickerReferenced || pickerImported);

// ---- 4d. shared Salary and Documents shortcuts must retain subscription gates ----
const accountToolsSource = read('src/components/AccountToolsGrid.js');
check('account/home-grid', 'salary', 'Salary & OT bypasses openSalary module access gate', /key === 'salaryDashboard'\) return openSalary\(\)/.test(accountToolsSource));
check('account/home-grid', 'documents', 'My Documents bypasses openMyDocuments module access gate', /key === 'myDocuments'\) return openMyDocuments\(\)/.test(accountToolsSource));
const adminFeaturesSource = read('src/screens/AdminFeaturesScreen.js');
check('admin/home-grid', 'salary', 'Salary & OT bypasses openSalary module access gate', /key === 'salaryDashboard'\) \{ openSalary\(\); return; \}/.test(adminFeaturesSource));
check('admin/home-grid', 'documents', 'My Documents bypasses openMyDocuments module access gate', /key === 'myDocuments'\) \{ openMyDocuments\(\); return; \}/.test(adminFeaturesSource));
const sidebarAccessSource = read('src/components/Sidebar.js');
check('sidebar/access', 'salary', 'Salary & OT bypasses openSalary module access gate', /key === 'salaryDashboard'\) \{\s*openSalary\(\)/.test(sidebarAccessSource));
check('sidebar/access', 'documents', 'My Documents bypasses openMyDocuments module access gate', /key === 'myDocuments'\) \{\s*openMyDocuments\(\)/.test(sidebarAccessSource));

// ---- 4d. ProfileScreen self-service fields must be allowed by Firestore rules ----
const userRuleLine = rules.split('\n').find((line) => line.includes('match /users/{uid}')) || '';
const userUpdateWhitelist = (userRuleLine.match(/allow update:[\s\S]*?hasOnly\(\[([^\]]*)\]\)/) || [, ''])[1];
for (const field of ['mobileNumber', 'passportNumber', 'companyName', 'address', 'country', 'passportCopyUrl', 'passportCopyType']) {
  check('profile/firestore-rules', field, 'ProfileScreen field is blocked by the user update whitelist', userUpdateWhitelist.includes("'" + field + "'"));
}
check('profile/firestore-rules', 'passport-copy ownership', 'passport-copy URL is not restricted to the signed-in user path', /passport-copies%2F' \+ uid \+ '%2F/.test(userRuleLine) || rules.includes("passport-copies%2F' + uid + '%2F"));
check('profile/firestore-rules', 'country validation', 'country edits do not enforce a two-character code', /request\.resource\.data\.country\.size\(\) == 2/.test(rules));

// ---- 4e. staff service shortcuts must land on the correct operational tab ----
const serviceGridSource = read('src/components/ServiceGrid.js');
check(
  'staff/home-grid',
  'topup',
  'Top-Ups tile routes to the request review queue, not self top-up',
  /s\.kind === 'adminTopup'\)\s*\{\s*setAdminTab\('topups'\);\s*setAdminViewingSection\(true\);\s*return setScreen\('adminHome'\);/.test(serviceGridSource)
);

// ---- 4f. the sidebar must respect capability and managed-grid visibility ----
const sidebarSource = read('src/components/Sidebar.js');
check('sidebar/access', 'capability', 'sidebar does not filter items by effective capability', /required && !required\.some\(\(capability\) => can\(capability\)\)/.test(sidebarSource));
check('sidebar/access', 'grid-management', 'sidebar does not hide disabled managed-grid items', /gridManagement\?\.\[gridKey\] === false/.test(sidebarSource));

// ---- 5. customer tiles: every kind has a branch, or falls through to a service flow ----
const grid = read('src/components/ServiceGrid.js');
const handledKinds = new Set(matches(grid, /s\.kind === '([a-zA-Z]+)'/g));
const stepComponents = new Set(objectKeys(read('src/screens/ServiceScreen.js'), 'STEP_COMPONENTS'));
for (const m of grid.matchAll(/key: '([a-zA-Z]+)'[^}]*kind: '([a-zA-Z]+)'/g)) {
  const [, key, kind] = m;
  if (kind === 'service') check('customer/service', key, 'no STEP_COMPONENTS entry', stepComponents.has(key));
  else check('customer/kind', `${key} (${kind})`, 'useServiceAction has no branch for this kind', handledKinds.has(kind));
}

// ---- 6. components and screens nothing mounts ----
// The mirror of check 1. The same cleanup that left targets pointing at
// deleted screens also deleted the lines that mounted surviving components:
// BottomNav sat fully written, styled and unreferenced for six days because
// one import went with a retired-screen commit. Nothing catches that - the
// file parses, lints and even themes cleanly, it just never renders.
// Reported as notes, not failures: some of these are genuinely dead code
// waiting to be deleted, and the audit cannot tell which is which. A human
// reads the list and decides.
const orphans = [];
for (const dir of ['src/components', 'src/screens']) {
  for (const file of fs.readdirSync(path.join(root, dir))) {
    if (!file.endsWith('.js')) continue;
    if (!isReachable(`${dir}/${file}`)) orphans.push(`${dir}/${file}`);
  }
}

// ---- 7. every relative import resolves ----
// A cleanup that deletes a file but leaves the import behind does not fail
// a lint or a syntax check - it fails the bundler, which means it is found
// by whoever next tries to ship. That has now happened twice: the chat
// cleanup removed ChatListScreen and SupportChatScreen while App.js kept
// importing them, and categoryService went the same way in AppContext.
// Both made the app impossible to bundle at all.
//
// A failure, not a note: nothing in this list can ship.
for (const file of [...reachable]) {
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  for (const m of src.matchAll(/(?:from\s+|require\(\s*|import\(\s*)['"](\.[^'"]+)['"]/g)) {
    checked += 1;
    if (!resolveFrom(path.resolve(path.dirname(file), m[1]))) {
      check('import', `${path.relative(root, file)} -> '${m[1]}'`, 'no such module - the bundle cannot build', false);
    }
  }
}

// ---- report ----
console.log(`Navigation audit: ${checked} target(s) checked\n`);
for (const n of notes) console.log(`  note: ${n}`);
if (notes.length) console.log('');
if (orphans.length) {
  console.log(`  ${orphans.length} file(s) nothing imports - unreachable, so they never render:`);
  for (const o of orphans) console.log(`    ${o}`);
  console.log('');
}
if (!failures.length) {
  console.log('  All navigation targets resolve.');
  process.exit(0);
}
for (const f of failures) console.log(`  BROKEN  ${f.group.padEnd(24)} ${f.name.padEnd(28)} ${f.verdict}`);
console.log(`\n  ${failures.length} unresolved target(s).`);
process.exit(1);
