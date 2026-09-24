// Pure functions: no fs, no git. Feed them the output of `git diff --cached -U0`.
// Blocklist by design: it catches KNOWN patterns, it does not prove a diff is clean.

export interface Finding {
  file: string;
  line: number; // line number in the new file (0 for filename findings)
  rule: string;
  confidence: 'high' | 'low';
  /** The offending line with the match replaced by [REDACTED]. Never contains the secret itself. */
  preview: string;
}

/** Put this marker on a line to tell the scanner it is intentional (e.g. a documented dummy key). */
export const ALLOW_MARKER = 'av-allow-secret';

interface Rule {
  name: string;
  re: RegExp;
  confidence: 'high' | 'low';
}

const RULES: Rule[] = [
  { name: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g, confidence: 'high' },
  { name: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g, confidence: 'high' },
  { name: 'aws-access-key-id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, confidence: 'high' },
  { name: 'private-key-block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/g, confidence: 'high' },
  { name: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, confidence: 'high' },
  { name: 'llm-api-key', re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/g, confidence: 'high' },
  {
    name: 'generic-assignment',
    re: /\b(?:api[_-]?key|secret|token|passw(?:or)?d)\b\s*[:=]\s*["']?[A-Za-z0-9_\-/+=]{20,}["']?/gi,
    confidence: 'low',
  },
];

const PLACEHOLDER = /example|placeholder|your[_-]|changeme|xxxx|<[^>]+>|\$\{|\{\{/i;

function redact(line: string, re: RegExp): string {
  return line.replace(new RegExp(re.source, re.flags), '[REDACTED]').trim().slice(0, 120);
}

export function scanLine(line: string): { rule: string; confidence: 'high' | 'low'; preview: string }[] {
  if (line.includes(ALLOW_MARKER)) return [];
  const out: { rule: string; confidence: 'high' | 'low'; preview: string }[] = [];
  for (const r of RULES) {
    const m = new RegExp(r.re.source, r.re.flags).exec(line);
    if (!m) continue;
    if (r.confidence === 'low' && PLACEHOLDER.test(m[0])) continue;
    out.push({ rule: r.name, confidence: r.confidence, preview: redact(line, r.re) });
  }
  return out;
}

/** Scans ONLY added lines of a unified diff. Context and removed lines are ignored. */
export function scanDiff(diff: string): Finding[] {
  const findings: Finding[] = [];
  let file = '';
  let newLine = 0;

  for (const raw of diff.split(/\r?\n/)) {
    if (raw.startsWith('+++ ')) {
      const p = raw.slice(4).replace(/\t.*$/, '').replace(/^"|"$/g, '');
      file = p === '/dev/null' ? '' : p.replace(/^b\//, '');
      continue;
    }
    if (raw.startsWith('--- ') || raw.startsWith('diff --git')) continue;
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      newLine = parseInt(hunk[1], 10);
      continue;
    }
    if (raw.startsWith('+')) {
      for (const f of scanLine(raw.slice(1))) findings.push({ file, line: newLine, ...f });
      newLine++;
    } else if (raw.startsWith(' ')) {
      newLine++;
    }
    // '-' lines and '\ No newline' markers do not advance the new-file counter
  }
  return findings;
}

const SENSITIVE_NAMES = [
  /^\.env(?:\..+)?$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)$/,
  /^oauth_creds\.json$/i,
  /^credentials(?:\.json)?$/i,
  /\.(?:pem|p12|pfx|key)$/i,
];
const SAFE_NAMES = /^\.env\.(?:example|sample|template)$/i;

export function scanFileNames(paths: string[]): Finding[] {
  const out: Finding[] = [];
  for (const p of paths) {
    const base = p.split(/[\\/]/).pop() ?? p;
    if (SAFE_NAMES.test(base)) continue;
    if (SENSITIVE_NAMES.some((re) => re.test(base))) {
      out.push({ file: p, line: 0, rule: 'sensitive-filename', confidence: 'high', preview: base });
    }
  }
  return out;
}
