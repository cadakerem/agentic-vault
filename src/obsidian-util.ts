import { App, FileSystemAdapter } from 'obsidian';
export function getVaultPath(app: App): string {
	if (app.vault.adapter instanceof FileSystemAdapter) {
		return app.vault.adapter.getBasePath();
	}
	throw new Error('Agentic Vault requires a local file system (desktop).');
}
