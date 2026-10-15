import assert from 'node:assert/strict';
import {
  initWarfare,
  setupMilRoom,
  milJoin,
  milTick,
  milMessage,
  W,
} from '../server/warfare/index.js';
import { defaultKit } from '../shared/warfare/config.js';

let now = 1000;
let id = 1;
initWarfare({
  now: () => now,
  nextId: () => id++,
  send: () => {},
  broadcast: () => {},
  roomInfo: (gameRoom) => ({ code: gameRoom.code }),
  log: () => {},
});
const room = { players: new Map(), code: 'gad', botN: 0, skill: 'normal', score: [0, 0] };
setupMilRoom(room, { map: 'frontier' });
const human = (team, name, classId) => {
  const player = { id: id++, pos: [0, 0, 0], hp: 100, yaw: 0, pitch: 0, ws: {} };
  milJoin(room, player, { team, name, kit: defaultKit(team, classId) });
  player.respawnAt = 0;
  milMessage(room, player, { t: 'deploy', sp: 'main', kit: defaultKit(team, classId) }, now);
  return player;
};
const tick = (milliseconds) => {
  now += milliseconds;
  milTick(room, now);
};
tick(1000);

const recon = human(0, 'Recon', 'sniper');
const reserve = recon.inv.mags.filter(
  (magazine) => magazine.cal === recon.inv.loaded[recon.slots[0]].cal,
).length;
assert.ok(reserve >= 6, `recon reserve mags: ${reserve}`);
assert.equal(recon.inv.items.beacon, 1);

const assault = human(0, 'Assault', 'assault');
const mate = human(0, 'Mate', 'support');
for (const member of [assault, mate]) {
  member.pos = [recon.pos[0] + 3, recon.pos[1], recon.pos[2]];
  member.ms.x = member.pos[0];
  member.ms.z = member.pos[2];
}
mate.inv.mags.length = 0;
for (const magazine of Object.values(mate.inv.loaded)) {
  magazine.n = 1;
}
assault.weapon = W.ammobag;
assert.equal(assault.inv.items.ammobag, 2);
milMessage(room, assault, { t: 'gadget', k: 'ammobag', d: [0, 0, -1] }, now);
assert.equal(assault.inv.items.ammobag, 1, 'bag consumed');
assert.equal(room.mil.gadgets.size, 1);
const gadget = [...room.mil.gadgets.values()][0];
mate.pos = [gadget.x, gadget.y, gadget.z];
mate.ms.x = gadget.x;
mate.ms.z = gadget.z;
for (let index = 0; index < 120; index++) {
  tick(34);
}
assert.ok(mate.inv.mags.length >= 2, 'ally refilled magazines');

const medic = human(0, 'Medic', 'medic');
medic.weapon = W.medbag;
const hurt = human(0, 'Hurt', 'assault');
hurt.hp = 40;
medic.pos = [hurt.pos[0] + 1, hurt.pos[1], hurt.pos[2]];
medic.ms.x = medic.pos[0];
medic.ms.z = medic.pos[2];
milMessage(room, medic, { t: 'gadget', k: 'medbag', d: [0, 0, -1] }, now);
const bag = [...room.mil.gadgets.values()].find((positionX) => positionX.k === 'medbag');
assert.ok(bag, 'medbag placed');
hurt.pos = [bag.x, bag.y, bag.z];
hurt.ms.x = bag.x;
hurt.ms.z = bag.z;
for (let index = 0; index < 400; index++) {
  tick(34);
}
assert.ok(hurt.hp > 70, `ally healed to ${hurt.hp}`);

recon.weapon = W.beacon;
milMessage(room, recon, { t: 'gadget', k: 'beacon', d: [0, 0, -1] }, now);
const beacon = [...room.mil.gadgets.values()].find((positionX) => positionX.k === 'beacon');
assert.ok(beacon, 'beacon placed');
const dead = human(0, 'Dead', 'assault');
dead.alive = false;
dead.respawnAt = 0;
milMessage(room, dead, { t: 'deploy', sp: `G${beacon.id}`, kit: defaultKit(0, 'assault') }, now);
assert.equal(dead.alive, true, 'spawned on the beacon');
assert.ok(Math.hypot(dead.pos[0] - beacon.x, dead.pos[2] - beacon.z) < 8, 'near the beacon');
assert.equal(beacon.uses, 4, 'beacon use spent');
console.log('OK warfare gadgets: recon ammo, ammo bag, medical bag, spawn beacon');
