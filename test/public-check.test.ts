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
  const execFile: any = vi.fn();
  execFile[util.promisify.custom] = async (cmd: string, args: string[], opts: any) => {
    execFile(cmd, args, opts); // for toHaveBeenCalledWith checks
    if (args.includes('view') && args.includes('--json') && args.includes('isPrivate')) {
      const repo = args[2];
      if (repo.includes('private')) {
        return { stdout: '{"isPrivate":true}' };
      } else if (repo.includes('public')) {
        return { stdout: '{"isPrivate":false}' };
      } else if (repo.includes('broken')) {
        throw new Error('gh not found');
      } else {
        return { stdout: '{"isPrivate":true}' };
      }
    }
    return { stdout: '' };
  };
  return { execFile };
});

import { execFile } from 'child_process';

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

  const opts: SyncOptions = { vaultPath: 'fake', conflictStrategy: 'keep-local-copy', commitMessage: 'sync', autoPush: true };

  it('allows push if remote is private (HTTPS)', async () => {
    const git = getFakeGit('https://github.com/owner/private-repo.git');
    const res = await syncVault(git as any, { ...opts, allowPublicRemote: false });
    expect(res.status).toBe('ok');
    expect(git.push).toHaveBeenCalled();
    expect(execFile).toHaveBeenCalledWith('gh', ['repo', 'view', 'owner/private-repo', '--json', 'isPrivate'], expect.anything());
  });

  it('allows push if remote is private (SSH)', async () => {
    const git = getFakeGit('git@github.com:owner/private-repo.git');
    const res = await syncVault(git as any, { ...opts, allowPublicRemote: false });
    expect(res.status).toBe('ok');
    expect(git.push).toHaveBeenCalled();
    expect(execFile).toHaveBeenCalledWith('gh', ['repo', 'view', 'owner/private-repo', '--json', 'isPrivate'], expect.anything());
  });

  it('aborts push if remote is public', async () => {
    const git = getFakeGit('https://github.com/owner/public-repo');
    const res = await syncVault(git as any, { ...opts, allowPublicRemote: false });
    expect(res.status).toBe('error');
    expect(res.message).toContain('Repository is PUBLIC');
    expect(git.push).not.toHaveBeenCalled();
  });

  it('aborts push if non-GitHub remote is used', async () => {
    const git = getFakeGit('https://gitlab.com/owner/repo.git');
    const res = await syncVault(git as any, { ...opts, allowPublicRemote: false });
    expect(res.status).toBe('error');
    expect(res.message).toContain('not a recognized GitHub URL');
    expect(git.push).not.toHaveBeenCalled();
    expect(execFile).not.toHaveBeenCalledWith('gh', expect.anything(), expect.anything());
  });

  it('aborts push if allowPublicRemote is undefined (treats as false)', async () => {
    const git = getFakeGit('https://github.com/owner/public-repo');
    const res = await syncVault(git as any, { ...opts, allowPublicRemote: undefined });
    expect(res.status).toBe('error');
    expect(res.message).toContain('Repository is PUBLIC');
    expect(git.push).not.toHaveBeenCalled();
  });
});
