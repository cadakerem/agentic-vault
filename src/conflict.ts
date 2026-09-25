import * as fs from 'fs';
import * as path from 'path';
import type { SimpleGit } from 'simple-git';

// Strategy: during `git pull --rebase`, "ours" = the REMOTE side, "theirs" = our LOCAL commit being replayed.
//   stage 2 = remote version, stage 3 = local version.
// For every conflicted file we keep the remote version at the original path and save the local version next to it
// as  <name>.conflict-local-<device>-<YYYYMMDD-HHmmss>[-n].<ext>  (Dropbox-style), then let the rebase continue.

// ---------------------------------------------------------------- pure helpers

export function sanitizeDevice(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20);
  return s.replace(/-+$/g, '') || 'device';
}

function stamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

/** rel is a git-style path (forward slashes). `exists` lets the caller avoid collisions. */
export function conflictCopyName(rel: string, device: string, when: Date, exists: (candidate: string) => boolean = () => false): string {
  const posix = rel.replace(/\\/g, '/');
  const dir = path.posix.dirname(posix);
  const ext = path.posix.extname(posix);
  const base = path.posix.basename(posix, ext);
  for (let n = 1; n < 1000; n++) {
    const suffix = n === 1 ? '' : `-${n}`;
    const file = `${base}.conflict-local-${sanitizeDevice(device)}-${stamp(when)}${suffix}${ext}`;
    const candidate = dir === '.' ? file : path.posix.join(dir, file);
    if (!exists(candidate)) return candidate;
  }
  throw new Error('Could not find a free conflict-copy name');
}

const COPY_RE = /\.conflict-local-[a-z0-9-]+-\d{8}-\d{6}(?:-\d+)?(?:\.[^./\\]+)?$/;
export const isConflictCopy = (p: string): boolean => COPY_RE.test(p);
export const filterConflictCopies = (paths: string[]): string[] => paths.filter(isConflictCopy);

export interface Stages {
  has1: boolean;
  has2: boolean; // remote version present
  has3: boolean; // local version present
}

/** Parses `git ls-files -u -z`. */
export function parseUnmergedStages(out: string): Map<string, Stages> {
  const map = new Map<string, Stages>();
  for (const rec of out.split('\0')) {
    const m = /^\d+ [0-9a-f]+ ([123])\t([\s\S]+)$/.exec(rec);
    if (!m) continue;
    const st = map.get(m[2]) ?? { has1: false, has2: false, has3: false };
    st[`has${m[1]}` as 'has1' | 'has2' | 'has3'] = true;
    map.set(m[2], st);
  }
  return map;
}

// ---------------------------------------------------------------- git-driven part

const midRebase = (vaultPath: string) =>
  ['rebase-merge', 'rebase-apply'].some((d) => fs.existsSync(path.join(vaultPath, '.git', d)));

export interface ResolveOptions {
  vaultPath: string;
  device: string;
  now?: Date;
  maxRounds?: number;
}

/**
 * Call ONLY while a rebase is stopped on conflicts. Returns the repo-relative paths of the conflict copies it created.
 * Throws if it hits something it does not understand; the caller must then `git rebase --abort`.
 * Safety net: the pre-rebase HEAD is stored under refs/av-backup/* so no local commit is ever unreachable.
 */
export async function resolveRebaseConflicts(git: SimpleGit, opts: ResolveOptions): Promise<{ copies: string[] }> {
  const when = opts.now ?? new Date();
  const copies: string[] = [];

  // backup ref of everything we had before the rebase started
  let orig = '';
  try {
    orig = fs.readFileSync(path.join(opts.vaultPath, '.git', 'rebase-merge', 'orig-head'), 'utf8').trim();
  } catch {
    orig = (await git.raw(['rev-parse', '--verify', 'ORIG_HEAD']).catch(() => '')).trim();
  }
  if (orig) await git.raw(['update-ref', `refs/av-backup/conflict-${stamp(when)}`, orig]);

  for (let round = 0; round < (opts.maxRounds ?? 100); round++) {
    const unmerged = parseUnmergedStages(await git.raw(['ls-files', '-u', '-z']));
    const fresh: string[] = [];

    for (const [file, st] of unmerged) {
      if (!st.has2 && !st.has3) throw new Error(`Unsupported conflict type for ${file}`);

      if (st.has3) {
        const copyRel = conflictCopyName(file, opts.device, when, (c) => copies.includes(c) || fs.existsSync(path.join(opts.vaultPath, c)));
        const blob = await git.binaryCatFile(['blob', `:3:${file}`]) as Buffer; // raw bytes: safe for binary files
        fs.mkdirSync(path.dirname(path.join(opts.vaultPath, copyRel)), { recursive: true });
        fs.writeFileSync(path.join(opts.vaultPath, copyRel), blob as any);
        copies.push(copyRel);
        fresh.push(copyRel);
      }
      if (st.has2) {
        await git.raw(['checkout', '--ours', '--', file]); // remote version wins at the original path
        await git.raw(['add', '--', file]);
      } else {
        await git.raw(['rm', '-q', '--force', '--', file]); // remote deleted it; local content lives on in the copy
      }
    }
    if (fresh.length) await git.raw(['add', '--', ...fresh]);

    // NOTE: `rebase --continue` would open an editor, and simple-git forbids overriding it (allowUnsafeEditor).
    // `commit --no-edit` keeps the original message; afterwards `rebase --continue` needs no editor.
    const hasUnmerged = async () => (await git.raw(['ls-files', '-u', '-z'])).length > 0;
    const staged = (await git.raw(['diff', '--cached', '--name-only', '-z'])).length > 0;
    try {
      if (staged) {
        await git.raw(['commit', '--no-edit']);
        await git.raw(['rebase', '--continue']);
      } else {
        await git.raw(['rebase', '--skip']); // commit became empty after taking the remote version -> drop it
      }
    } catch (e) {
      // Only "stopped at the NEXT conflicting commit" is expected here; anything else is a real error.
      if (midRebase(opts.vaultPath) && (await hasUnmerged())) continue;
      if (!midRebase(opts.vaultPath)) return { copies };
      throw e;
    }
    if (!midRebase(opts.vaultPath)) return { copies };
  }
  if (!midRebase(opts.vaultPath)) return { copies };
  throw new Error('Conflict resolution did not converge');
}
