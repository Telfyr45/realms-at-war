// Connexion WebSocket au serveur (URL configurable)
// Priorité : ?server=... dans l'URL > window.RAW_CONFIG.server > même origine.
function serverUrl() {
  const fromQuery = new URLSearchParams(location.search).get('server');
  let cfg = (fromQuery || (window.RAW_CONFIG && window.RAW_CONFIG.server) || '').trim();
  const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
  if (!cfg) return `${wsProto}://${location.host}`;
  if (/^https?:\/\//i.test(cfg)) return cfg.replace(/^http/i, 'ws'); // http(s):// -> ws(s)://
  if (/^wss?:\/\//i.test(cfg)) return cfg;
  return `${wsProto}://${cfg.replace(/\/+$/, '')}`;
}

export class Net {
  constructor() {
    this.handlers = {};
    this.ws = new WebSocket(serverUrl());
    this.ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      (this.handlers[m.type] || []).forEach((h) => h(m));
    };
    this.ready = new Promise((res) => { this.ws.onopen = res; });
    this.ws.onclose = () => {
      document.body.innerHTML = '<div style="display:flex;height:100vh;align-items:center;justify-content:center;font-size:20px;color:#ff7d6b">Connexion perdue — relancez le serveur puis rechargez la page.</div>';
    };
  }
  on(type, fn) { (this.handlers[type] ||= []).push(fn); }
  send(type, data = {}) {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify({ type, ...data }));
  }
}
