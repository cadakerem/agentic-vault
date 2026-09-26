const fs = require('fs');
let content = fs.readFileSync('README.md', 'utf8');

// Find the section and remove it
const startIndex = content.indexOf('## ⚠️ Security Warning: API Keys & Git History');
if (startIndex !== -1) {
    const nextSectionIndex = content.indexOf('## 🧑‍💻 Developer', startIndex);
    if (nextSectionIndex !== -1) {
        content = content.substring(0, startIndex) + content.substring(nextSectionIndex);
    }
}
fs.writeFileSync('README.md', content, 'utf8');
