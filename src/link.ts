import * as fs from 'fs';
import * as os from 'os';
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
    fs.unlinkSync(t); // removes only the link, never the destination's contents
  } else if (plan.action === 'backup-and-create') {
    backup = plan.backup;
    fs.renameSync(t, backup);
    if (plan.willMigrate) fs.cpSync(backup, s, { recursive: true });
  }
  // junction on Windows needs no admin rights but requires an absolute path
  fs.symlinkSync(s, t, platform === 'win32' ? 'junction' : 'dir');
  return { backup };
}
