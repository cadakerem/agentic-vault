import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { syncVault, maskSecrets, SyncOptions } from '../src/sync';

// Requires git >= 2.28 (for `init -b`).
let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'av-test-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

// ---------- helpers ----------
async function configure(git: SimpleGit) {
  await git.addConfig('user.name', 'Test');
  await git.addConfig('user.email', 'test@example.com');
  await git.addConfig('commit.gpgsign', 'false');
  await git.addConfig('core.autocrlf', 'false');
}

async function makeRemote(): Promise<string> {
  const dir = path.join(root, 'remote.git');
  fs.mkdirSync(dir);
  await simpleGit(dir).raw(['init', '--bare', '-b', 'main']);
  return dir;
}

/** A brand-new vault: `git init`, remote optional, NO commits, NO upstream. */
async function makeVault(name: string, remote?: string) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir);
  const git = simpleGit(dir);
  await git.raw(['init', '-b', 'main']);
  await configure(git);
  if (remote) await git.addRemote('origin', remote);
  return { dir, git };
}

/** A vault cloned from a remote that already has history (upstream is set). */
async function cloneVault(remote: string, name: string) {
  const dir = path.join(root, name);
  await simpleGit(root).clone(remote, dir);
  const git = simpleGit(dir);
  await configure(git);
  return { dir, git };
}

/** Put the remote into a state with history: one commit containing `files`. */
async function seedRemote(remote: string, files: Record<string, string>) {
  const seed = await makeVault('seed', remote);
  for (const [f, c] of Object.entries(files)) write(seed.dir, f, c);
  await seed.git.add('.');
  await seed.git.commit('seed');
  await seed.git.push(['-u', 'origin', 'main']);
  fs.rmSync(seed.dir, { recursive: true, force: true });
}

const write = (dir: string, file: string, content: string) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), content);
};
const read = (dir: string, file: string) => fs.readFileSync(path.join(dir, file), 'utf8');
const opts = (dir: string, over: Partial<SyncOptions> = {}): SyncOptions => ({
  vaultPath: dir,
  commitMessage: 'auto sync',
  autoPush: true,
  ...over,
});
const remoteFiles = async (remote: string) =>
  (await simpleGit(remote).raw(['ls-tree', '-r', '--name-only', 'main'])).trim().split('\n').filter(Boolean);
const remoteFile = (remote: string, file: string) => simpleGit(remote).raw(['show', `main:${file}`]);
const midRebase = (dir: string) =>
  ['rebase-merge', 'rebase-apply'].some((d) => fs.existsSync(path.join(dir, '.git', d)));

// ---------- 1. first sync ----------
describe('first sync', () => {
  it('(a) pushes a brand-new vault to an EMPTY remote and sets upstream', async () => {
    const remote = await makeRemote();
    const { dir, git } = await makeVault('vault', remote);
    write(dir, 'note.md', 'hello');

    const res = await syncVault(git, opts(dir));

    expect(res.status).toBe('ok');
    expect(res.pushed).toBe(true);
    expect(await remoteFiles(remote)).toEqual(['note.md']);
    expect((await git.status()).tracking).toBe('origin/main');
  });

  it('(b) merges into a remote that already has history (e.g. GitHub created a README)', async () => {
    const remote = await makeRemote();
    await seedRemote(remote, { 'README.md': '# repo' });
    const { dir, git } = await makeVault('vault', remote);
    write(dir, 'note.md', 'hello');

    const res = await syncVault(git, opts(dir));

    expect(res.status).toBe('ok');
    expect((await remoteFiles(remote)).sort()).toEqual(['README.md', 'note.md']);
    expect(midRebase(dir)).toBe(false);
  });

  it('(b2) same file on both sides on first sync -> conflict, repo is left clean', async () => {
    const remote = await makeRemote();
    await seedRemote(remote, { 'README.md': 'remote version' });
    const { dir, git } = await makeVault('vault', remote);
    write(dir, 'README.md', 'local version');

    const res = await syncVault(git, opts(dir));

    expect(res.status).toBe('conflict');
    expect(midRebase(dir)).toBe(false);
    expect(read(dir, 'README.md')).not.toContain('<<<<<<<');
    expect(read(dir, 'README.md')).toBe('local version');
    expect(await remoteFile(remote, 'README.md')).toBe('remote version'); // remote untouched
  });

  it('(c) empty vault, nothing to commit, empty remote -> no crash', async () => {
    const remote = await makeRemote();
    const { dir, git } = await makeVault('vault', remote);

    const res = await syncVault(git, opts(dir));

    expect(res.status).toBe('ok');
    expect(res.committed).toBe(false);
    expect(res.pushed).toBe(false);
  });

  it('(d) no remote configured -> commits locally, reports no-remote', async () => {
    const { dir, git } = await makeVault('vault');
    write(dir, 'note.md', 'hello');

    const res = await syncVault(git, opts(dir));

    expect(res.status).toBe('no-remote');
    expect(res.committed).toBe(true);
    expect((await git.log()).total).toBe(1);
  });

  it('(e) autoPush=false commits but never pushes', async () => {
    const remote = await makeRemote();
    const { dir, git } = await makeVault('vault', remote);
    write(dir, 'note.md', 'hello');

    const res = await syncVault(git, opts(dir, { autoPush: false }));

    expect(res.status).toBe('ok');
    expect(res.committed).toBe(true);
    expect(res.pushed).toBe(false);
    expect((await simpleGit(remote).raw(['branch', '--list'])).trim()).toBe('');
  });

  it('(f) not a git repo -> not-a-repo, nothing thrown', async () => {
    const dir = path.join(root, 'plain');
    fs.mkdirSync(dir);
    const res = await syncVault(simpleGit(dir), opts(dir));
    expect(res.status).toBe('not-a-repo');
  });
});

