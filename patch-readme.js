const fs = require('fs');
let readme = fs.readFileSync('README.md', 'utf8');

const changelogMarker = '## Changelog\n\n';
const newEntry = `- (2026-05-01) Fix: Update explicit TODO referencing hardcoded identity structures in formBuilder.ts.\n\n`;

readme = readme.replace(changelogMarker, changelogMarker + newEntry);

fs.writeFileSync('README.md', readme);
