const fs   = require('fs');
const path = require('path');

const p = path.resolve(__dirname, '..', 'NodeDockAndroid',
  'node_modules', '@nodejs-mobile', 'react-native', 'android', 'build.gradle');

if (!fs.existsSync(p)) { console.log('Não encontrado, pulando.'); process.exit(0); }

let g = fs.readFileSync(p, 'utf8');
g = g.replace(/jcenter\(\)/g, 'google()\n        mavenCentral()');
g = g.replace(/com\.android\.tools\.build:gradle:[0-9.]+/g, 'com.android.tools.build:gradle:7.4.2');
fs.writeFileSync(p, g);
console.log('✅ nodejs-mobile build.gradle patchado.');
