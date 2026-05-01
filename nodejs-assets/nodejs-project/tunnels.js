'use strict';

// ── Tunnel Manager ────────────────────────────────────────────
// Gerencia túneis públicos usando localtunnel (npm).
// Cada projeto pode ter um túnel aberto ao mesmo tempo.

const active = new Map(); // id → { tunnel, url }

// ── Abrir túnel ───────────────────────────────────────────────
async function open(id, port) {
  if (active.has(id)) return active.get(id).url;

  let localtunnel;
  try {
    localtunnel = require('localtunnel');
  } catch {
    throw new Error(
      'Pacote "localtunnel" não encontrado.\nExecute: npm install na pasta do NodeDock.'
    );
  }

  const tunnel = await localtunnel({ port });
  active.set(id, { tunnel, url: tunnel.url });

  tunnel.on('close', () => {
    active.delete(id);
  });

  tunnel.on('error', () => {
    active.delete(id);
  });

  return tunnel.url;
}

// ── Fechar túnel ──────────────────────────────────────────────
function close(id) {
  const entry = active.get(id);
  if (!entry) return;
  try { entry.tunnel.close(); } catch {}
  active.delete(id);
}

function closeAll() {
  for (const id of active.keys()) close(id);
}

// ── Status ────────────────────────────────────────────────────
function getUrl(id)  { return active.get(id)?.url ?? null; }
function isOpen(id)  { return active.has(id); }
function getAll()    { return [...active.entries()].map(([id, e]) => ({ id, url: e.url })); }

module.exports = { open, close, closeAll, getUrl, isOpen, getAll };
