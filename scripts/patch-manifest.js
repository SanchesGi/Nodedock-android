const fs   = require('fs');
const path = require('path');

const p = path.resolve('SentriDockAndroid','android','app','src','main','AndroidManifest.xml');
let xml = fs.readFileSync(p, 'utf8');

console.log('Manifest ANTES:\n', xml.substring(0, 500));

// Adiciona permissões logo após <manifest ...>
const perms = `
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"/>
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"/>
    <uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE"/>
    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>`;

// Remove permissões antigas para não duplicar
xml = xml.replace(/<uses-permission[^/]*\/>/g, '');

// Insere após a tag <manifest ...>
xml = xml.replace(/(<manifest[^>]*>)/, `$1${perms}`);

// requestLegacyExternalStorage na application tag
if (!xml.includes('requestLegacyExternalStorage')) {
  xml = xml.replace(/<application/, `<application\n        android:requestLegacyExternalStorage="true"`);
}

fs.writeFileSync(p, xml);
console.log('✅ Manifest patchado!');
console.log('Manifest DEPOIS:\n', xml.substring(0, 800));
