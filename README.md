# 🧠 Agentic Vault for Obsidian

Agentic Vault is an Obsidian plugin for Git-backed AI configuration, automated vault synchronization, pattern-based secret scanning, and developer workflow integration.

It bridges the gap between your local OS-level AI tools (Antigravity, Claude Code, Cursor, Windsurf, etc.) and your Obsidian knowledge base. Manage your system prompts, sync everything automatically via Git, and set up new machines with a single click.

---

## ✨ Features

- **💻 New Machine Setup Wizard:** Got a new laptop? Just open Obsidian, click the wizard, and it automatically creates OS-level symlinks (`junction`/`dir`) connecting your local AI agents to your vault's `AI-Brain` folder.
- **🔄 Auto Git Sync:** Background auto-pull, commit, and push. Your vault acts as a seamless Git repository without needing terminal commands.
- **☁️ Git Status Bar:** Live status in the bottom right corner showing your current branch, ahead/behind commits, and uncommitted changes (e.g., `☁ main ↑2 ✎3`).
- **🛡️ Pattern-Based Secret Scanning:** A pre-commit scanning layer that helps prevent accidentally committing known API keys and tokens. Note that this is a pattern-based heuristic and not an absolute security guarantee.
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
> Different AI tools look for rules in different files (e.g., `GEMINI.md` or `claude-rules.md`). You can change exactly which file the Brain Manager updates by changing the **"Brain File Path"** in the Agentic Vault settings to match your AI's expected config file!

---

## 🔒 Permissions & Security
Agentic Vault is built for local-first automation. Because it creates symlinks and runs Git commands, it requires:
- **Node.js `fs` module:** To read/write outside the Obsidian sandbox (strictly for creating symlinks to `~/.agents`, `~/.claude`, etc.).
- **Node.js `child_process`:** To execute `git` and `gh` (GitHub CLI) commands securely in the background.

*All source code is public, and GitHub Actions guarantees that release assets match the repository code byte-for-byte.*

### ⚠️ Critical Security Notice
**Agentic Vault is designed to sync your personal AI agent skills, rules, and configurations.** Because these environments often reside close to `.env` files, API keys, and sensitive prompts, **we strongly recommend using a PRIVATE GitHub repository** to store your vault. 

Even with our built-in Secret Scanner, syncing personal AI configurations to a public repository carries a significant risk of accidentally exposing your API keys (e.g., OpenAI, Anthropic) or personal tokens. Always ensure your repository is set to `Private` and configure the "Excluded Sync Paths" in the plugin settings to explicitly ignore folders containing API credentials.

### 🛡️ Defense-in-Depth for Secrets
Agentic Vault uses a two-layered approach to help prevent accidental leakage of API keys, tokens, and credentials:
1. **Filename-based Defense (.gitignore):** Automatically generates and enforces a `.gitignore` that blocks common sensitive file names (e.g., `.env`, `credentials`, `*oauth*`) and explicitly excluded paths configured in settings.
2. **Content-based Defense (Pattern-Based Scanner):** Before every commit, a built-in scanner reads the actual content of the changed files. If it detects AWS keys, Slack tokens, private keys, or generic secret patterns, it blocks the commit.

*(Disclaimer: The secret scanner is a pattern-based heuristic designed as a safety net. It does not provide absolute security guarantees and might miss non-standard credential formats like `MY_SERVICE_TOKEN=abc...`).*

*(Note: The Secret Scanner cannot be disabled if you have 'Allow Public Remote' toggled off, ensuring 100% protection for private environments).*

---

## 🧑‍💻 Developer & Contributions

Developed by **Kerem Barbaros Karnabat** (@cadakerem). 

> **Note on Repository Structure:** You may notice both `src/main.ts` and `main.js` in the repository root. `src/main.ts` (along with the `src/` folder) contains the actual TypeScript source code. `main.js` is the compiled build artifact required by Obsidian for distribution.

Contributions, issues, and feature requests are welcome! Feel free to check the [Issues page](https://github.com/cadakerem/agentic-vault/issues).

### License
This project is licensed under the [MIT License](LICENSE).
