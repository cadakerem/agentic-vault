import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import { parseRules, serializeRules, isDangerousPath } from '../src/util';

describe('parseRules', () => {
  const doc = (nl: string) =>
    ['# AI Brain Rules', '', '## System Rules', 'be kind', '### Sub heading', 'keep this', '',
     '## Project Rules', 'proj', '', '## Coding Standards', 'ts only', ''].join(nl);

  it('keeps ### sub-headings inside the section (LF)', () => {
    const r = parseRules(doc('\n'));
    expect(r.system).toContain('### Sub heading');
    expect(r.system).toContain('keep this');
    expect(r.project).toBe('proj');
    expect(r.coding).toBe('ts only');
  });

  it('works with Windows CRLF line endings', () => {
    const r = parseRules(doc('\r\n'));
    expect(r.system).toContain('keep this');
    expect(r.project).toBe('proj');
    expect(r.coding).toBe('ts only');
  });

  it('round-trips without losing content', () => {
    const r = parseRules(doc('\n'));
    expect(parseRules(serializeRules(r))).toEqual(r);
  });
});

describe('isDangerousPath', () => {
  const home = path.join(os.tmpdir(), 'fake-home');
  const inHome = (...p: string[]) => path.join(home, ...p);

  it('rejects filesystem roots', () => {
    expect(isDangerousPath(path.parse(home).root, home)).toBe(true);
  });
  it('rejects home, including with a trailing separator', () => {
    expect(isDangerousPath(home, home)).toBe(true);
    expect(isDangerousPath(home + path.sep, home)).toBe(true);
  });
  it('rejects paths outside home', () => {
    expect(isDangerousPath(path.join(path.parse(home).root, 'etc'), home)).toBe(true);
  });
  it('rejects secret folders and anything under them', () => {
    expect(isDangerousPath(inHome('.ssh'), home)).toBe(true);
    expect(isDangerousPath(inHome('.ssh', 'keys'), home)).toBe(true);
    expect(isDangerousPath(inHome('.aws'), home)).toBe(true);
  });
  it('rejects Documents itself but allows a tool folder under .config', () => {
    expect(isDangerousPath(inHome('Documents'), home)).toBe(true);
    expect(isDangerousPath(inHome('.gemini'), home)).toBe(false);
    expect(isDangerousPath(inHome('.config', 'gemini'), home)).toBe(false);
  });
  it('resolves ".." tricks', () => {
    expect(isDangerousPath(inHome('.gemini', '..', '.ssh'), home)).toBe(true);
  });
});
