// ============================================================
// REALMS AT WAR — client 3D low poly (Three.js)
// Textures procédurales, animations, effets de sorts
// ============================================================
import * as THREE from 'three';
import { Net } from './net.js';
import { UI } from './ui.js';
import { charCreate } from './charcreate.js';
import { charSelect, charSelectServer, Roster } from './charselect.js';
import { guestId, mountGoogle } from './auth.js';
import { Sound } from './sound.js';
import { setupMovableUI, resetUI } from './uikit.js';
import { tryLoadModel, updateModelMixers, updateModelAnim, playModelAction } from './models.js';
import { REALMS, WORLD, FRONTIER, MSG, classById, ARCHETYPES, raceTraits } from '/shared/data.js';
import { SCENERY, resolveMove, pushApart, entityRadius } from '/shared/collision.js';
import { terrainHeight, walkable } from '/shared/terrain.js';

const net = new Net();
const ui = new UI(net);

// Initialise l'audio au premier geste de l'utilisateur (politique navigateur)
function initAudioOnce() {
  Sound.init(); Sound.resume();
  removeEventListener('pointerdown', initAudioOnce); removeEventListener('keydown', initAudioOnce);
}
addEventListener('pointerdown', initAudioOnce); addEventListener('keydown', initAudioOnce);

// panneaux du HUD déplaçables / redimensionnables (disposition mémorisée)
setupMovableUI();

let selfId = null;
let me = { x: 0, z: 0, ry: 0, dead: false, stealthed: false };
let started = false;
let myClsId = null;

// ---------- Scène ----------
const SKY_TOP = 0x3f6fb0, SKY_HORIZON = 0xbcd3e6;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY_HORIZON);
scene.fog = new THREE.Fog(SKY_HORIZON, 380, 1700);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 5000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ciel en dégradé
{
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 256;
  const g = cv.getContext('2d').createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#39669f'); g.addColorStop(0.55, '#8fb6d8'); g.addColorStop(1, '#d3e4ee');
  const c = cv.getContext('2d'); c.fillStyle = g; c.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3200, 24, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
  scene.add(dome);
}

// éclairage : ciel/sol + soleil chaud avec ombres douces
scene.add(new THREE.HemisphereLight(0xbcd6ec, 0x4a4733, 0.85));
const sun = new THREE.DirectionalLight(0xfff1da, 2.4);
sun.position.set(160, 320, 120);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
const sc = 230;
sun.shadow.camera.left = -sc; sun.shadow.camera.right = sc;
sun.shadow.camera.top = sc; sun.shadow.camera.bottom = -sc;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 900;
scene.add(sun, sun.target);

