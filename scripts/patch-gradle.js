#!/usr/bin/env node
// Aplica as configurações necessárias para o nodejs-mobile-react-native
// no build.gradle do app Android gerado pelo react-native init

const fs   = require('fs');
const path = require('path');

const buildGradlePath = path.resolve(__dirname, '..', 'NodeDockAndroid', 'android', 'app', 'build.gradle');

let gradle = fs.readFileSync(buildGradlePath, 'utf8');

// 1. Adiciona apply para nodejs-mobile APÓS o plugin react
if (!gradle.includes('nodejs-mobile-react-native')) {
  gradle = gradle.replace(
    /apply plugin: "com\.android\.application"/,
    `apply plugin: "com.android.application"\napply from: "../../node_modules/nodejs-mobile-react-native/android/nodejs-mobile-react-native.gradle"`
  );
}

// 2. Garante NDK abiFilters para ARM64 + x86_64
if (!gradle.includes('abiFilters')) {
  gradle = gradle.replace(
    /defaultConfig\s*\{/,
    `defaultConfig {\n        ndk {\n            abiFilters "arm64-v8a", "x86_64"\n        }`
  );
}

// 3. Adiciona packagingOptions para evitar conflito de .so
if (!gradle.includes('packagingOptions')) {
  gradle = gradle.replace(
    /buildTypes\s*\{/,
    `packagingOptions {
        pickFirst '**/libnode.so'
        pickFirst '**/libc++_shared.so'
    }

    buildTypes {`
  );
}

fs.writeFileSync(buildGradlePath, gradle);
console.log('✅ android/app/build.gradle patchado para nodejs-mobile.');
