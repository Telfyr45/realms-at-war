// ============================================================
// REALMS AT WAR — Données partagées client/serveur
// Jeu inspiré de Dark Age of Camelot (projet fan, non commercial)
// ============================================================

export const WORLD = {
  size: 3600, // carte de -1800 à +1800
  tickMs: 100,
  broadcastMs: 150,
  viewRange: 470,
};

// Grande zone frontalière centrale (RvR) commune aux 3 royaumes, reliée par des
// routes aux 3 capitales, avec le Fort Central à capturer en son cœur.
export const FRONTIER = {
  center: { x: 0, z: 0 },
  radius: 560,    // rayon de la grande zone centrale
  fortRadius: 56, // rayon des murailles du Fort Central
};

export const REALMS = {
  alb: {
    id: 'alb', name: 'Albion', color: 0xc03030, colorCss: '#c03030',
    capital: 'Camelot', desc: "Le royaume du Roi Arthur. Chevalerie, foi et acier.",
    base: { x: -1083, z: 625 },
    races: ['Breton', 'Avalonien', 'Highlander', 'Sarrasin', 'Inconnu', 'Demi-Ogre'],
  },
  hib: {
    id: 'hib', name: 'Hibernia', color: 0x30a040, colorCss: '#30a040',
    capital: 'Tir na Nog', desc: "Le royaume celte. Nature, magie ancienne et fureur sauvage.",
    base: { x: 1083, z: 625 },
    races: ['Celte', 'Firbolg', 'Lurikeen', 'Elfe', 'Sylvan', 'Shar'],
  },
  mid: {
    id: 'mid', name: 'Midgard', color: 0x3060c0, colorCss: '#3060c0',
    capital: 'Jordheim', desc: "Le royaume viking. Glace, runes et rage du Nord.",
    base: { x: 0, z: -1250 },
    races: ['Norrois', 'Troll', 'Nain', 'Kobold', 'Valkyn', 'Frostalf'],
  },
};

