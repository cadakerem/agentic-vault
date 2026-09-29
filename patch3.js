const fs = require('fs');
let s = fs.readFileSync('src/sync.ts', 'utf8');
s = s.replace(
  "git.raw(['log', '-p', '--not'",
  "git.raw(['log', '-p', '-m', '--first-parent', '--format=', '--not'"
);
fs.writeFileSync('src/sync.ts', s);
