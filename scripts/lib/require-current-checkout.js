/**
 * Refuse to ship anything but what is on origin/main.
 *
 * Both of the ways this project ships upload THE LOCAL DIRECTORY, not a
 * branch:
 *
 *   eas workflow:run   - uploads the project directory (--ref needs the
 *                        Expo project linked to a GitHub repo, and it is
 *                        not: "No repository found for appId 5f0bbeb3-...")
 *   firebase deploy    - uploads firebase.json's "source": "functions"
 *
 * That already cost two published OTAs: the checkout sat at bcbe5d5 while
 * main had moved six merges ahead, so both shipped code from before the
 * fixes they were meant to deliver and the app looked unchanged. A Cloud
 * Functions deploy has the same shape and a worse failure - it would
 * quietly put the old function back over a newer one.
 */
const { execSync } = require('child_process');

const git = (cmd) => execSync(`git ${cmd}`, { encoding: 'utf8' }).trim();

function die(...lines) {
  console.error(`\n${lines.filter(Boolean).join('\n')}\n`);
  process.exit(1);
}

/**
 * @param {string} what  what is about to ship, for the error text
 * @param {string} rerun the command to run again once the checkout is fixed
 */
function requireCurrentCheckout(what, rerun) {
  console.log('Checking the tree before uploading it...\n');

  try {
    execSync('git fetch origin main', { stdio: 'pipe' });
  } catch (e) {
    die(
      'Could not reach origin to check whether this checkout is current.',
      `Publishing blind is how the last two updates shipped stale code, so ${what} stops here.`,
      'Fix the network, or re-run once `git fetch origin main` works.',
    );
  }

  const dirty = git('status --porcelain');
  if (dirty) {
    die(
      'This checkout has uncommitted changes:',
      dirty.split('\n').map((l) => `  ${l}`).join('\n'),
      '',
      'Whatever is uncommitted would ship and then be impossible to',
      'reproduce from the repository. Commit it or stash it first.',
    );
  }

  const head = git('rev-parse HEAD');
  const target = git('rev-parse origin/main');

  if (head !== target) {
    const behind = git(`log --oneline ${head}..${target}`);
    const ahead = git(`log --oneline ${target}..${head}`);
    die(
      `This checkout is NOT origin/main, so ${what} would ship the wrong code.`,
      `  HEAD        ${head.slice(0, 7)}`,
      `  origin/main ${target.slice(0, 7)}`,
      behind ? `\nMissing from this checkout:\n${behind.split('\n').map((l) => `  ${l}`).join('\n')}` : '',
      ahead ? `\nHere but not on main:\n${ahead.split('\n').map((l) => `  ${l}`).join('\n')}` : '',
      '',
      'To ship what is on main:',
      '  git checkout main && git reset --hard origin/main',
      `  ${rerun}`,
    );
  }

  console.log(`On origin/main at ${head.slice(0, 7)}, tree clean.\n`);
  return head;
}

module.exports = { requireCurrentCheckout };
