import {
	App,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	Modal,
	TFile,
	addIcon,
} from 'obsidian';
import simpleGit, { SimpleGit, StatusResult } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// ─────────────────────────────────────────────
// Types & Interfaces
// ─────────────────────────────────────────────

interface AIToolConfig {
	id: string;
	name: string;
	windowsPath: string;
	unixPath: string;
	enabled: boolean;
}

interface AgenticVaultSettings {
	gitAutoPush: boolean;
	syncIntervalMinutes: number;
	commitMessageFormat: string;
	ruleFilePath: string;
	vaultBrainFolder: string;
	aiTools: AIToolConfig[];
	skillsFolder: string;
	scriptsFolder: string;
}

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
};

// ─────────────────────────────────────────────
// Helper: resolve ~ paths & get vault path
// ─────────────────────────────────────────────

function getVaultPath(app: App): string {
	const adapter = app.vault.adapter as unknown as { getBasePath: () => string };
	return adapter.getBasePath();
}

function resolvePath(rawPath: string): string {
	if (rawPath.startsWith('~/') || rawPath === '~') {
		return path.join(os.homedir(), rawPath.slice(2));
	}
	return rawPath;
}

// ─────────────────────────────────────────────
// Main Plugin
// ─────────────────────────────────────────────

export default class AgenticVaultPlugin extends Plugin {
	settings: AgenticVaultSettings;
	git: SimpleGit;
	syncIntervalId: number | null = null;
	statusBarEl: HTMLElement;

	onload(): void {
		this.initialize().catch(err => {
			console.error("Agentic Vault Init Error:", err);
			new Notice("Agentic Vault failed to load: " + (err.message || String(err)), 10000);
		});
	}

	private async initialize(): Promise<void> {
		await this.loadSettings();

		const vaultPath = getVaultPath(this.app);
		this.git = simpleGit(vaultPath);

		// Status bar
		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.setText('⟳ Agentic Vault');
		void this.updateStatusBar();

		// Ribbon — force sync
		this.addRibbonIcon('git-commit-vertical', 'Force Git Sync', () => {
			void this.performDynamicCommit(false);
		});

		// Ribbon — setup wizard
		addIcon('laptop-2', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>');
		this.addRibbonIcon('laptop-2', 'New Machine Setup', () => {
			new SetupWizardModal(this.app, this).open();
		});

		// Commands
		this.addCommand({ id: 'force-sync',         name: 'Force Git Sync (Commit & Push)',  callback: () => { void this.performDynamicCommit(false); } });
		this.addCommand({ id: 'open-brain-manager', name: 'Open AI Brain Manager',            callback: () => { new BrainManagerModal(this.app, this).open(); } });
		this.addCommand({ id: 'create-github-issue',name: 'Create GitHub Issue (IDD)',        callback: () => { new CreateIssueModal(this.app, this).open(); } });
		this.addCommand({ id: 'setup-wizard',        name: 'New Machine Setup Wizard',        callback: () => { new SetupWizardModal(this.app, this).open(); } });

		this.addSettingTab(new AgenticVaultSettingTab(this.app, this));
		this.startAutoSync();
		new Notice("✅ Agentic Vault Loaded Successfully!", 5000);
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
			this.syncIntervalId = window.setInterval(() => {
				void this.performDynamicCommit(true);
			}, this.settings.syncIntervalMinutes * 60 * 1000);
			this.registerInterval(this.syncIntervalId);
		}
	}

	async updateStatusBar(): Promise<void> {
		try {
			const status: StatusResult = await this.git.status();
			const branch = status.current ?? 'unknown';
			const ahead  = status.ahead;
			const behind = status.behind;
			const dirty  = status.files.length;

			let text = `☁ ${branch}`;
			if (ahead)  text += ` ↑${ahead}`;
			if (behind) text += ` ↓${behind}`;
			if (dirty)  text += ` ✎${dirty}`;
			this.statusBarEl.setText(text);
		} catch {
			this.statusBarEl.setText('☁ git?');
		}
	}

