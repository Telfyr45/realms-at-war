// ============================================================
// Chargeur de modèles glTF/GLB avec animations + repli procédural.
//
// 1) Pack de démo CC0 prêt à l'emploi : mettez useDemoModels:true dans
//    window.RAW_CONFIG (index.html) -> tous les humanoïdes utilisent le
//    modèle riggé "RobotExpressive" (Tomás Laulhé / Don McCurdy, CC0),
//    servi par CDN (jsDelivr), avec ses animations idle/walk/run/jump/
//    death/punch. Aucun fichier à héberger.
// 2) Vos propres modèles : renseignez MODEL_URLS (par race, archétype,
//    ou clé "royaume:archétype") avec une URL .glb. Voir MODELES.md.
// ============================================================
export const MODEL_URLS = {};
const DEMO_MODEL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/models/gltf/RobotExpressive/RobotExpressive.glb';
const TARGET_HEIGHT = 4.7; // hauteur cible (unités du jeu) pour mettre le modèle à l'échelle

// correspondances état du jeu -> noms de clips possibles (minuscules)
const CLIPS = {
  idle: ['idle'], walk: ['walking', 'walk'], run: ['running', 'run', 'walking'],
  jump: ['jump'], death: ['death', 'die'], attack: ['punch', 'attack', 'slash'], cast: ['wave', 'yes', 'cast'],
};

let _Loader = null, _tried = false;
export function updateModelMixers() {} // (compat : les mixers sont mis à jour par entité)

function demoOn() { return !!(window.RAW_CONFIG && window.RAW_CONFIG.useDemoModels); }
export function modelUrlFor({ key, race, arch }) {
  return MODEL_URLS[key] || MODEL_URLS[race] || MODEL_URLS[arch] || (demoOn() ? DEMO_MODEL : null);
}

async function loaderClass() {
  if (_tried) return _Loader;
  _tried = true;
  try { _Loader = (await import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js')).GLTFLoader; }
  catch (e) { console.warn('[models] GLTFLoader indisponible — modèles procéduraux conservés.', e); }
  return _Loader;
}

function pickAction(actions, names) { for (const n of names) if (actions[n]) return actions[n]; return null; }

export async function tryLoadModel(THREE, group, opts) {
  const url = modelUrlFor(opts);
  if (!url) return false;
  const Loader = await loaderClass();
  if (!Loader) return false;
  return new Promise((resolve) => {
    new Loader().load(url, (gltf) => {
      try {
        const model = gltf.scene;
        // mise à l'échelle + pieds au sol
        const box = new THREE.Box3().setFromObject(model);
        const h = Math.max(0.01, box.max.y - box.min.y);
        const s = TARGET_HEIGHT / h;
        model.scale.setScalar(s);
        model.position.y = -box.min.y * s;
        model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
        // masque le placeholder procédural (sans toucher aux labels/sprites)
        (group.userData.rigRoots || []).forEach((c) => { c.visible = false; });
        group.add(model);
        const mixer = new THREE.AnimationMixer(model);
        const actions = {};
        for (const clip of (gltf.animations || [])) actions[clip.name.toLowerCase()] = mixer.clipAction(clip);
        const idle = pickAction(actions, CLIPS.idle) || (gltf.animations[0] && mixer.clipAction(gltf.animations[0]));
        if (idle) idle.play();
        group.userData.gltf = { mixer, actions, state: 'idle', current: idle, actionUntil: 0 };
        resolve(true);
      } catch (e) { console.warn('[models] post-chargement échoué', e); resolve(false); }
    }, undefined, () => resolve(false));
  });
}

function fadeTo(G, action, dur = 0.25, once = false) {
  if (!action || action === G.current) return action || G.current;
  action.reset();
  if (once) { action.setLoop(2200, 1); action.clampWhenFinished = true; } // 2200 = THREE.LoopOnce
  else action.setLoop(2201, Infinity);                                    // 2201 = THREE.LoopRepeat
  action.fadeIn(dur); if (G.current) G.current.fadeOut(dur); action.play();
  G.current = action; return action;
}

// animation pilotée par l'état du jeu (locomotion + mort + saut)
export function updateModelAnim(group, speed, dt, opts) {
  const G = group.userData.gltf; if (!G) return;
  G.mixer.update(dt);
  if (G.actionUntil && performance.now() < G.actionUntil) return; // action ponctuelle en cours
  let want = 'idle';
  if (opts.dead && G.actions[CLIPS.death[0]]) want = 'death';
  else if (opts.air && pickAction(G.actions, CLIPS.jump)) want = 'jump';
  else if (speed > 9 && pickAction(G.actions, CLIPS.run)) want = 'run';
  else if (speed > 0.8) want = 'walk';
  if (want !== G.state) {
    const a = fadeTo(G, pickAction(G.actions, CLIPS[want]) || pickAction(G.actions, CLIPS.idle));
    if (a) G.state = want;
  }
}

// action ponctuelle (attaque / sort) : joue le clip puis revient à la locomotion
export function playModelAction(group, kind) {
  const G = group.userData.gltf; if (!G) return;
  const a = pickAction(G.actions, CLIPS[kind]); if (!a) return;
  fadeTo(G, a, 0.12, true);
  G.state = '_action';
  const dur = a.getClip() ? a.getClip().duration : 0.6;
  G.actionUntil = performance.now() + Math.min(dur, 1.2) * 1000;
}
