#!/data/data/com.termux/files/usr/bin/bash
set -e
cd ~/nodedock-android 2>/dev/null || cd ~/sentridock-android
HERE="$(dirname "$(realpath "$0")")"

mkdir -p src/lib src/screens nodejs-assets/nodejs-project .github/workflows scripts

# Frontend & node
cp "$HERE/bridge.js"      src/lib/bridge.js
cp "$HERE/main.js"        nodejs-assets/nodejs-project/main.js
cp "$HERE/HomeScreen.jsx" src/screens/HomeScreen.jsx

# Workflow + scripts auxiliares
cp "$HERE/build-apk.yml"        .github/workflows/build-apk.yml
cp "$HERE/patch-manifest.js"    scripts/patch-manifest.js
cp "$HERE/merge-deps.js"        scripts/merge-deps.js
cp "$HERE/patch-gradle.js"      scripts/patch-gradle.js
cp "$HERE/patch-build-gradle.js" scripts/patch-build-gradle.js
cp "$HERE/patch-signing.js"     scripts/patch-signing.js

# Limpa pasta antiga sentridock-files se existir
rm -rf sentridock-files

echo "✅ Arquivos v3 instalados."
echo ""
echo "Agora roda:"
echo "    git add -A"
echo "    git commit -m 'v3: manifest fix - permissões reais'"
echo "    git push"
