import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { migrateLegacyRulePath } from '../src/ruleMigration';

let root: string;

afterEach(() => {
	if (root) fs.rmSync(root, { recursive: true, force: true });
});

describe('migrateLegacyRulePath', () => {
	it('migrates a legacy rule within a custom brain folder', () => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'av-rule-migration-'));
		fs.mkdirSync(path.join(root, 'CustomBrain'), { recursive: true });
		fs.writeFileSync(path.join(root, 'CustomBrain', 'Rules.md'), '# shared');
		const settings = {
			vaultBrainFolder: 'CustomBrain',
			ruleFilePath: 'CustomBrain/claude/CLAUDE.md',
		};

		expect(migrateLegacyRulePath(settings, root)).toBe(true);
		expect(settings.ruleFilePath).toBe('CustomBrain/Rules.md');
	});

	it('does not alter a legacy setting when the canonical rule is missing', () => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'av-rule-migration-'));
		const settings = {
			vaultBrainFolder: 'CustomBrain',
			ruleFilePath: 'CustomBrain/claude/CLAUDE.md',
		};

		expect(migrateLegacyRulePath(settings, root)).toBe(false);
		expect(settings.ruleFilePath).toBe('CustomBrain/claude/CLAUDE.md');
	});

	it('leaves an empty whitelist independent from rule migration', () => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'av-rule-migration-'));
		const settings = {
			vaultBrainFolder: 'AI-Brain',
			ruleFilePath: 'AI-Brain/Rules.md',
		};

		expect(migrateLegacyRulePath(settings, root)).toBe(false);
		expect(settings.ruleFilePath).toBe('AI-Brain/Rules.md');
	});
});
