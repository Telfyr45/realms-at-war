// ============================================================
// Rend les panneaux du HUD déplaçables (glisser) et redimensionnables
// (poignée en bas à droite). La disposition est mémorisée (localStorage).
// ============================================================
const PANELS = ['selfframe', 'targetframe', 'fortframe', 'skillbar', 'grouppanel', 'log', 'questlog', 'inventory'];
const KEY = 'raw_ui';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const save = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} };

function persist(el, id, state) {
  const r = el.getBoundingClientRect();
  state[id] = { l: Math.round(r.left), t: Math.round(r.top), w: el.offsetWidth, h: el.offsetHeight };
  save(state);
}

function setFixed(el) {
  const r = el.getBoundingClientRect();
  el.style.left = r.left + 'px'; el.style.top = r.top + 'px';
  el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.transform = 'none';
}

export function setupMovableUI() {
  const state = load();
  for (const id of PANELS) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.classList.add('movable');
    const s = state[id];
    if (s) {
      el.style.left = s.l + 'px'; el.style.top = s.t + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.transform = 'none';
      if (s.w) el.style.width = s.w + 'px';
      if (s.h) el.style.height = s.h + 'px';
    }
    el.addEventListener('pointerdown', (e) => {
      // ne pas interférer avec les éléments interactifs
      if (e.target.closest('button,input,.skill,.inv-item,.inv-slot,.cs-card,.dbtn')) return;
      const r = el.getBoundingClientRect();
      // coin bas-droit = redimensionnement natif : on laisse faire, on persiste à la fin
      if (e.clientX > r.right - 22 && e.clientY > r.bottom - 22) {
        const onUp = () => { removeEventListener('pointerup', onUp); persist(el, id, state); };
        addEventListener('pointerup', onUp);
        return;
      }
      e.preventDefault(); e.stopPropagation();
      setFixed(el);
      const ox = e.clientX - r.left, oy = e.clientY - r.top;
      const move = (ev) => {
        el.style.left = Math.max(0, Math.min(innerWidth - 40, ev.clientX - ox)) + 'px';
        el.style.top = Math.max(0, Math.min(innerHeight - 24, ev.clientY - oy)) + 'px';
      };
      const up = () => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up);
        persist(el, id, state);
      };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    });
  }
}

export function resetUI() {
  try { localStorage.removeItem(KEY); } catch {}
  for (const id of PANELS) {
    const el = document.getElementById(id);
    if (!el) continue;
    for (const p of ['left', 'top', 'right', 'bottom', 'width', 'height', 'transform']) el.style[p] = '';
  }
}
