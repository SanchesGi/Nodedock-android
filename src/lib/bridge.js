/**
 * bridge.js
 * Comunicação entre React Native e o thread Node.js (nodejs-mobile-react-native).
 * Expõe uma API simples baseada em eventos para os screens usarem.
 */

import { NativeEventEmitter } from 'react-native';
import nodejs from 'nodejs-mobile-react-native';

let _started    = false;
const emitter   = new NativeEventEmitter(nodejs.channel);
const listeners = {}; // event → [callback, ...]

// ── Inicializa o thread Node.js ───────────────────────────────
export async function initBridge() {
  if (_started) return;
  _started = true;

  // Redireciona todas as mensagens do Node.js para os listeners registrados
  emitter.addListener('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const cbs = listeners[msg.event] || [];
    cbs.forEach(cb => cb(msg.data));
  });

  // Inicia o projeto Node.js
  nodejs.start('main.js');

  // Aguarda o Node.js estar pronto
  await new Promise(resolve => {
    const unsub = on('ready', () => { unsub(); resolve(); });
    // Timeout de segurança: se não responder em 8s, continua mesmo assim
    setTimeout(resolve, 8000);
  });
}

// ── Envia mensagem para o Node.js ─────────────────────────────
export function send(event, data = {}) {
  nodejs.channel.send(JSON.stringify({ event, data }));
}

// ── Registra listener de evento ───────────────────────────────
export function on(event, cb) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(cb);
  // Retorna função de remoção
  return () => {
    listeners[event] = (listeners[event] || []).filter(x => x !== cb);
  };
}

// ── Atalhos para comandos comuns ──────────────────────────────
export const bridge = {
  // Projetos
  refresh:      ()         => send('refresh'),
  startService: (id)       => send('start-service', { id }),
  stopService:  (id)       => send('stop-service',  { id }),
  startAll:     ()         => send('start-all'),
  stopAll:      ()         => send('stop-all'),

  // Túneis
  openTunnel:   (id)       => send('open-tunnel',  { id }),
  closeTunnel:  (id)       => send('close-tunnel', { id }),

  // Config
  setProjectsDir: (dir)    => send('set-projects-dir', { dir }),
  saveConfig:     (cfg)    => send('save-config', cfg),
  getConfig:      ()       => send('get-config'),
  testTelegram:   (token, chatId) => send('test-telegram', { token, chatId }),

  // Listeners
  onProjectsList:  (cb) => on('projects-list',  cb),
  onServiceState:  (cb) => on('service-state',  cb),
  onLog:           (cb) => on('log',            cb),
  onTunnelState:   (cb) => on('tunnel-state',   cb),
  onConfig:        (cb) => on('config',         cb),
  onTestResult:    (cb) => on('test-result',    cb),
};
