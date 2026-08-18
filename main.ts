import { App, Notice, Plugin, PluginSettingTab, Setting, Modal, TFile } from 'obsidian';
import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

interface AgenticVaultSettings {
	gitAutoPush: boolean;
	syncIntervalMinutes: number;
	commitMessageFormat: string;
	ruleFilePath: string;
	vaultBrainFolder: string;
	systemAIFolder: string;
}

const DEFAULT_SETTINGS: AgenticVaultSettings = {
	gitAutoPush: true,
	syncIntervalMinutes: 1,
	commitMessageFormat: 'docs: update AI memory & rules (auto)',
	ruleFilePath: 'AI-Brain/Rules.md',
	vaultBrainFolder: 'AI-Brain',
	systemAIFolder: '~/.gemini/config'
}

export default class AgenticVaultPlugin extends Plugin {
	settings: AgenticVaultSettings;
	git: SimpleGit;
	syncIntervalId: number | null = null;

	async onload() {
		await this.loadSettings();
		
		const vaultPath = (this.app.vault.adapter as any).getBasePath();
		this.git = simpleGit(vaultPath);

		const ribbonIconEl = this.addRibbonIcon('git-commit-vertical', 'Force Git Sync (Agentic Vault)', (evt: MouseEvent) => {
			this.performDynamicCommit();
		});
		ribbonIconEl.addClass('agentic-vault-ribbon-class');

		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Agentic Vault: Active');

		this.addCommand({
			id: 'perform-dynamic-commit',
			name: 'Force Git Sync (Commit & Push)',
			callback: () => {
				this.performDynamicCommit();
			}
		});

		this.addCommand({
			id: 'open-brain-manager',
			name: 'Open AI Brain Manager',
			callback: () => {
				new BrainManagerModal(this.app, this).open();
			}
		});

		this.addCommand({
			id: 'create-github-issue',
			name: 'Create GitHub Issue (IDD)',
			callback: () => {
				new CreateIssueModal(this.app, this).open();
			}
		});

		this.addSettingTab(new AgenticVaultSettingTab(this.app, this));

		this.startAutoSync();
	}

