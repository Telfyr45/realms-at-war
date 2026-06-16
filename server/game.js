// ============================================================
// REALMS AT WAR — logique de jeu serveur (autoritaire)
// ============================================================
import {
  WORLD, REALMS, FRONTIER, ARCHETYPES, CLASSES, classById, MOB_TYPES, QUESTS, SHOP, MSG,
  xpForLevel, maxHp, maxPower, MAX_LEVEL,
  skillCost, EQUIP_SLOTS, weightOfArch, genItem, gearBonus, RARITIES,
} from '../shared/data.js';
import { resolveMove, pushApart, entityRadius, capitalTransform } from '../shared/collision.js';

let NEXT_ID = 1;
const uid = () => 'e' + (NEXT_ID++);
const now = () => Date.now();
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const rand = (a, b) => a + Math.random() * (b - a);
const irand = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const REALM_IDS = ['alb', 'hib', 'mid'];
const HALF = WORLD.size / 2;

// ------------------------------------------------------------
export class Game {
  constructor(storage = null) {
    this.entities = new Map(); // id -> entity
    this.sessions = new Set();
    this.fort = { x: 0, z: 0, owner: null, progress: 0, capturer: null };
    // sauvegarde des personnages (fichier côté serveur, localStorage en solo)
    this.storage = storage;
    this.saves = {};
    this.savesDirty = false;
    try { this.saves = (storage && storage.load()) || {}; } catch { this.saves = {}; }
    this.spawnWorld();
  }

  // ============ SAUVEGARDE ============
  saveKey(p) { return `${p.name.toLowerCase()}|${p.realm}|${p.cls}`; }

  persistPlayer(p) {
    if (!this.storage || !p || p.kind !== 'player') return;
    this.saves[this.saveKey(p)] = {
      lvl: p.lvl, xp: p.xp, gold: p.gold, items: p.items, quests: p.quests,
      learned: p.learned, equip: p.equip, bag: p.bag,
      x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, ts: now(),
    };
    this.savesDirty = true;
  }

  flushSaves() {
    if (!this.storage || !this.savesDirty) return;
    try { this.storage.save(this.saves); this.savesDirty = false; } catch (e) { console.error('save error', e); }
  }

  // ============ STATS, SORTS & ÉQUIPEMENT ============
  // Recalcule PV/puissance max en intégrant les bonus d'équipement.
  recalcVitals(p) {
    const cls = classById(p.cls);
    if (!cls) return;
    const gb = gearBonus(p.equip);
    const hpPct = p.maxHp ? p.hp / p.maxHp : 1;
    const pwPct = p.maxPower ? p.power / p.maxPower : 1;
    p.maxHp = Math.round(maxHp(cls, p.lvl) + gb.con * 4 + gb.hp);
    p.maxPower = Math.round(maxPower(cls, p.lvl) + gb.mag * 2 + gb.power);
    p.hp = Math.min(p.maxHp, Math.round(p.maxHp * hpPct));
    p.power = Math.min(p.maxPower, Math.round(p.maxPower * pwPct));
  }

  // Liste des compétences de la classe pour l'entraîneur (état d'apprentissage inclus).
  trainerData(p) {
    const cls = classById(p.cls);
    return ARCHETYPES[cls.arch].skills.map((sk, slot) => ({
      slot, name: sk.name || cls.sk[slot] || `Compétence ${slot + 1}`,
      t: sk.t, lvl: sk.lvl || 1, cd: sk.cd, cost: sk.cost,
      gold: skillCost(sk.lvl || 1),
      learned: (p.learned || []).includes(slot),
    }));
  }

  onLearn(session, slot) {
    const p = session.player; if (!p) return;
    if (!this.npcNear(p, 'trainer')) { this.eventTo(p, "Allez voir l'entraîneur de votre capitale (E).", 'info'); return; }
    const cls = classById(p.cls);
    const sk = ARCHETYPES[cls.arch].skills[slot];
    if (!sk) return;
    if ((p.learned || []).includes(slot)) { this.eventTo(p, 'Compétence déjà apprise.', 'info'); return; }
    if (p.lvl < (sk.lvl || 1)) { this.eventTo(p, `Niveau ${sk.lvl} requis pour cette technique.`, 'info'); return; }
    const cost = skillCost(sk.lvl || 1);
    if (p.gold < cost) { this.eventTo(p, `Il vous faut ${cost} or pour l'apprendre.`, 'info'); return; }
    p.gold -= cost; p.learned.push(slot);
    const name = sk.name || cls.sk[slot] || `Compétence ${slot + 1}`;
    this.send(session, MSG.EVENT, { text: `Nouvelle compétence apprise : ${name} ! (-${cost} or)`, cat: 'system', trainer: this.trainerData(p) });
    this.sendSelf(p);
  }

  // Stock de base de l'armurier, adapté à la classe d'armure du joueur.
  armorerStock(p) {
    const cls = classById(p.cls);
    const w = weightOfArch(cls.arch);
    const lvl = Math.max(1, p.lvl);
    const out = [];
    out.push(genItem({ id: uid(), slot: 'weapon', lvl, rarity: 'commun' }));
    out.push(genItem({ id: uid(), slot: 'head', lvl, rarity: 'commun', weight: w }));
    out.push(genItem({ id: uid(), slot: 'chest', lvl, rarity: 'commun', weight: w }));
    out.push(genItem({ id: uid(), slot: 'feet', lvl, rarity: 'commun', weight: w }));
    out.push(genItem({ id: uid(), slot: 'ring', lvl, rarity: 'commun' }));
    out.push(genItem({ id: uid(), slot: 'amulet', lvl, rarity: 'commun' }));
    out.push(genItem({ id: uid(), slot: 'chest', lvl, rarity: 'rare', weight: w }));
    out.push(genItem({ id: uid(), slot: 'weapon', lvl, rarity: 'rare' }));
    return out;
  }

  onEquip(session, idx) {
    const p = session.player; if (!p || p.dead) return;
    const it = p.bag[idx]; if (!it) return;
    const cls = classById(p.cls);
    if (it.weight && it.weight !== weightOfArch(cls.arch)) {
      this.eventTo(p, `Votre classe ne peut porter que l'armure ${weightOfArch(cls.arch)}.`, 'info'); return;
    }
    if (p.lvl < (it.lvl || 1)) { this.eventTo(p, `Niveau ${it.lvl} requis pour équiper ${it.name}.`, 'info'); return; }
    p.bag.splice(idx, 1);
    const prev = p.equip[it.slot];
    p.equip[it.slot] = it;
    if (prev) p.bag.push(prev);
    this.recalcVitals(p);
    this.eventTo(p, `Équipé : ${it.name}.`, 'loot');
    this.sendSelf(p);
  }

