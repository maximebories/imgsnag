const { readFileSync } = require('fs');
const popup = readFileSync('src/popup.html', 'utf8');
console.log(popup.includes('hidden-count'));