	async loadSettings(): Promise<void> {
		const saved = await this.loadData() as Partial<AgenticVaultSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
		// Ensure aiTools always has all defaults (merge by id)
		const savedTools = saved?.aiTools ?? [];
		this.settings.aiTools = DEFAULT_AI_TOOLS.map(def => {
			const found = savedTools.find(t => t.id === def.id);
			return found ? { ...def, ...found } : { ...def };
		});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async performDynamicCommit(silent: boolean = false): Promise<void> {
		if (!silent) new Notice('Agentic Vault: Syncing...');
		try {
			await this.git.add('.');
			const status: StatusResult = await this.git.status();
			const hasChanges = status.files.length > 0;

			if (hasChanges) {
				await this.git.commit(this.settings.commitMessageFormat);
				if (!silent) new Notice('✓ Changes committed.');
			} else {
				if (!silent) new Notice('Agentic Vault: Nothing to commit.');
			}

			await this.git.pull(['--rebase']);

			if (this.settings.gitAutoPush) {
				await this.git.push();
				if (hasChanges && !silent) new Notice('🚀 Pushed to GitHub!');
			}
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			if (msg.includes('CONFLICT') || msg.includes('merge')) {
				new Notice('⚠️ Merge conflict! Resolve manually.');
			} else {
				if (!silent) new Notice(`Git Error: ${msg}`);
			}
		} finally {
			void this.updateStatusBar();
		}
	}
}

// ─────────────────────────────────────────────
// Setup Wizard Modal
// ─────────────────────────────────────────────

interface SetupStep {
	label: string;
	status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
	detail: string;
}

class SetupWizardModal extends Modal {
	plugin: AgenticVaultPlugin;
	steps: SetupStep[] = [];
	stepEls: HTMLElement[] = [];
	running = false;