  onUnequip(session, slot) {
    const p = session.player; if (!p) return;
    const it = p.equip[slot]; if (!it) return;
    if (p.bag.length >= 24) { this.eventTo(p, 'Inventaire plein.', 'info'); return; }
    p.equip[slot] = null; p.bag.push(it);
    this.recalcVitals(p);
    this.eventTo(p, `Retiré : ${it.name}.`, 'info');
    this.sendSelf(p);
  }

  rollRarity() {
    const total = RARITIES.reduce((s, r) => s + r.w, 0);
    let x = Math.random() * total;
    for (const r of RARITIES) { if ((x -= r.w) <= 0) return r.id; }
    return 'commun';
  }

  maybeDropLoot(player, mobLvl, chance) {
    if (!player || player.kind !== 'player') return;
    if (Math.random() > chance) return;
    if (player.bag.length >= 24) { this.eventTo(player, 'Butin perdu : inventaire plein !', 'info'); return; }
    const slot = pick(EQUIP_SLOTS);
    const cls = classById(player.cls);
    const weight = ['head', 'chest', 'feet'].includes(slot) ? weightOfArch(cls.arch) : 'moyenne';
    const it = genItem({ id: uid(), slot, lvl: Math.max(1, mobLvl), rarity: this.rollRarity(), weight });
    player.bag.push(it);
    this.send(player.session, MSG.EVENT, { text: `✦ Butin : ${it.name} [${it.rarity}] !`, cat: 'loot', loot: it });
    this.sendSelf(player);
  }

  // ============ MONDE INITIAL ============
  spawnWorld() {
    for (const r of REALM_IDS) {
      const base = REALMS[r].base;
      const T = capitalTransform(r); // place les PNJ dans la cour, alignés avec les murailles
      // PNJ de la capitale
      const pt = T(14, -6), pm = T(-14, -6), pq = T(0, -14), pa = T(30, 4);
      this.spawnNpc(r, 'trainer', `Entraîneur de ${REALMS[r].capital}`, pt.x, pt.z);
      this.spawnNpc(r, 'merchant', `Marchand de ${REALMS[r].capital}`, pm.x, pm.z);
      this.spawnNpc(r, 'questgiver', `Émissaire de ${REALMS[r].capital}`, pq.x, pq.z);
      this.spawnNpc(r, 'armorer', `Armurier de ${REALMS[r].capital}`, pa.x, pa.z);
      // Gardes de la capitale
      for (let i = 0; i < 4; i++) {
        const pg = T((i - 1.5) * 16, -38);
        this.spawnGuard(r, pg.x, pg.z);
      }
      // Camps de mobs PvE entre la base et le centre
      const dirX = (0 - base.x), dirZ = (0 - base.z);
      const len = Math.hypot(dirX, dirZ);
      const ux = dirX / len, uz = dirZ / len;
      MOB_TYPES[r].forEach((mt, idx) => {
        const d = 140 + idx * 130; // camps de plus en plus loin = plus haut niveau
        const cx = base.x + ux * d, cz = base.z + uz * d;
        for (let i = 0; i < 4; i++) {
          this.spawnMob(r, mt, cx + rand(-35, 35), cz + rand(-35, 35));
        }
      });
      // IA RvR ennemies : 5 par royaume, près du centre côté royaume
      for (let i = 0; i < 5; i++) this.spawnAiPlayer(r);
    }
    // Mobs de la grande zone frontalière centrale : répartis tout autour du Fort Central
    for (const mt of MOB_TYPES.frontier) {
      for (let i = 0; i < 7; i++) {
        const ang = rand(0, Math.PI * 2);
        const rad = rand(FRONTIER.fortRadius + 55, FRONTIER.radius);
        this.spawnMob('frontier', mt, Math.cos(ang) * rad, Math.sin(ang) * rad);
      }
    }
  }

  spawnNpc(realm, role, name, x, z) {
    const e = {
      id: uid(), kind: 'npc', role, name, realm, lvl: 50,
      x, z, ry: 0, hp: 5000, maxHp: 5000, dead: false,
    };
    this.entities.set(e.id, e);
    return e;
  }

  spawnGuard(realm, x, z) {
    const e = {
      id: uid(), kind: 'guard', name: `Garde de ${REALMS[realm].name}`, realm,
      lvl: 30, x, z, ry: 0, home: { x, z },
      hp: 3000, maxHp: 3000, dead: false, targetId: null, swingAt: 0,
    };
    this.entities.set(e.id, e);
    return e;
  }

  spawnMob(zone, mt, x, z) {
    const lvl = irand(mt.lvl[0], mt.lvl[1]);
    const e = {
      id: uid(), kind: 'mob', mobType: mt.id, name: mt.name, realm: null, zone,
      lvl, x, z, ry: rand(0, 6.28), home: { x, z },
      hp: 60 + lvl * 30, maxHp: 60 + lvl * 30, dead: false,
      targetId: null, swingAt: 0, effects: [],
    };
    this.entities.set(e.id, e);
    return e;
  }

  spawnAiPlayer(realm) {
    const cls = pick(CLASSES.filter((c) => c.realm === realm));
    const lvl = irand(15, 25);
    const base = REALMS[realm].base;
    const sx = base.x * 0.35 + rand(-40, 40), sz = base.z * 0.35 + rand(-40, 40);
    const e = {
      id: uid(), kind: 'ai', name: aiName(realm), realm, race: pick(cls.races), cls: cls.id, arch: cls.arch,
      lvl, x: sx, z: sz, ry: 0, home: { x: sx, z: sz },
      hp: maxHp(cls, lvl), maxHp: maxHp(cls, lvl),
      power: maxPower(cls, lvl), maxPower: maxPower(cls, lvl),
      dead: false, targetId: null, swingAt: 0, effects: [], cooldowns: {}, stealthed: false,
      aiState: 'patrol', waypoint: null,
    };
    this.entities.set(e.id, e);
    return e;
  }

