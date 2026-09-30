# Changelog

All notable changes to this project will be documented in this file.

## [2.1.1] - 2026-09-30
### Fixed
- Stabilized llowedPaths (allowlist) behavior with input normalization (handling Windows \ and ./ prefixes).
- Added test coverage for the allowlist feature.
- Show an Obsidian Notice when files are intentionally skipped by the secret scanner due to the allowlist.

## [2.1.0] - 2026-09-30
### Added
- **Allowlist (Allowed Secret Paths)**: Users can now enter specific file paths (e.g. config/.npmrc) in the settings to bypass the Secret Scanner.
- **Path-Based Scanning**: The secret scanner now supports full path evaluation, accurately catching files like .kube/config.

### Changed
- Expanded the Secret Scanner to catch .npmrc, .netrc, .pgpass, kubeconfig, .tfvars, 	erraform.tfstate, and .git-credentials.
- Upgraded the secrets-found sync block message to provide the actual filenames that caused the block and actionable advice (git rm --cached <file>).
- Linter and strict type hygiene fully resolved (0 warnings on Obsidian Plugin Scanner).
## [2.0.1] - 2026-09-30
### Fixed
- **Upgrade Regression**: Fixed a bug where scanSecrets: false was ignored if llowPublicRemote was also alse. The core sync layer now respects the UI toggle.

## [2.0.0] - 2026-09-30

### Security
- **Anchored GitHub URL regex** (`src/sync.ts`): The public-remote check regex had no start
  anchor, allowing spoofed hosts like `evilgithub.com/user/repo` or `github.com.evil.com` to
  match and bypass the protection. Fixed by adding a strict host anchor.
- **Repo names with dots** (`[^/.]+?` → `[^/]+?`): Repos named `my.repo` or `foo.js` were
  incorrectly rejected as "not a recognized GitHub URL". Now accepted.
- Added 9 URL boundary tests covering evil host bypass, subdomain spoof, ssh://, token@,
  dot in repo name, trailing slash, and GitHub Enterprise rejection.

### Fixed
- **Windows junction/symlink replace** (`src/link.ts`): `applyLink` now falls back from
  `fs.unlinkSync` to `fs.rmdirSync` when replacing a junction to avoid EPERM errors.
- **Unborn HEAD / first-ever commit** (`src/sync.ts`): `hasStaged` no longer throws on a
  brand-new `git init` with no commits. Replaced `git diff --cached --quiet` (which throws
  on unborn HEAD) with `git diff --cached --name-only -z` and a `git ls-files -z` fallback.
- **Dynamic branch name in push warning**: Security warning no longer hardcodes "main" —
  now uses the actual current branch name.
- **URL unreachable vs. not GitHub**: Split into two distinct error messages for clarity.

### Changed
- **`scanSecrets` and `allowPublicRemote` are now fully independent** (`src/settings/`):
  Previously, `scanSecrets` was locked to `true` whenever `allowPublicRemote` was `false`.
  Now both toggles can be changed independently. Disabling the scanner shows an 8-second
  warning Notice reminding users to have an alternative safeguard.

### Tests
- 122 tests across 11 files (up from 103 before v2 work began).
- New: `tests/security.test.ts`, URL boundary tests in `test/public-check.test.ts`,
  junction replace and sym_ssh safety tests in `tests/link.test.ts`,
  unborn-HEAD regression test in `tests/sync.test.ts`.
- CI: `ubuntu-24.04` pinned (replaces `ubuntu-latest`), all actions updated to `@v5`.

### Infrastructure
- Removed all `patch*.js` and `test_*.js` one-off scripts from the repository root.
- Removed accidental `test_cp_t/` directory from git tracking.

### Documentation
- README: Added "Known Limitations" section (inbound sync risk, pattern-based scanning
  caveats, GitHub-only protection, GitHub Enterprise not supported, scanner independence).

## [1.5.2] - 2026-09-26
### Fixed
- **Code Quality:** Removed an unused variable in the public remote check logic reported by code analysis.

## [1.5.1] - 2026-09-26
### Fixed
- **CI Build Failure:** Upgraded Node.js environment to v20 in the release workflow to support Vitest 5.x.

## [1.5.0] - 2026-09-26
### Added
- **Excluded Sync Paths:** You can now configure specific folder paths (like `Private/` or `Secrets/`) directly in settings to exclude them from `git add`.
- **Vitest Coverage:** Integrated `@vitest/coverage-v8` in CI, hitting 93% line coverage across core modules.

