import { MIL } from '../shared/warfare/config.js';
import { SECTORS } from '../shared/warfare/terrain.js';
import { initWarfare, setupMilRoom, milAddBot, milTick } from '../server/warfare/index.js';

const BOTS = Number(process.argv[2]) || 40;
const MINUTES = Number(process.argv[3]) || 6;
const MAP = process.argv[4] || 'frontier';
let now = 1000;
let id = 1;
const wins = [];
initWarfare({
  now: () => now,
  nextId: () => id++,
  send: () => {},
  broadcast: (room, message) => {
    if (message.t === 'win') {
      wins.push({ t: now, team: message.team, why: message.why });
    }
  },
  roomInfo: () => ({}),
  log: () => {},
});
const room = { players: new Map(), code: 'SIM', botN: 0, skill: 'normal', score: [0, 0] };
setupMilRoom(room, { map: MAP });
for (let index = 0; index < BOTS; index++) {
  milAddBot(room);
}
const mil = room.mil;
const TICK = 1000 / 30;
let worst = 0;
let total = 0;
let ticks = 0;
const report = (label) => {
  const alive = [...room.players.values()].filter((player) => player.alive).length;
  const inVeh = [...room.players.values()].filter((player) => player.alive && player.veh).length;
  const flags = mil.sectors.map((sector) => (sector.owner < 0 ? '-' : sector.owner)).join('');
  const kills = [...room.players.values()].reduce(
    (accumulator, item) => accumulator + item.kills,
    0,
  );
  const vehs = [...mil.vehicles.values()].filter((vehicle) => vehicle.alive);
  const moving = vehs.filter(
    (vehicle) => Math.abs(vehicle.v || 0) > 1 || Math.hypot(vehicle.vx || 0, vehicle.vz || 0) > 1,
  ).length;
  console.log(
    `${label} flags=${flags} tickets=${mil.tickets.map(Math.round)} alive=${alive}/${room.players.size} inVeh=${inVeh} veh=${vehs.length} moving=${moving} kills=${kills}`,
  );
};
const end = now + MINUTES * 60000;
let nextReport = now + 30000;
while (now < end) {
  now += TICK;
  const startedAt = performance.now();
  milTick(room, now);
  const deltaTime = performance.now() - startedAt;
  total += deltaTime;
  ticks++;
  worst = Math.max(worst, deltaTime);
  if (now >= nextReport) {
    nextReport += 30000;
    report(`t=${Math.round((now - 1000) / 1000)}s`);
  }
}
report('final');
console.log(
  `tick medio ${(total / ticks).toFixed(2)} ms, pior ${worst.toFixed(1)} ms; ${SECTORS.length} bandeiras; partidas terminadas: ${JSON.stringify(wins)}`,
);
void MIL;
