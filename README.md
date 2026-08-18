# Agentic Vault for Obsidian 🤖🧠

**Agentic Vault** is the ultimate developer-focused Obsidian plugin designed to seamlessly bridge the gap between your personal knowledge base, Git version control, and Agentic AI workflows.

Whether you're using Google's Antigravity, GitHub Copilot, or any other LLM, this plugin turns your Obsidian Vault into an automated, self-syncing, Issue-Driven command center.

## 🌟 Key Features

### 1. 🔄 Background Git Auto-Sync
Never worry about manually backing up your vault again. Agentic Vault comes bundled with its own Git implementation (no external Obsidian plugins required).
- Custom 1-minute (or user-defined) background auto-push loop.
- One-click **Initialize & Connect to GitHub** for brand new vaults.
- Intelligent commit messages and conflict avoidance.

> [!WARNING]
> Because Agentic Vault automatically adds (`git add .`) and pushes all changes in your vault, please ensure you use a `.gitignore` file to exclude any private or sensitive notes that you do not want pushed to your remote repository.

### 2. 🧠 AI Brain Manager UI
Stop editing system prompt markdown files manually. The Brain Manager provides a sleek, tabbed UI to manage your AI's rules directly inside Obsidian:
- **System Rules:** Core behaviors and identity.
- **Project Rules:** Context and environment variables.
- **Coding Standards:** Syntax preferences, architecture patterns.
- Automatically saves and pushes to Git when updated.

### 3. 🔗 Cross-Platform Symlink Automation
Share your vault's AI configuration seamlessly with your host Operating System.
- Automatically creates OS-level symlinks (`junction` on Windows, `dir` on Mac/Linux).
- Links your OS AI config folder (e.g., `~/.gemini/config`) directly into your Obsidian Vault (`AI-Brain`).
- Keeps your local CLI AI agents perfectly synchronized with your vault's knowledge base.

### 4. 🚀 Issue-Driven Development (IDD)
Create GitHub issues directly from Obsidian without ever opening a browser.
- **Command Palette:** "Create GitHub Issue (IDD)".
- Instantly post Bugs, Enhancements, or Documentation requests.
- Leverages the native `gh` (GitHub CLI) under the hood.

---

## 🛠️ Requirements & Installation

Because Agentic Vault acts as a bridge between your vault, your OS, and GitHub, there are two simple requirements:
1. **Git must be installed** on your computer.
2. **GitHub CLI (`gh`) must be authenticated** if you want to use the Issue-Driven Development features.

### Installation
1. Download the latest release (`main.js`, `manifest.json`, `styles.css`) from the [Releases](https://github.com/cadakerem/agentic-vault/releases) page.
2. Extract the files into your `<vault>/.obsidian/plugins/agentic-vault/` directory.
3. Restart Obsidian and enable **Agentic Vault** in the settings.

---

## 👨‍💻 Developer & Contributions
Developed by **Kerem** ([@cadakerem](https://github.com/cadakerem)).
Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/cadakerem/agentic-vault/issues).

**License:** MIT
