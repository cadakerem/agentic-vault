import { simpleGit } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncVault, SyncOptions } from '../src/sync';
import * as child_process from 'child_process';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

describe('Security Critical Paths in syncVault', () => {
  let mockGit: any;
  let baseOpts: SyncOptions;

  beforeEach(() => {
    vi.resetAllMocks();

    mockGit = {
      checkIsRepo: vi.fn().mockResolvedValue(true),
      status: vi.fn().mockResolvedValue({ isClean: () => true, tracking: 'origin/main', conflicted: [] }),
      raw: vi.fn().mockResolvedValue(''),
      getRemotes: vi.fn().mockResolvedValue([{ name: 'origin' }]),
      pull: vi.fn().mockResolvedValue({}),
      push: vi.fn().mockResolvedValue({}),
      commit: vi.fn().mockResolvedValue({}),
    };

    mockGit.raw.mockImplementation((args: string[]) => {
      if (args[0] === 'remote' && args[1] === 'get-url') {
        if (args.includes('broken')) return Promise.resolve('');
        if (args.includes('gitlab')) return Promise.resolve('https://gitlab.com/user/repo.git');
        if (args.includes('https')) return Promise.resolve('https://github.com/user/repo.git');
        return Promise.resolve('git@github.com:cadakerem/agentic-vault.git');
      }
      if (args[0] === 'symbolic-ref') return Promise.resolve('main');
      if (args[0] === 'rev-parse') return Promise.resolve('commit_hash'); // hasCommits
      if (args[0] === 'diff' && args.includes('--name-only')) return Promise.resolve('');
      if (args[0] === 'diff' && args.includes('--cached')) return Promise.resolve('');
      return Promise.resolve('');
    });

    baseOpts = {
      vaultPath: '/mock/vault',
      commitMessage: 'test',
      autoPush: true,
      allowPublicRemote: false,
    };
  });

  it('fails closed when gh CLI throws an error', async () => {
    vi.spyOn(child_process, 'execFile').mockImplementation((cmd, args, opts, cb) => {
      // NOTE: intentional signature mismatch (2 args instead of 3) to simulate util.promisify destructuring fallback.
      // Verify against real execFile behavior if Node version changes.
      if (typeof cb === 'function') (cb as any)(new Error('Command failed'), { stdout: '', stderr: '' });
      return {} as any;
    });

    const result = await syncVault(mockGit, baseOpts);
    
    expect(result.status).toBe('error');
    expect(result.message).toContain('Push aborted: Could not verify if remote is private');
    expect(mockGit.push).not.toHaveBeenCalled();
  });

  it('fails closed when gh CLI returns isPrivate: false', async () => {
    vi.spyOn(child_process, 'execFile').mockImplementation((cmd, args, opts, cb) => {
      // util.promisify on a function without the custom symbol resolves to the first non-error argument.
      // So we must pass { stdout, stderr } as the second argument!
      // NOTE: intentional signature mismatch (2 args instead of 3) to simulate util.promisify destructuring fallback.
      // Verify against real execFile behavior if Node version changes.
      if (typeof cb === 'function') (cb as any)(null, { stdout: JSON.stringify({ isPrivate: false }), stderr: '' });
      return {} as any;
    });

    const result = await syncVault(mockGit, baseOpts);
    
    expect(result.status).toBe('error');
    expect(result.message).toContain('Push aborted: Repository is PUBLIC');
    expect(mockGit.push).not.toHaveBeenCalled();
  });

  it('allows push when gh CLI returns isPrivate: true', async () => {
    vi.spyOn(child_process, 'execFile').mockImplementation((cmd, args, opts, cb) => {
      // NOTE: intentional signature mismatch (2 args instead of 3) to simulate util.promisify destructuring fallback.
      // Verify against real execFile behavior if Node version changes.
      if (typeof cb === 'function') (cb as any)(null, { stdout: JSON.stringify({ isPrivate: true }), stderr: '' });
      return {} as any;
    });

    const result = await syncVault(mockGit, baseOpts);
    
    expect(result.status).toBe('ok');
    expect(result.pushed).toBe(true);
    expect(mockGit.push).toHaveBeenCalled();
  });

  it('fails closed when remote URL cannot be fetched', async () => {
    baseOpts.remote = 'broken'; mockGit.getRemotes.mockResolvedValue([{ name: 'broken' }]);
    const result = await syncVault(mockGit, baseOpts);
    
    expect(result.status).toBe('error');
    expect(result.message).toContain('Could not fetch URL for remote');
    expect(mockGit.push).not.toHaveBeenCalled();
  });

  it('fails closed when remote is not a GitHub URL (GitLab HTTPS)', async () => {
    baseOpts.remote = 'gitlab'; mockGit.getRemotes.mockResolvedValue([{ name: 'gitlab' }]);
    const result = await syncVault(mockGit, baseOpts);
    
    expect(result.status).toBe('error');
    expect(result.message).toContain('not a recognized GitHub URL');
    expect(mockGit.push).not.toHaveBeenCalled();
  });

  it('allows push when gh CLI returns isPrivate: true (HTTPS)', async () => {
    baseOpts.remote = 'https'; mockGit.getRemotes.mockResolvedValue([{ name: 'https' }]);
    vi.spyOn(child_process, 'execFile').mockImplementation((cmd, args, opts, cb) => {
      if (typeof cb === 'function') (cb as any)(null, { stdout: JSON.stringify({ isPrivate: true }), stderr: '' });
      return {} as any;
    });

    const result = await syncVault(mockGit, baseOpts);
    
    expect(result.status).toBe('ok');
    expect(result.pushed).toBe(true);
    expect(mockGit.push).toHaveBeenCalled();
  });
});




