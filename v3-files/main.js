'use strict';
/**
 * main.js — Node.js dentro do nodejs-mobile.
 * Escaneia projetos em paths REAIS de filesystem (/storage/emulated/0/...).
 * Requer MANAGE_EXTERNAL_STORAGE concedido pelo usuário.
 */

const { execPath } = process;
const { spawn }    = require('child_process');
const path         = require('path');
const fs           = require('fs');
const os           = require('os');

const rn        = require('rn-bridge');
const telegram  = require('./telegram');
const tunnels   = require('./tunnels');

const BASE_PORT   = 3001;
const CONFIG_FILE = path.join(rn.app.datadir(), 'sentridock-config.json');

const DEFAULT_CONFIG = {
  projectsDir: null,
  telegram: {
    enabled: false, token: '', chatId: '',
    notify: { start: true, stop: true, error: true, tunnel: true },
  },
};

function loadConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return {
      ...DEFAULT_CONFIG, ...c,
      telegram: { ...DEFAULT_CONFIG.telegram, ...c.telegram,
        notify: { ...DEFAULT_CONFIG.telegram.notify, ...(c.telegram?.notify || {}) } },
    };
  } catch { return JSON.parse(JSON.stringify(DEFAULT_CONFIG)); }
}

function saveConfig(cfg) {
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2)); } catch {}
}

let projectsDir = null;
let services = {};
let lastDebug = '';