  spawnCompanion(owner, type) {
    const realm = owner.realm;
    const pool = CLASSES.filter((c) => c.realm === realm && c.arch === (type === 'healer' ? 'healer' : 'tank'));
    const cls = pick(pool);
    const e = {
      id: uid(), kind: 'companion', name: `${cls.name} (compagnon)`, realm, cls: cls.id, arch: cls.arch,
      lvl: owner.lvl, ownerId: owner.id,
      x: owner.x + rand(-4, 4), z: owner.z + rand(-4, 4), ry: 0,
      hp: maxHp(cls, owner.lvl), maxHp: maxHp(cls, owner.lvl),
      power: maxPower(cls, owner.lvl), maxPower: maxPower(cls, owner.lvl),
      dead: false, targetId: null, swingAt: 0, effects: [], cooldowns: {},
    };
    this.entities.set(e.id, e);
    return e;
  }

  // ============ CONNEXIONS ============
  addConnection(ws) {
    const session = { ws, player: null };
    this.sessions.add(session);
    return session;
  }

  removeConnection(session) {
    this.sessions.delete(session);
    if (session.player) {
      this.persistPlayer(session.player);
      this.flushSaves();
      // supprime aussi les compagnons
      for (const e of this.entities.values()) {
        if (e.kind === 'companion' && e.ownerId === session.player.id) this.entities.delete(e.id);
      }
      this.entities.delete(session.player.id);
      this.broadcastEvent(`${session.player.name} a quitté le royaume.`, 'system');
    }
  }

  send(session, type, data) {
    if (session.ws.readyState === 1) session.ws.send(JSON.stringify({ type, ...data }));
  }

  broadcastEvent(text, cat = 'info', realmOnly = null) {
    for (const s of this.sessions) {
      if (!s.player) continue;
      if (realmOnly && s.player.realm !== realmOnly) continue;
      this.send(s, MSG.EVENT, { text, cat });
    }
  }

  // ============ MESSAGES CLIENT ============
  handleMessage(session, m) {
    if (m.type === MSG.CREATE) return this.onCreate(session, m);
    const p = session.player;
    if (!p) return;
    switch (m.type) {
      case MSG.MOVE: {
        if (p.dead || this.hasEffect(p, 'root') || this.hasEffect(p, 'stun') || this.hasEffect(p, 'mez')) break;
        const nx = clamp(m.x, -HALF, HALF), nz = clamp(m.z, -HALF, HALF);
        const d = Math.hypot(nx - p.x, nz - p.z);
        if (d < 30) { // anti-téléportation grossier
          if (d > 0.5 && p.stealthed === false) p.lastMove = now();
          const c = this.applyCollisions(p, nx, nz);
          p.x = c.x; p.z = c.z; p.ry = m.ry || 0;
        }
        break;
      }
      case MSG.TARGET: p.targetId = m.id || null; break;
      case MSG.ATTACK: {
        p.autoAttack = !!m.on;
        if (p.autoAttack) p.stealthed = false;
        break;
      }
      case MSG.SKILL: this.useSkill(p, m.slot); break;
      case MSG.CHAT: {
        const text = String(m.text || '').slice(0, 200);
        if (!text) break;
        for (const s of this.sessions) {
          if (s.player && s.player.realm === p.realm) {
            this.send(s, MSG.CHAT_BC, { from: p.name, text });
          }
        }
        break;
      }
      case MSG.INTERACT: this.onInteract(session, m.id); break;
      case MSG.QUEST_ACCEPT: this.onQuestAccept(session, m.id); break;
      case MSG.QUEST_TURNIN: this.onQuestTurnin(session, m.id); break;
      case MSG.BUY: this.onBuy(session, m.id); break;
      case MSG.USE_ITEM: this.onUseItem(session, m.id); break;
      case MSG.RECRUIT: this.onRecruit(session, m.role); break;
      case MSG.RESPAWN: this.onRespawn(session); break;
      case MSG.LEARN: this.onLearn(session, m.slot); break;
      case MSG.EQUIP: this.onEquip(session, m.idx); break;
      case MSG.UNEQUIP: this.onUnequip(session, m.slot); break;
    }
  }

