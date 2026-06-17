// ============================================================
// Disposition de l'interface : les panneaux ne sont déplaçables /
// redimensionnables QU'EN mode édition (déverrouillé via le menu Échap).
// En quittant le mode édition, tout est verrouillé tel que placé.
// La disposition est mémorisée (localStorage).
// ============================================================
const PANELS = ['selfframe', 'targetframe', 'fortframe', 'skillbar', 'grouppanel', 'log', 'questlog', 'inventory', 'chatwrap'];
const KEY = 'raw_ui';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const save = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} };

let editMode = false;
let menuEl = null, bannerEl = null;
let onReset = null;

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

export function isEditMode() { return editMode; }

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
      if (!editMode) return; // verrouillé hors mode édition
      const r = el.getBoundingClientRect();
      // coin bas-droit = redimensionnement natif (on laisse faire, on persiste à la fin)
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
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); persist(el, id, state); };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    });
  }
  buildMenu();
}

export function resetUI() {
  try { localStorage.removeItem(KEY); } catch {}
  for (const id of PANELS) {
    const el = document.getElementById(id);
    if (!el) continue;
    for (const p of ['left', 'top', 'right', 'bottom', 'width', 'height', 'transform']) el.style[p] = '';
  }
}

export function startEdit() {
  editMode = true;
  document.body.classList.add('ui-editing');
  if (menuEl) menuEl.classList.add('hidden');
  if (bannerEl) bannerEl.classList.remove('hidden');
}
export function endEdit() {
  editMode = false;
  document.body.classList.remove('ui-editing');
  if (bannerEl) bannerEl.classList.add('hidden');
}
export function toggleMenu(force) {
  if (!menuEl) return;
  const show = force != null ? force : menuEl.classList.contains('hidden');
  menuEl.classList.toggle('hidden', !show);
}
export function isMenuOpen() { return menuEl && !menuEl.classList.contains('hidden'); }

// touche Échap : ferme le menu/quitte l'édition, sinon ouvre le menu
export function onEscape() {
  if (editMode) { endEdit(); return true; }
  if (isMenuOpen()) { toggleMenu(false); return true; }
  toggleMenu(true); return true;
}
export function setResetHandler(fn) { onReset = fn; }

function buildMenu() {
  if (menuEl) return;
  menuEl = document.createElement('div');
  menuEl.id = 'gamemenu'; menuEl.className = 'hidden';
  menuEl.innerHTML =
    '<div class="gm-panel">' +
    '<h2>Menu</h2>' +
    '<button id="gm-edit" class="gm-btn">✋ Éditer l\'interface</button>' +
    '<button id="gm-reset" class="gm-btn">↺ Réinitialiser l\'interface</button>' +
    '<button id="gm-close" class="gm-btn gm-close">Reprendre</button>' +
    '<p class="gm-tip">Astuce : Échap ouvre/ferme ce menu.</p>' +
    '</div>';
  document.body.appendChild(menuEl);
  menuEl.addEventListener('pointerdown', (e) => { if (e.target === menuEl) toggleMenu(false); });

  bannerEl = document.createElement('div');
  bannerEl.id = 'ui-edit-banner'; bannerEl.className = 'hidden';
  bannerEl.innerHTML = '<span>✋ Mode édition — déplacez et redimensionnez les panneaux (coin bas-droit). La fenêtre de chat est déplaçable.</span><button id="ui-edit-done">🔒 Terminer</button>';
  document.body.appendChild(bannerEl);

  document.getElementById('gm-edit').onclick = () => startEdit();
  document.getElementById('gm-reset').onclick = () => { resetUI(); if (onReset) onReset(); };
  document.getElementById('gm-close').onclick = () => toggleMenu(false);
  document.getElementById('ui-edit-done').onclick = () => endEdit();
}