// ── Permissão ────────────────────────────────────────────────
function checkAccess() {
  try {
    const items = fs.readdirSync('/storage/emulated/0');
    return { ok: true, count: items.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Picker de pasta (via fs) ────────────────────────────────
function listDir(p) {
  const safePath = p && p.startsWith('/') ? p : '/storage/emulated/0';
  const items = fs.readdirSync(safePath, { withFileTypes: true });
  return {
    path: safePath,
    parent: safePath === '/storage/emulated/0' ? null : path.dirname(safePath),
    items: items
      .filter(it => it.isDirectory() && !it.name.startsWith('.'))
      .map(it => {
        const full = path.join(safePath, it.name);
        let isProject = false;
        try { isProject = fs.existsSync(path.join(full, 'package.json')); } catch {}
        return { name: it.name, path: full, isProject };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ── Descoberta de projetos ──────────────────────────────────
function readProject(dir, folderName, port) {
  let pkg = {};
  try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); }
  catch { return null; }
  const cands = [pkg.main, 'server.js', 'index.js', 'app.js'].filter(Boolean);
  let script = null;
  for (const c of cands) {
    try { if (fs.existsSync(path.join(dir, c))) { script = c; break; } } catch {}
  }
  if (!script) return null;
  return {
    id: folderName.replace(/[^a-zA-Z0-9_-]/g, '_'),
    folderName, name: pkg.name || folderName,
    description: pkg.description || '', version: pkg.version || '',
    script, dir, port,
  };
}

function discoverProjects(dir) {
  const debug = [`📁 ${dir}`];
  if (!dir || !fs.existsSync(dir)) {
    debug.push('❌ Pasta não existe ou sem permissão.');
    return { found: [], debug: debug.join('\n') };
  }

  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); debug.push(`${entries.length} item(s)`); }
  catch (e) { debug.push(`❌ ${e.message}`); return { found: [], debug: debug.join('\n') }; }

  const found = [];
  let port = BASE_PORT;

  // A própria pasta selecionada pode ser um projeto
  if (entries.some(e => e.isFile() && e.name === 'package.json')) {
    const proj = readProject(dir, path.basename(dir) || 'projeto', port);
    if (proj) { found.push(proj); debug.push(`✅ ${proj.name} (raiz)`); port++; }
  }

  // E também varre subpastas
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const sub = path.join(dir, entry.name);
    let hasPkg = false;
    try { hasPkg = fs.existsSync(path.join(sub, 'package.json')); } catch {}
    if (!hasPkg) { debug.push(`  ${entry.name}/ — sem package.json`); continue; }
    const proj = readProject(sub, entry.name, port);
    if (proj) { found.push(proj); debug.push(`  ✅ ${entry.name}/ → ${proj.script}`); port++; }
    else      { debug.push(`  ${entry.name}/ — sem script válido`); }
  }
  debug.push(`Total: ${found.length}`);
  return { found, debug: debug.join('\n') };
}

function refreshDiscovery() {
  const dir = projectsDir;
  if (!dir) { lastDebug = 'Nenhuma pasta selecionada.'; return; }
  const { found, debug } = discoverProjects(dir);
  lastDebug = debug;
  const next = {};
  for (const p of found) {
    const ex = services[p.id];
    next[p.id] = { ...p, proc: ex?.proc ?? null, status: ex?.status ?? 'stopped' };
  }
  for (const [id, svc] of Object.entries(services))
    if (!next[id] && svc.proc) svc.proc.kill('SIGTERM');
  services = next;
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

function sendProjectsList() {
  refreshDiscovery();
  const ip = getLocalIP();
  rn.channel.send(JSON.stringify({
    event: 'projects-list',
    data: {
      projects: Object.values(services).map(s => ({
        id: s.id, name: s.name, description: s.description, version: s.version,
        folderName: s.folderName, script: s.script, port: s.port,
        status: fs.existsSync(s.dir) ? s.status : 'missing',
        tunnelUrl: tunnels.getUrl(s.id), ip,
      })),
      dir: projectsDir,
      debug: lastDebug,
    },
  }));
}

function sendServiceState(id) {
  const svc = services[id]; if (!svc) return;
  rn.channel.send(JSON.stringify({ event: 'service-state',
    data: { id: svc.id, status: svc.status, port: svc.port, tunnelUrl: tunnels.getUrl(id) } }));
}
function pushLog(id, text, type='out') {
  rn.channel.send(JSON.stringify({ event: 'log', data: { id, text, type } }));
}
function setStatus(id, status) {
  if (!services[id]) return;
  services[id].status = status;
  sendServiceState(id);
}

// ── Start / Stop ────────────────────────────────────────────
function startService(id) {
  const svc = services[id]; if (!svc || svc.proc) return;
  if (!fs.existsSync(svc.dir)) {
    pushLog(id, `❌ Pasta não encontrada: ${svc.dir}`, 'err');
    setStatus(id, 'error'); return;
  }
  if (!fs.existsSync(path.join(svc.dir, svc.script))) {
    pushLog(id, `❌ Script não encontrado: ${svc.script}`, 'err');
    setStatus(id, 'error'); return;
  }
  if (!fs.existsSync(path.join(svc.dir, 'node_modules'))) {
    pushLog(id, `❌ node_modules ausente em ${svc.folderName}/.\n   No PC: rode "npm install" e copie a pasta inteira pro celular.`, 'err');
    setStatus(id, 'error'); return;
  }

  setStatus(id, 'starting');
  pushLog(id, `▶ Iniciando "${svc.name}" → porta ${svc.port}...`);

  const proc = spawn(execPath, [svc.script], {
    cwd: svc.dir,
    env: { ...process.env, PORT: String(svc.port), HOME: rn.app.datadir() },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  svc.proc = proc;
  proc.stdout.on('data', d => pushLog(id, d.toString().trimEnd(), 'out'));
  proc.stderr.on('data', d => pushLog(id, d.toString().trimEnd(), 'err'));
  const timer = setTimeout(() => {
    if (svc.proc === proc) { setStatus(id, 'running'); telegram.notifyStart(svc.name, svc.port); }
  }, 2000);
  proc.on('close', (code) => {
    clearTimeout(timer); svc.proc = null;
    if (code === 0 || code === null) { pushLog(id, '⏹ Encerrado.'); setStatus(id, 'stopped'); telegram.notifyStop(svc.name); }
    else { pushLog(id, `❌ Código ${code}`, 'err'); setStatus(id, 'error'); telegram.notifyError(svc.name, code); }
  });
  proc.on('error', (err) => {
    clearTimeout(timer); svc.proc = null;
    pushLog(id, `❌ ${err.message}`, 'err'); setStatus(id, 'error');
    telegram.notifyError(svc.name, err.message);
  });
}

function stopService(id) {
  const svc = services[id]; if (!svc?.proc) return;
  pushLog(id, `⏹ Encerrando "${svc.name}"...`);
  svc.proc.kill('SIGTERM');
  setTimeout(() => { if (svc.proc) svc.proc.kill('SIGKILL'); }, 3000);
}

// ── Tunnels ─────────────────────────────────────────────────
async function openTunnel(id) {
  const svc = services[id]; if (!svc) return;
  pushLog(id, `🌐 Abrindo túnel...`);
  rn.channel.send(JSON.stringify({ event: 'tunnel-state', data: { id, status: 'opening' } }));
  try {
    const url = await tunnels.open(id, svc.port);
    pushLog(id, `🌐 ${url}`);
    rn.channel.send(JSON.stringify({ event: 'tunnel-state', data: { id, status: 'open', url } }));
    telegram.notifyTunnel(svc.name, url);
  } catch (e) {
    pushLog(id, `❌ Túnel: ${e.message}`, 'err');
    rn.channel.send(JSON.stringify({ event: 'tunnel-state', data: { id, status: 'error' } }));
  }
}
function closeTunnel(id) {
  tunnels.close(id);
  pushLog(id, `🔌 Túnel fechado.`);
  rn.channel.send(JSON.stringify({ event: 'tunnel-state', data: { id, status: 'closed' } }));
  if (services[id]) telegram.notifyTunnelClosed(services[id].name);
}

// ── Telegram (igual antes, resumido) ───────────────────────
function findProject(q) {
  const lq = q.toLowerCase();
  return Object.values(services).find(s =>
    s.id.toLowerCase()===lq || s.name.toLowerCase()===lq || s.folderName.toLowerCase()===lq);
}
async function handleTelegramCommand(cmd, args) {
  const list = Object.values(services);
  const ico = { running:'🟢', stopped:'⏹', error:'🔴', starting:'🔄', missing:'⚠️' };
  if (cmd === 'status') {
    if (!list.length) return telegram.send('📦 Nenhum projeto.');
    return telegram.send(`<b>SentriDock</b>\n\n${list.map(s => {
      const t = tunnels.getUrl(s.id);
      return `${ico[s.status]||'❓'} <b>${s.name}</b> :${s.port}${t?`\n  🌐 ${t}`:''}`;
    }).join('\n\n')}`);
  }
  if (cmd === 'list') return telegram.send(`<b>Projetos:</b>\n${list.map((s,i)=>`${i+1}. <code>${s.id}</code>`).join('\n')||'(nenhum)'}`);
  if (cmd === 'start' && args.length) { const s=findProject(args[0]); if(!s) return telegram.send(`❓ ${args[0]}`); startService(s.id); return telegram.send(`▶ ${s.name}`); }
  if (cmd === 'stop' && args.length)  { const s=findProject(args[0]); if(!s) return telegram.send(`❓ ${args[0]}`); stopService(s.id);  return telegram.send(`⏹ ${s.name}`); }
  if (cmd === 'tunnel' && args.length){ const s=findProject(args[0]); if(!s) return telegram.send(`❓ ${args[0]}`); tunnels.isOpen(s.id)?closeTunnel(s.id):openTunnel(s.id); return; }
  if (cmd === 'help') return telegram.send(`/status /list /start &lt;n&gt; /stop &lt;n&gt; /tunnel &lt;n&gt;`);
  return telegram.send(`❓ /${cmd}`);
}

// ── Init ────────────────────────────────────────────────────
const cfg = loadConfig();
projectsDir = cfg.projectsDir;
telegram.configure(cfg.telegram);
telegram.onLog     = (text, type) => pushLog('__system__', text, type);
telegram.onCommand = (cmd, args)  => handleTelegramCommand(cmd, args);

rn.channel.send(JSON.stringify({ event: 'ready', data: {} }));

rn.channel.on('message', (raw) => {
  let msg; try { msg = JSON.parse(raw); } catch { return; }
  const { event, data } = msg;
  switch (event) {
    case 'check-access':
      rn.channel.send(JSON.stringify({ event: 'access-state', data: checkAccess() }));
      break;
    case 'list-dir':
      try {
        const result = listDir(data?.path);
        rn.channel.send(JSON.stringify({ event: 'dir-listing', data: result }));
      } catch (e) {
        rn.channel.send(JSON.stringify({ event: 'dir-listing',
          data: { path: data?.path || '/', items: [], error: e.message } }));
      }
      break;
    case 'refresh': sendProjectsList(); break;
    case 'start-service': startService(data.id); break;
    case 'stop-service':  stopService(data.id); break;
    case 'start-all':     Object.keys(services).forEach(startService); break;
    case 'stop-all':      Object.keys(services).forEach(stopService); break;
    case 'open-tunnel':   openTunnel(data.id); break;
    case 'close-tunnel':  closeTunnel(data.id); break;
    case 'set-projects-dir': {
      if (typeof data.dir === 'string' && data.dir.startsWith('/')) {
        projectsDir = data.dir;
        saveConfig({ ...loadConfig(), projectsDir });
        sendProjectsList();
      }
      break;
    }
    case 'save-config': {
      const cur = loadConfig();
      const merged = { ...cur, ...data, telegram: { ...cur.telegram, ...data.telegram, notify: { ...cur.telegram.notify, ...(data.telegram?.notify || {}) } } };
      saveConfig(merged); telegram.configure(merged.telegram);
      rn.channel.send(JSON.stringify({ event: 'config', data: merged }));
      break;
    }
    case 'get-config': rn.channel.send(JSON.stringify({ event: 'config', data: loadConfig() })); break;
    case 'test-telegram': (async () => {
      const prev = { token: telegram.token, chatId: telegram.chatId };
      telegram.token = data.token?.trim(); telegram.chatId = data.chatId?.trim();
      const result = await telegram.test();
      telegram.token = prev.token; telegram.chatId = prev.chatId;
      rn.channel.send(JSON.stringify({ event: 'test-result', data: result }));
    })(); break;
  }
});