	startAutoSync() {
		if (this.syncIntervalId !== null) {
			window.clearInterval(this.syncIntervalId);
			this.syncIntervalId = null;
		}
		
		if (this.settings.gitAutoPush && this.settings.syncIntervalMinutes > 0) {
			this.syncIntervalId = window.setInterval(() => {
				console.log(`Agentic Vault: Running ${this.settings.syncIntervalMinutes}-minute auto-sync...`);
				this.performDynamicCommit(true);
			}, this.settings.syncIntervalMinutes * 60 * 1000);
			this.registerInterval(this.syncIntervalId);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async performDynamicCommit(silent: boolean = false) {
		if (!silent) new Notice('Agentic Vault: Git Sync Started...');
		try {
			await this.git.pull();
			await this.git.add('.');
			const status = await this.git.status();
			if (status.staged.length > 0 || status.created.length > 0 || status.deleted.length > 0 || status.modified.length > 0) {
				await this.git.commit(this.settings.commitMessageFormat);
				if (!silent) new Notice('Changes committed locally.');
				
				if (this.settings.gitAutoPush) {
					await this.git.push();
					new Notice("Agentic Vault: Changes pushed to GitHub! 🚀");
				}
			} else {
				if (!silent) new Notice('Agentic Vault: No new changes to commit.');
			}
		} catch (error: any) {
			console.error("Agentic Vault Git Error:", error);
			const errMsg = error.message || String(error);
			if (errMsg.includes('CONFLICT') || errMsg.includes('merge')) {
				new Notice('⚠️ Git Sync Failed: Merge conflict detected! Please resolve conflicts manually.');
			} else {
				if (!silent) new Notice('Git Sync Failed! Check Developer Console.');
			}
		}
	}
}

class CreateIssueModal extends Modal {
	plugin: AgenticVaultPlugin;
	issueTitle: string = '';
	issueBody: string = '';
	issueLabel: string = 'enhancement';

	constructor(app: App, plugin: AgenticVaultPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.addClass('agentic-vault-modal');

		contentEl.createEl('h2', {text: '🚀 Create GitHub Issue'});
		contentEl.createEl('p', {
			text: 'Issue-Driven Development: Instantly create tracked issues in your repository.',
			cls: 'av-subtitle'
		});
		
		new Setting(contentEl)
			.setName('Title')
			.addText(text => text
				.setPlaceholder('Issue title...')
				.onChange(value => this.issueTitle = value));

		new Setting(contentEl)
			.setName('Description')
			.addTextArea(text => {
				text.inputEl.addClass('av-issue-textarea');
				text.setPlaceholder('Detailed description of the bug or feature...')
				    .onChange(value => this.issueBody = value);
			});

		new Setting(contentEl)
			.setName('Label')
			.addDropdown(drop => drop
				.addOption('enhancement', 'Enhancement / Feature')
				.addOption('bug', 'Bug / Fix')
				.addOption('documentation', 'Documentation')
				.setValue(this.issueLabel)
				.onChange(value => this.issueLabel = value));

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Create Issue')
				.setCta()
				.onClick(async () => {
					if (!this.issueTitle) {
						new Notice('Issue Title is required!');
						return;
					}
					
					new Notice('Creating Issue in background...');
					btn.setDisabled(true);
					btn.setButtonText('Creating...');
					
					try {
						const vaultPath = (this.plugin.app.vault.adapter as any).getBasePath();
						
						const args = ['issue', 'create', '--title', this.issueTitle, '--body', this.issueBody, '--label', this.issueLabel];
						
						const { stdout, stderr } = await execFileAsync('gh', args, { cwd: vaultPath });
						
						if (stderr && !stdout) {
							console.error(stderr);
							new Notice('Error creating issue. Check console.');
						} else {
							new Notice(`✅ Issue created successfully!`);
							this.close();
						}
					} catch (e) {
						console.error(e);
						new Notice('Error! Is GitHub CLI (gh) installed and authenticated?');
					} finally {
						btn.setDisabled(false);
						btn.setButtonText('Create Issue');
					}
				}));
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class BrainManagerModal extends Modal {
	plugin: AgenticVaultPlugin;
	currentTab: 'system' | 'project' | 'coding' = 'system';
	rules: { system: string, project: string, coding: string } = { system: '', project: '', coding: '' };
	textAreas: Record<string, HTMLTextAreaElement> = {};

	constructor(app: App, plugin: AgenticVaultPlugin) {
		super(app);
		this.plugin = plugin;
	}

	async onOpen() {
		await this.loadExistingRules();

		const {contentEl} = this;
		contentEl.empty();
		contentEl.addClass('agentic-vault-modal');

		contentEl.createEl('h2', {text: '🧠 AI Brain Manager'});
		contentEl.createEl('p', {
			text: 'Define instructions for your AI agent. These rules will be saved and automatically tracked via Git.',
			cls: 'av-subtitle'
		});

		const tabContainer = contentEl.createDiv({cls: 'av-tabs-container'});

		const btnSystem = tabContainer.createEl('button', {text: '⚙️ System Rules', cls: 'av-tab-btn'});
		const btnProject = tabContainer.createEl('button', {text: '📁 Project Rules', cls: 'av-tab-btn'});
		const btnCoding = tabContainer.createEl('button', {text: '💻 Coding Standards', cls: 'av-tab-btn'});

		const editorContainer = contentEl.createDiv({cls: 'av-editor-container'});
		const textArea = editorContainer.createEl('textarea');
		textArea.addClass('av-textarea');
		
		this.textAreas['editor'] = textArea;

		const switchTab = (tab: 'system' | 'project' | 'coding', btn: HTMLButtonElement) => {
			this.rules[this.currentTab] = textArea.value;
			this.currentTab = tab;
			textArea.value = this.rules[tab];
			
			[btnSystem, btnProject, btnCoding].forEach(b => b.removeClass('is-active'));
			btn.addClass('is-active');
		};

		btnSystem.onclick = () => switchTab('system', btnSystem);
		btnProject.onclick = () => switchTab('project', btnProject);
		btnCoding.onclick = () => switchTab('coding', btnCoding);

		btnSystem.addClass('is-active');
		textArea.value = this.rules.system;

		const btnSave = contentEl.createEl('button', {text: '💾 Save Brain & Sync', cls: 'mod-cta av-save-btn'});
		btnSave.onclick = async () => {
			this.rules[this.currentTab] = textArea.value;
			await this.saveRulesToFile();
			this.close();
			this.plugin.performDynamicCommit(false);
		};
	}

	async loadExistingRules() {
		const filePath = this.plugin.settings.ruleFilePath;
		const file = this.app.vault.getAbstractFileByPath(filePath);
		
		if (file instanceof TFile) {
			const content = await this.app.vault.read(file);
			const sysMatch = content.match(/## System Rules\n([\s\S]*?)(?=\n##|$)/);
			const projMatch = content.match(/## Project Rules\n([\s\S]*?)(?=\n##|$)/);
			const codeMatch = content.match(/## Coding Standards\n([\s\S]*?)(?=\n##|$)/);
			
			if (sysMatch) this.rules.system = sysMatch[1].trim();
			if (projMatch) this.rules.project = projMatch[1].trim();
			if (codeMatch) this.rules.coding = codeMatch[1].trim();
		}
	}

	async saveRulesToFile() {
		const filePath = this.plugin.settings.ruleFilePath;
		const content = `# AI Brain Rules\n\n## System Rules\n${this.rules.system}\n\n## Project Rules\n${this.rules.project}\n\n## Coding Standards\n${this.rules.coding}\n`;
		
		const file = this.app.vault.getAbstractFileByPath(filePath);
		
		try {
			if (file instanceof TFile) {
				await this.app.vault.modify(file, content);
			} else {
				const folders = filePath.split('/');
				let currentPath = '';
				for (let i = 0; i < folders.length - 1; i++) {
					currentPath += (currentPath === '' ? '' : '/') + folders[i];
					const folder = this.app.vault.getAbstractFileByPath(currentPath);
					if (!folder) {
						await this.app.vault.createFolder(currentPath);
					}
				}
				await this.app.vault.create(filePath, content);
			}
			new Notice('AI Brain successfully updated!');
		} catch (error) {
			console.error('Error saving rules:', error);
			new Notice('Failed to save rules. Check console.');
		}
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class ConfirmModal extends Modal {
	constructor(app: App, private message: string, private onConfirm: () => void) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.addClass('agentic-vault-modal');

		contentEl.createEl('h2', {text: 'Confirm Action'});
		contentEl.createEl('p', {text: this.message, cls: 'av-subtitle'});
		
		const btnContainer = contentEl.createDiv({cls: 'av-tabs-container'});
		
		const btnCancel = btnContainer.createEl('button', {text: 'Cancel', cls: 'av-tab-btn'});
		btnCancel.onclick = () => this.close();
		
		const btnProceed = btnContainer.createEl('button', {text: 'Proceed', cls: 'mod-cta'});
		btnProceed.onclick = () => {
			this.onConfirm();
			this.close();
		};
	}

	onClose() {
		this.contentEl.empty();
	}
}

class AgenticVaultSettingTab extends PluginSettingTab {
	plugin: AgenticVaultPlugin;
	remoteUrlInput: string = '';

	constructor(app: App, plugin: AgenticVaultPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();
		
		const vaultPath = (this.plugin.app.vault.adapter as any).getBasePath();
		const isGitInitialized = fs.existsSync(path.join(vaultPath, '.git'));

		containerEl.createEl('h2', {text: 'Agentic Vault Settings'});

		if (!isGitInitialized) {
			containerEl.createEl('div', {
				text: '⚠️ Your Obsidian Vault is NOT a Git repository yet!',
				attr: { style: 'color: var(--text-error); font-weight: bold; margin-bottom: 15px; background: var(--background-modifier-error); padding: 10px; border-radius: 5px;' }
			});
		} else {
			containerEl.createEl('div', {
				text: '✅ Vault is connected to Git. You can update your remote URL below if needed.',
				attr: { style: 'color: var(--text-success); font-weight: bold; margin-bottom: 15px;' }
			});
		}

		new Setting(containerEl)
			.setName('GitHub Remote URL (Optional)')
			.setDesc(isGitInitialized ? 'Update your repository URL.' : 'Paste your empty GitHub Repository URL to connect it automatically.')
			.addText(text => text
				.setPlaceholder('https://github.com/user/repo.git')
				.onChange(value => {
					this.remoteUrlInput = value;
				}));

		new Setting(containerEl)
			.setName(isGitInitialized ? 'Update Remote URL' : 'Initialize Repository')
			.setDesc(isGitInitialized ? 'Connects your existing local repo to the new URL.' : 'Creates a local Git repository and connects it to the URL above.')
			.addButton(btn => btn
				.setButtonText(isGitInitialized ? '🔗 Update Remote' : '🚀 Initialize & Connect')
				.setCta()
				.onClick(async () => {
					try {
						if (!isGitInitialized) {
							new Notice('Initializing Git Repository...');
							await this.plugin.git.init();
							await this.plugin.git.branch(['-M', 'main']);
						}
						
						if (this.remoteUrlInput) {
							try {
								await this.plugin.git.remote(['set-url', 'origin', this.remoteUrlInput]);
							} catch (e) {
								await this.plugin.git.addRemote('origin', this.remoteUrlInput);
							}
							new Notice('Connected to Remote GitHub Repository.');
						}
						
						new Notice('✅ Git setup complete! You can now sync.');
						this.display();
					} catch (error) {
						console.error('Git Init Error:', error);
						new Notice('Failed to initialize Git. Check Console.');
					}
				}));
		
		containerEl.createEl('hr');

		new Setting(containerEl)
			.setName('AI Brain Manager')
			.setDesc('Open the visual editor to manage your AI rules (System, Project, Coding).')
			.addButton(btn => btn
				.setButtonText('🧠 Open Editor')
				.setCta()
				.onClick(() => {
					new BrainManagerModal(this.app, this.plugin).open();
				}));

		new Setting(containerEl)
			.setName('Auto Push')
			.setDesc('Automatically commit and push changes to GitHub in the background.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.gitAutoPush)
				.onChange(async (value) => {
					this.plugin.settings.gitAutoPush = value;
					await this.plugin.saveSettings();
					this.plugin.startAutoSync();
				}));

		new Setting(containerEl)
			.setName('Auto-Sync Interval (Minutes)')
			.setDesc('How often should it check for changes and sync to GitHub? (Set to 0 to disable)')
			.addText(text => text
				.setPlaceholder('1')
				.setValue(String(this.plugin.settings.syncIntervalMinutes))
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num >= 0) {
						this.plugin.settings.syncIntervalMinutes = num;
						await this.plugin.saveSettings();
						this.plugin.startAutoSync();
					}
				}));

		new Setting(containerEl)
			.setName('Default Commit Message')
			.setDesc('Standard commit message for background auto-sync.')
			.addText(text => text
				.setPlaceholder('docs: update AI memory & rules (auto)')
				.setValue(this.plugin.settings.commitMessageFormat)
				.onChange(async (value) => {
					this.plugin.settings.commitMessageFormat = value;
					await this.plugin.saveSettings();
				}));
				
		new Setting(containerEl)
			.setName('Brain File Path')
			.setDesc('The Markdown file where AI rules will be stored (e.g. AI-Brain/Rules.md)')
			.addText(text => text
				.setPlaceholder('AI-Brain/Rules.md')
				.setValue(this.plugin.settings.ruleFilePath)
				.onChange(async (value) => {
					this.plugin.settings.ruleFilePath = value;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('br');
		containerEl.createEl('h2', {text: '🔗 AI System Link (Symlink)'});
		containerEl.createEl('p', {
			text: "Link your OS's AI configuration folder directly into this Obsidian vault.",
			cls: 'av-subtitle'
		});

		new Setting(containerEl)
			.setName('Vault Brain Folder')
			.setDesc('The folder inside this Obsidian vault where actual files are stored.')
			.addText(text => text
				.setPlaceholder('AI-Brain')
				.setValue(this.plugin.settings.vaultBrainFolder)
				.onChange(async (value) => {
					this.plugin.settings.vaultBrainFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('System AI Folder')
			.setDesc('The path on your OS where the AI expects its config (e.g. ~/.gemini/config). This will become a symlink.')
			.addText(text => text
				.setPlaceholder('~/.gemini/config')
				.setValue(this.plugin.settings.systemAIFolder)
				.onChange(async (value) => {
					this.plugin.settings.systemAIFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Create Symlink (Junction)')
			.setDesc('Will backup the existing OS folder and create a junction link to your Vault.')
			.addButton(btn => btn
				.setButtonText('🔗 Create Symlink')
				.setCta()
				.onClick(() => {
					new ConfirmModal(this.plugin.app, 'This will backup the existing OS folder (renaming it) and create a symlink. Are you sure you want to proceed?', () => {
						this.createSymlink();
					}).open();
				}));
	}

	createSymlink() {
		try {
			const vaultPath = (this.plugin.app.vault.adapter as any).getBasePath();
			const sourceDir = path.join(vaultPath, this.plugin.settings.vaultBrainFolder);
			
			let targetDir = this.plugin.settings.systemAIFolder;
			if (targetDir.startsWith('~/') || targetDir.startsWith('~\\')) {
				targetDir = path.join(os.homedir(), targetDir.slice(2));
			}

			if (!fs.existsSync(sourceDir)) {
				fs.mkdirSync(sourceDir, { recursive: true });
				new Notice('Created Vault Brain Folder because it did not exist.');
			}

			if (fs.existsSync(targetDir)) {
				const stats = fs.lstatSync(targetDir);
				if (stats.isSymbolicLink()) {
					fs.unlinkSync(targetDir);
					new Notice('Removed old symlink.');
				} else {
					const backupDir = targetDir + '_backup_' + Date.now();
					fs.renameSync(targetDir, backupDir);
					new Notice('Backed up existing System AI folder.');
				}
			} else {
				const parentDir = path.dirname(targetDir);
				if (!fs.existsSync(parentDir)) {
					fs.mkdirSync(parentDir, { recursive: true });
				}
			}

			const type = os.platform() === 'win32' ? 'junction' : 'dir';
			fs.symlinkSync(sourceDir, targetDir, type as fs.symlink.Type);
			
			new Notice('✅ Success! OS AI system is now linked to Obsidian Vault.');
		} catch (error) {
			console.error('Symlink Error:', error);
			new Notice('Failed to create symlink. Check console for details.');
		}
	}
}
