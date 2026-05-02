// scripts/patch-gradle.js
const fs = require('fs');
const p = 'SentriDockAndroid/node_modules/nodejs-mobile-react-native/android/build.gradle';
if (!fs.existsSync(p)) {
  console.log('nodejs-mobile gradle não encontrado, pulando');
  process.exit(0);
}
let g = fs.readFileSync(p, 'utf8');
g = g.replace(/repositories\s*\{[^}]*\}/g,
  'repositories {\n        google()\n        mavenCentral()\n        maven { url "https://dl.google.com/dl/android/maven2/" }\n    }'
);
g = g.replace(/com\.android\.tools\.build:gradle:[0-9.]+/g, 'com.android.tools.build:gradle:7.4.2');
fs.writeFileSync(p, g);
console.log('✅ nodejs-mobile gradle patched');
