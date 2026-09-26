import { App, Modal, Notice, TFile } from 'obsidian';
import AgenticVaultPlugin from '../../main';
import { parseRules, serializeRules } from '../util';

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
			void this.plugin.performDynamicCommit(false, true);
		};
	}

	private async loadExistingRules(): Promise<void> {
		try {
			const file = this.app.vault.getAbstractFileByPath(this.plugin.settings.ruleFilePath);
			if (file instanceof TFile) {
				const content = await this.app.vault.read(file);
				this.rules = parseRules(content);
			}
		} catch (err: unknown) {
			console.error("Agentic Vault: Error loading rules:", err);
			new Notice("Failed to load existing rules. Check console.");
		}
	}

	private async saveRulesToFile(): Promise<void> {
		const filePath = this.plugin.settings.ruleFilePath;
		const content  = serializeRules(this.rules);
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


export { BrainManagerModal };