  onCreate(session, m) {
    if (session.player) return;
    const cls = classById(m.cls);
    if (!cls || !REALMS[m.realm] || cls.realm !== m.realm) return;
    const race = REALMS[m.realm].races.includes(m.race) ? m.race : cls.races[0];
    const name = String(m.name || 'Aventurier').replace(/[^\p{L}\p{N} '-]/gu, '').slice(0, 20) || 'Aventurier';
    const base = REALMS[m.realm].base;
    const lvl = 1;
    const p = {
      id: uid(), kind: 'player', name, realm: m.realm, race, cls: cls.id, arch: cls.arch,
      lvl, xp: 0, gold: 50, items: { potion_hp: 1, potion_pw: 1 },
      learned: [0], // slots de compétences apprises (slot 0 = attaque de base, offert)
      equip: { weapon: null, head: null, chest: null, feet: null, ring: null, amulet: null },
      bag: [], // inventaire d'objets ramassés
      x: base.x + rand(-8, 8), z: base.z + rand(-8, 8), ry: 0,
      hp: maxHp(cls, lvl), maxHp: maxHp(cls, lvl),
      power: maxPower(cls, lvl), maxPower: maxPower(cls, lvl),
      dead: false, targetId: null, autoAttack: false, swingAt: 0,
      effects: [], cooldowns: {}, stealthed: false, lastCombat: 0,
      quests: {}, // id -> {progress, done}
      session,
    };
    // restauration d'une sauvegarde existante (même nom + royaume + classe)
    const sv = this.saves[this.saveKey(p)];
    let restored = false;
    if (sv && sv.lvl >= 1) {
      restored = true;
      p.lvl = Math.min(sv.lvl, MAX_LEVEL);
      p.xp = sv.xp || 0;
      p.gold = sv.gold ?? p.gold;
      p.items = sv.items || p.items;
      p.quests = sv.quests || {};
      if (Array.isArray(sv.learned) && sv.learned.length) p.learned = sv.learned;
      if (sv.equip) for (const s of EQUIP_SLOTS) p.equip[s] = sv.equip[s] || null;
      if (Array.isArray(sv.bag)) p.bag = sv.bag;
      if (typeof sv.x === 'number' && typeof sv.z === 'number') { p.x = sv.x; p.z = sv.z; }
    }
    this.recalcVitals(p); p.hp = p.maxHp; p.power = p.maxPower;
    session.player = p;
    this.entities.set(p.id, p);
    if (restored) this.send(session, MSG.EVENT, { text: `Bon retour, ${name} ! Personnage restauré (niveau ${p.lvl}, ${p.gold} or).`, cat: 'system' });
    this.send(session, MSG.WELCOME, {
      selfId: p.id,
      spawn: { x: p.x, z: p.z }, // position réelle (restaurée le cas échéant)
      fort: { x: this.fort.x, z: this.fort.z, owner: this.fort.owner },
    });
    this.sendSelf(p);
    this.broadcastEvent(`${name} (${cls.name}) rejoint ${REALMS[m.realm].name} !`, 'system', m.realm);
  }

  sendSelf(p) {
    if (!p.session) return;
    this.send(p.session, MSG.SELF, {
      self: {
        id: p.id, name: p.name, realm: p.realm, race: p.race, cls: p.cls, lvl: p.lvl,
        xp: p.xp, xpNext: xpForLevel(p.lvl + 1), gold: p.gold, items: p.items,
        hp: p.hp, maxHp: p.maxHp, power: p.power, maxPower: p.maxPower,
        quests: p.quests, stealthed: p.stealthed, dead: p.dead,
        cooldowns: p.cooldowns,
        learned: p.learned, equip: p.equip, bag: p.bag,
      },
    });
  }

  // ============ INTERACTIONS PNJ ============
  npcNear(p, role, range = 12) {
    for (const e of this.entities.values()) {
      if (e.kind === 'npc' && e.role === role && e.realm === p.realm && dist(e, p) < range) return e;
    }
    return null;
  }

  onInteract(session, id) {
    const p = session.player; const e = this.entities.get(id);
    if (!e || e.kind !== 'npc' || dist(e, p) > 12) return;
    if (e.realm !== p.realm) { this.send(session, MSG.EVENT, { text: 'Ce PNJ ne vous comprend pas.', cat: 'info' }); return; }
    if (e.role === 'trainer') {
      p.hp = p.maxHp; p.power = p.maxPower;
      this.send(session, MSG.EVENT, { text: `${e.name} : « Voici les techniques de votre voie. Étudiez, et elles seront vôtres. »`, cat: 'npc', trainer: this.trainerData(p) });
      this.sendSelf(p);
    } else if (e.role === 'merchant') {
      this.send(session, MSG.EVENT, { text: `${e.name} : « Potions fraîches ! »`, cat: 'npc', shop: SHOP });
    } else if (e.role === 'armorer') {
      session.armory = this.armorerStock(p);
      this.send(session, MSG.EVENT, { text: `${e.name} : « Armes et armures de qualité pour les braves de ${REALMS[p.realm].name}. »`, cat: 'npc', armory: session.armory });
    } else if (e.role === 'questgiver') {
      const qs = QUESTS[p.realm].map((q) => ({ ...q, state: p.quests[q.id] || null }));
      this.send(session, MSG.EVENT, { text: `${e.name} : « ${REALMS[p.realm].name} a besoin de vous ! »`, cat: 'npc', quests: qs });
    }
  }

  onQuestAccept(session, qid) {
    const p = session.player;
    const q = QUESTS[p.realm].find((x) => x.id === qid);
    if (!q || p.quests[qid] || !this.npcNear(p, 'questgiver')) return;
    p.quests[qid] = { progress: 0, done: false };
    this.send(session, MSG.EVENT, { text: `Quête acceptée : ${q.name}`, cat: 'quest' });
    this.sendSelf(p);
  }

  onQuestTurnin(session, qid) {
    const p = session.player;
    const q = QUESTS[p.realm].find((x) => x.id === qid);
    const st = p.quests[qid];
    if (!q || !st || st.done || st.progress < q.count || !this.npcNear(p, 'questgiver')) return;
    st.done = true;
    p.gold += q.gold;
    this.gainXp(p, q.xp);
    this.send(session, MSG.EVENT, { text: `Quête terminée : ${q.name} (+${q.xp} XP, +${q.gold} or)`, cat: 'quest' });
    this.sendSelf(p);
  }

  onBuy(session, itemId) {
    const p = session.player;
    // potions chez le marchand
    const item = SHOP.find((i) => i.id === itemId);
    if (item) {
      if (!this.npcNear(p, 'merchant')) return;
      if (p.gold < item.price) { this.send(session, MSG.EVENT, { text: "Pas assez d'or !", cat: 'info' }); return; }
      p.gold -= item.price;
      p.items[itemId] = (p.items[itemId] || 0) + 1;
      this.send(session, MSG.EVENT, { text: `Achat : ${item.name}`, cat: 'info' });
      this.sendSelf(p);
      return;
    }
    // équipement chez l'armurier
    const gear = (session.armory || []).find((i) => i.id === itemId);
    if (gear) {
      if (!this.npcNear(p, 'armorer')) return;
      if (p.gold < gear.value) { this.eventTo(p, "Pas assez d'or !", 'info'); return; }
      if (p.bag.length >= 24) { this.eventTo(p, 'Inventaire plein.', 'info'); return; }
      p.gold -= gear.value;
      p.bag.push({ ...gear, id: uid() });
      session.armory = session.armory.filter((i) => i.id !== itemId);
      this.send(session, MSG.EVENT, { text: `Achat : ${gear.name}`, cat: 'loot', armory: session.armory });
      this.sendSelf(p);
    }
  }

  onUseItem(session, itemId) {
    const p = session.player;
    const item = SHOP.find((i) => i.id === itemId);
    if (!item || !(p.items[itemId] > 0) || p.dead) return;
    p.items[itemId]--;
    if (item.heal) p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * item.heal));
    if (item.power) p.power = Math.min(p.maxPower, p.power + Math.floor(p.maxPower * item.power));
    this.send(session, MSG.EVENT, { text: `Vous utilisez : ${item.name}`, cat: 'info' });
    this.sendSelf(p);
  }

  onRecruit(session, role) {
    const p = session.player;
    const owned = [...this.entities.values()].filter((e) => e.kind === 'companion' && e.ownerId === p.id);
    if (owned.length >= 2) { this.send(session, MSG.EVENT, { text: 'Votre groupe est complet (2 compagnons max).', cat: 'info' }); return; }
    const c = this.spawnCompanion(p, role === 'healer' ? 'healer' : 'tank');
    this.send(session, MSG.EVENT, { text: `${c.name} rejoint votre groupe !`, cat: 'group' });
  }

  onRespawn(session) {
    const p = session.player;
    if (!p.dead) return;
    const base = REALMS[p.realm].base;
    p.dead = false; p.hp = Math.floor(p.maxHp * 0.6); p.power = Math.floor(p.maxPower * 0.6);
    p.x = base.x + rand(-8, 8); p.z = base.z + rand(-8, 8);
    p.effects = []; p.targetId = null; p.autoAttack = false;
    this.sendSelf(p);
  }

