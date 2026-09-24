import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { planLink, applyLink } from '../src/link';

let root: string, home: string, source: string;
const target = () => path.join(home, '.gemini', 'config');

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'av-link-'));
  home = path.join(root, 'home');
  source = path.join(root, 'vault', 'AI-Brain');
  fs.mkdirSync(home, { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));

const isLinkTo = (link: string, dest: string) =>
  fs.lstatSync(link).isSymbolicLink() && fs.realpathSync(link) === fs.realpathSync(dest);

describe('planLink / applyLink', () => {
  it('creates a link when the target does not exist (and makes missing parents)', () => {
    const plan = planLink(source, target(), home);
    expect(plan.action).toBe('create');
    applyLink(source, target(), plan);
    expect(isLinkTo(target(), source)).toBe(true);
  });

  it('existing real folder: moved to a backup, contents migrated into the vault, nothing lost', () => {
    fs.mkdirSync(target(), { recursive: true });
    fs.writeFileSync(path.join(target(), 'settings.json'), '{"a":1}');

    const plan = planLink(source, target(), home);
    expect(plan.action).toBe('backup-and-create');
    const { backup } = applyLink(source, target(), plan);

    expect(fs.readFileSync(path.join(backup!, 'settings.json'), 'utf8')).toBe('{"a":1}');
    expect(fs.readFileSync(path.join(source, 'settings.json'), 'utf8')).toBe('{"a":1}');
    expect(isLinkTo(target(), source)).toBe(true);
  });

  it('does NOT overwrite a non-empty vault folder with the old OS folder', () => {
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, 'Rules.md'), 'vault rules');
    fs.mkdirSync(target(), { recursive: true });
    fs.writeFileSync(path.join(target(), 'Rules.md'), 'os rules');

    const plan = planLink(source, target(), home);
    expect(plan).toMatchObject({ action: 'backup-and-create', willMigrate: false });
    applyLink(source, target(), plan);

    expect(fs.readFileSync(path.join(source, 'Rules.md'), 'utf8')).toBe('vault rules');
  });

  it('is a noop when the link already points at the source, and idempotent', () => {
    applyLink(source, target(), planLink(source, target(), home));
    expect(planLink(source, target(), home).action).toBe('noop');
    expect(() => applyLink(source, target(), planLink(source, target(), home))).not.toThrow();
  });

  it('a RELATIVE link to the same source also counts as noop', () => {
    fs.mkdirSync(source, { recursive: true });
    fs.mkdirSync(path.dirname(target()), { recursive: true });
    if (process.platform === 'win32') {
      fs.symlinkSync(source, target(), 'junction'); // relative junctions don't work well on Windows
    } else {
      fs.symlinkSync(path.relative(path.dirname(target()), source), target(), 'dir');
    }
    expect(planLink(source, target(), home).action).toBe('noop');
  });

  it('replaces a link pointing elsewhere, without touching what it pointed to', () => {
    const other = path.join(root, 'other');
    fs.mkdirSync(other);
    fs.writeFileSync(path.join(other, 'keep.txt'), 'keep');
    fs.mkdirSync(path.dirname(target()), { recursive: true });
    fs.symlinkSync(other, target(), process.platform === 'win32' ? 'junction' : 'dir');

    const plan = planLink(source, target(), home);
    expect(plan).toMatchObject({ action: 'replace-link', currentDestination: other });
    applyLink(source, target(), plan);

    expect(isLinkTo(target(), source)).toBe(true);
    expect(fs.readFileSync(path.join(other, 'keep.txt'), 'utf8')).toBe('keep');
  });

  it('refuses protected targets and changes nothing', () => {
    const ssh = path.join(home, '.ssh');
    fs.mkdirSync(ssh);
    fs.writeFileSync(path.join(ssh, 'id_ed25519'), 'PRIVATE');
    const plan = planLink(source, ssh, home);
    expect(plan.action).toBe('refuse');
    expect(() => applyLink(source, ssh, plan)).toThrow();
    expect(fs.readFileSync(path.join(ssh, 'id_ed25519'), 'utf8')).toBe('PRIVATE');
    expect(fs.lstatSync(ssh).isSymbolicLink()).toBe(false);
  });

  it('refuses when target and source overlap', () => {
    const inside = path.join(home, 'vault');
    expect(planLink(inside, path.join(inside, 'sub'), home).action).toBe('refuse');
    expect(planLink(path.join(home, 'a', 'b'), path.join(home, 'a'), home).action).toBe('refuse');
  });

  it('uses a junction on Windows (absolute path, no admin rights needed)', () => {
    // fs.symlinkSync's type arg is ignored on POSIX, so this only proves nothing throws there.
    // The real Windows check is in the manual checklist.
    const plan = planLink(source, target(), home);
    expect(() => applyLink(source, target(), plan, 'win32')).not.toThrow();
  });
});
