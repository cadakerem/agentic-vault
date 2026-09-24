import { SyncState } from './syncState';

export interface AIToolConfig {
	id: string;
	name: string;
	windowsPath: string;
	unixPath: string;
	enabled: boolean;
}

export interface AgenticVaultSettings {
	gitAutoPush: boolean;
	syncIntervalMinutes: number;
	commitMessageFormat: string;
	ruleFilePath: string;
	vaultBrainFolder: string;
	aiTools: AIToolConfig[];
	skillsFolder: string;
	scriptsFolder: string;
	allowPublicRemote: boolean;
	scanSecrets: boolean;
	deviceName: string;
	syncState: SyncState;
}
