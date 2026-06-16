// HUD : barres, journal, quêtes, dialogues PNJ, barre de compétences
import { ARCHETYPES, classById, QUESTS, REALMS, MSG } from '/shared/data.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(net) {
    this.net = net;
    this.self = null;
    this.cls = null;
    this.cooldowns = {};

    $('btn-respawn').onclick = () => { net.send(MSG.RESPAWN); $('deathscreen').classList.add('hidden'); };
    $('btn-pot-hp').onclick = () => net.send(MSG.USE_ITEM, { id: 'potion_hp' });
    $('btn-pot-pw').onclick = () => net.send(MSG.USE_ITEM, { id: 'potion_pw' });
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
    $('selfname').textContent = `${self.name} — ${this.cls.name} (${REALMS[self.realm].name})`;
    this.buildSkillbar();
    this.updateQuestLog(self.quests || {});
  }

  setSelf(me) {
    this.self = me;
    if (me.lvl && me.lvl !== this.lvl) {
      this.lvl = me.lvl;
      if (this.cls) this.buildSkillbar(); // déblocage de compétences
    }
    $('hpfill').style.width = (me.hp / me.maxHp * 100) + '%';
    $('hptext').textContent = `${Math.max(0, Math.floor(me.hp))} / ${me.maxHp}`;
    $('pwfill').style.width = (me.power / me.maxPower * 100) + '%';
    $('pwtext').textContent = `${Math.floor(me.power)} / ${me.maxPower}`;
    const prev = 0; // xp du niveau courant simplifiée
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

  buildSkillbar() {
    const bar = $('skillbar');
    bar.innerHTML = '';
    const arch = ARCHETYPES[this.cls.arch];
    const lvl = this.lvl || 1;
    arch.skills.forEach((sk, i) => {
      const name = sk.name || this.cls.sk[i];
      const locked = lvl < (sk.lvl || 1);
      const d = document.createElement('div');
      d.className = 'skill' + (locked ? ' locked' : '');
      d.innerHTML = `<span class="key">${i + 1}</span><span class="nm">${name}</span>` +
        (locked ? `<span class="lk">Niv. ${sk.lvl}</span>` : '');
      d.title = locked ? `${name} — débloquée au niveau ${sk.lvl}` : `${name} — recharge ${sk.cd}s`;
      d.onclick = () => { if (!locked) this.net.send(MSG.SKILL, { slot: i }); };
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

  showDialog(html, buttons) {
    const d = $('dialog');
    d.classList.remove('hidden');
    d.innerHTML = html;
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = 'dbtn' + (b.close ? ' close' : '');
      btn.innerHTML = b.label;
      btn.onclick = () => { if (b.fn) b.fn(); if (b.close || b.closeAfter) d.classList.add('hidden'); };
      d.appendChild(btn);
    }
  }

  showShop(shop) {
    this.showDialog('<h3>Marchand</h3>', [
      ...shop.map((i) => ({
        label: `${i.name} — ${i.price} or`,
        fn: () => this.net.send(MSG.BUY, { id: i.id }),
      })),
      { label: 'Fermer', close: true },
    ]);
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

  death(show) { $('deathscreen').classList.toggle('hidden', !show); }
  toggleQuestLog() { $('questlog').classList.toggle('hidden'); }
}
