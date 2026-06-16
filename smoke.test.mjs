import { WebSocket } from 'ws';
const ws = new WebSocket('ws://localhost:8080');
let states = 0, self = null, fail = (m)=>{console.error('FAIL:', m); process.exit(1);};
ws.on('open', () => ws.send(JSON.stringify({type:'create', name:'Testeur', realm:'mid', race:'Troll', cls:'shaman'})));
ws.on('message', (raw) => {
  const m = JSON.parse(raw);
  if (m.type==='welcome') console.log('welcome ok, selfId:', m.selfId);
  if (m.type==='self') { self = m.self; }
  if (m.type==='state') {
    states++;
    if (states===3) {
      console.log('entités visibles:', m.e.length, '| hp:', m.me.hp+'/'+m.me.maxHp, '| fort:', JSON.stringify(m.fort));
      const mob = m.e.find(a=>a[1]==='mob');
      const npc = m.e.find(a=>a[1]==='npc');
      console.log('mob proche:', mob ? mob[2] : 'aucun', '| npc:', npc ? npc[2]+'/'+npc[11] : 'aucun');
      // interagit avec un npc, cible un mob, lance le skill 0 (heal) et skill 2 (smite) hors portée
      if (npc) ws.send(JSON.stringify({type:'interact', id:npc[0]}));
      ws.send(JSON.stringify({type:'skill', slot:0}));
      if (mob) { ws.send(JSON.stringify({type:'target', id:mob[0]})); ws.send(JSON.stringify({type:'attack', on:true})); }
    }
    if (states===25) {
      console.log('après 25 états — hp:', m.me.hp, 'power:', m.me.power, 'or:', m.me.gold, 'lvl:', m.me.lvl);
      console.log('SMOKE TEST OK');
      process.exit(0);
    }
  }
  if (m.type==='event') console.log('event:', m.text.slice(0,80));
});
ws.on('error', (e)=>fail(e.message));
setTimeout(()=>fail('timeout'), 20000);
