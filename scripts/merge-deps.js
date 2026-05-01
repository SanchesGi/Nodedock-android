#!/usr/bin/env node
// Mescla as dependências do nosso deps.json no package.json gerado pelo react-native init

const fs   = require('fs');
const path = require('path');

const rnPkgPath  = path.resolve(__dirname, '..', 'NodeDockAndroid', 'package.json');
const ourDeps    = {
  dependencies: {
    "react-native-fs":                  "^2.20.0",
    "react-native-document-picker":     "^9.1.1",
    "react-native-permissions":         "^4.1.5",
    "@react-native-async-storage/async-storage": "^1.21.0",
    "react-native-vector-icons":        "^10.0.3",
  }
};

const pkg = JSON.parse(fs.readFileSync(rnPkgPath, 'utf8'));

pkg.dependencies = {
  ...pkg.dependencies,
  ...ourDeps.dependencies,
};

fs.writeFileSync(rnPkgPath, JSON.stringify(pkg, null, 2));
console.log('✅ package.json mesclado com sucesso.');
console.log('   Dependências adicionadas:', Object.keys(ourDeps.dependencies).join(', '));
