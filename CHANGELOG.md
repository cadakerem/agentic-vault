# Changelog

All notable changes to this project will be documented in this file.

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
