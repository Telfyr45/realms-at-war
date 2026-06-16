# 🌐 Héberger Realms at War en multijoueur (sans Node.js, **sans git**)

Votre hébergement web classique (type OVH, Hostinger, o2switch…) sert très bien les
**fichiers du client** (HTML/JS/CSS), mais le **serveur de jeu** a besoin de Node.js +
WebSocket, absents de ces hébergements.

La solution simple et **gratuite** : déployer le petit serveur Node sur **Render**.
**Aucune installation de git n'est nécessaire** — tout se fait dans le navigateur.

---

## 📦 Étape 0 — Préparer les fichiers (1 min)

1. Décompressez `realms-at-war.zip` (clic droit → « Extraire tout » sous Windows).
2. **Supprimez le dossier caché `.git`** s'il apparaît (inutile ici).
   Il doit vous rester : `server/`, `client/`, `shared/`, `package.json`,
   `package-lock.json`, `render.yaml`, etc.

---

## ✅ Variante A — Tout sur Render (le plus simple, rien chez vous)

Le serveur Node sert *aussi* le client : une seule URL, zéro configuration.

### 1. Mettre le code sur GitHub **sans git** (dans le navigateur)
1. Créez un compte gratuit sur https://github.com → bouton **New** (nouveau dépôt).
2. Nommez-le `realms-at-war`, laissez **Public**, cliquez **Create repository**.
3. Sur la page du dépôt vide : lien **« uploading an existing file »**
   (ou **Add file → Upload files**).
4. **Glissez-déposez** les fichiers et dossiers préparés à l'étape 0
   (vous pouvez déposer les dossiers entiers, GitHub conserve l'arborescence).
5. Tout en bas, cliquez **Commit changes**. ✔️ Votre code est en ligne, sans git.

### 2. Déployer sur Render
1. Compte gratuit sur https://render.com → **New + → Web Service**.
2. Connectez votre GitHub et choisissez le dépôt `realms-at-war`.
3. Render lit `render.yaml` et remplit tout seul. Sinon, manuellement :
   **Build Command** `npm install` · **Start Command** `npm start` ·
   **Instance Type : Free**.
4. **Create Web Service**. Après 2-3 min, Render donne une URL du type
   `https://realms-at-war.onrender.com` → **c'est votre jeu en ligne**, partagez-la.

> Le client est déjà réglé (`server: ""`) pour se connecter au serveur qui le sert :
> rien d'autre à faire.

---

## ✅ Variante B — Le client sur VOTRE hébergement, le serveur sur Render

Pour afficher le jeu sous votre nom de domaine.

1. Faites la **variante A** pour obtenir l'URL Render du serveur.
2. Par FTP, envoyez **à la racine** de votre site (ou d'un sous-domaine) :
   ```
   votre-site/
   ├── index.html      ← client/index.html
   ├── css/            ← client/css
   ├── js/             ← client/js
   └── shared/         ← le dossier shared (au même niveau, IMPORTANT)
   ```
   ⚠️ Le client charge `/shared/...` : il doit être **à la racine** du domaine ou
   sous-domaine (ex. `jeu.mon-site.com`), pas dans un sous-dossier.
3. Ouvrez `index.html` (éditeur de texte) et renseignez l'URL Render :
   ```html
   <script>window.RAW_CONFIG = { server: "wss://realms-at-war.onrender.com" };</script>
   ```
   (notez bien `wss://` et non `https://`)
4. Visitez votre site : le client se connecte au serveur Render. 🎉

> Variante sans toucher au fichier : ajoutez l'adresse dans l'URL →
> `https://votre-site/?server=wss://realms-at-war.onrender.com`

---

## ⏰ Le plan gratuit Render « s'endort »

Sur l'offre gratuite, le serveur se met en veille après ~15 min sans visiteur ; le
**premier** joueur attend alors ~50 s le temps du réveil (ensuite, instantané).

Pour le garder éveillé gratuitement : sur https://cron-job.org (gratuit), créez un
ping qui appelle votre URL Render toutes les 10 minutes.

---

## 🔁 Autres options gratuites (toujours sans git)

| Plateforme | Pour qui | Remarque |
|---|---|---|
| **Render** (recommandé) | Le plus simple, `render.yaml` fourni | S'endort après 15 min |
| **Koyeb** (koyeb.com) | Veut un serveur **toujours actif** | Déploie aussi depuis GitHub (upload web) |
| **Glitch** (glitch.com) | Zéro GitHub : importez le `.zip`/éditez en ligne | Petit hébergeur, idéal tests |
| **Replit** (replit.com) | Édition 100 % navigateur | « Deployments » pour une URL stable |

Sur Koyeb : même principe que Render (build `npm install`, start `npm start`), puis
mettez l'URL `wss://…` dans `RAW_CONFIG.server`.

---

*Le serveur écoute sur `process.env.PORT` (fourni automatiquement par l'hébergeur) et le
WebSocket passe par le même port — aucune configuration réseau supplémentaire.*
