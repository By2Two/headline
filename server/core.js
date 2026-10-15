import {
  TICK_MS,
  TICK_RATE,
  MAX_PLAYERS,
  MAX_HP,
  RESPAWN_MS,
  KILLS_TO_WIN,
  WIN_PAUSE_MS,
  SPAWN_PROTECT_MS,
  MAX_REWIND_MS,
  MAX_RANGE,
  PLAYER,
  PART_MULT,
} from '../shared/constants.js';
import { getMap, MAPS, TEST_SPAWN, solidsOf, groundAt } from '../shared/map.js';
import {
  WEAPONS,
  loadoutSlots,
  teamKey,
  weaponIndex,
  GUNGAME,
  GG_KILLS,
  GAME_MODES,
} from '../shared/weapons.js';
import { sanitizeLook, encodeLook, DEFAULT_LOOK } from '../shared/look.js';
import { sanitizeSkins, skinIndex } from '../shared/skins.js';

const WEAPON_IDS = WEAPONS.map((entry) => entry.id);
import { raycastWorld, rayAABB, playerHitboxes, traceShot } from '../shared/raycast.js';
import { createMoveState, stepPlayer, solidsWithBodies } from '../shared/movement.js';
import { pelletDirs } from '../shared/pellets.js';
import { NADE, nadeStart, stepNade } from '../shared/nade.js';
import { makeBot, updateBot, BOT_SKILLS, randomLoadout } from './bots.js';
import {
  initEcon,
  buy,
  freeBuy,
  pickDrop,
  dropHeld,
  defaultSlots,
  absorbArmor,
  skinOf,
  setMoney,
} from './econ.js';
import { ECON } from '../shared/econ.js';
import {
  initComp,
  isComp,
  newCompState,
  resetComp,
  tickComp,
  compSnap,
  onDeath,
  onLeave,
  canSpawnNow,
  frozen,
  setPlanting,
  setDefusing,
  dropBomb,
} from './comp.js';
import { MIL, isMilsim } from '../shared/milsim/config.js';
import { MIL as WMIL, isWarfare } from '../shared/warfare/config.js';
let milsimModule = null;
const loadMilsim = () =>
  import('./milsim/index.js').then((mod) => {
    if (!milsimModule) {
      mod.initMilsim({
        broadcast,
        send,
        now,
        nextId: () => nextId++,
        roomInfo,
        log: (...values) => console.log(...values),
        sendRaw: (player, text) => player.ws.send(text),
      });
      milsimModule = mod;
    }
    return milsimModule;
  });

let warfareModule = null;
const loadWarfare = () =>
  import('./warfare/index.js').then((mod) => {
    if (!warfareModule) {
      mod.initWarfare({
        broadcast,
        send,
        now,
        nextId: () => nextId++,
        roomInfo,
        log: (...values) => console.log(...values),
        sendRaw: (player, text) => player.ws.send(text),
      });
      warfareModule = mod;
    }
    return warfareModule;
  });
const gameKind = (room) => (isMilsim(room) ? 'milsim' : isWarfare(room) ? 'warfare' : 'tactical');
const KIND_NAMES = { milsim: 'MilSim', warfare: 'Warfare', tactical: 'Tactical' };

const ENV = typeof process !== 'undefined' && process.env ? process.env : {};
const TEST_SPAWNS = !!ENV.TEST_SPAWNS;
let publicUrl = null;
const MAX_ROOMS = 200;
const MAX_BOTS = 10;
const WIN_KILLS = Number(ENV.WIN_KILLS) || KILLS_TO_WIN;
const CMD_RATE = 62;
const CMD_BURST = 30;
const MOVE_DT = 1 / 60;
const roundToFourDecimals = (value) => Math.round(value * 10000) / 10000;
const axis = (value) => Math.max(-1, Math.min(1, Math.round(Number(value)) || 0));
const now = () => performance.now();

