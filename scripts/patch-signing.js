#!/usr/bin/env node
const fs   = require('fs');
const path = require('path');

const buildGradlePath = path.resolve(__dirname, '..', 'SentriDockAndroid', 'android', 'app', 'build.gradle');

if (!fs.existsSync(buildGradlePath)) {
  console.error(`❌ Arquivo não encontrado: ${buildGradlePath}`);
  process.exit(1);
}

let gradle = fs.readFileSync(buildGradlePath, 'utf8');

const signingConfig = `
    signingConfigs {
        release {
            storeFile file(MYAPP_UPLOAD_STORE_FILE)
            storePassword MYAPP_UPLOAD_STORE_PASSWORD
            keyAlias MYAPP_UPLOAD_KEY_ALIAS
            keyPassword MYAPP_UPLOAD_KEY_PASSWORD
        }
    }
`;

// 1. Adiciona signingConfigs se não existir
if (!gradle.includes('signingConfigs')) {
  gradle = gradle.replace(
    /android\s*\{/,
    `android {${signingConfig}`
  );
  console.log('✅ signingConfigs adicionado.');
}

// 2. Adiciona signingConfig na build type release se não existir
if (!gradle.includes('signingConfig signingConfigs.release')) {
  gradle = gradle.replace(
    /(release\s*\{[^\}]*)/,
    (match) => {
      if (match.includes('signingConfig')) {
        return match; // Já tem signingConfig
      }
      return match + '\n            signingConfig signingConfigs.release';
    }
  );
  console.log('✅ signingConfig aplicado à build type release.');
}

// Valida sintaxe básica
const openBraces = (gradle.match(/\{/g) || []).length;
const closeBraces = (gradle.match(/\}/g) || []).length;
if (openBraces !== closeBraces) {
  console.error(`❌ Erro de sintaxe: { e } desbalanceados (${openBraces} vs ${closeBraces})`);
  process.exit(1);
}

fs.writeFileSync(buildGradlePath, gradle);
console.log('✅ Signing config aplicado com sucesso.');