// ------------------------------------------------------------
// Archétypes : modèles de compétences (4 slots par classe)
// t: melee|ranged|spell|dot|heal|groupheal|hot|buff|stun|root|mez|stealth|aoe
// p: puissance (multiplicateur), cd: recharge (s), cost: power, rng: portée
// ------------------------------------------------------------
export const ARCHETYPES = {
  tank: {
    label: 'Combattant', hp: 1.25, power: 0.6, dmg: 1.0,
    skills: [
      { t: 'melee', p: 1.6, cd: 6, cost: 5, rng: 4, lvl: 1 },
      { t: 'stun', p: 0.8, cd: 18, cost: 10, rng: 4, dur: 3, lvl: 2 },
      { t: 'dot', p: 0.9, cd: 12, cost: 8, rng: 4, dur: 9, lvl: 3 },
      { t: 'buff', p: 0.25, cd: 30, cost: 12, rng: 0, dur: 20, lvl: 5 },
      { t: 'melee', p: 2.0, cd: 9, cost: 10, rng: 4, lvl: 7, name: 'Brise-garde' },
      { t: 'aoe', p: 1.5, cd: 16, cost: 14, rng: 6, lvl: 10, name: "Tourbillon d'acier" },
      { t: 'dot', p: 1.3, cd: 14, cost: 12, rng: 4, dur: 10, lvl: 14, name: 'Entaille sanglante' },
      { t: 'melee', p: 3.0, cd: 25, cost: 18, rng: 4, lvl: 20, name: 'Frappe dévastatrice' },
      { t: 'aoe', p: 2.4, cd: 30, cost: 22, rng: 7, lvl: 30, name: 'Séisme martial' },
    ],
  },
  hybrid: {
    label: 'Hybride', hp: 1.1, power: 0.85, dmg: 0.9,
    skills: [
      { t: 'melee', p: 1.4, cd: 5, cost: 5, rng: 4, lvl: 1 },
      { t: 'heal', p: 0.9, cd: 14, cost: 15, rng: 0, lvl: 2 },
      { t: 'buff', p: 0.2, cd: 30, cost: 12, rng: 0, dur: 20, lvl: 3 },
      { t: 'melee', p: 1.9, cd: 12, cost: 10, rng: 4, lvl: 5 },
      { t: 'spell', p: 1.6, cd: 8, cost: 12, rng: 30, lvl: 7, name: 'Châtiment' },
      { t: 'dot', p: 1.0, cd: 10, cost: 10, rng: 30, dur: 12, lvl: 10, name: 'Fléau persistant' },
      { t: 'heal', p: 1.4, cd: 12, cost: 18, rng: 30, lvl: 14, name: 'Imposition des mains' },
      { t: 'spell', p: 2.4, cd: 9, cost: 16, rng: 32, lvl: 20, name: 'Verdict sacré' },
      { t: 'buff', p: 0.45, cd: 40, cost: 16, rng: 0, dur: 20, lvl: 30, name: 'Aura de puissance' },
    ],
  },
  healer: {
    label: 'Soigneur', hp: 0.95, power: 1.2, dmg: 0.7,
    skills: [
      { t: 'heal', p: 1.5, cd: 3, cost: 12, rng: 30, lvl: 1 },
      { t: 'groupheal', p: 1.0, cd: 10, cost: 22, rng: 30, lvl: 2 },
      { t: 'spell', p: 1.1, cd: 4, cost: 8, rng: 35, lvl: 3 },
      { t: 'buff', p: 0.2, cd: 30, cost: 12, rng: 30, dur: 25, lvl: 5 },
      { t: 'heal', p: 2.2, cd: 9, cost: 22, rng: 30, lvl: 7, name: 'Grâce supérieure' },
      { t: 'hot', p: 0.8, cd: 10, cost: 16, rng: 30, dur: 15, lvl: 10, name: 'Régénération' },
      { t: 'root', p: 0, cd: 15, cost: 12, rng: 35, dur: 6, lvl: 14, name: 'Entraves sacrées' },
      { t: 'heal', p: 2.6, cd: 12, cost: 25, rng: 30, lvl: 20, name: 'Grâce majeure' },
      { t: 'aoe', p: 1.8, cd: 18, cost: 22, rng: 32, lvl: 30, name: 'Châtiment céleste' },
    ],
  },
  caster: {
    label: 'Mage', hp: 0.8, power: 1.3, dmg: 1.0,
    skills: [
      { t: 'spell', p: 1.8, cd: 3, cost: 9, rng: 38, lvl: 1 },
      { t: 'dot', p: 1.1, cd: 8, cost: 10, rng: 35, dur: 12, lvl: 2 },
      { t: 'root', p: 0, cd: 15, cost: 10, rng: 35, dur: 6, lvl: 3 },
      { t: 'aoe', p: 1.3, cd: 12, cost: 18, rng: 30, lvl: 5 },
      { t: 'spell', p: 2.0, cd: 5, cost: 12, rng: 38, lvl: 7, name: 'Trait du néant' },
      { t: 'spell', p: 1.0, cd: 2, cost: 6, rng: 38, lvl: 10, name: 'Éclat mineur' },
      { t: 'dot', p: 1.6, cd: 12, cost: 16, rng: 35, dur: 14, lvl: 14, name: 'Malédiction rampante' },
      { t: 'spell', p: 2.6, cd: 8, cost: 16, rng: 38, lvl: 20, name: 'Frappe du néant' },
      { t: 'aoe', p: 2.4, cd: 20, cost: 26, rng: 32, lvl: 30, name: 'Cataclysme' },
    ],
  },
  stealth: {
    label: 'Furtif', hp: 0.95, power: 0.8, dmg: 1.1,
    skills: [
      { t: 'stealth', p: 0, cd: 8, cost: 5, rng: 0, lvl: 1 },
      { t: 'melee', p: 2.6, cd: 8, cost: 8, rng: 4, fromStealth: 2, lvl: 2 },
      { t: 'dot', p: 1.0, cd: 10, cost: 8, rng: 4, dur: 12, lvl: 3 },
      { t: 'buff', p: 0.3, cd: 30, cost: 10, rng: 0, dur: 15, lvl: 5 },
      { t: 'melee', p: 2.0, cd: 7, cost: 8, rng: 4, lvl: 7, name: 'Coup vicieux' },
      { t: 'melee', p: 2.8, cd: 12, cost: 10, rng: 4, fromStealth: 1.8, lvl: 10, name: 'Éviscération' },
      { t: 'root', p: 0.3, cd: 18, cost: 10, rng: 30, dur: 5, lvl: 14, name: 'Bolas' },
      { t: 'melee', p: 3.6, cd: 16, cost: 12, rng: 4, fromStealth: 2.2, lvl: 20, name: 'Lame fatale' },
      { t: 'buff', p: 0.5, cd: 40, cost: 14, rng: 0, dur: 15, lvl: 30, name: 'Danse des ombres' },
    ],
  },
  archer: {
    label: 'Archer', hp: 1.0, power: 0.8, dmg: 1.0,
    skills: [
      { t: 'ranged', p: 1.7, cd: 4, cost: 6, rng: 40, lvl: 1 },
      { t: 'ranged', p: 2.4, cd: 10, cost: 12, rng: 45, lvl: 2 },
      { t: 'root', p: 0.4, cd: 18, cost: 10, rng: 38, dur: 5, lvl: 3 },
      { t: 'melee', p: 1.3, cd: 6, cost: 5, rng: 4, lvl: 5 },
      { t: 'ranged', p: 2.0, cd: 7, cost: 10, rng: 42, lvl: 7, name: 'Tir rapide' },
      { t: 'ranged', p: 2.8, cd: 12, cost: 14, rng: 45, lvl: 10, name: 'Tir perforant' },
      { t: 'dot', p: 1.2, cd: 12, cost: 12, rng: 40, dur: 10, lvl: 14, name: 'Flèche empoisonnée' },
      { t: 'aoe', p: 1.6, cd: 15, cost: 14, rng: 38, lvl: 20, name: 'Pluie de flèches' },
      { t: 'ranged', p: 3.6, cd: 20, cost: 18, rng: 48, lvl: 30, name: 'Tir du faucon' },
    ],
  },
  support: {
    label: 'Barde', hp: 1.0, power: 1.0, dmg: 0.8,
    skills: [
      { t: 'hot', p: 0.7, cd: 8, cost: 12, rng: 30, dur: 12, lvl: 1 },
      { t: 'buff', p: 0.35, cd: 20, cost: 10, rng: 0, dur: 15, lvl: 2 },
      { t: 'spell', p: 1.3, cd: 4, cost: 8, rng: 32, lvl: 3 },
      { t: 'mez', p: 0, cd: 20, cost: 14, rng: 32, dur: 6, lvl: 5 },
      { t: 'groupheal', p: 0.9, cd: 12, cost: 20, rng: 30, lvl: 7, name: 'Refrain apaisant' },
      { t: 'buff', p: 0.4, cd: 24, cost: 12, rng: 0, dur: 16, lvl: 10, name: 'Marche héroïque' },
      { t: 'root', p: 0, cd: 16, cost: 12, rng: 32, dur: 6, lvl: 14, name: 'Note paralysante' },
      { t: 'buff', p: 0.5, cd: 30, cost: 14, rng: 0, dur: 18, lvl: 20, name: 'Hymne héroïque' },
      { t: 'aoe', p: 1.9, cd: 18, cost: 22, rng: 30, lvl: 30, name: 'Crescendo' },
    ],
  },
};
// ------------------------------------------------------------
// Les 44 classes de Dark Age of Camelot
// stats: str/con/dex/qui/mag (mag = stat de magie, libellé via magStat)
// sk: noms des 4 compétences (mappées sur le modèle d'archétype)
// ------------------------------------------------------------
const C = (id, name, realm, arch, weapon, magStat, stats, races, sk) =>
  ({ id, name, realm, arch, weapon, magStat, stats, races, sk });

