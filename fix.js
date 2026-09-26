const fs = require('fs');
let content = fs.readFileSync('main.ts', 'utf8');

const oldStr = `			\`\${brain}/**/.env\`,
			\`\${brain}/**/*.key\`
		];`;

const newStr = `			\`\${brain}/**/.env\`,
			\`\${brain}/**/*.key\`
		];
		const excluded = this.settings.excludedSyncPaths.split('\\n').map(l => l.trim()).filter(Boolean);
		const included = this.settings.includedSyncPaths.split('\\n').map(l => l.trim()).filter(Boolean);
		rules.push(...excluded);
		rules.push(...included.map(l => \`!\${l}\`));`;

content = content.replace(oldStr, newStr);
fs.writeFileSync('main.ts', content, 'utf8');
