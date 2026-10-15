import { builtInOptic, OPTICS, rankOf } from '../../shared/milsim/config.js';
import { MW } from '../../shared/milsim/weapons.js';

const BINOS = 16;
function scopedOf(recipient) {
  if (!recipient.alive) {
    return false;
  }
  if (recipient.ui & BINOS) {
    return true;
  }
  if (!recipient.aiming) {
    return false;
  }
  const weapon = MW[recipient.weapon];
  if (!weapon || weapon.slot !== 'primary') {
    return false;
  }
  const optic =
    builtInOptic(weapon, recipient.kit?.primary?.optic) || recipient.kit?.primary?.optic;
  return !!OPTICS.find((positionX) => positionX.id === optic)?.mag;
}

function playerEvery(predicate) {
  return predicate < 50 ? 1 : predicate < 150 ? 2 : predicate < 400 ? 4 : predicate < 800 ? 8 : 15;
}
function vehicleEvery(predicate) {
  return predicate < 150 ? 1 : predicate < 400 ? 2 : predicate < 900 ? 5 : 10;
}

const i100 = (value) => Math.round(value * 100);
const i1000 = (value) => Math.round(value * 1000);

export function playerRow(player, weapon, flags, vehId) {
  const currentFlags =
    flags |
    (player.crouch ? 2048 : 0) |
    (player.alive && player.aiming ? 4096 : 0) |
    (player.alive && player.reloading ? 8192 : 0) |
    (player.alive ? 16384 : 0);
  return [
    player.id,
    i100(player.pos[0]),
    i100(player.pos[1]),
    i100(player.pos[2]),
    i1000(player.yaw),
    i1000(player.pitch),
    currentFlags,
    Math.max(0, Math.round(player.hp)),
    weapon,
    Math.round(player.lean * 100),
    vehId,
    vehId ? player.seat : 0,
    player.mount || 0,
    player.spawnCount,
  ];
}
const rosterRow = (player) => [
  player.id,
  player.name,
  player.team,
  player.kills,
  player.deaths,
  player.lk,
  player.gear || '00000000000',
  player.squad | 0,
  player.isBot ? 1 : 0,
  rankOf(player.xp),
];

const eventKey = (player, row) =>
  `${row[6] & (4 | 16384)}|${row[10]}|${row[11]}|${row[12]}|${row[13]}|${player.weapon}`;