export const CLASSES = [
  // ===================== ALBION (15) =====================
  C('armsman', "Maître d'Armes", 'alb', 'tank', 'Hallebarde', null,
    { str: 80, con: 75, dex: 55, qui: 50, mag: 0 },
    ['Breton', 'Avalonien', 'Highlander', 'Sarrasin', 'Inconnu', 'Demi-Ogre'],
    ['Frappe de hallebarde', 'Coup de bouclier', 'Entaille profonde', 'Cri de garde']),
  C('paladin', 'Paladin', 'alb', 'tank', 'Épée à deux mains', 'pie',
    { str: 70, con: 70, dex: 55, qui: 50, mag: 40 },
    ['Breton', 'Avalonien', 'Highlander', 'Sarrasin'],
    ['Lame sacrée', 'Jugement', 'Brûlure divine', 'Chant de protection']),
  C('mercenary', 'Mercenaire', 'alb', 'tank', 'Doubles lames', null,
    { str: 72, con: 65, dex: 70, qui: 65, mag: 0 },
    ['Breton', 'Highlander', 'Sarrasin', 'Inconnu', 'Demi-Ogre'],
    ['Double frappe', 'Coup assommant', 'Lacération', 'Frénésie de duelliste']),
  C('reaver', 'Faucheur', 'alb', 'hybrid', 'Fléau', 'pie',
    { str: 68, con: 65, dex: 60, qui: 55, mag: 45 },
    ['Breton', 'Sarrasin', 'Inconnu'],
    ['Fléau des âmes', 'Drain vital', 'Pacte sombre', 'Vague de douleur']),
  C('cleric', 'Clerc', 'alb', 'healer', 'Masse', 'pie',
    { str: 50, con: 60, dex: 55, qui: 50, mag: 80 },
    ['Breton', 'Avalonien', 'Highlander'],
    ['Soin majeur', 'Prière de groupe', 'Châtiment', 'Bouclier de foi']),
  C('friar', 'Moine', 'alb', 'hybrid', 'Bâton', 'pie',
    { str: 60, con: 65, dex: 70, qui: 65, mag: 55 },
    ['Breton', 'Highlander'],
    ['Volée de bâton', 'Méditation curative', 'Ferveur', 'Tourbillon du pèlerin']),
  C('heretic', 'Hérétique', 'alb', 'hybrid', "Fléau d'armes", 'pie',
    { str: 62, con: 62, dex: 60, qui: 55, mag: 60 },
    ['Breton', 'Avalonien', 'Sarrasin', 'Inconnu'],
    ['Fléau hérétique', 'Absolution inversée', 'Feu intérieur', 'Flammes du blasphème']),
  C('infiltrator', 'Sicaire', 'alb', 'stealth', 'Dagues', null,
    { str: 60, con: 55, dex: 80, qui: 75, mag: 0 },
    ['Breton', 'Sarrasin', 'Inconnu'],
    ['Camouflage', 'Perforation des reins', 'Lame empoisonnée', 'Esquive parfaite']),
  C('scout', 'Éclaireur', 'alb', 'archer', 'Arc long', null,
    { str: 58, con: 58, dex: 78, qui: 70, mag: 0 },
    ['Breton', 'Highlander', 'Sarrasin'],
    ["Tir d'arc long", 'Tir critique', 'Flèche entravante', "Coup d'épée courte"]),
  C('minstrel', 'Ménestrel', 'alb', 'support', 'Épée et luth', 'cha',
    { str: 58, con: 58, dex: 68, qui: 65, mag: 60 },
    ['Breton', 'Highlander', 'Sarrasin'],
    ['Ballade régénérante', 'Chant de célérité', 'Accord perçant', 'Berceuse']),
  C('cabalist', 'Cabaliste', 'alb', 'caster', 'Bâton arcanique', 'int',
    { str: 40, con: 50, dex: 60, qui: 55, mag: 85 },
    ['Breton', 'Avalonien', 'Sarrasin', 'Inconnu', 'Demi-Ogre'],
    ['Lance spirituelle', 'Essaim corrosif', 'Entraves de matière', 'Explosion du golem']),
  C('sorcerer', 'Sorcier', 'alb', 'caster', 'Bâton arcanique', 'int',
    { str: 40, con: 48, dex: 60, qui: 55, mag: 88 },
    ['Breton', 'Avalonien', 'Sarrasin', 'Demi-Ogre'],
    ['Trait mental', "Érosion de l'esprit", 'Emprise paralysante', 'Tempête psychique']),
  C('theurgist', 'Théurgiste', 'alb', 'caster', 'Bâton élémentaire', 'int',
    { str: 40, con: 50, dex: 60, qui: 55, mag: 85 },
    ['Breton', 'Avalonien', 'Demi-Ogre'],
    ['Javelot de givre', 'Morsure du vent', 'Prison de terre', 'Nuée élémentaire']),
  C('wizard', 'Thaumaturge', 'alb', 'caster', 'Bâton élémentaire', 'int',
    { str: 38, con: 48, dex: 60, qui: 55, mag: 90 },
    ['Breton', 'Avalonien', 'Demi-Ogre'],
    ['Boule de feu', 'Combustion', 'Gel des chevilles', 'Pluie de météores']),
  C('necromancer', 'Nécromancien', 'alb', 'caster', 'Bâton occulte', 'int',
    { str: 40, con: 52, dex: 58, qui: 52, mag: 86 },
    ['Breton', 'Avalonien', 'Sarrasin', 'Inconnu'],
    ['Dard nécrotique', 'Peste rampante', 'Étreinte des morts', 'Nova de douleur']),

  // ===================== HIBERNIA (15) =====================
  C('animist', 'Animiste', 'hib', 'caster', 'Bâton vivant', 'int',
    { str: 40, con: 50, dex: 60, qui: 55, mag: 86 },
    ['Celte', 'Firbolg', 'Sylvan'],
    ['Dard de bogue', 'Spores virulentes', 'Racines vivantes', 'Éruption fongique']),
  C('bainshee', 'Bainshee', 'hib', 'caster', 'Bâton spectral', 'int',
    { str: 38, con: 48, dex: 60, qui: 55, mag: 88 },
    ['Celte', 'Lurikeen', 'Elfe'],
    ['Cri spectral', 'Lamentation', 'Voile glaçant', 'Onde hurlante']),
  C('bard', 'Barde', 'hib', 'support', 'Lame et harpe', 'cha',
    { str: 55, con: 58, dex: 65, qui: 62, mag: 62 },
    ['Celte', 'Firbolg'],
    ['Mélodie vivifiante', 'Chant du voyageur', 'Note discordante', 'Hymne du sommeil']),
  C('blademaster', 'Finelame', 'hib', 'tank', 'Doubles lames', null,
    { str: 70, con: 65, dex: 72, qui: 68, mag: 0 },
    ['Celte', 'Firbolg', 'Elfe', 'Shar'],
    ['Danse des lames', 'Garde brisée', 'Taillade', 'Posture du vent']),
  C('champion', 'Champion', 'hib', 'hybrid', 'Lame à deux mains', 'int',
    { str: 68, con: 66, dex: 60, qui: 56, mag: 45 },
    ['Celte', 'Lurikeen', 'Elfe', 'Shar'],
    ['Taille héroïque', 'Vigueur du champion', 'Faiblesse exposée', 'Estoc fulgurant']),
  C('druid', 'Druide', 'hib', 'healer', 'Bâton noueux', 'emp',
    { str: 50, con: 60, dex: 55, qui: 50, mag: 80 },
    ['Celte', 'Firbolg', 'Sylvan'],
    ['Sève régénératrice', 'Pluie purificatrice', 'Colère de la nature', 'Écorce protectrice']),
  C('eldritch', 'Eldritch', 'hib', 'caster', 'Bâton du vide', 'int',
    { str: 38, con: 46, dex: 60, qui: 56, mag: 90 },
    ['Lurikeen', 'Elfe'],
    ['Lance du vide', 'Dégénérescence', 'Entrave du néant', 'Implosion']),
  C('enchanter', 'Enchanteur', 'hib', 'caster', 'Bâton féérique', 'int',
    { str: 40, con: 48, dex: 60, qui: 56, mag: 87 },
    ['Lurikeen', 'Elfe'],
    ['Trait enchanté', 'Chaleur dévorante', 'Liens scintillants', "Cascade d'étincelles"]),
  C('hero', 'Protecteur', 'hib', 'tank', 'Lance celtique', null,
    { str: 78, con: 76, dex: 55, qui: 50, mag: 0 },
    ['Celte', 'Firbolg', 'Lurikeen', 'Shar', 'Sylvan'],
    ['Charge du protecteur', 'Mur de bouclier', 'Lacération de lance', 'Cœur de chêne']),
  C('mentalist', 'Mentaliste', 'hib', 'caster', 'Bâton mental', 'int',
    { str: 40, con: 50, dex: 60, qui: 55, mag: 86 },
    ['Celte', 'Lurikeen', 'Elfe', 'Shar'],
    ['Fouet mental', 'Tourment', 'Cage psychique', 'Résonance douloureuse']),
  C('nightshade', 'Ombre Nocturne', 'hib', 'stealth', 'Lames empoisonnées', 'int',
    { str: 58, con: 54, dex: 80, qui: 76, mag: 30 },
    ['Lurikeen', 'Elfe'],
    ["Voile d'ombre", 'Lame dans le dos', 'Venin nocturne', "Pas de l'ombre"]),
  C('ranger', 'Rôdeur', 'hib', 'archer', 'Arc recourbé', null,
    { str: 58, con: 56, dex: 78, qui: 72, mag: 0 },
    ['Celte', 'Lurikeen', 'Elfe', 'Shar', 'Sylvan'],
    ['Tir précis', 'Flèche du crépuscule', 'Flèche de ronces', 'Riposte aux lames']),
  C('valewalker', 'Arpenteur du Val', 'hib', 'hybrid', 'Faux', 'int',
    { str: 70, con: 66, dex: 58, qui: 54, mag: 50 },
    ['Celte', 'Firbolg', 'Sylvan'],
    ['Moisson de la faux', 'Sève vitale', 'Aubaine sylvestre', 'Faucheuse tournoyante']),
  C('vampiir', 'Vampiir', 'hib', 'hybrid', 'Griffes', 'dex',
    { str: 66, con: 62, dex: 74, qui: 70, mag: 40 },
    ['Celte', 'Lurikeen', 'Shar'],
    ['Morsure sanglante', 'Drain de vie', 'Vélocité vampirique', 'Déchiquetage']),
  C('warden', 'Sentinelle', 'hib', 'hybrid', 'Lame et bouclier', 'emp',
    { str: 62, con: 66, dex: 58, qui: 54, mag: 55 },
    ['Celte', 'Firbolg', 'Sylvan'],
    ['Frappe de la sentinelle', 'Baume sylvestre', 'Bulle de protection', 'Représailles']),

  // ===================== MIDGARD (14) =====================
  C('berserker', 'Berserker', 'mid', 'tank', 'Haches jumelles', null,
    { str: 78, con: 68, dex: 62, qui: 60, mag: 0 },
    ['Norrois', 'Troll', 'Nain', 'Valkyn'],
    ['Déchaînement', 'Coup étourdissant', 'Hache sanglante', 'Rage du fauve']),
  C('bonedancer', "Danseur d'Os", 'mid', 'caster', "Bâton d'ossements", 'pie',
    { str: 40, con: 52, dex: 58, qui: 52, mag: 86 },
    ['Kobold', 'Troll', 'Valkyn', 'Frostalf'],
    ["Trait d'os", 'Pourriture', 'Étreinte squelettique', 'Danse macabre']),
  C('healer', 'Guérisseur', 'mid', 'healer', 'Masse runique', 'pie',
    { str: 48, con: 58, dex: 55, qui: 50, mag: 82 },
    ['Norrois', 'Nain', 'Frostalf'],
    ['Guérison runique', 'Cercle de soins', 'Marteau de fureur', 'Augure de vigueur']),
  C('hunter', 'Chasseur', 'mid', 'archer', 'Arc composite', null,
    { str: 60, con: 58, dex: 76, qui: 70, mag: 0 },
    ['Norrois', 'Kobold', 'Nain', 'Valkyn', 'Frostalf'],
    ['Tir du chasseur', 'Flèche mortelle', 'Piège givrant', 'Coup de lance']),
  C('runemaster', "Prêtre d'Odin", 'mid', 'caster', 'Bâton runique', 'pie',
    { str: 38, con: 48, dex: 60, qui: 55, mag: 90 },
    ['Norrois', 'Kobold', 'Nain', 'Frostalf'],
    ['Rune de destruction', 'Rune de décomposition', "Rune d'entrave", 'Déluge runique']),
  C('savage', 'Sauvage', 'mid', 'tank', 'Griffes de combat', null,
    { str: 74, con: 64, dex: 70, qui: 70, mag: 0 },
    ['Norrois', 'Troll', 'Nain', 'Kobold', 'Valkyn'],
    ['Griffes déchirantes', 'Coup de boutoir', 'Hémorragie', 'Transe guerrière']),
  C('shadowblade', "Lame de l'Ombre", 'mid', 'stealth', 'Lames nordiques', null,
    { str: 62, con: 56, dex: 78, qui: 74, mag: 0 },
    ['Norrois', 'Kobold', 'Valkyn'],
    ["Linceul d'ombre", 'Assassinat', 'Lame gangrenée', "Réflexes d'ombre"]),
  C('shaman', 'Chaman', 'mid', 'healer', 'Bâton totémique', 'pie',
    { str: 50, con: 62, dex: 54, qui: 50, mag: 80 },
    ['Troll', 'Kobold', 'Frostalf'],
    ['Soin des esprits', 'Fontaine totémique', "Crachat d'acide", 'Peau de pierre']),
  C('skald', 'Skald', 'mid', 'support', 'Marteau et voix', 'cha',
    { str: 64, con: 62, dex: 60, qui: 58, mag: 55 },
    ['Norrois', 'Troll', 'Nain', 'Kobold'],
    ['Chant de guerre', 'Hymne de marche', 'Cri tonitruant', 'Complainte hypnotique']),
  C('spiritmaster', 'Maître des Esprits', 'mid', 'caster', 'Bâton spirituel', 'pie',
    { str: 40, con: 50, dex: 58, qui: 54, mag: 87 },
    ['Norrois', 'Kobold', 'Frostalf'],
    ['Lance spectrale', 'Tourment des âmes', 'Chaînes spirituelles', 'Vortex des esprits']),
  C('thane', 'Thane', 'mid', 'hybrid', 'Marteau de tonnerre', 'pie',
    { str: 70, con: 68, dex: 58, qui: 54, mag: 48 },
    ['Norrois', 'Troll', 'Nain', 'Frostalf'],
    ['Marteau de Thor', "Bénédiction d'Asgard", 'Appel de la foudre', 'Frappe orageuse']),
  C('valkyrie', 'Valkyrie', 'mid', 'hybrid', "Lance d'Odin", 'pie',
    { str: 66, con: 64, dex: 62, qui: 58, mag: 50 },
    ['Norrois', 'Frostalf'],
    ['Lance des élus', 'Grâce de Freya', 'Aura des Walkyries', "Jugement d'Odin"]),
  C('warlock', 'Sorcier Noir', 'mid', 'caster', 'Bâton maudit', 'pie',
    { str: 38, con: 50, dex: 58, qui: 54, mag: 88 },
    ['Norrois', 'Kobold', 'Frostalf'],
    ['Malédiction primaire', 'Chaos rampant', 'Geôle maudite', 'Détonation du chaos']),
  C('warrior', 'Guerrier', 'mid', 'tank', 'Hache et bouclier', null,
    { str: 80, con: 78, dex: 54, qui: 50, mag: 0 },
    ['Norrois', 'Troll', 'Nain', 'Kobold', 'Valkyn'],
    ['Frappe de hache', 'Bouclier écrasant', 'Entaille barbare', 'Cri de Jordheim']),
];

