import re
content = open('.github/workflows/build-apk.yml').read()
# Move patch step to after nodejs-mobile install
old = '      - name: Install nodejs-mobile-react-native\n        working-directory: NodeDockAndroid\n        run: npm install nodejs-mobile-react-native@0.3.3\n\n      - name: Install Node.js backend dependencies'
new = '      - name: Install nodejs-mobile-react-native\n        working-directory: NodeDockAndroid\n        run: npm install nodejs-mobile-react-native@0.3.3\n\n      - name: Patch gradle for nodejs-mobile\n        run: node scripts/patch-gradle.js\n\n      - name: Install Node.js backend dependencies'
content = content.replace('      - name: Patch gradle for nodejs-mobile\n        run: node scripts/patch-gradle.js\n\n      - name: Install Node.js backend', '      - name: Install Node.js backend')
content = content.replace(old, new)
open('.github/workflows/build-apk.yml', 'w').write(content)
print("OK")
