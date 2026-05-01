import { NativeEventEmitter, Platform } from 'react-native';
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

// Converte URI content:// para caminho real /storage/...
export function resolveRealPath(uri) {
  if (!uri) return null;
  // Já é caminho real
  if (uri.startsWith('/')) return uri;
  // content://com.android.externalstorage.documents/tree/primary:Pasta
  if (uri.includes('primary:')) {
    const part = uri.split('primary:')[1];
    const decoded = decodeURIComponent(part || '').split('/document/')[0];
    return `/storage/emulated/0/${decoded}`;
  }
  // Tenta extrair caminho direto
  try {
    const decoded = decodeURIComponent(uri);
    const match = decoded.match(/\/storage\/[^"'\s]+/);
    if (match) return match[0];
  } catch {}
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
