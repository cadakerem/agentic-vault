import { describe, it, expect, vi } from 'vitest';

// Mock Obsidian API before importing main
vi.mock('obsidian', () => {
    return {
        Plugin: class {
            manifest = { dir: '.obsidian/plugins/agentic-vault' };
            app = {
                vault: {
                    configDir: '.obsidian',
                    adapter: {
                        exists: vi.fn(),
                        read: vi.fn(),
                        write: vi.fn(),
                    }
                }
            };
            loadData = vi.fn();
            saveData = vi.fn();
            addStatusBarItem = vi.fn().mockReturnValue({ setText: vi.fn() });
            addRibbonIcon = vi.fn();
            addCommand = vi.fn();
            updateStatusBar = vi.fn();
            registerEvent = vi.fn();
        },
        Notice: vi.fn(),
        PluginSettingTab: class {},
        Setting: class {},
        Modal: class {},
        addIcon: vi.fn(),
    };
});

import AgenticVaultPlugin from '../main';
import { AgenticVaultSettings, AgenticVaultSecrets } from '../src/types';

describe('Settings Migration', () => {
    it('migrates legacy secrets from data.json to secrets.json and removes them', async () => {
        const plugin = new AgenticVaultPlugin({} as any, {} as any);
        
        // Mock the loaded data.json to contain both a normal setting and a legacy secret
        const legacySavedData = {
            gitAutoPush: false,
            openAIApiKey: 'sk-legacy-key-12345'
        };
        (plugin.loadData as any).mockResolvedValue(legacySavedData);
        
        // Mock secrets.json to not exist yet
        (plugin.app.vault.adapter.exists as any).mockResolvedValue(false);
        (plugin.app.vault.adapter.write as any).mockResolvedValue(undefined);
        
        await plugin.loadSettings();

        // 1. Secret should be moved to this.secrets
        expect(plugin.secrets.openAIApiKey).toBe('sk-legacy-key-12345');
        
        // 2. Secret should be DELETED from this.settings
        expect((plugin.settings as any).openAIApiKey).toBeUndefined();
        expect(plugin.settings.gitAutoPush).toBe(false); // normal setting remains

        // 3. saveSettings should have been called automatically due to migration
        expect(plugin.saveData).toHaveBeenCalledWith(plugin.settings);
        
        // 4. secrets.json should have been written with the new secret
        expect(plugin.app.vault.adapter.write).toHaveBeenCalledWith(
            '.obsidian/plugins/agentic-vault/secrets.json',
            expect.stringContaining('sk-legacy-key-12345')
        );
    });
});
