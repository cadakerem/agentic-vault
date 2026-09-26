import {
	Notice, Plugin, addIcon
} from 'obsidian';
import simpleGit, { SimpleGit, StatusResult } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { syncVault } from './src/sync';
import { initialSyncState, shouldRun, nextSyncState } from './src/syncState';
import { filterConflictCopies } from './src/conflict';
import { SetupWizardModal } from './src/modals/SetupWizardModal';
import { BrainManagerModal } from './src/modals/BrainManagerModal';
import { CreateIssueModal } from './src/modals/CreateIssueModal';
import { SecurityAlertModal } from './src/modals/SecurityAlertModal';
import { AgenticVaultSettingTab } from './src/settings/AgenticVaultSettingTab';



// ─────────────────────────────────────────────
// Types & Interfaces
// ─────────────────────────────────────────────

import { AIToolConfig, AgenticVaultSettings, AgenticVaultSecrets } from './src/types';

const DEFAULT_AI_TOOLS: AIToolConfig[] = [
	{ id: 'gemini',    name: 'Antigravity / Gemini', windowsPath: '.gemini/config',             unixPath: '.gemini/config',                 enabled: true  },
	{ id: 'claude',    name: 'Claude Code',           windowsPath: '.claude',                    unixPath: '.claude',                        enabled: true  },
	{ id: 'cursor',    name: 'Cursor',                windowsPath: 'AppData/Roaming/Cursor/User', unixPath: '.cursor',                        enabled: false },
	{ id: 'windsurf',  name: 'Windsurf',              windowsPath: 'AppData/Roaming/Windsurf/User', unixPath: '.windsurf',                   enabled: false },
	{ id: 'vscode',    name: 'VS Code / Copilot',     windowsPath: 'AppData/Roaming/Code/User',  unixPath: '.config/Code/User',              enabled: false },
];

const DEFAULT_SETTINGS: AgenticVaultSettings = {
	gitAutoPush: true,
	syncIntervalMinutes: 1,
	commitMessageFormat: 'docs: update AI memory & rules (auto)',
	ruleFilePath: 'AI-Brain/Rules.md',
	vaultBrainFolder: 'AI-Brain',
	aiTools: DEFAULT_AI_TOOLS,
	skillsFolder: 'AI-Agent-System/skills',
	scriptsFolder: 'AI-Agent-System/scripts',
	allowPublicRemote: false,
	scanSecrets: true,
	excludedSyncPaths: '',
	deviceName: os.hostname(),
	syncState: initialSyncState,
};

// ─────────────────────────────────────────────
// Helper: resolve ~ paths & get vault path
// ─────────────────────────────────────────────

import { getVaultPath } from './src/obsidian-util';

// ─────────────────────────────────────────────
// Main Plugin
// ─────────────────────────────────────────────

export default class AgenticVaultPlugin extends Plugin {
	declare settings: AgenticVaultSettings;
	declare secrets: AgenticVaultSecrets;
	git: SimpleGit;
	initPromise: Promise<void> | null = null;
	syncIntervalId: number | null = null;
	statusBarEl: HTMLElement;

	onload(): void {
		this.initPromise = this.initialize().catch(err => {
			const msg = err instanceof Error ? err.message : String(err);
			console.error("Agentic Vault Init Error:", err);
			new Notice("Agentic Vault failed to load: " + msg, 10000);
		});
	}

