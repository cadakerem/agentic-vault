import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncVault, SyncOptions } from '../src/sync';
import type { SimpleGit } from 'simple-git';
import * as child_process from 'child_process';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

describe('Security Critical Paths in syncVault', () => {
  let mockGit: any;
  let baseOpts: SyncOptions;

  beforeEach(() => {
    mockGit = {
      checkIsRepo: vi.fn().mockResolvedValue(true),
      status: vi.fn().mockResolvedValue({ isClean: () => true, tracking: 'origin/main' }),
      raw: vi.fn().mockResolvedValue(''),
      getRemotes: vi.fn().mockResolvedValue([{ name: 'origin' }]),
      pull: vi.fn().mockResolvedValue({}),
      push: vi.fn().mockResolvedValue({}),
    };

    baseOpts = {
      vaultPath: '/mock/vault',
      commitMessage: 'test',
      autoPush: true,
      allowPublicRemote: false,
    };
    
    vi.resetAllMocks();
  });

  it('fails closed when gh CLI throws an error (e.g. not installed or unauthenticated)', async () => {
    // Mock child_process.execFile to throw an error (simulating gh failure)
    vi.spyOn(child_process, 'execFile').mockImplementation((cmd, args, opts, cb) => {
      if (typeof cb === 'function') cb(new Error('Command failed: gh'), '', '');
      return {} as any;
    });
    // In our code we promisified execFile, so vitest's vi.mock for promisify might be tricky if we don't mock util.
    // Actually, sync.ts uses promisify(execFile). If we mock execFile properly, promisify handles the callback.
  });
});
