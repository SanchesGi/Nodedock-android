const fs   = require('fs');
const path = require('path');

const p = path.resolve(__dirname, '..', 'NodeDockAndroid',
  'android', 'app', 'src', 'main', 'AndroidManifest.xml');

let xml = fs.readFileSync(p, 'utf8');

const perms = `
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />
    <uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />`;

if (!xml.includes('MANAGE_EXTERNAL_STORAGE')) {
  xml = xml.replace('<uses-permission android:name="android.permission.INTERNET" />', perms);
  if (!xml.includes('MANAGE_EXTERNAL_STORAGE')) {
    xml = xml.replace('<manifest', `<manifest`);
    xml = xml.replace(/<manifest([^>]*)>/, `<manifest$1>\n${perms}`);
  }
}

// Adiciona android:requestLegacyExternalStorage="true" na activity
xml = xml.replace(
  '<application',
  '<application\n        android:requestLegacyExternalStorage="true"'
);

fs.writeFileSync(p, xml);
console.log('✅ AndroidManifest.xml patchado com permissões.');
