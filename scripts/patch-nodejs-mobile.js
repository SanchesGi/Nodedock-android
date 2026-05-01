const fs   = require('fs');
const path = require('path');

const buildGradlePath = path.resolve(
  __dirname, '..', 'NodeDockAndroid',
  'node_modules', 'nodejs-mobile-react-native',
  'android', 'build.gradle'
);

if (!fs.existsSync(buildGradlePath)) {
  console.log('nodejs-mobile build.gradle não encontrado, pulando...');
  process.exit(0);
}

let gradle = fs.readFileSync(buildGradlePath, 'utf8');

// Substitui jcenter() por google() + mavenCentral()
gradle = gradle.replace(/jcenter\(\)/g, 'google()\n        mavenCentral()');

// Atualiza versão antiga do gradle plugin
gradle = gradle.replace(
  /com\.android\.tools\.build:gradle:[0-9.]+/g,
  'com.android.tools.build:gradle:7.4.2'
);

fs.writeFileSync(buildGradlePath, gradle);
console.log('✅ nodejs-mobile build.gradle patchado.');
