// HUD : barres, journal, quêtes, dialogues PNJ, barre de compétences,
// entraîneur (apprentissage), armurier et inventaire/équipement.
import { ARCHETYPES, classById, QUESTS, REALMS, MSG, EQUIP_SLOTS, SLOT_LABELS, rarityById } from '/shared/data.js';
import { Sound } from './sound.js';

const $ = (id) => document.getElementById(id);

const TYPE_LABEL = {
  melee: 'Mêlée', ranged: 'Tir', spell: 'Sort', dot: 'Poison/Feu', aoe: 'Zone',
  stun: 'Étourdissement', root: 'Immobilisation', mez: 'Hypnose', heal: 'Soin',
  groupheal: 'Soin de groupe', hot: 'Régénération', buff: 'Amélioration', stealth: 'Furtivité',
};
const rarityColor = (id) => rarityById(id).color;

function itemStatsText(it) {
  const parts = [];
  if (it.dmg) parts.push(`Dégâts +${it.dmg}`);
  if (it.armor) parts.push(`Armure +${it.armor}`);
  const S = it.stats || {};
  const L = { str: 'For', con: 'Con', dex: 'Dex', qui: 'Viv', mag: 'Mag' };
  for (const k of ['str', 'con', 'dex', 'qui', 'mag']) if (S[k]) parts.push(`${L[k]} +${S[k]}`);
  if (it.hp) parts.push(`PV +${it.hp}`);
  if (it.power) parts.push(`Pui +${it.power}`);
  return parts.join(' · ');
}

