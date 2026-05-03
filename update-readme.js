const fs = require('fs');
let readme = fs.readFileSync('README.md', 'utf8');
readme = readme.replace('## Changelog', '## Changelog\n\n- (2026-05-01) Added tests for `generateReport.ts` helpers.');
fs.writeFileSync('README.md', readme);
