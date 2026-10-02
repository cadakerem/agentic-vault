import * as fs from 'fs';
import * as os from 'os';

export function isPathInsideVault(vaultPath: string, targetPath: string): boolean {
  const resolvedVault = path.resolve(vaultPath);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget.startsWith(resolvedVault + path.sep) || resolvedTarget === resolvedVault;
}

import * as path from 'path';
import { isDangerousPath } from './util';

// `source` = the folder INSIDE the vault (real files live here, e.g. <vault>/AI-Brain)
// `target` = the folder on the OS the AI tool reads (e.g. ~/.gemini/config) -> becomes a link to `source`

export type LinkPlan =
  | { action: 'create' }
  | { action: 'noop' }
  | { action: 'replace-link'; currentDestination: string }
  | { action: 'backup-and-create'; backup: string; willMigrate: boolean }
  | { action: 'refuse'; reason: string };

function safeLstat(p: string): fs.Stats | null {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
}

function isEmptyOrMissing(dir: string): boolean {
  try {
    return fs.readdirSync(dir).length === 0;
  } catch {
    return true;
  }
}

/** Pure decision step: touches nothing. The wizard shows this to the user before applyLink(). */
export function planLink(source: string, target: string, home: string = os.homedir()): LinkPlan {
  const s = path.resolve(source);
  const t = path.resolve(target);

  if (isDangerousPath(t, home)) return { action: 'refuse', reason: 'Target folder is protected or outside your home directory.' };
  if (t === s || t.startsWith(s + path.sep) || s.startsWith(t + path.sep)) {
    return { action: 'refuse', reason: 'Source and target overlap (one is inside the other).' };
  }

  const st = safeLstat(t);
  if (!st) return { action: 'create' };

  if (st.isSymbolicLink()) {
    const dest = path.resolve(path.dirname(t), fs.readlinkSync(t)); // handles relative links
    let same = false;
    try {
      same = fs.realpathSync(dest) === fs.realpathSync(s);
    } catch {
      same = dest === s; // dangling link or missing source
    }
    return same ? { action: 'noop' } : { action: 'replace-link', currentDestination: dest };
  }

  // real file or folder: never delete, move aside
  return { action: 'backup-and-create', backup: `${t}_backup_${Date.now()}`, willMigrate: st.isDirectory() && isEmptyOrMissing(s) };
}

/** Executes a plan produced by planLink(). Call only after the user confirmed. */
export function applyLink(source: string, target: string, plan: LinkPlan, platform: NodeJS.Platform = process.platform): { backup?: string } {
  const s = path.resolve(source);
  const t = path.resolve(target);
  if (plan.action === 'refuse') throw new Error(plan.reason);
  if (plan.action === 'noop') return {};

  fs.mkdirSync(s, { recursive: true });
  fs.mkdirSync(path.dirname(t), { recursive: true });

  let backup: string | undefined;
  if (plan.action === 'replace-link') {
    try { fs.unlinkSync(t); } catch (e) { if (e.code === 'EPERM' || e.code === 'EISDIR') fs.rmdirSync(t); else throw e; } // safely remove junction or symlink, never the destination's contents
  } else if (plan.action === 'backup-and-create') {
    backup = plan.backup;
    fs.renameSync(t, backup);
    if (plan.willMigrate) fs.cpSync(backup, s, { recursive: true });
  }
  // junction on Windows needs no admin rights but requires an absolute path
  fs.symlinkSync(s, t, platform === 'win32' ? 'junction' : 'dir');
  return { backup };
}
export function syncMasterRules(vaultPath: string, ruleFilePath: string, aiTools: { id: string, enabled: boolean }[], brainFolder: string, home: string = os.homedir()): { linkedCount: number, error?: string } {
  if (!ruleFilePath) return { linkedCount: 0 };
  const masterRuleSrc = path.resolve(vaultPath, ruleFilePath);
  if (!isPathInsideVault(vaultPath, masterRuleSrc)) return { linkedCount: 0, error: 'Path traversal detected' };
  if (!fs.existsSync(masterRuleSrc)) return { linkedCount: 0, error: 'Master rule file not found' };

  const isWin = os.platform() === 'win32';
  const toolRules: Record<string, string> = {
    'gemini': path.join(home, '.gemini', 'config', 'GEMINI.md'),
    'claude': path.join(home, '.claude', 'CLAUDE.md'),
    'cursor': path.join(home, isWin ? 'AppData/Roaming/Cursor/User' : '.cursor', '.cursorrules'),
    'windsurf': path.join(home, isWin ? 'AppData/Roaming/Windsurf/User' : '.windsurf', '.windsurfrules'),
    'vscode': path.join(home, isWin ? 'AppData/Roaming/Code/User' : '.config/Code/User', 'copilot-instructions.md')
  };

  let linkedCount = 0;
  for (const tool of aiTools) {
    if (!tool.enabled) continue;
    const relPath = toolRules[tool.id];
    if (!relPath) continue;

    const targetPath = path.resolve(relPath);
    if (path.resolve(masterRuleSrc) === path.resolve(targetPath)) continue;

    
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      if (fs.existsSync(targetPath)) {
      const statMaster = fs.statSync(masterRuleSrc);
      const statTarget = fs.statSync(targetPath);
      // Already hardlinked and same inode
      if (statMaster.ino === statTarget.ino && statTarget.ino !== 0 && statMaster.dev === statTarget.dev) {
        linkedCount++;
        continue;
      }
      // Backup the existing file if it's different and not a symlink/hardlink to master
      if (statTarget.isFile()) {
        try {
           const backupPath = targetPath + '.bak';
           fs.copyFileSync(targetPath, backupPath);
        } catch { /* ignore */ }
      }
      try { fs.unlinkSync(targetPath); } catch (e) { console.error('Failed to unlink target', e); continue; }
    } else {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    }

    try {
      fs.linkSync(masterRuleSrc, targetPath);
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'EXDEV' || err.code === 'EPERM') {
        // Fallback to copy if hardlink fails (cross-device or permission issue)
        fs.copyFileSync(masterRuleSrc, targetPath);
      } else {
        console.error('Failed to hardlink', e);
        continue;
      }
    }
    linkedCount++;
  }
  return { linkedCount };
}