// ---------- 2. two devices ----------
describe('two devices', () => {
  it('non-overlapping edits from two clones both end up on the remote', async () => {
    const remote = await makeRemote();
    await seedRemote(remote, { 'a.md': 'a' });
    const A = await cloneVault(remote, 'A');
    const B = await cloneVault(remote, 'B');

    write(A.dir, 'from-a.md', '1');
    expect((await syncVault(A.git, opts(A.dir))).status).toBe('ok');
    write(B.dir, 'from-b.md', '2');
    expect((await syncVault(B.git, opts(B.dir))).status).toBe('ok');

    expect((await remoteFiles(remote)).sort()).toEqual(['a.md', 'from-a.md', 'from-b.md']);
  });

  it('(g) rebase conflict: aborted, no markers in files, local commit kept, remote untouched', async () => {
    const remote = await makeRemote();
    await seedRemote(remote, { 'shared.md': 'base' });
    const A = await cloneVault(remote, 'A');
    const B = await cloneVault(remote, 'B');

    write(A.dir, 'shared.md', 'edited on A');
    expect((await syncVault(A.git, opts(A.dir))).status).toBe('ok');

    write(B.dir, 'shared.md', 'edited on B');
    const res = await syncVault(B.git, opts(B.dir));

    expect(res.status).toBe('conflict');
    expect(midRebase(B.dir)).toBe(false);
    expect(read(B.dir, 'shared.md')).toBe('edited on B'); // no <<<<<<< markers
    expect((await B.git.log()).latest?.message).toBe('auto sync'); // local work preserved
    expect(await remoteFile(remote, 'shared.md')).toBe('edited on A');
  });

  it('(h) after a conflict, the NEXT auto-sync stays safe (still conflict, never commits markers)', async () => {
    const remote = await makeRemote();
    await seedRemote(remote, { 'shared.md': 'base' });
    const A = await cloneVault(remote, 'A');
    const B = await cloneVault(remote, 'B');
    write(A.dir, 'shared.md', 'A');
    await syncVault(A.git, opts(A.dir));
    write(B.dir, 'shared.md', 'B');
    await syncVault(B.git, opts(B.dir));

    const again = await syncVault(B.git, opts(B.dir));

    expect(again.status).toBe('conflict');
    expect(read(B.dir, 'shared.md')).toBe('B');
    expect(await remoteFile(remote, 'shared.md')).toBe('A');
  });
});

// ---------- 3. silent-mode safety ----------
describe('interrupted repo state', () => {
  it('(i) mid-rebase repo: sync refuses, does not commit new files', async () => {
    const remote = await makeRemote();
    await seedRemote(remote, { 'a.md': 'a' });
    const { dir, git } = await cloneVault(remote, 'vault');
    fs.mkdirSync(path.join(dir, '.git', 'rebase-merge')); // simulate a stuck rebase
    write(dir, 'new.md', 'x');
    const before = (await git.log()).total;

    const res = await syncVault(git, opts(dir));

    expect(res.status).toBe('rebase-in-progress');
    expect((await git.log()).total).toBe(before);
    expect((await git.status()).not_added).toContain('new.md');
  });
});