  // ============ COMPÉTENCES & COMBAT ============
  hasEffect(e, t) { return e.effects && e.effects.some((f) => f.t === t && f.until > now()); }

  group(p) {
    const g = [p];
    for (const e of this.entities.values()) {
      if (e.kind === 'companion' && e.ownerId === p.id && !e.dead) g.push(e);
    }
    return g;
  }

  useSkill(p, slot) {
    if (p.dead || this.hasEffect(p, 'stun') || this.hasEffect(p, 'mez')) return;
    const cls = classById(p.cls);
    const sk = ARCHETYPES[cls.arch].skills[slot];
    if (!sk) return;
    if (!(p.learned || []).includes(slot)) { this.eventTo(p, "Compétence non apprise — voir l'entraîneur (E)."); return; }
    if (p.lvl < (sk.lvl || 1)) { this.eventTo(p, `Compétence apprise au niveau ${sk.lvl}.`); return; }
    const key = 's' + slot;
    const t = now();
    if ((p.cooldowns[key] || 0) > t) return;
    const cost = sk.cost * (1 + p.lvl * 0.06);
    if (p.power < cost) { this.eventTo(p, 'Pas assez de puissance !'); return; }
    const skillName = sk.name || cls.sk[slot];

    // ciblage
    let target = p.targetId ? this.entities.get(p.targetId) : null;
    const offensive = ['melee', 'ranged', 'spell', 'dot', 'aoe', 'stun', 'root', 'mez'].includes(sk.t);
    if (offensive) {
      if (!target || target.dead || !this.isEnemy(p, target)) { this.eventTo(p, 'Cible invalide.'); return; }
      const rng = sk.rng < 6 ? 6 : sk.rng;
      if (dist(p, target) > rng) { this.eventTo(p, 'Cible trop éloignée.'); return; }
    }

    p.power -= Math.floor(cost);
    p.cooldowns[key] = t + sk.cd * 1000;
    p.lastCombat = t;

    switch (sk.t) {
      case 'melee': case 'ranged': case 'spell': {
        let mult = sk.p;
        if (sk.fromStealth && p.stealthed) mult *= sk.fromStealth;
        p.stealthed = false;
        const dmg = this.damageOf(p, sk.t, mult);
        this.dealDamage(p, target, dmg, skillName);
        break;
      }
      case 'dot': {
        p.stealthed = false;
        const total = this.damageOf(p, 'spell', sk.p);
        target.effects.push({ t: 'dot', until: t + sk.dur * 1000, tick: Math.ceil(total / (sk.dur / 3)), nextTick: t + 3000, srcId: p.id, name: skillName });
        this.eventTo(p, `${skillName} ronge ${target.name}.`);
        break;
      }
      case 'aoe': {
        p.stealthed = false;
        const dmg = this.damageOf(p, 'spell', sk.p);
        for (const e of this.entities.values()) {
          if (!e.dead && this.isEnemy(p, e) && dist(e, target) < 15) this.dealDamage(p, e, dmg, skillName);
        }
        break;
      }
      case 'stun': {
        const dmg = this.damageOf(p, 'melee', sk.p);
        this.dealDamage(p, target, dmg, skillName);
        if (!target.dead) target.effects.push({ t: 'stun', until: t + sk.dur * 1000 });
        break;
      }
      case 'root': {
        if (sk.p > 0) this.dealDamage(p, target, this.damageOf(p, 'spell', sk.p), skillName);
        if (!target.dead) { target.effects.push({ t: 'root', until: t + sk.dur * 1000 }); this.eventTo(p, `${target.name} est immobilisé !`); }
        break;
      }
      case 'mez': {
        target.effects.push({ t: 'mez', until: t + sk.dur * 1000 });
        this.eventTo(p, `${target.name} est hypnotisé... ne le frappez pas !`);
        break;
      }
      case 'heal': {
        const tgt = (target && !this.isEnemy(p, target) && !target.dead && dist(p, target) < 30) ? target : p;
        const amt = Math.floor((20 + p.lvl * 6) * sk.p * (1 + classById(p.cls).stats.mag / 200));
        tgt.hp = Math.min(tgt.maxHp, tgt.hp + amt);
        this.eventTo(p, `${skillName} : +${amt} PV${tgt !== p ? ' → ' + tgt.name : ''}.`);
        break;
      }
      case 'groupheal': {
        const amt = Math.floor((16 + p.lvl * 5) * sk.p * (1 + classById(p.cls).stats.mag / 200));
        for (const g of this.group(p)) { if (dist(g, p) < 35) g.hp = Math.min(g.maxHp, g.hp + amt); }
        this.eventTo(p, `${skillName} : le groupe est soigné (+${amt} PV).`);
        break;
      }
      case 'hot': {
        const tgt = (target && !this.isEnemy(p, target) && !target.dead) ? target : p;
        const amt = Math.floor((8 + p.lvl * 2.5) * sk.p);
        tgt.effects.push({ t: 'hot', until: t + sk.dur * 1000, tick: amt, nextTick: t + 3000 });
        this.eventTo(p, `${skillName} enveloppe ${tgt === p ? 'vous' : tgt.name}.`);
        break;
      }
      case 'buff': {
        p.effects.push({ t: 'buff', until: t + sk.dur * 1000, dmgBonus: sk.p });
        this.eventTo(p, `${skillName} : puissance accrue !`);
        break;
      }
      case 'stealth': {
        p.stealthed = !p.stealthed;
        p.autoAttack = false;
        this.eventTo(p, p.stealthed ? 'Vous vous fondez dans les ombres...' : 'Vous sortez des ombres.');
        break;
      }
    }
    this.sendSelf(p);
  }

  damageOf(e, type, mult) {
    const cls = e.cls ? classById(e.cls) : null;
    const archDmg = cls ? ARCHETYPES[cls.arch].dmg : 1;
    const gb = e.kind === 'player' ? gearBonus(e.equip) : null;
    let stat = 50;
    if (cls) {
      const base = type === 'melee' ? cls.stats.str : type === 'ranged' ? cls.stats.dex : cls.stats.mag;
      const gs = gb ? (type === 'melee' ? gb.str : type === 'ranged' ? gb.dex : gb.mag) : 0;
      stat = base + gs;
    }
    let dmg = (10 + e.lvl * 2.4) * mult * archDmg * (1 + stat / 250);
    if (gb && (type === 'melee' || type === 'ranged')) dmg += gb.dmg * mult * 0.8; // bonus de l'arme équipée
    const buff = (e.effects || []).find((f) => f.t === 'buff' && f.until > now());
    if (buff) dmg *= 1 + buff.dmgBonus;
    return Math.floor(dmg * rand(0.85, 1.15));
  }

