// ============================================================
// Sons procéduraux (Web Audio API) — aucun fichier externe.
// Fonctionne en multijoueur comme en solo. Coupable avec M.
// ============================================================
export const Sound = {
  ctx: null, master: null, muted: false, _last: {},

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.32;
    this.master.connect(this.ctx.destination);
    try { this.muted = localStorage.getItem('raw_muted') === '1'; } catch {}
    if (this.muted && this.master) this.master.gain.value = 0;
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.32;
    try { localStorage.setItem('raw_muted', m ? '1' : '0'); } catch {}
    return m;
  },
  toggle() { return this.setMuted(!this.muted); },
  _throttle(name, ms) { const t = performance.now(); if (this._last[name] && t - this._last[name] < ms) return false; this._last[name] = t; return true; },

  tone({ freq = 440, type = 'sine', dur = 0.15, gain = 0.3, slideTo = null, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master); o.start(t0); o.stop(t0 + dur + 0.03);
  },
  noise({ dur = 0.18, gain = 0.25, delay = 0, cut = 1800 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master); src.start(t0);
  },

  play(name) {
    if (!this.ctx || this.muted) return;
    this.resume();
    switch (name) {
      case 'hit': if (!this._throttle('hit', 85)) return;
        this.noise({ dur: 0.12, gain: 0.18, cut: 1400 }); this.tone({ freq: 170, type: 'square', dur: 0.08, gain: 0.1, slideTo: 80 }); break;
      case 'cast': if (!this._throttle('cast', 70)) return;
        this.tone({ freq: 520, type: 'triangle', dur: 0.22, gain: 0.16, slideTo: 900 }); break;
      case 'heal':
        this.tone({ freq: 660, type: 'sine', dur: 0.3, gain: 0.16, slideTo: 990 }); break;
      case 'levelup':
        [523, 659, 784, 1047].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.26, gain: 0.2, delay: i * 0.12 })); break;
      case 'loot':
        this.tone({ freq: 880, type: 'square', dur: 0.1, gain: 0.15 });
        this.tone({ freq: 1320, type: 'square', dur: 0.12, gain: 0.13, delay: 0.09 }); break;
      case 'kill':
        this.tone({ freq: 300, type: 'sawtooth', dur: 0.18, gain: 0.18, slideTo: 150 }); this.noise({ dur: 0.2, gain: 0.16, delay: 0.02 }); break;
      case 'death':
        this.tone({ freq: 220, type: 'sawtooth', dur: 0.7, gain: 0.22, slideTo: 55 }); break;
      case 'fort':
        [392, 523, 659, 784, 1047].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.32, gain: 0.2, delay: i * 0.1 })); break;
      case 'learn':
        [659, 988].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.26, gain: 0.18, delay: i * 0.1 })); break;
      case 'click': if (!this._throttle('click', 40)) return;
        this.tone({ freq: 330, type: 'square', dur: 0.05, gain: 0.08 }); break;
      case 'target': if (!this._throttle('target', 60)) return;
        this.tone({ freq: 720, type: 'sine', dur: 0.06, gain: 0.09 }); break;
      case 'quest':
        [587, 880].forEach((f, i) => this.tone({ freq: f, type: 'sine', dur: 0.2, gain: 0.15, delay: i * 0.1 })); break;
      case 'jump': if (!this._throttle('jump', 120)) return;
        this.tone({ freq: 300, type: 'sine', dur: 0.18, gain: 0.12, slideTo: 620 }); break;
      case 'levelup_big':
        [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.5, gain: 0.22, delay: i * 0.08 }));
        this.noise({ dur: 0.5, gain: 0.12, cut: 3000, delay: 0.1 }); break;
    }
  },
};
