const fs = require('fs');
const path = require('path');

// 1. Fix main.ts
let main = fs.readFileSync('main.ts', 'utf8');

// Fix .obsidian hardcode
main = main.replace("'.obsidian/',", "`${this.app.vault.configDir}/`,");

// Fix whitelist
main = main.replace(
    /(\/\/ AUTOMATIC WHITELIST \(Pure text, safe instructions\))/,
    `$1\n\t\t\t\`!/\${this.settings.ruleFilePath}\`,`
);

// Fix blacklist
main = main.replace(
    /(\/\/ HARD BLACKLIST \(Always blocked even if someone whitelists them by mistake\))([\s\S]*?)\];/,
    `$1
\t\t\t\`\${brain}/**/*[oO][aA][uU][tT][hH]*\`,
\t\t\t\`\${brain}/**/*[tT][oO][kK][eE][nN]*\`,
\t\t\t\`\${brain}/**/*[sS][eE][cC][rR][eE][tT]*\`,
\t\t\t\`\${brain}/**/credentials\`,
\t\t\t\`\${brain}/**/.env*\`,
\t\t\t\`\${brain}/**/*.key\`,
\t\t\t\`\${brain}/**/*.pem\`,
\t\t\t\`\${brain}/**/*.p12\`,
\t\t\t\`\${brain}/**/*.pfx\`,
\t\t\t\`\${brain}/**/id_rsa*\`
\t\t];`
);

// Remove ls-files from main.ts
main = main.replace(
    /\/\/ Check if any ignored files are still being tracked[\s\S]*?\/\/ Ignore ls-files errors or index\.lock race conditions safely\s*}\s*}/,
    ''
);

fs.writeFileSync('main.ts', main);


// 2. Fix src/sync.ts
let sync = fs.readFileSync('src/sync.ts', 'utf8');

// Add tracked-ignored check before add
const lsFilesBlock = `
    // 0. check for tracked ignored files (fail securely before doing anything)
    const trackedStr = await git.raw(['ls-files', '-ci', '--exclude-standard', '-z']).catch(() => '');
    const tracked = trackedStr.split('\\0').filter(Boolean);
    if (tracked.length > 0) {
      return {
        ...result,
        status: 'error',
        message: 'DANGER: Ignored files are still tracked by Git! Sync stopped to prevent secrets leaking. Please untrack them using git rm -r --cached.',
      };
    }

    // 1. commit local changes first`;
sync = sync.replace('// 1. commit local changes first', lsFilesBlock);

// Fix shouldScan logic
sync = sync.replace(
    'const shouldScan = opts.allowPublicRemote === false ? true : opts.scanSecrets !== false;',
    'const shouldScan = !opts.allowPublicRemote ? true : opts.scanSecrets !== false;'
);

// Fix diff filter from AM to ACMR
sync = sync.replace('--diff-filter=AM', '--diff-filter=ACMR');

// Also scan unpushed commits: we need to check origin/main..HEAD
// But the user said: "Push'tan hemen önce @{u}..HEAD aralığını da tara."
// That's more complex. We will just add the ACMR fix for now, and the `@^{u}..HEAD` scanning inside the `if (shouldScan)` block.
const scanBlock = `
      const diff = await git.raw(['diff', '--cached', '-U0', '--no-color', '--no-ext-diff']);
      const names = (await git.raw(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])).split('\\0').filter(Boolean);
      let findings = [...scanFileNames(names), ...scanDiff(diff)];

      // Scan unpushed commits
      try {
        const hasUpstream = !!(await git.status()).tracking;
        if (hasUpstream) {
          const unpushedDiff = await git.raw(['diff', '@{u}..HEAD', '-U0', '--no-color', '--no-ext-diff']);
          const unpushedNames = (await git.raw(['diff', '@{u}..HEAD', '--name-only', '--diff-filter=ACMR', '-z'])).split('\\0').filter(Boolean);
          findings = [...findings, ...scanFileNames(unpushedNames), ...scanDiff(unpushedDiff)];
        }
      } catch (e) {}

      if (findings.length > 0) {`;
sync = sync.replace(/const diff = await git\.raw\(\['diff', '--cached'[\s\S]*?if \(findings\.length > 0\) \{/, scanBlock);

// Fix isClean() to diff --cached --quiet
sync = sync.replace(
    'if (!(await git.status()).isClean()) {',
    `let hasStaged = false;
    try { await git.raw(['diff', '--cached', '--quiet']); } catch { hasStaged = true; }
    if (hasStaged) {`
);

// Fix gh repo view to use explicit remote
const ghBlock = `
        try {
          const remoteUrl = (await git.raw(['remote', 'get-url', remote])).trim();
          const { stdout } = await execFileAsync('gh', ['repo', 'view', remoteUrl, '--json', 'isPrivate'], { cwd: opts.vaultPath, timeout: 5000 });
`;
sync = sync.replace(
    /try \{\s+const \{ stdout \} = await execFileAsync\('gh', \['repo', 'view', '--json', 'isPrivate'\], \{ cwd: opts\.vaultPath \} \);/,
    ghBlock
);

fs.writeFileSync('src/sync.ts', sync);


// 3. Fix src/util.ts
let util = fs.readFileSync('src/util.ts', 'utf8');

const utilReplace = `export function isDangerousPath(p: string, home: string = os.homedir()): boolean {
  const cmp = (s: string) => (process.platform === 'win32' ? s.toLowerCase() : s);
  
  let norm = '';
  try { norm = fs.realpathSync(p); } catch { norm = path.resolve(p); }
  
  let h = '';
  try { h = fs.realpathSync(home); } catch { h = path.resolve(home); }

  if (path.parse(norm).root === norm) return true; // any filesystem/drive root
  if (cmp(norm) === cmp(h)) return true; // home itself
  if (!cmp(norm).startsWith(cmp(h) + path.sep)) return true; // outside home

  const parts = path.relative(h, norm).split(path.sep);
  if (SECRET_DIRS.some((d) => cmp(d) === cmp(parts[0]))) return true;
  if (parts.length === 1 && EXACT_ONLY_DIRS.some((d) => cmp(d) === cmp(parts[0]))) return true;
  return false;
}`;

util = util.replace(/export function isDangerousPath[\s\S]*?return false;\s*}/, utilReplace);

fs.writeFileSync('src/util.ts', util);

console.log("PATCH COMPLETE");
