// scripts/patch-manifest.js
// Adiciona permissões de storage ao AndroidManifest.xml depois do RN init.
// Standalone — não usa node -e (que quebra com aspas dentro de YAML).

const fs   = require('fs');
const path = require('path');

const manifestPath = 'SentriDockAndroid/android/app/src/main/AndroidManifest.xml';

if (!fs.existsSync(manifestPath)) {
  console.error('❌ Manifest não encontrado em:', manifestPath);
  process.exit(1);
}

let m = fs.readFileSync(manifestPath, 'utf8');
const original = m;

const PERMS = [
  { name: 'android.permission.INTERNET', extra: '' },
  { name: 'android.permission.READ_EXTERNAL_STORAGE', extra: '' },
  { name: 'android.permission.WRITE_EXTERNAL_STORAGE', extra: '' },
  { name: 'android.permission.MANAGE_EXTERNAL_STORAGE', extra: ' tools:ignore="ScopedStorage"' },
];

// 1. Garante namespace tools no <manifest>
if (!/xmlns:tools=/.test(m)) {
  m = m.replace(
    /<manifest\s+xmlns:android=/,
    '<manifest xmlns:tools="http://schemas.android.com/tools" xmlns:android='
  );
  console.log('+ namespace tools adicionado');
}

// 2. Adiciona requestLegacyExternalStorage no <application>
if (!/requestLegacyExternalStorage/.test(m)) {
  m = m.replace(
    /<application\b/,
    '<application android:requestLegacyExternalStorage="true"'
  );
  console.log('+ requestLegacyExternalStorage="true"');
}

// 3. Adiciona cada uses-permission que ainda não esteja presente.
//    Inserimos logo após a abertura da tag <manifest ...>.
const insertPoint = m.indexOf('>') + 1; // após o fim do <manifest ...>
let permsToAdd = [];
for (const p of PERMS) {
  if (m.includes(p.name)) {
    console.log(`  já presente: ${p.name}`);
  } else {
    permsToAdd.push(`\n    <uses-permission android:name="${p.name}"${p.extra} />`);
    console.log(`+ ${p.name}`);
  }
}
if (permsToAdd.length) {
  m = m.slice(0, insertPoint) + permsToAdd.join('') + m.slice(insertPoint);
}

if (m === original) {
  console.log('Nada mudou.');
} else {
  fs.writeFileSync(manifestPath, m);
  console.log('✅ Manifest atualizado.');
}

// 4. Imprime versão final pra debugging
console.log('\n────── manifest final ──────');
console.log(m);
console.log('───────────────────────────');