const mat = (color, rough = 0.9, metal = 0.0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

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

const texMat = (tex, color = 0xffffff) => new THREE.MeshStandardMaterial({ map: tex, color, roughness: 0.95, metalness: 0.0 });
const stoneMat = () => texMat(TEX.stone);
const woodMat = () => texMat(TEX.wood);

// ---------- Biomes ----------
const BIOME = {
  alb:      { ground: 0x5a7d3a, grassCol: 0x6f9a3c, flowers: [0xffe24a, 0xffffff, 0xff7d9c], foliage: 0x2f6b33, density: 1.0, pines: 0.2, snow: false },
  hib:      { ground: 0x376b30, grassCol: 0x3f8a34, flowers: [0xb066ff, 0xff77cc, 0xfff0a0], foliage: 0x256b34, density: 1.8, pines: 0.5, snow: false },
  mid:      { ground: 0x9fb0bb, grassCol: 0x8fa39a, flowers: [0xbfe0ef], foliage: 0x35563f, density: 0.5, pines: 1.0, snow: true },
  frontier: { ground: 0x7a6f4a, grassCol: 0x847848, flowers: [], foliage: 0x4a5a32, density: 0.4, pines: 0.05, snow: false },
};
function biomeAt(x, z) {
  if (Math.hypot(x, z) < FRONTIER.radius * 0.9) return 'frontier';
  let best = 'frontier', bd = Infinity;
  for (const r of Object.values(REALMS)) { const d = Math.hypot(x - r.base.x, z - r.base.z); if (d < bd) { bd = d; best = r.id; } }
  return best;
}
function srand(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// essences d'arbres par biome (forme + couleurs)
const TREE = {
  alb:      { trunk: 0x6e4a2c, canopy: 0x4f7a33, shape: 'broad' },
  hib:      { trunk: 0x5e4126, canopy: 0x356e2b, shape: 'broad' },
  mid:      { trunk: 0x584434, canopy: 0x2f5540, shape: 'pine' },
  frontier: { trunk: 0x6b5a44, canopy: 0x6a6a40, shape: 'pine' },
};

// Arbres droits (instanciés par essence) + rochers, posés sur le relief
function buildTreesAndRocks() {
  const dummy = new THREE.Object3D(); const col = new THREE.Color();
  const trees = SCENERY.filter((s) => s.type === 'tree');
  const rocks = SCENERY.filter((s) => s.type === 'rock');
  const bySpec = {};
  for (const t of trees) (bySpec[t.species || 'alb'] ||= []).push(t);

  for (const sp in bySpec) {
    const list = bySpec[sp]; const P = TREE[sp] || TREE.alb;
    const trunkGeo = new THREE.CylinderGeometry(0.42, 0.85, 8, 8); trunkGeo.translate(0, 4, 0);
    const trunkIM = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: P.trunk, roughness: 0.95 }), list.length);
    let g1, g2;
    if (P.shape === 'pine') {
      const a = new THREE.ConeGeometry(2.7, 8, 9); a.translate(0, 9, 0);
      const b = new THREE.ConeGeometry(1.8, 5.5, 9); b.translate(0, 13, 0);
      g1 = a; g2 = b;
    } else {
      const a = new THREE.IcosahedronGeometry(3.2, 1); a.translate(0, 9.5, 0);
      const b = new THREE.IcosahedronGeometry(2.3, 1); b.translate(1.5, 11.6, 0.5);
      g1 = a; g2 = b;
    }
    const cMat = () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    const c1 = new THREE.InstancedMesh(g1, cMat(), list.length);
    const c2 = new THREE.InstancedMesh(g2, cMat(), list.length);
    trunkIM.castShadow = c1.castShadow = c2.castShadow = true;
    list.forEach((t, i) => {
      const y = terrainHeight(t.x, t.z);
      dummy.position.set(t.x, y, t.z);
      dummy.rotation.set(0, t.rot, 0);
      dummy.scale.set(t.scale, t.scale * (0.9 + ((i * 17) % 5) * 0.06), t.scale);
      dummy.updateMatrix();
      trunkIM.setMatrixAt(i, dummy.matrix); c1.setMatrixAt(i, dummy.matrix); c2.setMatrixAt(i, dummy.matrix);
      col.setHex(P.canopy).offsetHSL(0, (((i * 31) % 100) / 100 - 0.5) * 0.08, (((i * 97) % 100) / 100 - 0.5) * 0.12);
      c1.setColorAt(i, col); c2.setColorAt(i, col);
    });
    [trunkIM, c1, c2].forEach((im) => { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; });
    scene.add(trunkIM, c1, c2);
  }

  // rochers (boulders) posés sur le sol
  if (rocks.length) {
    const rockGeo = new THREE.DodecahedronGeometry(2.0, 0);
    const rockIM = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0 }), rocks.length);
    rockIM.castShadow = true; rockIM.receiveShadow = true;
    rocks.forEach((s, i) => {
      const y = terrainHeight(s.x, s.z);
      dummy.position.set(s.x, y + 0.5 * s.scale, s.z);
      dummy.rotation.set(s.rot, s.rot * 1.7, s.rot * 0.6);
      dummy.scale.setScalar(s.scale); dummy.updateMatrix();
      rockIM.setMatrixAt(i, dummy.matrix);
      col.setHSL(0.08, 0.04, 0.42 + ((i * 53) % 100) / 100 * 0.16); rockIM.setColorAt(i, col);
    });
    rockIM.instanceMatrix.needsUpdate = true; if (rockIM.instanceColor) rockIM.instanceColor.needsUpdate = true;
    scene.add(rockIM);
  }
}

// ---------- Monde low poly ----------
function buildWorld() {
  const half = WORLD.size / 2;
  const SEG = 110;
  const groundGeo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, SEG, SEG);
  groundGeo.rotateX(-Math.PI / 2);
  const pos = groundGeo.attributes.position;
  const COL = []; const tmpc = new THREE.Color(); const snowC = new THREE.Color(0xeef3f8);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z); // relief partagé avec le serveur
    pos.setY(i, h);
    const b = BIOME[biomeAt(x, z)];
    tmpc.setHex(b.ground);
    if (b.snow) tmpc.lerp(snowC, 0.45);
    if (h > 34) tmpc.lerp(snowC, Math.min(0.9, (h - 34) / 40)); // sommets enneigés
    COL.push(tmpc.r, tmpc.g, tmpc.b);
  }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(COL, 3));
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ map: TEX.grass, vertexColors: true, roughness: 1.0, metalness: 0.0 }));
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

  // arbres droits regroupés en forêts + rochers (positions partagées = collisions)
  buildTreesAndRocks();

  for (const r of Object.values(REALMS)) buildCapital(r);
  buildFort();

  // chaîne de montagnes en bordure, sommets enneigés
  for (let a = 0; a < Math.PI * 2; a += 0.15) {
    const rr = half + 18 + Math.sin(a * 7) * 45;
    const hgt = 120 + Math.sin(a * 5) * 55 + Math.cos(a * 11) * 25;
    const peak = new THREE.Mesh(new THREE.ConeGeometry(72, hgt, 5), mat(0x495064));
    peak.position.set(Math.cos(a) * rr, hgt / 2 - 12, Math.sin(a) * rr); peak.rotation.y = a * 3;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(72 * 0.4, hgt * 0.34, 5), mat(0xeef3f8));
    cap.position.set(peak.position.x, hgt - 12 - hgt * 0.05, peak.position.z); cap.rotation.y = peak.rotation.y;
    scene.add(peak, cap);
  }
  buildScenery(half);
}

