import { describe, it, expect } from 'vitest';
import { conflictCopyName, isConflictCopy, filterConflictCopies, parseUnmergedStages, sanitizeDevice } from '../src/conflict';
import { initialSyncState, nextSyncState } from '../src/syncState';

const WHEN = new Date(Date.UTC(2026, 8, 24, 10, 15, 0)); // 2026-09-24 10:15:00 UTC

describe('conflictCopyName', () => {
  it('inserts the marker before the extension', () => {
    expect(conflictCopyName('note.md', 'Kerem-PC', WHEN)).toBe('note.conflict-local-kerem-pc-20260924-101500.md');
  });
  it('keeps the directory (also with backslashes)', () => {
    expect(conflictCopyName('Projects/2026/plan.md', 'pc', WHEN)).toBe('Projects/2026/plan.conflict-local-pc-20260924-101500.md');
    expect(conflictCopyName('Projects\\plan.md', 'pc', WHEN)).toBe('Projects/plan.conflict-local-pc-20260924-101500.md');
  });
  it('handles multiple dots, no extension and dotfiles', () => {
    expect(conflictCopyName('a.b.md', 'pc', WHEN)).toBe('a.b.conflict-local-pc-20260924-101500.md');
    expect(conflictCopyName('README', 'pc', WHEN)).toBe('README.conflict-local-pc-20260924-101500');
    expect(conflictCopyName('.hidden', 'pc', WHEN)).toBe('.hidden.conflict-local-pc-20260924-101500');
  });
  it('never collides: appends -2, -3 ...', () => {
    const taken = new Set<string>();
    const a = conflictCopyName('n.md', 'pc', WHEN, (c) => taken.has(c));
    taken.add(a);
    const b = conflictCopyName('n.md', 'pc', WHEN, (c) => taken.has(c));
    taken.add(b);
    const c = conflictCopyName('n.md', 'pc', WHEN, (x) => taken.has(x));
    expect([a, b, c]).toEqual([
      'n.conflict-local-pc-20260924-101500.md',
      'n.conflict-local-pc-20260924-101500-2.md',
      'n.conflict-local-pc-20260924-101500-3.md',
    ]);
  });
  it('sanitizes odd device names', () => {
    expect(sanitizeDevice("Kerem's MacBook Pro (2)!")).toBe('kerem-s-macbook-pro');
    expect(sanitizeDevice('***')).toBe('device');
    expect(sanitizeDevice('')).toBe('device');
    expect(conflictCopyName('a.md', '../../etc', WHEN)).not.toContain('..');
  });
});

describe('isConflictCopy / filterConflictCopies', () => {
  it('recognises generated names (with and without extension / suffix)', () => {
    for (const p of [
      'a.conflict-local-pc-20260924-101500.md',
      'dir/a.conflict-local-my-laptop-20260924-101500-2.md',
      'README.conflict-local-pc-20260924-101500',
    ]) expect(isConflictCopy(p)).toBe(true);
  });
  it('does not match ordinary notes', () => {
    for (const p of ['a.md', 'conflict-local notes.md', 'my.conflict-local.md', 'x.conflict-local-pc-2026.md']) expect(isConflictCopy(p)).toBe(false);
  });
  it('filters a list', () => {
    expect(filterConflictCopies(['a.md', 'a.conflict-local-pc-20260924-101500.md'])).toEqual(['a.conflict-local-pc-20260924-101500.md']);
  });
  it('round-trips with the generator', () => {
    expect(isConflictCopy(conflictCopyName('Some Dir/My Note.md', 'Work PC', WHEN))).toBe(true);
  });
});

describe('parseUnmergedStages', () => {
  const rec = (stage: number, p: string) => `100644 ${'a'.repeat(40)} ${stage}\t${p}\0`;
  it('collects stages per path, including paths with spaces', () => {
    const out = rec(1, 'a b.md') + rec(2, 'a b.md') + rec(3, 'a b.md') + rec(2, 'gone.md');
    const m = parseUnmergedStages(out);
    expect(m.get('a b.md')).toEqual({ has1: true, has2: true, has3: true });
    expect(m.get('gone.md')).toEqual({ has1: false, has2: true, has3: false });
  });
  it('returns an empty map for empty input', () => {
    expect(parseUnmergedStages('').size).toBe(0);
  });
});

describe('nextSyncState with conflict copies', () => {
  it('ok + copies: unpaused, but ALWAYS notifies (even on silent runs) and shows a count', () => {
    const t = nextSyncState(initialSyncState, { status: 'ok', conflictCopies: ['a.conflict-local-pc-20260924-101500.md'] }, { manual: false, now: 1 });
    expect(t.state.paused).toBe(false);
    expect(t.notice).toContain('a.conflict-local-pc-20260924-101500.md');
    expect(t.statusText).toBe('☁ synced · 1 conflict copy');
  });
  it('mentions how many more copies there are', () => {
    const t = nextSyncState(initialSyncState, { status: 'ok', conflictCopies: ['a', 'b', 'c'] }, { manual: false });
    expect(t.notice).toContain('+2 more');
    expect(t.statusText).toBe('☁ synced · 3 conflict copies');
  });
  it('plain ok stays quiet', () => {
    const t = nextSyncState(initialSyncState, { status: 'ok' }, { manual: false });
    expect(t.notice).toBeNull();
    expect(t.statusText).toBe('☁ synced');
  });
});
