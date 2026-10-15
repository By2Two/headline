import {
  initMilsim,
  setupMilRoom,
  milJoin,
  milAddBot,
  milMessage,
  milTick,
} from '../server/milsim/index.js';
import { MIL, SQUADS, SQUAD_SIZE } from '../shared/milsim/config.js';
import { SECTORS, heightAt } from '../shared/milsim/terrain.js';

const CAP = SQUADS.length * SQUAD_SIZE * 2;
const botCount = Math.min(CAP, Number(process.argv[2] || CAP));
const HUM = Number(process.argv[3] || 6);
const SECS = Number(process.argv[4] || 90);
const MODE = process.argv[5] || 'normal';
const TICK = 1000 / 30;

MIL.maxPlayers = Math.max(MIL.maxPlayers, botCount);
MIL.maxBots = Math.max(MIL.maxBots, botCount);
let nextId = 100;
let clock = 1000;
const bytes = new Map();
const byType = {};
const count = (player, text) => {
  bytes.set(player.id, (bytes.get(player.id) || 0) + text.length);
  const type = text.slice(6, text.indexOf('"', 6));
  byType[type] = (byType[type] || 0) + text.length;
};
initMilsim({
  send: () => {},
  broadcast: () => {},
  now: () => clock,
  nextId: () => nextId++,
  roomInfo: () => ({}),
  log: () => {},
  sendRaw: count,
});
const room = {
  code: 'STRESS',
  players: new Map(),
  skill: 'normal',
  botN: 0,
  winner: -1,
  milMap: process.env.MIL_MAP || 'kestrel',
};
setupMilRoom(room, { map: room.milMap });
const humans = [];
for (let index = 0; index < HUM; index++) {
  const player = {
    id: nextId++,
    name: `H${index}`,
    ws: { readyState: 1, bufferedAmount: 0 },
    isBot: false,
  };
  milJoin(room, player, { t: 'join', name: player.name, team: index % 2 });
  humans.push(player);
}
let botAdded = true;
while (room.players.size < botCount && botAdded) {
  botAdded = milAddBot(room);
}
for (const player of humans) {
  milMessage(room, player, { t: 'deploy', sp: 'main' }, clock);
}
room.mil.prepUntil = 0;

const tick = () => {
  clock += TICK;
  const now = performance.now();
  milTick(room, clock);
  return performance.now() - now;
};
for (let step = 0; step < 300; step++) {
  tick();
}
if (MODE === 'battle') {
  const sector = SECTORS.find((sector) => sector.id === 'B') || SECTORS[0];
  for (const player of room.players.values()) {
    if (!player.alive || player.veh) {
      continue;
    }
    const positionX = sector.x + (player.team ? 60 : -60) + (Math.random() - 0.5) * 50;
    const positionZ = sector.z + (Math.random() - 0.5) * 80;
    const positionY = heightAt(positionX, positionZ);
    player.pos = [positionX, positionY, positionZ];
    Object.assign(player.ms, { x: positionX, y: positionY, z: positionZ, vx: 0, vy: 0, vz: 0 });
  }
}
bytes.clear();
for (const step in byType) {
  delete byType[step];
}
const times = [];
const secMax = {};
let lastWin = null;
for (let step = 0; step < SECS * 30; step++) {
  times.push(tick());
  const window = room.mil.perf?.win;
  if (window && window !== lastWin) {
    lastWin = window;
    for (const [name, value] of Object.entries(window.sec)) {
      const entry = (secMax[name] ||= [0, 0]);
      entry[0] += value[0];
      entry[1]++;
    }
  }
}
times.sort((left, right) => left - right);
const avg = times.reduce((accumulator, time) => accumulator + time, 0) / times.length;
const per = [...bytes.values()].map((bytes) => bytes / SECS / 1024);
const kbps = per.reduce((accumulator, per) => accumulator + per, 0) / Math.max(1, per.length);
const alive = [...room.players.values()].filter((player) => player.alive).length;
console.log(
  `MILSIM stress · ${MODE} · ${room.players.size} players (${HUM} simulated clients) · ${room.mil.vehicles.size} vehicles · ${room.mil.world.structs.size} structures · ${alive} alive`,
);
console.log(
  `tick: avg ${avg.toFixed(2)} ms · p50 ${times[times.length >> 1].toFixed(2)} · p99 ${times[Math.floor(times.length * 0.99)].toFixed(2)} · max ${times.at(-1).toFixed(1)} (budget ${TICK.toFixed(1)} ms; isolated spikes can be the OS)`,
);
console.log(
  `per tick: ${Object.entries(secMax)
    .map(([step, value]) => `${step} ${(value[0] / value[1]).toFixed(2)}`)
    .join(' · ')} ms`,
);
console.log(
  `download per client: avg ${kbps.toFixed(1)} KB/s · max ${Math.max(...per).toFixed(1)} KB/s`,
);
console.log(
  `by message: ${Object.entries(byType)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([step, value]) => `${step} ${(value / SECS / 1024 / HUM).toFixed(1)}`)
    .join(' · ')} KB/s`,
);
const ok = avg < TICK / 3 && kbps < 120;
console.log(ok ? 'OK' : 'FAIL');
process.exit(ok ? 0 : 1);