export function sendSnapshots(room, now, rows, vehRows, extra, sendRaw) {
  const mil = room.mil;
  const sync = (mil.sync ||= {
    roster: new Map(),
    ev: new Map(),
    evTick: new Map(),
    vehIds: new Set(),
    parked: new Map(),
  });
  const tick = mil.tick;
  let bytes = 0;

  const rChanged = [];
  for (const player of room.players.values()) {
    const rosterRecord = rosterRow(player);
    const key = rosterRecord.join('\u0001');
    if (sync.roster.get(player.id) !== key) {
      sync.roster.set(player.id, key);
      rChanged.push(rosterRecord);
    }
    const row = rows.get(player.id);
    const currentEventKey = eventKey(player, row);
    if (sync.ev.get(player.id) !== currentEventKey) {
      sync.ev.set(player.id, currentEventKey);
      sync.evTick.set(player.id, tick);
    }
  }
  const rGone = [];
  for (const id of sync.roster.keys()) {
    if (!room.players.has(id)) {
      sync.roster.delete(id);
      sync.ev.delete(id);
      sync.evTick.delete(id);
      rGone.push(id);
    }
  }
  const vGone = [];
  for (const id of sync.vehIds) {
    if (!vehRows.has(id)) {
      vGone.push(id);
    }
  }
  sync.vehIds = new Set(vehRows.keys());
  const vKeyChanged = new Set();
  for (const value of mil.vehicles.values()) {
    const row = vehRows.get(value.id);
    const key = `${row[3]}|${row[5]}|${row[6]}|${row[9]}|${row[10]}|${row[11]}|${row[18]}|${row[19]}|${row[12]}|${row[22]}|${row[23]}|${row[29]}`;
    if (sync.parked.get(value.id) !== key) {
      sync.parked.set(value.id, key);
      vKeyChanged.add(value.id);
    }
  }
  for (const id of sync.parked.keys()) {
    if (!vehRows.has(id)) {
      sync.parked.delete(id);
    }
  }

  let rosterAll = null;
  let rosterDelta = null;
  for (const recipient of room.players.values()) {
    if (recipient.isBot || !recipient.ws) {
      continue;
    }
    const recipientSync = (recipient.sync ||= {
      seenP: new Map(),
      seenV: new Map(),
      roster: false,
    });
    if (!recipientSync.roster) {
      rosterAll ||= JSON.stringify({
        t: 'mros',
        all: 1,
        l: [...room.players.values()].map(rosterRow),
      });
      bytes += sendRaw(recipient, rosterAll);
      recipientSync.roster = true;
    } else if (rChanged.length || rGone.length) {
      rosterDelta ||= JSON.stringify({ t: 'mros', l: rChanged, rm: rGone });
      bytes += sendRaw(recipient, rosterDelta);
    }
    for (const id of rGone) {
      recipientSync.seenP.delete(id);
    }
    for (const id of vGone) {
      recipientSync.seenV.delete(id);
    }
    const recipientVehicle = recipient.veh ? mil.vehicles.get(recipient.veh) : null;
    const originX = recipientVehicle ? recipientVehicle.x : recipient.pos[0];
    const originZ = recipientVehicle ? recipientVehicle.z : recipient.pos[2];
    const dead = !recipient.alive;
    const scoped = scopedOf(recipient);
    const forwardX = -Math.sin(recipient.yaw);
    const forwardZ = -Math.cos(recipient.yaw);
    const players = [];
    for (const player of room.players.values()) {
      const row = rows.get(player.id);
      let every;
      if (player === recipient) {
        every = 1;
      } else {
        const deltaX = player.pos[0] - originX;
        const deltaZ = player.pos[2] - originZ;
        const predicate = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
        every = playerEvery(predicate);
        if (player.veh && player.veh === recipient.veh) {
          every = 1;
        }
        if (player.team === recipient.team && player.squad === recipient.squad) {
          every = Math.min(every, 8);
        }
        if (!player.alive) {
          every = Math.max(every, 10);
        }
        if (dead) {
          every = Math.max(every, player.team === recipient.team ? 8 : 15);
        }
        if (
          scoped &&
          every > 2 &&
          predicate < 1500 &&
          predicate > 1 &&
          (deltaX * forwardX + deltaZ * forwardZ) / predicate > 0.996
        ) {
          every = 2;
        }
      }
      const last = recipientSync.seenP.get(player.id);
      if (
        last === undefined ||
        sync.evTick.get(player.id) === tick ||
        (tick + player.id) % every === 0 ||
        tick - last >= every
      ) {
        recipientSync.seenP.set(player.id, tick);
        players.push(row);
      }
    }
    const vehicles = [];
    for (const value of mil.vehicles.values()) {
      const deltaX = value.x - originX;
      const deltaZ = value.z - originZ;
      let every =
        value.id === recipient.veh ? 1 : vehicleEvery(Math.sqrt(deltaX * deltaX + deltaZ * deltaZ));
      if (dead) {
        every = Math.max(every, 10);
      }
      const idle =
        !value.driver &&
        Math.abs(value.v || 0) < 0.05 &&
        !(value.rotor > 0.01) &&
        !vKeyChanged.has(value.id);
      if (idle) {
        every = 30;
      }
      const last = recipientSync.seenV.get(value.id);
      if (
        last === undefined ||
        (vKeyChanged.has(value.id) && every <= 5) ||
        (tick + value.id) % every === 0 ||
        tick - last >= every
      ) {
        recipientSync.seenV.set(value.id, tick);
        vehicles.push(vehRows.get(value.id));
      }
    }
    const message = { t: 'snap', time: now, gm: 'milsim', P: players, V: vehicles, ...extra };
    if (vGone.length) {
      message.vr = vGone;
    }
    if (tick % 30 === 0) {
      message.va = [...sync.vehIds];
    }
    bytes += sendRaw(recipient, JSON.stringify(message), true);
  }
  return bytes;
}
