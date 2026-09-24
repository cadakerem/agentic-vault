import type { SyncStatus } from './sync';

export type PauseReason = 'conflict' | 'rebase-in-progress' | 'secrets-found' | 'no-remote' | 'not-a-repo';

export interface SyncState {
  paused: boolean;
  pauseReason?: PauseReason;
  /** Key of the last error/pause we already told the user about (dedupe for silent runs). */
  lastNoticeKey?: string;
  lastOkAt?: number;
}

export const initialSyncState: SyncState = { paused: false };

/** Should the timer/ribbon trigger actually run a sync right now? */
export function shouldRun(state: SyncState, opts: { manual: boolean; isSyncing: boolean }): boolean {
  if (opts.isSyncing) return false;
  if (state.paused && !opts.manual) return false;
  return true;
}

const PAUSING: PauseReason[] = ['conflict', 'rebase-in-progress', 'secrets-found', 'no-remote', 'not-a-repo'];
const isPausing = (s: SyncStatus): s is PauseReason => (PAUSING as string[]).includes(s);

const NOTICE_TEXT: Record<PauseReason, string> = {
  conflict: '⚠️ Merge conflict. Sync paused; your local commit is kept. Use "Force Sync" after resolving.',
  'rebase-in-progress': '⚠️ A rebase is in progress. Sync paused until it is finished or aborted.',
  'secrets-found': '🚨 Possible secret found in staged changes. Nothing was committed or pushed.',
  'no-remote': 'ℹ️ No remote configured. Changes are committed locally only.',
  'not-a-repo': 'ℹ️ This vault is not a Git repository yet. Run the setup wizard.',
};

export interface Transition {
  state: SyncState;
  /** Text for a Notice, or null if the user should not be bothered (already told / all fine). */
  notice: string | null;
  statusText: string;
}

export function nextSyncState(
  prev: SyncState,
  result: { status: SyncStatus; message?: string },
  ctx: { manual: boolean; now?: number },
): Transition {
  const now = ctx.now ?? Date.now();
  const { status } = result;

  if (status === 'ok') {
    return {
      state: { paused: false, lastOkAt: now }, // clears pause AND the dedupe key
      notice: null,
      statusText: '☁ synced',
    };
  }

  if (isPausing(status)) {
    const key = status;
    const already = prev.lastNoticeKey === key;
    return {
      state: { ...prev, paused: true, pauseReason: status, lastNoticeKey: key },
      notice: ctx.manual || !already ? NOTICE_TEXT[status] : null,
      statusText: `⏸ paused: ${status}`,
    };
  }

  // transient 'error' (network, auth, ...): keep running, dedupe by message
  const msg = (result.message ?? 'unknown error').slice(0, 100);
  const key = `error:${msg}`;
  const already = prev.lastNoticeKey === key;
  return {
    state: { ...prev, paused: false, pauseReason: undefined, lastNoticeKey: key },
    notice: ctx.manual || !already ? `Git error: ${msg}` : null,
    statusText: '⚠️ error',
  };
}
