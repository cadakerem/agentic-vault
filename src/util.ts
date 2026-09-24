import * as os from 'os';
import * as path from 'path';

// ---------- rules parser ----------
export interface Rules {
  system: string;
  project: string;
  coding: string;
}

function section(content: string, title: string): string {
  // Stops only at the next H2 ("## "), so "### sub" stays inside; tolerates CRLF.
  const re = new RegExp(`## ${title}\\r?\\n([\\s\\S]*?)(?=\\r?\\n## |$)`);
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
export function isDangerousPath(p: string, home: string = os.homedir()): boolean {
  const cmp = (s: string) => (process.platform === 'win32' ? s.toLowerCase() : s);
  const norm = path.resolve(p);
  const h = path.resolve(home);

  if (path.parse(norm).root === norm) return true; // any filesystem/drive root
  if (cmp(norm) === cmp(h)) return true; // home itself
  if (!cmp(norm).startsWith(cmp(h) + path.sep)) return true; // outside home

  const parts = path.relative(h, norm).split(path.sep);
  if (SECRET_DIRS.some((d) => cmp(d) === cmp(parts[0]))) return true;
  if (parts.length === 1 && EXACT_ONLY_DIRS.some((d) => cmp(d) === cmp(parts[0]))) return true;
  return false;
}
