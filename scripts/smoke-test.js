import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { getMap } from '../shared/map.js';

const BOXES = getMap('arena').boxes;
const MAPCHECK = (() => {
  const data = getMap('dust');
  const wall = data.boxes.find(
    (box) => box.max[1] >= 5 && box.min[0] === 14 && box.min[2] <= 8 && box.max[2] >= 8,
  );
  return { x: wall.min[0] - 2, z: 8, dir: 1, max: 1.8 };
})();
import { raycastWorld, traceShot } from '../shared/raycast.js';
import { PLAYER } from '../shared/constants.js';
import { createMoveState, stepPlayer } from '../shared/movement.js';
import { WEAPONS, KNIFE } from '../shared/weapons.js';
import { SKINS } from '../shared/skins.js';

const PORT = 3123;
const srv = spawn('node', ['server/index.js'], {
  env: { ...process.env, PORT: String(PORT), TEST_SPAWNS: '1', WIN_KILLS: '2' },
  stdio: 'ignore',
});
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK  ' : 'FALHA'} ${name} ${extra}`);
  if (!ok) {
    failed++;
  }
};

function client(name) {
  const client = { name, log: [], offset: 0, id: null, sp: 0, pos: null, snap: null };
  client.ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  client.ready = new Promise((result) => client.ws.on('open', result));
  client.ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    if (message.t === 'snap') {
      client.offset = message.time - performance.now();
      client.snap = message;
    } else {
      client.log.push(message);
    }
    if (message.t === 'welcome') {
      client.id = message.id;
    }
    if (message.t === 'respawn') {
      client.sp = message.sp;
      client.pos = message.p;
    }
  });
  client.send = (origin) => client.ws.send(JSON.stringify(origin));
  client.serverNow = () => performance.now() + client.offset;
  client.find = (type) => client.log.filter((message) => message.t === type);
  return client;
}

const aim = (from, target) => {
  const data = [target[0] - from[0], target[1] - from[1], target[2] - from[2]];
  const distance = Math.hypot(...data);
  return data.map((component) => component / distance);
};
const shoot = (client, origin, data, rtOffset = 0) =>
  client.send({ t: 'shoot', o: origin, d: data, rt: client.serverNow() - rtOffset, w: 0 });
const shoot2 = (client, origin, data, weapon) =>
  client.send({ t: 'shoot', o: origin, d: data, rt: client.serverNow(), w: weapon });

{
  const pen = (id) => WEAPONS.find((weapon) => weapon.id === id).wallPen;
  const varou = (origin, data, id, depois) =>
    traceShot(origin, data, 40, BOXES, pen(id)).t > depois;
  const diag = [-Math.SQRT1_2, 0, -Math.SQRT1_2];
  check(
    'AWP, Scout, AK e M4 varam o caixote',
    ['awp', 'scout', 'rifle', 'm4'].every((id) => varou([-12, 1.5, 0], [1, 0, 0], id, 5)),
  );
  check(
    'pistola e MP5 não varam',
    !varou([-12, 1.5, 0], [1, 0, 0], 'pistol', 5) && !varou([-10, 1.5, -10], diag, 'smg', 4),
  );
  check('parede de frente segura até a AWP', !varou([-16, 1.5, -9], [0, 0, -1], 'awp', 5));
  check(
    'AWP e AK varam a quina da parede',
    varou([-10, 1.5, -10], diag, 'awp', 4) && varou([-10, 1.5, -10], diag, 'rifle', 4),
  );
}

