// ============================================================
// Relief déterministe partagé client/serveur.
// Le client l'utilise pour le maillage du sol + poser les entités ;
// le serveur l'utilise pour interdire les zones non praticables.
// ============================================================
import { WORLD, REALMS } from './data.js';

const THALF = WORLD.size / 2;
const tclamp = (v, a, b) => Math.max(a, Math.min(b, v));

// proche d'une route capitale -> centre (pour aplanir)
function nearRoad(x, z) {
  for (const r of Object.values(REALMS)) {
    const L2 = r.base.x * r.base.x + r.base.z * r.base.z || 1;
    let t = (x * r.base.x + z * r.base.z) / L2;
    t = tclamp(t, 0, 1);
    if (Math.hypot(x - r.base.x * t, z - r.base.z * t) < 16) return true;
  }
  return false;
}

// hauteur du terrain en (x,z)
export function terrainHeight(x, z) {
  let h = Math.sin(x * 0.006) * Math.cos(z * 0.0055) * 15   // grandes collines
        + Math.sin(x * 0.013) * Math.cos(z * 0.011) * 6      // ondulations
        + Math.sin(x * 0.031 + z * 0.027) * 2.5;             // détail
  const dc = Math.hypot(x, z);
  const edge = Math.max(0, (dc - THALF * 0.62) / (THALF * 0.38));
  h += edge * edge * 130; // chaîne de montagnes en périphérie
  let flatten = Math.min(dc, ...Object.values(REALMS).map((r) => Math.hypot(x - r.base.x, z - r.base.z)));
  if (nearRoad(x, z)) flatten = Math.min(flatten, 12);
  h *= tclamp((flatten - 40) / 120, 0, 1);
  return h;
}

// pente approximée (norme du gradient) en (x,z)
export function terrainSlope(x, z) {
  const d = 3;
  const hx = terrainHeight(x + d, z) - terrainHeight(x - d, z);
  const hz = terrainHeight(x, z + d) - terrainHeight(x, z - d);
  return Math.hypot(hx, hz) / (2 * d);
}

// altitude max praticable et pente max praticable
export const WALK_MAX_H = 30;
export const WALK_MAX_SLOPE = 1.6;

// (x,z) est-il sur du terrain praticable (hors montagnes / pentes trop raides) ?
export function walkable(x, z) {
  return terrainHeight(x, z) < WALK_MAX_H && terrainSlope(x, z) < WALK_MAX_SLOPE;
}
