# 🧍 Modèles de personnages & animations

## Ce qui est livré

Chaque personnage est un **humanoïde riggé** (squelette d'os hiérarchique :
bassin → colonne → torse → cou/tête, épaules → bras → avant-bras → mains,
hanches → cuisses → tibias → pieds). Une **machine à états** anime ces os :
repos (respiration), marche, course, saut, **attaque** (armement + frappe),
**incantation** (bras levés), **mort** (effondrement), avec fondus.
Chaque **race** a déjà un placeholder distinct (stature, carrure, peau, oreilles,
barbe, défenses). Les mobs sont soit des **bêtes** quadrupèdes, soit des
**humanoïdes** riggés.

## Brancher de vrais modèles HD (glTF/GLB)

Le chargeur est déjà en place (`client/js/models.js`). Pour utiliser un vrai
modèle, il suffit de renseigner une URL `.glb` :

```js
// par exemple dans models.js (ou via la console)
MODEL_URLS['Troll']     = '/assets/characters/troll.glb';   // par race
MODEL_URLS['tank']      = '/assets/characters/warrior.glb'; // par archetype
MODEL_URLS['alb:tank']  = '/assets/characters/alb_warrior.glb'; // cle precise (royaume:archetype)
```

Place les fichiers dans un dossier `assets/characters/` servi par ton hébergement
(c'est pourquoi cette fonctionnalité vise la **version multijoueur** hébergée, pas
le mono-fichier solo). Si un modèle contient des **clips d'animation** nommés
(`idle`, `walk`, `run`, `attack`, `cast`, `death`…), ils sont lus via un
`AnimationMixer`. Sans URL, on garde le placeholder procédural (aucun coût).

## Où trouver modèles + animations

- **Mixamo** (gratuit) : perso humanoïde + animations mocap (idle/marche/course/
  attaque/mort). Export FBX → conversion GLB (Blender), ou GLB direct.
- **Ready Player Me** : avatars GLB, squelette compatible Mixamo.
- **Quaternius / Kenney** (CC0) : persos et monstres riggés, libres de droits.
- **Synty / KayKit** : packs fantasy cohérents (payants/partiellement gratuits).
- **Sketchfab** : nombreux modèles CC-BY/CC0 riggés.

## Textures HD & lumière

Matériaux PBR (déjà en place) : textures *albedo + normal + roughness + metalness*
(Poly Haven, AmbientCG). Ajouter une **HDRI** d'environnement améliore nettement le
rendu. Compresser en **KTX2/Basis** (textures) et **Draco** (géométrie) pour des
téléchargements légers.

## Pipeline conseillé

Blender : importer le modèle + les animations Mixamo, fusionner en un seul GLB
multi-clips, puis optimiser avec `gltf-transform` (Draco + KTX2). Déposer le GLB
dans `assets/characters/` et renseigner `MODEL_URLS`.

## ⚡ Pack de démo prêt à l'emploi (1 interrupteur)

Pour voir tout de suite de vrais personnages 3D **riggés et animés**, sans rien
télécharger ni héberger, passez `useDemoModels: true` dans `window.RAW_CONFIG`
(`client/index.html`). Tous les humanoïdes utilisent alors le modèle **RobotExpressive**
(Tomás Laulhé, modifié par Don McCurdy — licence **CC0**), chargé depuis le CDN
jsDelivr, avec ses animations (idle, marche, course, saut, mort, coup de poing).
Le jeu mappe automatiquement l'état (vitesse, saut, mort, attaque) sur ces clips.

C'est un **placeholder de démo unique** (même modèle pour toutes les races) :
pour des modèles distincts par race/classe, renseignez `MODEL_URLS` comme ci-dessus
avec vos propres `.glb`. Sans interrupteur ni URL, on garde les avatars riggés
procéduraux (différenciés par race).