export const classById = (id) => CLASSES.find((c) => c.id === id);
export const classesOfRealm = (r) => CLASSES.filter((c) => c.realm === r);

export const MAG_LABELS = { int: 'Intelligence', pie: 'Piété', emp: 'Empathie', cha: 'Charisme', dex: 'Dextérité' };

// ------------------------------------------------------------
// Progression
// ------------------------------------------------------------
export const MAX_LEVEL = 50;
export const xpForLevel = (lvl) => Math.floor(40 * Math.pow(lvl, 2.1));
export const maxHp = (cls, lvl) => Math.floor((120 + lvl * 22 + cls.stats.con * 1.5) * ARCHETYPES[cls.arch].hp);
export const maxPower = (cls, lvl) => Math.floor((80 + lvl * 14 + cls.stats.mag) * ARCHETYPES[cls.arch].power);

// ------------------------------------------------------------
// Mobs PvE (par royaume) et frontière
// ------------------------------------------------------------
export const MOB_TYPES = {
  alb: [
    { id: 'bandit', name: 'Bandit de grand chemin', lvl: [1, 4] },
    { id: 'boar', name: 'Sanglier furieux', lvl: [3, 7] },
    { id: 'undead', name: 'Squelette romain', lvl: [6, 11] },
    { id: 'giant', name: 'Géant des collines', lvl: [10, 16] },
  ],
  hib: [
    { id: 'sprite', name: 'Lutin malicieux', lvl: [1, 4] },
    { id: 'wolf', name: 'Loup de Connacht', lvl: [3, 7] },
    { id: 'fomor', name: 'Fomoire', lvl: [6, 11] },
    { id: 'treant', name: 'Sylvanien corrompu', lvl: [10, 16] },
  ],
  mid: [
    { id: 'rat', name: 'Rat des neiges', lvl: [1, 4] },
    { id: 'svartalf', name: 'Svartalf', lvl: [3, 7] },
    { id: 'draugr', name: 'Draugr', lvl: [6, 11] },
    { id: 'jotun', name: 'Jotun des glaces', lvl: [10, 16] },
  ],
  frontier: [
    { id: 'outlaw', name: 'Maraudeur frontalier', lvl: [12, 18] },
    { id: 'drake', name: 'Drake des frontières', lvl: [14, 22] },
    { id: 'wraith', name: 'Spectre de guerre', lvl: [16, 24] },
  ],
};

