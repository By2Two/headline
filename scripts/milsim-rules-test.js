import assert from 'node:assert/strict';
import { MIL } from '../shared/milsim/config.js';
import {
  waterDepth,
  ACTIVE_MAP,
  SECTORS,
  CAPTURE_CHAIN,
  TERRAIN,
  heightAt,
} from '../shared/milsim/terrain.js';
import { MAPDATA, selectMilMap, doorById } from '../shared/milsim/world.js';
import { canCapture } from '../shared/milsim/maps.js';
import { roadPath } from '../server/milsim/roads.js';
import { initMilsim, setupMilRoom, milJoin, milAddBot, milTick } from '../server/milsim/index.js';
let now = 1000;
let id = 1;
const messages = [];
initMilsim({
  now: () => now,
  nextId: () => id++,
  send: (player, message) => messages.push(message),
  broadcast: (room, message) => messages.push(message),
  roomInfo: (room) => ({ code: room.code }),
  log: () => {},
});
const room = (map) => {
  const room = { players: new Map(), code: map, botN: 0, skill: 'normal', score: [0, 0] };
  setupMilRoom(room, { map });
  room.mil.prepUntil = 0;
  return room;
};
room('kestrel');
const terrain0 = TERRAIN;
const data0 = MAPDATA;
const height = heightAt(320, 170);
const iron = room('ironpass');
assert.equal(ACTIVE_MAP, 'ironpass');
assert.equal(SECTORS.length, 7);
assert.notEqual(heightAt(320, 170), height);
assert.equal(MAPDATA.supplyTents.length, 7);
assert.ok(MAPDATA.boxes.length && MAPDATA.bridges.length);
assert.ok(SECTORS.every((sector) => Number.isFinite(heightAt(sector.x, sector.z))));
assert.equal(waterDepth(SECTORS[2].x, SECTORS[2].z), 0, 'relay objective must be on dry ground');
assert.ok(roadPath(-60, -800, 60, 800).length > 2);
const owners = SECTORS.map((sector) => ({ id: sector.id, owner: -1 }));
assert.equal(canCapture(owners, 0, 'A', CAPTURE_CHAIN), true);
assert.equal(canCapture(owners, 0, 'F', CAPTURE_CHAIN), false);
assert.equal(canCapture(owners, 1, 'G', CAPTURE_CHAIN), true);
assert.equal(canCapture(owners, 1, 'A', CAPTURE_CHAIN), false);
for (const key of [...CAPTURE_CHAIN].reverse().slice(0, -1)) {
  owners.find((sector) => sector.id === key).owner = 1;
}
assert.equal(canCapture(owners, 1, 'A', CAPTURE_CHAIN), true);
owners.find((sector) => sector.id === 'F').owner = -1;
assert.equal(canCapture(owners, 1, 'A', CAPTURE_CHAIN), false);
selectMilMap('kestrel');
assert.equal(TERRAIN, terrain0);
assert.equal(MAPDATA, data0);
assert.equal(SECTORS.length, 4);
assert.equal(heightAt(320, 170), height);
assert.ok(roadPath(-60, -800, 60, 800).length > 2);
assert.equal(doorById(MAPDATA.doors[0].id), MAPDATA.doors[0]);
const full = room('kestrel');
for (let step = 0; step < 24; step++) {
  milJoin(full, { id: id++, pos: [0, 0, 0], ws: {} }, { team: 0, name: 'P' + step });
}
assert.equal(full.players.size, 24);
assert.ok(
  [0, 1, 2, 3].every(
    (squad) => [...full.players.values()].filter((player) => player.squad === squad).length === 6,
  ),
);
milJoin(full, { id: id++, pos: [0, 0, 0], ws: {} }, { team: 0 });
assert.equal(full.players.size, 24);
assert.equal(messages.at(-1).t, 'error');
for (let step = 0; step < 24; step++) {
  assert.equal(milAddBot(full), true);
}
assert.equal(milAddBot(full), false);
assert.equal(full.players.size, MIL.maxPlayers);
assert.ok(
  [0, 1].every(
    (team) => [...full.players.values()].filter((player) => player.team === team).length === 24,
  ),
);
assert.ok(
  [0, 1].every((team) =>
    [0, 1, 2, 3].every(
      (squad) =>
        [...full.players.values()].filter(
          (player) => player.team === team && player.squad === squad,
        ).length === 6,
    ),
  ),
);
const battle = room('kestrel');
for (const sector of battle.mil.sectors) {
  Object.assign(sector, { owner: 0, cap: 1, capTeam: 0 });
}
const tick = () => {
  now += 250;
  milTick(battle, now);
};
tick();
const left = battle.mil.total.left;
assert.ok(left < MIL.winHoldMs);
const enemy = { id: id++, pos: [0, 0, 0], hp: 100, yaw: 0, pitch: 0, ws: {} };
milJoin(battle, enemy, { team: 1 });
const firstSector = SECTORS[0];
Object.assign(enemy, {
  alive: true,
  pos: [firstSector.x, heightAt(firstSector.x, firstSector.z), firstSector.z],
});
tick();
assert.equal(battle.mil.total.paused, true);
assert.equal(battle.mil.total.left, left);
enemy.alive = false;
tick();
assert.equal(battle.mil.total.paused, false);
assert.ok(battle.mil.total.left < left);
enemy.alive = true;
battle.mil.sectors[0].cap = 0.001;
tick();
assert.equal(battle.mil.sectors[0].owner, -1);
assert.equal(battle.mil.total, null);
enemy.alive = false;
Object.assign(battle.mil.sectors[0], { owner: 0, cap: 1 });
tick();
assert.equal(battle.mil.total.left, MIL.winHoldMs - 250);
const ironEnemy = { id: id++, pos: [0, 0, 0], hp: 100, yaw: 0, pitch: 0, ws: {} };
milJoin(iron, ironEnemy, { team: 1 });
const rear = SECTORS[0];
Object.assign(ironEnemy, { alive: true, pos: [rear.x, heightAt(rear.x, rear.z), rear.z] });
now += 250;
milTick(iron, now);
assert.equal(iron.mil.sectors[0].cap, 0);
assert.equal(ACTIVE_MAP, 'ironpass');
ironEnemy.alive = false;
tick();
assert.equal(ACTIVE_MAP, 'kestrel');
console.log(
  'OK: two maps, deterministic caches, roads, capture sequence, 24/team, six/squad, timer pause/resume/reset, room isolation',
);
