import * as fs from 'fs';
import * as path from 'path';

export interface RulePathSettings {
	vaultBrainFolder: string;
	ruleFilePath: string;
}

export function migrateLegacyRulePath(settings: RulePathSettings, vaultPath: string): boolean {
	const brain = settings.vaultBrainFolder || 'AI-Brain';
	const legacyRulePaths = new Set([
		`${brain}/gemini/GEMINI.md`,
		`${brain}/claude/CLAUDE.md`,
		`${brain}/cursor/.cursorrules`,
		`${brain}/copilot/.github/copilot-instructions.md`,
		`${brain}/windsurf/.windsurfrules`,
	]);
	if (!legacyRulePaths.has(settings.ruleFilePath)) return false;

	const canonicalRulePath = `${brain}/Rules.md`;
	if (!fs.existsSync(path.join(vaultPath, canonicalRulePath))) return false;

	settings.ruleFilePath = canonicalRulePath;
	return true;
}
