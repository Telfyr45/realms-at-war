#!/usr/bin/env bash
# Génère solo.html : version un seul fichier, jouable sans serveur (double-clic).
set -e
cd "$(dirname "$0")"
W=$(mktemp -d)

# 1) données partagées (sans 'export'), puis module de collisions (sans import/export)
sed 's/^export //' shared/data.js > "$W/01_data.js"
sed -e '/^import /d' -e 's/^export //' shared/collision.js > "$W/01b_collision.js"

# 2) logique serveur (sans les imports mono et multi-lignes, sans 'export')
awk '
  /^import .*;[[:space:]]*$/ { next }
  /^import \{/ { skip=1; next }
  skip && /;[[:space:]]*$/ { skip=0; next }
  skip { next }
  { print }
' server/game.js | sed 's/^export //' > "$W/02_game.js"
grep -q "class Game" "$W/02_game.js" || { echo "ERREUR: game.js mal extrait"; exit 1; }

# 3) shim réseau local (remplace WebSocket) + sauvegarde dans le navigateur
cat > "$W/03_net.js" <<'EOF'
// ===== Mode SOLO : serveur simulé localement, zéro réseau =====
class Net {
  constructor(game) {
    this.handlers = {};
    this.ready = Promise.resolve();
    this.game = game;
    this.session = game.addConnection({ readyState: 1 });
  }
  on(type, fn) { (this.handlers[type] ||= []).push(fn); }
  send(type, data = {}) { queueMicrotask(() => this.game.handleMessage(this.session, { type, ...data })); }
  deliver(type, data) { (this.handlers[type] || []).forEach((h) => h({ type, ...data })); }
}
// sauvegarde des personnages dans le navigateur (localStorage)
const soloStorage = {
  load() { try { return JSON.parse(localStorage.getItem('raw_saves') || '{}'); } catch { return {}; } },
  save(d) { try { localStorage.setItem('raw_saves', JSON.stringify(d)); } catch {} },
};
const game = new Game(soloStorage);
const net = new Net(game);
game.send = (session, type, data) => net.deliver(type, data);
game.start();
addEventListener('beforeunload', () => {
  for (const s of game.sessions) if (s.player) game.persistPlayer(s.player);
  game.flushSaves();
});
EOF

# 4) UI + création de perso (sans imports/exports)
sed -e '/^import /d' -e 's/^export //' client/js/ui.js > "$W/04_ui.js"
sed -e '/^import /d' -e 's/^export //' client/js/charcreate.js > "$W/05_cc.js"
sed -e '/^import /d' -e 's/^export //' client/js/charselect.js > "$W/05b_select.js"
sed -e '/^import /d' -e 's/^export //' client/js/sound.js > "$W/05c_sound.js"
sed -e '/^import /d' -e 's/^export //' client/js/uikit.js > "$W/05d_uikit.js"

# 5) main : import three en URL directe, suppression des imports locaux et du new Net()
sed -e "s|from 'three'|from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js'|" \
    -e "/^import .* from '\.\//d" \
    -e "/^import .* from '\/shared\//d" \
    -e "/^const net = new Net();$/d" \
    client/js/main.js > "$W/06_main.js"

cat "$W"/0*.js > "$W/bundle.js"
if grep -qn "from '\./\|/shared/data\|/shared/collision" "$W/bundle.js"; then echo "ERREUR: import résiduel"; exit 1; fi
grep -q "class Game" "$W/bundle.js" || { echo "ERREUR: bundle incomplet"; exit 1; }
node --check "$W/bundle.js"

# 6) HTML final
awk '/<body>/{f=1;next} /<script type="module"/{f=0} f' client/index.html > "$W/body.html"
{
  echo '<!DOCTYPE html>'
  echo '<html lang="fr">'
  echo '<head>'
  echo '<meta charset="UTF-8" />'
  echo '<meta name="viewport" content="width=device-width, initial-scale=1.0" />'
  echo '<title>Realms at War — Mode Solo</title>'
  echo '<style>'
  cat client/css/style.css
  echo '</style>'
  echo '</head>'
  echo '<body>'
  cat "$W/body.html"
  echo '<script type="module">'
  cat "$W/bundle.js"
  echo '</script>'
  echo '</body>'
  echo '</html>'
} > solo.html
sed -i 's|Entrée pour parler au royaume...|Entrée : message (mode solo)...|' solo.html
sed -i 's|Trois royaumes. Quarante-quatre classes. Une guerre sans fin.|Trois royaumes. Quarante-quatre classes. Une guerre sans fin. — MODE SOLO|' solo.html
echo "OK -> solo.html ($(wc -c < solo.html) octets)"