// ------------------------------------------------------------
// Quêtes (3 par royaume)
// ------------------------------------------------------------
export const QUESTS = {
  alb: [
    { id: 'alb_q1', name: 'Nettoyer les routes', desc: 'Tuez 5 bandits de grand chemin.', target: 'bandit', count: 5, xp: 400, gold: 30 },
    { id: 'alb_q2', name: 'La menace des collines', desc: 'Abattez 3 géants des collines.', target: 'giant', count: 3, xp: 1500, gold: 80 },
    { id: 'alb_q3', name: 'Pour la gloire de Camelot', desc: "Tuez 2 ennemis d'un royaume adverse en zone frontalière.", target: '__enemy', count: 2, xp: 2500, gold: 150 },
  ],
  hib: [
    { id: 'hib_q1', name: 'Petites pestes', desc: 'Tuez 5 lutins malicieux.', target: 'sprite', count: 5, xp: 400, gold: 30 },
    { id: 'hib_q2', name: 'La forêt souillée', desc: 'Détruisez 3 sylvaniens corrompus.', target: 'treant', count: 3, xp: 1500, gold: 80 },
    { id: 'hib_q3', name: 'Pour Hibernia !', desc: "Tuez 2 ennemis d'un royaume adverse en zone frontalière.", target: '__enemy', count: 2, xp: 2500, gold: 150 },
  ],
  mid: [
    { id: 'mid_q1', name: 'Vermine des neiges', desc: 'Tuez 5 rats des neiges.', target: 'rat', count: 5, xp: 400, gold: 30 },
    { id: 'mid_q2', name: 'Le réveil des morts', desc: 'Renvoyez 3 draugar à la tombe.', target: 'draugr', count: 3, xp: 1500, gold: 80 },
    { id: 'mid_q3', name: 'Pour Midgard !', desc: "Tuez 2 ennemis d'un royaume adverse en zone frontalière.", target: '__enemy', count: 2, xp: 2500, gold: 150 },
  ],
};

