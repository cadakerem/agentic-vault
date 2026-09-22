# 🧠 Agentic Vault for Obsidian

Turn your Obsidian vault into an automated, self-syncing, issue-driven command center for AI Agents.

Agentic Vault bridges the gap between your local OS-level AI tools (Antigravity, Claude Code, Cursor, Windsurf, etc.) and your Obsidian knowledge base. Manage your system prompts, sync everything automatically via Git, and set up new machines with a single click.

![Agentic Vault Banner](https://raw.githubusercontent.com/cadakerem/agentic-vault/main/assets/banner.png) *(Note: You can add a banner image later)*

---

## ✨ Features

- **💻 New Machine Setup Wizard:** Got a new laptop? Just open Obsidian, click the wizard, and it automatically creates OS-level symlinks (`junction`/`dir`) connecting your local AI agents to your vault's `AI-Brain` folder.
- **🔄 Auto Git Sync:** Background auto-commit and push. Your vault acts as a seamless Git repository without needing terminal commands.
- **☁️ Git Status Bar:** Live status in the bottom right corner showing your current branch, ahead/behind commits, and uncommitted changes (e.g., `☁ main ↑2 ✎3`).
- **🤖 Universal AI Tool Support:** Natively links configurations for:
  - Antigravity / Gemini CLI (`~/.gemini/config`)
  - Claude Code (`~/.claude`)
  - Cursor (`AppData/Roaming/Cursor/User`)
  - Windsurf
  - VS Code / Copilot
- **🧠 Brain Manager:** A dedicated visual editor to manage your AI System Prompts, Project Rules, and Coding Standards. All rules are auto-tracked in Git.
- **🚀 Issue-Driven Development:** Create GitHub Issues directly from inside Obsidian without ever opening a browser.

---

## 🛠️ How to Install

*(Agentic Vault is currently pending review for the Obsidian Community Plugin marketplace).*

### Manual Installation (Until Approved)
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

### 2. Connect Your AI Tools (Setup Wizard)
- Click the **Laptop Icon (💻)** in the left ribbon to open the **New Machine Setup Wizard**.
- Review the paths that will be created.
- Click **Start Setup**. The plugin will automatically back up any existing local config folders and create symlinks directly to your vault. 
- *Now, whenever you update a prompt in Obsidian, Claude/Cursor/Antigravity instantly sees it!*

### 3. Manage Your AI Brain
- Click the **Brain Manager** button in settings or use the Command Palette (`Ctrl+P` -> `Open AI Brain Manager`).
- Edit your System, Project, and Coding rules.
- Click **Save & Sync**. The changes are immediately saved to markdown and pushed to GitHub.

---

## 🔒 Permissions & Security
Agentic Vault is built for local-first automation. Because it creates symlinks and runs Git commands, it requires:
- **Node.js `fs` module:** To read/write outside the Obsidian sandbox (strictly for creating symlinks to `~/.agents`, `~/.claude`, etc.).
- **Node.js `child_process`:** To execute `git` and `gh` (GitHub CLI) commands securely in the background.

*All source code is public, and GitHub Actions guarantees that release assets match the repository code byte-for-byte.*

---

## 🧑‍💻 Developer & Contributions

Developed by **Kerem Barbaros Karnabat** (@cadakerem). 

Contributions, issues, and feature requests are welcome! Feel free to check the [Issues page](https://github.com/cadakerem/agentic-vault/issues).

### License
This project is licensed under the [MIT License](LICENSE).
