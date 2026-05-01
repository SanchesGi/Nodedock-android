const fs   = require('fs');
const path = require('path');

const p = path.resolve(__dirname, '..', 'NodeDockAndroid',
  'node_modules', 'nodejs-mobile-react-native', 'android', 'build.gradle');

if (!fs.existsSync(p)) { console.log('Não encontrado, pulando.'); process.exit(0); }

let g = fs.readFileSync(p, 'utf8');

// Substitui o bloco de repositories inteiro para garantir google() primeiro
g = g.replace(
  /repositories\s*\{[^}]*\}/g,
  `repositories {
        google()
        mavenCentral()
        maven { url 'https://dl.google.com/dl/android/maven2/' }
    }`
);

// Atualiza versão do gradle plugin
g = g.replace(
  /com\.android\.tools\.build:gradle:[0-9.]+/g,
  'com.android.tools.build:gradle:7.4.2'
);

fs.writeFileSync(p, g);
console.log('✅ nodejs-mobile build.gradle patchado.');
console.log(g);
