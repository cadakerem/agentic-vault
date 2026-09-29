import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ---------- rules parser ----------
export interface Rules {
  system: string;
  project: string;
  coding: string;
}

function section(content: string, title: string): string {
  // Stops only at the next known major H2, so users can safely use "## " inside their rules.
  const knownHeaders = 'System Rules|Project Rules|Coding Standards';
  const re = new RegExp(`## ${title}\\r?\\n([\\s\\S]*?)(?=\\r?\\n## (?:${knownHeaders})|$)`);
  const m = content.match(re);
  return m ? m[1].trim() : '';
}

export function parseRules(content: string): Rules {
  return {
    system: section(content, 'System Rules'),
    project: section(content, 'Project Rules'),
    coding: section(content, 'Coding Standards'),
  };
}

export function serializeRules(r: Rules): string {
  return `# AI Brain Rules\n\n## System Rules\n${r.system}\n\n## Project Rules\n${r.project}\n\n## Coding Standards\n${r.coding}\n`;
}

// ---------- symlink target safety ----------
// Anything at or under these is refused; the "exact" ones are only refused as the folder itself.
const SECRET_DIRS = ['.ssh', '.aws', '.gnupg', '.kube', '.docker'];
const EXACT_ONLY_DIRS = ['.config', 'Documents', 'Desktop', 'Downloads'];

/** `home` is injectable so tests do not depend on the machine. */
function realResolve(p: string): string {
  let cur = path.resolve(p);
  const tail: string[] = [];
  for (;;) {
    try { return path.join(fs.realpathSync(cur), ...tail.reverse()); }
    catch {
      const parent = path.dirname(cur);
      if (parent === cur) return path.resolve(p);
      tail.push(path.basename(cur));
      cur = parent;
    }
  }
}

export function isDangerousPath(p: string, home: string = os.homedir()): boolean {
  const cmp = (s: string) => (process.platform === 'win32' || process.platform === 'darwin' ? s.toLowerCase() : s);
  const norm = realResolve(p);
  const h = realResolve(home);
  if (path.parse(norm).root === norm) return true;
  if (cmp(norm) === cmp(h)) return true;
  if (!cmp(norm).startsWith(cmp(h) + path.sep)) return true;
  const parts = path.relative(h, norm).split(path.sep);
  if (SECRET_DIRS.some((d) => cmp(d) === cmp(parts[0]))) return true;
  if (parts.length === 1 && EXACT_ONLY_DIRS.some((d) => cmp(d) === cmp(parts[0]))) return true;
  return false;
}
