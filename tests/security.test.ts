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
      if (typeof cb === 'function') (cb as any)(null, { stdout: JSON.stringify({ isPrivate: true }), stderr: '' });
      return {} as any;
    });

    const result = await syncVault(mockGit, baseOpts);
    
    expect(result.status).toBe('ok');
    expect(result.pushed).toBe(true);
    expect(mockGit.push).toHaveBeenCalled();
  });
});
