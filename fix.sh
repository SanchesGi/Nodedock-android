#!/data/data/com.termux/files/usr/bin/bash
# ╔══════════════════════════════════════════════════════════╗
# ║  SentriDock — aplicar fix em 1 comando                   ║
# ║  Cria os 4 arquivos certos, commita e dá push.           ║
# ╚══════════════════════════════════════════════════════════╝
set -e

C='\033[0;36m'; G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; N='\033[0m'

echo -e "${C}━━━ SentriDock fix ━━━${N}\n"

# ── Acha a pasta do projeto ───────────────────────────────────
if   [ -d "$HOME/nodedock-android" ];   then cd "$HOME/nodedock-android"
elif [ -d "$HOME/sentridock-android" ]; then cd "$HOME/sentridock-android"
else
  echo -e "${R}❌ Não achei nem ~/nodedock-android nem ~/sentridock-android${N}"
  exit 1
fi
echo -e "${G}📂${N} $(pwd)\n"

# ── Garante diretórios ────────────────────────────────────────
mkdir -p src/lib src/screens nodejs-assets/nodejs-project .github/workflows

# ── 1) src/lib/scanner.js ─────────────────────────────────────
echo -e "${Y}→${N} src/lib/scanner.js"
cat > src/lib/scanner.js << 'SCANNER_EOF'
/**
 * scanner.js — versão sem SAF.
 * O scan acontece DENTRO do Node.js (main.js), porque é ele que precisa
 * dos paths reais. Aqui no JS-side só pedimos ao Node pra escanear e
 * recebemos a lista pronta.
 *
 * Esta camada existe só pra:
 *   1) Calcular o path padrão (external app-specific dir)
 *   2) Garantir que a pasta /projects exista
 *   3) Abrir o Files app na pasta certa pro usuário copiar projetos
 */

import RNFS from 'react-native-fs';
import { Linking, Platform, ToastAndroid } from 'react-native';

// /storage/emulated/0/Android/data/com.sentridock.android/files/projects
export function getDefaultProjectsDir() {
  return `${RNFS.ExternalDirectoryPath}/projects`;
}

export async function ensureProjectsDir() {
  const dir = getDefaultProjectsDir();
  try {
    const exists = await RNFS.exists(dir);
    if (!exists) await RNFS.mkdir(dir);
    // cria um README.txt explicativo se não existir
    const readme = `${dir}/README.txt`;
    if (!(await RNFS.exists(readme))) {
      await RNFS.writeFile(
        readme,
        [
          'SentriDock - Pasta de projetos',
          '================================',
          '',
          'Coloque seus projetos Node.js aqui, cada um em sua própria',
          'subpasta contendo package.json e node_modules/.',
          '',
          'Exemplo:',
          '  projects/',
          '    meu-app/',
          '      package.json',
          '      server.js',
          '      node_modules/',
          '    outro-app/',
          '      package.json',
          '      ...',
          '',
          'Após copiar os projetos, toque em "↻ Scan" no app.',
        ].join('\n'),
        'utf8'
      );
    }
    return dir;
  } catch (e) {
    return dir;
  }
}

/**
 * Tenta abrir o Files app na pasta de projetos.
 * Em Android 11+ alguns gerenciadores bloqueiam Android/data/, então
 * essa abertura pode não funcionar em todos os dispositivos. Nesse
 * caso, mostramos o path pro usuário copiar manualmente.
 */
export async function openProjectsDirInFiles() {
  const dir = getDefaultProjectsDir();
  try {
    // Não há intent universal pra "abrir pasta", mas podemos tentar
    // via file:// (funciona em Android < 11 com alguns apps)
    if (Platform.Version < 30) {
      await Linking.openURL(`file://${dir}`);
      return true;
    }
  } catch {}
  // Fallback: copia o path pro clipboard via Toast
  ToastAndroid.show(
    `Abra seu gerenciador em:\n${dir}`,
    ToastAndroid.LONG
  );
  return false;
}
SCANNER_EOF

# ── 2) nodejs-assets/nodejs-project/main.js ───────────────────
echo -e "${Y}→${N} nodejs-assets/nodejs-project/main.js"
cat > nodejs-assets/nodejs-project/main.js << 'MAIN_EOF'
'use strict';

/**
 * main.js — roda dentro do nodejs-mobile-react-native.
 * VERSÃO SEM SAF: escaneia projetos direto no filesystem real.
 *
 * Pasta padrão: /storage/emulated/0/Android/data/<pkg>/files/projects/
 * Esta pasta é "external app-specific" e NÃO requer permissão em
 * NENHUMA versão Android (4.4 até 16+).
 */

const { execPath } = process;
const { spawn }    = require('child_process');
const path         = require('path');
const fs           = require('fs');
const os           = require('os');

const rn        = require('rn-bridge');
const telegram  = require('./telegram');
const tunnels   = require('./tunnels');

const BASE_PORT     = 3001;
const CONFIG_FILE   = path.join(rn.app.datadir(), 'sentridock-config.json');

// ── Calcula a pasta external app-specific a partir do datadir interno
//    Internal: /data/user/0/com.sentridock.android/files
//    External: /storage/emulated/0/Android/data/com.sentridock.android/files
function getExternalAppDir() {
  const internal = rn.app.datadir(); // /data/user/0/<pkg>/files
  const m = internal.match(/\/data\/user\/\d+\/([^/]+)\/files/);
  if (m) return `/storage/emulated/0/Android/data/${m[1]}/files`;
  // fallback: tenta com o nome do pacote conhecido
  return `/storage/emulated/0/Android/data/com.sentridock.android/files`;
}

