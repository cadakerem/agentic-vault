# Changelog

All notable changes to this project will be documented in this file.

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
