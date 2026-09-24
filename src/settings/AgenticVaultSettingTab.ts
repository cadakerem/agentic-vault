import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import AgenticVaultPlugin from '../../main';
import { BrainManagerModal } from '../modals/BrainManagerModal';
import { SetupWizardModal } from '../modals/SetupWizardModal';
import * as os from 'os';
import { getVaultPath } from '../obsidian-util';

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
							await this.plugin.git.checkoutLocalBranch('main');
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
			.setName('Allow Public Remote')
			.setDesc('DANGER: Allow syncing even if the GitHub repository is public. This may expose your AI secrets.')
			.addToggle(t => t.setValue(this.plugin.settings.allowPublicRemote).onChange(async v => {
				this.plugin.settings.allowPublicRemote = v;
				await this.plugin.saveSettings();
				this.display(); // re-render to update Secret Scanner toggle state
			}));

		new Setting(containerEl)
			.setName('Enable Secret Scanner')
			.setDesc('Block commits if secrets (API keys, .env) are detected. (Cannot be disabled unless "Allow Public Remote" is ON).')
			.addToggle(t => {
				t.setValue(this.plugin.settings.scanSecrets).onChange(async v => {
					this.plugin.settings.scanSecrets = v;
					await this.plugin.saveSettings();
				});
				if (!this.plugin.settings.allowPublicRemote) {
					t.setValue(true);
					t.setDisabled(true);
				}
			});

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
			.setName('Device Name')
			.setDesc('Used to identify this device in conflict resolution copies (e.g. .conflict-local-[deviceName]-2024...).')
			.addText(t => t.setPlaceholder(os.hostname()).setValue(this.plugin.settings.deviceName).onChange(async v => {
				this.plugin.settings.deviceName = v || os.hostname();
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
	}
}

export { AgenticVaultSettingTab };