	private async initialize(): Promise<void> {
		await this.loadSettings();

		const vaultPath = getVaultPath(this.app);
		this.git = simpleGit(vaultPath);
		
		await this.ensureGitignore(vaultPath);

		// Status bar
		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.setText('⟳ Agentic Vault');

		// Ribbon — force sync
		this.addRibbonIcon('git-commit-vertical', 'Force Git Sync', () => {
			void this.performDynamicCommit(false, true);
		});

		// Ribbon — setup wizard
		addIcon('laptop-2', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>');
		this.addRibbonIcon('laptop-2', 'New Machine Setup', () => {
			new SetupWizardModal(this.app, this).open();
		});

		// Commands
		this.addCommand({ id: 'force-sync',         name: 'Force Git Sync (Commit & Push)',  callback: () => { void this.performDynamicCommit(false, true); } });
		this.addCommand({ id: 'open-brain-manager', name: 'Open AI Brain Manager',            callback: () => { new BrainManagerModal(this.app, this).open(); } });
		this.addCommand({ id: 'create-github-issue',name: 'Create GitHub Issue (IDD)',        callback: () => { new CreateIssueModal(this.app, this).open(); } });
		this.addCommand({ id: 'setup-wizard',        name: 'New Machine Setup Wizard',        callback: () => { new SetupWizardModal(this.app, this).open(); } });

		this.addSettingTab(new AgenticVaultSettingTab(this.app, this));
		this.startAutoSync();
		new Notice("✅ Agentic Vault Loaded Successfully!", 5000);

		await this.verifyPauseState(vaultPath);
		void this.updateStatusBar();
	}

	private async verifyPauseState(vaultPath: string): Promise<void> {
		if (!this.settings.syncState.paused) return;
		const r = this.settings.syncState.pauseReason;
		if (r === 'not-a-repo') {
			if (await this.git.checkIsRepo()) this.clearPause();
		} else if (r === 'no-remote') {
			if ((await this.git.getRemotes()).length > 0) this.clearPause();
		} else if (r === 'rebase-in-progress') {
			if (!fs.existsSync(path.join(vaultPath, '.git', 'rebase-merge')) && !fs.existsSync(path.join(vaultPath, '.git', 'rebase-apply'))) this.clearPause();
		} else if (r === 'conflict') {
			if ((await this.git.status()).conflicted.length === 0) this.clearPause();
		}
	}

	private clearPause(): void {
		this.settings.syncState.paused = false;
		this.settings.syncState.pauseReason = undefined;
		this.settings.syncState.lastNoticeKey = undefined;
		void this.saveSettings();
	}


	private async ensureGitignore(vaultPath: string): Promise<void> {
		const gitignorePath = path.join(vaultPath, '.gitignore');
		const brain = this.settings.vaultBrainFolder || 'AI-Brain';
		const rules = [
			'/workspace.json',
			'/workspace-mobile.json',
			'node_modules/',
			'.DS_Store',
			`${this.app.vault.configDir}/plugins/agentic-vault/secrets.json`,
			`${brain}/**/*oauth*`,
			`${brain}/**/*token*`,
			`${brain}/**/*secret*`,
			`${brain}/**/credentials`,
			`${brain}/**/.env`,
			`${brain}/**/*.key`
		];
		try {
			let content = '';
			if (fs.existsSync(gitignorePath)) {
				content = fs.readFileSync(gitignorePath, 'utf8');
			}
			const existingLines = new Set(content.split(/\r?\n/).map(l => l.trim()));
			let changed = false;
			for (const rule of rules) {
				if (!existingLines.has(rule)) {
					content += (content.endsWith('\n') || content === '' ? '' : '\n') + rule + '\n';
					changed = true;
				}
			}
			if (changed) {
				fs.writeFileSync(gitignorePath, content);
				new Notice('Agentic Vault: Updated .gitignore to prevent secret leaks.');
			}
			
			// Check if any ignored files are still being tracked
			try {
				const lsFiles = await this.git.raw(['ls-files', '-ci', '--exclude-standard']);
				const trackedIgnored = lsFiles.split('\n').map(l => l.trim()).filter(Boolean);
				if (trackedIgnored.length > 0) {
					new SecurityAlertModal(this.app, this.git, trackedIgnored).open();
					console.warn('Tracked ignored files (DANGER):', trackedIgnored);
				}
			} catch {
				// Ignore ls-files errors or index.lock race conditions safely
			}
		} catch (e) {
			console.error("Failed to update .gitignore", e);
			new Notice("Failed to update .gitignore. Check console.");
		}
	}

	onunload(): void {
		if (this.syncIntervalId !== null) {
			window.clearInterval(this.syncIntervalId);
		}
	}

	startAutoSync(): void {
		if (this.syncIntervalId !== null) {
			window.clearInterval(this.syncIntervalId);
			this.syncIntervalId = null;
		}
		if (this.settings.gitAutoPush && this.settings.syncIntervalMinutes > 0) {
			// Perform an initial sync 5 seconds after startup to fetch remote changes immediately
			window.setTimeout(() => {
				void this.performDynamicCommit(true);
			}, 5000);

			this.syncIntervalId = window.setInterval(() => {
				void this.performDynamicCommit(true);
			}, this.settings.syncIntervalMinutes * 60 * 1000);
			this.registerInterval(this.syncIntervalId);
		}
	}

	async updateStatusBar(transitionStatus?: string): Promise<void> {
		try {
			const status: StatusResult = await this.git.status();
			const branch = status.current ?? 'unknown';
			const ahead  = status.ahead;
			const behind = status.behind;
			const dirty  = status.files.length;
			
			const copies = filterConflictCopies(status.files.map(f => f.path));

			let text = `☁ ${branch}`;
			
			if (transitionStatus) {
				text += ` ${transitionStatus}`;
			} else if (this.settings.syncState.paused) {
				text += ` ⏸ paused`;
			} else if (this.lastErrorMsg) {
				text += ` ⚠️ Error`;
			} else if (copies.length > 0) {
				text += ` · ${copies.length} conflict cop${copies.length === 1 ? 'y' : 'ies'}`;
			} else {
				if (ahead)  text += ` ↑${ahead}`;
				if (behind) text += ` ↓${behind}`;
				if (dirty)  text += ` ✎${dirty}`;
			}
			this.statusBarEl.setText(text);
		} catch {
			this.statusBarEl.setText('☁ git?');
		}
	}

	async loadSettings(): Promise<void> {
		const saved = await this.loadData() as Partial<AgenticVaultSettings & AgenticVaultSecrets> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
		const savedTools = saved?.aiTools ?? [];
		this.settings.aiTools = DEFAULT_AI_TOOLS.map(def => {
			const found = savedTools.find(t => t.id === def.id);
			return found ? { ...def, ...found } : { ...def };
		});
		try {
			const secretsPath = this.manifest.dir + '/secrets.json';
			if (await this.app.vault.adapter.exists(secretsPath)) {
				const data = await this.app.vault.adapter.read(secretsPath);
				this.secrets = Object.assign({}, DEFAULT_SECRETS, JSON.parse(data));
			} else {
				this.secrets = Object.assign({}, DEFAULT_SECRETS);
			}
		} catch {
			this.secrets = Object.assign({}, DEFAULT_SECRETS);
		}
		
		// Migration: Move any legacy secrets from data.json to secrets.json
		let migrated = false;
		if (saved) {
			for (const key of Object.keys(DEFAULT_SECRETS) as Array<keyof AgenticVaultSecrets>) {
				if (saved[key] !== undefined) {
					this.secrets[key] = saved[key] as string;
					delete (this.settings as any)[key];
					migrated = true;
				}
			}
		}
		if (migrated) {
			await this.saveSettings();
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		try {
			const secretsPath = this.manifest.dir + '/secrets.json';
			await this.app.vault.adapter.write(secretsPath, JSON.stringify(this.secrets, null, 2));
		} catch (e) {
			console.error('Failed to save secrets', e);
		}
	}

	isSyncing = false;
	lastErrorMsg: string | null = null;

	async performDynamicCommit(silent: boolean = false, manual: boolean = false): Promise<void> {
		try {
			// Wait for initialization to finish before doing anything.
			if (this.initPromise) { await this.initPromise; }
			if (!shouldRun(this.settings.syncState, { manual, isSyncing: this.isSyncing })) return;
			this.isSyncing = true;
			const vaultPath = getVaultPath(this.app);
			const result = await syncVault(this.git, {
				vaultPath,
				commitMessage: this.settings.commitMessageFormat,
				autoPush: this.settings.gitAutoPush,
				allowPublicRemote: this.settings.allowPublicRemote,
				scanSecrets: this.settings.scanSecrets,
				excludedPaths: this.settings.excludedSyncPaths.split('\n').map(p => p.trim()).filter(Boolean),
				device: this.settings.deviceName,
			});

			const transition = nextSyncState(this.settings.syncState, result, { manual });
			this.settings.syncState = transition.state;
			await this.saveSettings();

			if (result.status === 'secrets-found' && 'findings' in result) {
				console.error('Agentic Vault - Secrets blocked from commit:\n', result.findings);
			}

			if (transition.notice && (!silent || manual)) {
				new Notice(transition.notice, 10000);
			} else if (result.status === 'ok' && !silent) {
				if (result.pushed) new Notice('🚀 Pushed to GitHub!');
				else if (result.committed) new Notice('✓ Changes committed.');
				else new Notice('Agentic Vault: Nothing to commit.');
			}
			
			void this.updateStatusBar(transition.statusText);
		} catch (e) {
			console.error(e);
			const msg = e instanceof Error ? e.message : String(e);
			new Notice('Agentic Vault Sync Error: ' + msg, 10000);
		} finally {
			this.isSyncing = false;
		}
	}
}