  isEnemy(a, b) {
    if (a.id === b.id) return false;
    if (b.kind === 'npc') return false;
    if (b.kind === 'mob') return true;
    if (a.kind === 'mob') return true;
    return a.realm !== b.realm;
  }

  eventTo(e, text, cat = 'combat') {
    if (e.session) this.send(e.session, MSG.EVENT, { text, cat });
  }

  dealDamage(src, tgt, dmg, label) {
    if (tgt.dead) return;
    // mitigation par l'armure équipée (joueurs)
    if (tgt.kind === 'player' && tgt.equip) {
      const armor = gearBonus(tgt.equip).armor;
      if (armor > 0) { const mit = armor / (armor + 90 + tgt.lvl * 7); dmg = Math.max(1, Math.round(dmg * (1 - mit))); }
    }
    tgt.hp -= dmg;
    tgt.lastCombat = now();
    src.lastCombat = now();
    // le mez se brise
    tgt.effects = (tgt.effects || []).filter((f) => f.t !== 'mez');
    // aggro
    if ((tgt.kind === 'mob' || tgt.kind === 'guard' || tgt.kind === 'ai') && !tgt.targetId) tgt.targetId = src.id;
    this.eventTo(src, `${label || 'Attaque'} : ${dmg} dégâts → ${tgt.name}.`);
    this.eventTo(tgt, `${src.name} vous inflige ${dmg} dégâts (${label || 'attaque'}).`);
    if (tgt.hp <= 0) this.onDeath(src, tgt);
  }

  onDeath(killer, victim) {
    victim.hp = 0; victim.dead = true; victim.targetId = null; victim.effects = [];
    // crédit du tueur réel (compagnon -> propriétaire)
    let credit = killer;
    if (killer.kind === 'companion') credit = this.entities.get(killer.ownerId) || killer;

    if (victim.kind === 'mob') {
      victim.respawnAt = now() + 15000;
      if (credit.kind === 'player') {
        const diff = clamp(1 + (victim.lvl - credit.lvl) * 0.12, 0.2, 2.2);
        this.gainXp(credit, Math.floor(28 * victim.lvl * diff));
        const gold = irand(2, 6) * victim.lvl;
        credit.gold += gold;
        this.eventTo(credit, `Vous avez vaincu ${victim.name} (+${gold} or).`, 'loot');
        this.maybeDropLoot(credit, victim.lvl, 0.35);
        this.questCredit(credit, victim.mobType);
      }
    } else if (victim.kind === 'ai' || victim.kind === 'player') {
      if (victim.kind === 'ai') victim.respawnAt = now() + 20000;
      if (credit.kind === 'player' && this.isEnemy(credit, victim)) {
        this.gainXp(credit, 60 * victim.lvl);
        this.eventTo(credit, `☠ Vous avez tué ${victim.name} de ${REALMS[victim.realm].name} ! (+points de royaume)`, 'rvr');
        this.questCredit(credit, '__enemy');
        this.maybeDropLoot(credit, victim.lvl, 0.5);
        this.broadcastEvent(`${credit.name} a tué ${victim.name} (${REALMS[victim.realm].name}) à la frontière !`, 'rvr', credit.realm);
      }
      if (victim.kind === 'player' && victim.session) {
        this.send(victim.session, MSG.DEAD, {});
        this.sendSelf(victim);
      }
    } else if (victim.kind === 'companion') {
      this.entities.delete(victim.id);
      const owner = this.entities.get(victim.ownerId);
      if (owner) this.eventTo(owner, `${victim.name} est tombé au combat.`, 'group');
      return;
    } else if (victim.kind === 'guard') {
      victim.respawnAt = now() + 45000;
    }
  }

  questCredit(p, targetId) {
    for (const q of QUESTS[p.realm]) {
      const st = p.quests[q.id];
      if (st && !st.done && q.target === targetId && st.progress < q.count) {
        st.progress++;
        this.eventTo(p, `Quête « ${q.name} » : ${st.progress}/${q.count}`, 'quest');
      }
    }
    this.sendSelf(p);
  }

  gainXp(p, amount) {
    if (p.kind !== 'player') return;
    p.xp += amount;
    this.eventTo(p, `+${amount} XP`, 'xp');
    while (p.lvl < MAX_LEVEL && p.xp >= xpForLevel(p.lvl + 1)) {
      p.lvl++;
      const cls = classById(p.cls);
      this.recalcVitals(p); p.hp = p.maxHp; p.power = p.maxPower;
      this.eventTo(p, `★ NIVEAU ${p.lvl} ! Vous vous sentez plus puissant.`, 'levelup');
      // nouvelle(s) technique(s) disponible(s) à l'entraînement ?
      const skills = ARCHETYPES[cls.arch].skills;
      const avail = skills.filter((s) => (s.lvl || 1) === p.lvl).length;
      if (avail) this.eventTo(p, "📜 Nouvelle(s) technique(s) à apprendre chez l'entraîneur !", 'levelup');
      this.persistPlayer(p);
      // les compagnons suivent le niveau
      for (const e of this.entities.values()) {
        if (e.kind === 'companion' && e.ownerId === p.id) {
          e.lvl = p.lvl;
          const ccls = classById(e.cls);
          e.maxHp = maxHp(ccls, e.lvl); e.hp = e.maxHp;
          e.maxPower = maxPower(ccls, e.lvl); e.power = e.maxPower;
        }
      }
    }
    this.sendSelf(p);
  }

  // ============ BOUCLE DE JEU ============
  start() {
    this.tickTimer = setInterval(() => this.tick(), WORLD.tickMs);
    this.bcastTimer = setInterval(() => this.broadcastState(), WORLD.broadcastMs);
    this.saveTimer = setInterval(() => {
      for (const s of this.sessions) if (s.player) this.persistPlayer(s.player);
      this.flushSaves();
    }, 10000);
  }

