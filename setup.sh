#!/data/data/com.termux/files/usr/bin/bash
# ╔══════════════════════════════════════════════╗
# ║   NodeDock Android — Setup via Termux        ║
# ║   Cria todos os arquivos e faz push          ║
# ║   para o GitHub. Build é feito lá.           ║
# ╚══════════════════════════════════════════════╝

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${CYAN}[NodeDock]${NC} $1"; }
ok()   { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo -e "${BOLD}⬡ NodeDock Android — Setup${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── 1. Instalar dependências mínimas ──────────────────────────
log "Verificando dependências..."
pkg update -y -q 2>/dev/null || true

for pkg in git curl; do
  if ! command -v $pkg &>/dev/null; then
    log "Instalando $pkg..."
    pkg install -y $pkg -q
  fi
done
ok "git e curl disponíveis."

# ── 2. Coletar dados do GitHub ────────────────────────────────
echo ""
echo -e "${BOLD}📋 Dados do GitHub${NC}"
echo -e "${YELLOW}   Para criar o token acesse no navegador:${NC}"
echo -e "${YELLOW}   github.com → Settings → Developer settings${NC}"
echo -e "${YELLOW}   → Personal access tokens → Tokens (classic)${NC}"
echo -e "${YELLOW}   → Generate new token → marque: repo, workflow${NC}"
echo ""

read -p "  Seu usuário GitHub: " GH_USER
read -p "  Nome do repositório (ex: nodedock-android): " GH_REPO
read -s -p "  Personal Access Token: " GH_TOKEN
echo ""

[ -z "$GH_USER"  ] && err "Usuário não pode ser vazio."
[ -z "$GH_REPO"  ] && err "Nome do repo não pode ser vazio."
[ -z "$GH_TOKEN" ] && err "Token não pode ser vazio."

GH_URL="https://${GH_USER}:${GH_TOKEN}@github.com/${GH_USER}/${GH_REPO}.git"

# ── 3. Criar repositório no GitHub via API ────────────────────
log "Criando repositório no GitHub..."
HTTP_CODE=$(curl -s -o /tmp/gh_resp.json -w "%{http_code}" \
  -X POST \
  -H "Authorization: token ${GH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${GH_REPO}\",\"description\":\"NodeDock Android — Gerenciador de projetos Node.js\",\"private\":false,\"auto_init\":false}" \
  https://api.github.com/user/repos)

if [ "$HTTP_CODE" = "201" ]; then
  ok "Repositório criado: github.com/${GH_USER}/${GH_REPO}"
elif [ "$HTTP_CODE" = "422" ]; then
  warn "Repositório já existe, continuando..."
else
  warn "Resposta da API: $HTTP_CODE — verifique o token e tente novamente."
  cat /tmp/gh_resp.json
  echo ""
fi

# ── 4. Criar estrutura de arquivos ────────────────────────────
WORK_DIR="$HOME/nodedock-android"
log "Criando arquivos em ${WORK_DIR}..."

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"/{.github/workflows,src/{screens,lib},nodejs-assets/nodejs-project,scripts}
cd "$WORK_DIR"

# ═══════════════════════════════════════════════════════════════
# GitHub Actions Workflow
# ═══════════════════════════════════════════════════════════════
cat > .github/workflows/build-apk.yml << 'WORKFLOW_EOF'
name: Build NodeDock APK

on:
  push:
    branches: [main, master]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 60

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Set up Android SDK
        uses: android-actions/setup-android@v3

      - name: Install NDK
        run: |
          sdkmanager "ndk;25.1.8937393"
          echo "ANDROID_NDK_HOME=$ANDROID_SDK_ROOT/ndk/25.1.8937393" >> $GITHUB_ENV

      - name: Init React Native project
        run: |
          npx @react-native-community/cli@13 init NodeDockAndroid \
            --version 0.73.6 \
            --skip-install \
            --title "NodeDock" \
            --package-name "com.nodedock.android"

      - name: Overlay source files
        run: |
          cp -f src/App.jsx NodeDockAndroid/App.jsx
          cp -f index.js    NodeDockAndroid/index.js
          mkdir -p NodeDockAndroid/src
          cp -rf src/screens NodeDockAndroid/src/screens
          cp -rf src/lib     NodeDockAndroid/src/lib
          cp -rf nodejs-assets NodeDockAndroid/nodejs-assets

      - name: Merge package.json dependencies
        run: node scripts/merge-deps.js

      - name: Install React Native dependencies
        working-directory: NodeDockAndroid
        run: npm install

      - name: Install nodejs-mobile-react-native
        working-directory: NodeDockAndroid
        run: npm install nodejs-mobile-react-native@0.3.3

      - name: Install Node.js backend dependencies
        working-directory: NodeDockAndroid/nodejs-assets/nodejs-project
        run: npm install

      - name: Patch gradle for nodejs-mobile
        run: node scripts/patch-gradle.js

      - name: Generate release keystore
        working-directory: NodeDockAndroid/android/app
        run: |
          keytool -genkeypair -v \
            -keystore nodedock-release.keystore \
            -alias nodedock \
            -keyalg RSA -keysize 2048 -validity 10000 \
            -storepass nodedock123 -keypass nodedock123 \
            -dname "CN=NodeDock,O=NodeDock,C=BR"

      - name: Configure signing
        working-directory: NodeDockAndroid/android
        run: |
          cat >> gradle.properties << 'EOF'
          MYAPP_UPLOAD_STORE_FILE=nodedock-release.keystore
          MYAPP_UPLOAD_KEY_ALIAS=nodedock
          MYAPP_UPLOAD_STORE_PASSWORD=nodedock123
          MYAPP_UPLOAD_KEY_PASSWORD=nodedock123
          EOF

      - name: Patch signing config
        run: node scripts/patch-signing.js

      - name: Cache Gradle
        uses: actions/cache@v4
        with:
          path: |
            ~/.gradle/caches
            ~/.gradle/wrapper
          key: gradle-${{ hashFiles('NodeDockAndroid/android/**/*.gradle*') }}

      - name: Build APK
        working-directory: NodeDockAndroid/android
        run: |
          chmod +x gradlew
          ./gradlew assembleRelease --no-daemon --stacktrace

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: NodeDock-APK-v${{ github.run_number }}
          path: NodeDockAndroid/android/app/build/outputs/apk/release/app-release.apk
          retention-days: 30

      - name: Create Release
        if: github.ref == 'refs/heads/main'
        uses: softprops/action-gh-release@v2
        with:
          tag_name: v0.1.${{ github.run_number }}
          name: NodeDock v0.1.${{ github.run_number }}
          body: |
            ## NodeDock Android v0.1.${{ github.run_number }}

            ### Instalar
            1. Baixe o APK abaixo
            2. Android: Configurações → Segurança → Fontes desconhecidas
            3. Abra e instale

            ### Usar
            - Abra o app e selecione a pasta dos projetos
            - Start/Stop nos cards
            - Configure o Telegram em ⚙ Config
          files: NodeDockAndroid/android/app/build/outputs/apk/release/app-release.apk
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
WORKFLOW_EOF

# ═══════════════════════════════════════════════════════════════
# Scripts auxiliares
# ═══════════════════════════════════════════════════════════════
cat > scripts/merge-deps.js << 'EOF'
const fs = require('fs'), path = require('path');
const p = path.resolve(__dirname, '..', 'NodeDockAndroid', 'package.json');
const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
pkg.dependencies = {
  ...pkg.dependencies,
  "react-native-fs": "^2.20.0",
  "react-native-document-picker": "^9.1.1",
  "@react-native-async-storage/async-storage": "^1.21.0",
};
fs.writeFileSync(p, JSON.stringify(pkg, null, 2));
console.log('✅ package.json mesclado.');
EOF

cat > scripts/patch-gradle.js << 'EOF'
const fs = require('fs'), path = require('path');
const p = path.resolve(__dirname, '..', 'NodeDockAndroid', 'android', 'app', 'build.gradle');
let g = fs.readFileSync(p, 'utf8');
if (!g.includes('nodejs-mobile-react-native')) {
  g = g.replace(
    /apply plugin: "com\.android\.application"/,
    `apply plugin: "com.android.application"\napply from: "../../node_modules/nodejs-mobile-react-native/android/nodejs-mobile-react-native.gradle"`
  );
}
if (!g.includes('abiFilters')) {
  g = g.replace(/defaultConfig\s*\{/, `defaultConfig {\n        ndk {\n            abiFilters "arm64-v8a", "x86_64"\n        }`);
}
if (!g.includes('packagingOptions')) {
  g = g.replace(/buildTypes\s*\{/, `packagingOptions {\n        pickFirst '**/libnode.so'\n        pickFirst '**/libc++_shared.so'\n    }\n    buildTypes {`);
}
fs.writeFileSync(p, g);
console.log('✅ build.gradle patchado.');
EOF

cat > scripts/patch-signing.js << 'EOF'
const fs = require('fs'), path = require('path');
const p = path.resolve(__dirname, '..', 'NodeDockAndroid', 'android', 'app', 'build.gradle');
let g = fs.readFileSync(p, 'utf8');
if (!g.includes('signingConfigs')) {
  g = g.replace(/android\s*\{/, `android {\n    signingConfigs {\n        release {\n            storeFile file(MYAPP_UPLOAD_STORE_FILE)\n            storePassword MYAPP_UPLOAD_STORE_PASSWORD\n            keyAlias MYAPP_UPLOAD_KEY_ALIAS\n            keyPassword MYAPP_UPLOAD_KEY_PASSWORD\n        }\n    }`);
  g = g.replace(/release\s*\{/, `release {\n            signingConfig signingConfigs.release`);
}
fs.writeFileSync(p, g);
console.log('✅ Signing config aplicado.');
EOF

# ═══════════════════════════════════════════════════════════════
# index.js
# ═══════════════════════════════════════════════════════════════
cat > index.js << 'EOF'
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
AppRegistry.registerComponent(appName, () => App);
EOF

# ═══════════════════════════════════════════════════════════════
# src/App.jsx
# ═══════════════════════════════════════════════════════════════
cat > src/App.jsx << 'EOF'
import React, { useEffect, useRef, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, View, TouchableOpacity, Text, Animated } from 'react-native';
import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { initBridge } from './src/lib/bridge';

const TABS = [
  { key: 'home',     label: '⬡ Projetos' },
  { key: 'settings', label: '⚙ Config'   },
];

export default function App() {
  const [tab, setTab]     = useState('home');
  const [ready, setReady] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    initBridge().then(() => {
      setReady(true);
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    });
  }, []);

  if (!ready) return (
    <View style={s.splash}>
      <StatusBar barStyle="light-content" backgroundColor="#0b0d13" />
      <Text style={s.splashLogo}>⬡ Node<Text style={{ color: '#00c8e0' }}>Dock</Text></Text>
      <Text style={s.splashSub}>Iniciando runtime…</Text>
    </View>
  );

  return (
    <Animated.View style={[s.root, { opacity: fadeAnim }]}>
      <StatusBar barStyle="light-content" backgroundColor="#12151f" />
      <SafeAreaView style={s.root}>
        <View style={s.topbar}>
          <Text style={s.brand}>⬡ Node<Text style={{ color: '#00c8e0' }}>Dock</Text></Text>
          <Text style={s.tagline}>project manager</Text>
        </View>
        <View style={s.content}>
          {tab === 'home'     && <HomeScreen />}
          {tab === 'settings' && <SettingsScreen />}
        </View>
        <View style={s.bottomNav}>
          {TABS.map(t => (
            <TouchableOpacity key={t.key} style={[s.navItem, tab === t.key && s.navActive]} onPress={() => setTab(t.key)}>
              <Text style={[s.navLabel, tab === t.key && s.navLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#0b0d13' },
  splash:        { flex: 1, backgroundColor: '#0b0d13', alignItems: 'center', justifyContent: 'center', gap: 12 },
  splashLogo:    { fontSize: 28, fontWeight: '900', color: '#c8d0e8', letterSpacing: 1 },
  splashSub:     { fontSize: 12, color: '#3a4260', fontFamily: 'monospace' },
  topbar:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 13, backgroundColor: '#12151f', borderBottomWidth: 1, borderBottomColor: '#1f2535' },
  brand:         { fontSize: 16, fontWeight: '900', color: '#c8d0e8', letterSpacing: 1 },
  tagline:       { fontSize: 10, color: '#3a4260', fontFamily: 'monospace', borderWidth: 1, borderColor: '#2a3148', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  content:       { flex: 1 },
  bottomNav:     { flexDirection: 'row', backgroundColor: '#12151f', borderTopWidth: 1, borderTopColor: '#1f2535' },
  navItem:       { flex: 1, paddingVertical: 14, alignItems: 'center' },
  navActive:     { borderTopWidth: 2, borderTopColor: '#00c8e0' },
  navLabel:      { fontSize: 12, color: '#5a6480', fontWeight: '600' },
  navLabelActive:{ color: '#00c8e0' },
});
EOF

# ═══════════════════════════════════════════════════════════════
# src/lib/bridge.js
# ═══════════════════════════════════════════════════════════════
cat > src/lib/bridge.js << 'EOF'
import { NativeEventEmitter } from 'react-native';
import nodejs from 'nodejs-mobile-react-native';

let _started  = false;
const emitter = new NativeEventEmitter(nodejs.channel);
const listeners = {};

export async function initBridge() {
  if (_started) return;
  _started = true;
  emitter.addListener('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    (listeners[msg.event] || []).forEach(cb => cb(msg.data));
  });
  nodejs.start('main.js');
  await new Promise(resolve => {
    const unsub = on('ready', () => { unsub(); resolve(); });
    setTimeout(resolve, 8000);
  });
}

export function send(event, data = {}) { nodejs.channel.send(JSON.stringify({ event, data })); }
export function on(event, cb) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(cb);
  return () => { listeners[event] = (listeners[event] || []).filter(x => x !== cb); };
}

export const bridge = {
  refresh:        ()              => send('refresh'),
  startService:   (id)            => send('start-service',    { id }),
  stopService:    (id)            => send('stop-service',     { id }),
  startAll:       ()              => send('start-all'),
  stopAll:        ()              => send('stop-all'),
  openTunnel:     (id)            => send('open-tunnel',      { id }),
  closeTunnel:    (id)            => send('close-tunnel',     { id }),
  setProjectsDir: (dir)           => send('set-projects-dir', { dir }),
  saveConfig:     (cfg)           => send('save-config',      cfg),
  getConfig:      ()              => send('get-config'),
  testTelegram:   (token, chatId) => send('test-telegram',    { token, chatId }),
  onProjectsList: (cb) => on('projects-list', cb),
  onServiceState: (cb) => on('service-state', cb),
  onLog:          (cb) => on('log',           cb),
  onTunnelState:  (cb) => on('tunnel-state',  cb),
  onConfig:       (cb) => on('config',        cb),
  onTestResult:   (cb) => on('test-result',   cb),
};
EOF

# ═══════════════════════════════════════════════════════════════
# Copia screens do zip (geradas anteriormente via Lázaro)
# Aqui reproduzidas inline para o setup ser autossuficiente
# ═══════════════════════════════════════════════════════════════

# HomeScreen e SettingsScreen são arquivos grandes — baixa do gist se existir,
# ou usa versão compacta inline abaixo.

cat > src/screens/HomeScreen.jsx << 'HOMEEOF'
import React,{useEffect,useRef,useState,useCallback}from 'react';
import{View,Text,StyleSheet,FlatList,TouchableOpacity,ScrollView,RefreshControl,ToastAndroid,Clipboard,Linking}from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import{bridge}from '../lib/bridge';
const PAL=['#00c8e0','#f5a623','#22d36b','#7c8ff5','#f572c0','#ff7744'];
const SL={stopped:'Parado',starting:'Iniciando…',running:'Rodando',error:'Erro',missing:'Não encontrado'};
const SC={stopped:'#5a6480',starting:'#7c8ff5',running:'#22d36b',error:'#ff5555',missing:'#f5a623'};
export default function HomeScreen(){
const[projects,setProjects]=useState([]);
const[logs,setLogs]=useState([]);
const[selLog,setSelLog]=useState('all');
const[refreshing,setRefreshing]=useState(false);
const[dir,setDir]=useState(null);
const[tunnelMap,setTunnelMap]=useState({});
const logsRef=useRef([]);const scrollRef=useRef(null);
useEffect(()=>{
const u=[
bridge.onProjectsList(list=>{setProjects(list);setRefreshing(false);}),
bridge.onServiceState(({id,status})=>setProjects(prev=>prev.map(p=>p.id===id?{...p,status}:p))),
bridge.onLog(({id,text,type})=>{
const lines=text.split('\n').filter(l=>l.trim());
const now=new Date().toLocaleTimeString('pt-BR',{hour12:false});
const ne=lines.map((line,i)=>({key:`${Date.now()}-${i}`,id,text:line,type,time:now}));
logsRef.current=[...logsRef.current.slice(-300),...ne];
setLogs([...logsRef.current]);
setTimeout(()=>scrollRef.current?.scrollToEnd({animated:true}),100);
}),
bridge.onTunnelState(({id,status,url})=>{
setTunnelMap(prev=>({...prev,[id]:{status,url}}));
if(status==='open'&&url)ToastAndroid.show(`🌐 ${url}`,ToastAndroid.LONG);
}),
];
bridge.refresh();
return()=>u.forEach(f=>f());
},[]);
const pickDir=async()=>{try{const r=await DocumentPicker.pickDirectory();setDir(r.uri);bridge.setProjectsDir(r.uri);setTimeout(()=>bridge.refresh(),500);}catch(e){if(!DocumentPicker.isCancel(e))console.warn(e);}};
const onRefresh=useCallback(()=>{setRefreshing(true);bridge.refresh();},[]);
const filteredLogs=selLog==='all'?logs:logs.filter(l=>l.id===selLog);
const renderProject=({item:p,index})=>{
const color=PAL[index%PAL.length];const t=tunnelMap[p.id]||{};
const run=p.status==='running';const start=p.status==='starting';const miss=p.status==='missing';
return(<View style={[st.card,run&&{shadowColor:color,shadowOpacity:.4,shadowRadius:12,elevation:8}]}>
<View style={[st.accent,{backgroundColor:color}]}/>
<View style={st.ch}>
<View style={st.cm}>
<Text style={st.cn} numberOfLines={1}>{p.name}</Text>
<View style={st.csr}>
<View style={[st.pp,{backgroundColor:color+'22',borderColor:color+'55'}]}><Text style={[st.ppt,{color}]}>:{p.port}</Text></View>
<Text style={st.cd} numberOfLines={1}>{p.description||p.folderName+'/'}</Text>
</View>
</View>
<View style={[st.badge,{backgroundColor:SC[p.status]+'22',borderColor:SC[p.status]+'55'}]}>
<View style={[st.dot,{backgroundColor:SC[p.status]}]}/>
<Text style={[st.badget,{color:SC[p.status]}]}>{SL[p.status]||p.status}</Text>
</View>
</View>
{miss&&<View style={st.mw}><Text style={st.mt}>⚠️ Pasta não encontrada: {p.folderName}/</Text></View>}
{t.status==='open'&&t.url&&<TouchableOpacity style={st.tb} onPress={()=>{Clipboard.setString(t.url);ToastAndroid.show('Copiado!',ToastAndroid.SHORT);}}>
<Text style={st.tu} numberOfLines={1}>🌐 {t.url}</Text><Text style={st.tc}>⎘</Text></TouchableOpacity>}
{t.status==='opening'&&<View style={st.to}><Text style={st.tot}>🌐 Abrindo túnel…</Text></View>}
<View style={st.ca}>
<TouchableOpacity style={[st.ba,st.bs,(run||start||miss)&&st.bd]} onPress={()=>bridge.startService(p.id)} disabled={run||start||miss}><Text style={[st.bat,(run||start||miss)&&st.bdt]}>▶ Iniciar</Text></TouchableOpacity>
<TouchableOpacity style={[st.ba,st.bst,(!run&&!start)&&st.bd]} onPress={()=>bridge.stopService(p.id)} disabled={!run&&!start}><Text style={[st.bat,(!run&&!start)&&st.bdt]}>⏹ Parar</Text></TouchableOpacity>
<TouchableOpacity style={[st.bi,!run&&st.bd]} onPress={()=>Linking.openURL(`http://127.0.0.1:${p.port}`)} disabled={!run}><Text style={st.bit}>↗</Text></TouchableOpacity>
<TouchableOpacity style={[st.bi,t.status==='open'&&st.bta,t.status==='opening'&&st.bto,miss&&st.bd]} onPress={()=>t.status==='open'?bridge.closeTunnel(p.id):bridge.openTunnel(p.id)} disabled={miss}><Text style={st.bit}>🌐</Text></TouchableOpacity>
</View>
</View>);};
return(<View style={st.root}>
<View style={st.db}>
<Text style={st.dl} numberOfLines={1}>{dir?`📁 ${dir}`:'📁 Nenhuma pasta selecionada'}</Text>
<TouchableOpacity style={st.bdb} onPress={pickDir}><Text style={st.bdbt}>Selecionar</Text></TouchableOpacity>
</View>
<View style={st.ga}>
<TouchableOpacity style={st.bg} onPress={()=>bridge.startAll()}><Text style={st.bgt}>▶▶ Todos</Text></TouchableOpacity>
<TouchableOpacity style={[st.bg,st.bgd]} onPress={()=>bridge.stopAll()}><Text style={[st.bgt,{color:'#ff5555'}]}>⏹ Parar</Text></TouchableOpacity>
<TouchableOpacity style={st.bg} onPress={onRefresh}><Text style={st.bgt}>↻ Scan</Text></TouchableOpacity>
</View>
<FlatList data={projects} keyExtractor={p=>p.id} renderItem={renderProject} style={st.list} contentContainerStyle={st.lc}
refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00c8e0"/>}
ListEmptyComponent={<View style={st.empty}><Text style={st.ei}>📦</Text><Text style={st.em}>{dir?'Nenhum projeto Node.js encontrado.':'Selecione a pasta com seus projetos acima.'}</Text></View>}/>
<View style={st.lw}>
<ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.lf}>
<TouchableOpacity style={[st.fb,selLog==='all'&&st.fba]} onPress={()=>setSelLog('all')}><Text style={[st.ft,selLog==='all'&&st.fta]}>Todos</Text></TouchableOpacity>
{projects.map((p,i)=>(<TouchableOpacity key={p.id} style={[st.fb,selLog===p.id&&{borderColor:PAL[i%PAL.length]}]} onPress={()=>setSelLog(p.id)}><Text style={[st.ft,selLog===p.id&&{color:PAL[i%PAL.length]}]}>{p.name.length>10?p.name.slice(0,10)+'…':p.name}</Text></TouchableOpacity>))}
<TouchableOpacity style={st.fb} onPress={()=>{logsRef.current=[];setLogs([]);}}><Text style={[st.ft,{color:'#ff5555'}]}>✕ Limpar</Text></TouchableOpacity>
</ScrollView>
<ScrollView ref={scrollRef} style={st.lb} nestedScrollEnabled>
{filteredLogs.length===0?<Text style={st.le}>📡 Inicie um serviço para ver os logs.</Text>:
filteredLogs.map(l=>{const pi=projects.findIndex(p=>p.id===l.id);const c=PAL[Math.max(pi,0)%PAL.length];return(<View key={l.key} style={st.ll}>
<Text style={st.lt}>{l.time}</Text>
<View style={[st.ltg,{backgroundColor:c+'22'}]}><Text style={[st.ltgt,{color:c}]}>{(projects[pi]?.name||l.id).slice(0,8)}</Text></View>
<Text style={[st.lm,l.type==='err'&&st.le2]} selectable>{l.text}</Text>
</View>);})}
</ScrollView>
</View>
</View>);
}
const st=StyleSheet.create({
root:{flex:1,backgroundColor:'#0b0d13'},
db:{flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:14,paddingVertical:9,backgroundColor:'#12151f',borderBottomWidth:1,borderBottomColor:'#1f2535'},
dl:{flex:1,fontSize:11,color:'#5a6480',fontFamily:'monospace'},
bdb:{paddingHorizontal:12,paddingVertical:6,borderRadius:7,borderWidth:1,borderColor:'#00c8e0',backgroundColor:'rgba(0,200,224,.08)'},
bdbt:{fontSize:11,color:'#00c8e0',fontWeight:'700'},
ga:{flexDirection:'row',gap:7,padding:12,paddingBottom:6},
bg:{flex:1,paddingVertical:8,borderRadius:8,borderWidth:1,borderColor:'#2a3148',backgroundColor:'#12151f',alignItems:'center'},
bgd:{borderColor:'rgba(255,85,85,.3)',backgroundColor:'rgba(255,85,85,.06)'},
bgt:{fontSize:11,color:'#c8d0e8',fontWeight:'700'},
list:{flex:1},lc:{padding:12,gap:10},
card:{backgroundColor:'#181c28',borderRadius:12,borderWidth:1,borderColor:'#1f2535',overflow:'hidden'},
accent:{height:2},
ch:{flexDirection:'row',alignItems:'flex-start',padding:13,gap:10},
cm:{flex:1},cn:{fontSize:14,fontWeight:'900',color:'#c8d0e8',letterSpacing:.3},
csr:{flexDirection:'row',alignItems:'center',gap:6,marginTop:4},
pp:{borderWidth:1,borderRadius:5,paddingHorizontal:6,paddingVertical:1},
ppt:{fontSize:10,fontFamily:'monospace',fontWeight:'700'},
cd:{fontSize:10,color:'#5a6480',flex:1},
badge:{flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:9,paddingVertical:4,borderRadius:20,borderWidth:1},
dot:{width:6,height:6,borderRadius:3},
badget:{fontSize:10,fontFamily:'monospace',fontWeight:'700'},
mw:{marginHorizontal:13,marginBottom:8,padding:8,borderRadius:7,backgroundColor:'rgba(245,166,35,.06)',borderWidth:1,borderColor:'rgba(245,166,35,.2)'},
mt:{fontSize:10,color:'#f5a623',fontFamily:'monospace'},
tb:{flexDirection:'row',alignItems:'center',marginHorizontal:13,marginBottom:8,padding:8,borderRadius:7,backgroundColor:'rgba(34,211,107,.06)',borderWidth:1,borderColor:'rgba(34,211,107,.2)'},
tu:{flex:1,fontSize:10,color:'#22d36b',fontFamily:'monospace'},tc:{fontSize:14,color:'#22d36b',paddingLeft:8},
to:{marginHorizontal:13,marginBottom:8,padding:8,borderRadius:7,backgroundColor:'rgba(124,143,245,.06)',borderWidth:1,borderColor:'rgba(124,143,245,.2)'},
tot:{fontSize:10,color:'#7c8ff5',fontFamily:'monospace'},
ca:{flexDirection:'row',gap:7,padding:13,paddingTop:0},
ba:{flex:1,paddingVertical:8,borderRadius:8,borderWidth:1,borderColor:'#2a3148',backgroundColor:'#12151f',alignItems:'center'},
bs:{},bst:{},bat:{fontSize:12,color:'#c8d0e8',fontWeight:'700'},
bd:{opacity:.3},bdt:{color:'#5a6480'},
bi:{width:36,paddingVertical:8,borderRadius:8,borderWidth:1,borderColor:'#2a3148',backgroundColor:'#12151f',alignItems:'center'},
bit:{fontSize:13},
bta:{borderColor:'#22d36b',backgroundColor:'rgba(34,211,107,.1)'},
bto:{borderColor:'#7c8ff5',backgroundColor:'rgba(124,143,245,.1)'},
empty:{flex:1,alignItems:'center',paddingTop:40,gap:12},
ei:{fontSize:32,opacity:.4},em:{fontSize:12,color:'#3a4260',fontFamily:'monospace',textAlign:'center',lineHeight:20},
lw:{height:200,backgroundColor:'#12151f',borderTopWidth:1,borderTopColor:'#1f2535'},
lf:{flexGrow:0,paddingHorizontal:10,paddingVertical:6,borderBottomWidth:1,borderBottomColor:'#1f2535'},
fb:{paddingHorizontal:12,paddingVertical:4,borderRadius:5,borderWidth:1,borderColor:'#2a3148',marginRight:6},
fba:{backgroundColor:'rgba(90,100,128,.15)'},ft:{fontSize:10,color:'#5a6480',fontFamily:'monospace'},fta:{color:'#c8d0e8'},
lb:{flex:1,padding:8},le:{fontSize:11,color:'#3a4260',fontFamily:'monospace',textAlign:'center',marginTop:16},
ll:{flexDirection:'row',gap:6,marginBottom:2,alignItems:'flex-start'},
lt:{fontSize:9,color:'#3a4260',fontFamily:'monospace',paddingTop:2,width:60},
ltg:{borderRadius:4,paddingHorizontal:5,paddingVertical:1,alignSelf:'flex-start'},
ltgt:{fontSize:9,fontFamily:'monospace',fontWeight:'700'},
lm:{flex:1,fontSize:10,color:'#c8d0e8',fontFamily:'monospace',lineHeight:16},
le2:{color:'#ff5555'},
});
HOMEEOF

cat > src/screens/SettingsScreen.jsx << 'SETTEOF'
import React,{useEffect,useState}from 'react';
import{View,Text,StyleSheet,ScrollView,TextInput,Switch,TouchableOpacity,ActivityIndicator}from 'react-native';
import{bridge}from '../lib/bridge';
export default function SettingsScreen(){
const[enabled,setEnabled]=useState(false);
const[token,setToken]=useState('');
const[chatId,setChatId]=useState('');
const[notify,setNotify]=useState({start:true,stop:true,error:true,tunnel:true});
const[testing,setTesting]=useState(false);
const[testRes,setTestRes]=useState(null);
const[saved,setSaved]=useState(false);
useEffect(()=>{
const u=[
bridge.onConfig(cfg=>{const tg=cfg.telegram||{};setEnabled(!!tg.enabled);setToken(tg.token||'');setChatId(tg.chatId||'');setNotify({start:true,stop:true,error:true,tunnel:true,...tg.notify});}),
bridge.onTestResult(res=>{setTestRes(res);setTesting(false);}),
];
bridge.getConfig();
return()=>u.forEach(f=>f());
},[]);
const save=()=>{bridge.saveConfig({telegram:{enabled,token:token.trim(),chatId:chatId.trim(),notify}});setSaved(true);setTestRes(null);setTimeout(()=>setSaved(false),2500);};
const test=()=>{setTesting(true);setTestRes(null);bridge.testTelegram(token.trim(),chatId.trim());};
const tog=k=>setNotify(p=>({...p,[k]:!p[k]}));
return(<ScrollView style={s.root} contentContainerStyle={s.c} keyboardShouldPersistTaps="handled">
<Text style={s.st}>🤖 Telegram Bot</Text>
<View style={s.row}><View><Text style={s.rl}>Notificações ativas</Text><Text style={s.rs}>Liga/desliga o bot</Text></View>
<Switch value={enabled} onValueChange={setEnabled} trackColor={{false:'#2a3148',true:'#29b6f6'}} thumbColor={enabled?'#fff':'#5a6480'}/></View>
<Text style={s.fl}>Token do Bot</Text>
<TextInput style={s.inp} value={token} onChangeText={setToken} placeholder="123456:ABC-DEF..." placeholderTextColor="#3a4260" autoCapitalize="none" autoCorrect={false}/>
<Text style={s.fl}>Chat ID</Text>
<TextInput style={s.inp} value={chatId} onChangeText={setChatId} placeholder="123456789" placeholderTextColor="#3a4260" keyboardType="numeric"/>
<Text style={s.fl}>Notificar quando:</Text>
<View style={s.ng}>
{[{k:'start',l:'🟢 Iniciar'},{k:'stop',l:'⏹ Parar'},{k:'error',l:'🔴 Erro'},{k:'tunnel',l:'🌐 Túnel'}].map(({k,l})=>(
<TouchableOpacity key={k} style={[s.ni,notify[k]&&s.nia]} onPress={()=>tog(k)}>
<Text style={s.nc}>{notify[k]?'✓':' '}</Text><Text style={[s.nl,notify[k]&&{color:'#c8d0e8'}]}>{l}</Text>
</TouchableOpacity>))}
</View>
<TouchableOpacity style={[s.bt,testing&&s.btd]} onPress={test} disabled={testing}>
{testing?<ActivityIndicator size="small" color="#29b6f6"/>:<Text style={s.btt}>📨 Testar Conexão</Text>}
</TouchableOpacity>
{testRes&&<View style={[s.tr,testRes.ok?s.tok:s.terr]}><Text style={testRes.ok?s.tokt:s.terrt}>{testRes.ok?'✅ Enviado com sucesso!':`❌ ${testRes.error}`}</Text></View>}
<Text style={[s.st,{marginTop:24}]}>📟 Comandos do Bot</Text>
<View style={s.cb}>
{[['/status','status de todos'],['/list','lista projetos'],['/start <nome>','inicia'],['/stop <nome>','para'],['/tunnel <nome>','abre/fecha túnel'],['/help','ajuda']].map(([c,d])=>(
<View key={c} style={s.cr}><Text style={s.ccc}>{c}</Text><Text style={s.ccd}>{d}</Text></View>))}
</View>
<Text style={[s.st,{marginTop:24}]}>💾 Salvar</Text>
<TouchableOpacity style={s.bs} onPress={save}><Text style={s.bst2}>Salvar Configurações</Text></TouchableOpacity>
{saved&&<Text style={s.sm}>✅ Configurações salvas!</Text>}
<View style={{height:32}}/>
</ScrollView>);
}
const s=StyleSheet.create({
root:{flex:1,backgroundColor:'#0b0d13'},c:{padding:18,gap:10},
st:{fontSize:10,fontWeight:'700',color:'#3a4260',letterSpacing:1.5,textTransform:'uppercase',marginBottom:4,borderBottomWidth:1,borderBottomColor:'#1f2535',paddingBottom:8},
row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:6},
rl:{fontSize:13,color:'#c8d0e8',fontWeight:'600'},rs:{fontSize:10.5,color:'#5a6480',fontFamily:'monospace'},
fl:{fontSize:10.5,color:'#5a6480',fontFamily:'monospace',marginBottom:5,marginTop:4},
inp:{backgroundColor:'#181c28',borderWidth:1,borderColor:'#2a3148',borderRadius:8,padding:11,color:'#c8d0e8',fontFamily:'monospace',fontSize:12,marginBottom:4},
ng:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:4},
ni:{flexDirection:'row',alignItems:'center',gap:7,padding:10,borderRadius:8,borderWidth:1,borderColor:'#2a3148',backgroundColor:'#181c28',flex:1,minWidth:'45%'},
nia:{borderColor:'#29b6f6',backgroundColor:'rgba(41,182,246,.08)'},
nc:{fontSize:12,color:'#29b6f6',width:14,textAlign:'center'},nl:{fontSize:12,color:'#5a6480',fontFamily:'monospace'},
bt:{padding:12,borderRadius:8,borderWidth:1,borderColor:'rgba(41,182,246,.3)',backgroundColor:'rgba(41,182,246,.08)',alignItems:'center',marginTop:4},
btd:{opacity:.5},btt:{fontSize:12,color:'#29b6f6',fontWeight:'700'},
tr:{padding:10,borderRadius:8,borderWidth:1},
tok:{backgroundColor:'rgba(34,211,107,.08)',borderColor:'rgba(34,211,107,.25)'},
terr:{backgroundColor:'rgba(255,85,85,.08)',borderColor:'rgba(255,85,85,.25)'},
tokt:{fontSize:11,color:'#22d36b',fontFamily:'monospace'},terrt:{fontSize:11,color:'#ff5555',fontFamily:'monospace'},
cb:{backgroundColor:'#181c28',borderRadius:8,borderWidth:1,borderColor:'#1f2535',padding:12,gap:8},
cr:{flexDirection:'row',alignItems:'flex-start',gap:10},
ccc:{fontSize:11,color:'#29b6f6',fontFamily:'monospace',width:130},ccd:{fontSize:11,color:'#5a6480',fontFamily:'monospace',flex:1},
bs:{padding:14,borderRadius:8,borderWidth:1,borderColor:'rgba(0,200,224,.3)',backgroundColor:'rgba(0,200,224,.08)',alignItems:'center'},
bst2:{fontSize:14,color:'#c8d0e8',fontWeight:'900',letterSpacing:.5},
sm:{fontSize:12,color:'#22d36b',textAlign:'center',fontFamily:'monospace'},
});
SETTEOF

# ═══════════════════════════════════════════════════════════════
# Node.js backend (nodejs-assets)
# ═══════════════════════════════════════════════════════════════
cat > nodejs-assets/nodejs-project/package.json << 'EOF'
{
  "name": "nodedock-backend",
  "version": "1.0.0",
  "main": "main.js",
  "dependencies": { "localtunnel": "^2.0.2" }
}
EOF

# main.js do backend
cat > nodejs-assets/nodejs-project/main.js << 'MAINEOF'
'use strict';
const {execPath}=process,{spawn}=require('child_process');
const path=require('path'),fs=require('fs'),os=require('os');
const rn=require('rn-bridge');
const telegram=require('./telegram');
const tunnels=require('./tunnels');
const BASE_PORT=3001;
const CONFIG_FILE=path.join(rn.app.datadir(),'nodedock-config.json');
const DEF={projectsDir:null,telegram:{enabled:false,token:'',chatId:'',notify:{start:true,stop:true,error:true,tunnel:true}}};
function loadConfig(){try{const c=JSON.parse(fs.readFileSync(CONFIG_FILE,'utf8'));return{...DEF,...c,telegram:{...DEF.telegram,...c.telegram,notify:{...DEF.telegram.notify,...c.telegram?.notify}}};}catch{return JSON.parse(JSON.stringify(DEF));}}
function saveConfig(cfg){try{fs.writeFileSync(CONFIG_FILE,JSON.stringify(cfg,null,2));}catch{}}
let projectsDir=null,services={};
function discover(dir){
if(!dir)return[];
let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return[];}
const found=[];let port=BASE_PORT;
for(const e of entries){
if(!e.isDirectory())continue;
const sub=path.join(dir,e.name),pkgP=path.join(sub,'package.json');
if(!fs.existsSync(pkgP))continue;
let pkg={};try{pkg=JSON.parse(fs.readFileSync(pkgP,'utf8'));}catch{continue;}
const cands=[pkg.main,'server.js','index.js','app.js'].filter(Boolean);
let script=null;for(const c of cands){if(fs.existsSync(path.join(sub,c))){script=c;break;}}
if(!script)continue;
found.push({id:e.name.replace(/[^a-zA-Z0-9_-]/g,'_'),folderName:e.name,name:pkg.name||e.name,description:pkg.description||'',version:pkg.version||'',script,dir:sub,port:port++});
}return found;}
function refresh(){
const disc=discover(projectsDir);const next={};
for(const p of disc){const ex=services[p.id];next[p.id]={...p,proc:ex?.proc??null,status:ex?.status??'stopped'};}
for(const[id,svc]of Object.entries(services)){if(!next[id]&&svc.proc)svc.proc.kill('SIGTERM');}
services=next;
const ip=getIP();
rn.channel.send(JSON.stringify({event:'projects-list',data:Object.values(services).map(s=>({id:s.id,name:s.name,description:s.description,version:s.version,folderName:s.folderName,script:s.script,port:s.port,status:fs.existsSync(s.dir)?s.status:'missing',tunnelUrl:tunnels.getUrl(s.id),ip}))}));
}
function getIP(){try{const i=os.networkInterfaces();for(const n of Object.keys(i))for(const f of i[n])if(f.family==='IPv4'&&!f.internal)return f.address;}catch{}return'127.0.0.1';}
function log(id,text,type='out'){rn.channel.send(JSON.stringify({event:'log',data:{id,text,type}}));}
function setStatus(id,status){if(!services[id])return;services[id].status=status;rn.channel.send(JSON.stringify({event:'service-state',data:{id,status,port:services[id].port,tunnelUrl:tunnels.getUrl(id)}}));}
function start(id){
const svc=services[id];if(!svc||svc.proc)return;
if(!fs.existsSync(svc.dir)){log(id,`❌ Pasta não encontrada: ${svc.dir}`,'err');setStatus(id,'error');return;}
if(!fs.existsSync(path.join(svc.dir,svc.script))){log(id,`❌ Script não encontrado: ${svc.script}`,'err');setStatus(id,'error');return;}
if(!fs.existsSync(path.join(svc.dir,'node_modules'))){log(id,`❌ node_modules ausente em ${svc.folderName}`,'err');setStatus(id,'error');return;}
setStatus(id,'starting');log(id,`▶ Iniciando "${svc.name}" → porta ${svc.port}...`);
const proc=spawn(execPath,[svc.script],{cwd:svc.dir,env:{...process.env,PORT:String(svc.port),HOME:rn.app.datadir()},stdio:['ignore','pipe','pipe']});
svc.proc=proc;
proc.stdout.on('data',d=>log(id,d.toString().trimEnd(),'out'));
proc.stderr.on('data',d=>log(id,d.toString().trimEnd(),'err'));
const t=setTimeout(()=>{if(svc.proc===proc){setStatus(id,'running');telegram.notifyStart(svc.name,svc.port);}},2000);
proc.on('close',code=>{clearTimeout(t);svc.proc=null;if(code===0||code===null){log(id,'⏹ Encerrado.');setStatus(id,'stopped');telegram.notifyStop(svc.name);}else{log(id,`❌ Código ${code}`,'err');setStatus(id,'error');telegram.notifyError(svc.name,code);}});
proc.on('error',err=>{clearTimeout(t);svc.proc=null;log(id,`❌ ${err.message}`,'err');setStatus(id,'error');telegram.notifyError(svc.name,err.message);});
}
function stop(id){const svc=services[id];if(!svc?.proc)return;log(id,`⏹ Encerrando "${svc.name}"...`);svc.proc.kill('SIGTERM');setTimeout(()=>{if(svc.proc)svc.proc.kill('SIGKILL');},3000);}
async function openTunnel(id){
const svc=services[id];if(!svc)return;
log(id,`🌐 Abrindo túnel...`);
rn.channel.send(JSON.stringify({event:'tunnel-state',data:{id,status:'opening'}}));
try{const url=await tunnels.open(id,svc.port);log(id,`🌐 Túnel: ${url}`);rn.channel.send(JSON.stringify({event:'tunnel-state',data:{id,status:'open',url}}));telegram.notifyTunnel(svc.name,url);}
catch(e){log(id,`❌ Túnel falhou: ${e.message}`,'err');rn.channel.send(JSON.stringify({event:'tunnel-state',data:{id,status:'error'}}));}
}
function closeTunnel(id){tunnels.close(id);log(id,'🔌 Túnel fechado.');rn.channel.send(JSON.stringify({event:'tunnel-state',data:{id,status:'closed'}}));if(services[id])telegram.notifyTunnelClosed(services[id].name);}
function findProject(q){const lq=q.toLowerCase();return Object.values(services).find(s=>s.id.toLowerCase()===lq||s.name.toLowerCase()===lq||s.folderName.toLowerCase()===lq);}
async function handleCmd(cmd,args){
const list=Object.values(services);const icons={running:'🟢',stopped:'⏹',error:'🔴',starting:'🔄',missing:'⚠️'};
if(cmd==='status'){if(!list.length){telegram.send('📦 Nenhum projeto.');return;}telegram.send('<b>NodeDock</b>\n\n'+list.map(s=>`${icons[s.status]||'❓'} <b>${s.name}</b> :${s.port}${tunnels.getUrl(s.id)?'\n   🌐 '+tunnels.getUrl(s.id):''}`).join('\n\n'));return;}
if(cmd==='list'){telegram.send('<b>Projetos:</b>\n'+list.map((s,i)=>`${i+1}. <code>${s.id}</code> — ${s.name}`).join('\n')||'(nenhum)');return;}
if(cmd==='start'&&args.length){const svc=findProject(args[0]);if(!svc){telegram.send(`❓ Não encontrado: <code>${args[0]}</code>`);return;}start(svc.id);telegram.send(`▶ Iniciando <b>${svc.name}</b>...`);return;}
if(cmd==='stop'&&args.length){const svc=findProject(args[0]);if(!svc){telegram.send(`❓ Não encontrado: <code>${args[0]}</code>`);return;}stop(svc.id);telegram.send(`⏹ Parando <b>${svc.name}</b>...`);return;}
if(cmd==='tunnel'&&args.length){const svc=findProject(args[0]);if(!svc){telegram.send(`❓ Não encontrado: <code>${args[0]}</code>`);return;}tunnels.isOpen(svc.id)?closeTunnel(svc.id):openTunnel(svc.id);return;}
if(cmd==='help'){telegram.send('<b>Comandos:</b>\n/status /list /start &lt;nome&gt; /stop &lt;nome&gt; /tunnel &lt;nome&gt; /help');return;}
telegram.send(`❓ /${cmd} — desconhecido. Use /help.`);
}
const cfg=loadConfig();
projectsDir=cfg.projectsDir;
telegram.configure(cfg.telegram);
telegram.onLog=(text,type)=>log('__system__',text,type);
telegram.onCommand=(cmd,args)=>handleCmd(cmd,args);
rn.channel.send(JSON.stringify({event:'ready',data:{}}));
rn.channel.on('message',raw=>{
let msg;try{msg=JSON.parse(raw);}catch{return;}
const{event,data}=msg;
switch(event){
case 'refresh':refresh();break;
case 'start-service':start(data.id);break;
case 'stop-service':stop(data.id);break;
case 'start-all':Object.keys(services).forEach(start);break;
case 'stop-all':Object.keys(services).forEach(stop);break;
case 'open-tunnel':openTunnel(data.id);break;
case 'close-tunnel':closeTunnel(data.id);break;
case 'set-projects-dir':projectsDir=data.dir;saveConfig({...loadConfig(),projectsDir:data.dir});refresh();break;
case 'save-config':{const cur=loadConfig();const m={...cur,...data,telegram:{...cur.telegram,...data.telegram,notify:{...cur.telegram.notify,...data.telegram?.notify}}};saveConfig(m);telegram.configure(m.telegram);rn.channel.send(JSON.stringify({event:'config',data:m}));break;}
case 'get-config':rn.channel.send(JSON.stringify({event:'config',data:loadConfig()}));break;
case 'test-telegram':(async()=>{const prev={token:telegram.token,chatId:telegram.chatId};telegram.token=data.token?.trim();telegram.chatId=data.chatId?.trim();const r=await telegram.test();telegram.token=prev.token;telegram.chatId=prev.chatId;rn.channel.send(JSON.stringify({event:'test-result',data:r}));})();break;
}
});
MAINEOF

# telegram.js e tunnels.js — copiados do projeto Electron
cat > nodejs-assets/nodejs-project/telegram.js << 'TGEOF'
'use strict';
const https=require('https');
class TelegramBot{
constructor(){this.token=null;this.chatId=null;this.enabled=false;this.notify={start:true,stop:true,error:true,tunnel:true};this.offset=0;this._timer=null;this.onCommand=null;this.onLog=null;}
configure({token,chatId,enabled,notify}={}){const was=this.enabled;this.token=(token||'').trim();this.chatId=(chatId||'').trim();this.enabled=!!(enabled&&this.token&&this.chatId);if(notify)this.notify={...this.notify,...notify};if(this.enabled&&!was){this._log('🤖 Telegram conectado.');this._poll();}if(!this.enabled&&was){this._stopPoll();this._log('🤖 Telegram desconectado.');}}
async send(text){if(!this.enabled)return null;try{return await this._req('sendMessage',{chat_id:this.chatId,text,parse_mode:'HTML'});}catch(e){this._log(`⚠️ Telegram: ${e.message}`,'err');return null;}}
notifyStart(name,port){if(!this.notify.start)return;this.send(`🟢 <b>${name}</b> iniciado\n🔌 Porta: <code>${port}</code>`);}
notifyStop(name){if(!this.notify.stop)return;this.send(`⏹ <b>${name}</b> encerrado`);}
notifyError(name,code){if(!this.notify.error)return;this.send(`🔴 <b>${name}</b> com erro\n📟 <code>${code}</code>`);}
notifyTunnel(name,url){if(!this.notify.tunnel)return;this.send(`🌐 <b>${name}</b> — túnel aberto\n🔗 <a href="${url}">${url}</a>`);}
notifyTunnelClosed(name){if(!this.notify.tunnel)return;this.send(`🔌 <b>${name}</b> — túnel fechado`);}
async test(){if(!this.token||!this.chatId)return{ok:false,error:'Token ou Chat ID não preenchidos.'};try{const r=await this._req('sendMessage',{chat_id:this.chatId,text:'✅ <b>NodeDock</b> conectado!',parse_mode:'HTML'});if(r?.ok)return{ok:true};return{ok:false,error:r?.description||'Resposta inválida.'};}catch(e){return{ok:false,error:e.message};}}
_poll(){const tick=async()=>{try{const r=await this._req('getUpdates',{offset:this.offset,timeout:25,allowed_updates:['message']});if(r?.result?.length){for(const u of r.result){this.offset=u.update_id+1;const t=u.message?.text;if(t?.startsWith('/')&&this.onCommand){const p=t.trim().slice(1).split(/\s+/);this.onCommand(p[0].split('@')[0].toLowerCase(),p.slice(1));}}}}catch{}if(this.enabled)this._timer=setTimeout(tick,400);};this._timer=setTimeout(tick,800);}
_stopPoll(){clearTimeout(this._timer);this._timer=null;}
_req(method,body){return new Promise((resolve,reject)=>{const payload=JSON.stringify(body);const req=https.request({hostname:'api.telegram.org',path:`/bot${this.token}/${method}`,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)},timeout:32000},res=>{let raw='';res.on('data',d=>raw+=d);res.on('end',()=>{try{resolve(JSON.parse(raw));}catch{resolve(null);}});});req.on('error',reject);req.on('timeout',()=>{req.destroy();reject(new Error('timeout'));});req.write(payload);req.end();});}
_log(msg,type='out'){this.onLog?.(msg,type);}
}
module.exports=new TelegramBot();
TGEOF

cat > nodejs-assets/nodejs-project/tunnels.js << 'TUNEOF'
'use strict';
const active=new Map();
async function open(id,port){
if(active.has(id))return active.get(id).url;
let lt;try{lt=require('localtunnel');}catch{throw new Error('localtunnel não encontrado.');}
const tunnel=await lt({port});active.set(id,{tunnel,url:tunnel.url});
tunnel.on('close',()=>active.delete(id));tunnel.on('error',()=>active.delete(id));
return tunnel.url;}
function close(id){const e=active.get(id);if(!e)return;try{e.tunnel.close();}catch{}active.delete(id);}
function closeAll(){for(const id of active.keys())close(id);}
function getUrl(id){return active.get(id)?.url??null;}
function isOpen(id){return active.has(id);}
module.exports={open,close,closeAll,getUrl,isOpen};
TUNEOF

# ── 5. Git init e push ────────────────────────────────────────
echo ""
log "Inicializando repositório git..."
git init -q
git config user.email "nodedock@build.ci"
git config user.name  "NodeDock Setup"

echo "nodedock-config.json" > .gitignore
echo "node_modules/"       >> .gitignore

git add .
git commit -q -m "feat: NodeDock Android — initial setup"

log "Fazendo push para github.com/${GH_USER}/${GH_REPO}..."
git remote add origin "$GH_URL"
git branch -M main
git push -u origin main

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Push concluído com sucesso!${NC}"
echo ""
echo -e "  📦 Repositório: ${CYAN}https://github.com/${GH_USER}/${GH_REPO}${NC}"
echo -e "  ⚙️  Actions:    ${CYAN}https://github.com/${GH_USER}/${GH_REPO}/actions${NC}"
echo -e "  📥 Releases:   ${CYAN}https://github.com/${GH_USER}/${GH_REPO}/releases${NC}"
echo ""
echo -e "${YELLOW}  O build começa automaticamente agora.${NC}"
echo -e "${YELLOW}  Em ~20 minutos o APK estará em Releases.${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
