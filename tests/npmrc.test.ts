import { describe, it, expect } from 'vitest';
import { syncVault } from '../src/sync';
import { makeRemote, makeVault, write } from './util';

describe('npmrc test', () => {
  it('blocks .npmrc', async () => {
    const remote = await makeRemote();
    const { dir, git } = await makeVault('vault', remote);
    write(dir, '.npmrc', 'fake');
    const res = await syncVault(git, { vaultPath: dir, commitMessage: 't', autoPush: true });
    expect(res.status).toBe('secrets-found');
  });
});
