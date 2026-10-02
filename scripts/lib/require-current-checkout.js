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

/** The path a `git status --porcelain` line refers to. */
function pathOf(line) {
  const p = line.slice(3).trim();
  const renamed = p.split(' -> ');
  return (renamed.length > 1 ? renamed[1] : p).replace(/^"|"$/g, '');
}

/**
 * @param {string} what  what is about to ship, for the error text
 * @param {string} rerun the command to run again once the checkout is fixed
 * @param {object} [options]
 * @param {string[]} [options.shipPaths]
 *   The directories this particular upload actually sends. `firebase deploy`
 *   uploads firebase.json's "source": "functions" and nothing else, so a
 *   scratch file at the repo root cannot reach production and blocking on it
 *   is a guard being wrong rather than careful - which is how people learn to
 *   work around guards. Omit it when the whole directory ships, as it does for
 *   an EAS build or an OTA publish.
 */
function requireCurrentCheckout(what, rerun, { shipPaths } = {}) {
  console.log('Checking the tree before uploading it...\n');

  try {
    // GIT_TERMINAL_PROMPT=0 so a remote with no stored credentials fails
    // immediately instead of printing "Username for ..." from inside a
    // script and sitting there. The prompt is invisible behind the
    // spawn and reads as a hang.
    execSync('git fetch origin main', {
      stdio: 'pipe',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo' },
    });
  } catch (e) {
    const detail = String((e && e.stderr) || '');
    // "Could not reach origin" was wrong often enough to be misleading: the
    // usual cause is an https remote with nothing stored, which is an auth
    // problem, not a network one, and "fix the network" sends you nowhere.
    const isAuth = /could not read (Username|Password)|terminal prompts disabled|Authentication failed|Invalid username or password|could not read from remote repository/i.test(detail);
    die(
      isAuth
        ? 'git could not authenticate to origin, so this checkout cannot be checked.'
        : 'Could not reach origin to check whether this checkout is current.',
      `Publishing blind is how the last two updates shipped stale code, so ${what} stops here.`,
      '',
      isAuth
        ? [
          'The remote is https and has no stored credentials, so every fetch asks',
          'for a username and password. Store them once:',
          '',
          '  git config --global credential.helper store',
          '  git fetch origin main',
          '',
          'Enter your GitHub username, and a personal access token as the password',
          '(github.com/settings/tokens, scope: repo). GitHub stopped accepting account',
          'passwords over https in 2021. The token is kept in ~/.git-credentials in',
          'plain text, so use a token you can revoke rather than one you reuse.',
        ].join('\n')
        : 'Fix the network, or re-run once `git fetch origin main` works.',
      '',
      detail ? `git said:\n${detail.trim().split('\n').map((l) => `  ${l}`).join('\n')}` : '',
    );
  }

  const dirty = git('status --porcelain').split('\n').filter(Boolean);
  const inScope = (line) => !shipPaths
    || shipPaths.some((p) => pathOf(line) === p || pathOf(line).startsWith(`${p}/`));
  const shipping = dirty.filter(inScope);
  const elsewhere = dirty.filter((l) => !inScope(l));

  if (shipping.length) {
    die(
      `This checkout has uncommitted changes in what ${what} uploads:`,
      shipping.map((l) => `  ${l}`).join('\n'),
      '',
      'Whatever is uncommitted would ship and then be impossible to',
      'reproduce from the repository. Commit it or stash it first.',
    );
  }
  if (elsewhere.length) {
    console.log(`Uncommitted elsewhere in the tree (not uploaded by ${what}):`);
    for (const line of elsewhere) console.log(`  ${line}`);
    console.log('');
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

  // Say what was actually checked: "tree clean" would be untrue when there
  // are uncommitted files the upload simply does not carry.
  console.log(`On origin/main at ${head.slice(0, 7)}, ${shipPaths ? `${shipPaths.join(', ')} clean` : 'tree clean'}.\n`);
  return head;
}

module.exports = { requireCurrentCheckout };
