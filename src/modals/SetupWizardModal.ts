import { App, Modal, Notice } from 'obsidian';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import AgenticVaultPlugin from '../../main';
import { planLink, applyLink, LinkPlan } from '../link';
import { getVaultPath } from '../obsidian-util';

// ─────────────────────────────────────────────
// Setup Wizard Modal
// ─────────────────────────────────────────────

interface SetupStep {
	label: string;
	status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
	detail: string;
	plan?: LinkPlan;
	src?: string;
	dst?: string;
}

class SetupWizardModal extends Modal {
	plugin: AgenticVaultPlugin;
	steps: SetupStep[] = [];
	stepEls: HTMLElement[] = [];
	running = false;

	constructor(app: App, plugin: AgenticVaultPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('agentic-vault-modal');

		contentEl.createEl('h2', { text: '🖥️ New Machine Setup' });
		contentEl.createEl('p', {
			text: 'Automatically configure this computer: create symlinks for your AI tools, skills, and scripts — so everything works like your original machine.',
			cls: 'av-subtitle',
		});

		// Build steps list
		this.steps = this.buildSteps();
		const listEl = contentEl.createDiv({ cls: 'av-steps-list' });
		this.stepEls = this.steps.map(step => {
			const el = listEl.createDiv({ cls: 'av-step av-step-pending' });
			el.createSpan({ cls: 'av-step-icon', text: '○' });
			const info = el.createDiv({ cls: 'av-step-info' });
			info.createDiv({ cls: 'av-step-label', text: step.label });
			info.createDiv({ cls: 'av-step-detail', text: step.detail });
			return el;
		});

		const btnRow = contentEl.createDiv({ cls: 'av-tabs-container' });
		const btnStart = btnRow.createEl('button', { text: '🚀 Start Setup', cls: 'mod-cta' });
		btnStart.onclick = async () => {
			if (this.running) return;
			this.running = true;
			btnStart.setAttr('disabled', 'true');
			btnStart.setText('Running...');
			await this.runAllSteps();
			btnStart.removeAttribute('disabled');
			btnStart.setText('Done ✓');
		};

		btnRow.createEl('button', { text: 'Close', cls: 'av-tab-btn' }).onclick = () => this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private buildSteps(): SetupStep[] {
		const vaultPath = getVaultPath(this.app);
		const isWin = os.platform() === 'win32';

		const steps: SetupStep[] = [
			{
				label: 'Detect Platform',
				status: 'pending',
				detail: `Detected: ${isWin ? 'Windows' : os.platform()} | Vault: ${vaultPath}`,
			},
		];

		const addSymlinkStep = (label: string, src: string, dst: string) => {
			const plan = planLink(src, dst);
			let detail = '';
			switch (plan.action) {
				case 'create': detail = 'Will create new link'; break;
				case 'noop': detail = 'Already linked correctly'; break;
				case 'replace-link': detail = `Will replace existing link (currently -> ${plan.currentDestination})`; break;
				case 'backup-and-create': detail = `Will backup existing folder to ${path.basename(plan.backup)}${plan.willMigrate ? ' and migrate contents' : ''}`; break;
				case 'refuse': detail = `REFUSED: ${plan.reason}`; break;
			}
			steps.push({ label, status: plan.action === 'refuse' ? 'error' : 'pending', detail, plan, src, dst });
		};

		// Skills symlink
		addSymlinkStep('🧠 Link Skills Folder', path.join(vaultPath, this.plugin.settings.skillsFolder), path.join(os.homedir(), '.agents', 'skills'));

		// Scripts symlink
		addSymlinkStep('⚡ Link Scripts Folder', path.join(vaultPath, this.plugin.settings.scriptsFolder), path.join(os.homedir(), '.agents', 'scripts'));

		// AI tools symlinks
		for (const tool of this.plugin.settings.aiTools) {
			if (!tool.enabled) continue;
			const dstRel = isWin ? tool.windowsPath : tool.unixPath;
			addSymlinkStep(`🤖 Link ${tool.name}`, path.join(vaultPath, this.plugin.settings.vaultBrainFolder, tool.id), path.join(os.homedir(), dstRel));
		}

		// Git check
		steps.push({ label: '🔀 Verify Git Repository', status: 'pending', detail: 'Check vault is connected to GitHub' });

		return steps;
	}

	private setStepStatus(idx: number, status: SetupStep['status'], detail?: string): void {
		const el = this.stepEls[idx];
		const icons: Record<SetupStep['status'], string> = {
			pending: '○', running: '⟳', done: '✅', error: '❌', skipped: '⏭',
		};
		el.className = `av-step av-step-${status}`;
		el.querySelector('.av-step-icon')!.setText(icons[status]);
		if (detail) el.querySelector('.av-step-detail')!.setText(detail);
	}

	private async runAllSteps(): Promise<void> {
		const vaultPath = getVaultPath(this.app);
		const isWin = os.platform() === 'win32';
		let stepIdx = 0;

		// Step 0 — Platform detect (instant)
		this.setStepStatus(stepIdx++, 'done');

		// Process all symlink steps (from index 1 to steps.length - 2)
		while (stepIdx < this.steps.length - 1) {
			const step = this.steps[stepIdx];
			if (step.plan && step.src && step.dst) {
				if (step.plan.action === 'refuse') {
					this.setStepStatus(stepIdx, 'error', step.plan.reason);
				} else {
					await this.runSymlinkStep(stepIdx, step.src, step.dst, step.plan);
				}
			}
			stepIdx++;
		}

		// Final — Git check
		this.setStepStatus(stepIdx, 'running');
		try {
			const isRepo = fs.existsSync(path.join(vaultPath, '.git'));
			if (isRepo) {
				const remote = await this.plugin.git.getRemotes(true);
				const origin = remote.find(r => r.name === 'origin');
				this.setStepStatus(stepIdx, 'done', origin ? `Connected: ${origin.refs.fetch}` : 'Local repo (no remote)');
			} else {
				this.setStepStatus(stepIdx, 'skipped', 'Vault not yet a Git repo — use Git & Sync settings to init.');
			}
		} catch {
			this.setStepStatus(stepIdx, 'error', 'Could not check git status');
		}

		new Notice('✅ Machine setup complete! All symlinks are active.');
	}

	private async runSymlinkStep(idx: number, src: string, dst: string, plan: LinkPlan): Promise<void> {
		this.setStepStatus(idx, 'running');
		try {
			if (plan.action === 'refuse') {
				this.setStepStatus(idx, 'error', plan.reason);
				return;
			}
			const result = applyLink(src, dst, plan);
			this.setStepStatus(idx, 'done', result.backup ? `Linked (backed up to ${path.basename(result.backup)})` : 'Linked ✓');
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			this.setStepStatus(idx, 'error', msg);
		}
	}
}


export { SetupWizardModal };
