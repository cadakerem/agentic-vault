import { describe, it, expect } from 'vitest';
import { initialSyncState, nextSyncState, shouldRun, SyncState } from '../src/syncState';

const auto = { manual: false, now: 1 };
const manual = { manual: true, now: 1 };

describe('shouldRun', () => {
  it('never runs while another sync is in flight', () => {
    expect(shouldRun(initialSyncState, { manual: true, isSyncing: true })).toBe(false);
  });
  it('runs on the timer when not paused', () => {
    expect(shouldRun(initialSyncState, { manual: false, isSyncing: false })).toBe(true);
  });
  it('skips the timer when paused, but Force Sync always gets through', () => {
    const paused: SyncState = { paused: true, pauseReason: 'conflict' };
    expect(shouldRun(paused, { manual: false, isSyncing: false })).toBe(false);
    expect(shouldRun(paused, { manual: true, isSyncing: false })).toBe(true);
  });
});

describe('pausing statuses', () => {
  it.each(['conflict', 'rebase-in-progress', 'secrets-found', 'no-remote', 'not-a-repo'] as const)(
    '%s pauses auto-sync and shows it in the status bar',
    (status) => {
      const t = nextSyncState(initialSyncState, { status }, auto);
      expect(t.state.paused).toBe(true);
      expect(t.state.pauseReason).toBe(status);
      expect(t.statusText).toBe(`⏸ paused: ${status}`);
      expect(t.notice).not.toBeNull(); // first time: tell the user
    },
  );

  it('does not repeat the same notice on silent runs, but does on a manual run', () => {
    const first = nextSyncState(initialSyncState, { status: 'conflict' }, auto);
    const again = nextSyncState(first.state, { status: 'conflict' }, auto);
    const forced = nextSyncState(again.state, { status: 'conflict' }, manual);
    expect(again.notice).toBeNull();
    expect(forced.notice).not.toBeNull();
  });

  it('a different pause reason is announced again', () => {
    const a = nextSyncState(initialSyncState, { status: 'conflict' }, auto);
    const b = nextSyncState(a.state, { status: 'secrets-found' }, auto);
    expect(b.notice).toContain('secret');
  });
});

describe('recovery', () => {
  it('ok clears the pause, the dedupe key and shows synced', () => {
    const paused = nextSyncState(initialSyncState, { status: 'conflict' }, auto).state;
    const t = nextSyncState(paused, { status: 'ok' }, { manual: true, now: 42 });
    expect(t.state).toEqual({ paused: false, lastOkAt: 42 });
    expect(t.statusText).toBe('☁ synced');
    expect(t.notice).toBeNull();
  });

  it('after recovering, the same conflict is announced again', () => {
    let s = nextSyncState(initialSyncState, { status: 'conflict' }, auto).state;
    s = nextSyncState(s, { status: 'ok' }, manual).state;
    expect(nextSyncState(s, { status: 'conflict' }, auto).notice).not.toBeNull();
  });
});

describe('transient errors', () => {
  it('do NOT pause (network may come back) and are deduped by message', () => {
    const first = nextSyncState(initialSyncState, { status: 'error', message: 'Could not resolve host' }, auto);
    expect(first.state.paused).toBe(false);
    expect(first.statusText).toBe('⚠️ error');
    expect(first.notice).toContain('Could not resolve host');

    const again = nextSyncState(first.state, { status: 'error', message: 'Could not resolve host' }, auto);
    expect(again.notice).toBeNull();

    const different = nextSyncState(again.state, { status: 'error', message: 'Permission denied' }, auto);
    expect(different.notice).toContain('Permission denied');
  });

  it('a transient error while paused un-pauses, so it does not hide behind an old conflict', () => {
    const paused = nextSyncState(initialSyncState, { status: 'conflict' }, auto).state;
    const t = nextSyncState(paused, { status: 'error', message: 'boom' }, manual);
    expect(t.state.paused).toBe(false);
  });

  it('truncates very long messages', () => {
    const t = nextSyncState(initialSyncState, { status: 'error', message: 'x'.repeat(500) }, auto);
    expect(t.notice!.length).toBeLessThan(130);
  });
});
