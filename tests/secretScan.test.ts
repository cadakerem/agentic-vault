import { describe, it, expect } from 'vitest';
import { scanDiff, scanFileNames, scanLine, ALLOW_MARKER } from '../src/secretScan';

// Built at runtime on purpose: keeps token-shaped literals out of the repo (GitHub push protection / scanners).
const GH = 'ghp' + '_' + 'a1B2'.repeat(9); // 36 chars after prefix
const AWS = 'AKIA' + 'ABCDEFGHIJKLMNOP';
const GOOGLE = 'AIza' + 'Sy'.repeat(17) + 'A'; // 35 chars after prefix
const PEM = '-----BEGIN ' + 'RSA PRIVATE KEY-----';
const SK = 'sk-' + 'ant-' + 'abcdEFGH1234'.repeat(3);

const diffFor = (file: string, added: string[], startLine = 1) =>
  [`diff --git a/${file} b/${file}`, 'new file mode 100644', '--- /dev/null', `+++ b/${file}`,
   `@@ -0,0 +${startLine},${added.length} @@`, ...added.map((l) => '+' + l)].join('\n');

describe('scanLine: high-confidence rules', () => {
  it.each([
    ['github-token', `token is ${GH}`],
    ['aws-access-key-id', `key ${AWS}`],
    ['google-api-key', `k=${GOOGLE}`],
    ['private-key-block', PEM],
    ['llm-api-key', `ANTHROPIC=${SK}`],
  ])('detects %s', (rule, line) => {
    expect(scanLine(line).map((f) => f.rule)).toContain(rule);
  });

  it('never echoes the secret in the preview', () => {
    const [f] = scanLine(`my token ${GH} end`);
    expect(f.preview).not.toContain(GH);
    expect(f.preview).toContain('[REDACTED]');
  });

  it('ignores ordinary prose and short look-alikes', () => {
    expect(scanLine('The token economy of ghp_short and sk-short is unrelated.')).toEqual([]);
    expect(scanLine('AKIA is the prefix used by AWS')).toEqual([]);
  });

  it('honours the allow marker', () => {
    expect(scanLine(`${GH} <!-- ${ALLOW_MARKER} -->`)).toEqual([]);
  });
});

describe('scanLine: generic assignment (low confidence)', () => {
  it('flags a long value assigned to a secret-looking name', () => {
    const [f] = scanLine('api_key = "Zx9Qw8Er7Ty6Ui5Op4As3Df2"');
    expect(f).toMatchObject({ rule: 'generic-assignment', confidence: 'low' });
  });
  it('skips obvious placeholders', () => {
    expect(scanLine('api_key = "your_api_key_goes_here_123456"')).toEqual([]);
    expect(scanLine('token: ${{ secrets.MY_TOKEN_VALUE_HERE }}')).toEqual([]);
    expect(scanLine('password = <insert-password-here-please>')).toEqual([]);
  });
});

describe('scanDiff', () => {
  it('reports file and NEW-file line number for added lines', () => {
    const diff = diffFor('notes/keys.md', ['hello', 'world', `pw ${GH}`]);
    expect(scanDiff(diff)).toMatchObject([{ file: 'notes/keys.md', line: 3, rule: 'github-token' }]);
  });

  it('ignores removed and context lines', () => {
    const diff = ['--- a/x.md', '+++ b/x.md', '@@ -1,2 +1,2 @@', `-old ${GH}`, `  context ${AWS}`, '+clean line'].join('\n');
    expect(scanDiff(diff)).toEqual([]);
  });

  it('tracks line numbers across hunks and context lines', () => {
    const diff = ['--- a/x.md', '+++ b/x.md', '@@ -10,2 +10,3 @@', ' ctx', `+${AWS}`, ' ctx2'].join('\n');
    expect(scanDiff(diff)[0]).toMatchObject({ file: 'x.md', line: 11 });
  });

  it('handles CRLF diffs and file names with spaces', () => {
    const diff = ['--- /dev/null', '+++ b/My Notes/a b.md\t', '@@ -0,0 +1 @@', `+${AWS}`].join('\r\n');
    expect(scanDiff(diff)[0]).toMatchObject({ file: 'My Notes/a b.md', line: 1 });
  });

  it('returns [] for empty input and for a clean diff', () => {
    expect(scanDiff('')).toEqual([]);
    expect(scanDiff(diffFor('a.md', ['just notes', 'nothing secret']))).toEqual([]);
  });
});

describe('scanFileNames', () => {
  it('flags sensitive file names anywhere in the tree', () => {
    const names = ['AI-Brain/oauth_creds.json', '.env', 'deep/dir/id_ed25519', 'certs/server.pem', 'x/credentials'];
    expect(scanFileNames(names).map((f) => f.file)).toEqual(names);
  });
  it('does not flag look-alikes or .env.example', () => {
    expect(scanFileNames(['.env.example', 'Credentials.md', 'keyboard.md', 'monkey.txt', 'notes/token-economy.md'])).toEqual([]);
  });
});
