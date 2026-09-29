import { describe, it, expect, vi } from 'vitest';
import { SyncOptions } from '../src/sync';
import { syncVault } from '../src/sync';

vi.mock('obsidian', () => ({
  Notice: vi.fn(),
  Plugin: class {},
  App: class {}
}));

vi.mock('child_process', () => {
  const util = require('util');
  const execFile: any = () => {};
  execFile[util.promisify.custom] = async (cmd: string, args: string[], opts: any) => {
    if (args.includes('view') && args.includes('--json') && args.includes('isPrivate')) {
      const url = (opts.cwd || '') + ''; 
      if (url.includes('private')) {
        return { stdout: '{"isPrivate":true}' };
      } else if (url.includes('public')) {
        return { stdout: '{"isPrivate":false}' };
      } else if (url.includes('broken')) {
        throw new Error('gh not found');
      } else {
        return { stdout: '{"isPrivate":true}' };
      }
    }
    return { stdout: '' };
  };
  return { execFile };
});

describe('Public Remote Checks', () => {
  const getFakeGit = (url: string) => ({
    raw: vi.fn().mockImplementation(async (args) => {
      if (args[0] === 'ls-files') return ''; 
      if (args[0] === 'log') return ''; 
      if (args[0] === 'remote' && args[1] === 'get-url') return url;
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
  });

  it('allows push if remote is private', async () => {
    const git = getFakeGit('https://github.com/user/private-repo');
    const opts: SyncOptions = { vaultPath: 'private', conflictStrategy: 'keep-local-copy', commitMessage: 'sync', autoPush: true };
    const res = await syncVault(git as any, opts);
    expect(res.status).toBe('ok');
    expect(git.push).toHaveBeenCalled();
  });

  it('aborts push if remote is public', async () => {
    const git = getFakeGit('https://github.com/user/public-repo');
    const opts: SyncOptions = { vaultPath: 'public', conflictStrategy: 'keep-local-copy', commitMessage: 'sync', autoPush: true };
    const res = await syncVault(git as any, opts);
    expect(res.status).toBe('error');
    expect(res.message).toContain('Repository is PUBLIC');
    expect(git.push).not.toHaveBeenCalled();
  });

  it('aborts push if gh cli fails (e.g. not installed or unauthenticated)', async () => {
    const git = getFakeGit('https://github.com/user/broken-repo');
    const opts: SyncOptions = { vaultPath: 'broken', conflictStrategy: 'keep-local-copy', commitMessage: 'sync', autoPush: true };
    const res = await syncVault(git as any, opts);
    expect(res.status).toBe('error');
    expect(res.message).toContain('Could not verify if remote is private');
    expect(git.push).not.toHaveBeenCalled();
  });

  it('allows push if allowPublicRemote is true, regardless of visibility', async () => {
    const git = getFakeGit('https://github.com/user/public-repo');
    const optsTrue: SyncOptions = { vaultPath: 'public', conflictStrategy: 'keep-local-copy', commitMessage: 'sync', autoPush: true, allowPublicRemote: true };
    const res = await syncVault(git as any, optsTrue);
    expect(res.status).toBe('ok');
    expect(git.push).toHaveBeenCalled();
  });
});
