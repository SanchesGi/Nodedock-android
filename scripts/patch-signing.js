#!/usr/bin/env node
const fs   = require('fs');
const path = require('path');

const buildGradlePath = path.resolve(__dirname, '..', 'NodeDockAndroid', 'android', 'app', 'build.gradle');
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

if (!gradle.includes('signingConfigs')) {
  gradle = gradle.replace(/android\s*\{/, `android {\n${signingConfig}`);
  gradle = gradle.replace(
    /buildTypes\s*\{[\s\S]*?release\s*\{/,
    (m) => m + '\n            signingConfig signingConfigs.release'
  );
}

fs.writeFileSync(buildGradlePath, gradle);
console.log('✅ Signing config aplicado.');