// ------------------------------------------------------------
// Objets de marchand
// ------------------------------------------------------------
export const SHOP = [
  { id: 'potion_hp', name: 'Potion de soin', price: 20, heal: 0.5 },
  { id: 'potion_pw', name: 'Potion de mana', price: 20, power: 0.5 },
];

// ------------------------------------------------------------
// Messages réseau
// ------------------------------------------------------------
export const MSG = {
  // client -> serveur
  CREATE: 'create', MOVE: 'move', SKILL: 'skill', ATTACK: 'attack', TARGET: 'target',
  CHAT: 'chat', QUEST_ACCEPT: 'qaccept', QUEST_TURNIN: 'qturnin', BUY: 'buy', USE_ITEM: 'useitem',
  RECRUIT: 'recruit', RESPAWN: 'respawn', INTERACT: 'interact',
  LEARN: 'learn', EQUIP: 'equip', UNEQUIP: 'unequip', SELL: 'sell',
  AUTH: 'auth', DELCHAR: 'delchar',
  // serveur -> client
  WELCOME: 'welcome', STATE: 'state', EVENT: 'event', SELF: 'self', CHAT_BC: 'chatbc', DEAD: 'dead',
  AUTHED: 'authed', ROSTER: 'roster',
};

// ============================================================
// RACES — traits morphologiques pour des avatars différenciés
// h: échelle hauteur · w: échelle largeur · skin: couleur peau
// ears: 'pointy' | null · beard · tusks · build: silhouette
// ============================================================
export const RACES = {
  // Albion
  'Breton':     { h: 1.00, w: 1.00, skin: 0xd9b48f, build: 'norm' },
  'Avalonien':  { h: 1.02, w: 0.90, skin: 0xe7c9a4, build: 'slim' },
  'Highlander': { h: 1.12, w: 1.10, skin: 0xd6ad86, build: 'stocky', beard: true },
  'Sarrasin':   { h: 1.00, w: 0.98, skin: 0xa9744a, build: 'norm' },
  'Inconnu':    { h: 1.05, w: 0.95, skin: 0xb7c2bf, build: 'slim' },
  'Demi-Ogre':  { h: 1.42, w: 1.42, skin: 0x8c9a6e, build: 'stocky', tusks: true },
  // Hibernia
  'Celte':      { h: 1.02, w: 1.00, skin: 0xe2bf98, build: 'norm' },
  'Firbolg':    { h: 1.30, w: 1.32, skin: 0xa8b78b, build: 'stocky' },
  'Lurikeen':   { h: 0.70, w: 0.86, skin: 0xe9c8a2, build: 'slim', ears: 'pointy' },
  'Elfe':       { h: 1.06, w: 0.84, skin: 0xf1dac2, build: 'slim', ears: 'pointy' },
  'Sylvan':     { h: 1.16, w: 1.12, skin: 0x70592f, build: 'stocky' },
  'Shar':       { h: 1.10, w: 1.18, skin: 0x9aa0ab, build: 'stocky' },
  // Midgard
  'Norrois':    { h: 1.06, w: 1.04, skin: 0xe6c19a, build: 'norm', beard: true },
  'Troll':      { h: 1.50, w: 1.46, skin: 0x6f9460, build: 'stocky', tusks: true },
  'Nain':       { h: 0.78, w: 1.22, skin: 0xd9a87e, build: 'stocky', beard: true },
  'Kobold':     { h: 0.74, w: 0.84, skin: 0x84a55c, build: 'slim', ears: 'pointy' },
  'Valkyn':     { h: 1.00, w: 0.96, skin: 0x6e604c, build: 'slim', ears: 'pointy' },
  'Frostalf':   { h: 1.04, w: 0.90, skin: 0xc2e3f0, build: 'slim', ears: 'pointy' },
};
export const raceTraits = (name) => RACES[name] || { h: 1, w: 1, skin: 0xd9b48f, build: 'norm' };