  tick() {
    const t = now();
    for (const e of this.entities.values()) {
      // respawn
      if (e.dead && e.respawnAt && t > e.respawnAt) {
        e.dead = false; e.hp = e.maxHp; e.effects = []; e.targetId = null;
        if (e.kind === 'mob' || e.kind === 'guard') { e.x = e.home.x; e.z = e.home.z; }
        if (e.kind === 'ai') {
          e.power = e.maxPower;
          const base = REALMS[e.realm].base;
          e.x = base.x * 0.35 + rand(-40, 40); e.z = base.z * 0.35 + rand(-40, 40);
          e.aiState = 'patrol'; e.waypoint = null;
        }
        continue;
      }
      if (e.dead) continue;

      // effets périodiques
      if (e.effects && e.effects.length) {
        e.effects = e.effects.filter((f) => f.until > t);
        for (const f of e.effects) {
          if ((f.t === 'dot' || f.t === 'hot') && t > (f.nextTick || 0)) {
            f.nextTick = t + 3000;
            if (f.t === 'dot') {
              e.hp -= f.tick;
              if (e.hp <= 0) { const src = this.entities.get(f.srcId); this.onDeath(src || e, e); }
            } else {
              e.hp = Math.min(e.maxHp, e.hp + f.tick);
            }
          }
        }
      }
      if (e.dead) continue;

      // régénération hors combat
      if (t - (e.lastCombat || 0) > 6000 && (e.kind === 'player' || e.kind === 'ai' || e.kind === 'companion')) {
        if (e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + Math.ceil(e.maxHp * 0.004));
        if (e.power < e.maxPower) e.power = Math.min(e.maxPower, e.power + Math.ceil(e.maxPower * 0.006));
      }

      // IA
      if (e.kind === 'mob') this.tickMob(e, t);
      else if (e.kind === 'guard') this.tickGuard(e, t);
      else if (e.kind === 'ai') this.tickAi(e, t);
      else if (e.kind === 'companion') this.tickCompanion(e, t);
      else if (e.kind === 'player') this.tickPlayerAuto(e, t);
    }
    this.tickFort(t);
  }

  // attaque automatique du joueur
  tickPlayerAuto(p, t) {
    if (!p.autoAttack || p.dead) return;
    const tgt = this.entities.get(p.targetId);
    if (!tgt || tgt.dead || !this.isEnemy(p, tgt)) { p.autoAttack = false; return; }
    if (this.hasEffect(p, 'stun') || this.hasEffect(p, 'mez')) return;
    const cls = classById(p.cls);
    const melee = !['caster', 'archer'].includes(cls.arch);
    const rng = melee ? 5 : 38;
    if (dist(p, tgt) > rng) return;
    if (t > (p.swingAt || 0)) {
      p.swingAt = t + 2200;
      const type = melee ? 'melee' : (cls.arch === 'archer' ? 'ranged' : 'spell');
      this.dealDamage(p, tgt, this.damageOf(p, type, 0.9), melee ? 'Attaque' : 'Tir');
    }
  }