// Sous-bois instancié non-bloquant : herbe, fleurs, buissons (posés sur le relief)
function buildScenery(half) {
  const rnd = srand(13371);
  const dummy = new THREE.Object3D(); const col = new THREE.Color();
  const ok = (x, z) => Math.abs(x) < half * 0.95 && Math.abs(z) < half * 0.95 &&
    Math.hypot(x, z) > FRONTIER.fortRadius + 28 &&
    terrainHeight(x, z) < 26 &&
    !Object.values(REALMS).some((r) => Math.hypot(x - r.base.x, z - r.base.z) < 60);
  const SMAT = (extra) => new THREE.MeshStandardMaterial(Object.assign({ color: 0xffffff, roughness: 0.9 }, extra || {}));

  // --- herbe ---
  const blade = new THREE.ConeGeometry(0.13, 1.1, 4); blade.translate(0, 0.55, 0);
  const GN = 4600; const grass = new THREE.InstancedMesh(blade, SMAT(), GN);
  let gi = 0;
  for (let i = 0; i < GN * 3 && gi < GN; i++) {
    const x = (rnd() - 0.5) * WORLD.size * 0.95, z = (rnd() - 0.5) * WORLD.size * 0.95;
    if (!ok(x, z)) continue; const b = BIOME[biomeAt(x, z)];
    if (rnd() > b.density * 0.55) continue;
    dummy.position.set(x, terrainHeight(x, z), z); dummy.rotation.y = rnd() * 6.28;
    const s = 0.6 + rnd() * 1.3; dummy.scale.set(s, s * (0.7 + rnd()), s); dummy.updateMatrix();
    grass.setMatrixAt(gi, dummy.matrix); col.setHex(b.grassCol).offsetHSL(0, 0, (rnd() - 0.5) * 0.12); grass.setColorAt(gi, col); gi++;
  }
  grass.count = gi; grass.instanceMatrix.needsUpdate = true; if (grass.instanceColor) grass.instanceColor.needsUpdate = true; scene.add(grass);

  // --- fleurs ---
  const bloom = new THREE.IcosahedronGeometry(0.26, 0); bloom.translate(0, 0.55, 0);
  const FN = 1300; const flowers = new THREE.InstancedMesh(bloom, SMAT(), FN);
  let fi = 0;
  for (let i = 0; i < FN * 4 && fi < FN; i++) {
    const x = (rnd() - 0.5) * WORLD.size * 0.95, z = (rnd() - 0.5) * WORLD.size * 0.95;
    if (!ok(x, z)) continue; const b = BIOME[biomeAt(x, z)];
    if (!b.flowers.length || rnd() > b.density * 0.4) continue;
    dummy.position.set(x, terrainHeight(x, z), z); dummy.rotation.y = rnd() * 6.28; const s = 0.7 + rnd() * 0.8; dummy.scale.setScalar(s); dummy.updateMatrix();
    flowers.setMatrixAt(fi, dummy.matrix); col.setHex(b.flowers[(rnd() * b.flowers.length) | 0]); flowers.setColorAt(fi, col); fi++;
  }
  flowers.count = fi; flowers.instanceMatrix.needsUpdate = true; if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true; scene.add(flowers);

  // --- buissons ---
  const bushG = new THREE.IcosahedronGeometry(1.15, 1); const BN = 700;
  const bushes = new THREE.InstancedMesh(bushG, SMAT({ roughness: 0.85 }), BN);
  let bi = 0;
  for (let i = 0; i < BN * 4 && bi < BN; i++) {
    const x = (rnd() - 0.5) * WORLD.size * 0.92, z = (rnd() - 0.5) * WORLD.size * 0.92;
    if (!ok(x, z)) continue; const b = BIOME[biomeAt(x, z)];
    if (rnd() > b.density * 0.3) continue;
    dummy.position.set(x, terrainHeight(x, z) + 0.7 + rnd() * 0.4, z); dummy.rotation.set(rnd(), rnd() * 6.28, rnd()); const s = 0.7 + rnd() * 1.0; dummy.scale.setScalar(s); dummy.updateMatrix();
    bushes.setMatrixAt(bi, dummy.matrix); col.setHex(b.foliage).offsetHSL(0, 0, (rnd() - 0.5) * 0.08); bushes.setColorAt(bi, col); bi++;
  }
  bushes.count = bi; bushes.instanceMatrix.needsUpdate = true; if (bushes.instanceColor) bushes.instanceColor.needsUpdate = true; bushes.castShadow = true; scene.add(bushes);
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

// flash plein écran (DOM) pour les moments forts
function screenFlash(color = 'rgba(255,228,120,0.5)', ms = 520) {
  const d = document.createElement('div');
  d.style.cssText = `position:fixed;inset:0;background:${color};pointer-events:none;z-index:200;opacity:0.8;transition:opacity ${ms}ms ease-out;`;
  document.body.appendChild(d);
  requestAnimationFrame(() => { d.style.opacity = '0'; });
  setTimeout(() => d.remove(), ms + 100);
}

// super effet de montée de niveau
function spawnLevelUp(pos) {
  const gold = 0xffe45c, gold2 = 0xfff0b0;
  // pilier de lumière tournant
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, 28, 16, 1, true), fxMat(gold, 0.5));
  pillar.position.set(pos.x, 14, pos.z);
  addFx(pillar, 1.2, (f, dt) => {
    const k = 1 - f.life / f.max;
    pillar.scale.set(1 + k * 0.7, 1, 1 + k * 0.7);
    pillar.rotation.y += dt * 2.5;
    pillar.material.opacity = 0.5 * (1 - k);
  });
  // halo au sol
  const halo = new THREE.Mesh(new THREE.CircleGeometry(6, 28), fxMat(gold2, 0.6));
  halo.rotation.x = -Math.PI / 2; halo.position.set(pos.x, 0.3, pos.z);
  addFx(halo, 1.0, (f, dt) => { const k = 1 - f.life / f.max; halo.scale.setScalar(1 + k * 1.8); halo.material.opacity = 0.6 * (1 - k); });
  // anneaux concentriques échelonnés
  spawnRing(pos, gold, 7);
  setTimeout(() => spawnRing(pos, gold2, 11), 150);
  setTimeout(() => spawnRing(pos, gold, 16), 320);
  // colonne de particules ascendantes
  const col = new THREE.Group(); col.position.set(pos.x, 0, pos.z);
  const parts = [];
  for (let i = 0; i < 30; i++) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), fxMat(i % 2 ? gold : gold2));
    const a = Math.random() * Math.PI * 2, r = Math.random() * 2.4;
    m.position.set(Math.cos(a) * r, Math.random() * 2, Math.sin(a) * r);
    parts.push({ m, vy: 7 + Math.random() * 8, spin: Math.random() * 6 }); col.add(m);
  }
  addFx(col, 1.5, (f, dt) => { for (const p of parts) { p.m.position.y += p.vy * dt; p.m.rotation.y += p.spin * dt; p.m.rotation.x += p.spin * dt; p.m.material.opacity = f.life / f.max; } });
  // éclat central + flash + son
  spawnBurst(new THREE.Vector3(pos.x, 3, pos.z), gold, 26, 0.5);
  screenFlash();
  Sound.play('levelup_big');
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
  if (['spell', 'dot', 'aoe', 'heal', 'groupheal', 'hot', 'buff', 'mez', 'root'].includes(sk.t)) startCast(myMesh);
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

