# ⚔ Realms at War

MMORPG **low poly** inspiré de *Dark Age of Camelot* : 3 royaumes, **les 44 classes**, PvE, RvR, quêtes et groupes. Client 3D Three.js + serveur Node.js autoritaire (WebSocket).

> Projet fan **non commercial**, créé de zéro. Aucun asset, code ou donnée de DAoC n'est utilisé. *Dark Age of Camelot* est une marque de Broadsword Online Games / EA.

## Lancer le jeu

```bash
npm install
npm start
# puis ouvrir http://localhost:8080
```

Multijoueur : tout joueur ouvrant la page sur le même serveur partage le même monde.

**Pas de Node.js sur votre hébergement ?** Voir **[HEBERGEMENT.md](HEBERGEMENT.md)** :
déploiement gratuit du serveur sur Render, client sur votre hébergement.

À l'ouverture, si vous avez déjà créé au moins un personnage, un **écran de sélection**
liste vos héros (niveau, or) ; sinon l'écran de création s'affiche directement.

## Contenu de la v0.1

| | |
|---|---|
| **Royaumes** | Albion (Camelot), Hibernia (Tir na Nog), Midgard (Jordheim) |
| **Classes** | Les 44 classes de DAoC, toutes jouables, regroupées en 7 archétypes (combattant, hybride, soigneur, mage, furtif, archer, barde) avec 6 compétences chacune, débloquées aux niveaux 1/4/8/12/20/30 |
| **Collisions** | Décor déterministe partagé client/serveur (arbres, rochers, murailles, tours, donjons) + collisions entre entités, avec prédiction côté client |
| **Sauvegarde** | Personnages persistés (niveau, XP, or, objets, quêtes, position) : `server/save.json` en multijoueur, localStorage en solo. Reprenez le même nom + royaume + classe |
| **PvE** | 4 camps de monstres par royaume (niv. 1 → 16), XP, or, niveaux 1-50 |
| **RvR** | **Grande zone frontalière centrale** reliant les 3 royaumes par des routes, IA ennemies des deux autres royaumes, **Fort Central renforcé (murailles, tours, donjon) capturable** |
| **Villes** | Capitale par royaume : entraîneur, marchand, émissaire (quêtes), gardes |
| **Quêtes** | 3 par royaume (PvE + RvR), journal de quêtes |
| **Groupes** | Recrutez jusqu'à 2 compagnons IA (tank / soigneur) |
| **Divers** | Furtivité, mez/root/stun, DoT/HoT, potions, chat de royaume, mort/résurrection |

## Commandes

ZQSD / WASD / flèches : déplacement · souris : caméra (glisser) + molette zoom · clic : cibler · **R** attaque auto · **1-4** compétences · **E** parler au PNJ · **F** cible la plus proche · **J** journal de quêtes · **T/Y** potions · **Entrée** chat

## Architecture

```
realms-at-war/
├── shared/data.js      # Royaumes, races, 44 classes, archétypes, mobs, quêtes (commun client/serveur)
├── server/
│   ├── index.js        # HTTP statique + WebSocket
│   └── game.js         # Logique autoritaire : combat, XP, IA (mobs, gardes, RvR, compagnons), fort, quêtes
├── client/
│   ├── index.html      # Création de personnage + HUD
│   ├── css/style.css
│   └── js/             # main.js (rendu 3D low poly), ui.js, net.js, charcreate.js
└── smoke.test.mjs      # Test de fumée (serveur lancé requis) : node smoke.test.mjs
```

Le serveur fait autorité (positions vérifiées, combat, XP, IA à 10 Hz, diffusion d'état ~7 Hz aux joueurs dans un rayon de 450 m).

## Mettre en ligne (sans git)

Pas besoin de git installé : voir **[HEBERGEMENT.md](HEBERGEMENT.md)**. En résumé,
on crée un dépôt GitHub dans le navigateur (Add file → Upload files, glisser-déposer),
puis on connecte Render au dépôt. Déploiement gratuit en quelques minutes.

## Feuille de route suggérée

1. **v0.2** — persistance des personnages