// ============================================================
// SORTS — coût d'apprentissage chez l'entraîneur (or)
// ============================================================
export const skillCost = (lvl) => Math.round(15 + (Math.max(1, lvl) - 1) * 16);

// ============================================================
// ÉQUIPEMENT & LOOT
// ============================================================
export const EQUIP_SLOTS = ['weapon', 'head', 'chest', 'feet', 'ring', 'amulet'];
export const SLOT_LABELS = { weapon: 'Arme', head: 'Casque', chest: 'Armure', feet: 'Bottes', ring: 'Anneau', amulet: 'Amulette' };

// classe d'armure portée selon l'archétype
export const WEIGHT_BY_ARCH = {
  tank: 'lourde', hybrid: 'moyenne', healer: 'moyenne', support: 'moyenne',
  archer: 'moyenne', caster: 'légère', stealth: 'légère',
};
export const weightOfArch = (arch) => WEIGHT_BY_ARCH[arch] || 'moyenne';

export const RARITIES = [
  { id: 'commun', label: 'Commun', mult: 1.0, color: '#c8ccd8', w: 60 },
  { id: 'rare', label: 'Rare', mult: 1.4, color: '#5aa9e6', w: 27 },
  { id: 'epique', label: 'Épique', mult: 1.9, color: '#b96be0', w: 10 },
  { id: 'legendaire', label: 'Légendaire', mult: 2.6, color: '#f0a93a', w: 3 },
];
export const rarityById = (id) => RARITIES.find((r) => r.id === id) || RARITIES[0];