const EXTERNAL_APP_DIR = getExternalAppDir();
const DEFAULT_PROJECTS_DIR = path.join(EXTERNAL_APP_DIR, 'projects');

// Garante que a pasta projects/ exista
function ensureProjectsDir() {
  try {
    if (!fs.existsSync(EXTERNAL_APP_DIR)) {
      fs.mkdirSync(EXTERNAL_APP_DIR, { recursive: true });
    }
    if (!fs.existsSync(DEFAULT_PROJECTS_DIR)) {
      fs.mkdirSync(DEFAULT_PROJECTS_DIR, { recursive: true });
    }
    // Também cria README.txt se não existir
    const readme = path.join(DEFAULT_PROJECTS_DIR, 'README.txt');
    if (!fs.existsSync(readme)) {
      fs.writeFileSync(readme, [
        'SentriDock - Pasta de projetos',
        '================================',
        '',
        'Coloque seus projetos Node.js em subpastas aqui dentro.',
        'Cada subpasta deve ter package.json + node_modules/.',
        '',
        'Exemplo:',
        '  projects/',
        '    meu-app/',
        '      package.json',
        '      server.js',
        '      node_modules/',
        '',
      ].join('\n'));
    }
    return true;
  } catch (e) {
    pushLog('__system__', `❌ Erro criando ${DEFAULT_PROJECTS_DIR}: ${e.message}`, 'err');
    return false;
  }
}

// ── Config ────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  projectsDir: null, // null = usa DEFAULT_PROJECTS_DIR
  telegram: {
    enabled: false, token: '', chatId: '',
    notify: { start: true, stop: true, error: true, tunnel: true },
  },
};

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const c   = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG, ...c,
      telegram: {
        ...DEFAULT_CONFIG.telegram, ...c.telegram,
        notify: { ...DEFAULT_CONFIG.telegram.notify, ...(c.telegram?.notify || {}) },
      },
    };
  } catch { return JSON.parse(JSON.stringify(DEFAULT_CONFIG)); }
}

function saveConfig(cfg) {
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2)); } catch {}
}

// ── Descoberta de projetos ────────────────────────────────────
let projectsDir = null;

function getEffectiveProjectsDir() {
  return projectsDir || DEFAULT_PROJECTS_DIR;
}

function discoverProjects(dir) {
  if (!dir) return { found: [], debug: 'Sem pasta definida.' };
  const debug = [`Pasta: ${dir}`];

  if (!fs.existsSync(dir)) {
    debug.push(`❌ Pasta não existe.`);
    return { found: [], debug: debug.join('\n') };
  }

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
    debug.push(`Itens: ${entries.length}`);
  } catch (e) {
    debug.push(`❌ readdir: ${e.message}`);
    return { found: [], debug: debug.join('\n') };
  }

  const found = [];
  let port = BASE_PORT;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const subdir  = path.join(dir, entry.name);
    const pkgPath = path.join(subdir, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      debug.push(`  ${entry.name}/ — sem package.json`);
      continue;
    }

    let pkg = {};
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); }
    catch (e) {
      debug.push(`  ${entry.name}/ — package.json inválido: ${e.message}`);
      continue;
    }

    const candidates = [pkg.main, 'server.js', 'index.js', 'app.js'].filter(Boolean);
    let script = null;
    for (const c of candidates) {
      if (fs.existsSync(path.join(subdir, c))) { script = c; break; }
    }
    if (!script) {
      debug.push(`  ${entry.name}/ — sem script (procurei: ${candidates.join(', ')})`);
      continue;
    }

    found.push({
      id:          entry.name.replace(/[^a-zA-Z0-9_-]/g, '_'),
      folderName:  entry.name,
      name:        pkg.name || entry.name,
      description: pkg.description || '',
      version:     pkg.version     || '',
      script, dir: subdir,
      port: port++,
    });
    debug.push(`  ✅ ${entry.name}/ → ${script}`);
  }

  debug.push(`Total: ${found.length}`);
  return { found, debug: debug.join('\n') };
}

// ── Estado global ─────────────────────────────────────────────
let services = {};
let lastDebug = '';

function refreshDiscovery() {
  const dir = getEffectiveProjectsDir();
  const { found, debug } = discoverProjects(dir);
  lastDebug = debug;

  const next = {};
  for (const p of found) {
    const ex = services[p.id];
    next[p.id] = { ...p, proc: ex?.proc ?? null, status: ex?.status ?? 'stopped' };
  }
  for (const [id, svc] of Object.entries(services)) {
    if (!next[id] && svc.proc) svc.proc.kill('SIGTERM');
  }
  services = next;
}

// ── Envio de estado ───────────────────────────────────────────
function sendProjectsList() {
  refreshDiscovery();
  const ip = getLocalIP();
  rn.channel.send(JSON.stringify({
    event: 'projects-list',
    data: {
      projects: Object.values(services).map(s => ({
        id: s.id, name: s.name, description: s.description,
        version: s.version, folderName: s.folderName,
        script: s.script, port: s.port,
        status:    fs.existsSync(s.dir) ? s.status : 'missing',
        tunnelUrl: tunnels.getUrl(s.id),
        ip,
      })),
      dir: getEffectiveProjectsDir(),
      debug: lastDebug,
    },
  }));
}

function sendServiceState(id) {
  const svc = services[id];
  if (!svc) return;
  rn.channel.send(JSON.stringify({
    event: 'service-state',
    data:  { id: svc.id, status: svc.status, port: svc.port, tunnelUrl: tunnels.getUrl(id) },
  }));
}

function pushLog(id, text, type = 'out') {
  rn.channel.send(JSON.stringify({ event: 'log', data: { id, text, type } }));
}

