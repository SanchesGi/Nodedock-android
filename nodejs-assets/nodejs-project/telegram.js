'use strict';

const https = require('https');

// ── Telegram Bot Manager ──────────────────────────────────────
// Usa long-polling nativo — sem dependências externas.
// Suporta envio de mensagens e recebimento de comandos via chat.

class TelegramBot {
  constructor() {
    this.token     = null;
    this.chatId    = null;
    this.enabled   = false;
    this.notify    = { start: true, stop: true, error: true, tunnel: true };
    this.offset    = 0;
    this._timer    = null;
    this.onCommand = null; // cb(cmd: string, args: string[])
    this.onLog     = null; // cb(text: string, type: 'out'|'err')
  }

  // ── Configuração ─────────────────────────────────────────────
  configure({ token, chatId, enabled, notify } = {}) {
    const wasEnabled = this.enabled;

    this.token   = (token  || '').trim();
    this.chatId  = (chatId || '').trim();
    this.enabled = !!(enabled && this.token && this.chatId);
    if (notify) this.notify = { ...this.notify, ...notify };

    if (this.enabled && !wasEnabled) {
      this._log('🤖 Telegram bot conectado.');
      this._poll();
    }
    if (!this.enabled && wasEnabled) {
      this._stopPoll();
      this._log('🤖 Telegram bot desconectado.');
    }
  }

  // ── Envio de mensagem ─────────────────────────────────────────
  async send(text) {
    if (!this.enabled) return null;
    try {
      return await this._req('sendMessage', {
        chat_id:    this.chatId,
        text,
        parse_mode: 'HTML',
      });
    } catch (e) {
      this._log(`⚠️ Telegram send falhou: ${e.message}`, 'err');
      return null;
    }
  }

  // ── Helpers de notificação ────────────────────────────────────
  notifyStart(name, port) {
    if (!this.notify.start) return;
    this.send(`🟢 <b>${name}</b> iniciado\n🔌 Porta: <code>${port}</code>`);
  }

  notifyStop(name) {
    if (!this.notify.stop) return;
    this.send(`⏹ <b>${name}</b> encerrado`);
  }

  notifyError(name, code) {
    if (!this.notify.error) return;
    this.send(`🔴 <b>${name}</b> encerrado com erro\n📟 Código: <code>${code}</code>`);
  }

  notifyTunnel(name, url) {
    if (!this.notify.tunnel) return;
    this.send(`🌐 <b>${name}</b> — túnel aberto\n🔗 <a href="${url}">${url}</a>`);
  }

  notifyTunnelClosed(name) {
    if (!this.notify.tunnel) return;
    this.send(`🔌 <b>${name}</b> — túnel fechado`);
  }

  // ── Teste de conexão ──────────────────────────────────────────
  async test() {
    if (!this.token || !this.chatId) {
      return { ok: false, error: 'Token ou Chat ID não preenchidos.' };
    }
    try {
      const res = await this._req('sendMessage', {
        chat_id:    this.chatId,
        text:       '✅ <b>NodeDock</b> conectado com sucesso!',
        parse_mode: 'HTML',
      });
      if (res?.ok) return { ok: true };
      return { ok: false, error: res?.description || 'Resposta inválida do Telegram.' };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // ── Long polling ──────────────────────────────────────────────
  _poll() {
    const tick = async () => {
      try {
        const res = await this._req('getUpdates', {
          offset:          this.offset,
          timeout:         25,
          allowed_updates: ['message'],
        });

        if (res?.result?.length) {
          for (const upd of res.result) {
            this.offset = upd.update_id + 1;
            const text = upd.message?.text;
            if (text?.startsWith('/') && this.onCommand) {
              const parts = text.trim().slice(1).split(/\s+/);
              const cmd   = parts[0].split('@')[0].toLowerCase(); // strip @botname
              this.onCommand(cmd, parts.slice(1));
            }
          }
        }
      } catch { /* ignora erros de rede no polling */ }

      if (this.enabled) this._timer = setTimeout(tick, 400);
    };

    this._timer = setTimeout(tick, 800);
  }

  _stopPoll() {
    clearTimeout(this._timer);
    this._timer = null;
  }

  // ── HTTP helper ───────────────────────────────────────────────
  _req(method, body) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body);
      const req = https.request({
        hostname: 'api.telegram.org',
        path:     `/bot${this.token}/${method}`,
        method:   'POST',
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 32_000,
      }, (res) => {
        let raw = '';
        res.on('data', d => raw += d);
        res.on('end', () => {
          try { resolve(JSON.parse(raw)); }
          catch { resolve(null); }
        });
      });
      req.on('error',   reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.write(payload);
      req.end();
    });
  }

  _log(msg, type = 'out') {
    this.onLog?.(msg, type);
  }
}

module.exports = new TelegramBot();