const ARMOR_BASE = { 'légère': 4, 'moyenne': 7, 'lourde': 11 };
const PIECE_FACTOR = { chest: 1.5, head: 0.9, feet: 0.7 };
const WEAPON_NAMES = ['Lame', 'Hache', 'Masse', 'Dague', 'Bâton', 'Fléau', 'Lance'];
const ARMOR_MAT = { 'légère': 'de cuir', 'moyenne': 'de mailles', 'lourde': 'de plaques' };
const SLOT_BASE = {
  weapon: WEAPON_NAMES,
  head: ['Heaume', 'Casque', 'Coiffe', 'Capuche'],
  chest: ['Plastron', 'Cuirasse', 'Cotte', 'Harnois'],
  feet: ['Bottes', 'Jambières', 'Solerets', 'Grèves'],
  ring: ['Anneau', 'Bague', 'Chevalière'],
  amulet: ['Amulette', 'Pendentif', 'Talisman'],
};
const RARITY_ADJ = { commun: '', rare: "de l'aguerri", epique: 'runique', legendaire: 'des Anciens' };

const pickFrom = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

// Génère un objet d'équipement. rnd = générateur [0,1) (Math.random par défaut).
export function genItem({ id, slot, lvl, rarity = 'commun', weight = 'moyenne', rnd = Math.random }) {
  const R = rarityById(rarity);
  const L = Math.max(1, lvl | 0);
  const sb = (base) => Math.max(1, Math.round(base * (1 + L * 0.22) * R.mult));
  const it = { id, slot, lvl: L, rarity, weight: null, name: '', dmg: 0, armor: 0, stats: {}, hp: 0, power: 0, value: 0 };
  const base = pickFrom(SLOT_BASE[slot], rnd);
  const adj = RARITY_ADJ[rarity];

  if (slot === 'weapon') {
    it.dmg = +( (2.4 + L * 0.7) * R.mult ).toFixed(1);
    it.stats.str = sb(1); it.stats.dex = sb(1);
    it.name = `${base} ${adj || 'de combat'}`.trim();
  } else if (slot === 'ring' || slot === 'amulet') {
    it.stats.mag = sb(1); it.stats.qui = sb(1);
    it.power = sb(4); it.hp = sb(3);
    it.name = `${base} ${adj || 'gravé'}`.trim();
  } else { // pièces d'armure
    it.weight = weight;
    it.armor = Math.round((ARMOR_BASE[weight] + L * 0.8) * (PIECE_FACTOR[slot] || 1) * R.mult);
    it.stats.con = sb(2);
    if (slot === 'chest') it.hp = sb(5);
    it.name = `${base} ${ARMOR_MAT[weight]}${adj ? ' ' + adj : ''}`.trim();
  }
  it.value = Math.max(5, Math.round((it.dmg * 6 + it.armor * 2 + (it.hp + it.power) * 0.5 + 4) * (1 + L * 0.3)));
  return it;
}

// Agrège les bonus de toutes les pièces équipées d'un joueur.
export function gearBonus(equip) {
  const out = { str: 0, con: 0, dex: 0, qui: 0, mag: 0, hp: 0, power: 0, armor: 0, dmg: 0 };
  if (!equip) return out;
  for (const slot of EQUIP_SLOTS) {
    const it = equip[slot];
    if (!it) continue;
    for (const k of ['str', 'con', 'dex', 'qui', 'mag']) out[k] += (it.stats && it.stats[k]) || 0;
    out.hp += it.hp || 0; out.power += it.power || 0; out.armor += it.armor || 0; out.dmg += it.dmg || 0;
  }
  return out;
}
