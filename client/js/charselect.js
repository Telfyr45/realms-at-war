// ============================================================
// Roster local (localStorage) + écran de sélection des personnages
// Fonctionne à l'identique en multijoueur et en solo : le roster
// liste les personnages créés sur ce navigateur ; sélectionner un
// personnage envoie CREATE au serveur, qui restaure la sauvegarde
// (même nom + royaume + classe).
// ============================================================
import { REALMS, classById, ARCHETYPES } from '/shared/data.js';

const ROSTER_KEY = 'raw_roster';
const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const Roster = {
  key(c) { return `${(c.name || '').toLowerCase()}|${c.realm}|${c.cls}`; },
  list() {
    try { return JSON.parse(localStorage.getItem(ROSTER_KEY) || '[]'); } catch { return []; }
  },
  _write(arr) {
    try { localStorage.setItem(ROSTER_KEY, JSON.stringify(arr)); } catch {}
  },
  upsert(c) {
    const arr = this.list();
    const k = this.key(c);
    const i = arr.findIndex((x) => this.key(x) === k);
    const entry = { ...(i >= 0 ? arr[i] : {}), name: c.name, realm: c.realm, cls: c.cls, race: c.race, ts: Date.now() };
    if (i >= 0) arr[i] = entry; else arr.push(entry);
    this._write(arr);
    return entry;
  },
  update(name, realm, cls, patch) {
    const arr = this.list();
    const k = `${(name || '').toLowerCase()}|${realm}|${cls}`;
    const i = arr.findIndex((x) => this.key(x) === k);
    if (i >= 0) { arr[i] = { ...arr[i], ...patch, ts: Date.now() }; this._write(arr); }
  },
  remove(c) {
    const k = this.key(c);
    this._write(this.list().filter((x) => this.key(x) !== k));
  },
  // Migration : si le roster est vide mais que des sauvegardes solo existent,
  // on reconstruit le roster à partir de localStorage 'raw_saves'.
  migrateFromSaves() {
    if (this.list().length) return;
    let saves;
    try { saves = JSON.parse(localStorage.getItem('raw_saves') || '{}'); } catch { return; }
    const arr = [];
    for (const [key, sv] of Object.entries(saves)) {
      const [name, realm, cls] = key.split('|');
      const c = classById(cls);
      if (!name || !REALMS[realm] || !c) continue;
      arr.push({ name: titleCase(name), realm, cls, race: (c.races || [])[0], lvl: sv.lvl || 1, gold: sv.gold || 0, ts: sv.ts || Date.now() });
    }
    if (arr.length) this._write(arr);
  },
};

// Affiche l'écran de sélection. Renvoie false si aucun personnage (l'appelant
// bascule alors sur la création).
export function charSelect({ onPlay, onCreate }) {
  Roster.migrateFromSaves();
  const chars = Roster.list();
  if (!chars.length) return false;

  const screen = document.getElementById('charselect');
  const listEl = document.getElementById('cs-list');
  if (!screen || !listEl) return false;

  function render() {
    const list = Roster.list().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    if (!list.length) { screen.classList.add('hidden'); onCreate(); return; }
    listEl.innerHTML = '';
    for (const ch of list) {
      const cls = classById(ch.cls);
      const realm = REALMS[ch.realm];
      if (!cls || !realm) continue;
      const card = document.createElement('div');
      card.className = 'cs-card';
      card.style.setProperty('--rc', realm.colorCss);
      card.innerHTML =
        `<button class="cs-del" title="Supprimer ce personnage">✕</button>` +
        `<div class="cs-name">${ch.name}</div>` +
        `<div class="cs-line"><span class="cs-realm">${realm.name}</span> · ${cls.name}</div>` +
        `<div class="cs-sub">${ARCHETYPES[cls.arch].label} · ${ch.race || cls.races[0]}</div>` +
        `<div class="cs-stats">Niveau ${ch.lvl || 1}${ch.gold != null ? ` · ${ch.gold} or` : ''}</div>` +
        `<div class="cs-play">▶ Jouer</div>`;
      card.querySelector('.cs-del').onclick = (e) => {
        e.stopPropagation();
        if (confirm(`Supprimer ${ch.name} de cette liste ?`)) { Roster.remove(ch); render(); }
      };
      card.onclick = () => {
        screen.classList.add('hidden');
        onPlay({ name: ch.name, realm: ch.realm, cls: ch.cls, race: ch.race || cls.races[0] });
      };
      listEl.appendChild(card);
    }
  }

  const newBtn = document.getElementById('cs-new');
  if (newBtn) newBtn.onclick = () => { screen.classList.add('hidden'); onCreate(); };

  render();
  screen.classList.remove('hidden');
  return true;
}
