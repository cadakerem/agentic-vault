import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { planLink, applyLink, syncMasterRules } from '../src/link';

let root: string, home: string, source: string;
const target = () => path.join(home, '.gemini', 'config');

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'av-link-'));
  home = path.join(root, 'home');
  source = path.join(home, 'vault', 'AI-Brain');
  fs.mkdirSync(home, { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));

// Unprivileged Windows users can create junctions, not symlinks; junctions need ABSOLUTE targets.
const mkLink = (dest: string, at: string) =>
  fs.symlinkSync(path.resolve(dest), at, process.platform === 'win32' ? 'junction' : 'dir');

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

  // relative links are POSIX-only (junctions must be absolute; plain symlinks need privileges on Windows)
  it.skipIf(process.platform === 'win32')('a RELATIVE link to the same source also counts as noop', () => {
    fs.mkdirSync(source, { recursive: true });
    fs.mkdirSync(path.dirname(target()), { recursive: true });
    fs.symlinkSync(path.relative(path.dirname(target()), source), target(), 'dir');
    expect(planLink(source, target(), home).action).toBe('noop');
  });

  it('replaces a link pointing elsewhere, without touching what it pointed to', () => {
    const other = path.join(home, 'other');
    fs.mkdirSync(other);
    fs.writeFileSync(path.join(other, 'keep.txt'), 'keep');
    fs.mkdirSync(path.dirname(target()), { recursive: true });
    mkLink(other, target());

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

  
  it('Hedef ~/sym_ssh (symlink -> .ssh) -> yalnizca link degisir, .ssh icerigi dokunulmadan kalir', () => {
    const ssh = path.join(home, '.ssh');
    if (!fs.existsSync(ssh)) fs.mkdirSync(ssh);
    fs.writeFileSync(path.join(ssh, 'id_ed25519'), 'PRIVATE');
    
    const symSsh = path.join(home, 'sym_ssh');
    mkLink(ssh, symSsh);
    
    const plan = planLink(source, symSsh, home);
    expect(plan.action).toBe('replace-link');
    applyLink(source, symSsh, plan);
    expect(isLinkTo(symSsh, source)).toBe(true);
    expect(fs.readFileSync(path.join(ssh, 'id_ed25519'), 'utf8')).toBe('PRIVATE');
  });

  it('sym_ssh/yeni -> refuse (ust klasor cozuluyor)', () => {
    const ssh = path.join(home, '.ssh');
    if (!fs.existsSync(ssh)) fs.mkdirSync(ssh);
    const symSsh = path.join(home, 'sym_ssh');
    if (!fs.existsSync(symSsh)) mkLink(ssh, symSsh);
    
    const targetInsideSymSsh = path.join(symSsh, 'yeni');
    const plan = planLink(source, targetInsideSymSsh, home);
    expect(plan.action).toBe('refuse');
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

  it('replaces an EXISTING junction/symlink without EPERM (covers Windows fallback rmdirSync)', () => {
    // Create source and an existing link pointing somewhere else
    fs.mkdirSync(source, { recursive: true });
    const other = path.join(root, 'other-source');
    fs.mkdirSync(other);
    // Create an existing link at target() pointing to 'other'
    fs.mkdirSync(path.dirname(target()), { recursive: true });
    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    fs.symlinkSync(path.resolve(other), target(), linkType);
    expect(fs.lstatSync(target()).isSymbolicLink() || (process.platform === 'win32')).toBe(true);

    // Now applyLink should replace it without throwing
    const plan = planLink(source, target(), home);
    expect(plan.action).toBe('replace-link'); // existing link pointing elsewhere → replace
    expect(() => applyLink(source, target(), plan)).not.toThrow();
    // After: target points to source
    expect(fs.realpathSync(target())).toBe(fs.realpathSync(source));
  });

  it('hardlinks one canonical Rules.md file to Gemini and Claude targets', () => {
    const vault = path.join(root, 'vault');
    const master = path.join(vault, 'AI-Brain', 'Rules.md');
    fs.mkdirSync(path.dirname(master), { recursive: true });
    fs.writeFileSync(master, '# shared rules');

    const result = syncMasterRules(vault, 'AI-Brain/Rules.md', [
      { id: 'gemini', enabled: true },
      { id: 'claude', enabled: true },
    ], 'AI-Brain', home);

    expect(result).toEqual({ linkedCount: 2 });
    const gemini = path.join(home, '.gemini', 'config', 'GEMINI.md');
    const claude = path.join(home, '.claude', 'CLAUDE.md');
    expect(fs.readFileSync(gemini, 'utf8')).toBe('# shared rules');
    expect(fs.readFileSync(claude, 'utf8')).toBe('# shared rules');
    expect(fs.statSync(gemini).ino).toBe(fs.statSync(master).ino);
    expect(fs.statSync(claude).ino).toBe(fs.statSync(master).ino);
  });
});