// cooldown local optimiste — évite de rejouer l'effet visuel d'un sort en recharge
const localCd = {};
function canCast(slot) {
  if (!ui.learned || !ui.learned.includes(slot)) return false;
  const cls = classById(myClsId);
  const sk = cls && ARCHETYPES[cls.arch].skills[slot];
  if (!sk) return false;
  const t = Date.now();
  if (((ui.cooldowns && ui.cooldowns['s' + slot]) || 0) > t) return false; // recharge serveur
  if ((localCd[slot] || 0) > t) return false;                               // recharge locale
  const lvl = (ui.self && ui.self.lvl) || 1;
  if (ui.self && ui.self.power < sk.cost * (1 + lvl * 0.06)) return false;   // puissance insuffisante
  return true;
}
function setLocalCd(slot) {
  const cls = classById(myClsId);
  const sk = cls && ARCHETYPES[cls.arch].skills[slot];
  if (sk) localCd[slot] = Date.now() + sk.cd * 1000;
}

// les effets s'ajoutent aux envois réseau, sans toucher à la logique
const _origSend = net.send.bind(net);
net.send = (type, data = {}) => {
  if (started && type === MSG.SKILL) {
    if (!canCast(data.slot)) return;   // anti-spam : ni envoi réseau, ni effet visuel, ni son
    castFx(data.slot); setLocalCd(data.slot); Sound.play('cast');
  }
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
const MOB_COLORS = {
  bandit: 0x8a5a3a, boar: 0x5f4530, undead: 0xcfd6cf, giant: 0x9a8a6a,
  sprite: 0x86d98a, wolf: 0x6a6a72, fomor: 0x7d8a58, treant: 0x55683a,
  rat: 0x7a6a5a, svartalf: 0x564f6a, draugr: 0x8a9a78, jotun: 0xaccadf,
  outlaw: 0x7a5a46, drake: 0x6a3a3a, wraith: 0x6a6a8a,
};
const HUMANOID_MOBS = new Set(['bandit', 'undead', 'sprite', 'fomor', 'svartalf', 'draugr', 'outlaw', 'wraith', 'giant', 'jotun', 'treant']);
const shade = (hex, amt) => { const c = new THREE.Color(hex); c.offsetHSL(0, 0, amt); return c.getHex(); };

// membre arrondi (cylindre + articulation), pivot en haut pour le balancement
function limb(w, h, d, color) {
  const g = new THREE.Group();
  const r = Math.min(w, d) * 0.5;
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.82, r, h, 10), mat(color, 0.8));
  cyl.geometry.translate(0, -h / 2, 0); cyl.castShadow = true;
  const joint = new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 10, 8), mat(color, 0.8));
  joint.position.y = -h; joint.castShadow = true;
  g.add(cyl, joint);
  return g;
}

function makeWeapon(robe, realmColor) {
  const g = new THREE.Group();
  if (robe) {
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 3.4, 8), mat(0x6b4a2c, 0.7));
    staff.geometry.translate(0, 1.0, 0); staff.castShadow = true;
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1),
      new THREE.MeshStandardMaterial({ color: realmColor || 0x9fd0ff, emissive: realmColor || 0x4a90d0, emissiveIntensity: 0.6, roughness: 0.35 }));
    orb.position.y = 2.7;
    g.add(staff, orb);
  } else {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.9, 0.05), mat(0xd6dae6, 0.3, 0.6));
    blade.geometry.translate(0, 1.05, 0); blade.castShadow = true;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.13, 0.16), mat(0x7a6326, 0.5, 0.4));
    guard.position.y = 0.18;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 8), mat(0x2a2018, 0.85));
    g.add(blade, guard, grip);
  }
  return g;
}

