#!/data/data/com.termux/files/usr/bin/bash
set -e
cd ~/nodedock-android 2>/dev/null || cd ~/sentridock-android
HERE="$(dirname "$(realpath "$0")")"
mkdir -p src/lib src/screens nodejs-assets/nodejs-project .github/workflows
[ -f src/lib/scanner.js ] && rm src/lib/scanner.js
cp "$HERE/bridge.js"      src/lib/bridge.js
cp "$HERE/main.js"        nodejs-assets/nodejs-project/main.js
cp "$HERE/HomeScreen.jsx" src/screens/HomeScreen.jsx
cp "$HERE/build-apk.yml"  .github/workflows/build-apk.yml
echo "✅ Arquivos copiados. Agora:"
echo "    git add -A && git commit -m 'v2' && git push"
