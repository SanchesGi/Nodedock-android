import { NativeEventEmitter } from 'react-native';
import nodejs from 'nodejs-mobile-react-native';

let _started = false;
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

export const bridge = {
  // permissão / picker
  checkAccess:    ()        => send('check-access'),
  listDir:        (p)       => send('list-dir', { path: p }),
  // projetos
  refresh:        ()        => send('refresh'),
  startService:   (id)      => send('start-service', { id }),
  stopService:    (id)      => send('stop-service',  { id }),
  startAll:       ()        => send('start-all'),
  stopAll:        ()        => send('stop-all'),
  // tunnels
  openTunnel:     (id)      => send('open-tunnel',  { id }),
  closeTunnel:    (id)      => send('close-tunnel', { id }),
  // config
  setProjectsDir: (dir)     => send('set-projects-dir', { dir }),
  saveConfig:     (cfg)     => send('save-config', cfg),
  getConfig:      ()        => send('get-config'),
  testTelegram:   (t, c)    => send('test-telegram', { token: t, chatId: c }),
  // listeners
  onAccessState:  (cb) => on('access-state',  cb),
  onDirListing:   (cb) => on('dir-listing',   cb),
  onProjectsList: (cb) => on('projects-list', cb),
  onServiceState: (cb) => on('service-state', cb),
  onLog:          (cb) => on('log',           cb),
  onTunnelState:  (cb) => on('tunnel-state',  cb),
  onConfig:       (cb) => on('config',        cb),
  onTestResult:   (cb) => on('test-result',   cb),
};
