// REALMS AT WAR — point d'entrée serveur
import express from 'express';
import http from 'http';
import fs from 'fs';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { Game } from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;

// Persistance des personnages dans server/save.json
const SAVE_FILE = path.join(__dirname, 'save.json');
const storage = {
  load() {
    try { return JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8')); } catch { return {}; }
  },
  save(data) {
    fs.writeFileSync(SAVE_FILE, JSON.stringify(data, null, 1));
  },
};

const app = express();
app.use(express.static(path.join(__dirname, '..', 'client')));
app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const game = new Game(storage);

// sauvegarde propre à l'arrêt du serveur
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    for (const s of game.sessions) if (s.player) game.persistPlayer(s.player);
    game.flushSaves();
    process.exit(0);
  });
}

wss.on('connection', (ws) => {
  const session = game.addConnection(ws);
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    try { game.handleMessage(session, msg); } catch (e) { console.error('msg error', e); }
  });
  ws.on('close', () => game.removeConnection(session));
});

game.start();
server.listen(PORT, () => {
  console.log(`⚔️  Realms at War — serveur lancé sur http://localhost:${PORT}`);
});
