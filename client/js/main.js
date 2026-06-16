// ============================================================
// REALMS AT WAR — client 3D low poly (Three.js)
// Textures procédurales, animations, effets de sorts
// ============================================================
import * as THREE from 'three';
import { Net } from './net.js';
import { UI } from './ui.js';
import { charCreate } from './charcreate.js';
import { charSelect, Roster } from './charselect.js';
import { Sound } from './sound.js';
import { REALMS, WORLD, FRONTIER, MSG, classById, ARCHETYPES, raceTraits } from '/shared/data.js';
import { SCENERY, resolveMove, pushApart, entityRadius } from '/shared/collision.js';

const net = new Net();
const ui = new UI(net);

// Initialise l'audio au premier geste de l'utilisateur (politique navigateur)
function initAudioOnce() {
  Sound.init(); Sound.resume();
  removeEventListener('pointerdown', initAudioOnce); removeEventListener('keydown', initAudioOnce);
}
addEventListener('pointerdown', initAudioOnce); addEventListener('keydown', initAudioOnce);

let selfId = null;
let me = { x: 0, z: 0, ry: 0, dead: false, stealthed: false };
let started = false;
let myClsId = null;

// ---------- Scène ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1320);
scene.fog = new THREE.Fog(0x0e1320, 220, 520);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1200);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

scene.add(new THREE.AmbientLight(0x8090b0, 0.9));
const sun = new THREE.DirectionalLight(0xfff2d0, 1.4);
sun.position.set(120, 220, 80);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = 300;
sun.shadow.camera.left = -sc; sun.shadow.camera.right = sc;
sun.shadow.camera.top = sc; sun.shadow.camera.bottom = -sc;
sun.shadow.camera.far = 700;
scene.add(sun);

const mat = (color, flat = true) => new THREE.MeshLambertMaterial({ color, flatShading: flat });

