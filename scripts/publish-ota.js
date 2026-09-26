#!/usr/bin/env node
/**
 * Publish the production OTA, refusing to publish stale code.
 *
 * `eas workflow:run` without `--ref` uploads THE LOCAL DIRECTORY, not the
 * branch. That is easy to miss and it cost two published updates: the
 * checkout sat at bcbe5d5 while main had moved six merges ahead, so both
 * publishes shipped code from before the fixes they were meant to deliver,
 * and the app looked unchanged.
 *
 * `--ref main` is the obvious answer and does not work here: it needs the
 * Expo project linked to a GitHub repository, and this one is not -
 *   [GraphQL] No repository found for appId 5f0bbeb3-...
 * Until that link exists, the local tree IS what ships, so the only safe
 * thing is to check the tree before uploading it.
 *
 * Refuses unless HEAD equals origin/main and nothing is uncommitted.
 */
const { execSync, spawnSync } = require('child_process');

const git = (cmd) => execSync(`git ${cmd}`, { encoding: 'utf8' }).trim();
const die = (...lines) => {
  console.error(`\n${lines.join('\n')}\n`);
  process.exit(1);
};

console.log('Checking the tree before uploading it...\n');

try {
  execSync('git fetch origin main', { stdio: 'pipe' });
} catch (e) {
  die(
    'Could not reach origin to check whether this checkout is current.',
    'Publishing blind is how the last two updates shipped stale code, so this stops here.',
    'Fix the network, or re-run once `git fetch origin main` works.',
  );
}

const dirty = git('status --porcelain');
if (dirty) {
  die(
    'This checkout has uncommitted changes:',
    dirty.split('\n').map((l) => `  ${l}`).join('\n'),
    '',
    'Whatever is uncommitted would be published and then be impossible to',
    'reproduce from the repository. Commit it or stash it first.',
  );
}

const head = git('rev-parse HEAD');
const target = git('rev-parse origin/main');

if (head !== target) {
  const behind = git(`log --oneline ${head}..${target}`);
  const ahead = git(`log --oneline ${target}..${head}`);
  die(
    `This checkout is NOT origin/main, so publishing would ship the wrong code.`,
    `  HEAD        ${head.slice(0, 7)}`,
    `  origin/main ${target.slice(0, 7)}`,
    behind ? `\nMissing from this checkout:\n${behind.split('\n').map((l) => `  ${l}`).join('\n')}` : '',
    ahead ? `\nHere but not on main:\n${ahead.split('\n').map((l) => `  ${l}`).join('\n')}` : '',
    '',
    'To publish what is on main:',
    '  git checkout main && git reset --hard origin/main',
    '  npm run publish:ota',
  );
}

console.log(`On origin/main at ${head.slice(0, 7)}, tree clean.\n`);

// --dry-run stops here, having proved the checks pass. It is how the happy
// path is tested without spending a publish.
if (process.argv.includes('--dry-run')) {
  console.log('--dry-run: checks passed, not publishing.');
  process.exit(0);
}

console.log('Publishing.\n');

const args = [
  'eas-cli@latest',
  'workflow:run',
  '.eas/workflows/publish-ota.yml',
  '--wait',
  ...process.argv.slice(2).filter((a) => a !== '--dry-run'),
];
const run = spawnSync('npx', args, { stdio: 'inherit' });
process.exit(run.status == null ? 1 : run.status);
