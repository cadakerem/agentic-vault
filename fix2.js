const fs = require('fs');
let content = fs.readFileSync('src/settings/AgenticVaultSettingTab.ts', 'utf8');
content = content.replace(/\}\);\r?\n\t\t\t\t\t\}\);\r?\n\t\t\t\}\r?\n\t\t\}\);/, '});');
fs.writeFileSync('src/settings/AgenticVaultSettingTab.ts', content, 'utf8');
