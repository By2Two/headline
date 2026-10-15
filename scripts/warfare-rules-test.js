import assert from 'node:assert/strict';
import { MIL, FLEET } from '../shared/warfare/config.js';
import { SECTORS, heightAt, MAIN_BASES } from '../shared/warfare/terrain.js';
import {
  initWarfare,
  setupMilRoom,
  milJoin,
  milAddBot,
  milTick,
  milMessage,
} from '../server/warfare/index.js';

let now = 1000;
let id = 1;
const messages = [];
initWarfare({
  now: () => now,
  nextId: () => id++,
  send: (player, message) => messages.push({ to: player.id, ...message }),
  broadcast: (targetRoom, message) => messages.push(message),
  roomInfo: (gameRoom) => ({ code: gameRoom.code }),
  log: () => {},
});
const room = (map) => {
  const createdRoom = { players: new Map(), code: map, botN: 0, skill: 'normal', score: [0, 0] };
  setupMilRoom(createdRoom, { map });
  return createdRoom;
};
const human = (gameRoom, team, name) => {
  const player = { id: id++, pos: [0, 0, 0], hp: 100, yaw: 0, pitch: 0, ws: {} };
  milJoin(gameRoom, player, { team, name });
  return player;
};
const tick = (activeRoom, milliseconds = 250) => {
  now += milliseconds;
  milTick(activeRoom, now);
};

const currentRoom = room('ironpass');
const alpha = human(currentRoom, 0, 'Alpha');
const bravo = human(currentRoom, 1, 'Bravo');
const charlie = human(currentRoom, 0, 'Charlie');
assert.equal(alpha.squad, charlie.squad, 'humans of one team share the first squad');
assert.equal(currentRoom.mil.tickets[0], MIL.tickets);
assert.equal(currentRoom.mil.prepUntil, 0, 'no preparation phase');

tick(currentRoom, 1100);
for (let step = 0; step < 70; step++) {
  tick(currentRoom, 1000);
}
for (const team of [0, 1]) {
  for (const [type, want] of Object.entries(FLEET)) {
    if (!want) {
      continue;
    }
    const have = [...currentRoom.mil.vehicles.values()].filter(
      (vehicle) => vehicle.team === team && vehicle.type === type,
    );
    assert.equal(have.length, want, `${type} fleet for team ${team}`);
  }
}

const deployMain = (player) => {
  player.respawnAt = 0;
  milMessage(currentRoom, player, { t: 'deploy', sp: 'main' }, now);
  assert.equal(player.alive, true);
};
deployMain(alpha);
deployMain(charlie);
assert.equal(MIL.respawnMs, 5000);
const base = MAIN_BASES[0];
assert.ok(Math.hypot(alpha.pos[0] - base.x, alpha.pos[2] - base.z) < base.r);

const flag = currentRoom.mil.sectors[3];
const firstSector = SECTORS[3];
for (const player of [alpha, charlie]) {
  player.pos = [firstSector.x, heightAt(firstSector.x, firstSector.z), firstSector.z];
  player.ms.x = firstSector.x;
  player.ms.z = firstSector.z;
}
for (let step = 0; step < 120 && flag.owner !== 0; step++) {
  tick(currentRoom);
}
assert.equal(flag.owner, 0, 'flag D captured without holding A..C first');
assert.ok(
  messages.some(
    (message) => message.t === 'msec' && message.id === firstSector.id && message.ev === 'captured',
  ),
  'capture broadcast',
);

const flag2 = currentRoom.mil.sectors[5];
const secondSector = SECTORS[5];
deployMain(bravo);
bravo.pos = [secondSector.x, heightAt(secondSector.x, secondSector.z), secondSector.z];
bravo.ms.x = secondSector.x;
bravo.ms.z = secondSector.z;
alpha.pos = [secondSector.x + 3, heightAt(secondSector.x, secondSector.z), secondSector.z];
alpha.ms.x = secondSector.x + 3;
alpha.ms.z = secondSector.z;
const cap0 = flag2.cap;
for (let step = 0; step < 20; step++) {
  tick(currentRoom);
}
assert.equal(flag2.contested, true);
assert.equal(flag2.cap, cap0, 'contested flag does not progress');

