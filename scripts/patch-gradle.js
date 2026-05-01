#!/usr/bin/env node
// Aplica as configurações necessárias para o nodejs-mobile-react-native
// no build.gradle do app Android gerado pelo react-native init

const fs   = require('fs');
const path = require('path');

const buildGradlePath = path.resolve(__dirname, '..', 'NodeDockAndroid', 'android', 'app', 'build.gradle');

if (!fs.existsSync(buildGradlePath)) {
  console.error(`❌ Arquivo não encontrado: ${buildGradlePath}`);
  process.exit(1);
}

let gradle = fs.readFileSync(buildGradlePath, 'utf8');

// 1. Adiciona apply para nodejs-mobile APÓS o plugin react
if (!gradle.includes('nodejs-mobile-react-native')) {
  const replaced = gradle.replace(
    /apply plugin: "com\.android\.application"/,
    `apply plugin: "com.android.application"\napply from: "../../node_modules/nodejs-mobile-react-native/android/nodejs-mobile-react-native.gradle"`
  );
  
  if (replaced === gradle) {
    console.warn('⚠️ Aviso: plugin android.application não encontrado');
  } else {
    gradle = replaced;
  }
}

// 2. Garante NDK abiFilters para ARM64 + x86_64 (se defaultConfig não tiver ndk)
if (!gradle.includes('abiFilters') && !gradle.includes('ndk {')) {
  gradle = gradle.replace(
    /defaultConfig\s*\{/,
    `defaultConfig {
        ndk {
            abiFilters "arm64-v8a", "x86_64"
        }`
  );
}

// 3. Adiciona packagingOptions para evitar conflito de .so
if (!gradle.includes('packagingOptions')) {
  gradle = gradle.replace(
    /(android\s*\{[^}]*)/,
    `$1
    packagingOptions {
        pickFirst '**/libnode.so'
        pickFirst '**/libc++_shared.so'
    }`
  );
}

// Valida sintaxe básica
const openBraces = (gradle.match(/\{/g) || []).length;
const closeBraces = (gradle.match(/\}/g) || []).length;
if (openBraces !== closeBraces) {
  console.error(`❌ Erro de sintaxe: { e } desbalanceados (${openBraces} vs ${closeBraces})`);
  process.exit(1);
}

fs.writeFileSync(buildGradlePath, gradle);
console.log('✅ android/app/build.gradle patchado para nodejs-mobile.');