vi.mock('obsidian', () => ({
  Notice: vi.fn(),
  Plugin: class {},
  App: class {}
}));






describe('Agentic Vault Security Tests', () => {
  it('blocks a secret that was added and removed on a merged side branch', async () => {
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'av-test-'));
    const remoteDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'av-remote-'));
    
    const remoteGit = simpleGit(remoteDir);
    await remoteGit.init(true);
    
    const git = simpleGit(tmp);
    await git.init();
    
    await git.addConfig('user.name', 'Tester');
    await git.addConfig('user.email', 'test@example.com');
    await git.addRemote('origin', remoteDir);
    
    fs.writeFileSync(path.join(tmp, 'dummy.txt'), 'hello\n');
    await git.add('dummy.txt');
    await git.commit('init');
    await git.push('origin', 'master');
    
    await git.checkoutLocalBranch('feature');
    fs.writeFileSync(path.join(tmp, 'secret.txt'), 'AKIAZ7Q4M2XK9WD3RTP6\n');
    await git.add('secret.txt');
    await git.commit('add secret');
    
    fs.unlinkSync(path.join(tmp, 'secret.txt'));
    await git.add('secret.txt');
    await git.commit('remove secret');
    
    await git.checkout('master');
    await git.merge(['--no-ff', 'feature']);
    
    const opts: SyncOptions = { vaultPath: tmp, conflictStrategy: 'keep-local-copy', allowPublicRemote: true, commitMessage: 'sync', autoPush: true };
    const res = await syncVault(git, opts);
    
    expect(res.status).toBe('secrets-found');
    expect(res.message).toContain('1 potential secret(s) found');
  });

  it('stops before commit/push when ls-files throws', async () => {
    const fakeGit = {
      raw: vi.fn().mockImplementation(async (args) => {
        if (args[0] === 'ls-files') throw new Error('boom');
        return '';
      }),
      checkIsRepo: vi.fn().mockResolvedValue(true),
      getRemotes: vi.fn().mockResolvedValue([{ name: 'origin' }]),
      status: vi.fn().mockResolvedValue({ current: 'master', tracking: 'origin/master', isClean: () => true, files: [] }),
      diff: vi.fn().mockResolvedValue(''),
      add: vi.fn(),
      commit: vi.fn(),
      push: vi.fn(),
      pull: vi.fn()
    };
    
    const opts: SyncOptions = { vaultPath: '.', conflictStrategy: 'keep-local-copy', commitMessage: 'sync', autoPush: true };
    const res = await syncVault(fakeGit as any, opts);
    
    expect(res.status).toBe('error');
    expect(res.message).toContain('boom');
    expect(fakeGit.commit).not.toHaveBeenCalled();
    expect(fakeGit.push).not.toHaveBeenCalled();
  });
});
