## What's New in 1.5.1

### Fixed
- **CI Build Failure:** Upgraded Node.js environment to v20 in the release workflow to support Vitest 5.x.

## 1.5.0

### Added
- **Excluded Sync Paths:** You can now configure specific folder paths (like \Private/\ or \Secrets/\) directly in settings to exclude them from \git add\.
- **Vitest Coverage:** Integrated \@vitest/coverage-v8\ in CI, hitting 93% line coverage across core modules.

### Changed
- **Fail-Closed Security:** The Public Remote Check feature now acts strictly fail-closed. If \gh\ is unavailable or network fails, push is blocked automatically rather than silently allowing it.
- **Improved Setup Wizard:** The wizard now reports "Completed with errors" if any internal symlink step failed, rather than showing a blanket success message.
- **Enhanced Error Handling:** \BrainManagerModal\ now gracefully catches and reports YAML/parsing exceptions instead of silently failing.
- **Documentation:** Updated README with more professional developer-centric language and clarified that the Secret Scanner is a pattern-based heuristic rather than a bulletproof shield.
