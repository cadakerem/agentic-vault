import { App, Modal, Setting } from 'obsidian';

export class SecurityAlertModal extends Modal {
	trackedFiles: string[];

	constructor(app: App, trackedFiles: string[]) {
		super(app);
		this.trackedFiles = trackedFiles;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		
		contentEl.createEl('h2', { text: '?? CRITICAL SECURITY ALERT ??', cls: 'agentic-vault-danger' });
		contentEl.createEl('h2', { text: 'API KEYS POTENTIALLY EXPOSED' });
		
		const p1 = contentEl.createEl('p');
		p1.innerHTML = `<strong>DANGER:</strong> The following ${this.trackedFiles.length} sensitive files (e.g. data.json) are currently tracked by Git in your vault:`;
		
		const ul = contentEl.createEl('ul');
		this.trackedFiles.forEach(f => ul.createEl('li', { text: f }));

		const p2 = contentEl.createEl('p');
		p2.innerHTML = `<span style="color:var(--text-error); font-weight:bold; font-size: 1.1em;">1. REVOKE YOUR API KEYS IMMEDIATELY!</span><br>If this repository is or ever was public, your keys are compromised. Do not wait. Delete them from your AI provider's dashboard right now.`;

		const p3 = contentEl.createEl('p');
		p3.innerHTML = `<strong>2. Stop Tracking the Files:</strong><br>Run <code>git rm --cached &lt;file&gt;</code> in your terminal to remove them from future commits.`;

		const p4 = contentEl.createEl('p');
		p4.innerHTML = `<strong>3. Clean Git History (Hygiene):</strong><br>The keys are STILL visible in your past git history! Use <a href="https://rtyley.github.io/bfg-repo-cleaner/">BFG Repo-Cleaner</a> to purge them, or delete the repository completely. Note: Rewriting history requires a force-push, which will break clones for other team members.`;

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('I Understand')
				.setCta()
				.onClick(() => {
					this.close();
				}));
	}

	onClose() {
		this.contentEl.empty();
	}
}