	constructor(app: App, plugin: AgenticVaultPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('agentic-vault-modal');

		contentEl.createEl('h2', { text: '🖥️ New Machine Setup' });
		contentEl.createEl('p', {
			text: 'Automatically configure this computer: create symlinks for your AI tools, skills, and scripts — so everything works like your original machine.',
			cls: 'av-subtitle',
		});

		// Build steps list
		this.steps = this.buildSteps();
		const listEl = contentEl.createDiv({ cls: 'av-steps-list' });
		this.stepEls = this.steps.map(step => {
			const el = listEl.createDiv({ cls: 'av-step av-step-pending' });
			el.createSpan({ cls: 'av-step-icon', text: '○' });
			const info = el.createDiv({ cls: 'av-step-info' });
			info.createDiv({ cls: 'av-step-label', text: step.label });
			info.createDiv({ cls: 'av-step-detail', text: step.detail });
			return el;
		});

		const btnRow = contentEl.createDiv({ cls: 'av-tabs-container' });
		const btnStart = btnRow.createEl('button', { text: '🚀 Start Setup', cls: 'mod-cta' });
		btnStart.onclick = async () => {
			if (this.running) return;
			this.running = true;
			btnStart.setAttr('disabled', 'true');
			btnStart.setText('Running...');
			await this.runAllSteps();
			btnStart.removeAttribute('disabled');
			btnStart.setText('Done ✓');
		};

		btnRow.createEl('button', { text: 'Close', cls: 'av-tab-btn' }).onclick = () => this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private buildSteps(): SetupStep[] {
		const vaultPath = getVaultPath(this.app);
		const isWin = os.platform() === 'win32';

		const steps: SetupStep[] = [
			{
				label: 'Detect Platform',
				status: 'pending',
				detail: `Detected: ${isWin ? 'Windows' : os.platform()} | Vault: ${vaultPath}`,
			},
		];

		// Skills symlink
		const skillsSrc = path.join(vaultPath, this.plugin.settings.skillsFolder);
		const skillsDst = path.join(os.homedir(), '.agents', 'skills');
		steps.push({ label: '🧠 Link Skills Folder', status: 'pending', detail: `${skillsSrc} → ${skillsDst}` });

		// Scripts symlink
		const scriptsSrc = path.join(vaultPath, this.plugin.settings.scriptsFolder);
		const scriptsDst = path.join(os.homedir(), '.agents', 'scripts');
		steps.push({ label: '⚡ Link Scripts Folder', status: 'pending', detail: `${scriptsSrc} → ${scriptsDst}` });

		// AI tools symlinks
		for (const tool of this.plugin.settings.aiTools) {
			if (!tool.enabled) continue;
			const dstRel = isWin ? tool.windowsPath : tool.unixPath;
			const dst = path.join(os.homedir(), dstRel);
			const src = path.join(vaultPath, this.plugin.settings.vaultBrainFolder, tool.id);
			steps.push({ label: `🤖 Link ${tool.name}`, status: 'pending', detail: `${src} → ${dst}` });
		}

		// Git check
		steps.push({ label: '🔀 Verify Git Repository', status: 'pending', detail: 'Check vault is connected to GitHub' });

		return steps;
	}

	private setStepStatus(idx: number, status: SetupStep['status'], detail?: string): void {
		const el = this.stepEls[idx];
		const icons: Record<SetupStep['status'], string> = {
			pending: '○', running: '⟳', done: '✅', error: '❌', skipped: '⏭',
		};
		el.className = `av-step av-step-${status}`;
		el.querySelector('.av-step-icon')!.setText(icons[status]);
		if (detail) el.querySelector('.av-step-detail')!.setText(detail);
	}

	private async runAllSteps(): Promise<void> {
		const vaultPath = getVaultPath(this.app);
		const isWin = os.platform() === 'win32';
		let stepIdx = 0;

		// Step 0 — Platform detect (instant)
		this.setStepStatus(stepIdx++, 'done');

		// Step 1 — Skills
		await this.runSymlinkStep(
			stepIdx++,
			path.join(vaultPath, this.plugin.settings.skillsFolder),
			path.join(os.homedir(), '.agents', 'skills'),
			isWin,
		);

		// Step 2 — Scripts
		await this.runSymlinkStep(
			stepIdx++,
			path.join(vaultPath, this.plugin.settings.scriptsFolder),
			path.join(os.homedir(), '.agents', 'scripts'),
			isWin,
		);

		// AI tools
		for (const tool of this.plugin.settings.aiTools) {
			if (!tool.enabled) continue;
			const dstRel = isWin ? tool.windowsPath : tool.unixPath;
			const dst = path.join(os.homedir(), dstRel);
			const src = path.join(vaultPath, this.plugin.settings.vaultBrainFolder, tool.id);
			await this.runSymlinkStep(stepIdx++, src, dst, isWin);
		}

		// Final — Git check
		this.setStepStatus(stepIdx, 'running');
		try {
			const isRepo = fs.existsSync(path.join(vaultPath, '.git'));
			if (isRepo) {
				const remote = await this.plugin.git.getRemotes(true);
				const origin = remote.find(r => r.name === 'origin');
				this.setStepStatus(stepIdx, 'done', origin ? `Connected: ${origin.refs.fetch}` : 'Local repo (no remote)');
			} else {
				this.setStepStatus(stepIdx, 'skipped', 'Vault not yet a Git repo — use Git & Sync settings to init.');
			}
		} catch {
			this.setStepStatus(stepIdx, 'error', 'Could not check git status');
		}

		new Notice('✅ Machine setup complete! All symlinks are active.');
	}

	private async runSymlinkStep(idx: number, src: string, dst: string, isWin: boolean): Promise<void> {
		this.setStepStatus(idx, 'running');
		try {
			// Ensure source exists
			if (!fs.existsSync(src)) {
				fs.mkdirSync(src, { recursive: true });
			}

			// Handle existing destination
			if (fs.existsSync(dst)) {
				const stat = fs.lstatSync(dst);
				if (stat.isSymbolicLink()) {
					fs.unlinkSync(dst);
				} else {
					const backup = `${dst}_backup_${Date.now()}`;
					fs.renameSync(dst, backup);
				}
			}

			// Ensure parent dir exists
			const parent = path.dirname(dst);
			if (!fs.existsSync(parent)) {
				fs.mkdirSync(parent, { recursive: true });
			}

			const linkType = isWin ? 'junction' : 'dir';
			fs.symlinkSync(src, dst, linkType as fs.symlink.Type);
			this.setStepStatus(idx, 'done', `Linked ✓`);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			this.setStepStatus(idx, 'error', msg);
		}
	}
}

// ─────────────────────────────────────────────
// Brain Manager Modal
// ─────────────────────────────────────────────

class BrainManagerModal extends Modal {
	plugin: AgenticVaultPlugin;
	currentTab: 'system' | 'project' | 'coding' = 'system';
	rules: { system: string; project: string; coding: string } = { system: '', project: '', coding: '' };