  moveToward(e, tx, tz, speed, dt) {
    if (this.hasEffect(e, 'root') || this.hasEffect(e, 'stun') || this.hasEffect(e, 'mez')) return;
    const dx = tx - e.x, dz = tz - e.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) return;
    const step = Math.min(d, speed * dt);
    const c = this.applyCollisions(e, e.x + (dx / d) * step, e.z + (dz / d) * step);
    e.x = c.x; e.z = c.z;
    e.ry = Math.atan2(dx, dz);
  }

  // collisions : décor statique + autres entités proches
  applyCollisions(e, x, z) {
    const rad = entityRadius(e.kind);
    let c = resolveMove(x, z, rad);
    const others = [];
    for (const o of this.entities.values()) {
      if (o.id === e.id || o.dead) continue;
      if (o.kind === 'companion' && o.ownerId === e.id) continue; // les compagnons ne bloquent pas leur chef
      if (e.kind === 'companion' && e.ownerId === o.id) continue;
      if (Math.abs(o.x - c.x) > 6 || Math.abs(o.z - c.z) > 6) continue;
      others.push({ x: o.x, z: o.z, r: entityRadius(o.kind) });
    }
    if (others.length) c = pushApart(c.x, c.z, rad, others);
    return resolveMove(c.x, c.z, rad);
  }

  tickMob(e, t) {
    const dt = WORLD.tickMs / 1000;
    const tgt = e.targetId ? this.entities.get(e.targetId) : null;
    if (tgt && !tgt.dead && dist(e, tgt) < 70) {
      if (dist(e, e.home) > 90) { e.targetId = null; return; } // laisse
      if (dist(e, tgt) > 4) this.moveToward(e, tgt.x, tgt.z, 9, dt);
      else if (t > (e.swingAt || 0)) {
        e.swingAt = t + 2000;
        this.dealDamage(e, tgt, Math.floor((6 + e.lvl * 2.4) * rand(0.85, 1.15)), 'Morsure');
      }
    } else {
      e.targetId = null;
      // cherche une cible proche (sauf furtifs)
      for (const o of this.entities.values()) {
        if ((o.kind === 'player' || o.kind === 'ai' || o.kind === 'companion') && !o.dead && !o.stealthed && dist(e, o) < 22) {
          e.targetId = o.id; break;
        }
      }
      if (!e.targetId && dist(e, e.home) > 2) this.moveToward(e, e.home.x, e.home.z, 7, dt);
    }
  }

  tickGuard(e, t) {
    const dt = WORLD.tickMs / 1000;
    const tgt = e.targetId ? this.entities.get(e.targetId) : null;
    if (tgt && !tgt.dead && dist(e, tgt) < 60) {
      if (dist(e, tgt) > 4) this.moveToward(e, tgt.x, tgt.z, 12, dt);
      else if (t > (e.swingAt || 0)) {
        e.swingAt = t + 1800;
        this.dealDamage(e, tgt, Math.floor(50 * rand(0.85, 1.15)), "Lame du garde");
      }
    } else {
      e.targetId = null;
      for (const o of this.entities.values()) {
        if ((o.kind === 'player' || o.kind === 'ai') && !o.dead && !o.stealthed && o.realm && o.realm !== e.realm && dist(e, o) < 35) {
          e.targetId = o.id; break;
        }
      }
      if (!e.targetId && dist(e, e.home) > 2) this.moveToward(e, e.home.x, e.home.z, 10, dt);
    }
  }

  tickAi(e, t) {
    const dt = WORLD.tickMs / 1000;
    // cible ennemie la plus proche
    let best = null, bestD = 50;
    for (const o of this.entities.values()) {
      if (o.dead || o.stealthed) continue;
      if ((o.kind === 'player' || o.kind === 'ai' || o.kind === 'companion' || o.kind === 'guard') && this.isEnemy(e, o)) {
        const d = dist(e, o);
        if (d < bestD) { best = o; bestD = d; }
      }
    }
    if (best) {
      e.targetId = best.id;
      const cls = classById(e.cls);
      const caster = ['caster', 'healer', 'support', 'archer'].includes(cls.arch);
      const rng = caster ? 30 : 4.5;
      if (bestD > rng) this.moveToward(e, best.x, best.z, 11, dt);
      else if (t > (e.swingAt || 0)) {
        e.swingAt = t + 2400;
        const type = caster ? 'spell' : 'melee';
        this.dealDamage(e, best, this.damageOf(e, type, 1.1), cls.sk[0]);
        // les soigneurs IA se soignent
        if (cls.arch === 'healer' && e.hp < e.maxHp * 0.5) {
          e.hp = Math.min(e.maxHp, e.hp + Math.floor(e.maxHp * 0.25));
        }
      }
    } else {
      e.targetId = null;
      // patrouille vers le fort puis autour
      if (!e.waypoint || dist(e, e.waypoint) < 8) {
        e.waypoint = Math.random() < 0.6
          ? { x: rand(-1, 1) * (FRONTIER.fortRadius + 30), z: rand(-1, 1) * (FRONTIER.fortRadius + 30) } // vers le fort
          : { x: e.home.x + rand(-100, 100), z: e.home.z + rand(-100, 100) };
      }
      this.moveToward(e, e.waypoint.x, e.waypoint.z, 8, dt);
    }
  }

  tickCompanion(e, t) {
    const dt = WORLD.tickMs / 1000;
    const owner = this.entities.get(e.ownerId);
    if (!owner || owner.dead) { if (!owner) this.entities.delete(e.id); return; }
    const cls = classById(e.cls);
    // soigneur : soigne le groupe
    if (cls.arch === 'healer' && t > (e.swingAt || 0)) {
      const wounded = this.group(owner).filter((g) => g.hp < g.maxHp * 0.75 && dist(e, g) < 30)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (wounded) {
        e.swingAt = t + 3000;
        const amt = Math.floor(25 + e.lvl * 5);
        wounded.hp = Math.min(wounded.maxHp, wounded.hp + amt);
        this.eventTo(owner, `${e.name} soigne ${wounded === owner ? 'vous' : wounded.name} (+${amt} PV).`, 'group');
        return;
      }
    }
    // assiste le propriétaire
    const tgt = owner.targetId ? this.entities.get(owner.targetId) : null;
    if (tgt && !tgt.dead && this.isEnemy(e, tgt) && owner.autoAttack !== false && (owner.lastCombat || 0) > t - 8000) {
      if (dist(e, tgt) > 4.5) this.moveToward(e, tgt.x, tgt.z, 12, dt);
      else if (t > (e.swingAt || 0)) {
        e.swingAt = t + 2200;
        this.dealDamage(e, tgt, this.damageOf(e, 'melee', 0.9), cls.sk[0]);
      }
    } else if (dist(e, owner) > 6) {
      this.moveToward(e, owner.x + rand(-3, 3), owner.z + rand(-3, 3), 14, dt);
    }
  }

  tickFort(t) {
    // capture : un joueur vivant dans l'enceinte du fort, aucun ennemi (joueur/IA) vivant à proximité
    const CAP = FRONTIER.fortRadius - 24;   // anneau de capture autour du donjon
    const CONTEST = FRONTIER.fortRadius + 6; // zone contestée (toute l'enceinte)
    let capturer = null;
    for (const e of this.entities.values()) {
      if (e.kind === 'player' && !e.dead && dist(e, this.fort) < CAP) { capturer = e; break; }
    }
    if (!capturer || capturer.realm === this.fort.owner) { this.fort.progress = 0; this.fort.capturer = null; return; }
    for (const e of this.entities.values()) {
      if ((e.kind === 'ai' || e.kind === 'player') && !e.dead && e.realm !== capturer.realm && dist(e, this.fort) < CONTEST) {
        this.fort.progress = 0; return; // contesté
      }
    }
    if (this.fort.capturer !== capturer.realm) { this.fort.progress = 0; this.fort.capturer = capturer.realm; }
    this.fort.progress += WORLD.tickMs / 1000;
    if (this.fort.progress >= 10) {
      this.fort.owner = capturer.realm;
      this.fort.progress = 0;
      this.gainXp(capturer, 2000);
      this.broadcastEvent(`🏰 Le Fort Central est tombé ! ${REALMS[capturer.realm].name} contrôle désormais la frontière ! (${capturer.name})`, 'rvr');
    }
  }

  // ============ DIFFUSION D'ÉTAT ============
  broadcastState() {
    for (const s of this.sessions) {
      const p = s.player;
      if (!p) continue;
      const ents = [];
      for (const e of this.entities.values()) {
        if (e.id === p.id) continue;
        if (e.dead && e.kind !== 'player') continue;
        if (dist(e, p) > WORLD.viewRange) continue;
        if (e.stealthed && e.realm !== p.realm) continue; // furtifs ennemis invisibles
        ents.push([
          e.id, e.kind, e.name, e.realm || '', e.cls || e.mobType || '', e.lvl,
          Math.round(e.x * 10) / 10, Math.round(e.z * 10) / 10, Math.round((e.ry || 0) * 100) / 100,
          Math.round((e.hp / e.maxHp) * 100), e.dead ? 1 : 0, e.kind === 'npc' ? e.role : '',
          e.race || '',
        ]);
      }
      this.send(s, MSG.STATE, {
        e: ents,
        me: { hp: p.hp, maxHp: p.maxHp, power: p.power, maxPower: p.maxPower, lvl: p.lvl, xp: p.xp, xpNext: xpForLevel(p.lvl + 1), gold: p.gold, stealthed: p.stealthed },
        fort: { owner: this.fort.owner, progress: this.fort.capturer === p.realm ? this.fort.progress : 0 },
      });
    }
  }
}

// Générateur de noms d'IA par royaume
const AI_NAMES = {
  alb: ['Cedric', 'Rowena', 'Aldous', 'Mathilde', 'Gareth', 'Lionel', 'Ysolde', 'Bedwyr'],
  hib: ['Niamh', 'Cathal', 'Aoife', 'Finnegan', 'Brigid', 'Deaglan', 'Saoirse', 'Ronan'],
  mid: ['Sigrid', 'Bjorn', 'Astrid', 'Leif', 'Gunnar', 'Freydis', 'Halvar', 'Ingrid'],
};
const usedNames = new Set();
function aiName(realm) {
  let n = pick(AI_NAMES[realm]);
  let i = 1;
  while (usedNames.has(n)) n = pick(AI_NAMES[realm]) + ' ' + ['le Brave', 'la Rusée', 'le Vaillant', "l'Ancien"][i++ % 4];
  usedNames.add(n);
  return n;
}