// silhouette humanoïde proportionnée et lissée
// segment de membre rattaché à un os (Object3D), pivot au sommet
function boneSeg(parent, lx, ly, lz, len, rTop, rBot, color, rough) {
  const bone = new THREE.Object3D(); bone.position.set(lx, ly, lz); parent.add(bone);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, 10), mat(color, rough == null ? 0.8 : rough));
  m.geometry.translate(0, -len / 2, 0); m.castShadow = true; bone.add(m);
  const j = new THREE.Mesh(new THREE.SphereGeometry(rBot * 1.02, 10, 8), mat(color, 0.8));
  j.position.y = -len; j.castShadow = true; bone.add(j);
  return bone;
}

// Humanoide RIGGE (squelette d'os hierarchique) - animations modernes par machine a etats.
// Sert de placeholder ; un vrai modele glTF peut le remplacer (voir client/js/models.js).
function buildHumanoid(g, anim, o) {
  const bw = o.bw, skin = o.skin, cloth = o.cloth, legCol = o.robe ? cloth : 0x33363f;
  anim.rig = true; anim.phase = Math.random() * 6; anim.swing = 0; anim.cast = 0; anim.hit = 0; anim.deadT = 0;
  const B = {}; anim.bones = B;

  const pelvis = new THREE.Object3D(); pelvis.position.set(0, 2.0, 0); g.add(pelvis); B.pelvis = pelvis; anim.pelY = 2.0;
  const pelMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.6 * bw, 0.72 * bw, 0.62, 12), mat(cloth, 0.85)); pelMesh.position.y = -0.12; pelMesh.castShadow = true; pelvis.add(pelMesh);
  if (o.robe) { const skirt = new THREE.Mesh(new THREE.ConeGeometry(1.3 * bw, 2.5, 16), mat(cloth, 0.85)); skirt.position.y = -0.45; skirt.castShadow = true; pelvis.add(skirt); }

  const spine = new THREE.Object3D(); spine.position.set(0, 0.45, 0); pelvis.add(spine); B.spine = spine;
  const chest = new THREE.Object3D(); chest.position.set(0, 0.5, 0); spine.add(chest); B.chest = chest;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.82 * bw, 0.62 * bw, 1.0, 12), mat(cloth, 0.85)); torso.position.y = 0.05; torso.castShadow = true; chest.add(torso);
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.92 * bw, 14, 10), mat(cloth, 0.85)); shoulders.scale.set(1, 0.5, 0.78); shoulders.position.y = 0.55; chest.add(shoulders);

  const neck = new THREE.Object3D(); neck.position.set(0, 0.62, 0); chest.add(neck); B.neck = neck;
  const head = new THREE.Object3D(); head.position.set(0, 0.42, 0); neck.add(head); B.head = head;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.6 * (0.92 + bw * 0.08), 18, 14), mat(skin, 0.7)); skull.scale.set(1, 1.12, 1.02); skull.castShadow = true; head.add(skull);
  for (const sx of [-0.2, 0.2]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), mat(0x1b1d24, 0.4)); eye.position.set(sx, 0.05, 0.52); head.add(eye); }
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.63 * (0.92 + bw * 0.08), 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), mat(o.hair != null ? o.hair : 0x3a2b1d, 0.9)); hair.position.y = 0.06; head.add(hair);
  if (o.tr) {
    if (o.tr.ears === 'pointy') for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.55, 6), mat(skin, 0.7)); ear.position.set(s * 0.58, 0.16, 0); ear.rotation.z = s * -0.5; head.add(ear); }
    if (o.tr.beard) { const beard = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.8, 10), mat(o.hair != null ? o.hair : 0x6b5034, 0.9)); beard.position.set(0, -0.42, 0.32); beard.rotation.x = Math.PI; head.add(beard); }
    if (o.tr.tusks) for (const s of [-1, 1]) { const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.36, 6), mat(0xeae0c8, 0.5)); tusk.position.set(s * 0.17, -0.28, 0.46); head.add(tusk); }
  }

  for (const s of [-1, 1]) {
    const sh = new THREE.Object3D(); sh.position.set(s * 0.64 * bw, 0.5, 0); chest.add(sh); sh.rotation.z = s * 0.12;
    const up = boneSeg(sh, 0, 0, 0, 0.95, 0.19 * bw, 0.15 * bw, o.robe ? cloth : skin);
    const fore = boneSeg(up, 0, -0.95, 0, 0.9, 0.15 * bw, 0.13 * bw, skin);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat(skin, 0.7)); hand.position.y = -0.9; hand.castShadow = true; fore.add(hand);
    if (s > 0) { B.shoulderR = sh; B.armR = up; B.foreR = fore; } else { B.shoulderL = sh; B.armL = up; B.foreL = fore; }
  }
  if (o.weapon) { const w = makeWeapon(o.robe, o.realmColor); w.position.set(0, -0.9, 0.05); w.rotation.x = -0.2; B.foreR.add(w); anim.weapon = w; }

  for (const s of [-1, 1]) {
    const hip = new THREE.Object3D(); hip.position.set(s * 0.26 * bw, -0.08, 0); pelvis.add(hip);
    const thigh = boneSeg(hip, 0, 0, 0, 1.0, 0.23 * bw, 0.18 * bw, legCol);
    const shin = boneSeg(thigh, 0, -1.0, 0, 0.95, 0.17 * bw, 0.14 * bw, legCol);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.32 * bw, 0.2, 0.6), mat(0x222026, 0.7)); foot.position.set(0, -0.95, 0.14); foot.castShadow = true; shin.add(foot);
    if (s > 0) { B.thighR = thigh; B.shinR = shin; } else { B.thighL = thigh; B.shinL = shin; }
  }

  if (o.npc) { const halo = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 8, 18), new THREE.MeshStandardMaterial({ color: 0xf0d889, emissive: 0xf0d889, emissiveIntensity: 0.5, roughness: 0.4 })); halo.rotation.x = Math.PI / 2; halo.position.y = 0.95; head.add(halo); }
}

