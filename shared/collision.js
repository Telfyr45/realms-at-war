// ============================================================
// Collisions & décor déterministe (partagé client/serveur)
// Le décor est généré avec un PRNG seedé : client (rendu) et
// serveur (collisions) voient exactement les mêmes obstacles.
// ============================================================
import { WORLD, REALMS, FRONTIER } from './data.js';

export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// distance d'un point (px,pz) au segment [(x1,z1)-(x2,z2)]
function distToSegment(px, pz, x1, z1, x2, z2) {
  const vx = x2 - x1, vz = z2 - z1;
  const len2 = vx * vx + vz * vz || 1;
  let t = ((px - x1) * vx + (pz - z1) * vz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + vx * t), pz - (z1 + vz * t));
}

// ---------- Décor (arbres / rochers) ----------
export const SCENERY = [];
{
  const rnd = mulberry32(20260612);
  // densité proportionnelle à la surface de la nouvelle carte (3600²)
  for (let i = 0; i < 560; i++) {
    const x = (rnd() - 0.5) * WORLD.size * 0.92;
    const z = (rnd() - 0.5) * WORLD.size * 0.92;
    const isTree = rnd() < 0.75;
    const rot = rnd() * 6.28;
    // dégager le cœur du Fort Central et l'esplanade de capture
    if (Math.hypot(x, z) < FRONTIER.fortRadius + 40) continue;
    // dégager les routes qui relient chaque capitale au centre
    if (Object.values(REALMS).some((r) => distToSegment(x, z, 0, 0, r.base.x, r.base.z) < 22)) continue;
    if (Object.values(REALMS).some((r) => Math.hypot(x - r.base.x, z - r.base.z) < 115)) continue;
    SCENERY.push({ x, z, type: isTree ? 'tree' : 'rock', rot });
  }
}

// ---------- Obstacles statiques ----------
export const OBSTACLES = { circles: [], segments: [] };
for (const s of SCENERY) {
  OBSTACLES.circles.push({ x: s.x, z: s.z, r: s.type === 'tree' ? 1.2 : 2.6 });
}

// transformation locale -> monde d'une capitale (même rotation que le rendu)
export function capitalTransform(realm) {
  const base = REALMS[realm].base;
  const ang = Math.atan2(-base.x, -base.z) + Math.PI;
  const c = Math.cos(ang), s = Math.sin(ang);
  return (lx, lz) => ({ x: lx * c + lz * s + base.x, z: -lx * s + lz * c + base.z });
}

for (const rid of Object.keys(REALMS)) {
  const T = capitalTransform(rid);
  const seg = (x1, z1, x2, z2, rad) => {
    const a = T(x1, z1), b = T(x2, z2);
    OBSTACLES.segments.push({ x1: a.x, z1: a.z, x2: b.x, z2: b.z, r: rad });
  };
  // murailles (l'avant, côté centre de la carte, reste ouvert)
  seg(-55, 42, 55, 42, 2.5);
  seg(-55, -44, -55, 44, 2.5);
  seg(55, -44, 55, 44, 2.5);
  // tours d'angle
  for (const [tx, tz] of [[-55, 42], [55, 42], [-55, -42], [55, -42]]) {
    const p = T(tx, tz);
    OBSTACLES.circles.push({ x: p.x, z: p.z, r: 7.5 });
  }
  // donjon
  const k = T(0, 20);
  OBSTACLES.circles.push({ x: k.x, z: k.z, r: 13 });
  // maisons
  for (let i = 0; i < 6; i++) {
    const h = T(-40 + (i % 3) * 32 + 6, -20 + Math.floor(i / 3) * 38);
    OBSTACLES.circles.push({ x: h.x, z: h.z, r: 7.2 });
  }
}

// ---------- Fort Central renforcé (enceinte octogonale, 4 ouvertures franchissables) ----------
{
  const FR = FRONTIER.fortRadius;          // rayon des murailles
  const panHalf = FR * 0.62;               // demi-longueur d'un pan de muraille
  for (let a = 1; a < 8; a += 2) {
    const ang = (a / 8) * Math.PI * 2;
    const cx = Math.cos(ang) * FR, cz = Math.sin(ang) * FR;
    const dx = -Math.sin(ang), dz = Math.cos(ang);
    OBSTACLES.segments.push({ x1: cx - dx * panHalf, z1: cz - dz * panHalf, x2: cx + dx * panHalf, z2: cz + dz * panHalf, r: 2.8 });
  }
  // 4 tours d'angle
  for (let a = 0; a < 4; a++) {
    const ang = (a / 4) * Math.PI * 2 + Math.PI / 4;
    OBSTACLES.circles.push({ x: Math.cos(ang) * FR, z: Math.sin(ang) * FR, r: 8 });
  }
  // donjon central (point de capture sur son pourtour)
  OBSTACLES.circles.push({ x: 0, z: 0, r: 17 });
}

// ---------- Résolution ----------
const BOUND = WORLD.size / 2 - 60; // les montagnes bordent la carte

export function entityRadius(kind) {
  return kind === 'mob' ? 1.6 : kind === 'guard' ? 1.3 : 1.0;
}

// pousse (x,z) hors des obstacles statiques + bornes du monde
export function resolveMove(x, z, rad) {
  x = Math.max(-BOUND, Math.min(BOUND, x));
  z = Math.max(-BOUND, Math.min(BOUND, z));
  for (const c of OBSTACLES.circles) {
    const min = rad + c.r;
    const dx = x - c.x, dz = z - c.z;
    if (dx > min || dx < -min || dz > min || dz < -min) continue;
    const d = Math.hypot(dx, dz);
    if (d < min) {
      if (d < 0.001) { x = c.x + min; continue; }
      x = c.x + (dx / d) * min;
      z = c.z + (dz / d) * min;
    }
  }
  for (const s of OBSTACLES.segments) {
    const min = rad + s.r;
    if (x < Math.min(s.x1, s.x2) - min || x > Math.max(s.x1, s.x2) + min ||
        z < Math.min(s.z1, s.z2) - min || z > Math.max(s.z1, s.z2) + min) continue;
    const vx = s.x2 - s.x1, vz = s.z2 - s.z1;
    let t = ((x - s.x1) * vx + (z - s.z1) * vz) / (vx * vx + vz * vz);
    t = Math.max(0, Math.min(1, t));
    const px = s.x1 + vx * t, pz = s.z1 + vz * t;
    const dx = x - px, dz = z - pz;
    const d = Math.hypot(dx, dz);
    if (d < min && d > 0.001) {
      x = px + (dx / d) * min;
      z = pz + (dz / d) * min;
    }
  }
  return { x, z };
}

// pousse (x,z) hors des autres entités (cercles {x,z,r})
export function pushApart(x, z, rad, others) {
  for (const o of others) {
    const min = rad + o.r;
    const dx = x - o.x, dz = z - o.z;
    if (dx > min || dx < -min || dz > min || dz < -min) continue;
    const d = Math.hypot(dx, dz);
    if (d < min) {
      if (d < 0.001) { x = o.x + min; continue; }
      x = o.x + (dx / d) * min;
      z = o.z + (dz / d) * min;
    }
  }
  return { x, z };
}