// ---------- Textures procédurales (légères, générées au chargement) ----------
function makeTex(size, repeat, draw) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const TEX = {
  grass: makeTex(256, 80, (ctx, s) => {
    ctx.fillStyle = '#39572f'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1600; i++) {
      const g = 70 + Math.random() * 60 | 0;
      ctx.fillStyle = `rgba(${g * 0.55 | 0},${g},${g * 0.45 | 0},${0.2 + Math.random() * 0.35})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 2 + Math.random() * 4);
    }
    for (let i = 0; i < 60; i++) { // touffes claires
      ctx.fillStyle = 'rgba(120,150,70,0.25)';
      ctx.beginPath(); ctx.arc(Math.random() * s, Math.random() * s, 3 + Math.random() * 7, 0, 7); ctx.fill();
    }
  }),
  stone: makeTex(256, 1, (ctx, s) => {
    ctx.fillStyle = '#83879a'; ctx.fillRect(0, 0, s, s);
    const bh = 32, bw = 64;
    for (let y = 0; y < s; y += bh) {
      const off = (y / bh) % 2 ? bw / 2 : 0;
      for (let x = -bw; x < s; x += bw) {
        const v = 115 + Math.random() * 50 | 0;
        ctx.fillStyle = `rgb(${v},${v + 4},${v + 16})`;
        ctx.fillRect(x + off + 2, y + 2, bw - 4, bh - 4);
        for (let i = 0; i < 14; i++) {
          ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
          ctx.fillRect(x + off + Math.random() * bw, y + Math.random() * bh, 3, 2);
        }
      }
    }
  }),
  wood: makeTex(128, 1, (ctx, s) => {
    ctx.fillStyle = '#8a6a44'; ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 32) {
      const v = 110 + Math.random() * 50 | 0;
      ctx.fillStyle = `rgb(${v},${v * 0.74 | 0},${v * 0.46 | 0})`;
      ctx.fillRect(x + 1, 0, 30, s);
      ctx.strokeStyle = 'rgba(40,25,10,0.5)'; ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, -2, 30, s + 4);
      for (let i = 0; i < 7; i++) { // veines
        ctx.strokeStyle = `rgba(60,40,20,${0.15 + Math.random() * 0.2})`; ctx.lineWidth = 1;
        ctx.beginPath();
        const gx = x + 4 + Math.random() * 24;
        ctx.moveTo(gx, 0); ctx.bezierCurveTo(gx + 5, s * .3, gx - 5, s * .6, gx, s);
        ctx.stroke();
      }
    }
  }),
  dirt: makeTex(256, 30, (ctx, s) => {
    ctx.fillStyle = '#6e5a40'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const v = 80 + Math.random() * 60 | 0;
      ctx.fillStyle = `rgba(${v},${v * 0.8 | 0},${v * 0.55 | 0},${0.25 + Math.random() * 0.3})`;
      ctx.beginPath(); ctx.arc(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 0, 7); ctx.fill();
    }
  }),
};

const texMat = (tex, color = 0xffffff) => new THREE.MeshLambertMaterial({ map: tex, color });
const stoneMat = () => texMat(TEX.stone);
const woodMat = () => texMat(TEX.wood);

// ---------- Monde low poly ----------
function buildWorld() {
  const half = WORLD.size / 2;
  const groundGeo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, 48, 48);
  groundGeo.rotateX(-Math.PI / 2);
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let h = Math.sin(x * 0.013) * Math.cos(z * 0.011) * 6 + Math.sin(x * 0.031 + z * 0.027) * 2.5;
    const flatten = Math.min(
      Math.hypot(x, z),
      ...Object.values(REALMS).map((r) => Math.hypot(x - r.base.x, z - r.base.z))
    );
    h *= THREE.MathUtils.clamp((flatten - 40) / 120, 0, 1);
    pos.setY(i, h);
  }
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, texMat(TEX.grass));
  ground.receiveShadow = true;
  scene.add(ground);

  // grande zone frontalière centrale : sol distinct, neutre
  const frontier = new THREE.Mesh(new THREE.CircleGeometry(FRONTIER.radius, 48), new THREE.MeshBasicMaterial({
    color: 0x6b6450, transparent: true, opacity: 0.16, depthWrite: false,
  }));
  frontier.rotation.x = -Math.PI / 2; frontier.position.y = 0.08;
  scene.add(frontier);

  // routes reliant chaque capitale au Fort Central
  const roadMat = texMat(TEX.dirt.clone(), 0xb3a589); roadMat.map.repeat.set(2, 24); roadMat.map.needsUpdate = true;
  for (const r of Object.values(REALMS)) {
    const len = Math.hypot(r.base.x, r.base.z) - FRONTIER.fortRadius;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(26, len), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.rotation.z = -Math.atan2(r.base.x, r.base.z);
    road.position.set(r.base.x * 0.5, 0.12, r.base.z * 0.5);
    road.receiveShadow = true;
    scene.add(road);
  }

  // esplanade de terre battue au pied du Fort Central
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(FRONTIER.fortRadius + 34, 32), texMat(TEX.dirt, 0xcccccc));
  plaza.material.map = TEX.dirt.clone(); plaza.material.map.repeat.set(10, 10); plaza.material.map.needsUpdate = true;
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.15;
  scene.add(plaza);

  // teintes de territoire autour de chaque capitale
  for (const r of Object.values(REALMS)) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(440, 24), new THREE.MeshBasicMaterial({
      color: r.color, transparent: true, opacity: 0.08, depthWrite: false,
    }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(r.base.x * 0.78, 0.25, r.base.z * 0.78);
    scene.add(disc);
  }

  // arbres / rochers — positions partagées avec le serveur (collisions)
  const treeGeo = new THREE.ConeGeometry(3.4, 10, 6);
  const trunkGeo = new THREE.CylinderGeometry(0.7, 0.9, 3.5, 5);
  const rockGeo = new THREE.DodecahedronGeometry(2.2, 0);
  for (const s of SCENERY) {
    if (s.type === 'tree') {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, woodMat());
      trunk.position.y = 1.7;
      const top = new THREE.Mesh(treeGeo, mat(s.z < -520 ? 0x4a6f6f : 0x2f6b33));
      top.position.y = 8; top.castShadow = true;
      g.add(trunk, top);
      g.position.set(s.x, 0, s.z);
      g.rotation.y = s.rot;
      scene.add(g);
    } else {
      const rock = new THREE.Mesh(rockGeo, stoneMat());
      rock.position.set(s.x, 1.2, s.z);
      rock.rotation.set(s.rot, s.rot * 1.7, s.rot * 0.6);
      rock.castShadow = true;
      scene.add(rock);
    }
  }

  for (const r of Object.values(REALMS)) buildCapital(r);
  buildFort();

  const mGeo = new THREE.ConeGeometry(60, 130, 5);
  for (let a = 0; a < Math.PI * 2; a += 0.22) {
    const m = new THREE.Mesh(mGeo, mat(0x39415a));
    m.position.set(Math.cos(a) * (half + 30), 20, Math.sin(a) * (half + 30));
    m.rotation.y = a;
    scene.add(m);
  }
}

function buildCapital(r) {
  const g = new THREE.Group();
  const c = r.color;
  const wallMat = stoneMat();
  const mkWall = (w, d, x, z, ry = 0) => {
    const wll = new THREE.Mesh(new THREE.BoxGeometry(w, 14, d), wallMat);
    wll.position.set(x, 7, z); wll.rotation.y = ry; wll.castShadow = true;
    g.add(wll);
  };
  mkWall(110, 4, 0, 42);
  mkWall(4, 88, -55, 0);
  mkWall(4, 88, 55, 0);
  const towerGeo = new THREE.CylinderGeometry(6, 7, 24, 6);
  const roofGeo = new THREE.ConeGeometry(8, 9, 6);
  for (const [tx, tz] of [[-55, 42], [55, 42], [-55, -42], [55, -42]]) {
    const tw = new THREE.Mesh(towerGeo, wallMat);
    tw.position.set(tx, 12, tz); tw.castShadow = true;
    const rf = new THREE.Mesh(roofGeo, mat(c));
    rf.position.set(tx, 28, tz);
    g.add(tw, rf);
  }
  const keep = new THREE.Mesh(new THREE.BoxGeometry(22, 30, 22), wallMat);
  keep.position.set(0, 15, 20); keep.castShadow = true;
  const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(17, 14, 4), mat(c));
  keepRoof.position.set(0, 37, 20); keepRoof.rotation.y = Math.PI / 4;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 16, 4), mat(0x444444));
  pole.position.set(0, 50, 20);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 0.3), mat(c));
  flag.position.set(4.2, 54, 20);
  g.add(keep, keepRoof, pole, flag);
  for (let i = 0; i < 6; i++) {
    const hx = -40 + (i % 3) * 32 + 6, hz = -20 + Math.floor(i / 3) * 38;
    const house = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 10), woodMat());
    house.position.set(hx, 4, hz); house.castShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(9.5, 6, 4), mat(0x7a4a36));
    roof.position.set(hx, 11, hz); roof.rotation.y = Math.PI / 4;
    g.add(house, roof);
  }
  g.position.set(r.base.x, 0, r.base.z);
  g.rotation.y = Math.atan2(-r.base.x, -r.base.z) + Math.PI;
  scene.add(g);
}

let fortFlagMat;
function buildFort() {
  const g = new THREE.Group();
  const stone = stoneMat();
  const FR = FRONTIER.fortRadius;
  const panHalf = FR * 0.62;
  // 4 pans de muraille crénelée (ouvertures = 4 portes franchissables)
  for (let a = 1; a < 8; a += 2) {
    const ang = (a / 8) * Math.PI * 2;
    const cx = Math.cos(ang) * FR, cz = Math.sin(ang) * FR;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(panHalf * 2, 16, 5), stone);
    wall.position.set(cx, 8, cz);
    wall.rotation.y = -ang + Math.PI / 2;
    wall.castShadow = true; wall.receiveShadow = true;
    g.add(wall);
    // créneaux (répartis le long du pan, direction tangente (-sin,cos))
    for (let k = -2; k <= 2; k++) {
      const cren = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 5.4), stone);
      const off = k * (panHalf / 2.5);
      cren.position.set(cx - Math.sin(ang) * off, 17, cz + Math.cos(ang) * off);
      cren.rotation.y = -ang + Math.PI / 2;
      g.add(cren);
    }
  }
  // 4 tours d'angle à toit conique
  for (let a = 0; a < 4; a++) {
    const ang = (a / 4) * Math.PI * 2 + Math.PI / 4;
    const tx = Math.cos(ang) * FR, tz = Math.sin(ang) * FR;
    const tw = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 30, 8), stone);
    tw.position.set(tx, 15, tz); tw.castShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(9, 11, 8), mat(0x555a66));
    roof.position.set(tx, 35, tz);
    g.add(tw, roof);
  }
  // donjon central
  const keep = new THREE.Mesh(new THREE.CylinderGeometry(15, 18, 34, 8), stone);
  keep.position.y = 17; keep.castShadow = true;
  const keepTop = new THREE.Mesh(new THREE.CylinderGeometry(17, 15, 5, 8), stone);
  keepTop.position.y = 36;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 26, 4), mat(0x333333));
  pole.position.y = 50;
  fortFlagMat = new THREE.MeshLambertMaterial({ color: 0xaaaaaa, flatShading: true });
  const flag = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 0.5), fortFlagMat);
  flag.position.set(6.5, 57, 0);
  g.add(keep, keepTop, pole, flag);
  scene.add(g);
}

// ---------- Effets visuels (sorts, impacts, soins) ----------
const fxList = [];
function addFx(obj, life, update) { scene.add(obj); fxList.push({ obj, life, max: life, update }); }
const fxMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
});

function spawnBurst(pos, color, n = 14, size = 0.4) {
  const g = new THREE.Group();
  g.position.copy(pos);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.TetrahedronGeometry(size * (0.6 + Math.random() * 0.8)), fxMat(color));
    const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2;
    const sp = 8 + Math.random() * 10;
    parts.push({ m, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp + 6, vz: Math.sin(a) * Math.cos(e) * sp });
    g.add(m);
  }
  addFx(g, 0.6, (f, dt) => {
    for (const p of parts) {
      p.vy -= 25 * dt;
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      p.m.rotation.x += dt * 8; p.m.rotation.y += dt * 6;
      p.m.material.opacity = f.life / f.max;
    }
  });
}

function spawnProjectile(from, getTarget, color, speed = 50, size = 0.5) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(size, 6, 5), fxMat(color));
  const trail = new THREE.Mesh(new THREE.SphereGeometry(size * 0.6, 5, 4), fxMat(color, 0.5));
  const g = new THREE.Group(); g.add(m, trail);
  g.position.set(from.x, 3.2, from.z);
  const start = g.position.clone();
  let t = 0;
  addFx(g, 3, (f, dt) => {
    const tp = getTarget();
    if (!tp) { f.life = 0; return; }
    const end = new THREE.Vector3(tp.x, 3.0, tp.z);
    const d = Math.max(start.distanceTo(end), 1);
    t += (speed * dt) / d;
    if (t >= 1) { spawnBurst(end, color, 12, 0.35); f.life = 0; return; }
    g.position.lerpVectors(start, end, t);
    g.position.y += Math.sin(t * Math.PI) * 3; // arc
    trail.position.copy(m.position).x -= 0.3;
    m.rotation.y += dt * 10;
  });
}

function spawnSparkles(getPos, color = 0x66ff88, dur = 1.1) {
  const g = new THREE.Group();
  const parts = [];
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), fxMat(color));
    const a = Math.random() * Math.PI * 2;
    m.position.set(Math.cos(a) * (0.6 + Math.random()), Math.random() * 1.5, Math.sin(a) * (0.6 + Math.random()));
    parts.push({ m, vy: 1.5 + Math.random() * 2 });
    g.add(m);
  }
  addFx(g, dur, (f, dt) => {
    const p = getPos();
    if (p) g.position.set(p.x, 1, p.z);
    for (const s of parts) {
      s.m.position.y += s.vy * dt;
      s.m.rotation.y += dt * 6;
      s.m.material.opacity = f.life / f.max;
    }
  });
}

function spawnRing(pos, color, maxR = 5) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.18, 6, 24), fxMat(color));
  m.rotation.x = -Math.PI / 2;
  m.position.set(pos.x, 0.5, pos.z);
  addFx(m, 0.7, (f, dt) => {
    const k = 1 - f.life / f.max;
    m.scale.setScalar(1 + k * maxR);
    m.material.opacity = 1 - k;
  });
}

// position d'une entité (suivie en continu pour les projectiles)
const entPos = (id) => () => {
  if (id === selfId) return { x: me.x, z: me.z };
  const e = entities.get(id);
  return e ? e.mesh.position : null;
};

// déclenche l'animation + les effets quand on lance une compétence
function castFx(slot) {
  const cls = classById(myClsId);
  if (!cls || !myMesh) return;
  const sk = ARCHETYPES[cls.arch].skills[slot];
  const tgt = targetId ? entities.get(targetId) : null;
  const selfPos = { x: me.x, z: me.z };
  const realmColor = REALMS[cls.realm].color;
  switch (sk.t) {
    case 'melee': case 'stun':
      startSwing(myMesh);
      if (tgt) setTimeout(() => spawnBurst(new THREE.Vector3(tgt.mesh.position.x, 2.5, tgt.mesh.position.z), sk.t === 'stun' ? 0xffe45c : 0xffbb88, 10, 0.3), 130);
      break;
    case 'ranged':
      startSwing(myMesh);
      if (tgt) spawnProjectile(selfPos, entPos(targetId), 0xfff0c0, 80, 0.25);
      break;
    case 'spell':
      if (tgt) spawnProjectile(selfPos, entPos(targetId), realmColor, 55, 0.5);
      break;
    case 'dot':
      if (tgt) spawnProjectile(selfPos, entPos(targetId), 0x88ff55, 45, 0.4);
      break;
    case 'aoe':
      if (tgt) {
        spawnProjectile(selfPos, entPos(targetId), realmColor, 55, 0.6);
        setTimeout(() => { const p = entPos(targetId)(); if (p) spawnRing(p, realmColor, 9); }, 500);
      }
      break;
    case 'heal':
      spawnSparkles(tgt && tgt.data.realm === cls.realm ? entPos(targetId) : entPos(selfId), 0x66ff88);
      break;
    case 'groupheal':
      spawnSparkles(entPos(selfId), 0x66ff88);
      spawnRing(selfPos, 0x66ff88, 7);
      break;
    case 'hot':
      spawnSparkles(tgt && tgt.data.realm === cls.realm ? entPos(targetId) : entPos(selfId), 0x99ffbb, 1.6);
      break;
    case 'buff':
      spawnRing(selfPos, 0xf0d889, 4);
      spawnSparkles(entPos(selfId), 0xf0d889, 0.8);
      break;
    case 'root':
      if (tgt) spawnRing(tgt.mesh.position, 0x77aa44, 3);
      break;
    case 'mez':
      if (tgt) spawnSparkles(entPos(targetId), 0xcc88ff, 1.4);
      break;
    case 'stealth':
      spawnBurst(new THREE.Vector3(me.x, 2, me.z), 0x8899aa, 16, 0.3);
      break;
  }
}

// les effets s'ajoutent aux envois réseau, sans toucher à la logique
const _origSend = net.send.bind(net);
net.send = (type, data = {}) => {
  if (started && type === MSG.SKILL) castFx(data.slot);
  if (started && type === MSG.ATTACK && data.on && myMesh) startSwing(myMesh);
  _origSend(type, data);
};

// ---------- Entités ----------
const entities = new Map();
const labelCache = new Map();

function makeLabel(text, color, hpPct) {
  const key = `${text}|${color}|${Math.round(hpPct / 5) * 5}`;
  if (labelCache.has(key)) return labelCache.get(key).clone();
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  const w = Math.min(250, ctx.measureText(text).width + 16);
  ctx.fillRect(128 - w / 2, 4, w, 30);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 27);
  ctx.fillStyle = '#222';
  ctx.fillRect(78, 40, 100, 9);
  ctx.fillStyle = hpPct > 50 ? '#4caf50' : hpPct > 25 ? '#ff9800' : '#f44336';
  ctx.fillRect(79, 41, 98 * Math.max(0, hpPct) / 100, 7);
  const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sp.scale.set(13, 3.2, 1);
  labelCache.set(key, sp);
  return sp.clone();
}

const KIND_COLORS = { mob: 0x8a6a4a, npc: 0xd8c060 };

// géométrie de membre avec pivot en haut (pour un balancement naturel)
function limb(w, h, d, color) {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, -h / 2, 0);
  return new THREE.Mesh(geo, mat(color));
}

function makeBody(kind, realm, cls, race) {
  const g = new THREE.Group();
  let color = realm ? REALMS[realm].color : (KIND_COLORS[kind] || 0x999999);
  let scale = 1;
  if (kind === 'mob') scale = 1.1;
  if (kind === 'guard') scale = 1.15;
  const anim = { phase: Math.random() * 6, swing: 0, arms: [], legs: [], weapon: null, body: null, bodyY: 0, prev: null };

  if (kind === 'mob') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 3.6), mat(color));
    body.position.y = 1.3; body.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.4), mat(color));
    head.position.set(0, 2.1, 2.1);
    g.add(body, head);
    anim.body = body; anim.bodyY = 1.3;
    for (const [lx, lz] of [[-0.9, 1.2], [0.9, 1.2], [-0.9, -1.2], [0.9, -1.2]]) {
      const leg = limb(0.5, 1.2, 0.5, 0x5a4630);
      leg.position.set(lx, 1.2, lz);
      anim.legs.push(leg);
      g.add(leg);
    }
  } else {
    const arch = cls ? classById(cls)?.arch : null;
    const robe = ['caster', 'healer', 'support'].includes(arch);
    const tr = race ? raceTraits(race) : { h: 1, w: 1, skin: 0xd9b48f, build: 'norm' };
    const skin = tr.skin;
    const bw = tr.build === 'stocky' ? 1.18 : tr.build === 'slim' ? 0.82 : 1; // largeur du buste selon la carrure

    // torse (robe pour les lanceurs, cuirasse sinon), teinté par la classe/le royaume
    const body = new THREE.Mesh(
      robe ? new THREE.ConeGeometry(1.2 * bw, 2.6, 7) : new THREE.BoxGeometry(1.6 * bw, 2.2, 0.95 * bw),
      mat(color)
    );
    body.position.y = robe ? 1.3 : 1.9; body.castShadow = true;
    anim.body = body; anim.bodyY = body.position.y;
    g.add(body);
    // ceinture / col pour casser la silhouette
    const belt = new THREE.Mesh(new THREE.BoxGeometry((robe ? 1.9 : 1.7) * bw, 0.35, (robe ? 1.9 : 1.0) * bw), mat(0x2a2d38));
    belt.position.y = robe ? 1.0 : 1.0; g.add(belt);

    // tête + cou, couleur de peau de la race
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.5, 6), mat(skin));
    neck.position.y = 3.0; g.add(neck);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.66 * (0.9 + bw * 0.1), 0), mat(skin));
    head.position.y = 3.5; g.add(head);
    // yeux (petits points sombres)
    for (const sx of [-0.22, 0.22]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), mat(0x20232c));
      eye.position.set(sx, 3.55, 0.55); g.add(eye);
    }
    // cheveux / calotte
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.7 * (0.9 + bw * 0.1), 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x3a2b1d));
    hair.position.y = 3.62; g.add(hair);

    // traits de race : oreilles, barbe, défenses
    if (tr.ears === 'pointy') {
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 4), mat(skin));
        ear.position.set(s * 0.62, 3.7, 0); ear.rotation.z = s * -0.5; g.add(ear);
      }
    }
    if (tr.beard) {
      const beard = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.8, 6), mat(0x6b5034));
      beard.position.set(0, 3.05, 0.42); beard.rotation.x = Math.PI; g.add(beard);
    }
    if (tr.tusks) {
      for (const s of [-1, 1]) {
        const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 5), mat(0xeae0c8));
        tusk.position.set(s * 0.2, 3.2, 0.5); g.add(tusk);
      }
    }

    // bras (peau) + mains, et jambes
    for (const s of [-1, 1]) {
      const arm = limb(0.42 * bw, 1.7, 0.42 * bw, skin);
      arm.position.set(s * (1.0 * bw + 0.15), 2.7, 0);
      anim.arms.push(arm); g.add(arm);
      const leg = limb(0.5 * bw, 1.5, 0.5 * bw, 0x33363f);
      leg.position.set(s * 0.42 * bw, 1.4, 0);
      anim.legs.push(leg); g.add(leg);
    }

    // arme tenue en main
    const wgeo = robe ? new THREE.CylinderGeometry(0.12, 0.12, 3.4, 5) : new THREE.BoxGeometry(0.22, 2.0, 0.22);
    if (!robe) wgeo.translate(0, 0.8, 0);
    const weapon = new THREE.Mesh(wgeo, mat(robe ? 0x8a6a3a : 0xc8ccd8));
    weapon.position.set(1.25 * bw + 0.2, robe ? 2.0 : 1.6, 0.2);
    anim.weapon = weapon; g.add(weapon);
    if (robe) { // pommeau lumineux pour les bâtons
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), mat(realm ? REALMS[realm].color : 0x9fd0ff));
      orb.position.set(weapon.position.x, 3.7, 0.2); g.add(orb);
    }

    if (kind === 'npc') {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.08, 6, 12), mat(0xf0d889));
      halo.rotation.x = Math.PI / 2; halo.position.y = 4.4;
      g.add(halo);
    }
    // applique la stature de la race (hauteur et largeur)
    scale *= 1;
    g.scale.set(scale * tr.w, scale * tr.h, scale * tr.w);
    g.userData.anim = anim;
    return g;
  }
  g.scale.setScalar(scale);
  g.userData.anim = anim;
  return g;
}

function startSwing(group) {
  const a = group.userData.anim;
  if (a) a.swing = 0.35;
}

// animation procédurale : marche, repos, coup d'arme
function animateBody(group, speed, dt, elapsed) {
  const a = group.userData.anim;
  if (!a) return;
  const moving = speed > 1.2;
  if (moving) a.phase += dt * Math.min(speed, 22) * 0.55;
  const sw = moving ? Math.sin(a.phase * 2.2) * 0.65 : 0;
  if (a.legs.length === 4) { // quadrupède
    a.legs[0].rotation.x = sw; a.legs[3].rotation.x = sw;
    a.legs[1].rotation.x = -sw; a.legs[2].rotation.x = -sw;
  } else if (a.legs.length === 2) {
    a.legs[0].rotation.x = sw; a.legs[1].rotation.x = -sw;
    if (a.arms[0]) { a.arms[0].rotation.x = -sw * 0.8; }
    if (a.arms[1]) { a.arms[1].rotation.x = sw * 0.8; }
  }
  if (a.body) {
    a.body.position.y = a.bodyY + (moving ? Math.abs(Math.sin(a.phase * 2.2)) * 0.14 : Math.sin(elapsed * 1.6 + a.phase) * 0.05);
  }
  if (a.weapon) {
    if (a.swing > 0) {
      a.swing -= dt;
      const k = 1 - Math.max(a.swing, 0) / 0.35;
      a.weapon.rotation.x = -Math.sin(k * Math.PI) * 1.7;
    } else {
      a.weapon.rotation.x = moving ? sw * 0.3 : Math.sin(elapsed * 1.6 + a.phase) * 0.06;
    }
  }
}

function labelColor(kind, realm, myRealm) {
  if (kind === 'npc') return '#f0d889';
  if (kind === 'mob') return '#e0b070';
  if (!realm) return '#ffffff';
  if (realm === myRealm) return '#8fd4ff';
  return '#ff6b5b';
}

function syncEntities(list, myRealm) {
  const seen = new Set();
  for (const a of list) {
    const [id, kind, name, realm, cls, lvl, x, z, ry, hpPct, dead, role, race] = a;
    seen.add(id);
    let e = entities.get(id);
    if (!e) {
      const mesh = makeBody(kind, realm || null, cls, race || null);
      scene.add(mesh);
      e = { mesh, data: {}, label: null, labelKey: '' };
      entities.set(id, e);
      mesh.position.set(x, 0, z);
    }
    // impact visuel quand l'entité perd de la vie
    if (e.data.hpPct !== undefined && hpPct < e.data.hpPct - 1 && !dead) {
      spawnBurst(new THREE.Vector3(e.mesh.position.x, 2.5, e.mesh.position.z), 0xff5544, 6, 0.22);
      startSwing(e.mesh);
    }
    if (!e.data.dead && dead) spawnBurst(new THREE.Vector3(e.mesh.position.x, 1.5, e.mesh.position.z), 0x888888, 16, 0.35);
    e.data = { id, kind, name, realm, cls, lvl, hpPct, dead, role };
    e.tx = x; e.tz = z; e.try = ry;
    const lk = `${name} [${lvl}]|${hpPct}`;
    if (e.labelKey !== lk) {
      if (e.label) e.mesh.remove(e.label);
      e.label = makeLabel(`${name} [${lvl}]`, labelColor(kind, realm, myRealm), hpPct);
      e.label.position.y = kind === 'mob' ? 4.5 : 5.6;
      e.mesh.add(e.label);
      e.labelKey = lk;
    }
    e.mesh.visible = !dead;
  }
  for (const [id, e] of entities) {
    if (!seen.has(id)) { scene.remove(e.mesh); entities.delete(id); }
  }
}

// ---------- Joueur local ----------
let myMesh = null;
function initSelf(create) {
  myMesh = makeBody('player', create.realm, create.cls, create.race);
  scene.add(myMesh);
  const base = REALMS[create.realm].base;
  me.x = base.x; me.z = base.z;
  myMesh.position.set(me.x, 0, me.z);
}

// ---------- Caméra & contrôles ----------
let camYaw = 0, camPitch = 0.45, camDist = 26;
let dragging = false, lastMx = 0, lastMy = 0;
const keys = {};

addEventListener('keydown', (e) => {
  if (ui.chatOpen) return;
  if (e.code === 'Enter') { ui.toggleChat(true); e.preventDefault(); return; }
  keys[e.code] = true;
  if (e.code === 'KeyM') { const m = Sound.toggle(); ui.log(m ? '🔇 Sons coupés (M)' : '🔊 Sons activés (M)', 'info'); }
  if (e.code.startsWith('Digit')) {
    const n = parseInt(e.code.slice(5), 10);
    if (n >= 1 && n <= 9) { net.send(MSG.SKILL, { slot: n - 1 }); Sound.play('cast'); }
  }
  if (e.code === 'KeyR') net.send(MSG.ATTACK, { on: true });
  if (e.code === 'KeyT') net.send(MSG.USE_ITEM, { id: 'potion_hp' });
  if (e.code === 'KeyY') net.send(MSG.USE_ITEM, { id: 'potion_pw' });
  if (e.code === 'KeyJ') ui.toggleQuestLog();
  if (e.code === 'KeyI') ui.toggleInventory();
  if (e.code === 'KeyF') targetNearest();
  if (e.code === 'KeyE') interactNearest();
  if (e.code === 'Escape') { setTarget(null); document.getElementById('dialog').classList.add('hidden'); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

renderer.domElement.addEventListener('mousedown', (e) => {
  dragging = true; lastMx = e.clientX; lastMy = e.clientY;
});
addEventListener('mouseup', () => { dragging = false; });
addEventListener('mousemove', (e) => {
  if (!dragging) return;
  camYaw -= (e.clientX - lastMx) * 0.005;
  camPitch = THREE.MathUtils.clamp(camPitch + (e.clientY - lastMy) * 0.004, 0.12, 1.25);
  lastMx = e.clientX; lastMy = e.clientY;
});
addEventListener('wheel', (e) => {
  camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.03, 10, 70);
});

const raycaster = new THREE.Raycaster();
let dragMoved = false;
renderer.domElement.addEventListener('mousedown', () => { dragMoved = false; });
addEventListener('mousemove', () => { if (dragging) dragMoved = true; });
renderer.domElement.addEventListener('click', (e) => {
  if (dragMoved) return;
  const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  let best = null, bestD = Infinity;
  for (const [id, ent] of entities) {
    if (ent.data.dead) continue;
    const box = new THREE.Box3().setFromObject(ent.mesh);
    const hit = raycaster.ray.intersectsBox(box);
    if (hit) {
      const d = ent.mesh.position.distanceTo(camera.position);
      if (d < bestD) { bestD = d; best = id; }
    }
  }
  if (best) setTarget(best);
});

let targetId = null;
function setTarget(id) {
  targetId = id;
  net.send(MSG.TARGET, { id }); Sound.play('target');
  updateTargetFrame();
}
function updateTargetFrame() {
  const ent = targetId ? entities.get(targetId) : null;
  ui.setTarget(ent ? { ...ent.data } : null);
}
function targetNearest() {
  let best = null, bestD = 60;
  for (const [id, ent] of entities) {
    const d = ent.data;
    if (d.dead || d.kind === 'npc') continue;
    const enemy = d.kind === 'mob' || (d.realm && d.realm !== myRealmId);
    if (!enemy) continue;
    const dd = Math.hypot(ent.tx - me.x, ent.tz - me.z);
    if (dd < bestD) { bestD = dd; best = id; }
  }
  if (best) setTarget(best);
}
function interactNearest() {
  let best = null, bestD = 12;
  for (const [id, ent] of entities) {
    if (ent.data.kind !== 'npc') continue;
    const dd = Math.hypot(ent.tx - me.x, ent.tz - me.z);
    if (dd < bestD) { bestD = dd; best = id; }
  }
  if (best) net.send(MSG.INTERACT, { id: best });
}

// ---------- Réseau ----------
let myRealmId = null;
let prevFortOwner;

net.on(MSG.WELCOME, (m) => {
  selfId = m.selfId;
  // place le personnage à sa position réelle (restaurée le cas échéant)
  if (m.spawn && myMesh) {
    me.x = m.spawn.x; me.z = m.spawn.z;
    myMesh.position.set(me.x, 0, me.z);
  }
});
net.on(MSG.SELF, (m) => {
  const s = m.self;
  if (!ui.cls) ui.setIdentity(s);
  if (myChar) Roster.update(myChar.name, myChar.realm, myChar.cls, { lvl: s.lvl, gold: s.gold });
  ui.setSelf(s);
  ui.setCooldowns(s.cooldowns);
  ui.updateQuestLog(s.quests);
  me.dead = s.dead;
  me.stealthed = s.stealthed;
});
net.on(MSG.STATE, (m) => {
  syncEntities(m.e, myRealmId);
  ui.setSelf({ ...m.me, name: undefined });
  me.stealthed = m.me.stealthed;
  ui.setFort(m.fort.owner, m.fort.progress);
  if (prevFortOwner !== undefined && m.fort.owner !== prevFortOwner && m.fort.owner) Sound.play('fort');
  prevFortOwner = m.fort.owner;
  if (fortFlagMat) fortFlagMat.color.setHex(m.fort.owner ? REALMS[m.fort.owner].color : 0xaaaaaa);
  updateTargetFrame();
  if (targetId && !entities.has(targetId)) { targetId = null; ui.setTarget(null); }
});
net.on(MSG.EVENT, (m) => {
  ui.log(m.text, m.cat);
  if (m.shop) ui.showShop(m.shop);
  if (m.quests) ui.showQuests(m.quests);
  if (m.trainer) ui.showTrainer(m.trainer);
  if (m.armory) ui.showArmory(m.armory);
  if (m.loot && myMesh) spawnSparkles(entPos(selfId), 0xf0d889, 1.3);
  // sons selon l'événement
  if (m.loot || m.cat === 'loot') Sound.play('loot');
  else if (m.cat === 'levelup') Sound.play('levelup');
  else if (m.cat === 'rvr') Sound.play(/🏰/.test(m.text) ? 'fort' : 'kill');
  else if (m.cat === 'quest') Sound.play('quest');
  else if (m.cat === 'system' && /apprise/i.test(m.text)) Sound.play('learn');
  else if (m.cat === 'combat') Sound.play(/PV|soign/i.test(m.text) ? 'heal' : 'hit');
  if (m.cat === 'levelup' && myMesh) {
    spawnRing({ x: me.x, z: me.z }, 0xffe45c, 8);
    spawnSparkles(entPos(selfId), 0xffe45c, 1.6);
  }
});
net.on(MSG.CHAT_BC, (m) => ui.log(`[${m.from}] ${m.text}`, 'chat'));
net.on(MSG.DEAD, () => { me.dead = true; ui.death(true); Sound.play('death'); });

// ---------- Boucle ----------
const clock = new THREE.Clock();
let moveAcc = 0;
let myPrev = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.elapsedTime;

  if (started && myMesh) {
    if (!me.dead && !ui.chatOpen) {
      let fwd = 0, strafe = 0;
      if (keys.KeyW || keys.KeyZ || keys.ArrowUp) fwd += 1;
      if (keys.KeyS || keys.ArrowDown) fwd -= 1;
      if (keys.KeyA || keys.KeyQ || keys.ArrowLeft) strafe += 1;
      if (keys.KeyD || keys.ArrowRight) strafe -= 1;
      if (fwd || strafe) {
        const speed = me.stealthed ? 8 : 16;
        const ang = camYaw + Math.atan2(strafe, fwd);
        me.x += Math.sin(ang) * speed * dt;
        me.z += Math.cos(ang) * speed * dt;
        // prédiction des collisions (le serveur reste autoritaire)
        let cpos = resolveMove(me.x, me.z, 1.0);
        const others = [];
        for (const ent of entities.values()) {
          if (ent.data.dead || ent.data.kind === 'companion') continue;
          const p = ent.mesh.position;
          if (Math.abs(p.x - cpos.x) > 6 || Math.abs(p.z - cpos.z) > 6) continue;
          others.push({ x: p.x, z: p.z, r: entityRadius(ent.data.kind) });
        }
        if (others.length) cpos = pushApart(cpos.x, cpos.z, 1.0, others);
        me.x = cpos.x; me.z = cpos.z;
        me.ry = ang;
        myMesh.rotation.y = ang;
      }
      moveAcc += dt;
      if (moveAcc > 0.1) { moveAcc = 0; net.send(MSG.MOVE, { x: me.x, z: me.z, ry: me.ry }); }
    }
    myMesh.position.set(me.x, 0, me.z);
    myMesh.visible = !me.dead;
    myMesh.traverse((o) => { if (o.material && !o.material.map) { o.material.transparent = me.stealthed; o.material.opacity = me.stealthed ? 0.35 : 1; } });

    // animation du joueur local
    const mySpeed = myMesh.position.distanceTo(myPrev) / Math.max(dt, 0.001);
    myPrev.copy(myMesh.position);
    animateBody(myMesh, mySpeed, dt, elapsed);

    // interpolation + animation des autres entités
    for (const ent of entities.values()) {
      const p = ent.mesh.position;
      const px = p.x, pz = p.z;
      p.x += (ent.tx - p.x) * Math.min(1, dt * 8);
      p.z += (ent.tz - p.z) * Math.min(1, dt * 8);
      ent.mesh.rotation.y += (ent.try - ent.mesh.rotation.y) * Math.min(1, dt * 8);
      const spd = Math.hypot(p.x - px, p.z - pz) / Math.max(dt, 0.001);
      animateBody(ent.mesh, spd, dt, elapsed);
    }

    // effets visuels
    fxUpdate(dt);

    // caméra orbitale
    const cx = me.x + Math.sin(camYaw) * -camDist * Math.cos(camPitch);
    const cz = me.z + Math.cos(camYaw) * -camDist * Math.cos(camPitch);
    const cy = 3 + Math.sin(camPitch) * camDist;
    camera.position.set(cx, cy, cz);
    camera.lookAt(me.x, 4, me.z);
    sun.position.set(me.x + 120, 220, me.z + 80);
    sun.target.position.set(me.x, 0, me.z);
    sun.target.updateMatrixWorld();
  }

  renderer.render(scene, camera);
}

function fxUpdate(dt) {
  for (let i = fxList.length - 1; i >= 0; i--) {
    const f = fxList[i];
    f.update(f, dt);
    f.life -= dt;
    if (f.life <= 0) {
      f.obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      scene.remove(f.obj);
      fxList.splice(i, 1);
    }
  }
}

// ---------- Démarrage ----------
buildWorld();
animate();

let myChar = null;

async function enterGame(create) {
  await net.ready;
  myRealmId = create.realm;
  myClsId = create.cls;
  myChar = { name: create.name, realm: create.realm, cls: create.cls };
  Roster.upsert(create); // mémorise le personnage dans le roster local (écran de sélection)
  net.send(MSG.CREATE, create);
  initSelf(create);
  started = true;
  document.getElementById('charselect').classList.add('hidden');
  document.getElementById('charcreate').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  ui.log(`Bienvenue dans ${REALMS[create.realm].name}, ${create.name} !`, 'system');
  ui.log("Parlez à l'émissaire (E) pour obtenir des quêtes. Le Fort Central vous attend au centre de la grande zone frontalière.", 'info');
}

function beginCreate() {
  document.getElementById('charselect').classList.add('hidden');
  document.getElementById('charcreate').classList.remove('hidden');
  charCreate(enterGame);
}

// Au lancement : écran de sélection si au moins un personnage existe, sinon création
if (!charSelect({ onPlay: enterGame, onCreate: beginCreate })) beginCreate();
