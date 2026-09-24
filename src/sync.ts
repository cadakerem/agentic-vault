import * as fs from 'fs';
import * as path from 'path';
import type { SimpleGit } from 'simple-git';

// NOTE: this file must NOT import 'obsidian' so vitest can load it.
// main.ts should call syncVault() and only handle Notices / status bar.

export type SyncStatus =
  | 'ok'
  | 'conflict'
  | 'rebase-in-progress'
  | 'no-remote'
  | 'not-a-repo'
  | 'error';

export interface SyncOptions {
  vaultPath: string;
  commitMessage: string;
  autoPush: boolean;
  remote?: string; // default: origin
}

export interface SyncResult {
  status: SyncStatus;
  message?: string;
  committed: boolean;
  pushed: boolean;
}

export function maskSecrets(msg: string): string {
  return msg.replace(/https?:\/\/[^\s/@]+@/g, 'https://***@');
}

function isMidRebase(vaultPath: string): boolean {
  const gitDir = path.join(vaultPath, '.git');
  return ['rebase-merge', 'rebase-apply'].some((d) => fs.existsSync(path.join(gitDir, d)));
}

async function currentBranch(git: SimpleGit): Promise<string> {
  try {
    // works on an unborn branch too (fresh `git init`)
    return (await git.raw(['symbolic-ref', '--short', 'HEAD'])).trim() || 'main';
  } catch {
    return 'main';
  }
}

async function hasCommits(git: SimpleGit): Promise<boolean> {
  try {
    await git.raw(['rev-parse', '--verify', 'HEAD']);
    return true;
  } catch {
    return false;
  }
}

export async function syncVault(git: SimpleGit, opts: SyncOptions): Promise<SyncResult> {
  const remote = opts.remote ?? 'origin';
  const result: SyncResult = { status: 'ok', committed: false, pushed: false };

  try {
    if (!(await git.checkIsRepo())) return { ...result, status: 'not-a-repo' };

    if (isMidRebase(opts.vaultPath)) {
      return {
        ...result,
        status: 'rebase-in-progress',
        message: 'Rebase in progress. Resolve conflicts or abort.',
      };
    }

    // 1. commit local changes first
    await git.add('.');
    if (!(await git.status()).isClean()) {
      await git.commit(opts.commitMessage);
      result.committed = true;
    }

    // Nothing committed yet anywhere -> nothing to pull or push.
    if (!(await hasCommits(git))) return result;

    // 2. remote check
    const remotes = await git.getRemotes();
    if (!remotes.some((r) => r.name === remote)) {
      return { ...result, status: 'no-remote', message: 'No remote configured.' };
    }

    const branch = await currentBranch(git);
    const hasUpstream = !!(await git.status()).tracking;

    // 3. pull --rebase (one shared try/catch for both paths)
    try {
      if (hasUpstream) {
        await git.pull(['--rebase']);
      } else {
        const heads = await git.listRemote(['--heads', remote, branch]);
        if (heads.trim() !== '') await git.pull(remote, branch, ['--rebase']);
      }
    } catch (e) {
      if (isMidRebase(opts.vaultPath)) {
        await git.raw(['rebase', '--abort']).catch(() => undefined);
        return {
          ...result,
          status: 'conflict',
          message: 'Merge conflict! Rebase aborted. Resolve manually.',
        };
      }
      throw e;
    }

    // 4. push
    if (opts.autoPush) {
      if (hasUpstream) await git.push();
      else await git.push(['-u', remote, branch]);
      result.pushed = true;
    }
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ...result, status: 'error', message: maskSecrets(msg) };
  }
}
