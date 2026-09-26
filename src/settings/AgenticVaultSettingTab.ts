import { App, PluginSettingTab, Setting, SettingDefinitionRender, SettingGroup, Notice } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import AgenticVaultPlugin from '../../main';
import { BrainManagerModal } from '../modals/BrainManagerModal';
import { SetupWizardModal } from '../modals/SetupWizardModal';
import * as os from 'os';
import { getVaultPath } from '../obsidian-util';

// Internal helper to cast app to access private routing API
interface AppWithSetting extends App {
	setting: { openTabById(id: string): void };
}

class AgenticVaultSettingTab extends PluginSettingTab {
	plugin: AgenticVaultPlugin;
	remoteUrlInput = '';

	constructor(app: App, plugin: AgenticVaultPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionRender[] {
		const vaultPath = getVaultPath(this.app);
		const isGitRepo = fs.existsSync(path.join(vaultPath, '.git'));
		const defs: SettingDefinitionRender[] = [];

		defs.push({
			name: '⚙️ Git & Sync',
			render: (setting: Setting, _group: SettingGroup) => {
				setting.setHeading().setName('⚙️ Git & Sync');

				const statusDiv = setting.settingEl.createDiv();
				statusDiv.createEl('p', {
					text: isGitRepo
						? '✅ Vault is connected to Git.'
						: '⚠️ Not a Git repository yet. Add a GitHub URL and click Initialize.',
					attr: { style: `color: var(${isGitRepo ? '--text-success' : '--text-error'}); font-weight:bold; margin-bottom:10px;` },
				});
				setting.settingEl.insertAdjacentElement('afterend', statusDiv);
			}
		});

		defs.push({
			name: 'GitHub Remote URL',
			desc: isGitRepo ? 'Update your repository URL.' : 'Paste your empty GitHub repo URL to connect.',
			render: (setting: Setting, _group: SettingGroup) => {
				setting.setName('GitHub Remote URL')
					.setDesc(isGitRepo ? 'Update your repository URL.' : 'Paste your empty GitHub repo URL to connect.')
					.addText(t => t.setPlaceholder('https://github.com/user/repo.git').onChange(v => { this.remoteUrlInput = v; }));
			}
		});

		defs.push({
			name: isGitRepo ? 'Update Remote URL' : 'Initialize Repository',
			render: (setting: Setting, _group: SettingGroup) => {
				setting.setName(isGitRepo ? 'Update Remote URL' : 'Initialize Repository')
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
								(this.app as AppWithSetting).setting.openTabById(this.plugin.manifest.id);
							} catch (err: unknown) {
								new Notice('Failed to init Git. Check console.');
								console.error(err);
							}
						}));

				const hr = createEl('hr');
				setting.settingEl.insertAdjacentElement('afterend', hr);
			}
		});

		defs.push({
			name: 'AI Brain Manager',
			desc: 'Open the visual editor for your AI rules.',
			render: (setting: Setting, _group: SettingGroup) => {
				setting.setName('AI Brain Manager')
					.setDesc('Open the visual editor for your AI rules.')
					.addButton(btn => btn.setButtonText('🧠 Open Editor').setCta().onClick(() => {
						new BrainManagerModal(this.app, this.plugin).open();
					}));
			}
		});

		defs.push({
			name: 'Auto Push',
			desc: 'Automatically commit and push changes to GitHub.',
			render: (setting: Setting, _group: SettingGroup) => {
				setting.setName('Auto Push')
					.setDesc('Automatically commit and push changes to GitHub.')
					.addToggle(t => t.setValue(this.plugin.settings.gitAutoPush).onChange(async v => {
						this.plugin.settings.gitAutoPush = v;
						await this.plugin.saveSettings();
						this.plugin.startAutoSync();
					}));
			}
		});

		defs.push({
			name: 'Allow Public Remote',
			desc: 'DANGER: Allow syncing even if the GitHub repository is public. This may expose your AI secrets.',
			render: (setting: Setting, _group: SettingGroup) => {
				setting.setName('Allow Public Remote')
					.setDesc('DANGER: Allow syncing even if the GitHub repository is public. This may expose your AI secrets.')
					.addToggle(t => t.setValue(this.plugin.settings.allowPublicRemote).onChange(async v => {
						this.plugin.settings.allowPublicRemote = v;
						await this.plugin.saveSettings();
						(this.app as AppWithSetting).setting.openTabById(this.plugin.manifest.id);
					}));
			}
		});

		defs.push({
			name: 'Enable Secret Scanner',
			desc: 'Block commits if secrets (API keys, .env) are detected. (Cannot be disabled unless "Allow Public Remote" is ON).',
			render: (setting: Setting, _group: SettingGroup) => {
				setting.setName('Enable Secret Scanner')
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
			}
		});

		defs.push({
			name: 'Auto-Sync Interval (minutes)',
			desc: 'How often to sync. Set to 0 to disable.',
			render: (setting: Setting, _group: SettingGroup) => {
				setting.setName('Auto-Sync Interval (minutes)')
					.setDesc('How often to sync. Set to 0 to disable.')
					.addText(t => t.setPlaceholder('1').setValue(String(this.plugin.settings.syncIntervalMinutes)).onChange(async v => {
						const n = parseInt(v);
						if (!isNaN(n) && n >= 0) {
							this.plugin.settings.syncIntervalMinutes = n;
							await this.plugin.saveSettings();
							this.plugin.startAutoSync();
						}
					}));
			}
		});

		defs.push({
			name: 'Default Commit Message',
			render: (setting: Setting, _group: SettingGroup) => {
				setting.setName('Default Commit Message')
					.addText(t => t.setValue(this.plugin.settings.commitMessageFormat).onChange(async v => {
						this.plugin.settings.commitMessageFormat = v;
						await this.plugin.saveSettings();
					}));
			}
		});

		defs.push({
			name: 'Device Name',
			desc: 'Used to identify this device in conflict resolution copies (e.g. .conflict-local-[deviceName]-2024...).',
			render: (setting: Setting, _group: SettingGroup) => {
				setting.setName('Device Name')
					.setDesc('Used to identify this device in conflict resolution copies (e.g. .conflict-local-[deviceName]-2024...).')
					.addText(t => t.setPlaceholder(os.hostname()).setValue(this.plugin.settings.deviceName).onChange(async v => {
						this.plugin.settings.deviceName = v || os.hostname();
						await this.plugin.saveSettings();
					}));
			}
		});

		defs.push({
			name: 'Brain File Path',
			desc: 'Markdown file where AI rules are stored (e.g. AI-Brain/Rules.md)',
			render: (setting: Setting, _group: SettingGroup) => {
				setting.setName('Brain File Path')
					.setDesc('Markdown file where AI rules are stored (e.g. AI-Brain/Rules.md)')
					.addText(t => t.setPlaceholder('AI-Brain/Rules.md').setValue(this.plugin.settings.ruleFilePath).onChange(async v => {
						this.plugin.settings.ruleFilePath = v;
						await this.plugin.saveSettings();
					}));
			}
		});

		defs.push({
			name: '🖥️ New Machine Setup',
			render: (setting: Setting, _group: SettingGroup) => {
				setting.setHeading().setName('🖥️ New Machine Setup');
			}
		});

		defs.push({
			name: 'Run Setup Wizard',
			desc: 'Create all symlinks for skills, scripts, and AI tools on this machine.',
			render: (setting: Setting, _group: SettingGroup) => {
				setting.setName('Run Setup Wizard')
					.setDesc('Create all symlinks for skills, scripts, and AI tools on this machine.')
					.addButton(btn => btn.setButtonText('🚀 Open Wizard').setCta().onClick(() => {
						new SetupWizardModal(this.app, this.plugin).open();
					}));
			}
		});

		defs.push({
			name: 'Skills Folder (in Vault)',
			desc: 'Will be linked to ~/.agents/skills',
			render: (setting: Setting, _group: SettingGroup) => {
				setting.setName('Skills Folder (in Vault)')
					.setDesc('Will be linked to ~/.agents/skills')
					.addText(t => t.setPlaceholder('AI-Agent-System/skills').setValue(this.plugin.settings.skillsFolder).onChange(async v => {
						this.plugin.settings.skillsFolder = v;
						await this.plugin.saveSettings();
					}));
			}
		});

		defs.push({
			name: 'Scripts Folder (in Vault)',
			desc: 'Will be linked to ~/.agents/scripts',
			render: (setting: Setting, _group: SettingGroup) => {
				setting.setName('Scripts Folder (in Vault)')
					.setDesc('Will be linked to ~/.agents/scripts')
					.addText(t => t.setPlaceholder('AI-Agent-System/scripts').setValue(this.plugin.settings.scriptsFolder).onChange(async v => {
						this.plugin.settings.scriptsFolder = v;
						await this.plugin.saveSettings();
					}));
			}
		});

		defs.push({
			name: '🤖 AI Tools to Sync',
			render: (setting: Setting, _group: SettingGroup) => {
				setting.setHeading().setName('🤖 AI Tools to Sync');
				const p = createEl('p', {
					text: 'Select which AI tools should be linked to your vault. Each tool\'s config folder becomes a symlink pointing to your vault.',
					cls: 'av-subtitle',
				});
				setting.settingEl.insertAdjacentElement('afterend', p);
			}
		});

		for (const tool of this.plugin.settings.aiTools) {
			const isWin = os.platform() === 'win32';
			const dstPath = path.join('~', isWin ? tool.windowsPath : tool.unixPath);

			defs.push({
				name: tool.name,
				desc: `Current Link: ${dstPath}`,
				render: (setting: Setting, _group: SettingGroup) => {
					setting.setName(tool.name)
						.setDesc(`Current Link: ${dstPath}`)
						.addToggle(t => t.setValue(tool.enabled).onChange(async v => {
							tool.enabled = v;
							await this.plugin.saveSettings();
							(this.app as AppWithSetting).setting.openTabById(this.plugin.manifest.id);
						}));

					if (tool.enabled) {
						const toolContainer = createDiv({ cls: 'av-tool-path-container av-tool-padding' });

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

						setting.settingEl.insertAdjacentElement('afterend', toolContainer);
					}
				}
			});
		}

		return defs;
	}
}

export { AgenticVaultSettingTab };
