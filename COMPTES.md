# 👤 Comptes joueurs & connexion Google (SSO)

Les personnages sont sauvegardés **côté serveur, par compte**. Un joueur retrouve
donc ses héros depuis n'importe quel appareil/navigateur en se reconnectant.

## Deux modes

- **Invité** (par défaut, zéro config) : un identifiant est généré et stocké dans
  le navigateur. Les personnages sont liés à *ce* navigateur (comme avant), mais
  désormais conservés sur le serveur.
- **Google (SSO)** : le joueur se connecte avec son compte Google ; ses
  personnages sont liés à ce compte et **accessibles depuis tous ses appareils**.

## Activer la connexion Google (5 min)

1. Va sur **console.cloud.google.com** → crée un projet (gratuit).
2. *API et services → Écran de consentement OAuth* : configure (External), ajoute
   ton email comme utilisateur de test.
3. *Identifiants → Créer des identifiants → ID client OAuth → Application Web*.
4. **Origines JavaScript autorisées** : ajoute l'URL où tourne le jeu, ex.
   `https://realms-at-war.onrender.com` (et/ou `https://jeu.ton-site.com`,
   `http://localhost:8080` pour tester).
5. Copie l'**ID client** (`xxxx.apps.googleusercontent.com`) et colle-le dans
   `client/index.html` :
   ```html
   <script>window.RAW_CONFIG = { server: "", googleClientId: "xxxx.apps.googleusercontent.com" };</script>
   ```
6. **(Recommandé)** côté serveur Render, ajoute la variable d'environnement
   `GOOGLE_CLIENT_ID = xxxx.apps.googleusercontent.com` : le serveur vérifie alors
   que les jetons reçus sont bien destinés à ton application.

Le bouton « Se connecter avec Google » apparaît alors sur l'écran d'accueil. Sans
ID configuré, seul le mode invité est proposé (le jeu fonctionne normalement).

## Comment c'est sécurisé

À la connexion, le navigateur reçoit un **jeton signé** de Google. Le serveur le
**vérifie** auprès de Google (endpoint `tokeninfo`) avant d'ouvrir le compte ; il
récupère un identifiant stable (`sub`) qui sert de clé de compte. Aucun mot de
passe n'est géré par le jeu.

## Où sont stockés les personnages

Dans `server/save.json`, regroupés par compte :
`{ accounts: { "google:<id>": { email, chars: { ... } }, "guest:<id>": { chars: {...} } } }`.
Les anciennes sauvegardes à plat sont migrées automatiquement vers un compte hérité.
