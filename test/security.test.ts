import { describe, it, expect, vi } from 'vitest';
vi.mock('obsidian', () => ({
  Notice: vi.fn(),
  Plugin: class {},
  App: class {}
}));

import { syncVault } from '../src/sync';
import { simpleGit } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';

describe('Agentic Vault Security Tests', () => {
  it('blocks a secret that was added and removed on a merged side branch', async () => {
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'av-test-'));
    const remoteDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'av-remote-'));
    
    // Create local remote
    const remoteGit = simpleGit(remoteDir);
    await remoteGit.init(true);
    
    const git = simpleGit(tmp);
    await git.init();
    
    await git.addConfig('user.name', 'Tester');
    await git.addConfig('user.email', 'test@example.com');
    await git.addRemote('origin', remoteDir);
    
    fs.writeFileSync(path.join(tmp, 'dummy.txt'), 'hello\\n');
    await git.add('dummy.txt');
    await git.commit('init');
    await git.push('origin', 'master');
    
    await git.checkoutLocalBranch('feature');
    fs.writeFileSync(path.join(tmp, 'secret.txt'), 'AKIAZ7Q4M2XK9WD3RTP6\\n');
    await git.add('secret.txt');
    await git.commit('add secret');
    
    fs.unlinkSync(path.join(tmp, 'secret.txt'));
    await git.add('secret.txt');
    await git.commit('remove secret');
    
    await git.checkout('master');
    await git.merge(['--no-ff', 'feature']);
    
    const opts = { vaultPath: tmp, conflictStrategy: 'copy', allowPublicRemote: true };
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
    
    const opts = { vaultPath: '.', conflictStrategy: 'copy' };
    const res = await syncVault(fakeGit as any, opts);
    
    expect(res.status).toBe('error');
    expect(res.message).toContain('boom');
    expect(fakeGit.commit).not.toHaveBeenCalled();
    expect(fakeGit.push).not.toHaveBeenCalled();
  });
});
