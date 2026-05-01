const fs   = require('fs');
const path = require('path');

const p = path.resolve(__dirname, '..', 'NodeDockAndroid', 'android', 'app', 'build.gradle');
let g = fs.readFileSync(p, 'utf8');

if (!g.includes('abiFilters')) {
  g = g.replace(/defaultConfig\s*\{/,
    `defaultConfig {\n        ndk {\n            abiFilters "arm64-v8a", "x86_64"\n        }`);
}
if (!g.includes('packagingOptions')) {
  g = g.replace(/buildTypes\s*\{/,
    `packagingOptions {\n        pickFirst '**/libnode.so'\n        pickFirst '**/libc++_shared.so'\n    }\n    buildTypes {`);
}

fs.writeFileSync(p, g);
console.log('✅ app build.gradle patchado.');