function buildBeast(g, anim, color) {
  const fur = () => mat(color, 0.92);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 12), fur()); body.scale.set(1.0, 0.85, 1.7); body.position.y = 1.7; body.castShadow = true; g.add(body);
  anim.body = body; anim.bodyY = 1.7;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.0, 10), fur()); neck.position.set(0, 2.1, 1.7); neck.rotation.x = 0.7; g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.8, 14, 12), fur()); head.scale.set(1, 0.92, 1.1); head.position.set(0, 2.45, 2.4); head.castShadow = true; g.add(head);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 10), fur()); snout.rotation.x = Math.PI / 2; snout.position.set(0, 2.35, 3.1); g.add(snout);
  for (const sx of [-0.3, 0.3]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshStandardMaterial({ color: 0xc02020, emissive: 0x801010, emissiveIntensity: 0.5, roughness: 0.4 })); eye.position.set(sx, 2.62, 3.0); g.add(eye); }
  for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 6), fur()); ear.position.set(s * 0.4, 3.0, 2.3); ear.rotation.z = s * 0.3; g.add(ear); }
  for (const [lx, lz] of [[-0.8, 1.0], [0.8, 1.0], [-0.8, -1.0], [0.8, -1.0]]) { const leg = limb(0.46, 1.6, 0.46, shade(color, -0.08)); leg.position.set(lx, 1.6, lz); anim.legs.push(leg); g.add(leg); }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.5, 8), fur()); tail.position.set(0, 1.95, -1.85); tail.rotation.x = -0.8; g.add(tail);
}

function makeBody(kind, realm, cls, race) {
  const g = new THREE.Group();
  const anim = { phase: Math.random() * 6, swing: 0, cast: 0, arms: [], legs: [], weapon: null, body: null, bodyY: 0 };

  if (kind === 'mob') {
    const type = cls || '';
    const color = MOB_COLORS[type] || KIND_COLORS.mob;
    if (HUMANOID_MOBS.has(type)) {
      buildHumanoid(g, anim, { skin: color, cloth: shade(color, -0.18), bw: 1.12, robe: false,
        tr: { tusks: ['fomor', 'jotun', 'giant'].includes(type), ears: ['sprite', 'svartalf'].includes(type) ? 'pointy' : null }, weapon: false, hair: 0x241f18 });
      const big = ['fomor', 'giant', 'jotun', 'treant'].includes(type) ? 1.55 : type === 'sprite' ? 0.72 : 1.05;
      g.scale.setScalar(big);
    } else {
      buildBeast(g, anim, color);
      g.scale.setScalar(['drake', 'jotun', 'giant'].includes(type) ? 1.45 : type === 'rat' ? 0.7 : 1.05);
    }
    g.userData.anim = anim;
    g.userData.rigRoots = [...g.children];
    return g;
  }

  const arch = cls ? classById(cls)?.arch : null;
  const robe = ['caster', 'healer', 'support'].includes(arch);
  const tr = race ? raceTraits(race) : { h: 1, w: 1, skin: 0xd9b48f, build: 'norm' };
  const bw = tr.build === 'stocky' ? 1.18 : tr.build === 'slim' ? 0.84 : 1;
  const cloth = realm ? REALMS[realm].color : (KIND_COLORS[kind] || 0x8899aa);
  buildHumanoid(g, anim, { skin: tr.skin, cloth, bw, robe, tr, realmColor: realm ? REALMS[realm].color : 0x9fd0ff, weapon: true, npc: kind === 'npc' });
  g.scale.set(tr.w, tr.h, tr.w);
  g.userData.anim = anim;
  g.userData.rigRoots = [...g.children];
  return g;
}

function startSwing(group) { if (group.userData.gltf) return playModelAction(group, 'attack'); const a = group.userData.anim; if (a) a.swing = 0.42; }
function startCast(group) { if (group.userData.gltf) return playModelAction(group, 'cast'); const a = group.userData.anim; if (a) a.cast = 0.6; }
const lerpA = (o, k, target, t) => { o.rotation[k] += (target - o.rotation[k]) * t; };

function animateBody(group, speed, dt, elapsed, opts) {
  if (group.userData.gltf) { updateModelAnim(group, speed, dt, opts || {}); return; }
  const a = group.userData.anim;
  if (!a) return;
  if (a.rig) { animateRig(a, speed, dt, elapsed, opts || {}); return; }
  const moving = speed > 1.2;
  if (moving) a.phase += dt * Math.min(speed, 22) * 0.55;
  const sw = moving ? Math.sin(a.phase * 2.2) * 0.65 : 0;
  if (a.legs.length === 4) { a.legs[0].rotation.x = sw; a.legs[3].rotation.x = sw; a.legs[1].rotation.x = -sw; a.legs[2].rotation.x = -sw; }
  if (a.body) a.body.position.y = a.bodyY + (moving ? Math.abs(Math.sin(a.phase * 2.2)) * 0.14 : Math.sin(elapsed * 1.6 + a.phase) * 0.05);
}

