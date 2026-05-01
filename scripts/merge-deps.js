const fs   = require('fs');
const path = require('path');
const p    = path.resolve(__dirname, '..', 'SentriDockAndroid', 'package.json');
const pkg  = JSON.parse(fs.readFileSync(p, 'utf8'));
pkg.dependencies = {
  ...pkg.dependencies,
  "react-native-fs":              "^2.20.0",
  "react-native-document-picker": "^9.1.1",
  "@react-native-async-storage/async-storage": "^1.21.0",
};
fs.writeFileSync(p, JSON.stringify(pkg, null, 2));
console.log('✅ package.json mesclado.');