	constructor(app: App, plugin: AgenticVaultPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		void this.initialize();
	}

	private async initialize(): Promise<void> {
		await this.loadExistingRules();
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('agentic-vault-modal');

		contentEl.createEl('h2', { text: '🧠 AI Brain Manager' });
		contentEl.createEl('p', {
			text: 'Define instructions for your AI agent. Saved and synced via Git automatically.',
			cls: 'av-subtitle',
		});

		const tabContainer = contentEl.createDiv({ cls: 'av-tabs-container' });
		const btnSystem  = tabContainer.createEl('button', { text: '⚙️ System Rules',    cls: 'av-tab-btn' });
		const btnProject = tabContainer.createEl('button', { text: '📁 Project Rules',   cls: 'av-tab-btn' });
		const btnCoding  = tabContainer.createEl('button', { text: '💻 Coding Standards', cls: 'av-tab-btn' });

		const editorContainer = contentEl.createDiv({ cls: 'av-editor-container' });
		const textArea = editorContainer.createEl('textarea', { cls: 'av-textarea' });

		const switchTab = (tab: 'system' | 'project' | 'coding', btn: HTMLButtonElement): void => {
			this.rules[this.currentTab] = textArea.value;
			this.currentTab = tab;
			textArea.value = this.rules[tab];
			[btnSystem, btnProject, btnCoding].forEach(b => b.removeClass('is-active'));
			btn.addClass('is-active');
		};

		btnSystem.onclick  = () => switchTab('system',  btnSystem);
		btnProject.onclick = () => switchTab('project', btnProject);
		btnCoding.onclick  = () => switchTab('coding',  btnCoding);

		btnSystem.addClass('is-active');
		textArea.value = this.rules.system;

		const btnSave = contentEl.createEl('button', { text: '💾 Save & Sync', cls: 'mod-cta av-save-btn' });
		btnSave.onclick = async () => {
			this.rules[this.currentTab] = textArea.value;
			await this.saveRulesToFile();
			this.close();
			void this.plugin.performDynamicCommit(false);
		};
	}