const rooms = new Map();
let nextId = 1;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode(wanted) {
  const normalized = String(wanted || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (normalized.length === 4 && !rooms.has(normalized)) {
    return normalized;
  }
  for (;;) {
    let character = '';
    for (let index = 0; index < 4; index++) {
      character += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    if (!rooms.has(character)) {
      return character;
    }
  }
}

function resetDoors(room) {
  room.broken = new Set();
  room.doorHp = room.map.doors.map((door) => door.hp);
  room.solids = solidsOf(room.map, room.broken);
}

function damageDoor(room, id, damage) {
  if (room.broken.has(id) || !(room.doorHp[id] > 0)) {
    return;
  }
  room.doorHp[id] -= damage;
  if (room.doorHp[id] > 0) {
    return;
  }
  room.broken.add(id);
  room.solids = solidsOf(room.map, room.broken);
  broadcast(room, { t: 'door', id });
}

const ffa = (room) => room.game === 'gungame';
const hasLobby = (room) => !room.solo && (isComp(room) || room.game === 'tdm');
const enemies = (room, attacker, victim) =>
  attacker !== victim && (ffa(room) || attacker.team !== victim.team);

function ggSlots(level) {
  const gunGameWeapon = weaponIndex(GUNGAME[Math.min(level, GUNGAME.length - 1)]);
  return [gunGameWeapon, gunGameWeapon, weaponIndex('knife')];
}

function createRoom({ hostId, solo = false, code }) {
  const room = {
    code: newCode(code),
    solo,
    hostId,
    players: new Map(),
    skill: 'normal',
    botN: 0,
    score: [0, 0],
    winner: -1,
    nextMatchAt: 0,
    map: getMap(),
    broken: new Set(),
    doorHp: [],
    game: 'tdm',
    comp: null,
    nades: [],
    smokes: [],
    nadeId: 0,
    drops: [],
    dropId: 0,
  };
  resetDoors(room);
  rooms.set(room.code, room);
  return room;
}

const roomInfo = (room) => ({
  code: room.solo ? null : room.code,
  solo: room.solo,
  host: room.hostId,
  skill: room.skill,
  map: room.map.id,
  doors: [...room.broken],
  game: room.game,
  url: publicUrl,
  bots: [...room.players.values()].filter((candidate) => candidate.isBot).length,
  lobby: !!room.lobby,
});
const humans = (room) => [...room.players.values()].filter((candidate) => !candidate.isBot);

const roundToTwoDecimals = (value) => Math.round(value * 100) / 100;
const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
const isVec3 = (value) => Array.isArray(value) && value.length === 3 && value.every(isNum);
const dist3 = (from, to) => Math.hypot(from[0] - to[0], from[1] - to[1], from[2] - to[2]);

function send(player, object) {
  if (player.ws && player.ws.readyState === 1) {
    player.ws.send(JSON.stringify(object));
  }
}
function broadcast(room, object, except = null) {
  const text = JSON.stringify(object);
  for (const player of room.players.values()) {
    if (player !== except && player.ws && player.ws.readyState === 1) {
      player.ws.send(text);
    }
  }
}

function newPlayer(socket) {
  return {
    id: nextId++,
    ws: socket,
    room: null,
    isBot: false,
    name: '',
    team: 0,
    pos: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    crouch: false,
    aiming: false,
    hp: MAX_HP,
    alive: false,
    kills: 0,
    deaths: 0,
    weapon: 0,
    slots: loadoutSlots(null),
    loadout: null,
    lk: encodeLook(DEFAULT_LOOK),
    ammo: [],
    nextFire: 0,
    readyAt: 0,
    reloading: false,
    reloadEnd: 0,
    history: [],
    spawnCount: 0,
    protectedUntil: 0,
    respawnAt: 0,
    lastSeq: 0,
    ms: createMoveState(),
    cmdBudget: 0,
    budgetAt: 0,
  };
}

function pickTeam(room) {
  let terroristCount = 0;
  let counterTerroristCount = 0;
  for (const candidate of room.players.values()) {
    candidate.team === 0 ? terroristCount++ : counterTerroristCount++;
  }
  return terroristCount <= counterTerroristCount ? 0 : 1;
}

function canSee(room, from, target) {
  const offset = [target[0] - from[0], target[1] - from[1], target[2] - from[2]];
  const length = Math.hypot(offset[0], offset[1], offset[2]);
  const hit = raycastWorld(
    from,
    [offset[0] / length, offset[1] / length, offset[2] / length],
    length,
    room.solids,
  );
  return !hit || hit.t > length - 0.2;
}

function pickSpawnFFA(room, self) {
  const points = room.map.openPoints;
  const others = [...room.players.values()].filter(
    (opponent) => opponent.alive && opponent !== self,
  );
  let best = points[Math.floor(Math.random() * points.length)];
  let bestScore = -Infinity;
  for (let index = 0; index < 40; index++) {
    const [positionX, positionZ] = points[Math.floor(Math.random() * points.length)];
    let near = 60;
    let seen = false;
    for (const opponent of others) {
      near = Math.min(near, Math.hypot(opponent.pos[0] - positionX, opponent.pos[2] - positionZ));
      if (
        !seen &&
        canSee(
          room,
          [opponent.pos[0], opponent.pos[1] + PLAYER.eye, opponent.pos[2]],
          [positionX, groundAt(room.map, positionX, positionZ) + PLAYER.eye, positionZ],
        )
      ) {
        seen = true;
      }
    }
    const score = near - (seen ? 25 : 0) - (near < 8 ? 20 : 0) + Math.random() * 4;
    if (score > bestScore) {
      bestScore = score;
      best = [positionX, positionZ];
    }
  }
  return { x: best[0], z: best[1], yaw: Math.random() * Math.PI * 2 };
}

function pickSpawn(room, team, self) {
  if (ffa(room)) {
    return pickSpawnFFA(room, self);
  }
  const key = team === 0 ? 'T' : 'CT';
  if (TEST_SPAWNS && room.map.id === 'arena') {
    return TEST_SPAWN[key];
  }
  const zone = room.map.spawn[key];
  const others = [...room.players.values()].filter(
    (opponent) => opponent.alive && opponent !== self,
  );
  let spawnPoint = null;
  for (let index = 0; index < 60 && !spawnPoint; index++) {
    const positionX = zone.x[0] + Math.random() * (zone.x[1] - zone.x[0]);
    const positionZ = zone.z[0] + Math.random() * (zone.z[1] - zone.z[0]);
    const ground = groundAt(room.map, positionX, positionZ);
    const blocked = room.solids.some(
      (bot) =>
        bot.max[1] > ground + 0.05 &&
        bot.min[1] < ground + PLAYER.height &&
        positionX > bot.min[0] - 0.6 &&
        positionX < bot.max[0] + 0.6 &&
        positionZ > bot.min[2] - 0.6 &&
        positionZ < bot.max[2] + 0.6,
    );
    if (
      !blocked &&
      !others.some(
        (opponent) => Math.hypot(opponent.pos[0] - positionX, opponent.pos[2] - positionZ) < 1.2,
      )
    ) {
      spawnPoint = { x: positionX, z: positionZ };
    }
  }
  spawnPoint = spawnPoint || { x: (zone.x[0] + zone.x[1]) / 2, z: (zone.z[0] + zone.z[1]) / 2 };
  return { x: spawnPoint.x, z: spawnPoint.z, yaw: zone.yaw + (Math.random() - 0.5) * 1.2 };
}

function spawn(room, player) {
  const spawnPoint = pickSpawn(room, player.team, player);
  const positionY = groundAt(room.map, spawnPoint.x, spawnPoint.z);
  player.pos = [spawnPoint.x, positionY, spawnPoint.z];
  player.yaw = spawnPoint.yaw;
  player.pitch = 0;
  player.crouch = false;
  player.hp = MAX_HP;
  player.alive = true;
  player.spawnCount++;
  player.history = [];
  player.slots = ffa(room)
    ? ggSlots(player.ggLevel || 0)
    : loadoutSlots(player.loadout, teamKey(player.team));
  player.weapon = player.slots[0];
  player.ammo = WEAPONS.map((weaponEntry) => ({
    mag: weaponEntry.mag,
    reserve: weaponEntry.reserve,
  }));
  if (isComp(room)) {
    if (player.keep) {
      player.slots = player.keep.slots;
      const ground = player.slots[3];
      if ((ground ?? null) !== null && !(player.keep.ammo[ground]?.mag > 0)) {
        player.slots[3] = null;
      }
      player.wskin = player.keep.wskin;
      player.armor = player.keep.armor;
    } else {
      player.slots = defaultSlots(player);
      player.wskin = {};
      player.armor = 0;
    }
    player.keep = null;
    player.weapon = player.slots[0];
  } else {
    player.wskin = {};
    player.armor = room.game === 'tdm' && player.loadout?.vest ? ECON.vestArmor : 0;
  }
  player.reloading = false;
  player.readyAt = 0;
  player.nextFire = 0;
  player.lastState = now();
  player.protectedUntil = now() + SPAWN_PROTECT_MS;
  player.ms = createMoveState(spawnPoint.x, positionY, spawnPoint.z);
  player.cmdBudget = CMD_BURST;
  player.budgetAt = now();
  if (player.isBot) {
    player.path = player.goal = player.lastSeen = player.target = null;
  }
  send(player, {
    t: 'respawn',
    p: player.pos,
    yaw: player.yaw,
    sp: player.spawnCount,
    sl: player.slots,
    ...(ffa(room) ? { gl: player.ggLevel || 0, gk: player.ggKills || 0 } : null),
    ...(isComp(room)
      ? {
          am: player.ammo.map((ammo) => [ammo.mag, ammo.reserve]),
          ws: player.wskin,
          ar: player.armor || 0,
        }
      : player.armor
        ? { ar: player.armor }
        : null),
  });
}

function spawnOrWait(room, player) {
  if (room.lobby || (isComp(room) && room.comp && !canSpawnNow(room))) {
    player.alive = false;
    player.respawnAt = Infinity;
    return;
  }
  spawn(room, player);
}

function sampleHistory(other, currentTime) {
  const history = other.history;
  if (!history.length) {
    return { pos: other.pos, crouch: other.crouch };
  }
  const last = history[history.length - 1];
  if (currentTime >= last.t) {
    return last;
  }
  if (currentTime <= history[0].t) {
    return history[0];
  }
  for (let index = history.length - 1; index > 0; index--) {
    if (history[index - 1].t <= currentTime) {
      const olderSample = history[index - 1];
      const newerSample = history[index];
      const fraction = (currentTime - olderSample.t) / (newerSample.t - olderSample.t);
      return {
        pos: [
          olderSample.pos[0] + (newerSample.pos[0] - olderSample.pos[0]) * fraction,
          olderSample.pos[1] + (newerSample.pos[1] - olderSample.pos[1]) * fraction,
          olderSample.pos[2] + (newerSample.pos[2] - olderSample.pos[2]) * fraction,
        ],
        crouch: fraction < 0.5 ? olderSample.crouch : newerSample.crouch,
      };
    }
  }
  return history[0];
}

function startReload(player, currentTime) {
  const weaponStats = WEAPONS[player.weapon];
  const ammo = player.ammo[player.weapon];
  if (!player.alive || player.reloading || ammo.mag >= weaponStats.mag || ammo.reserve <= 0) {
    return;
  }
  player.reloading = true;
  player.reloadEnd = currentTime + weaponStats.reloadTime * 1000 - (player.isBot ? 0 : 150);
}
function finishReload(player) {
  const weaponStats = WEAPONS[player.weapon];
  const ammo = player.ammo[player.weapon];
  const take = Math.min(weaponStats.mag - ammo.mag, ammo.reserve);
  ammo.mag += take;
  ammo.reserve -= take;
  player.reloading = false;
}

function killPlayer(room, killer, victim, weapon, head, gush = false, noscope = false) {
  victim.alive = false;
  victim.deaths++;
  victim.respawnAt = now() + (ffa(room) ? 2000 : RESPAWN_MS);
  victim.reloading = false;
  if (killer !== victim) {
    killer.kills++;
  }
  broadcast(room, {
    t: 'kill',
    k: killer.id,
    kn: killer.name,
    kt: killer.team,
    v: victim.id,
    vn: victim.name,
    vt: victim.team,
    w: weapon.id,
    h: head,
    ...(gush ? { g: 1 } : null),
    ...(noscope ? { ns: 1 } : null),
  });
  if (isComp(room)) {
    return onDeath(room, victim, killer, weapon);
  }
  if (ffa(room)) {
    if (room.winner < 0 && killer !== victim) {
      if (weapon.melee) {
        ggKnifed(room, victim);
      }
      ggKill(room, killer, weapon);
    }
    return;
  }
  if (killer.team !== victim.team && room.winner < 0) {
    room.score[killer.team]++;
    if (room.score[killer.team] >= WIN_KILLS) {
      room.winner = killer.team;
      room.nextMatchAt = now() + WIN_PAUSE_MS;
      broadcast(room, { t: 'win', team: killer.team, score: room.score });
      console.log(
        `* ${room.code}: ${killer.team === 0 ? 'T' : 'CT'} won ${room.score[0]}-${room.score[1]}`,
      );
    }
  }
}

function ggKill(room, player, weapon) {
  const level = player.ggLevel || 0;
  if (level >= GUNGAME.length - 1) {
    room.winner = 0;
    room.winnerId = player.id;
    room.winnerName = player.name;
    room.nextMatchAt = now() + WIN_PAUSE_MS;
    broadcast(room, { t: 'win', ffa: 1, id: player.id, name: player.name });
    console.log(`* ${room.code}: ${player.name} won Gun Game`);
    return;
  }
  player.ggKills = (player.ggKills || 0) + 1;
  if (player.ggKills < GG_KILLS) {
    return send(player, { t: 'gg', gl: level, gk: player.ggKills });
  }
  player.ggLevel = level + 1;
  player.ggKills = 0;
  player.slots = ggSlots(player.ggLevel);
  player.weapon = player.slots[0];
  const currentWeapon = WEAPONS[player.weapon];
  player.ammo[player.weapon] = { mag: currentWeapon.mag, reserve: currentWeapon.reserve };
  player.reloading = false;
  player.spinAt = 0;
  player.readyAt = now() + currentWeapon.drawTime * 1000 - 150;
  send(player, { t: 'gg', gl: player.ggLevel, gk: 0, sl: player.slots, up: 1 });
}

function ggKnifed(room, player) {
  const level = player.ggLevel || 0;
  if ((player.ggKills || 0) > 0) {
    player.ggKills--;
  } else if (level > 0) {
    player.ggLevel = level - 1;
    player.ggKills = GG_KILLS - 1;
  } else {
    return;
  }
  send(player, { t: 'gg', gl: player.ggLevel, gk: player.ggKills, dn: 1 });
}

function resetMatch(room) {
  room.nades = [];
  room.smokes = [];
  room.score = [0, 0];
  room.winner = -1;
  resetDoors(room);
  broadcast(room, { t: 'doors', broken: [] });
  room.winnerId = null;
  const toLobby = hasLobby(room) && (isComp(room) || !!room.lobby);
  for (const player of room.players.values()) {
    player.kills = 0;
    player.deaths = 0;
    player.ggLevel = 0;
    player.ggKills = 0;
    if (!isComp(room) && !toLobby) {
      spawn(room, player);
    }
  }
  if (toLobby) {
    room.lobby = true;
    room.comp = null;
    for (const player of room.players.values()) {
      player.alive = false;
      player.respawnAt = Infinity;
    }
    broadcast(room, { t: 'room', ...roomInfo(room) });
  } else if (isComp(room)) {
    resetComp(room);
  }
}

function handleNade(room, player, message, currentTime) {
  const weapon = WEAPONS[player.weapon];
  if (
    !player.alive ||
    !weapon?.grenade ||
    message.w !== player.weapon ||
    currentTime < player.readyAt
  ) {
    return;
  }
  if (isComp(room) && room.comp?.phase === 'freeze') {
    return;
  }
  const ammo = player.ammo[player.weapon];
  if (!ammo || ammo.mag <= 0) {
    return;
  }
  if (!isVec3(message.d)) {
    return;
  }
  const length = Math.hypot(message.d[0], message.d[1], message.d[2]);
  if (length < 0.5 || length > 1.5) {
    return;
  }
  const direction = message.d.map((value) => value / length);
  const eye = [
    player.pos[0],
    player.pos[1] + (player.crouch ? PLAYER.crouchEye : PLAYER.eye),
    player.pos[2],
  ];
  const origin = isVec3(message.o) && dist3(message.o, eye) < 1 ? message.o : eye;
  ammo.mag--;
  player.readyAt = currentTime + 400;
  const id = ++room.nadeId;
  room.nades.push({
    id,
    owner: player.id,
    w: player.weapon,
    kind: weapon.grenade,
    n: nadeStart(origin, direction, !!message.lob),
    t0: currentTime,
    acc: 0,
  });
  broadcast(room, {
    t: 'nade',
    id,
    i: player.id,
    w: player.weapon,
    o: origin.map(roundToFourDecimals),
    d: direction.map(roundToFourDecimals),
    lob: message.lob ? 1 : 0,
  });
}

function explodeHe(room, grenade) {
  const position = grenade.n;
  const at = [position.x, position.y + 0.25, position.z];
  broadcast(room, {
    t: 'he',
    id: grenade.id,
    p: [
      roundToTwoDecimals(position.x),
      roundToTwoDecimals(position.y),
      roundToTwoDecimals(position.z),
    ],
  });
  const owner = room.players.get(grenade.owner);
  const currentTime = now();
  for (const other of room.players.values()) {
    if (!other.alive || currentTime < other.protectedUntil) {
      continue;
    }
    if (owner && other !== owner && !enemies(room, owner, other)) {
      continue;
    }
    const chest = [other.pos[0], other.pos[1] + 1.0, other.pos[2]];
    const distanceToBlast = dist3(at, chest);
    if (distanceToBlast > NADE.heRadius) {
      continue;
    }
    if (distanceToBlast > 0.3) {
      const direction = [
        (chest[0] - at[0]) / distanceToBlast,
        (chest[1] - at[1]) / distanceToBlast,
        (chest[2] - at[2]) / distanceToBlast,
      ];
      if (raycastWorld(at, direction, distanceToBlast - 0.2, room.solids)) {
        continue;
      }
    }
    const damage = absorbArmor(
      other,
      Math.round(NADE.heDmg * (1 - distanceToBlast / NADE.heRadius)),
    );
    if (damage <= 0) {
      continue;
    }
    other.hp -= damage;
    send(other, {
      t: 'hurt',
      d: damage,
      o: at.map(roundToTwoDecimals),
      hp: Math.max(0, other.hp),
      part: 'body',
    });
    if (owner && owner !== other) {
      send(owner, {
        t: 'hit',
        v: other.id,
        d: damage,
        pt: 'body',
        hp: Math.max(0, other.hp),
        pos: chest.map(roundToTwoDecimals),
        kill: other.hp <= 0,
      });
    }
    if (other.hp <= 0) {
      killPlayer(room, owner || other, other, WEAPONS[grenade.w], false);
    }
  }
  for (const door of room.map.doors) {
    const center = [
      (door.min[0] + door.max[0]) / 2,
      (door.min[1] + door.max[1]) / 2,
      (door.min[2] + door.max[2]) / 2,
    ];
    if (dist3(center, at) < 4) {
      damageDoor(room, door.door, 150);
    }
  }
}

function tickNades(room, currentTime) {
  if (room.smokes.length) {
    room.smokes = room.smokes.filter((smoke) => smoke.until > currentTime);
  }
  if (!room.nades.length) {
    return;
  }
  room.nades = room.nades.filter((grenade) => {
    grenade.acc += TICK_MS;
    while (grenade.acc >= NADE.dt * 1000) {
      stepNade(grenade.n, room.solids);
      grenade.acc -= NADE.dt * 1000;
    }
    if (grenade.kind === 'he' && currentTime - grenade.t0 >= NADE.heFuseMs) {
      explodeHe(room, grenade);
      return false;
    }
    if (
      grenade.kind === 'smoke' &&
      (grenade.n.rest || currentTime - grenade.t0 >= NADE.smokeMaxMs)
    ) {
      const player = [
        roundToTwoDecimals(grenade.n.x),
        roundToTwoDecimals(grenade.n.y),
        roundToTwoDecimals(grenade.n.z),
      ];
      room.smokes.push({ p: player, until: currentTime + NADE.smokeMs });
      broadcast(room, { t: 'smoke', id: grenade.id, p: player });
      return false;
    }
    return true;
  });
}

function traceRay(room, player, weapon, origin, direction, rewindTime, currentTime) {
  const reach = weapon.melee ? weapon.reach : MAX_RANGE;
  const trace = traceShot(
    origin,
    direction,
    reach,
    room.solids,
    weapon.melee ? 0 : weapon.wallPen || 0,
  );
  for (const history of trace.touched) {
    if (history.box.mat === 'door') {
      damageDoor(room, history.box.door, weapon.dmg * (weapon.melee ? 1.5 : 1));
    }
  }
  const world = trace.normal ? trace : null;
  const maxT = trace.t;

  const hits = [];
  for (const other of room.players.values()) {
    if (!other.alive || !enemies(room, player, other) || currentTime < other.protectedUntil) {
      continue;
    }
    const sample = sampleHistory(other, rewindTime);
    let near = null;
    for (const hitbox of playerHitboxes(sample.pos, sample.crouch)) {
      const hit = rayAABB(origin, direction, hitbox.min, hitbox.max, near ? near.t : maxT);
      if (hit && (!near || hit.t < near.t)) {
        near = { t: hit.t, q: other, part: hitbox.part };
      }
    }
    if (near) {
      hits.push(near);
    }
  }
  hits.sort((left, right) => left.t - right.t);
  const victims = hits.slice(0, 1 + (weapon.pierce || 0));
  const stopped = victims.length && victims.length === 1 + (weapon.pierce || 0);
  const last = victims[victims.length - 1];

  let end;
  let kind = '-';
  let normal = null;
  if (last && (stopped || !world)) {
    end = [
      origin[0] + direction[0] * last.t,
      origin[1] + direction[1] * last.t,
      origin[2] + direction[2] * last.t,
    ];
    kind = 'p';
  } else if (world) {
    end = world.point;
    normal = world.normal;
    kind = 'w';
  } else {
    const maxDistance = weapon.melee ? reach : 150;
    end = [
      origin[0] + direction[0] * maxDistance,
      origin[1] + direction[1] * maxDistance,
      origin[2] + direction[2] * maxDistance,
    ];
  }
  const holes = trace.holes
    .filter((history) => dist3(history.point, origin) < dist3(end, origin) + 0.01)
    .map((history) => [...history.point.map(roundToTwoDecimals), ...history.normal]);

  const dmgs = [];
  let mult = 1;
  for (const hit of victims) {
    const falloff = Math.pow(weapon.range, hit.t / 12.7);
    const armor = hit.part === 'legs' ? 1 : (weapon.armorPen ?? 1);
    const damage =
      weapon.dmg *
      (weapon.partMult || PART_MULT)[hit.part] *
      falloff *
      mult *
      trace.multAt(hit.t) *
      armor;
    dmgs.push({
      q: hit.q,
      dmg: damage,
      part: hit.part,
      at: [
        origin[0] + direction[0] * hit.t,
        origin[1] + direction[1] * hit.t,
        origin[2] + direction[2] * hit.t,
      ],
    });
    mult *= weapon.pierceMult ?? 0.5;
  }
  return { end, kind, normal, holes, dmgs };
}

const PART_RANK = { head: 3, body: 2, legs: 1 };

function handleShoot(room, player, message, currentTime) {
  if (!player.alive || room.winner >= 0) {
    return false;
  }
  const weapon = WEAPONS[player.weapon];
  if (!weapon || message.w !== player.weapon || weapon.bomb || weapon.grenade) {
    return false;
  }
  if (isComp(room) && room.comp.phase === 'freeze') {
    return false;
  }
  if (currentTime < player.readyAt || player.reloading) {
    return false;
  }
  if (
    weapon.spinUp &&
    (!player.spinAt || currentTime - player.spinAt < weapon.spinUp * 1000 - 80)
  ) {
    return false;
  }
  if (currentTime < player.nextFire - 40) {
    return false;
  }
  const ammo = player.ammo[player.weapon];
  if (!weapon.melee) {
    if (ammo.mag <= 0) {
      return false;
    }
    ammo.mag--;
  }
  const heavy = !!weapon.melee && !!message.hy;
  player.lastShotAt = currentTime;
  player.lastShotQuiet = !!weapon.silenced || !!weapon.melee;
  player.nextFire =
    Math.max(player.nextFire, currentTime - 40) +
    (message.fn && weapon.fanInterval ? weapon.fanInterval : weapon.interval) *
      1000 *
      (heavy ? 2.2 : 1);

  const eye = [
    player.pos[0],
    player.pos[1] + (player.crouch ? PLAYER.crouchEye : PLAYER.eye),
    player.pos[2],
  ];
  const origin = isVec3(message.o) && dist3(message.o, eye) < 1 ? message.o : eye;
  if (!isVec3(message.d)) {
    return false;
  }
  const length = Math.hypot(message.d[0], message.d[1], message.d[2]);
  if (length < 0.5 || length > 1.5) {
    return false;
  }
  const direction = [message.d[0] / length, message.d[1] / length, message.d[2] / length];

  const rewindTime = Math.min(
    currentTime,
    Math.max(currentTime - MAX_REWIND_MS, isNum(message.rt) ? message.rt : currentTime),
  );

  const seed = Number.isInteger(message.sd) ? message.sd : Math.floor(Math.random() * 2 ** 31);
  const directions = weapon.pellets
    ? pelletDirs(direction, seed, weapon.pellets, weapon.pelletSpread)
    : [direction];
  const rays = directions.map((distanceToBlast) =>
    traceRay(room, player, weapon, origin, distanceToBlast, rewindTime, currentTime),
  );

  const first = rays[0];
  const holes = rays.flatMap((hit) => hit.holes);
  const packet = {
    t: 'shot',
    i: player.id,
    o: origin.map(roundToTwoDecimals),
    e: first.end.map(roundToTwoDecimals),
    n: first.normal,
    k: first.kind,
    w: player.weapon,
    ...(holes.length ? { hl: holes } : null),
    ...(heavy ? { hy: 1 } : null),
  };
  if (rays.length > 1) {
    packet.pe = rays
      .slice(1)
      .map((hit) => [
        ...hit.end.map(roundToTwoDecimals),
        hit.kind === 'p' ? 1 : hit.kind === 'w' ? 2 : 0,
        ...(hit.normal || [0, 1, 0]),
      ]);
  }

  const total = new Map();
  for (const hit of rays) {
    for (const history of hit.dmgs) {
      const current = total.get(history.q);
      if (!current) {
        total.set(history.q, { dmg: history.dmg, part: history.part, at: history.at });
      } else {
        current.dmg += history.dmg;
        if (PART_RANK[history.part] > PART_RANK[current.part]) {
          current.part = history.part;
        }
      }
    }
  }
  if (heavy) {
    for (const [other, history] of total) {
      const behind =
        -Math.sin(other.yaw) * direction[0] + -Math.cos(other.yaw) * direction[2] > 0.5;
      history.dmg *= behind ? 4 : 1.8;
    }
  }
  const points = rays.flatMap((hit) =>
    hit.dmgs.map((history) => [
      history.q.id,
      ...history.at.map(roundToTwoDecimals),
      history.part === 'head' ? 1 : 0,
    ]),
  );
  if (points.length) {
    packet.hv = points;
  }
  broadcast(room, packet, player);

  for (const [other, history] of total) {
    if (!other.alive) {
      continue;
    }
    const full = other.hp >= MAX_HP;
    const damage = absorbArmor(other, Math.max(1, Math.round(history.dmg)));
    other.hp -= damage;
    other.lastHurtBy = player.id;
    const dead = other.hp <= 0;
    const mine = points
      .filter((positionX) => positionX[0] === other.id)
      .map((positionX) => positionX.slice(1));
    send(player, {
      t: 'hit',
      v: other.id,
      d: damage,
      pt: history.part,
      hp: Math.max(0, other.hp),
      pos: history.at.map(roundToTwoDecimals),
      pts: mine,
      kill: dead,
    });
    send(other, {
      t: 'hurt',
      d: damage,
      o: origin.map(roundToTwoDecimals),
      hp: Math.max(0, other.hp),
      part: history.part,
    });
    if (other.isBot && !dead) {
      other.alertPos = [player.pos[0], player.pos[2]];
      other.alertAt = currentTime;
      other.alertBy = player;
    }
    if (dead) {
      killPlayer(
        room,
        player,
        other,
        weapon,
        history.part === 'head',
        full && !weapon.melee && history.part !== 'legs',
        weapon.class === 'sniper' && !message.sc,
      );
    }
  }
  return true;
}

function parseLoadout(loadout) {
  const origin = loadout && typeof loadout === 'object' ? loadout : {};
  const id = (value) => (typeof value === 'string' ? value.slice(0, 20) : '');
  return {
    primary: id(origin.primary),
    secondary: id(origin.secondary),
    melee: id(origin.melee),
    grenade: id(origin.grenade),
    vest: !!origin.vest,
  };
}

function addBot(room, team = null) {
  const nBots = [...room.players.values()].filter((other) => other.isBot).length;
  if (room.players.size >= MAX_PLAYERS || nBots >= MAX_BOTS) {
    return false;
  }
  const bot = makeBot(nextId++, ++room.botN, room.skill);
  bot.team = team === 0 || team === 1 ? team : pickTeam(room);
  bot.loadout = randomLoadout(bot.team);
  bot.room = room;
  room.players.set(bot.id, bot);
  spawnOrWait(room, bot);
  return true;
}

function removeBot(room, preferTeam = null) {
  const bots = [...room.players.values()].filter((other) => other.isBot);
  if (!bots.length) {
    return false;
  }
  const pick =
    bots.filter((bot) => preferTeam === null || bot.team === preferTeam).pop() || bots.pop();
  room.players.delete(pick.id);
  return true;
}

function joinRoom(player, room, message) {
  if (isMilsim(room)) {
    return milsimModule.milJoin(room, player, message);
  }
  if (isWarfare(room)) {
    return warfareModule.milJoin(room, player, message);
  }
  if (room.players.size >= MAX_PLAYERS) {
    let terroristCount = 0;
    let counterTerroristCount = 0;
    for (const other of room.players.values()) {
      other.team === 0 ? terroristCount++ : counterTerroristCount++;
    }
    if (!removeBot(room, terroristCount >= counterTerroristCount ? 0 : 1)) {
      send(player, { t: 'error', m: 'Room is full.' });
      return;
    }
  }
  player.name =
    String(message.name || 'Player')
      .replace(/[^\p{L}\p{N} _.-]/gu, '')
      .slice(0, 16) || 'Player';
  player.loadout = parseLoadout(message.lo);
  player.lk = encodeLook(sanitizeLook(message.look));
  player.skins = sanitizeSkins(message.skins, WEAPON_IDS);
  player.kills = 0;
  player.deaths = 0;
  player.team = message.team === 0 || message.team === 1 ? message.team : pickTeam(room);
  player.room = room;
  balanceBots(room, player.team);
  room.players.set(player.id, player);
  send(player, {
    t: 'welcome',
    id: player.id,
    team: player.team,
    time: now(),
    tick: TICK_RATE,
    room: roomInfo(room),
  });
  spawnOrWait(room, player);
  if (isComp(room) && room.comp) {
    setMoney(player, player.money ?? ECON.start);
  }
  console.log(
    `+ ${player.name} (#${player.id}) joined ${room.code} as ${player.team === 0 ? 'T' : 'CT'} — ${humans(room).length} players`,
  );
}

function balanceBots(room, team) {
  let mine = 0;
  let other = 0;
  for (const currentOther of room.players.values()) {
    currentOther.team === team ? mine++ : other++;
  }
  if (mine + 1 <= other + 1) {
    return;
  }
  const bot = [...room.players.values()].find((other) => other.isBot && other.team === team);
  if (!bot) {
    return;
  }
  bot.team = 1 - team;
  bot.loadout = randomLoadout(bot.team);
  spawnOrWait(room, bot);
}

function closeRoom(room, packet) {
  rooms.delete(room.code);
  for (const other of room.players.values()) {
    if (other.isBot) {
      continue;
    }
    other.room = null;
    send(other, { t: 'closed', m: packet });
  }
  room.players.clear();
  console.log(`x room ${room.code} closed`);
}

function leaveRoom(player) {
  const room = player.room;
  if (!room) {
    return;
  }
  if (isComp(room) && room.comp) {
    onLeave(room, player);
  }
  if (isMilsim(room)) {
    milsimModule.milLeave(room, player);
  }
  if (isWarfare(room)) {
    warfareModule.milLeave(room, player);
  }
  room.players.delete(player.id);
  player.room = null;
  console.log(`- ${player.name} (#${player.id}) left ${room.code}`);
  if (room.hostId === player.id) {
    closeRoom(room, 'The host left, so the room was closed.');
  } else if (!humans(room).length) {
    closeRoom(room, '');
  }
}

function handleJoin(player, message) {
  if (player.room || player.joining) {
    return;
  }
  if (message.mode === 'code') {
    const code = String(message.code || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const room = rooms.get(code);
    if (!room || room.solo) {
      return send(player, {
        t: 'error',
        m: `Room "${code}" not found. Check the code with the host.`,
      });
    }
    const kind = gameKind(room);
    if (
      kind !== (message.game === 'milsim' || message.game === 'warfare' ? message.game : 'tactical')
    ) {
      return send(player, {
        t: 'error',
        m: `Room "${code}" is a ${KIND_NAMES[kind]} room: switch the game type to ${KIND_NAMES[kind]} to join.`,
      });
    }
    return joinRoom(player, room, message);
  }
  if (rooms.size >= MAX_ROOMS) {
    return send(player, { t: 'error', m: 'Too many rooms on this server. Try again later.' });
  }
  if (message.game === 'milsim') {
    player.joining = true;
    loadMilsim().then((mod) => {
      player.joining = false;
      if (player.room || player.ws.readyState !== 1) {
        return;
      }
      const room = createRoom({
        hostId: player.id,
        solo: message.mode !== 'host',
        code: message.code,
      });
      room.game = 'milsim';
      if (BOT_SKILLS[message.skill]) {
        room.skill = message.skill;
      }
      mod.setupMilRoom(room, { tod: message.tod, map: message.map });
      mod.milJoin(room, player, message);
      const milsimBots = Math.max(0, Math.min(MIL.maxBots, Math.floor(Number(message.bots) || 0)));
      for (let index = 0; index < milsimBots; index++) {
        mod.milAddBot(room);
      }
    });
    return;
  }
  if (message.game === 'warfare') {
    player.joining = true;
    loadWarfare().then((mod) => {
      player.joining = false;
      if (player.room || player.ws.readyState !== 1) {
        return;
      }
      const room = createRoom({
        hostId: player.id,
        solo: message.mode !== 'host',
        code: message.code,
      });
      room.game = 'warfare';
      if (BOT_SKILLS[message.skill]) {
        room.skill = message.skill;
      }
      mod.setupMilRoom(room, { tod: message.tod, map: message.map });
      mod.milJoin(room, player, message);
      const warfareBots = Math.max(
        0,
        Math.min(WMIL.maxBots, Math.floor(Number(message.bots) || 0)),
      );
      for (let index = 0; index < warfareBots; index++) {
        mod.milAddBot(room);
      }
    });
    return;
  }
  const room = createRoom({ hostId: player.id, solo: message.mode !== 'host', code: message.code });
  if (GAME_MODES.includes(message.game)) {
    room.game = message.game;
  }
  if (BOT_SKILLS[message.skill]) {
    room.skill = message.skill;
  }
  if (MAPS.some((positionX) => positionX.id === message.map)) {
    room.map = getMap(message.map);
    resetDoors(room);
  }
  if (isComp(room)) {
    if (!room.map.sites) {
      room.map = MAPS.find((positionX) => positionX.sites);
      resetDoors(room);
    }
    room.lobby = !room.solo;
    room.comp = room.lobby ? null : newCompState();
  } else if (hasLobby(room)) {
    room.lobby = true;
  }
  joinRoom(player, room, message);
  const botCount = Math.max(0, Math.min(MAX_BOTS, Math.floor(Number(message.bots) || 0)));
  for (let index = 0; index < botCount; index++) {
    addBot(room);
  }
}

function startFromLobby(room) {
  room.lobby = false;
  room.score = [0, 0];
  room.winner = -1;
  room.winnerId = null;
  for (const other of room.players.values()) {
    other.kills = 0;
    other.deaths = 0;
    other.money = null;
  }
  if (isComp(room)) {
    room.comp = newCompState();
  } else {
    for (const other of room.players.values()) {
      other.respawnAt = 0;
    }
  }
  console.log(`~ ${room.code}: match started from the lobby`);
}

function switchTeam(room, player, team) {
  if (!room.lobby || (team !== 0 && team !== 1) || player.team === team) {
    return;
  }
  player.team = team;
  player.loadout = player.isBot ? randomLoadout(team) : player.loadout;
  send(player, { t: 'team', team });
  broadcast(room, { t: 'room', ...roomInfo(room) });
}

function handleHost(player, message) {
  const room = player.room;
  if (!room || room.hostId !== player.id) {
    return;
  }
  if (isMilsim(room) && message.t !== 'kick') {
    milsimModule.milHost(room, player, message);
    broadcast(room, { t: 'room', ...roomInfo(room) });
    return;
  }
  if (isWarfare(room) && message.t !== 'kick') {
    warfareModule.milHost(room, player, message);
    broadcast(room, { t: 'room', ...roomInfo(room) });
    return;
  }
  if (message.t === 'start') {
    if (!room.lobby) {
      return;
    }
    startFromLobby(room);
  } else if (message.t === 'bot') {
    if (message.op === 'add') {
      addBot(room, message.team);
    } else if (message.op === 'remove') {
      removeBot(room);
    } else if (message.op === 'skill' && BOT_SKILLS[message.skill]) {
      room.skill = message.skill;
      for (const other of room.players.values()) {
        if (other.isBot) {
          other.skill = message.skill;
        }
      }
    }
  } else if (
    message.t === 'map' &&
    MAPS.some((positionX) => positionX.id === message.map && (!isComp(room) || positionX.sites)) &&
    message.map !== room.map.id
  ) {
    room.map = getMap(message.map);
    resetMatch(room);
    console.log(`~ ${room.code}: map -> ${room.map.name}`);
  } else if (message.t === 'kick') {
    const other = room.players.get(message.id);
    if (!other || other === player) {
      return;
    }
    if (other.isBot) {
      room.players.delete(other.id);
    } else {
      leaveRoom(other);
      send(other, { t: 'closed', m: 'You were kicked by the host.' });
    }
  }
  broadcast(room, { t: 'room', ...roomInfo(room) });
}

function handleMessage(player, message) {
  const currentTime = now();
  if (message.t === 'ping') {
    return send(player, { t: 'pong', c: message.c, s: currentTime });
  }
  if (message.t === 'join') {
    return handleJoin(player, message);
  }
  const room = player.room;
  if (!room) {
    return;
  }
  if (isMilsim(room) && !['chat', 'leave', 'kick', 'bot', 'map'].includes(message.t)) {
    return milsimModule.milMessage(room, player, message, currentTime);
  }
  if (isWarfare(room) && !['chat', 'leave', 'kick', 'bot', 'map'].includes(message.t)) {
    return warfareModule.milMessage(room, player, message, currentTime);
  }
  if (
    room.lobby &&
    !['chat', 'leave', 'kick', 'bot', 'map', 'start', 'team', 'skins'].includes(message.t)
  ) {
    return;
  }
  if (message.t === 'team') {
    return switchTeam(room, player, message.team);
  }

  switch (message.t) {
    case 'in': {
      if (!player.alive || message.sp !== player.spawnCount || !Array.isArray(message.c)) {
        return;
      }
      player.cmdBudget = Math.min(
        CMD_BURST,
        player.cmdBudget + ((currentTime - player.budgetAt) / 1000) * CMD_RATE,
      );
      player.budgetAt = currentTime;
      const weapon = WEAPONS[player.weapon];
      for (const command of message.c.slice(0, CMD_BURST)) {
        if (
          !Array.isArray(command) ||
          command.length < 10 ||
          !Number.isInteger(command[0]) ||
          command[0] <= player.lastSeq
        ) {
          continue;
        }
        if (player.cmdBudget < 1) {
          break;
        }
        if (!isNum(command[7]) || !isNum(command[8])) {
          continue;
        }
        player.cmdBudget -= 1;
        const scoped = !!command[9];
        const stop = frozen(room, player);
        stepPlayer(
          player.ms,
          {
            fwd: stop ? 0 : axis(command[1]),
            right: stop ? 0 : axis(command[2]),
            jump: !stop && !!command[3],
            jumpPress: !stop && !!command[4],
            walk: !!command[5],
            crouch: !!command[6] || !!player.planting || !!player.defusing,
            yaw: command[7],
            speedMult: weapon.moveMult * (weapon.scope && scoped ? weapon.scopedMove : 1),
          },
          MOVE_DT,
          solidsFor(room, player),
        );
        player.lastSeq = command[0];
        player.yaw = command[7];
        player.pitch = Math.max(-1.6, Math.min(1.6, command[8]));
        player.aiming = scoped;
      }
      player.pos = [player.ms.x, player.ms.y, player.ms.z];
      player.crouch = player.ms.crouch;
      return;
    }
    case 'tp':
      if (!TEST_SPAWNS || !player.alive || !isVec3(message.p)) {
        return;
      }
      player.pos = message.p;
      Object.assign(player.ms, {
        x: message.p[0],
        y: message.p[1],
        z: message.p[2],
        vx: 0,
        vy: 0,
        vz: 0,
      });
      player.yaw = isNum(message.y) ? message.y : player.yaw;
      player.crouch = !!message.c;
      return;
    case 'shoot':
      handleShoot(room, player, message, currentTime);
      return;
    case 'nade':
      handleNade(room, player, message, currentTime);
      return;
    case 'chat': {
      const text = String(message.m ?? '')
        .replace(/\p{Cc}/gu, '')
        .trim()
        .slice(0, 120);
      if (!text || currentTime - (player.lastChat || 0) < 600) {
        return;
      }
      player.lastChat = currentTime;
      broadcast(room, { t: 'chat', i: player.id, n: player.name, tm: player.team, m: text });
      console.log(`[${room.code}] ${player.name}: ${text}`);
      return;
    }
    case 'spin':
      player.spinAt = message.on ? currentTime : 0;
      return;
    case 'reload':
      return startReload(player, currentTime);
    case 'loadout':
      player.loadout = parseLoadout(message.lo);
      return;
    case 'skins':
      player.skins = sanitizeSkins(message.s, WEAPON_IDS);
      return;
    case 'switch': {
      const weapon = WEAPONS[message.w];
      if (
        !weapon ||
        !player.alive ||
        message.w === player.weapon ||
        !Number.isInteger(message.w) ||
        !player.slots.includes(message.w)
      ) {
        return;
      }
      player.weapon = message.w;
      player.reloading = false;
      player.readyAt = currentTime + weapon.drawTime * 1000 - 150;
      return;
    }
    case 'plant':
      if (isComp(room)) {
        setPlanting(room, player, !!message.on);
      }
      return;
    case 'defuse':
      if (isComp(room)) {
        setDefusing(room, player, !!message.on);
      }
      return;
    case 'drop':
      if (isComp(room) && player.alive && room.comp.phase !== 'post') {
        dropBomb(room, player, true);
      }
      return;
    case 'dropw':
      if (isComp(room)) {
        dropHeld(room, player);
      }
      return;
    case 'pick':
      if (isComp(room) && Number.isInteger(message.id)) {
        pickDrop(room, player, message.id);
      }
      return;
    case 'buy':
      if (isComp(room) && typeof message.w === 'string') {
        buy(room, player, message.w, currentTime);
      } else if (room.game === 'tdm' && typeof message.w === 'string') {
        freeBuy(room, player, message.w);
      }
      return;
    case 'leave':
      return leaveRoom(player);
    case 'bot':
    case 'map':
    case 'kick':
    case 'start':
      return handleHost(player, message);
    default:
  }
}

export function attach(socket) {
  const player = newPlayer(socket);
  socket.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (message && typeof message === 'object') {
      handleMessage(player, message);
    }
  });
  socket.on('close', () => leaveRoom(player));
  socket.on('error', () => {});
}

export function setPublicUrl(url) {
  publicUrl = url;
  for (const room of rooms.values()) {
    broadcast(room, { t: 'room', ...roomInfo(room) });
  }
}

function solidsFor(room, player) {
  const bodies = [];
  for (const other of room.players.values()) {
    if (other !== player && other.alive && other.ms) {
      bodies.push(other.ms);
    }
  }
  return solidsWithBodies(room.solids, player.ms, bodies);
}

const botApi = {
  solidsFor,
  shoot: handleShoot,
  reload: startReload,
  hitDoor: damageDoor,
  plant: setPlanting,
  defuse: setDefusing,
  drop: (room, bomb) => dropBomb(room, bomb, true),
};
initComp({ broadcast, send, spawn, killPlayer, resetDoors, randomLoadout, now, WIN_PAUSE_MS });
initEcon({ broadcast, send, now });

setInterval(() => {
  const currentTime = now();
  for (const room of rooms.values()) {
    if (!room.players.size) {
      continue;
    }
    if (isMilsim(room)) {
      milsimModule.milTick(room, currentTime);
      continue;
    }
    if (isWarfare(room)) {
      warfareModule.milTick(room, currentTime);
      continue;
    }
    tickNades(room, currentTime);
    if (isComp(room) && room.comp) {
      tickComp(room, currentTime);
    }
    const list = [];
    for (const player of room.players.values()) {
      if (player.alive) {
        if (player.isBot) {
          updateBot(room, player, currentTime, TICK_MS / 1000, botApi);
        }
        player.history.push({
          t: currentTime,
          pos: [player.pos[0], player.pos[1], player.pos[2]],
          crouch: player.crouch,
        });
        while (player.history.length && currentTime - player.history[0].t > 1000) {
          player.history.shift();
        }
        if (player.reloading && currentTime >= player.reloadEnd) {
          finishReload(player);
        }
      } else if (!isComp(room) && currentTime >= player.respawnAt && room.winner < 0) {
        spawn(room, player);
      }
      list.push({
        i: player.id,
        n: player.name,
        tm: player.team,
        p: player.pos.map(roundToTwoDecimals),
        y: Math.round((player.yaw + (player.recoil?.[1] || 0)) * 1000) / 1000,
        pt: Math.round((player.pitch + (player.recoil?.[0] || 0)) * 1000) / 1000,
        c: player.crouch ? 1 : 0,
        ad: player.alive && player.aiming ? 1 : 0,
        hp: player.hp,
        a: player.alive ? 1 : 0,
        w: player.weapon,
        k: player.kills,
        d: player.deaths,
        s: player.spawnCount,
        lk: player.lk,
        ...(player.isBot ? { b: 1 } : null),
        ...(ffa(room) ? { gl: player.ggLevel || 0 } : null),
        ...(player.alive && player.reloading ? { rl: 1 } : null),
        ...(player.alive && (player.planting || player.defusing) ? { pl: 1 } : null),
        ...(skinOf(player, player.weapon) !== 'default'
          ? { sk: skinIndex(skinOf(player, player.weapon)) }
          : null),
        ...(player.armor > 0 ? { ar: 1 } : null),
      });
    }
    if (room.winner >= 0 && currentTime >= room.nextMatchAt) {
      resetMatch(room);
    }
    const end =
      room.winner >= 0
        ? {
            win: room.winner,
            ne: Math.max(0, Math.round(room.nextMatchAt - currentTime)),
            ...(room.winnerId ? { wid: room.winnerId, wn: room.winnerName } : null),
          }
        : null;
    broadcast(room, {
      t: 'snap',
      time: currentTime,
      players: list,
      sc: room.score,
      goal: WIN_KILLS,
      ...(ffa(room) ? { gm: 'gungame' } : null),
      ...(isComp(room) && room.comp ? { gm: 'comp', cp: compSnap(room, currentTime) } : null),
      ...end,
    });
    for (const player of room.players.values()) {
      if (player.isBot || !player.alive) {
        continue;
      }
      const elapsed = player.ms;
      send(player, {
        t: 'ack',
        sp: player.spawnCount,
        s: player.lastSeq,
        ms: [
          roundToFourDecimals(elapsed.x),
          roundToFourDecimals(elapsed.y),
          roundToFourDecimals(elapsed.z),
          roundToFourDecimals(elapsed.vx),
          roundToFourDecimals(elapsed.vy),
          roundToFourDecimals(elapsed.vz),
          elapsed.onGround ? 1 : 0,
          elapsed.crouch ? 1 : 0,
          elapsed.jumpHeld ? 1 : 0,
          roundToFourDecimals(elapsed.jumpBuf),
          roundToFourDecimals(elapsed.groundTime),
        ],
      });
    }
  }
}, TICK_MS);
