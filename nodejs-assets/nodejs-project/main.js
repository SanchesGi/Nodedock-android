'use strict';

/**
 * main.js — roda dentro do nodejs-mobile-react-native.
 * É o equivalente do main.js do Electron, mas sem BrowserWindow.
 * Toda comunicação com o React Native é via rn-bridge (mensagens JSON).
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
const CONFIG_FILE   = path.join(rn.app.datadir(), 'nodedock-config.json');

// ── Config ────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  projectsDir: null,
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
        notify: { ...DEFAULT_CONFIG.telegram.notify, ...c.telegram?.notify },
      },
    };
  } catch { return JSON.parse(JSON.stringify(DEFAULT_CONFIG)); }
}

function saveConfig(cfg) {
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2)); } catch {}
}

// ── Descoberta de projetos ────────────────────────────────────
let projectsDir = null;

function discoverProjects(dir) {
  if (!dir) return [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return []; }

  const found = [];
  let port = BASE_PORT;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const subdir  = path.join(dir, entry.name);
    const pkgPath = path.join(subdir, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;

    let pkg = {};
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch { continue; }

    const candidates = [pkg.main, 'server.js', 'index.js', 'app.js'].filter(Boolean);
    let script = null;
    for (const c of candidates) {
      if (fs.existsSync(path.join(subdir, c))) { script = c; break; }
    }
    if (!script) continue;

    found.push({
      id:          entry.name.replace(/[^a-zA-Z0-9_-]/g, '_'),
      folderName:  entry.name,
      name:        pkg.name || entry.name,
      description: pkg.description || '',
      version:     pkg.version     || '',
      script, dir: subdir,
      port: port++,
    });
  }
  return found;
}

// ── Estado global ─────────────────────────────────────────────
let services = {};

function refreshDiscovery() {
  const discovered = discoverProjects(projectsDir);
  const next = {};
  for (const p of discovered) {
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
    data:  Object.values(services).map(s => ({
      id: s.id, name: s.name, description: s.description,
      version: s.version, folderName: s.folderName,
      script: s.script, port: s.port,
      status:    fs.existsSync(s.dir) ? s.status : 'missing',
      tunnelUrl: tunnels.getUrl(s.id),
      ip,
    })),
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
    pushLog(id, `❌ node_modules ausente.\n   Execute: npm install na pasta ${svc.folderName}`, 'err');
    setStatus(id, 'error'); return;
  }

  setStatus(id, 'starting');
  pushLog(id, `▶ Iniciando "${svc.name}" → porta ${svc.port}...`);

  // Usa o mesmo binário do nodejs-mobile (process.execPath)
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

// ── Telegram commands ─────────────────────────────────────────
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
    telegram.send(`<b>NodeDock — Status</b>\n\n${lines.join('\n\n')}`);
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
      `<b>NodeDock — Comandos</b>\n\n` +
      `/status — status de todos\n/list — lista projetos\n` +
      `/start &lt;nome&gt; — inicia\n/stop &lt;nome&gt; — para\n` +
      `/tunnel &lt;nome&gt; — abre/fecha túnel\n/help — ajuda`
    );
    return;
  }
  telegram.send(`❓ Comando desconhecido: <code>/${cmd}</code>\nUse /help.`);
}

// ── Init ──────────────────────────────────────────────────────
const cfg = loadConfig();
projectsDir = cfg.projectsDir;

telegram.configure(cfg.telegram);
telegram.onLog     = (text, type) => pushLog('__system__', text, type);
telegram.onCommand = (cmd, args)  => handleTelegramCommand(cmd, args);

// Sinaliza para o React Native que o Node.js está pronto
rn.channel.send(JSON.stringify({ event: 'ready', data: {} }));

// ── Recebe mensagens do React Native ──────────────────────────
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

    case 'set-projects-dir':
      projectsDir = data.dir;
      const newCfg = { ...loadConfig(), projectsDir: data.dir };
      saveConfig(newCfg);
      sendProjectsList();
      break;

    case 'save-config': {
      const cur = loadConfig();
      const merged = { ...cur, ...data, telegram: { ...cur.telegram, ...data.telegram, notify: { ...cur.telegram.notify, ...data.telegram?.notify } } };
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