### Changed
- **Fail-Closed Security:** The Public Remote Check feature now acts strictly fail-closed. If `gh` is unavailable or network fails, push is blocked automatically rather than silently allowing it.
- **Improved Setup Wizard:** The wizard now reports "Completed with errors" if any internal symlink step failed, rather than showing a blanket success message.
- **Enhanced Error Handling:** `BrainManagerModal` now gracefully catches and reports YAML/parsing exceptions instead of silently failing.
- **Documentation:** Updated README with more professional developer-centric language and clarified that the Secret Scanner is a pattern-based heuristic rather than a bulletproof shield.

## [1.4.16] - 2026-09-25
### Fixed
- **Settings UI Crash:** Removed experimental `getSettingDefinitions` method that was causing the settings menu to render as a blank page in certain Obsidian versions due to API mismatches.

## [1.4.7] - 2026-09-25
### Added
- **Obsidian Settings Search (1.13.0+):** Implemented `getSettingDefinitions()` in `AgenticVaultSettingTab`. All plugin settings (Auto Push, Secret Scanner, Sync Interval, Device Name, etc.) now appear in Obsidian's global settings search.

## [1.4.6] - 2026-09-25
### Fixed
- **Type safety:** Fixed `@typescript-eslint/no-unsafe-member-access` on `err.message` in `main.ts` — now uses `instanceof Error` guard.
- **Type safety:** Fixed `@typescript-eslint/no-unsafe-assignment` on `JSON.parse()` result in `src/sync.ts` — cast to `{ isPrivate?: boolean } | null`.
- **Type safety:** Fixed `@typescript-eslint/no-unsafe-assignment` and `no-unsafe-argument` on `binaryCatFile()` result in `src/conflict.ts` — cast to `Buffer`.
- **Lint:** Fixed unused `catch (e)` → `catch {}` in `src/sync.ts`.

## [1.4.5] - 2026-09-25
### Fixed
- **Critical init bug:** Ribbon icons, commands, settings tab, and auto-sync were accidentally placed inside `clearPause()` instead of `initialize()`. On a fresh install where `syncState.paused = false`, `clearPause()` is never called — making the entire plugin UI invisible to the user. Moved all registration to `initialize()`.
- **Dead code removal:** Removed unused `resolvePath()` function from `main.ts`.
- **Lint:** Fixed unused `catch (e)` → `catch {}` where the error variable was never read.
- **Lint:** Converted `require()` style imports in `src/sync.ts` to proper ES6 `import` statements.
- **Type safety:** Fixed `syncState: Record<string, unknown>` regression in `src/types.ts` — restored to `syncState: SyncState`.

## [1.4.4] - 2026-09-24
### Refactored
- **Modular Architecture:** Extracted massive UI modals and settings from `main.ts` into separate files under `src/modals/` and `src/settings/`, reducing the main entrypoint to 300 lines for better maintainability.
- **Dead Code Elimination:** Removed unused `ConfirmModal` code.

### Security
- **Hardened GitHub Issues:** Eliminated Command Injection vulnerability in GitHub Issue creation by migrating from string-based shell execution (`execAsync`) to array-based execution (`execFileAsync`).
- **Two Layers of Defense:** Documented the dual security model:
  1. Filename-based filtering via automated `.gitignore` (protects `.env`, `credentials`, etc.)
  2. Content-based scanning via Secret Scanner (blocks AWS keys, Slack tokens, private keys).

### Fixed
- Fixed Vitest type checking failure in GitHub Actions CI (added `skipLibCheck` and legacy peer resolution).

## [1.4.3] - 2026-09-24
### Fixed
- Fixed vitest type errors by adding `skipLibCheck` to `tsconfig.json`.

## [1.4.2] - 2026-09-24
### Fixed
- Fixed peer dependency issues in Vite by enforcing `--legacy-peer-deps` in GitHub Release workflows.

## [1.4.1] - 2026-09-24
### Security
- **Strict Secret Scanning:** Automatically forces Secret Scanner ON and disables the toggle if "Allow Public Remote" is turned off, ensuring bullet-proof leak protection for private instances.

## [1.4.0] - 2026-09-24
### Added
- **Secret Scanner:** Scans outgoing commits for API keys and tokens.
- **Conflict Resolution:** Dropbox-style conflict resolution that keeps remote changes and copies local edits as `.conflict-local` files.
- **Concurrency Guard:** Added `isSyncing` flag to prevent overlapping git pull/push operations.
