/**
 * Flags a file that imports useApp but never calls it.
 *
 * This is precisely the bug dce7a84 shipped. "chore: remove retired
 * Marketplace and Social modules" needed to drop marketplaceCategories,
 * socialLinks and openDirectChat from AdminHomeScreen's context
 * destructure, and deleted the whole `... } = useApp();` line instead.
 * The import stayed. Every context value the screen read - viewingSection,
 * setHomeBackInterceptor, profile, rates, the lot - became an undeclared
 * identifier, and the screen threw
 *
 *   ReferenceError: Property 'viewingSection' doesn't exist
 *
 * on its first render. It sat broken for ten days, because App Check
 * enforcement was blocking sign-in and no admin could reach the dashboard
 * to find out.
 *
 * Nothing else in the repo sees this. The file parses, every import
 * resolves, audit:nav is happy - the identifier is simply never declared,
 * and only Hermes running that screen notices.
 *
 * The check is deliberately narrow: an unused import of a hook whose only
 * purpose is to be called. A broader "reads a name it never destructured"
 * scan was tried first and produced 98 findings, nearly all local
 * variables that happen to share a name with a context key (screen, can,
 * submitting). A check nobody can trust is worse than no check.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const q = path.join(dir, e.name);
    e.isDirectory() ? walk(q, out) : q.endsWith('.js') && out.push(q);
  }
  return out;
};

const failures = [];
let checked = 0;
for (const file of walk(path.join(ROOT, 'src'))) {
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  if (!/import\s*\{[^}]*\buseApp\b[^}]*\}\s*from/.test(src)) continue;
  checked++;
  if (/\buseApp\s*\(/.test(src)) continue;
  failures.push(`${path.relative(ROOT, file)}: imports useApp but never calls it - every context value it reads is undefined`);
}

if (failures.length) {
  console.log(`FAILURES (${failures.length}):`);
  failures.forEach((f) => console.log('  ' + f));
  process.exit(1);
}
console.log(`Context usage audit: all ${checked} file(s) that import useApp call it.`);
