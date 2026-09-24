import { App, Modal } from 'obsidian';

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


export { ConfirmModal };