export class UI {
  constructor(net) {
    this.net = net;
    this.self = null;
    this.cls = null;
    this.cooldowns = {};
    this.learned = [0];
    this.equip = {};
    this.bag = [];

    $('btn-respawn').onclick = () => { net.send(MSG.RESPAWN); $('deathscreen').classList.add('hidden'); };
    $('btn-pot-hp').onclick = () => net.send(MSG.USE_ITEM, { id: 'potion_hp' });
    $('btn-pot-pw').onclick = () => net.send(MSG.USE_ITEM, { id: 'potion_pw' });
    const invBtn = $('btn-inv'); if (invBtn) invBtn.onclick = () => this.toggleInventory();
    const sndBtn = $('btn-sound');
    if (sndBtn) sndBtn.onclick = () => { const m = Sound.toggle(); sndBtn.textContent = m ? '🔇 Son (M)' : '🔊 Son (M)'; };
    document.querySelectorAll('.gbtn[data-role]').forEach((b) => {
      b.onclick = () => net.send(MSG.RECRUIT, { role: b.dataset.role });
    });

    // chat
    this.chatOpen = false;
    const input = $('chatinput');
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = input.value.trim();
        if (text) net.send(MSG.CHAT, { text });
        input.value = ''; this.toggleChat(false);
      } else if (e.key === 'Escape') { input.value = ''; this.toggleChat(false); }
    });

    setInterval(() => this.renderCooldowns(), 200);
  }

  toggleChat(open) {
    this.chatOpen = open;
    const input = $('chatinput');
    input.classList.toggle('open', open);
    if (open) input.focus(); else input.blur();
  }

  log(text, cat = 'info') {
    const el = $('log');
    const p = document.createElement('p');
    p.className = 'c-' + cat;
    p.textContent = text;
    el.appendChild(p);
    while (el.children.length > 60) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
  }

  setIdentity(self) {
    this.cls = classById(self.cls);
    this.lvl = self.lvl || 1;
    if (Array.isArray(self.learned)) this.learned = self.learned;
    $('selfname').textContent = `${self.name} — ${this.cls.name} (${REALMS[self.realm].name})`;
    this.buildSkillbar();
    this.updateQuestLog(self.quests || {});
  }

  setSelf(me) {
    this.self = me;
    let needSkillbar = false;
    if (me.lvl && me.lvl !== this.lvl) { this.lvl = me.lvl; needSkillbar = true; }
    if (Array.isArray(me.learned) && me.learned.join() !== this.learned.join()) { this.learned = me.learned; needSkillbar = true; }
    if (me.equip) this.equip = me.equip;
    if (me.bag) this.bag = me.bag;
    if (needSkillbar && this.cls) this.buildSkillbar();
    if ((me.equip || me.bag) && !$('inventory').classList.contains('hidden')) this.renderInventory();

    $('hpfill').style.width = (me.hp / me.maxHp * 100) + '%';
    $('hptext').textContent = `${Math.max(0, Math.floor(me.hp))} / ${me.maxHp}`;
    $('pwfill').style.width = (me.power / me.maxPower * 100) + '%';
    $('pwtext').textContent = `${Math.floor(me.power)} / ${me.maxPower}`;
    $('xpfill').style.width = Math.min(100, me.xp / me.xpNext * 100) + '%';
    $('xptext').textContent = `Niv. ${me.lvl}`;
    $('goldtext').textContent = `💰 ${me.gold} or`;
  }

  setTarget(ent) {
    const f = $('targetframe');
    if (!ent) { f.classList.add('hidden'); return; }
    f.classList.remove('hidden');
    const realm = ent.realm ? ` — ${REALMS[ent.realm]?.name || ''}` : '';
    $('targetname').textContent = `${ent.name} (niv. ${ent.lvl})${realm}`;
    $('thpfill').style.width = ent.hpPct + '%';
  }

  setFort(owner, progress) {
    $('fortowner').textContent = owner ? REALMS[owner].name : 'neutre';
    $('fortowner').style.color = owner ? REALMS[owner].colorCss : '#aab2c8';
    const wrap = $('capbarwrap');
    if (progress > 0) {
      wrap.classList.remove('hidden');
      $('capfill').style.width = (progress / 10 * 100) + '%';
    } else wrap.classList.add('hidden');
  }

  // ---- barre de compétences (verrouillée tant que non apprise) ----
  buildSkillbar() {
    const bar = $('skillbar');
    bar.innerHTML = '';
    const arch = ARCHETYPES[this.cls.arch];
    const lvl = this.lvl || 1;
    arch.skills.forEach((sk, i) => {
      const name = sk.name || this.cls.sk[i] || `Compétence ${i + 1}`;
      const known = this.learned.includes(i);
      const d = document.createElement('div');
      d.className = 'skill' + (known ? '' : ' locked');
      let badge = '';
      if (!known) badge = lvl < (sk.lvl || 1) ? `<span class="lk">Niv. ${sk.lvl}</span>` : `<span class="lk train">À apprendre</span>`;
      d.innerHTML = `<span class="key">${i + 1}</span><span class="nm">${name}</span>${badge}`;
      d.title = known
        ? `${name} — ${TYPE_LABEL[sk.t] || sk.t} · recharge ${sk.cd}s · coût ${sk.cost}`
        : (lvl < (sk.lvl || 1) ? `${name} — niveau ${sk.lvl} requis` : `${name} — à apprendre chez l'entraîneur (E)`);
      d.onclick = () => {
        if (known) { this.net.send(MSG.SKILL, { slot: i }); Sound.play('cast'); }
        else this.log("Compétence non apprise — rendez-vous chez l'entraîneur de votre capitale (E).", 'info');
      };
      d.dataset.slot = i;
      bar.appendChild(d);
    });
  }

  setCooldowns(cds) { this.cooldowns = cds || {}; }

  renderCooldowns() {
    const t = Date.now();
    document.querySelectorAll('.skill').forEach((d) => {
      const until = this.cooldowns['s' + d.dataset.slot] || 0;
      let ov = d.querySelector('.cdov');
      if (until > t) {
        if (!ov) { ov = document.createElement('div'); ov.className = 'cdov'; d.appendChild(ov); }
        ov.textContent = Math.ceil((until - t) / 1000);
      } else if (ov) ov.remove();
    });
  }

  updateQuestLog(quests) {
    this.questState = quests;
    const el = $('questlist');
    el.innerHTML = '';
    const realm = this.cls?.realm;
    if (!realm) return;
    let any = false;
    for (const q of QUESTS[realm]) {
      const st = quests[q.id];
      if (!st) continue;
      any = true;
      const d = document.createElement('div');
      d.className = 'quest-entry';
      d.innerHTML = `<div class="qn">${q.name}</div><div>${q.desc}</div>` +
        (st.done ? `<div class="done">✓ Terminée</div>` : `<div>Progression : ${st.progress}/${q.count}</div>`);
      el.appendChild(d);
    }
    if (!any) el.innerHTML = '<div style="color:#707890;font-size:12px">Aucune quête. Parlez à l\'émissaire de votre capitale (touche E).</div>';
  }

  // ---- dialogues ----
  showDialog(html, buttons) {
    const d = $('dialog');
    d.classList.remove('hidden');
    d.innerHTML = html;
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = 'dbtn' + (b.close ? ' close' : '') + (b.disabled ? ' dis' : '');
      btn.innerHTML = b.label;
      if (b.disabled) btn.disabled = true;
      btn.onclick = () => { Sound.play('click'); if (b.fn) b.fn(); if (b.close || b.closeAfter) d.classList.add('hidden'); };
      d.appendChild(btn);
    }
  }

  showShop(shop) {
    this.showDialog('<h3>🧪 Marchand</h3>', [
      ...shop.map((i) => ({
        label: `${i.name} — ${i.price} or`,
        fn: () => this.net.send(MSG.BUY, { id: i.id }),
      })),
      { label: 'Fermer', close: true },
    ]);
  }

  showTrainer(skills) {
    const gold = this.self ? this.self.gold : 0;
    const lvl = this.lvl || 1;
    const rows = skills.map((s) => {
      if (s.learned) return { label: `✓ ${s.name} <span class="sd">(${TYPE_LABEL[s.t] || s.t})</span> — apprise`, disabled: true };
      if (lvl < s.lvl) return { label: `🔒 ${s.name} <span class="sd">(niv. ${s.lvl} requis)</span>`, disabled: true };
      const afford = gold >= s.gold;
      return {
        label: `${afford ? '📘' : '💰'} ${s.name} <span class="sd">(${TYPE_LABEL[s.t] || s.t}) — ${s.gold} or</span>`,
        disabled: !afford,
        fn: () => this.net.send(MSG.LEARN, { slot: s.slot }),
        closeAfter: false,
      };
    });
    this.showDialog(`<h3>📜 Entraîneur — ${this.cls ? this.cls.name : ''}</h3><div class="dsub">Apprenez de nouvelles techniques (or requis). Vous êtes niveau ${lvl}.</div>`,
      [...rows, { label: 'Fermer', close: true }]);
  }

  showArmory(items) {
    const gold = this.self ? this.self.gold : 0;
    const rows = items.map((it) => {
      const afford = gold >= it.value;
      return {
        label: `<span style="color:${rarityColor(it.rarity)}">${it.name}</span> <span class="sd">[niv.${it.lvl}] ${itemStatsText(it)}</span> — <b>${it.value} or</b>`,
        disabled: !afford,
        fn: () => this.net.send(MSG.BUY, { id: it.id }),
      };
    });
    this.showDialog('<h3>🛡️ Armurier</h3><div class="dsub">Équipement adapté à votre classe.</div>',
      [...rows, { label: 'Fermer', close: true }]);
  }

  showQuests(quests) {
    this.showDialog('<h3>Émissaire du royaume</h3>', [
      ...quests.map((q) => {
        let label, fn;
        if (!q.state) { label = `Accepter : « ${q.name} » — ${q.desc}`; fn = () => this.net.send(MSG.QUEST_ACCEPT, { id: q.id }); }
        else if (!q.state.done && q.state.progress >= q.count) { label = `✓ Rendre : « ${q.name} » (+${q.xp} XP, +${q.gold} or)`; fn = () => this.net.send(MSG.QUEST_TURNIN, { id: q.id }); }
        else if (q.state.done) { label = `« ${q.name} » — déjà accomplie`; fn = null; }
        else { label = `« ${q.name} » — en cours (${q.state.progress}/${q.count})`; fn = null; }
        return { label, fn, closeAfter: !!fn };
      }),
      { label: 'Fermer', close: true },
    ]);
  }

  // ---- inventaire & équipement ----
  toggleInventory() {
    const inv = $('inventory');
    inv.classList.toggle('hidden');
    if (!inv.classList.contains('hidden')) this.renderInventory();
  }

  renderInventory() {
    const eq = $('inv-equip');
    eq.innerHTML = '';
    for (const slot of EQUIP_SLOTS) {
      const it = this.equip[slot];
      const d = document.createElement('div');
      d.className = 'inv-slot' + (it ? ' filled' : '');
      if (it) d.style.borderColor = rarityColor(it.rarity);
      d.innerHTML = `<div class="slk">${SLOT_LABELS[slot]}</div>` +
        (it ? `<div class="itn" style="color:${rarityColor(it.rarity)}">${it.name}</div><div class="its">${itemStatsText(it)}</div>`
            : `<div class="ite">— vide —</div>`);
      if (it) { d.title = 'Cliquer pour déséquiper'; d.onclick = () => this.net.send(MSG.UNEQUIP, { slot }); }
      eq.appendChild(d);
    }
    const bag = $('inv-bag');
    bag.innerHTML = '';
    if (!this.bag.length) bag.innerHTML = '<div class="ite" style="padding:8px">Sac vide — tuez des monstres ou visitez l\'armurier.</div>';
    this.bag.forEach((it, idx) => {
      const d = document.createElement('div');
      d.className = 'inv-item';
      d.style.borderLeftColor = rarityColor(it.rarity);
      d.innerHTML = `<div class="itn" style="color:${rarityColor(it.rarity)}">${it.name} <span class="sd">[niv.${it.lvl}]</span></div><div class="its">${SLOT_LABELS[it.slot]} · ${itemStatsText(it)}</div>`;
      d.title = 'Cliquer pour équiper';
      d.onclick = () => this.net.send(MSG.EQUIP, { idx });
      bag.appendChild(d);
    });
    $('inv-gold').textContent = `💰 ${this.self ? this.self.gold : 0} or`;
  }

  death(show) { $('deathscreen').classList.toggle('hidden', !show); }
  toggleQuestLog() { $('questlog').classList.toggle('hidden'); }
}