bravo.alive = false;
alpha.pos = [firstSector.x, heightAt(firstSector.x, firstSector.z), firstSector.z];
alpha.ms.x = firstSector.x;
alpha.ms.z = firstSector.z;
const before = currentRoom.mil.tickets[1];
const mine = currentRoom.mil.sectors.filter((sector) => sector.owner === 0).length;
const theirs = currentRoom.mil.sectors.filter((sector) => sector.owner === 1).length;
assert.ok(mine > theirs);
for (let step = 0; step < 24; step++) {
  tick(currentRoom);
}
assert.ok(currentRoom.mil.tickets[1] < before, 'team with fewer flags loses tickets');
assert.equal(currentRoom.mil.tickets[0], MIL.tickets, 'leader keeps its tickets');

alpha.alive = false;
alpha.respawnAt = 0;
charlie.pos = [base.x + 5, heightAt(base.x, base.z), base.z + 5];
charlie.ms.x = base.x + 5;
charlie.ms.z = base.z + 5;
charlie.lastHurtAt = 0;
messages.length = 0;
alpha.tsLast = '';
for (let step = 0; step < 12; step++) {
  tick(currentRoom, 100);
}
const options = messages
  .filter((message) => message.t === 'mteam' && message.to === alpha.id)
  .at(-1)?.spawns;
assert.ok(options, 'spawn options reach the player');
assert.ok(options.find((option) => option.kind === 'main' && option.ok));
assert.ok(
  options.find((option) => option.kind === 'sector' && option.id === firstSector.id && option.ok),
  'owned flag is a spawn',
);
assert.ok(
  options.find((option) => option.kind === 'squad' && option.name === 'Charlie' && option.ok),
  'squadmate spawn',
);
const vehOpt = options.find((option) => option.kind === 'veh' && option.ok);
assert.ok(vehOpt, 'vehicle seat spawn');
milMessage(currentRoom, alpha, { t: 'deploy', sp: vehOpt.id }, now);
assert.equal(alpha.alive, true);
assert.ok(alpha.veh, 'spawned inside a vehicle');

alpha.alive = false;
alpha.veh = 0;
alpha.respawnAt = 0;
for (const vehicle of currentRoom.mil.vehicles.values()) {
  vehicle.seats = vehicle.seats.map((positionX) => (positionX === alpha.id ? 0 : positionX));
}
milMessage(currentRoom, alpha, { t: 'deploy', sp: `P${charlie.id}` }, now);
assert.equal(alpha.alive, true);
assert.ok(
  Math.hypot(alpha.pos[0] - charlie.pos[0], alpha.pos[2] - charlie.pos[2]) < 12,
  'spawned next to squadmate',
);

{
  const open = SECTORS[1];
  const groundY = heightAt(open.x, open.z + 60);
  for (const [deployedPlayer, positionZ] of [
    [alpha, open.z + 60],
    [bravo, open.z + 30],
  ]) {
    deployedPlayer.alive = true;
    deployedPlayer.veh = 0;
    deployedPlayer.pos = [open.x, groundY, positionZ];
    deployedPlayer.ms.x = open.x;
    deployedPlayer.ms.y = groundY;
    deployedPlayer.ms.z = positionZ;
    deployedPlayer.yaw = 0;
    deployedPlayer.pitch = 0;
    deployedPlayer.hp = 100;
    deployedPlayer.protectedUntil = 0;
    deployedPlayer.downed = false;
  }
  charlie.team = 0;
  messages.length = 0;
  now += 2000;
  milMessage(currentRoom, alpha, { t: 'spot' }, now);
  const spotMsg = messages.find((message) => message.t === 'mspot' && message.to === charlie.id);
  assert.ok(spotMsg, 'the squad receives the spot');
  assert.equal(spotMsg.id, bravo.id);
  assert.ok(currentRoom.mil.spots.has(`p${bravo.id}`));
  const downed = { ...charlie };
  void downed;
}

currentRoom.mil.tickets[1] = 1;
for (let step = 0; step < 60 && currentRoom.mil.winner < 0; step++) {
  tick(currentRoom, 1000);
}
assert.equal(currentRoom.mil.winner, 0, 'team 0 wins when tickets of team 1 reach zero');
assert.ok(messages.some((message) => message.t === 'win' && message.team === 0));

const big = room('ironpass');
for (let step = 0; step < 70; step++) {
  milAddBot(big);
}
assert.ok(
  [...big.players.values()].filter((player) => player.team === 0).length <= MIL.maxTeamPlayers,
);
for (let step = 0; step < 200; step++) {
  tick(big, 250);
}
assert.ok(
  [...big.players.values()].some((player) => player.alive),
  'bots spawn and play',
);

console.log('OK warfare rules: conquest, tickets, fast respawn, fleet, spawn options, win');