	private async loadExistingRules(): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(this.plugin.settings.ruleFilePath);
		if (file instanceof TFile) {
			const content = await this.app.vault.read(file);
			const sysMatch  = content.match(/## System Rules\n([\s\S]*?)(?=\n##|$)/);
			const projMatch = content.match(/## Project Rules\n([\s\S]*?)(?=\n##|$)/);
			const codeMatch = content.match(/## Coding Standards\n([\s\S]*?)(?=\n##|$)/);
			if (sysMatch)  this.rules.system  = sysMatch[1].trim();
			if (projMatch) this.rules.project = projMatch[1].trim();
			if (codeMatch) this.rules.coding  = codeMatch[1].trim();
		}
	}

	private async saveRulesToFile(): Promise<void> {
		const filePath = this.plugin.settings.ruleFilePath;
		const content  = `# AI Brain Rules\n\n## System Rules\n${this.rules.system}\n\n## Project Rules\n${this.rules.project}\n\n## Coding Standards\n${this.rules.coding}\n`;
		const file     = this.app.vault.getAbstractFileByPath(filePath);
		try {
			if (file instanceof TFile) {
				await this.app.vault.modify(file, content);
			} else {
				const folders = filePath.split('/');
				let cur = '';
				for (let i = 0; i < folders.length - 1; i++) {
					cur += (cur ? '/' : '') + folders[i];
					if (!this.app.vault.getAbstractFileByPath(cur)) {
						await this.app.vault.createFolder(cur);
					}
				}
				await this.app.vault.create(filePath, content);
			}
			new Notice('AI Brain updated!');
		} catch (err: unknown) {
			new Notice('Failed to save rules. Check console.');
			console.error(err);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

// ─────────────────────────────────────────────
// Create GitHub Issue Modal
// ─────────────────────────────────────────────

class CreateIssueModal extends Modal {
	plugin: AgenticVaultPlugin;
	issueTitle = '';
	issueBody  = '';
	issueLabel = 'enhancement';

	constructor(app: App, plugin: AgenticVaultPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('agentic-vault-modal');

		contentEl.createEl('h2', { text: '🚀 Create GitHub Issue' });
		contentEl.createEl('p', { text: 'Issue-Driven Development: create tracked issues instantly.', cls: 'av-subtitle' });

		new Setting(contentEl).setName('Title').addText(t =>
			t.setPlaceholder('Issue title...').onChange(v => { this.issueTitle = v; }));

		new Setting(contentEl).setName('Description').addTextArea(t => {
			t.inputEl.addClass('av-issue-textarea');
			t.setPlaceholder('Details...').onChange(v => { this.issueBody = v; });
		});

		new Setting(contentEl).setName('Label').addDropdown(d =>
			d.addOption('enhancement', 'Enhancement / Feature')
			 .addOption('bug', 'Bug / Fix')
			 .addOption('documentation', 'Documentation')
			 .setValue(this.issueLabel)
			 .onChange(v => { this.issueLabel = v; }));

		new Setting(contentEl).addButton(btn =>
			btn.setButtonText('Create Issue').setCta().onClick(async () => {
				if (!this.issueTitle) { new Notice('Title is required!'); return; }
				btn.setDisabled(true).setButtonText('Creating...');
				try {
					const vaultPath = getVaultPath(this.app);
					const args = ['issue', 'create', '--title', this.issueTitle, '--body', this.issueBody, '--label', this.issueLabel];
					const { stdout, stderr } = await execFileAsync('gh', args, { cwd: vaultPath });
					if (stderr && !stdout) {
						new Notice('Error creating issue. Is gh CLI authenticated?');
					} else {
						new Notice('✅ Issue created!');
						this.close();
					}
				} catch {
					new Notice('Error! Is GitHub CLI (gh) installed and authenticated?');
				} finally {
					btn.setDisabled(false).setButtonText('Create Issue');
				}
			}));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

// ─────────────────────────────────────────────
// Confirm Modal
// ─────────────────────────────────────────────

class ConfirmModal extends Modal {
	constructor(app: App, private message: string, private onConfirm: () => void) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Confirm' });
		contentEl.createEl('p', { text: this.message, cls: 'av-subtitle' });
		const row = contentEl.createDiv({ cls: 'av-tabs-container' });
		row.createEl('button', { text: 'Cancel', cls: 'av-tab-btn' }).onclick = () => this.close();
		row.createEl('button', { text: 'Proceed', cls: 'mod-cta' }).onclick = () => { this.onConfirm(); this.close(); };
	}

	onClose(): void { this.contentEl.empty(); }
}

// ─────────────────────────────────────────────
// Settings Tab
// ─────────────────────────────────────────────

class AgenticVaultSettingTab extends PluginSettingTab {
	plugin: AgenticVaultPlugin;
	remoteUrlInput = '';

	constructor(app: App, plugin: AgenticVaultPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const vaultPath      = getVaultPath(this.app);
		const isGitRepo      = fs.existsSync(path.join(vaultPath, '.git'));

		// ── Git & Sync ──────────────────────────
		new Setting(containerEl).setName('⚙️ Git & Sync').setHeading();

		const statusDiv = containerEl.createDiv();
		statusDiv.createEl('p', {
			text: isGitRepo
				? '✅ Vault is connected to Git.'
				: '⚠️ Not a Git repository yet. Add a GitHub URL and click Initialize.',
			attr: { style: `color: var(${isGitRepo ? '--text-success' : '--text-error'}); font-weight:bold; margin-bottom:10px;` },
		});

		new Setting(containerEl)
			.setName('GitHub Remote URL')
			.setDesc(isGitRepo ? 'Update your repository URL.' : 'Paste your empty GitHub repo URL to connect.')
			.addText(t => t.setPlaceholder('https://github.com/user/repo.git').onChange(v => { this.remoteUrlInput = v; }));

		new Setting(containerEl)
			.setName(isGitRepo ? 'Update Remote URL' : 'Initialize Repository')
			.addButton(btn => btn
				.setButtonText(isGitRepo ? '🔗 Update Remote' : '🚀 Initialize & Connect')
				.setCta()
				.onClick(async () => {
					try {
						if (!isGitRepo) {
							await this.plugin.git.init();
							await this.plugin.git.branch(['-M', 'main']);
						}
						if (this.remoteUrlInput) {
							try {
								await this.plugin.git.remote(['set-url', 'origin', this.remoteUrlInput]);
							} catch {
								await this.plugin.git.addRemote('origin', this.remoteUrlInput);
							}
						}
						new Notice('✅ Git setup complete!');
						this.display();
					} catch (err: unknown) {
						new Notice('Failed to init Git. Check console.');
						console.error(err);
					}
				}));

		containerEl.createEl('hr');

		// ── AI Brain ────────────────────────────
		new Setting(containerEl)
			.setName('AI Brain Manager')
			.setDesc('Open the visual editor for your AI rules.')
			.addButton(btn => btn.setButtonText('🧠 Open Editor').setCta().onClick(() => {
				new BrainManagerModal(this.app, this.plugin).open();
			}));

		new Setting(containerEl)
			.setName('Auto Push')
			.setDesc('Automatically commit and push changes to GitHub.')
			.addToggle(t => t.setValue(this.plugin.settings.gitAutoPush).onChange(async v => {
				this.plugin.settings.gitAutoPush = v;
				await this.plugin.saveSettings();
				this.plugin.startAutoSync();
			}));

		new Setting(containerEl)
			.setName('Auto-Sync Interval (minutes)')
			.setDesc('How often to sync. Set to 0 to disable.')
			.addText(t => t.setPlaceholder('1').setValue(String(this.plugin.settings.syncIntervalMinutes)).onChange(async v => {
				const n = parseInt(v);
				if (!isNaN(n) && n >= 0) {
					this.plugin.settings.syncIntervalMinutes = n;
					await this.plugin.saveSettings();
					this.plugin.startAutoSync();
				}
			}));

		new Setting(containerEl)
			.setName('Default Commit Message')
			.addText(t => t.setValue(this.plugin.settings.commitMessageFormat).onChange(async v => {
				this.plugin.settings.commitMessageFormat = v;
				await this.plugin.saveSettings();
			}));

		new Setting(containerEl)
			.setName('Brain File Path')
			.setDesc('Markdown file where AI rules are stored (e.g. AI-Brain/Rules.md)')
			.addText(t => t.setPlaceholder('AI-Brain/Rules.md').setValue(this.plugin.settings.ruleFilePath).onChange(async v => {
				this.plugin.settings.ruleFilePath = v;
				await this.plugin.saveSettings();
			}));

		// ── New Machine Setup ────────────────────
		new Setting(containerEl).setName('🖥️ New Machine Setup').setHeading();

		new Setting(containerEl)
			.setName('Run Setup Wizard')
			.setDesc('Create all symlinks for skills, scripts, and AI tools on this machine.')
			.addButton(btn => btn.setButtonText('🚀 Open Wizard').setCta().onClick(() => {
				new SetupWizardModal(this.app, this.plugin).open();
			}));

		new Setting(containerEl)
			.setName('Skills Folder (in Vault)')
			.setDesc('Will be linked to ~/.agents/skills')
			.addText(t => t.setPlaceholder('AI-Agent-System/skills').setValue(this.plugin.settings.skillsFolder).onChange(async v => {
				this.plugin.settings.skillsFolder = v;
				await this.plugin.saveSettings();
			}));

		new Setting(containerEl)
			.setName('Scripts Folder (in Vault)')
			.setDesc('Will be linked to ~/.agents/scripts')
			.addText(t => t.setPlaceholder('AI-Agent-System/scripts').setValue(this.plugin.settings.scriptsFolder).onChange(async v => {
				this.plugin.settings.scriptsFolder = v;
				await this.plugin.saveSettings();
			}));

		// ── AI Tool Symlinks ─────────────────────
		new Setting(containerEl).setName('🤖 AI Tools to Sync').setHeading();
		containerEl.createEl('p', {
			text: 'Select which AI tools should be linked to your vault. Each tool\'s config folder becomes a symlink pointing to your vault.',
			cls: 'av-subtitle',
		});

		for (const tool of this.plugin.settings.aiTools) {
			const isWin = os.platform() === 'win32';
			const dstPath = path.join('~', isWin ? tool.windowsPath : tool.unixPath);
			new Setting(containerEl)
				.setName(tool.name)
				.setDesc(`Current Link: ${dstPath}`)
				.addToggle(t => t.setValue(tool.enabled).onChange(async v => {
					tool.enabled = v;
					await this.plugin.saveSettings();
					this.display(); // Yeniden çiz ki text inputlar gelsin/gitsin
				}));

			if (tool.enabled) {
				const toolContainer = containerEl.createDiv({ cls: 'av-tool-path-container' });
				toolContainer.style.marginLeft = '30px';
				toolContainer.style.marginBottom = '20px';
				toolContainer.style.borderLeft = '2px solid var(--interactive-accent)';
				toolContainer.style.paddingLeft = '15px';

				new Setting(toolContainer)
					.setName('Windows Path')
					.setDesc('Relative to User Home (~/)')
					.addText(t => t.setValue(tool.windowsPath).onChange(async v => {
						tool.windowsPath = v;
						await this.plugin.saveSettings();
					}));

				new Setting(toolContainer)
					.setName('Mac/Linux Path')
					.setDesc('Relative to User Home (~/)')
					.addText(t => t.setValue(tool.unixPath).onChange(async v => {
						tool.unixPath = v;
						await this.plugin.saveSettings();
					}));
			}
		}

		// ── Manual Symlink ───────────────────────
		new Setting(containerEl).setName('🔗 Custom Symlink').setHeading();

		new Setting(containerEl)
			.setName('Vault Brain Folder')
			.setDesc('Folder in this vault where AI configs live.')
			.addText(t => t.setPlaceholder('AI-Brain').setValue(this.plugin.settings.vaultBrainFolder).onChange(async v => {
				this.plugin.settings.vaultBrainFolder = v;
				await this.plugin.saveSettings();
			}));

		new Setting(containerEl)
			.setName('Create Custom Symlink')
			.setDesc('Manually link a specific OS path to your vault folder.')
			.addButton(btn => btn.setButtonText('🔗 Create Link').setCta().onClick(() => {
				new ConfirmModal(this.app, 'This will backup the existing OS folder and create a symlink. Proceed?', () => {
					this.createCustomSymlink();
				}).open();
			}));
	}

	private createCustomSymlink(): void {
		try {
			const vaultPath = getVaultPath(this.app);
			const src = path.join(vaultPath, this.plugin.settings.vaultBrainFolder);
			const dst = resolvePath(this.plugin.settings.vaultBrainFolder);
			const isWin = os.platform() === 'win32';

			if (!fs.existsSync(src)) fs.mkdirSync(src, { recursive: true });

			if (fs.existsSync(dst)) {
				const stat = fs.lstatSync(dst);
				if (stat.isSymbolicLink()) {
					fs.unlinkSync(dst);
				} else {
					fs.renameSync(dst, `${dst}_backup_${Date.now()}`);
				}
			} else {
				const parent = path.dirname(dst);
				if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
			}

			const type = isWin ? 'junction' : 'dir';
			fs.symlinkSync(src, dst, type as fs.symlink.Type);
			new Notice('✅ Symlink created!');
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			new Notice(`Symlink failed: ${msg}`);
		}
	}
}