// ---------- 4. error masking ----------
describe('maskSecrets', () => {
  it('hides credentials in URLs', () => {
    const out = maskSecrets('fatal: unable to access https://ghp_SECRET123@github.com/u/r.git/: 403');
    expect(out).not.toContain('ghp_SECRET123');
    expect(out).toContain('https://***@github.com/u/r.git');
  });
  it('hides user:password pairs', () => {
    expect(maskSecrets('https://user:pw@host/x')).toBe('https://***@host/x');
  });
  it('does not eat text between a URL and a later @', () => {
    const msg = 'see https://github.com/u/r.git\ncontact me@example.com';
    expect(maskSecrets(msg)).toBe(msg);
  });
});

// ---------- 5. secret scan ----------
const FAKE_GH = 'ghp' + '_' + 'a1B2'.repeat(9); // built at runtime: no token-shaped literal in the repo

describe('secret scan in the sync flow', () => {
  it('(j) blocks a first sync that contains a token: nothing committed, nothing pushed, index clean', async () => {
    const remote = await makeRemote();
    const { dir, git } = await makeVault('vault', remote);
    write(dir, 'ok.md', 'fine');
    write(dir, 'notes/keys.md', `my token ${FAKE_GH}`);

    const res = await syncVault(git, opts(dir));

    expect(res.status).toBe('secrets-found');
    expect(res.findings?.[0]).toMatchObject({ file: 'notes/keys.md', rule: 'github-token' });
    expect(JSON.stringify(res)).not.toContain(FAKE_GH); // result/message never carries the secret
    expect(res.committed).toBe(false);
    expect(res.pushed).toBe(false);
    expect((await git.status()).staged).toEqual([]); // unstaged again (files stay on disk)
    expect(read(dir, 'notes/keys.md')).toContain(FAKE_GH);
    expect((await simpleGit(remote).raw(['branch', '--list'])).trim()).toBe('');
  });

  it('(k) stays blocked while the secret is there, and syncs normally once it is removed', async () => {
    const remote = await makeRemote();
    const { dir, git } = await makeVault('vault', remote);
    write(dir, 'keys.md', FAKE_GH);
    expect((await syncVault(git, opts(dir))).status).toBe('secrets-found');
    expect((await syncVault(git, opts(dir))).status).toBe('secrets-found');

    write(dir, 'keys.md', 'removed');
    const res = await syncVault(git, opts(dir));

    expect(res.status).toBe('ok');
    expect(await remoteFile(remote, 'keys.md')).toBe('removed');
  });

  it('(l) blocks sensitive file names such as .env', async () => {
    const remote = await makeRemote();
    const { dir, git } = await makeVault('vault', remote);
    write(dir, '.env', 'A=1');
    const res = await syncVault(git, opts(dir));
    expect(res.status).toBe('secrets-found');
    expect(res.findings?.[0].rule).toBe('sensitive-filename');
  });

  it('(m) a hit on an already-cloned repo leaves history and remote untouched', async () => {
    const remote = await makeRemote();
    await seedRemote(remote, { 'a.md': 'a' });
    const { dir, git } = await cloneVault(remote, 'vault');
    write(dir, 'leak.md', FAKE_GH);
    const before = (await git.log()).total;

    const res = await syncVault(git, opts(dir));

    expect(res.status).toBe('secrets-found');
    expect((await git.log()).total).toBe(before);
    expect(await remoteFiles(remote)).toEqual(['a.md']);
  });

  it('(n) removing a secret does not trigger the scanner (only added lines are scanned)', async () => {
    const remote = await makeRemote();
    const { dir, git } = await makeVault('vault', remote);
    write(dir, 'keys.md', FAKE_GH);
    expect((await syncVault(git, opts(dir, { scanSecrets: false }))).status).toBe('ok'); // simulate old leak
    write(dir, 'keys.md', 'cleaned');

    const res = await syncVault(git, opts(dir));

    expect(res.status).toBe('ok');
    expect(res.pushed).toBe(true);
  });

  it('(o) scanSecrets:false disables the check', async () => {
    const remote = await makeRemote();
    const { dir, git } = await makeVault('vault', remote);
    write(dir, 'keys.md', FAKE_GH);
    expect((await syncVault(git, opts(dir, { scanSecrets: false }))).status).toBe('ok');
  });
});
