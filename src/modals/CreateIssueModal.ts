import { App, Modal, Notice, Setting } from 'obsidian';
import AgenticVaultPlugin from '../../main';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getVaultPath } from '../obsidian-util';

const execFileAsync = promisify(execFile);

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
						new Notice(`Error: ${stderr}`);
					} else {
						new Notice('✅ Issue created!');
						this.close();
					}
				} catch (err: any) {
					const errMsg = err.stderr || err.message || 'Is GitHub CLI (gh) installed and authenticated?';
					new Notice(`Error: ${errMsg}`);
				} finally {
					btn.setDisabled(false).setButtonText('Create Issue');
				}
			}));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}


export { CreateIssueModal };
