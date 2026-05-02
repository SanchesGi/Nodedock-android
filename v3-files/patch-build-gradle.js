// scripts/patch-build-gradle.js
const fs = require('fs');
const p = 'SentriDockAndroid/android/app/build.gradle';
let g = fs.readFileSync(p, 'utf8');

if (!g.includes('abiFilters')) {
  g = g.replace(/defaultConfig\s*\{/,
    'defaultConfig {\n        ndk { abiFilters "arm64-v8a", "x86_64" }'
  );
}
if (!g.includes('packagingOptions')) {
  g = g.replace(/buildTypes\s*\{/,
    'packagingOptions { pickFirst "**/libnode.so"; pickFirst "**/libc++_shared.so" }\n    buildTypes {'
  );
}
fs.writeFileSync(p, g);
console.log('✅ app build.gradle patched');
