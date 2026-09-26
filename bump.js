const fs = require('fs');

let manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
manifest.version = '1.6.0';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 2), 'utf8');

let versions = JSON.parse(fs.readFileSync('versions.json', 'utf8'));
versions['1.6.0'] = manifest.minAppVersion;
fs.writeFileSync('versions.json', JSON.stringify(versions, null, 2), 'utf8');

let packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
packageJson.version = '1.6.0';
fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2), 'utf8');