function animateRig(a, speed, dt, elapsed, opts) {
  const B = a.bones; const t = Math.min(1, dt * 12);
  if (opts.dead) {
    a.deadT = Math.min(1, a.deadT + dt * 2.5); const k = a.deadT;
    B.pelvis.position.y = a.pelY * (1 - k) + 0.5 * k;
    lerpA(B.spine, 'x', -1.4 * k, t); lerpA(B.chest, 'x', -0.6 * k, t);
    lerpA(B.thighL, 'x', -0.6 * k, t); lerpA(B.thighR, 'x', -0.6 * k, t);
    lerpA(B.armL, 'x', 0.5 * k, t); lerpA(B.armR, 'x', 0.5 * k, t);
    return;
  }
  if (a.deadT > 0) a.deadT = Math.max(0, a.deadT - dt * 3);
  const lo = Math.max(0, Math.min(1, speed / 8));
  const moving = speed > 0.8;
  a.phase += dt * (moving ? Math.min(speed, 18) * 0.45 : 1.5);
  const air = opts.air ? 1 : 0;
  const ls = Math.sin(a.phase * 2);
  lerpA(B.thighL, 'x', (-ls * 0.7 * lo) - air * 0.7, t);
  lerpA(B.thighR, 'x', (ls * 0.7 * lo) - air * 0.7, t);
  lerpA(B.shinL, 'x', (Math.max(0, ls) * 0.8 * lo) + air * 0.9, t);
  lerpA(B.shinR, 'x', (Math.max(0, -ls) * 0.8 * lo) + air * 0.9, t);
  const acting = a.swing > 0 || a.cast > 0;
  if (!acting) {
    lerpA(B.armL, 'x', ls * 0.55 * lo + Math.sin(elapsed * 1.5) * 0.04 * (1 - lo), t);
    lerpA(B.armR, 'x', -ls * 0.55 * lo + Math.sin(elapsed * 1.5 + 1) * 0.04 * (1 - lo), t);
    lerpA(B.foreL, 'x', -0.2 - Math.abs(ls) * 0.3 * lo, t);
    lerpA(B.foreR, 'x', -0.2 - Math.abs(ls) * 0.3 * lo, t);
    lerpA(B.chest, 'y', ls * 0.12 * lo, t);
  }
  lerpA(B.spine, 'x', lo * 0.1 + Math.sin(elapsed * 1.4) * 0.02 * (1 - lo), t);
  B.pelvis.position.y = a.pelY + (moving ? Math.abs(Math.sin(a.phase * 2)) * 0.12 * lo : Math.sin(elapsed * 1.5) * 0.03) - air * 0.1;
  if (a.swing > 0) {
    a.swing -= dt; const sw = Math.sin((1 - Math.max(a.swing, 0) / 0.42) * Math.PI);
    B.armR.rotation.x = -2.2 * sw; B.foreR.rotation.x = -0.6 - sw * 0.6; B.chest.rotation.y = -0.3 * sw;
  }
  if (a.cast > 0) {
    a.cast -= dt; const k = Math.sin((1 - Math.max(a.cast, 0) / 0.6) * Math.PI);
    B.armR.rotation.x = -1.4 * k; B.armL.rotation.x = -1.4 * k;
    B.foreR.rotation.x = -0.8 * k; B.foreL.rotation.x = -0.8 * k; B.chest.rotation.x = -0.15 * k;
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
      if (kind === 'player' || kind === 'ai' || kind === 'npc') {
        const arch = cls ? classById(cls)?.arch : null;
        tryLoadModel(THREE, mesh, { key: (realm || '') + ':' + (arch || ''), race: race || null, arch });
      }
      e = { mesh, data: {}, label: null, labelKey: '' };
      entities.set(id, e);
      mesh.position.set(x, terrainHeight(x, z), z);
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
  tryLoadModel(THREE, myMesh, { key: create.realm + ':' + (classById(create.cls)?.arch || ''), race: create.race, arch: classById(create.cls)?.arch });
  scene.add(myMesh);
  const base = REALMS[create.realm].base;
  me.x = base.x; me.z = base.z;
  myMesh.position.set(me.x, terrainHeight(me.x, me.z), me.z);
}

// ---------- Caméra & contrôles ----------
let camYaw = 0, camPitch = 0.45, camDist = 26;
let dragging = false, lastMx = 0, lastMy = 0;
const keys = {};
let jumpY = 0, jumpV = 0; // saut local (cosmétique)

addEventListener('keydown', (e) => {
  if (ui.chatOpen) return;
  if (e.code === 'Enter') { ui.toggleChat(true); e.preventDefault(); return; }
  keys[e.code] = true;
  if (e.code === 'KeyM') { const m = Sound.toggle(); ui.log(m ? '🔇 Sons coupés (M)' : '🔊 Sons activés (M)', 'info'); }
  if (e.code.startsWith('Digit')) {
    const n = parseInt(e.code.slice(5), 10);
    if (n >= 1 && n <= 9) net.send(MSG.SKILL, { slot: n - 1 });
  }
  if (e.code === 'Space') {
    e.preventDefault();
    if (started && !me.dead && jumpY <= 0.05 && jumpV === 0) { jumpV = 14; Sound.play('jump'); }
  }
  if (e.code === 'KeyR') net.send(MSG.ATTACK, { on: true });
  if (e.code === 'KeyT') net.send(MSG.USE_ITEM, { id: 'potion_hp' });
  if (e.code === 'KeyY') net.send(MSG.USE_ITEM, { id: 'potion_pw' });
  if (e.code === 'KeyJ') ui.toggleQuestLog();
  if (e.code === 'KeyI') ui.toggleInventory();
  if (e.code === 'KeyU') { resetUI(); ui.log("Disposition de l'interface réinitialisée (U).", 'info'); }
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
    myMesh.position.set(me.x, terrainHeight(me.x, me.z), me.z);
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
  else if (m.cat === 'rvr') Sound.play(/🏰/.test(m.text) ? 'fort' : 'kill');
  else if (m.cat === 'quest') Sound.play('quest');
  else if (m.cat === 'system' && /apprise/i.test(m.text)) Sound.play('learn');
  else if (m.cat === 'combat') Sound.play(/PV|soign/i.test(m.text) ? 'heal' : 'hit');
  if (m.cat === 'levelup' && myMesh) spawnLevelUp({ x: me.x, z: me.z });
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
        const ox = me.x, oz = me.z;
        me.x += Math.sin(ang) * speed * dt;
        me.z += Math.cos(ang) * speed * dt;
        // terrain non praticable (montagnes/pentes) : on annule le pas
        if (!walkable(me.x, me.z)) { me.x = ox; me.z = oz; }
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
    // saut (cosmétique, prédiction locale)
    if (jumpV !== 0 || jumpY > 0) {
      jumpY += jumpV * dt; jumpV -= 40 * dt;
      if (jumpY <= 0) { jumpY = 0; jumpV = 0; }
    }
    myMesh.position.set(me.x, terrainHeight(me.x, me.z) + jumpY, me.z);
    myMesh.visible = !me.dead;
    myMesh.traverse((o) => { if (o.material && !o.material.map) { o.material.transparent = me.stealthed; o.material.opacity = me.stealthed ? 0.35 : 1; } });

    // animation du joueur local
    const mySpeed = myMesh.position.distanceTo(myPrev) / Math.max(dt, 0.001);
    myPrev.copy(myMesh.position);
    animateBody(myMesh, mySpeed, dt, elapsed, { air: jumpY > 0.4, dead: me.dead });

    // interpolation + animation des autres entités
    for (const ent of entities.values()) {
      const p = ent.mesh.position;
      const px = p.x, pz = p.z;
      p.x += (ent.tx - p.x) * Math.min(1, dt * 8);
      p.z += (ent.tz - p.z) * Math.min(1, dt * 8);
      p.y = terrainHeight(p.x, p.z);
      ent.mesh.rotation.y += (ent.try - ent.mesh.rotation.y) * Math.min(1, dt * 8);
      const spd = Math.hypot(p.x - px, p.z - pz) / Math.max(dt, 0.001);
      animateBody(ent.mesh, spd, dt, elapsed, { dead: ent.data.dead });
    }

    // effets visuels
    fxUpdate(dt);
    updateModelMixers(dt);

    // caméra orbitale
    const ph = terrainHeight(me.x, me.z);
    const cx = me.x + Math.sin(camYaw) * -camDist * Math.cos(camPitch);
    const cz = me.z + Math.cos(camYaw) * -camDist * Math.cos(camPitch);
    const cy = ph + 3 + Math.sin(camPitch) * camDist;
    camera.position.set(cx, cy, cz);
    camera.lookAt(me.x, ph + 4, me.z);
    sun.position.set(me.x + 150, ph + 320, me.z + 110);
    sun.target.position.set(me.x, ph, me.z);
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

// ---- Démarrage : comptes serveur (multi) ou roster local (solo) ----
let serverChars = [];
function showServerSelect() {
  if (started) return;
  if (!serverChars.length) { beginCreate(); return; }
  charSelectServer({
    chars: serverChars,
    onPlay: enterGame,
    onCreate: beginCreate,
    onDelete: (c) => net.send(MSG.DELCHAR, { name: c.name, realm: c.realm, cls: c.cls }),
  });
}

if (window.RAW_SOLO) {
  // SOLO : pas de compte, roster local (localStorage)
  if (!charSelect({ onPlay: enterGame, onCreate: beginCreate })) beginCreate();
} else {
  // MULTI : connexion (Google ou invité) puis personnages du compte (serveur)
  let authed = false;
  net.on(MSG.AUTHED, () => { authed = true; document.getElementById('login').classList.add('hidden'); });
  net.on(MSG.ROSTER, (m) => { serverChars = m.chars || []; if (!started) showServerSelect(); });
  const cfg = window.RAW_CONFIG || {};
  const loginEl = document.getElementById('login');
  const gbtn = document.getElementById('login-google');
  const guestBtn = document.getElementById('login-guest');
  const doAuth = (payload) => { net.ready.then(() => net.send(MSG.AUTH, payload)); };
  if (guestBtn) guestBtn.onclick = () => doAuth({ provider: 'guest', guestId: guestId() });
  const hasGoogle = mountGoogle(cfg.googleClientId, gbtn, (token) => doAuth({ provider: 'google', token }));
  const note = document.getElementById('login-note');
  if (!hasGoogle && note) note.textContent = "Connexion Google non configurée — jouez en invité (vos persos restent liés à ce navigateur).";
  if (loginEl) loginEl.classList.remove('hidden');
}
