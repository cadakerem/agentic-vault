const fs = require('fs');
let content = fs.readFileSync('main.ts', 'utf8');

const loadSettingsReplacement = `async loadSettings(): Promise<void> {
		const saved = await this.loadData() as Partial<AgenticVaultSettings & AgenticVaultSecrets> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
		const savedTools = saved?.aiTools ?? [];
		this.settings.aiTools = DEFAULT_AI_TOOLS.map(def => {
			const found = savedTools.find(t => t.id === def.id);
			return found ? { ...def, ...found } : { ...def };
		});
		try {
			const secretsPath = this.manifest.dir + '/secrets.json';
			if (await this.app.vault.adapter.exists(secretsPath)) {
				const data = await this.app.vault.adapter.read(secretsPath);
				this.secrets = Object.assign({}, DEFAULT_SECRETS, JSON.parse(data));
			} else {
				this.secrets = Object.assign({}, DEFAULT_SECRETS);
			}
		} catch {
			this.secrets = Object.assign({}, DEFAULT_SECRETS);
		}
		
		// Migration: Move any legacy secrets from data.json to secrets.json
		let migrated = false;
		if (saved) {
			for (const key of Object.keys(DEFAULT_SECRETS) as Array<keyof AgenticVaultSecrets>) {
				if (saved[key] !== undefined) {
					this.secrets[key] = saved[key] as string;
					delete (this.settings as any)[key];
					migrated = true;
				}
			}
		}
		if (migrated) {
			await this.saveSettings();
		}
	}`;

content = content.replace(/async loadSettings\(\): Promise<void> \{[\s\S]*?^\t\}/m, loadSettingsReplacement);
fs.writeFileSync('main.ts', content, 'utf8');
