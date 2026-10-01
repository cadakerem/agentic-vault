# 🧠 Agentic Vault for Obsidian

Agentic Vault is an Obsidian plugin for Git-backed AI configuration, automated vault synchronization, pattern-based secret scanning, and developer workflow integration.

It bridges the gap between your local OS-level AI tools (Antigravity, Claude Code, Cursor, Windsurf, etc.) and your Obsidian knowledge base. Manage your system prompts, sync everything automatically via Git, and set up new machines with a single click.

---

## ✨ Features

- **💻 New Machine Setup Wizard:** Got a new laptop? Just open Obsidian, click the wizard, and it automatically creates OS-level symlinks (`junction`/`dir`) connecting your local AI agents to your vault's `AI-Brain` folder.
- **🔄 Auto Git Sync:** Background auto-pull, commit, and push. Your vault acts as a seamless Git repository without needing terminal commands.
- **☁️ Git Status Bar:** Live status in the bottom right corner showing your current branch, ahead/behind commits, and uncommitted changes (e.g., `☁ main ↑2 ✎3`).
- **🛡️ Pattern-Based Secret Scanning:** A pre-commit scanning layer that helps prevent accidentally committing known API keys and tokens. Note that this is a pattern-based heuristic and not an absolute security guarantee.
- **🔒 Best-Effort Secret-Leak Prevention Sync Architecture:** By default, only safe text files (prompts, rules, and skills) in your `AI-Brain` are synced to GitHub. Junk config files, AI chat histories, and locally cached secrets are automatically blocked by our Default-Deny whitelist engine.
- **🔄 Smart Conflict Resolution (Dropbox-style):** If you make edits on your laptop and desktop at the same time, Agentic Vault cleanly handles Git merge conflicts by keeping the remote version and saving your local edits side-by-side as `.conflict-local` copies. No more broken Markdown files with Git markers!
- **🌐 Universal AI Tool Support:** Natively links configurations for:
  - Antigravity / Gemini CLI (`~/.gemini/config`)
  - Claude Code (`~/.claude`)
  - Cursor (`AppData/Roaming/Cursor/User`)
  - Windsurf
  - VS Code / Copilot
  *(Fully customizable: you can edit the exact Windows or Mac/Linux path for each tool in the plugin settings!)*
- **🧠 Brain Manager:** A dedicated visual editor to manage your AI System Prompts, Project Rules, and Coding Standards. All rules are auto-tracked in Git.
- **🚀 Issue-Driven Development:** Create GitHub Issues directly from inside Obsidian without ever opening a browser.

---

## 🛠️ How to Install

Agentic Vault is officially available in the Obsidian Community Plugins directory!

### Official Installation
1. Open Obsidian **Settings** > **Community Plugins**.
2. Turn off Safe Mode (if prompted) and click **Browse**.
3. Search for **Agentic Vault**.
4. Click **Install**, then **Enable**.

