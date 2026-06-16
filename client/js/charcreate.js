// Écran de création de personnage : royaume → classe → race → nom
import { REALMS, classesOfRealm, ARCHETYPES, MAG_LABELS } from '/shared/data.js';

export function charCreate(onDone) {
  const $ = (id) => document.getElementById(id);
  const state = { realm: null, cls: null, race: null };

  const realmsEl = $('cc-realms'), classesEl = $('cc-classes'), racesEl = $('cc-races');
  const detailEl = $('cc-detail'), goBtn = $('cc-go'), nameEl = $('cc-name');

  function check() {
    goBtn.disabled = !(state.realm && state.cls && state.race && nameEl.value.trim().length >= 2);
  }
  nameEl.addEventListener('input', check);

  // --- royaumes ---
  for (const r of Object.values(REALMS)) {
    const d = document.createElement('div');
    d.className = 'cc-card realm-card';
    d.style.setProperty('--rc', r.colorCss);
    d.innerHTML = `<div class="t">${r.name}</div><div class="s">${r.capital} — ${r.desc}</div>`;
    d.onclick = () => {
      state.realm = r.id; state.cls = null; state.race = null;
      [...realmsEl.children].forEach((c) => c.classList.remove('sel'));
      d.classList.add('sel');
      renderClasses(); racesEl.innerHTML = ''; detailEl.innerHTML = ''; check();
    };
    realmsEl.appendChild(d);
  }

  function renderClasses() {
    classesEl.innerHTML = '';
    for (const c of classesOfRealm(state.realm)) {
      const d = document.createElement('div');
      d.className = 'cc-card';
      d.innerHTML = `<div class="t">${c.name}</div><div class="s">${ARCHETYPES[c.arch].label}</div>`;
      d.onclick = () => {
        state.cls = c.id; state.race = null;
        [...classesEl.children].forEach((x) => x.classList.remove('sel'));
        d.classList.add('sel');
        renderDetail(c); renderRaces(c); check();
      };
      classesEl.appendChild(d);
    }
  }

  function renderDetail(c) {
    const st = c.stats;
    const mag = c.magStat ? ` · <b>${MAG_LABELS[c.magStat]}</b> ${st.mag}` : '';
    detailEl.innerHTML =
      `<b>${c.name}</b> — ${ARCHETYPES[c.arch].label} · Arme : ${c.weapon}<br/>` +
      `Force ${st.str} · Constitution ${st.con} · Dextérité ${st.dex} · Vivacité ${st.qui}${mag}<br/>` +
      `Compétences : ${c.sk.join(' · ')}`;
  }

  function renderRaces(c) {
    racesEl.innerHTML = '';
    for (const r of c.races) {
      const d = document.createElement('div');
      d.className = 'cc-card';
      d.innerHTML = `<div class="t">${r}</div>`;
      d.onclick = () => {
        state.race = r;
        [...racesEl.children].forEach((x) => x.classList.remove('sel'));
        d.classList.add('sel'); check();
      };
      racesEl.appendChild(d);
    }
  }

  goBtn.onclick = () => {
    onDone({ realm: state.realm, cls: state.cls, race: state.race, name: nameEl.value.trim() });
    document.getElementById('charcreate').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
  };
}
