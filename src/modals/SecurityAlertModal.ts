import { App, Modal, Setting, Notice } from 'obsidian';
import { SimpleGit } from 'simple-git';

export class SecurityAlertModal extends Modal {
	trackedFiles: string[];
	git: SimpleGit;

	constructor(app: App, git: SimpleGit, trackedFiles: string[]) {
		super(app);
		this.git = git;
		this.trackedFiles = trackedFiles;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		
		contentEl.createEl('h2', { text: '🚨 CRITICAL SECURITY ALERT 🚨', cls: 'agentic-vault-danger' });
		contentEl.createEl('h3', { text: 'API KEYS POTENTIALLY EXPOSED' });
		
		const p1 = contentEl.createEl('p');
		p1.innerHTML = `<strong>DANGER:</strong> The following ${this.trackedFiles.length} sensitive files (e.g. data.json) are currently tracked by Git in your vault:`;
		
		const ul = contentEl.createEl('ul');
		this.trackedFiles.forEach(f => ul.createEl('li', { text: f }));

		const p2 = contentEl.createEl('p');
		p2.innerHTML = `<span style="color:var(--text-error); font-weight:bold; font-size: 1.1em;">1. REVOKE YOUR API KEYS IMMEDIATELY!</span><br>If this repository is or ever was public, your keys are compromised. Do not wait. Delete them from your AI provider's dashboard right now.`;

		const p3 = contentEl.createEl('p');
		p3.innerHTML = `<strong>2. Stop Tracking the Files:</strong><br>You MUST remove these files from Git tracking to prevent them from being pushed again. Click the button below to do this automatically.`;

		const p4 = contentEl.createEl('p');
		p4.innerHTML = `<strong>3. Clean Git History (Hygiene):</strong><br>The keys are STILL visible in your past git history! Use <a href="https://rtyley.github.io/bfg-repo-cleaner/">BFG Repo-Cleaner</a> to purge them, or delete the repository completely. Note: Rewriting history requires a force-push, which will break clones for other team members.`;

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Stop Tracking & Protect Me')
				.setTooltip('Runs git rm --cached on these files')
				.setCta()
				.onClick(async () => {
					btn.setDisabled(true);
					btn.setButtonText('Removing...');
					try {
						await this.git.raw(['rm', '--cached', '--', ...this.trackedFiles]);
						new Notice(`Successfully removed ${this.trackedFiles.length} files from git tracking. DON'T FORGET TO REVOKE YOUR KEYS!`, 10000);
						this.close();
					} catch (e) {
						console.error('Failed to rm --cached:', e);
						const msg = e instanceof Error ? e.message : String(e);
						new Notice('Failed to remove files: ' + msg, 10000);
						btn.setDisabled(false);
						btn.setButtonText('Retry');
					}
				}))
			.addButton(btn => btn
				.setButtonText('Ignore Risk')
				.onClick(() => {
					this.close();
				}));
	}

	onClose() {
		this.contentEl.empty();
	}
}