function setStatus(id, status) {
  if (!services[id]) return;
  services[id].status = status;
  sendServiceState(id);
}

function getLocalIP() {
  try {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces))
      for (const iface of ifaces[name])
        if (iface.family === 'IPv4' && !iface.internal) return iface.address;
  } catch {}
  return '127.0.0.1';
}

// ── Start / Stop ──────────────────────────────────────────────
function startService(id) {
  const svc = services[id];
  if (!svc || svc.proc) return;

  if (!fs.existsSync(svc.dir)) {
    pushLog(id, `❌ Pasta não encontrada: ${svc.dir}`, 'err');
    setStatus(id, 'error'); return;
  }
  if (!fs.existsSync(path.join(svc.dir, svc.script))) {
    pushLog(id, `❌ Script não encontrado: ${svc.script}`, 'err');
    setStatus(id, 'error'); return;
  }
  if (!fs.existsSync(path.join(svc.dir, 'node_modules'))) {
    pushLog(id, `❌ node_modules ausente.\n   Você precisa colocar a pasta node_modules/ junto.\n   No PC: rode "npm install" e copie a pasta inteira pro celular.`, 'err');
    setStatus(id, 'error'); return;
  }

  setStatus(id, 'starting');
  pushLog(id, `▶ Iniciando "${svc.name}" → porta ${svc.port}...`);

  const proc = spawn(execPath, [svc.script], {
    cwd:  svc.dir,
    env:  { ...process.env, PORT: String(svc.port), HOME: rn.app.datadir() },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  svc.proc = proc;
  proc.stdout.on('data', d => pushLog(id, d.toString().trimEnd(), 'out'));
  proc.stderr.on('data', d => pushLog(id, d.toString().trimEnd(), 'err'));

  const timer = setTimeout(() => {
    if (svc.proc === proc) {
      setStatus(id, 'running');
      telegram.notifyStart(svc.name, svc.port);
    }
  }, 2000);

  proc.on('close', (code) => {
    clearTimeout(timer);
    svc.proc = null;
    if (code === 0 || code === null) {
      pushLog(id, `⏹ Serviço encerrado.`);
      setStatus(id, 'stopped');
      telegram.notifyStop(svc.name);
    } else {
      pushLog(id, `❌ Encerrado com código ${code}`, 'err');
      setStatus(id, 'error');
      telegram.notifyError(svc.name, code);
    }
  });

  proc.on('error', (err) => {
    clearTimeout(timer);
    svc.proc = null;
    pushLog(id, `❌ ${err.message}`, 'err');
    setStatus(id, 'error');
    telegram.notifyError(svc.name, err.message);
  });
}

function stopService(id) {
  const svc = services[id];
  if (!svc?.proc) return;
  pushLog(id, `⏹ Encerrando "${svc.name}"...`);
  svc.proc.kill('SIGTERM');
  setTimeout(() => { if (svc.proc) svc.proc.kill('SIGKILL'); }, 3000);
}

// ── Tunnels ───────────────────────────────────────────────────
async function openTunnel(id) {
  const svc = services[id];
  if (!svc) return;
  pushLog(id, `🌐 Abrindo túnel para porta ${svc.port}...`);
  rn.channel.send(JSON.stringify({ event: 'tunnel-state', data: { id, status: 'opening' } }));
  try {
    const url = await tunnels.open(id, svc.port);
    pushLog(id, `🌐 Túnel aberto: ${url}`);
    rn.channel.send(JSON.stringify({ event: 'tunnel-state', data: { id, status: 'open', url } }));
    telegram.notifyTunnel(svc.name, url);
  } catch (e) {
    pushLog(id, `❌ Túnel falhou: ${e.message}`, 'err');
    rn.channel.send(JSON.stringify({ event: 'tunnel-state', data: { id, status: 'error' } }));
  }
}

function closeTunnel(id) {
  tunnels.close(id);
  pushLog(id, `🔌 Túnel fechado.`);
  rn.channel.send(JSON.stringify({ event: 'tunnel-state', data: { id, status: 'closed' } }));
  if (services[id]) telegram.notifyTunnelClosed(services[id].name);
}

// ── Telegram commands (sem mudanças) ──────────────────────────
function findProject(q) {
  const lq = q.toLowerCase();
  return Object.values(services).find(s =>
    s.id.toLowerCase() === lq || s.name.toLowerCase() === lq || s.folderName.toLowerCase() === lq
  );
}

async function handleTelegramCommand(cmd, args) {
  const list = Object.values(services);
  const icons = { running: '🟢', stopped: '⏹', error: '🔴', starting: '🔄', missing: '⚠️' };

  if (cmd === 'status') {
    if (!list.length) { telegram.send('📦 Nenhum projeto encontrado.'); return; }
    const lines = list.map(s => {
      const turl = tunnels.getUrl(s.id);
      return `${icons[s.status] || '❓'} <b>${s.name}</b> :${s.port}${turl ? `\n   🌐 ${turl}` : ''}`;
    });
    telegram.send(`<b>SentriDock — Status</b>\n\n${lines.join('\n\n')}`);
    return;
  }
  if (cmd === 'list') {
    telegram.send(`<b>Projetos:</b>\n${list.map((s,i) => `${i+1}. <code>${s.id}</code> — ${s.name}`).join('\n') || '(nenhum)'}`);
    return;
  }
  if (cmd === 'start' && args.length) {
    const svc = findProject(args[0]);
    if (!svc) { telegram.send(`❓ Não encontrado: <code>${args[0]}</code>`); return; }
    startService(svc.id);
    telegram.send(`▶ Iniciando <b>${svc.name}</b>...`);
    return;
  }
  if (cmd === 'stop' && args.length) {
    const svc = findProject(args[0]);
    if (!svc) { telegram.send(`❓ Não encontrado: <code>${args[0]}</code>`); return; }
    stopService(svc.id);
    telegram.send(`⏹ Encerrando <b>${svc.name}</b>...`);
    return;
  }
  if (cmd === 'tunnel' && args.length) {
    const svc = findProject(args[0]);
    if (!svc) { telegram.send(`❓ Não encontrado: <code>${args[0]}</code>`); return; }
    tunnels.isOpen(svc.id) ? closeTunnel(svc.id) : openTunnel(svc.id);
    return;
  }
  if (cmd === 'help') {
    telegram.send(
      `<b>SentriDock — Comandos</b>\n\n` +
      `/status — status de todos\n/list — lista projetos\n` +
      `/start &lt;nome&gt; — inicia\n/stop &lt;nome&gt; — para\n` +
      `/tunnel &lt;nome&gt; — abre/fecha túnel\n/help — ajuda`
    );
    return;
  }
  telegram.send(`❓ Comando desconhecido: <code>/${cmd}</code>\nUse /help.`);
}

// ── Init ──────────────────────────────────────────────────────
ensureProjectsDir();
const cfg = loadConfig();
projectsDir = cfg.projectsDir;

telegram.configure(cfg.telegram);
telegram.onLog     = (text, type) => pushLog('__system__', text, type);
telegram.onCommand = (cmd, args)  => handleTelegramCommand(cmd, args);

rn.channel.send(JSON.stringify({ event: 'ready', data: { defaultDir: DEFAULT_PROJECTS_DIR } }));

rn.channel.on('message', (raw) => {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  const { event, data } = msg;

  switch (event) {
    case 'refresh':          sendProjectsList(); break;
    case 'start-service':    startService(data.id); break;
    case 'stop-service':     stopService(data.id); break;
    case 'start-all':        Object.keys(services).forEach(startService); break;
    case 'stop-all':         Object.keys(services).forEach(stopService); break;
    case 'open-tunnel':      openTunnel(data.id); break;
    case 'close-tunnel':     closeTunnel(data.id); break;

    case 'set-projects-dir': {
      // Só aceita paths reais. Se vier content://, rejeita com aviso.
      if (typeof data.dir === 'string' && data.dir.startsWith('/')) {
        projectsDir = data.dir;
      } else {
        projectsDir = null; // volta pro default
      }
      const cur = loadConfig();
      saveConfig({ ...cur, projectsDir });
      sendProjectsList();
      break;
    }

    case 'reset-projects-dir': {
      projectsDir = null;
      const cur = loadConfig();
      saveConfig({ ...cur, projectsDir: null });
      ensureProjectsDir();
      sendProjectsList();
      break;
    }

    case 'save-config': {
      const cur = loadConfig();
      const merged = {
        ...cur, ...data,
        telegram: { ...cur.telegram, ...data.telegram, notify: { ...cur.telegram.notify, ...(data.telegram?.notify || {}) } },
      };
      saveConfig(merged);
      telegram.configure(merged.telegram);
      rn.channel.send(JSON.stringify({ event: 'config', data: merged }));
      break;
    }

    case 'get-config':
      rn.channel.send(JSON.stringify({ event: 'config', data: loadConfig() }));
      break;

    case 'test-telegram':
      (async () => {
        const prev = { token: telegram.token, chatId: telegram.chatId };
        telegram.token  = data.token?.trim();
        telegram.chatId = data.chatId?.trim();
        const result = await telegram.test();
        telegram.token  = prev.token;
        telegram.chatId = prev.chatId;
        rn.channel.send(JSON.stringify({ event: 'test-result', data: result }));
      })();
      break;
  }
});
MAIN_EOF

# ── 3) src/screens/HomeScreen.jsx ─────────────────────────────
echo -e "${Y}→${N} src/screens/HomeScreen.jsx"
cat > src/screens/HomeScreen.jsx << 'HOME_EOF'
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ScrollView, RefreshControl, Alert, Linking, ToastAndroid,
  Clipboard,
} from 'react-native';
import { bridge } from '../lib/bridge';
import { getDefaultProjectsDir, ensureProjectsDir, openProjectsDirInFiles } from '../lib/scanner';

const PALETTE = ['#00c8e0', '#f5a623', '#22d36b', '#7c8ff5', '#f572c0', '#ff7744'];

const STATUS_LABELS = {
  stopped:  'Parado',  starting: 'Iniciando…', running: 'Rodando',
  error:    'Erro',    missing:  'Não encontrado',
};
const STATUS_COLORS = {
  stopped:  '#5a6480', starting: '#7c8ff5', running: '#22d36b',
  error:    '#ff5555', missing:  '#f5a623',
};

export default function HomeScreen() {
  const [projects,    setProjects]    = useState([]);
  const [logs,        setLogs]        = useState([]);
  const [selectedLog, setSelectedLog] = useState('all');
  const [refreshing,  setRefreshing]  = useState(false);
  const [projectsDir, setProjectsDir] = useState(null);
  const [debug,       setDebug]       = useState('');
  const [tunnelMap,   setTunnelMap]   = useState({});
  const logsRef   = useRef([]);
  const scrollRef = useRef(null);

  useEffect(() => {
    // Garante que a pasta default existe ANTES de pedir o scan
    ensureProjectsDir().then(dir => {
      setProjectsDir(dir);
      // Pequeno delay pra dar tempo da bridge subir
      setTimeout(() => bridge.refresh(), 300);
    });

    const unsubs = [
      bridge.onProjectsList((payload) => {
        // Aceita ambos os formatos: array (legado) e {projects, dir, debug}
        const list  = Array.isArray(payload) ? payload : payload.projects;
        const pdir  = Array.isArray(payload) ? null    : payload.dir;
        const pdbg  = Array.isArray(payload) ? ''      : payload.debug;
        setProjects(list || []);
        if (pdir) setProjectsDir(pdir);
        if (pdbg) setDebug(pdbg);
        setRefreshing(false);
      }),

      bridge.onServiceState(({ id, status }) => {
        setProjects(prev => prev.map(p => p.id === id ? { ...p, status } : p));
      }),

      bridge.onLog(({ id, text, type }) => {
        const lines = text.split('\n').filter(l => l.trim());
        const now   = new Date().toLocaleTimeString('pt-BR', { hour12: false });
        const newEntries = lines.map((line, i) => ({
          key: `${Date.now()}-${i}`, id, text: line, type, time: now,
        }));
        logsRef.current = [...logsRef.current.slice(-300), ...newEntries];
        setLogs([...logsRef.current]);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }),

      bridge.onTunnelState(({ id, status, url }) => {
        setTunnelMap(prev => ({ ...prev, [id]: { status, url } }));
        if (status === 'open' && url) {
          ToastAndroid.show(`🌐 Túnel: ${url}`, ToastAndroid.LONG);
        }
      }),
    ];

    return () => unsubs.forEach(fn => fn());
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    bridge.refresh();
  }, []);

  const showHelp = () => {
    const dir = projectsDir || getDefaultProjectsDir();
    Alert.alert(
      'Como adicionar projetos',
      `Copie cada projeto Node.js (com seu node_modules/) pra:\n\n${dir}\n\nDepois toque em "↻ Scan".\n\nDica: você pode usar:\n• Files do Google\n• MT Manager\n• Solid Explorer\n\nNo Android 11+ alguns gerenciadores bloqueiam Android/data/. Se acontecer, use ADB ou MT Manager (Files do Google funciona).`,
      [
        { text: 'Copiar path', onPress: () => { Clipboard.setString(dir); ToastAndroid.show('Copiado!', ToastAndroid.SHORT); } },
        { text: 'Abrir gerenciador', onPress: () => openProjectsDirInFiles() },
        { text: 'OK' },
      ]
    );
  };

  const showDebug = () => {
    Alert.alert('Debug do scan', debug || '(vazio)', [{ text: 'OK' }]);
  };

  const filteredLogs = selectedLog === 'all' ? logs : logs.filter(l => l.id === selectedLog);

  const renderProject = ({ item: p, index }) => {
    const color    = PALETTE[index % PALETTE.length];
    const tunnel   = tunnelMap[p.id] || {};
    const running  = p.status === 'running';
    const starting = p.status === 'starting';
    const missing  = p.status === 'missing';

    return (
      <View style={[styles.card, running && { shadowColor: color, shadowOpacity: .4, shadowRadius: 12, elevation: 8 }]}>
        <View style={[styles.cardAccent, { backgroundColor: color }]} />
        <View style={styles.cardHeader}>
          <View style={styles.cardMeta}>
            <Text style={styles.cardName} numberOfLines={1}>{p.name}</Text>
            <View style={styles.cardSubRow}>
              <View style={[styles.portPill, { backgroundColor: color + '22', borderColor: color + '55' }]}>
                <Text style={[styles.portPillText, { color }]}>:{p.port}</Text>
              </View>
              <Text style={styles.cardDesc} numberOfLines={1}>
                {p.description || p.folderName + '/'}
              </Text>
            </View>
          </View>
          <View style={[styles.badge, { backgroundColor: STATUS_COLORS[p.status] + '22', borderColor: STATUS_COLORS[p.status] + '55' }]}>
            <View style={[styles.dot, { backgroundColor: STATUS_COLORS[p.status] }]} />
            <Text style={[styles.badgeText, { color: STATUS_COLORS[p.status] }]}>
              {STATUS_LABELS[p.status] || p.status}
            </Text>
          </View>
        </View>

        {missing && (
          <View style={styles.missingWarn}>
            <Text style={styles.missingText}>⚠️ Pasta não encontrada: {p.folderName}/</Text>
          </View>
        )}

        {tunnel.status === 'open' && tunnel.url && (
          <TouchableOpacity
            style={styles.tunnelBar}
            onPress={() => {
              Clipboard.setString(tunnel.url);
              ToastAndroid.show('URL copiada!', ToastAndroid.SHORT);
            }}
          >
            <Text style={styles.tunnelUrl} numberOfLines={1}>🌐 {tunnel.url}</Text>
            <Text style={styles.tunnelCopy}>⎘</Text>
          </TouchableOpacity>
        )}

        {tunnel.status === 'opening' && (
          <View style={styles.tunnelOpening}>
            <Text style={styles.tunnelOpeningText}>🌐 Abrindo túnel…</Text>
          </View>
        )}

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.btnAction, (running || starting || missing) && styles.btnDisabled]}
            onPress={() => bridge.startService(p.id)}
            disabled={running || starting || missing}
          >
            <Text style={[styles.btnActionText, (running || starting || missing) && styles.btnDisabledText]}>▶ Iniciar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnAction, (!running && !starting) && styles.btnDisabled]}
            onPress={() => bridge.stopService(p.id)}
            disabled={!running && !starting}
          >
            <Text style={[styles.btnActionText, (!running && !starting) && styles.btnDisabledText]}>⏹ Parar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnIcon, !running && styles.btnDisabled]}
            onPress={() => Linking.openURL(`http://127.0.0.1:${p.port}`)}
            disabled={!running}
          >
            <Text style={styles.btnIconText}>↗</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnIcon, tunnel.status === 'open' && styles.btnTunnelActive, missing && styles.btnDisabled]}
            onPress={() => tunnel.status === 'open' ? bridge.closeTunnel(p.id) : bridge.openTunnel(p.id)}
            disabled={missing}
          >
            <Text style={styles.btnIconText}>🌐</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.dirBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.dirLabel} numberOfLines={1}>
            📁 {projectsDir ? projectsDir.replace('/storage/emulated/0/', '') : 'Carregando…'}
          </Text>
        </View>
        <TouchableOpacity style={styles.btnDir} onPress={showHelp}>
          <Text style={styles.btnDirText}>?</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.globalActions}>
        <TouchableOpacity style={styles.btnGlobal} onPress={() => bridge.startAll()}>
          <Text style={styles.btnGlobalText}>▶▶ Todos</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnGlobal, styles.btnGlobalDanger]} onPress={() => bridge.stopAll()}>
          <Text style={[styles.btnGlobalText, { color: '#ff5555' }]}>⏹ Parar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnGlobal} onPress={onRefresh}>
          <Text style={styles.btnGlobalText}>↻ Scan</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnGlobal} onPress={showDebug}>
          <Text style={styles.btnGlobalText}>🐛</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={projects}
        keyExtractor={p => p.id}
        renderItem={renderProject}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00c8e0" />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIco}>📦</Text>
            <Text style={styles.emptyText}>
              Nenhum projeto Node.js encontrado.{'\n\n'}
              Copie seus projetos (com node_modules/) pra:{'\n'}
              <Text style={{ color: '#00c8e0' }}>Android/data/com.sentridock.android/files/projects/</Text>
              {'\n\n'}
              Toque em <Text style={{ color: '#00c8e0' }}>?</Text> para mais ajuda.
            </Text>
          </View>
        }
      />

      <View style={styles.logWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.logFilters}>
          <TouchableOpacity
            style={[styles.filterBtn, selectedLog === 'all' && styles.filterBtnActive]}
            onPress={() => setSelectedLog('all')}
          >
            <Text style={[styles.filterText, selectedLog === 'all' && styles.filterTextActive]}>Todos</Text>
          </TouchableOpacity>
          {projects.map((p, i) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.filterBtn, selectedLog === p.id && { borderColor: PALETTE[i % PALETTE.length] }]}
              onPress={() => setSelectedLog(p.id)}
            >
              <Text style={[styles.filterText, selectedLog === p.id && { color: PALETTE[i % PALETTE.length] }]}>
                {p.name.length > 10 ? p.name.slice(0, 10) + '…' : p.name}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.filterBtn} onPress={() => { logsRef.current = []; setLogs([]); }}>
            <Text style={[styles.filterText, { color: '#ff5555' }]}>✕ Limpar</Text>
          </TouchableOpacity>
        </ScrollView>

        <ScrollView ref={scrollRef} style={styles.logBody} nestedScrollEnabled>
          {filteredLogs.length === 0
            ? <Text style={styles.logEmpty}>📡 Inicie um serviço para ver os logs.</Text>
            : filteredLogs.map(l => {
                const projIdx = projects.findIndex(p => p.id === l.id);
                const color   = projIdx >= 0 ? PALETTE[projIdx % PALETTE.length] : '#00c8e0';
                return (
                  <View key={l.key} style={styles.logLine}>
                    <Text style={styles.logTime}>{l.time}</Text>
                    <View style={[styles.logTag, { backgroundColor: color + '22' }]}>
                      <Text style={[styles.logTagText, { color }]}>
                        {(projects[projIdx]?.name || l.id).slice(0, 8)}
                      </Text>
                    </View>
                    <Text style={[styles.logMsg, l.type === 'err' && styles.logErr]} selectable>
                      {l.text}
                    </Text>
                  </View>
                );
              })
          }
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0d13' },
  dirBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 9,
    backgroundColor: '#12151f', borderBottomWidth: 1, borderBottomColor: '#1f2535',
  },
  dirLabel: { fontSize: 10, color: '#c8d0e8', fontFamily: 'monospace' },
  btnDir: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 7, borderWidth: 1, borderColor: '#00c8e0', backgroundColor: 'rgba(0,200,224,.08)' },
  btnDirText: { fontSize: 12, color: '#00c8e0', fontWeight: '700' },

  globalActions: { flexDirection: 'row', gap: 7, padding: 12, paddingBottom: 6 },
  btnGlobal: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#2a3148', backgroundColor: '#12151f', alignItems: 'center' },
  btnGlobalDanger: { borderColor: 'rgba(255,85,85,.3)', backgroundColor: 'rgba(255,85,85,.06)' },
  btnGlobalText: { fontSize: 11, color: '#c8d0e8', fontWeight: '700' },

  list: { flex: 1 },
  listContent: { padding: 12, gap: 10 },
  card: { backgroundColor: '#181c28', borderRadius: 12, borderWidth: 1, borderColor: '#1f2535', overflow: 'hidden' },
  cardAccent: { height: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 13, gap: 10 },
  cardMeta: { flex: 1 },
  cardName: { fontSize: 14, fontWeight: '900', color: '#c8d0e8', letterSpacing: .3 },
  cardSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  portPill: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  portPillText: { fontSize: 10, fontFamily: 'monospace', fontWeight: '700' },
  cardDesc: { fontSize: 10, color: '#5a6480', flex: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 10, fontFamily: 'monospace', fontWeight: '700' },
  missingWarn: { marginHorizontal: 13, marginBottom: 8, padding: 8, borderRadius: 7, backgroundColor: 'rgba(245,166,35,.06)', borderWidth: 1, borderColor: 'rgba(245,166,35,.2)' },
  missingText: { fontSize: 10, color: '#f5a623', fontFamily: 'monospace' },
  tunnelBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 13, marginBottom: 8, padding: 8, borderRadius: 7, backgroundColor: 'rgba(34,211,107,.06)', borderWidth: 1, borderColor: 'rgba(34,211,107,.2)' },
  tunnelUrl: { flex: 1, fontSize: 10, color: '#22d36b', fontFamily: 'monospace' },
  tunnelCopy: { fontSize: 14, color: '#22d36b', paddingLeft: 8 },
  tunnelOpening: { marginHorizontal: 13, marginBottom: 8, padding: 8, borderRadius: 7, backgroundColor: 'rgba(124,143,245,.06)', borderWidth: 1, borderColor: 'rgba(124,143,245,.2)' },
  tunnelOpeningText: { fontSize: 10, color: '#7c8ff5', fontFamily: 'monospace' },
  cardActions: { flexDirection: 'row', gap: 7, padding: 13, paddingTop: 0 },
  btnAction: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#2a3148', backgroundColor: '#12151f', alignItems: 'center' },
  btnActionText: { fontSize: 12, color: '#c8d0e8', fontWeight: '700' },
  btnDisabled: { opacity: .3 },
  btnDisabledText: { color: '#5a6480' },
  btnIcon: { width: 36, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#2a3148', backgroundColor: '#12151f', alignItems: 'center' },
  btnIconText: { fontSize: 13 },
  btnTunnelActive: { borderColor: '#22d36b', backgroundColor: 'rgba(34,211,107,.1)' },
  empty: { flex: 1, alignItems: 'center', paddingTop: 40, gap: 12, paddingHorizontal: 20 },
  emptyIco: { fontSize: 36, opacity: .4 },
  emptyText: { fontSize: 11, color: '#5a6480', fontFamily: 'monospace', textAlign: 'center', lineHeight: 18 },

  logWrap: { height: 200, backgroundColor: '#12151f', borderTopWidth: 1, borderTopColor: '#1f2535' },
  logFilters: { flexGrow: 0, paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1f2535' },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 5, borderWidth: 1, borderColor: '#2a3148', marginRight: 6 },
  filterBtnActive: { backgroundColor: 'rgba(90,100,128,.15)' },
  filterText: { fontSize: 10, color: '#5a6480', fontFamily: 'monospace' },
  filterTextActive: { color: '#c8d0e8' },
  logBody: { flex: 1, padding: 8 },
  logEmpty: { fontSize: 11, color: '#3a4260', fontFamily: 'monospace', textAlign: 'center', marginTop: 16 },
  logLine: { flexDirection: 'row', gap: 6, marginBottom: 2, alignItems: 'flex-start' },
  logTime: { fontSize: 9, color: '#3a4260', fontFamily: 'monospace', paddingTop: 2, width: 60 },
  logTag: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, alignSelf: 'flex-start' },
  logTagText: { fontSize: 9, fontFamily: 'monospace', fontWeight: '700' },
  logMsg: { flex: 1, fontSize: 10, color: '#c8d0e8', fontFamily: 'monospace', lineHeight: 16 },
  logErr: { color: '#ff5555' },
});
HOME_EOF

