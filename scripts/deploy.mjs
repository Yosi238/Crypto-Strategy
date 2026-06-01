/**
 * Safe deploy script.
 * Builds first — if the build fails, nothing is committed or pushed.
 * Usage: npm run deploy
 */

import { execSync } from 'node:child_process';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

console.log('\n[1/4] Building...\n');
try {
  run('npm run build');
} catch {
  console.error('\nBuild failed. Nothing was committed or pushed.\n');
  process.exit(1);
}

console.log('\n[2/4] Staging all changes...\n');
run('git add .');

let hasStagedChanges;
try {
  execSync('git diff --cached --quiet', { stdio: 'pipe' });
  hasStagedChanges = false;
} catch {
  hasStagedChanges = true;
}

if (hasStagedChanges) {
  console.log('\n[3/4] Committing...\n');
  run(`git commit -m "deploy: ${timestamp}"`);
} else {
  console.log('\n[3/4] No file changes to commit.\n');
}

console.log('\n[4/4] Pushing to GitHub...\n');
run('git push');

console.log('\nDeployment pushed. Vercel will update automatically.\n');
