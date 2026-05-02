// scripts/patch-signing.js
const fs = require('fs');
const p = 'SentriDockAndroid/android/app/build.gradle';
let g = fs.readFileSync(p, 'utf8');
if (!g.includes('signingConfigs')) {
  g = g.replace(/android\s*\{/,
    'android {\n    signingConfigs { release { storeFile file(MYAPP_UPLOAD_STORE_FILE); storePassword MYAPP_UPLOAD_STORE_PASSWORD; keyAlias MYAPP_UPLOAD_KEY_ALIAS; keyPassword MYAPP_UPLOAD_KEY_PASSWORD } }'
  );
  g = g.replace(/release\s*\{/,
    'release {\n            signingConfig signingConfigs.release'
  );
}
fs.writeFileSync(p, g);
console.log('✅ signing config patched');