try {
  await sleep(600);
  const shooter = client('Atirador');
  const target = client('Alvo');
  await shooter.ready;
  shooter.send({ t: 'join', name: 'Atirador', mode: 'host', bots: 0 });
  await sleep(150);
  const code = shooter.find('welcome')[0]?.room?.code;
  check('host recebe o código da sala', /^[A-Z0-9]{4}$/.test(code || ''), `(${code})`);
  await target.ready;
  target.send({ t: 'join', name: 'Alvo', mode: 'code', code: code.toLowerCase() });
  await sleep(100);
  shooter.send({ t: 'start' });
  await sleep(1900);

  check('welcome + respawn recebidos', shooter.id && target.id && shooter.pos && target.pos);
  check(
    'entrou na sala pelo código',
    target.find('welcome')[0]?.room?.code === code &&
      target.find('welcome')[0]?.room?.host === shooter.id,
  );
  check('snapshots chegando', !!shooter.snap && shooter.snap.players.length === 2);
  check(
    'times diferentes',
    shooter.snap.players.find((player) => player.i === shooter.id).tm !==
      shooter.snap.players.find((player) => player.i === target.id).tm,
  );

  const eyeA = [shooter.pos[0], shooter.pos[1] + PLAYER.eye, shooter.pos[2]];
  const stream = setInterval(() => {
    shooter.send({ t: 'tp', p: shooter.pos, y: 0, pt: 0, c: 0, sp: shooter.sp });
    target.send({ t: 'tp', p: target.pos, y: 0, pt: 0, c: 0, sp: target.sp });
  }, 33);
  await sleep(700);

  const wallDir = aim(eyeA, [0, 1.0, 0]);
  const wallHit = raycastWorld(eyeA, aim(eyeA, [0, 1.0, -26]), 200, BOXES);
  shoot(shooter, eyeA, wallDir);
  await sleep(150);
  check(
    'tiro na parede não causa dano',
    shooter.find('hit').length === 0,
    `(mundo bloqueia em t=${wallHit ? wallHit.t.toFixed(1) : '—'} m)`,
  );

  const start = [...target.pos];
  clearInterval(stream);
  const keep = setInterval(
    () => shooter.send({ t: 'tp', p: shooter.pos, y: 0, pt: 0, c: 0, sp: shooter.sp }),
    33,
  );
  let positionX = start[0];
  for (let index = 0; index < 5; index++) {
    positionX -= 0.28;
    target.send({ t: 'tp', p: [positionX, 0, start[2]], y: 0, pt: 0, c: 0, sp: target.sp });
    await sleep(33);
  }
  const bodyOld = [start[0], 1.0, start[2]];
  shoot(shooter, eyeA, aim(eyeA, bodyOld), 330);
  await sleep(200);
  const firstHit = shooter.find('hit');
  check(
    'com rewind: acerta onde o alvo estava',
    firstHit.length === 1 &&
      firstHit[0].pt === 'body' &&
      firstHit[0].d >= 25 &&
      firstHit[0].d <= 34,
    firstHit[0] ? `(parte=${firstHit[0].pt}, dano=${firstHit[0].d})` : '',
  );
  check('vítima recebeu hurt', target.find('hurt').length === 1);
  shoot(shooter, eyeA, aim(eyeA, bodyOld), 0);
  await sleep(200);
  check('sem rewind: erra o alvo que se moveu', shooter.find('hit').length === 1);
  clearInterval(keep);

  const posB = [positionX, 0, start[2]];
  const keep2 = setInterval(() => {
    shooter.send({ t: 'tp', p: shooter.pos, y: 0, pt: 0, c: 0, sp: shooter.sp });
    target.send({ t: 'tp', p: posB, y: 0, pt: 0, c: 0, sp: target.sp });
  }, 33);
  await sleep(500);
  shoot(shooter, eyeA, aim(eyeA, [posB[0], PLAYER.height - 0.15, posB[2]]), 0);
  await sleep(200);
  const lastHit = shooter.find('hit').pop();
  check(
    'headshot detectado',
    lastHit && lastHit.pt === 'head' && lastHit.kill === true,
    lastHit ? `(dano=${lastHit.d})` : '',
  );
  check(
    'evento de kill transmitido',
    target.find('kill').length === 1 && target.find('kill')[0].h === true,
  );
  const teamA = shooter.snap.players.find((player) => player.i === shooter.id).tm;
  check(
    'placar do time soma o abate',
    shooter.snap.sc?.[teamA] === 1 && shooter.snap.sc?.[1 - teamA] === 0,
    JSON.stringify(shooter.snap.sc),
  );
  clearInterval(keep2);

  target.send({ t: 'loadout', lo: { primary: 'awp', secondary: 'deagle', melee: 'nao-existe' } });
  await sleep(5300);
  const respawns = target.find('respawn');
  check('vítima renasce', respawns.length >= 2);
  const slots = respawns[respawns.length - 1]?.sl || [];
  check(
    'renasce com a arma escolhida',
    WEAPONS[slots[0]]?.id === 'awp' &&
      WEAPONS[slots[1]]?.id === 'deagle' &&
      WEAPONS[slots[2]]?.id === 'knife',
  );

  shooter.send({ t: 'switch', w: KNIFE });
  await sleep(600);
  const before = shooter.find('hit').length;
  shoot2(shooter, eyeA, aim(eyeA, [target.pos[0], 1.0, target.pos[2]]), KNIFE);
  await sleep(200);
  check('faca não acerta de longe', shooter.find('hit').length === before);

  shooter.send({ t: 'chat', m: 'oi ' + 'x'.repeat(200) });
  shooter.send({ t: 'chat', m: 'flood' });
  await sleep(200);
  const messages = target.find('chat');
  check(
    'chat chega no outro jogador',
    messages.length === 1 && messages[0].n === 'Atirador' && messages[0].m.startsWith('oi '),
  );
  check('chat corta em 120 caracteres e barra flood', messages[0]?.m.length === 120);

  shooter.send({ t: 'switch', w: 0 });
  await sleep(700);
  shooter.send({ t: 'reload' });
  await sleep(150);
  check(
    'outros veem que está recarregando',
    target.snap.players.find((player) => player.i === shooter.id)?.rl === 1,
  );

  const lostClient = client('Perdido');
  await lostClient.ready;
  lostClient.send({ t: 'join', name: 'Perdido', mode: 'code', code: 'ZZZZ' });
  await sleep(150);
  check('código errado dá erro', lostClient.find('error').length === 1);
  const soloClient = client('Solo');
  await soloClient.ready;
  soloClient.send({ t: 'join', name: 'Solo', mode: 'quick', bots: 3, skill: 'hard' });
  await sleep(300);
  const welcome = soloClient.find('welcome')[0];
  check(
    'quick play cria sala solo com bots',
    welcome?.room?.solo === true &&
      welcome.room.code === null &&
      soloClient.snap?.players.filter((player) => player.b).length === 3,
  );
  const botStart = soloClient.snap.players.filter((player) => player.b).map((player) => player.p);
  await sleep(3000);
  const botNow = soloClient.snap.players.filter((player) => player.b).map((player) => player.p);
  check(
    'bots se mexem',
    botNow.some(
      (botNow, index) =>
        Math.hypot(botNow[0] - botStart[index][0], botNow[2] - botStart[index][2]) > 0.5,
    ),
  );

  target.send({ t: 'bot', op: 'add' });
  shooter.send({ t: 'bot', op: 'add' });
  shooter.send({ t: 'bot', op: 'add' });
  await sleep(200);
  check('só o host adiciona bots', shooter.snap.players.filter((player) => player.b).length === 2);
  shooter.send({ t: 'bot', op: 'remove' });
  await sleep(200);
  check('host remove bot', shooter.snap.players.filter((player) => player.b).length === 1);
  shooter.ws.close();
  await sleep(300);
  check('host saiu: sala fecha para todos', target.find('closed').length === 1);
  soloClient.ws.close();
  lostClient.ws.close();

  const sniper = client('Sniper');
  await sniper.ready;
  sniper.send({
    t: 'join',
    name: 'Sniper',
    mode: 'host',
    bots: 0,
    lo: { primary: 'awp' },
    skins: { awp: 'neon', rifle: 'nao-existe' },
  });
  await sleep(150);
  const code2 = sniper.find('welcome')[0]?.room?.code;
  const others = [client('V1'), client('T2'), client('V2')];
  for (const client of others) {
    await client.ready;
    client.send({ t: 'join', name: client.name, mode: 'code', code: code2 });
    await sleep(80);
  }
  sniper.send({ t: 'start' });
  await sleep(2400);
  const [firstVictim, , secondVictim] = others;
  const hSnap = firstVictim.snap.players.find((player) => player.i === sniper.id);
  check(
    'skin da arma chega para os outros',
    hSnap?.sk === SKINS.findIndex((positionX) => positionX.id === 'neon'),
    `(sk=${hSnap?.sk})`,
  );
  const eyeH = [sniper.pos[0], sniper.pos[1] + PLAYER.eye, sniper.pos[2]];
  shoot2(
    sniper,
    eyeH,
    aim(eyeH, [firstVictim.pos[0], 1.0, firstVictim.pos[2]]),
    WEAPONS.findIndex((weapon) => weapon.id === 'awp'),
  );
  await sleep(250);
  const hits = sniper.find('hit');
  check(
    'AWP atravessa: acerta 2 alinhados',
    hits.length === 2 && hits[0].v !== hits[1].v && hits[1].d < hits[0].d,
    hits.map((hit) => `${hit.d}`).join(' + '),
  );
  check(
    'dano chega nos dois',
    firstVictim.find('hurt').length === 1 && secondVictim.find('hurt').length === 1,
  );
  const shotSeen = others[1].find('shot').pop();
  check(
    'tiro avisa quem foi atingido (sangue)',
    shotSeen?.hv?.length === 2 && shotSeen.hv.some((hit) => hit[0] === firstVictim.id),
  );
  check('morte de um tiro com vida cheia = jorro', secondVictim.find('kill')[0]?.g === 1);

  await sleep(1600);
  shoot2(
    sniper,
    eyeH,
    aim(eyeH, [secondVictim.pos[0], 1.0, secondVictim.pos[2]]),
    WEAPONS.findIndex((weapon) => weapon.id === 'awp'),
  );
  await sleep(250);
  const win = secondVictim.find('win')[0];
  check(
    'time chega no alvo e vence',
    win && win.score[win.team] === 2,
    win ? JSON.stringify(win) : '',
  );
  check('snapshot avisa fim de partida', sniper.snap.win === win?.team && sniper.snap.ne > 0);
  [sniper, ...others].forEach((client) => client.ws.close());

  const mapClient = client('Mapa');
  await mapClient.ready;
  mapClient.send({ t: 'join', name: 'Mapa', mode: 'host', bots: 1, map: 'dust' });
  await sleep(200);
  mapClient.send({ t: 'start' });
  await sleep(100);
  check('sala criada no mapa escolhido', mapClient.find('welcome')[0]?.room?.map === 'dust');
  mapClient.send({ t: 'map', map: 'warehouse' });
  await sleep(200);
  const room = mapClient.find('room').pop();
  check(
    'host troca o mapa (partida nova)',
    room?.map === 'warehouse' && mapClient.find('respawn').length >= 2,
  );
  mapClient.ws.close();

  const moverClient = client('Mover');
  await moverClient.ready;
  moverClient.send({ t: 'join', name: 'Mover', mode: 'quick', bots: 0 });
  await sleep(300);
  const myPos = () => moverClient.snap?.players.find((player) => player.i === moverClient.id)?.p;
  const start0 = myPos();
  moverClient.send({ t: 'state', p: [20, 0, 20], y: 0, pt: 0, c: 0, sp: moverClient.sp });
  await sleep(200);
  check(
    'teleporte (posição dita pelo cliente) é ignorado',
    Math.hypot(myPos()[0] - start0[0], myPos()[2] - start0[2]) < 0.01,
  );

  let seq = 0;
  const command = (flags) => [++seq, flags, 0, 0, 0, 0, 0, 0, 0, 0];
  const cmds = Array.from({ length: 30 }, () => command(1));
  moverClient.send({ t: 'in', sp: moverClient.sp, c: cmds });
  await sleep(250);
  const ack = moverClient.find('ack').pop();
  const local = createMoveState(start0[0], start0[1], start0[2]);
  for (let index = 0; index < 30; index++) {
    stepPlayer(
      local,
      {
        fwd: 1,
        right: 0,
        jump: false,
        jumpPress: false,
        walk: false,
        crouch: false,
        yaw: 0,
        speedMult: WEAPONS[0].moveMult,
      },
      1 / 60,
      BOXES,
    );
  }
  const moved = Math.hypot(ack.ms[0] - start0[0], ack.ms[2] - start0[2]);
  check(
    'comandos movem o jogador (servidor simula)',
    ack.s === 30 && moved > 0.5 && moved < 3.2,
    `(${moved.toFixed(2)} m)`,
  );
  check(
    'previsão do cliente bate com o servidor',
    Math.hypot(ack.ms[0] - local.x, ack.ms[2] - local.z) < 0.001,
  );

  await sleep(600);
  const before2 = moverClient.find('ack').pop().ms;
  for (let index = 0; index < 3; index++) {
    moverClient.send({
      t: 'in',
      sp: moverClient.sp,
      c: Array.from({ length: 30 }, () => command(1)),
    });
  }
  await sleep(200);
  const after2 = moverClient.find('ack').pop();
  const hacked = Math.hypot(after2.ms[0] - before2[0], after2.ms[2] - before2[2]);
  check(
    'speedhack (comandos demais) é limitado',
    hacked > 0.3 && hacked < 4 && after2.s < seq && after2 !== moverClient.find('ack')[0],
    `(andou ${hacked.toFixed(2)} m com 90 comandos; aceitou até o ${after2.s - (seq - 90)}º)`,
  );
  moverClient.ws.close();

  const revolverClient = client('Revolver');
  await revolverClient.ready;
  revolverClient.send({
    t: 'join',
    name: 'Revolver',
    mode: 'host',
    bots: 0,
    lo: { primary: 'rifle', secondary: 'r8' },
  });
  await sleep(150);
  const codeR = revolverClient.find('welcome')[0]?.room?.code;
  const revolverTarget = client('AlvoR8');
  await revolverTarget.ready;
  revolverTarget.send({ t: 'join', name: 'AlvoR8', mode: 'code', code: codeR });
  await sleep(100);
  revolverClient.send({ t: 'start' });
  await sleep(1700);
  const revolverIndex = WEAPONS.findIndex((weapon) => weapon.id === 'r8');
  revolverClient.send({ t: 'switch', w: revolverIndex });
  await sleep(700);
  const eyeR = [revolverClient.pos[0], revolverClient.pos[1] + PLAYER.eye, revolverClient.pos[2]];
  const atR = aim(eyeR, [revolverTarget.pos[0], 1.0, revolverTarget.pos[2]]);
  const fan = () =>
    revolverClient.send({
      t: 'shoot',
      o: eyeR,
      d: atR,
      rt: revolverClient.serverNow(),
      w: revolverIndex,
      fn: 1,
    });
  fan();
  fan();
  await sleep(150);
  const h1r = revolverClient.find('hit').length;
  await sleep(150);
  fan();
  await sleep(150);
  check(
    'R8: fan aceita 1 tiro a cada 0,25 s',
    h1r === 1 && revolverClient.find('hit').length === 2,
    `(dano ${revolverClient
      .find('hit')
      .map((hit) => hit.d)
      .join(' + ')})`,
  );
  [revolverClient, revolverTarget].forEach((client) => client.ws.close());

  const sideClient = client('Lado');
  await sideClient.ready;
  sideClient.send({
    t: 'join',
    name: 'Lado',
    mode: 'quick',
    bots: 8,
    team: 1,
    lo: { primary: 'rifle', secondary: 'glock', melee: 'knife' },
  });
  await sleep(400);
  const slCt = sideClient.find('respawn')[0]?.sl || [];
  check('escolheu CT e entrou no CT', sideClient.find('welcome')[0]?.team === 1);
  check(
    'CT pedindo AK + Glock nasce com M4A1-S + USP-S',
    WEAPONS[slCt[0]]?.id === 'm4' && WEAPONS[slCt[1]]?.id === 'usp',
    `(${slCt.map((index) => WEAPONS[index]?.name).join(', ')})`,
  );
  const wrong = sideClient.snap.players.filter(
    (player) =>
      player.b &&
      WEAPONS[player.w]?.team &&
      WEAPONS[player.w].team !== (player.tm === 0 ? 'T' : 'CT'),
  );
  check(
    'bots só usam armas do próprio time',
    sideClient.snap.players.filter((player) => player.b).length === 8 && wrong.length === 0,
  );
  sideClient.ws.close();

  const negevClient = client('Negev');
  await negevClient.ready;
  negevClient.send({ t: 'join', name: 'Negev', mode: 'host', bots: 0, lo: { primary: 'negev' } });
  await sleep(150);
  const codeN = negevClient.find('welcome')[0]?.room?.code;
  const negevTarget = client('AlvoNegev');
  await negevTarget.ready;
  negevTarget.send({ t: 'join', name: 'AlvoNegev', mode: 'code', code: codeN });
  await sleep(100);
  negevClient.send({ t: 'start' });
  await sleep(2200);
  const negevIndex = WEAPONS.findIndex((weapon) => weapon.id === 'negev');
  const eyeN = [negevClient.pos[0], negevClient.pos[1] + PLAYER.eye, negevClient.pos[2]];
  const atN = aim(eyeN, [negevTarget.pos[0], 1.0, negevTarget.pos[2]]);
  negevClient.send({ t: 'shoot', o: eyeN, d: atN, rt: negevClient.serverNow(), w: negevIndex });
  await sleep(150);
  const coldHits = negevClient.find('hit').length;
  negevClient.send({ t: 'spin', on: 1 });
  await sleep(200);
  negevClient.send({ t: 'shoot', o: eyeN, d: atN, rt: negevClient.serverNow(), w: negevIndex });
  await sleep(450);
  const midHits = negevClient.find('hit').length;
  negevClient.send({ t: 'shoot', o: eyeN, d: atN, rt: negevClient.serverNow(), w: negevIndex });
  await sleep(150);
  check(
    'Negev: precisa aquecer 0,5 s antes de atirar',
    coldHits === 0 && midHits === 0 && negevClient.find('hit').length === 1,
  );
  [negevClient, negevTarget].forEach((client) => client.ws.close());

  const doorClient = client('Porta');
  await doorClient.ready;
  doorClient.send({ t: 'join', name: 'Porta', mode: 'quick', bots: 0, map: 'dust' });
  await sleep(1700);
  check(
    'sala no Dunes avisa as portas',
    doorClient.find('welcome')[0]?.room?.map === 'dust' &&
      Array.isArray(doorClient.find('welcome')[0]?.room?.doors),
  );
  doorClient.send({ t: 'tp', p: [-1.1, 0.5, 17], y: 0 });
  await sleep(150);
  const eyeD = [-1.1, 0.5 + PLAYER.eye, 17];
  const atDoor = aim(eyeD, [-1.1, 1.6, 12.5]);
  for (let index = 0; index < 9; index++) {
    doorClient.send({ t: 'shoot', o: eyeD, d: atDoor, rt: doorClient.serverNow(), w: 0 });
    await sleep(110);
  }
  await sleep(150);
  const broke = doorClient.find('door');
  check(
    'porta do Mid quebra com tiros (AK)',
    broke.length === 1 && broke[0].id === 0,
    `(${broke.length} porta)`,
  );
  doorClient.ws.close();

  const wallClient = client('Parede');
  await wallClient.ready;
  wallClient.send({ t: 'join', name: 'Parede', mode: 'quick', bots: 0, map: 'dust' });
  await sleep(1700);
  wallClient.send({ t: 'tp', p: [MAPCHECK.x, 0, MAPCHECK.z], y: 0 });
  await sleep(100);
  let wseq = 100000;
  wallClient.send({
    t: 'in',
    sp: wallClient.sp,
    c: Array.from({ length: 30 }, () => [++wseq, 0, MAPCHECK.dir, 0, 0, 0, 0, 0, 0, 0]),
  });
  await sleep(250);
  const acknowledgement = wallClient.find('ack').pop();
  check(
    'física do servidor usa o mapa da sala (parede do Dunes segura)',
    acknowledgement && Math.abs(acknowledgement.ms[0] - MAPCHECK.x) < MAPCHECK.max,
    acknowledgement
      ? `(andou ${Math.abs(acknowledgement.ms[0] - MAPCHECK.x).toFixed(2)} m até a parede)`
      : '',
  );
  wallClient.ws.close();

  const firstGunGameClient = client('GG1');
  await firstGunGameClient.ready;
  firstGunGameClient.send({
    t: 'join',
    name: 'GG1',
    mode: 'host',
    bots: 0,
    game: 'gungame',
    map: 'arena',
  });
  await sleep(150);
  const codeG = firstGunGameClient.find('welcome')[0]?.room?.code;
  const secondGunGameClient = client('GG2');
  await secondGunGameClient.ready;
  secondGunGameClient.send({ t: 'join', name: 'GG2', mode: 'code', code: codeG });
  await sleep(300);
  const sl1 = firstGunGameClient.find('respawn').pop()?.sl || [];
  check(
    'Gun Game: começa com AWP',
    WEAPONS[sl1[0]]?.id === 'awp' &&
      firstGunGameClient.find('welcome')[0]?.room?.game === 'gungame',
  );
  const awp = WEAPONS.findIndex((weapon) => weapon.id === 'awp');
  for (let index = 0; index < 5; index++) {
    await sleep(2300);
    firstGunGameClient.send({ t: 'tp', p: [-20, 0, 4], y: 0 });
    secondGunGameClient.send({ t: 'tp', p: [-20, 0, -2], y: 0 });
    await sleep(1600);
    const firstEye = [-20, PLAYER.eye, 4];
    firstGunGameClient.send({
      t: 'shoot',
      o: firstEye,
      d: aim(firstEye, [-20, 1.1, -2]),
      rt: firstGunGameClient.serverNow(),
      w: awp,
    });
    await sleep(150);
  }
  await sleep(200);
  const promotion = firstGunGameClient.find('gg').find((message) => message.up);
  check(
    'Gun Game: 5 abates = próxima arma (AK-47)',
    promotion && WEAPONS[promotion.sl[0]]?.id === 'rifle',
    `(${firstGunGameClient.find('kill').filter((index) => index.k === firstGunGameClient.id).length} abates)`,
  );
  await sleep(2300);
  firstGunGameClient.send({ t: 'tp', p: [-20, 0, 4], y: 0 });
  secondGunGameClient.send({ t: 'tp', p: [-20, 0, 5.2], y: 0 });
  const knifeI = WEAPONS.findIndex((weapon) => weapon.id === 'knife');
  secondGunGameClient.send({ t: 'switch', w: knifeI });
  await sleep(1600);
  for (
    let index = 0;
    index < 6 && !firstGunGameClient.find('gg').some((message) => message.dn);
    index++
  ) {
    const secondEye = [-20, PLAYER.eye, 5.2];
    secondGunGameClient.send({
      t: 'shoot',
      o: secondEye,
      d: aim(secondEye, [-20, 1.1, 4]),
      rt: secondGunGameClient.serverNow(),
      w: knifeI,
    });
    await sleep(550);
  }
  const demotion = firstGunGameClient.find('gg').find((message) => message.dn);
  check(
    'Gun Game: morrer de faca tira um ponto (volta de nível)',
    demotion && demotion.gl === 0 && demotion.gk === 4,
    demotion ? `(nível ${demotion.gl + 1}, ${demotion.gk} abates)` : '',
  );
  [firstGunGameClient, secondGunGameClient].forEach((client) => client.ws.close());

  const heI = WEAPONS.findIndex((weapon) => weapon.id === 'he');
  const smI = WEAPONS.findIndex((weapon) => weapon.id === 'smoke');
  const grenadierClient = client('Granadeiro');
  await grenadierClient.ready;
  grenadierClient.send({
    t: 'join',
    name: 'Granadeiro',
    mode: 'host',
    bots: 0,
    map: 'arena',
    team: 0,
    lo: { grenade: 'he' },
  });
  await sleep(200);
  const targetClient = client('Alvo');
  await targetClient.ready;
  targetClient.send({
    t: 'join',
    name: 'Alvo',
    mode: 'code',
    code: grenadierClient.find('welcome')[0]?.room?.code,
    team: 1,
    lo: { grenade: 'smoke' },
  });
  await sleep(100);
  grenadierClient.send({ t: 'start' });
  await sleep(2200);
  check(
    'granada no slot 4 (HE para o TR, fumaça para o CT)',
    grenadierClient.find('respawn').pop()?.sl?.[3] === heI &&
      targetClient.find('respawn').pop()?.sl?.[3] === smI,
  );
  grenadierClient.send({ t: 'tp', p: [-14, 0, 6], y: 0 });
  targetClient.send({ t: 'tp', p: [-14, 0, 2], y: 0 });
  grenadierClient.send({ t: 'switch', w: heI });
  await sleep(600);
  const grenadierEye = [-14, PLAYER.eye, 6];
  grenadierClient.send({
    t: 'nade',
    w: heI,
    o: grenadierEye,
    d: aim(grenadierEye, [-14, 0, 3]),
    lob: 1,
  });
  await sleep(100);
  grenadierClient.send({
    t: 'nade',
    w: heI,
    o: grenadierEye,
    d: aim(grenadierEye, [-14, 0, 3]),
    lob: 1,
  });
  await sleep(1900);
  const heMsg = targetClient.find('he')[0];
  const hurtB = targetClient.find('hurt').pop();
  check(
    'HE: explode e machuca quem está perto',
    !!heMsg && hurtB?.d > 20,
    heMsg ? `(dano ${hurtB?.d} a ${Math.hypot(heMsg.p[0] + 14, heMsg.p[2] - 2).toFixed(1)} m)` : '',
  );
  check('HE: só uma granada por vida', grenadierClient.find('nade').length === 1);
  targetClient.send({ t: 'switch', w: smI });
  await sleep(600);
  const targetEye = [-14, PLAYER.eye, 2];
  targetClient.send({ t: 'nade', w: smI, o: targetEye, d: [0, 0.2, -0.98] });
  await sleep(3000);
  check(
    'fumaça: solta a nuvem',
    !!grenadierClient.find('smoke')[0],
    grenadierClient.find('smoke')[0] ? `(em ${grenadierClient.find('smoke')[0].p.join(', ')})` : '',
  );
  [grenadierClient, targetClient].forEach((client) => client.ws.close());

  const C4i = WEAPONS.findIndex((weapon) => weapon.id === 'c4');
  const Ctr = client('Terro');
  await Ctr.ready;
  Ctr.send({
    t: 'join',
    name: 'Terro',
    mode: 'host',
    bots: 0,
    game: 'comp',
    map: 'arena',
    team: 0,
  });
  await sleep(200);
  const Cct = client('Contra');
  await Cct.ready;
  Cct.send({
    t: 'join',
    name: 'Contra',
    mode: 'code',
    code: Ctr.find('welcome')[0]?.room?.code,
    team: 1,
  });
  await sleep(400);
  check(
    'Competitivo: sala com código começa na sala de espera',
    Ctr.find('welcome')[0]?.room?.lobby === true && !Ctr.snap?.cp,
  );
  Ctr.send({ t: 'start' });
  await sleep(400);
  check(
    'Competitivo: sala no Dunes (mapa com bombsites)',
    Ctr.find('welcome')[0]?.room?.game === 'comp' &&
      Ctr.find('welcome')[0]?.room?.map === 'dust' &&
      Ctr.snap?.cp?.ph === 'freeze',
  );
  check(
    'Competitivo: a bomba vai para o TR (tecla 5)',
    Ctr.find('bomb').pop()?.sl?.[4] === C4i && !Cct.find('bomb').length,
  );
  const terroristEye = [Ctr.pos[0], Ctr.pos[1] + PLAYER.eye, Ctr.pos[2]];
  Ctr.send({
    t: 'shoot',
    o: terroristEye,
    d: [0, 0, -1],
    rt: Ctr.serverNow(),
    w: Ctr.find('respawn').pop().sl[0],
  });
  await sleep(250);
  check('Competitivo: ninguém atira no freeze time', !Cct.find('shot').length);
  await sleep(5000);
  Ctr.send({ t: 'switch', w: C4i });
  Ctr.send({ t: 'tp', p: [-34, 2, -12], y: 0 });
  await sleep(150);
  Ctr.send({ t: 'plant', on: 1 });
  await sleep(3500);
  const planted = Cct.find('planted')[0];
  check(
    'Competitivo: TR planta no A (3,2 s segurando)',
    planted && planted.s === 'A' && Ctr.snap?.cp?.b === 'planted',
    planted ? `(bomba em ${planted.p.join(', ')})` : '',
  );
  Cct.send({ t: 'tp', p: [-34, 2, -11], y: 0 });
  await sleep(150);
  Cct.send({ t: 'defuse', on: 1 });
  await sleep(10300);
  const roundEnd = Ctr.find('rend')[0];
  check(
    'Competitivo: CT desarma em 10 s e ganha o round',
    !!Cct.find('defused').length &&
      roundEnd?.w === 1 &&
      roundEnd.why === 'defuse' &&
      roundEnd.sc[1] === 1,
    roundEnd ? `(${roundEnd.why}, ${roundEnd.sc.join('–')})` : '',
  );
  await sleep(5300);
  check(
    'Competitivo: round 2 começa com todo mundo vivo',
    Ctr.find('round').some((message) => message.r === 2) &&
      Ctr.snap?.players.every((player) => player.a),
  );
  Ctr.send({ t: 'drop' });
  await sleep(200);
  const bombDrop = Cct.find('bdrop')[0];
  check(
    'Competitivo: TR larga a bomba (cai no chão, sem sair do mapa)',
    bombDrop &&
      Math.abs(bombDrop.p[0]) < 48 &&
      Math.abs(bombDrop.p[2]) < 54 &&
      Ctr.find('bomb').pop()?.sl?.length === 4,
    bombDrop ? `(em ${bombDrop.p.join(', ')})` : '',
  );
  [Ctr, Cct].forEach((client) => client.ws.close());

  const shotgunClient = client('Doze');
  await shotgunClient.ready;
  shotgunClient.send({
    t: 'join',
    name: 'Doze',
    mode: 'host',
    bots: 0,
    lo: { primary: 'shotgun' },
  });
  await sleep(150);
  const code3 = shotgunClient.find('welcome')[0]?.room?.code;
  const shotgunTarget = client('Alvo12');
  await shotgunTarget.ready;
  shotgunTarget.send({ t: 'join', name: 'Alvo12', mode: 'code', code: code3 });
  await sleep(100);
  shotgunClient.send({ t: 'start' });
  await sleep(2200);
  const shotgunIndex = WEAPONS.findIndex((weapon) => weapon.id === 'shotgun');
  const eyeG = [shotgunClient.pos[0], shotgunClient.pos[1] + PLAYER.eye, shotgunClient.pos[2]];
  shotgunClient.send({
    t: 'shoot',
    o: eyeG,
    d: aim(eyeG, [shotgunTarget.pos[0], 1.1, shotgunTarget.pos[2]]),
    rt: shotgunClient.serverNow(),
    w: shotgunIndex,
    sd: 12345,
  });
  await sleep(250);
  const shotgunHits = shotgunClient.find('hit');
  check(
    'espingarda: bagos somam num acerto só',
    shotgunHits.length === 1 && shotgunHits[0].d > 22,
    shotgunHits[0] ? `(dano=${shotgunHits[0].d} a 8 m)` : '',
  );
  check(
    'espingarda: um buraco por bago',
    shotgunHits[0]?.pts?.length > 1 && shotgunHits[0].pts.length <= 9,
    `(${shotgunHits[0]?.pts?.length} bagos)`,
  );
  [shotgunClient, shotgunTarget].forEach((client) => client.ws.close());
} catch (error) {
  console.error(error);
  failed++;
} finally {
  srv.kill();
  console.log(failed ? `\n${failed} teste(s) falharam` : '\nTudo certo');
  process.exit(failed ? 1 : 0);
}