# ── 4) .github/workflows/build-apk.yml ────────────────────────
echo -e "${Y}→${N} .github/workflows/build-apk.yml"
cat > .github/workflows/build-apk.yml << 'WORKFLOW_EOF'
name: Build SentriDock APK

on:
  push:
    branches: [main, master]
  workflow_dispatch:

permissions:
  contents: write

env:
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true

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
          npx @react-native-community/cli@13 init SentriDockAndroid \
            --version 0.73.6 \
            --skip-install \
            --title "SentriDock" \
            --package-name "com.sentridock.android"

      - name: Overlay source files
        run: |
          cp -f src/App.jsx SentriDockAndroid/App.jsx
          cp -f index.js    SentriDockAndroid/index.js
          mkdir -p SentriDockAndroid/src
          cp -rf src/screens   SentriDockAndroid/src/screens
          cp -rf src/lib       SentriDockAndroid/src/lib
          cp -rf nodejs-assets SentriDockAndroid/nodejs-assets

      - name: Apply custom icon
        run: |
          pip install Pillow --break-system-packages -q
          python3 << 'PYEOF'
          from PIL import Image
          import os
          src = 'assets/icon.png'
          if not os.path.exists(src):
              print('Sem ícone customizado.')
              exit(0)
          sizes = {'mipmap-mdpi':48,'mipmap-hdpi':72,'mipmap-xhdpi':96,'mipmap-xxhdpi':144,'mipmap-xxxhdpi':192}
          base = 'SentriDockAndroid/android/app/src/main/res'
          img = Image.open(src).convert('RGBA')
          for folder,size in sizes.items():
              d = f'{base}/{folder}'
              os.makedirs(d, exist_ok=True)
              r = img.resize((size,size), Image.LANCZOS)
              r.save(f'{d}/ic_launcher.png')
              r.save(f'{d}/ic_launcher_round.png')
              print(f'OK {folder} {size}px')
          PYEOF

      - name: Merge package.json dependencies
        run: |
          node -e "
          const fs=require('fs');
          const p='SentriDockAndroid/package.json';
          const pkg=JSON.parse(fs.readFileSync(p,'utf8'));
          pkg.dependencies={...pkg.dependencies,
            'react-native-fs':'^2.20.0',
            '@react-native-async-storage/async-storage':'^1.21.0'
          };
          fs.writeFileSync(p,JSON.stringify(pkg,null,2));
          console.log('OK');
          "

      - name: Install React Native dependencies
        working-directory: SentriDockAndroid
        run: npm install

      - name: Install nodejs-mobile
        working-directory: SentriDockAndroid
        run: npm install nodejs-mobile-react-native

      - name: Patch nodejs-mobile gradle
        run: |
          node -e "
          const fs=require('fs');
          const p='SentriDockAndroid/node_modules/nodejs-mobile-react-native/android/build.gradle';
          if(!fs.existsSync(p))process.exit(0);
          let g=fs.readFileSync(p,'utf8');
          g=g.replace(/repositories\s*\{[^}]*\}/g,'repositories {\n        google()\n        mavenCentral()\n        maven { url \"https://dl.google.com/dl/android/maven2/\" }\n    }');
          g=g.replace(/com\.android\.tools\.build:gradle:[0-9.]+/g,'com.android.tools.build:gradle:7.4.2');
          fs.writeFileSync(p,g);console.log('OK');
          "

      - name: Patch app build.gradle (NDK + packaging)
        run: |
          node -e "
          const fs=require('fs');
          const p='SentriDockAndroid/android/app/build.gradle';
          let g=fs.readFileSync(p,'utf8');
          if(!g.includes('abiFilters'))g=g.replace(/defaultConfig\s*\{/,'defaultConfig {\n        ndk { abiFilters \"arm64-v8a\", \"x86_64\" }');
          if(!g.includes('packagingOptions'))g=g.replace(/buildTypes\s*\{/,'packagingOptions { pickFirst \"**/libnode.so\"; pickFirst \"**/libc++_shared.so\" }\n    buildTypes {');
          fs.writeFileSync(p,g);console.log('OK');
          "

      - name: Patch AndroidManifest (INTERNET only)
        run: |
          node -e "
          const fs=require('fs');
          const p='SentriDockAndroid/android/app/src/main/AndroidManifest.xml';
          let m=fs.readFileSync(p,'utf8');
          if(!m.includes('android.permission.INTERNET'))
            m=m.replace('<application','<uses-permission android:name=\"android.permission.INTERNET\" />\n    <application');
          fs.writeFileSync(p,m);console.log('OK');
          "

      - name: Verify manifest
        run: cat SentriDockAndroid/android/app/src/main/AndroidManifest.xml

      - name: Install Node.js backend dependencies
        working-directory: SentriDockAndroid/nodejs-assets/nodejs-project
        run: npm install

      - name: Patch signing config
        run: |
          node -e "
          const fs=require('fs');
          const p='SentriDockAndroid/android/app/build.gradle';
          let g=fs.readFileSync(p,'utf8');
          if(!g.includes('signingConfigs')){
            g=g.replace(/android\s*\{/,'android {\n    signingConfigs { release { storeFile file(MYAPP_UPLOAD_STORE_FILE); storePassword MYAPP_UPLOAD_STORE_PASSWORD; keyAlias MYAPP_UPLOAD_KEY_ALIAS; keyPassword MYAPP_UPLOAD_KEY_PASSWORD } }');
            g=g.replace(/release\s*\{/,'release {\n            signingConfig signingConfigs.release');
          }
          fs.writeFileSync(p,g);console.log('OK');
          "

      - name: Generate keystore
        working-directory: SentriDockAndroid/android/app
        run: |
          keytool -genkeypair -v \
            -keystore sentridock-release.keystore \
            -alias sentridock \
            -keyalg RSA -keysize 2048 -validity 10000 \
            -storepass sentridock123 -keypass sentridock123 \
            -dname "CN=SentriDock,O=SentriDock,C=BR"

      - name: Configure signing
        working-directory: SentriDockAndroid/android
        run: printf "\nMYAPP_UPLOAD_STORE_FILE=sentridock-release.keystore\nMYAPP_UPLOAD_KEY_ALIAS=sentridock\nMYAPP_UPLOAD_STORE_PASSWORD=sentridock123\nMYAPP_UPLOAD_KEY_PASSWORD=sentridock123\n" >> gradle.properties

      - name: Cache Gradle
        uses: actions/cache@v4
        with:
          path: |
            ~/.gradle/caches
            ~/.gradle/wrapper
          key: gradle-${{ hashFiles('SentriDockAndroid/android/**/*.gradle*') }}

      - name: Build APK
        working-directory: SentriDockAndroid/android
        run: |
          chmod +x gradlew
          ./gradlew assembleRelease --no-daemon --stacktrace

      - name: Upload APK
        if: success()
        uses: actions/upload-artifact@v4
        with:
          name: SentriDock-APK-v${{ github.run_number }}
          path: SentriDockAndroid/android/app/build/outputs/apk/release/app-release.apk
          retention-days: 30

      - name: Create Release
        if: success() && github.ref == 'refs/heads/main'
        uses: softprops/action-gh-release@v2
        with:
          tag_name: v0.1.${{ github.run_number }}
          name: SentriDock v0.1.${{ github.run_number }}
          files: SentriDockAndroid/android/app/build/outputs/apk/release/app-release.apk
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
WORKFLOW_EOF

# ── Confere o que mudou ───────────────────────────────────────
echo -e "\n${C}━━━ git status ━━━${N}"
git status --short

# ── Commita e dá push ─────────────────────────────────────────
echo -e "\n${C}━━━ commit + push ━━━${N}"
git add -A
git commit -m "fix: scan via Node fs, sem SAF" || {
  echo -e "${Y}Nada pra commitar (já estava igual?). Tentando push assim mesmo.${N}"
}
git push

echo -e "\n${G}✅ FEITO!${N}"
echo -e "${C}Acompanhe o build em:${N}"
git remote get-url origin | sed 's/\.git$//' | sed 's/$/\/actions/'
