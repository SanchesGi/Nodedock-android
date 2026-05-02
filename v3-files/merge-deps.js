// scripts/merge-deps.js
const fs = require('fs');
const p = 'SentriDockAndroid/package.json';
const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
pkg.dependencies = {
  ...pkg.dependencies,
  '@react-native-async-storage/async-storage': '^1.21.0',
};
fs.writeFileSync(p, JSON.stringify(pkg, null, 2));
console.log('✅ deps merged');
