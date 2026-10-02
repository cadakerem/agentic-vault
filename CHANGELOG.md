# Changelog

All notable changes to this project will be documented in this file.

## [2.2.2] - 2026-10-02
### Fixed
- **Obsidian Store Release Fix**: Untracked `main.js` from the repository and added release assets packaging to meet community directory guidelines.
- **Linter Cleanup**: Resolved unused variable and `any` typings in state migration logic.

## [2.2.1] - 2026-10-02
### Fixed
- **Source Code Cleanup**: Resolved strict ESLint warnings raised by the Obsidian community review bot.
- **Migration Typings**: Replaced `any` typing with `Record<string, unknown>` during legacy state migration.
- **Unicode Restoration**: Restored UI status bar emojis that were mangled into irregular whitespace.

## [2.2.0] - 2026-10-02
### Added
- **3-File Architecture (Zero-Conflict)**: Separated plugin configuration into three distinct files to eliminate sync conflicts and device state loss:
  1. `data.json` (Tracked & Synced): Pure UI configuration and global settings (e.g., aiTools, gitAutoPush). Safe to sync across multiple machines.
  2. `local-state.json` (Ignored): Device-specific volatile state like `deviceName`, `syncState.lastOkAt`, and `paused`. Prevents infinite Git conflicts when multiple devices sync simultaneously.
  3. `secrets.json` (Ignored): API keys.
### Fixed
- Removed tracking exceptions for `data.json`, ensuring global settings sync consistently without causing unstaged change errors or silent device state deletions during Git pulls.
- Implemented `--autostash` across all rebase operations, ensuring the plugin won't crash even if a tracked file is manually excluded via `excludedPaths`.

## [2.1.8] - 2026-10-02
### Fixed
- Fixed BOM (Byte Order Mark) issues caused by PowerShell on Windows for JSON files.
- Added silent migration to untrack data.json for users upgrading from 2.1.6.

## [2.1.7] - 2026-10-02
### Fixed
- **Sync Stabilization:** Fixed an issue where the plugin's auto-sync would fail with "cannot pull with rebase: You have unstaged changes" because data.json was hardcoded to be excluded from git add.
- **Gitignore Generation:** Changed ensureGitignore to append .obsidian/* instead of .obsidian/. This prevents the plugin from accidentally overriding users' manual un-ignores (like !.obsidian/plugins/) and resolves the "Ignored files are still tracked" error.
- Updated automated tests to assert the exclusion of secrets.json instead of data.json.

## [2.1.4] - 2026-10-01
### Fixed
- **UI UX Improvements:**
  - Display dynamic detailed messages (including blocked filenames) directly in the UI Notice instead of a generic warning.
  - Adjusted notification display durations for better readability: 15 seconds for critical blocked secrets, and 10 seconds for safe allowlist bypasses.

## [2.1.3] - 2026-09-30
### Fixed
- Hardened .obsidian/plugins/agentic-vault/*.json exclusion to support alternative repo structures (e.g. tracking .obsidian itself).
- CI BOM scanner updated to run reliably under UTF-8 locales (LC_ALL=C).
