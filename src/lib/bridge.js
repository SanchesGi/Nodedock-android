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

export function send(event, data = {}) {
  nodejs.channel.send(JSON.stringify({ event, data }));
}

export function on(event, cb) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(cb);
  return () => { listeners[event] = (listeners[event] || []).filter(x => x !== cb); };
}

// Converte qualquer URI/path para caminho absoluto real
export function resolveRealPath(uri) {
  if (!uri) return null;

  const str = decodeURIComponent(String(uri));

  // Já é caminho absoluto
  if (str.startsWith('/storage') || str.startsWith('/sdcard')) return str;

  // content://com.android.externalstorage.documents/tree/primary:Pasta/Sub
  const primaryMatch = str.match(/primary:([^/\s]*)/);
  if (primaryMatch) {
    const rel = primaryMatch[1].replace(/:/g, '/');
    return rel ? `/storage/emulated/0/${rel}` : '/storage/emulated/0';
  }

  // content://...tree/...document/primary:Pasta
  const docMatch = str.match(/document\/primary:(.+)/);
  if (docMatch) {
    return `/storage/emulated/0/${docMatch[1].replace(/:/g,'/')}`;
  }

  // Último recurso: extrai qualquer /storage/... do URI
  const storageMatch = str.match(/\/storage\/[^\s"']+/);
  if (storageMatch) return storageMatch[0];

  return null;
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

// Expõe send direto para o HomeScreen usar
bridge.send = send;