### Manual Installation
1. Download the latest release from the [GitHub Releases](https://github.com/cadakerem/agentic-vault/releases) page.
2. Extract the files (`main.js`, `manifest.json`, `styles.css`) into your vault: 
   `YourVault/.obsidian/plugins/agentic-vault/`
3. Restart Obsidian and enable **Agentic Vault** in Community Plugins.

---

## 🔒 Permissions & Security
Agentic Vault is built for local-first automation. Because it creates symlinks and runs Git commands, it requires:
- **Node.js `fs` module:** To read/write outside the Obsidian sandbox (strictly for creating symlinks to `~/.agents`, `~/.claude`, etc.).
- **Node.js `child_process`:** To execute `git` and `gh` (GitHub CLI) commands securely in the background.

*All source code is public, and GitHub Actions guarantees that release assets match the repository code byte-for-byte.*

### 🚨 Best-Effort Secret-Leak Prevention Security Architecture
**Agentic Vault is designed to sync your personal AI agent skills, rules, and configurations.** Because these environments often reside close to `.env` files, API keys, and sensitive prompts, Agentic Vault uses a three-layered defense system:

1. **Best-Effort Secret-Leak Prevention Whitelist (.gitignore):** By default, your entire `AI-Brain` folder is blocked from syncing (Default-Deny). The plugin automatically whitelists only known, safe text formats (e.g. `GEMINI.md`, `CLAUDE.md`, `.cursorrules`, and `skills/`).
2. **Setup Wizard Sandboxing:** Any custom plugins or settings folders you want to sync must be explicitly approved via the Setup Wizard's Whitelist Detection UI. The system will never silently sync unapproved files.
3. **Content-based Defense (Secret Scanner):** Before every commit, a built-in scanner reads the actual content of the changed files. If it detects AWS keys, Slack tokens, private keys, or generic secret patterns, it blocks the commit.

*(Disclaimer: While the Best-Effort Secret-Leak Prevention architecture blocks unknown files and we now block `.obsidian/` by default to prevent other plugins from leaking API keys in their `data.json` files, we still **STRONGLY** recommend keeping your GitHub repository Private.)*
*(Note: The Secret Scanner cannot be disabled if you have 'Allow Public Remote' toggled off, ensuring 100% protection for private environments).*

---

## Known Limitations

- **Inbound sync is not scanned.** The secret scanner only inspects outbound changes. Files pulled from the remote are not scanned. If your remote is compromised, malicious content could be pulled without warning. **Always keep your remote repository private.**
- **Pattern-based scanning is not a guarantee.** The scanner uses heuristics (both by content and filename) to detect common API key formats and sensitive files. Novel or obfuscated secrets may not be detected. Conversely, harmless files like `.npmrc` or `.tfvars` might trigger false positives. Since any finding blocks the entire sync, you can add false positives (e.g. config/.npmrc) to the **Allowed Secret Paths (Allowlist)** in settings, or completely untrack them via git rm --cached <file> and .gitignore.
- **GitHub only.** The public-remote protection works exclusively with github.com. Other forges (GitLab, Bitbucket, Gitea, self-hosted) are treated as unrecognized remotes and push is blocked unless you enable Allow Public Remote.
- **GitHub Enterprise is not supported.** Repos on github.mycompany.com are not recognized. Support may be added in a future version.
- **scanSecrets and allowPublicRemote are independent.** Disabling scanSecrets completely turns off pre-commit scanning regardless of the public-remote setting. Ensure you have an alternative safeguard before doing so.



## 🚀 Getting Started

### 1. Initialize Git (If you haven't already)
- Go to **Settings > Agentic Vault**.
- Under the **Git & Sync** section, paste your GitHub Repository URL.
- Click **Initialize & Connect**. The plugin will `git init`, set up the main branch, and connect to your remote.

### 2. Setting Up a New Machine (Setup Wizard)
When moving to a new computer, you can restore your entire AI ecosystem in seconds:
1. **Clone your vault:** Open your terminal and download your existing Obsidian vault from GitHub:
   ```bash
   git clone https://github.com/YOUR_USERNAME/YOUR_VAULT_REPO.git ~/ObsidianVault
   ```
2. **Open in Obsidian:** Launch Obsidian and open the downloaded folder as a vault.
3. **Run the Wizard:** Click the **Laptop Icon (💻)** in the left ribbon and click **Start Setup**.
*Agentic Vault will automatically back up any existing local configs and create symlinks directly to your vault. Your AI tools will instantly remember all your rules and scripts!*

### 3. Manage Your AI Brain
- Click the **Brain Manager** button in settings or use the Command Palette (`Ctrl+P` -> `Open AI Brain Manager`).
- Edit your System, Project, and Coding rules.
- Click **Save & Sync**. The changes are immediately saved to markdown and pushed to GitHub.

> **💡 Pro-Tip for Users:**
> The Setup Wizard now features **Smart Auto-Detection**. It will automatically scan your vault for known AI rule files (e.g., `GEMINI.md`, `CLAUDE.md`, `.cursorrules`) and set your **Brain File Path** for you!

---

## 🧑‍💻 Developer & Contributions
Developed by Kerem Barbaros Karnabat (@cadakerem).

> **Note on Repository Structure:** [TODO: Add any specific notes about the repository structure here, e.g., source vs build artifacts.]

Contributions, issues, and feature requests are welcome! Feel free to check the [Issues page](../../issues).

## 📜 License
This project is licensed under the [MIT License](LICENSE).
