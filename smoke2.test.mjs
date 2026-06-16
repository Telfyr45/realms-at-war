import { WebSocket } from 'ws';
function client(name, onState, onEvent) {
  const ws = new WebSocket('ws://localhost:8080');
  let n = 0;
  ws.on('open', () => ws.send(JSON.stringify({type:'create', name, realm:'mid', race:'Troll', cls:'shaman'})));
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.type==='event' && onEvent) onEvent(m, ws);
    if (m.type==='state') { n++; onState && onState(m, ws, n); }
  });
  return ws;
}
let lockSeen = false, movedPos = null;
const ws1 = client('Saga',
  (m, ws, n) => {
    if (n===2) {
      ws.send(JSON.stringify({type:'skill', slot:4}));           // verrou niv. 20 ?
      ws.send(JSON.stringify({type:'move', x:0, z:-905, ry:0})); // vise l'intérieur du donjon de Jordheim (cercle r=13 autour de ~(0,-900))
    }
    if (n===6) { movedPos = null; ws.send(JSON.stringify({type:'move', x:1, z:-902, ry:0})); }
    if (n===8) {
      // demande l'état : la position est renvoyée seulement via les entités des autres
      console.log('hp:', m.me.hp+'/'+m.me.maxHp, 'lvl:', m.me.lvl);
      ws.close();
      setTimeout(() => {
        const ws2 = client('Saga', (m2, w2, n2) => { if (n2===3) { console.log('TEST TERMINE'); process.exit(0); } },
          (m2) => { if (/Bon retour/.test(m2.text)) console.log('RESTAURATION OK:', m2.text); });
      }, 800);
    }
  },
  (m) => { if (/niveau 20/.test(m.text)) { lockSeen = true; console.log('VERROU OK:', m.text); } }
);
setTimeout(()=>{ console.error('timeout'); process.exit(1); }, 20000);
