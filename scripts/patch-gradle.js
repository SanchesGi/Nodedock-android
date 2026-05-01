const fs   = require('fs');
const path = require('path');

const buildGradlePath = path.resolve(__dirname, '..', 'NodeDockAndroid', 'android', 'app', 'build.gradle');
let gradle = fs.readFileSync(buildGradlePath, 'utf8');

// Adiciona abiFilters se não existir
if (!gradle.includes('abiFilters')) {
  gradle = gradle.replace(
    /defaultConfig\s*\{/,
    `defaultConfig {\n        ndk {\n            abiFilters "arm64-v8a", "x86_64"\n        }`
  );
}

// Adiciona packagingOptions para evitar conflito de .so
if (!gradle.includes('packagingOptions')) {
  gradle = gradle.replace(
    /buildTypes\s*\{/,
    `packagingOptions {
        pickFirst '**/libnode.so'
        pickFirst '**/libc++_shared.so'
    }\n    buildTypes {`
  );
}

fs.writeFileSync(buildGradlePath, gradle);
console.log('✅ build.gradle patchado com sucesso.');
