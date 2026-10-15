import { MIL_MAPS, mapId, canCapture } from '../../shared/milsim/maps.js';
import { TICK_MS, PLAYER } from '../../shared/constants.js';
import { pelletDirs } from '../../shared/pellets.js';
import { encodeLook, sanitizeLook } from '../../shared/look.js';
import {
  MIL,
  RANKS,
  rankOf,
  VEH_RANK,
  XP,
  STRUCTS,
  VEHICLES,
  VEH_CATS,
  SEATS,
  REAR,
  MORTAR,
  HE_MIL,
  ROCKET,
  milClass,
  PART_MULT_MIL,
  sanitizeKit,
  defaultKit,
  kitCost,
  kitWeight,
  vestOf,
  helmetOf,
  encodeGear,
  CLASSES,
  ITEMS,
  capacityOf,
  hasDoor,
  seatExposed,
  isGunner,
  VEH_GUNS,
  platformVelocity,
  SHELLS,
  FLEET,
  VEH_RESPAWN,
  buildTimeOf,
  SQUADS,
  SQUAD_SIZE,
  VOICE_RANGE,
  MARKER_TYPES,
} from '../../shared/milsim/config.js';
import { MW, mwIndex, caliberOf, AMMO, isSilenced } from '../../shared/milsim/weapons.js';
import {
  CAPTURE_CHAIN,
  MAIN_BASES,
  SECTORS,
  SUPPLY_POINTS,
  heightAt,
  waterDepth,
  inBounds,
  roadDistanceAt,
} from '../../shared/milsim/terrain.js';
import {
  selectMilMap,
  MAPDATA,
  createWorld,
  addStructure,
  removeStructure,
  structureFootprint,
  structureBlocked,
  mountSpot,
  rayWorld,
  clearLineMil,
  setDoor,
  doorById,
} from '../../shared/milsim/world.js';
import {
  createMilMoveState,
  stepMil,
  restSeated,
  milSpeedMult,
} from '../../shared/milsim/movement.js';
import {
  createVehicle,
  vehicleAABB,
  vehicleParts,
  seatWorld,
  vehicleToWorld,
  rayVehicle,
  stepCar,
  stepHeli,
  stepWreck,
  groundFor,
} from '../../shared/milsim/vehicle.js';
import {
  stepBullet,
  BULLET_DT,
  milHitboxes,
  nadeStartMil,
  stepNadeMil,
  NADE_MIL,
  ricochet,
} from '../../shared/milsim/ballistics.js';
import { rayAABB } from '../../shared/raycast.js';
import { makeMilBot, updateMilBot, milBotKit, pickBotRoles, botHurt } from './bots.js';
import { hearShot } from './botsense.js';
import { noticeShot, noticeDamage } from './botbrain.js';
import { createPerf, perfBegin, perfMark, perfEnd } from './perf.js';
import { playerRow, sendSnapshots } from './netsync.js';

let api = null;
let sendRaw = (player, text) => {
  api.send(player, JSON.parse(text));
  return text.length;
};
export function initMilsim(area) {
  api = { ...area };
  if (!area.sendRaw) {
    return;
  }
  const count = (player, count) => {
    const perf = player.room?.mil?.perf;
    if (perf) {
      perf.bytes += count;
      perf.msgs++;
    }
  };
  sendRaw = (player, text, droppable = false) => {
    if (!player.ws || player.ws.readyState !== 1) {
      return 0;
    }
    if (droppable && player.ws.bufferedAmount > 262144) {
      return 0;
    }
    area.sendRaw(player, text);
    count(player, text.length);
    return text.length;
  };
  api.send = (player, object) => {
    if (!player.ws || player.ws.readyState !== 1) {
      return;
    }
    const structure = JSON.stringify(object);
    area.sendRaw(player, structure);
    count(player, structure.length);
  };
  api.broadcast = (room, object, except = null) => {
    const structure = JSON.stringify(object);
    for (const player of room.players.values()) {
      if (player === except || !player.ws || player.ws.readyState !== 1) {
        continue;
      }
      area.sendRaw(player, structure);
      count(player, structure.length);
    }
  };
}

const MOVE_DT = 1 / 60;
const CMD_RATE = 62;
const CMD_BURST = 30;
const roundToTwoDecimals = (value) => Math.round(value * 100) / 100;
const roundToThreeDecimals = (vehicle) => Math.round(vehicle * 1000) / 1000;
const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
const isVec3 = (value) => Array.isArray(value) && value.length === 3 && value.every(isNum);
const dist2 = (startX, startZ, endX, endZ) => Math.hypot(startX - endX, startZ - endZ);
const dist3 = (from, to) => Math.hypot(from[0] - to[0], from[1] - to[1], from[2] - to[2]);
const axis = (value) => Math.max(-1, Math.min(1, Math.round(Number(value)) || 0));
export const W = {
  knife: mwIndex('knife'),
  he: mwIndex('he'),
  smoke: mwIndex('smoke'),
  mg: mwIndex('m249'),
  rpg: mwIndex('rpg'),
  bandage: mwIndex('bandage'),
  medkit: mwIndex('medkit'),
  shovel: mwIndex('shovel'),
};
const UI_FLAGS = { map: 8, binos: 16, light: 32, using: 64, nvg: 128 };

export function setupMilRoom(room, options = {}) {
  room.milMap = mapId(options.map);
  selectMilMap(room.milMap);
  room.map = {
    id: 'milsim',
    name: MIL_MAPS.find((message) => message.id === room.milMap).name,
    doors: [],
    boxes: [],
    openPoints: [],
  };
  room.broken = new Set();
  room.solids = [];
  room.doorHp = [];
  void options;
  resetMil(room, true);
}

function resetMil(room, first = false) {
  const now = api.now();
  room.mil = {
    world: createWorld(),
    sectors: SECTORS.map((sector) => ({
      id: sector.id,
      owner: -1,
      cap: 0,
      capTeam: -1,
      store: 0,
      contested: false,
      n: [0, 0],
    })),
    points: SUPPLY_POINTS.map((supplyPoint) => ({ id: supplyPoint.id, stock: 1200 })),
    mainStore: [MIL.mainSupply, MIL.mainSupply],
    fobs: new Map(),
    vehicles: new Map(),
    markers: [new Map(), new Map()],
    prepUntil: now + MIL.prepMs,
    dayT0: now - 8 * 60000,
    bodies: new Map(),
    bodyId: 1,
    bullets: [],
    rockets: [],
    nades: [],
    shells: [],
    structId: 1,
    vehId: 1,
    nadeId: 1,
    total: null,
    winner: -1,
    nextMatchAt: 0,
    lastPoint: now,
    lastUpkeep: now,
    lastCap: now,
    tick: 0,
  };
  room.mil.openDoor = (id) => toggleDoor(room, id, true);
  room.winner = -1;
  room.score = [0, 0];
  if (!first) {
    api.broadcast(room, { t: 'mreset', ...initPayload(room) });
    for (const player of room.players.values()) {
      player.kills = 0;
      player.deaths = 0;
      player.stats = newStats();
      player.veh = 0;
      player.mount = 0;
      player.alive = false;
      player.downed = false;
      player.respawnAt = now + 2000;
      player.vcd = {};
      player.bot = null;
      player.xp = 0;
      player.xpAcc = 0;
      if (!player.isBot) {
        api.send(player, { t: 'mdead' });
        api.send(player, { t: 'mxp', xp: 0, add: 0 });
      }
    }
  }
}

function spawnVehicle(room, type, team, positionX, positionZ, yaw) {
  const mil = room.mil;
  const vehicle = createVehicle(mil.vehId++, type, team, positionX, positionZ, yaw);
  vehicle.engine = 0;
  vehicle.doors = 0;
  vehicle.tyaw = 0;
  vehicle.tp = 0;
  const gun = VEH_GUNS[type];
  if (gun) {
    vehicle.gun = {
      n: gun.mag,
      size: gun.mag,
      ammo: 'fmj',
      spare: gun.spare,
      maxSpare: gun.spare,
      reloadAt: 0,
    };
  }
  vehicle.y = heightAt(positionX, positionZ);
  vehicle.driver = 0;
  vehicle.last = api.now();
  vehicle.rest = false;
  vehicle.loading = null;
  vehicle.lastHit = 0;
  vehicle.lastNear = api.now();
  vehicle.gear = 1;
  mil.vehicles.set(vehicle.id, vehicle);
  return vehicle;
}

function initPayload(room) {
  const mil = room.mil;
  const door = [];
  for (const [id, open] of mil.world.doorOpen) {
    door.push([id, open ? 1 : 0]);
  }
  return {
    map: room.milMap,
    st: [...mil.world.structs.values()].map(structMsg),
    sec: sectorsMsg(room),
    day: mil.dayT0,
    bd: [...mil.bodies.values()].map(bodyMsg),
    dr: door,
  };
}
const structMsg = (structure) => [
  structure.id,
  structure.type,
  roundToTwoDecimals(structure.x),
  roundToTwoDecimals(structure.y),
  roundToTwoDecimals(structure.z),
  structure.rot,
  structure.team,
  Math.round(structure.hp),
  Math.round((structure.prog ?? 1) * 100),
];
const sectorsMsg = (room) =>
  room.mil.sectors.map((sector) => [
    sector.owner,
    Math.round(sector.cap * 100),
    sector.capTeam,
    sector.contested ? 1 : 0,
    sector.n[0],
    sector.n[1],
  ]);

const newStats = () => ({ k: 0, d: 0, rev: 0, heal: 0, cap: 0, sup: 0, built: 0, veh: 0 });
const scoreOf = (sector) =>
  Math.round(
    sector.k * 10 +
      sector.rev * 15 +
      sector.heal * 5 +
      sector.cap * 25 +
      sector.sup / 20 +
      sector.built * 8 +
      sector.veh * 30,
  );
const addStat = (player, kit, count = 1) => {
  if (player) {
    (player.stats ||= newStats())[kit] += count;
  }
};
function award(player, points, why) {
  if (!player || !points) {
    return;
  }
  if (player.isBot) {
    player.xp = Math.max(0, (player.xp || 0) + points);
    return;
  }
  player.xpAcc = (player.xpAcc || 0) + points;
  if (Math.abs(player.xpAcc) < 10 && points > 0 && points < 10) {
    return;
  }
  const add = Math.round(player.xpAcc);
  player.xpAcc = 0;
  const before = rankOf(player.xp);
  player.xp = Math.max(0, (player.xp || 0) + add);
  const after = rankOf(player.xp);
  api.send(player, { t: 'mxp', xp: player.xp, add, why, up: after > before ? after : undefined });
}
function statsTable(room) {
  return [...room.players.values()]
    .map((player) => {
      const stats = player.stats || newStats();
      return {
        n: player.name,
        tm: player.team,
        bot: player.isBot ? 1 : 0,
        ...stats,
        sup: Math.round(stats.sup),
        score: scoreOf(stats),
      };
    })
    .sort((left, right) => right.score - left.score);
}

const squadMembers = (room, team, squad) =>
  [...room.players.values()].filter((member) => member.team === team && member.squad === squad);
function squadLeader(room, team, squad) {
  const mil = room.mil;
  mil.squadLead ||= [{}, {}];
  const current = room.players.get(mil.squadLead[team][squad]);
  if (current && current.team === team && current.squad === squad) {
    return current;
  }
  const members = squadMembers(room, team, squad);
  const pick = members.find((candidate) => !candidate.isBot) || members[0] || null;
  mil.squadLead[team][squad] = pick ? pick.id : 0;
  return pick;
}
const isLeader = (room, player) => squadLeader(room, player.team, player.squad) === player;
function assignSquad(room, player) {
  for (let index = 0; index < SQUADS.length; index++) {
    if (
      squadMembers(room, player.team, index).filter((candidate) => candidate !== player).length <
      SQUAD_SIZE
    ) {
      player.squad = index;
      return;
    }
  }
  throw new Error('MilSim squad capacity exceeded');
}
function squadsInfo(room, team, player) {
  return SQUADS.map((name, index) => {
    const members = squadMembers(room, team, index);
    const lead = squadLeader(room, team, index);
    return {
      name,
      n: members.length,
      lead: lead ? lead.name : '',
      members: members.map((member) => [
        member.name,
        member.isBot ? 1 : 0,
        member === lead ? 1 : 0,
        member.alive ? 1 : 0,
        member.id,
      ]),
    };
  });
}
function handleSquad(room, player, message) {
  if ((message.lead ?? null) !== null) {
    room.mil.squadLead ||= [{}, {}];
    const lead = squadLeader(room, player.team, player.squad);
    if (message.lead && (!lead || lead.isBot || lead === player)) {
      room.mil.squadLead[player.team][player.squad] = player.id;
    } else if (!message.lead && lead === player) {
      const other =
        squadMembers(room, player.team, player.squad).find(
          (candidate) => candidate !== player && !candidate.isBot,
        ) ||
        squadMembers(room, player.team, player.squad).find((candidate) => candidate !== player);
      room.mil.squadLead[player.team][player.squad] = other ? other.id : 0;
    }
  } else {
    const squad = message.sq | 0;
    if (squad < 0 || squad >= SQUADS.length || squad === player.squad) {
      return;
    }
    if (squadMembers(room, player.team, squad).length >= SQUAD_SIZE) {
      const bot = squadMembers(room, player.team, squad).find((candidate) => candidate.isBot);
      if (!bot) {
        return api.send(player, { t: 'mmsg', m: `${SQUADS[squad]} is full.` });
      }
      bot.squad = player.squad;
    }
    player.squad = squad;
    api.send(player, { t: 'mmsg', m: `You joined squad ${SQUADS[squad]}.` });
  }
  for (const candidate of room.players.values()) {
    if (candidate.team === player.team && !candidate.isBot) {
      sendTeamState(room, candidate);
      api.send(candidate, { t: 'mmarks', l: teamMarkers(room, candidate.team, candidate) });
    }
  }
}

function voiceTargets(room, player, channel) {
  const near = [];
  const radio = [];
  const lead = channel === 'c' && isLeader(room, player);
  for (const other of room.players.values()) {
    if (other === player || other.isBot || !other.alive) {
      continue;
    }
    const onRadio =
      (channel === 's' && other.team === player.team && other.squad === player.squad) ||
      (lead && other.team === player.team && isLeader(room, other));
    if (onRadio) {
      radio.push(other);
    } else if (
      dist2(other.pos[0], other.pos[2], player.pos[0], player.pos[2]) < VOICE_RANGE &&
      Math.abs(other.pos[1] - player.pos[1]) < 30
    ) {
      near.push(other);
    }
  }
  return { near, radio, ok: channel === 'l' || channel === 's' || lead };
}
function handleVox(room, player, message) {
  if (!player.alive || player.downed || typeof message.d !== 'string' || message.d.length > 2600) {
    return;
  }
  const now = api.now();
  player.voxBudget = Math.min(
    20,
    (player.voxBudget ?? 20) + ((now - (player.voxAt || now)) / 1000) * 12,
  );
  player.voxAt = now;
  if (player.voxBudget < 1) {
    return;
  }
  player.voxBudget -= 1;
  const channel = message.ch === 's' || message.ch === 'c' ? message.ch : 'l';
  const target = voiceTargets(room, player, channel);
  if (!target.ok) {
    return;
  }
  const head = [
    roundToTwoDecimals(player.pos[0]),
    roundToTwoDecimals(player.pos[1] + 1.6),
    roundToTwoDecimals(player.pos[2]),
  ];
  for (const other of target.near) {
    api.send(other, {
      t: 'vox',
      i: player.id,
      ch: 'l',
      d: message.d,
      p: head,
      n: other.team === player.team ? player.name : '',
    });
  }
  for (const other of target.radio) {
    api.send(other, {
      t: 'vox',
      i: player.id,
      ch: channel,
      d: message.d,
      n: player.name,
      sq: SQUADS[player.squad],
    });
  }
}
function handleVoxState(room, player, message) {
  const channel = message.ch === 's' || message.ch === 'c' ? message.ch : 'l';
  if (channel === 'l') {
    return;
  }
  const target = voiceTargets(room, player, channel);
  if (!target.ok) {
    return api.send(player, { t: 'mmsg', m: 'Only squad leaders can use the command radio.' });
  }
  for (const other of target.radio) {
    api.send(other, {
      t: 'voxs',
      i: player.id,
      ch: channel,
      on: message.on ? 1 : 0,
      n: player.name,
    });
  }
}

export function milJoin(room, player, message) {
  selectMilMap(room.milMap);
  const wanted = message.team === 0 || message.team === 1 ? message.team : pickTeam(room);
  const teamMembers = [...room.players.values()].filter((other) => other.team === wanted);
  if (teamMembers.length >= MIL.maxTeamPlayers) {
    const bot = teamMembers.find((other) => other.isBot);
    if (!bot) {
      return api.send(player, { t: 'error', m: 'Team is full (24 players).' });
    }
    removeMilPlayer(room, bot);
    room.players.delete(bot.id);
  }
  const humans = [...room.players.values()].filter((other) => !other.isBot).length;
  if (room.players.size >= MIL.maxPlayers) {
    const bot = [...room.players.values()].find((other) => other.isBot);
    if (!bot || humans >= MIL.maxPlayers) {
      return api.send(player, { t: 'error', m: 'Room is full.' });
    }
    removeMilPlayer(room, bot);
    room.players.delete(bot.id);
  }
  player.name =
    String(message.name || 'Player')
      .replace(/[^\p{L}\p{N} _.-]/gu, '')
      .slice(0, 16) || 'Player';
  player.xp = 0;
  player.lk = encodeLook(sanitizeLook(message.look));
  player.skins = {};
  player.kills = 0;
  player.deaths = 0;
  player.team = wanted;
  balanceForHuman(room, player.team);
  player.room = room;
  initMilPlayer(player);
  player.nextKit = sanitizeKit(message.kit, player.team);
  room.players.set(player.id, player);
  assignSquad(room, player);
  api.send(player, {
    t: 'welcome',
    id: player.id,
    team: player.team,
    time: api.now(),
    tick: 30,
    room: { ...api.roomInfo(room), map: 'milsim', game: 'milsim' },
    mil: initPayload(room),
  });
  sendTeamState(room, player);
  player.stats ||= newStats();
  api.send(player, { t: 'mmarks', l: teamMarkers(room, player.team, player) });
  api.log(
    `+ ${player.name} (#${player.id}) joined MILSIM ${room.code} as ${player.team ? 'BLUFOR' : 'OPFOR'}`,
  );
}

function initMilPlayer(player) {
  player.alive = false;
  player.downed = false;
  player.respawnAt = 0;
  player.ms = createMilMoveState();
  player.veh = 0;
  player.seat = 0;
  player.mount = 0;
  player.lean = 0;
  player.ui = 0;
  player.kit = defaultKit(player.team);
  player.kg = kitWeight(player.kit);
  player.history = [];
  player.spawnCount = player.spawnCount || 0;
  player.lastSeq = 0;
  player.cmdBudget = CMD_BURST;
  player.budgetAt = api.now();
  player.slots = [];
  player.inv = { loaded: {}, mags: [], items: {} };
  player.vcd = {};
}

function pickTeam(room) {
  let teamZeroCount = 0;
  let teamOneCount = 0;
  for (const other of room.players.values()) {
    other.team === 0 ? teamZeroCount++ : teamOneCount++;
  }
  return teamZeroCount <= teamOneCount ? 0 : 1;
}

function balanceForHuman(room, team) {
  let mine = 0;
  let other = 0;
  for (const currentOther of room.players.values()) {
    currentOther.team === team ? mine++ : other++;
  }
  if (mine < other + 1) {
    return;
  }
  const bot = [...room.players.values()].find((other) => other.isBot && other.team === team);
  if (!bot || other >= MIL.maxTeamPlayers) {
    return;
  }
  removeMilPlayer(room, bot);
  bot.team = 1 - team;
  assignSquad(room, bot);
  bot.kit = milBotKit(bot.team, bot.cls);
  bot.alive = false;
  bot.downed = false;
  bot.respawnAt = api.now() + 1000;
  pickBotRoles(room);
}

export function milAddBot(room) {
  selectMilMap(room.milMap);
  const nBots = [...room.players.values()].filter((other) => other.isBot).length;
  if (room.players.size >= MIL.maxPlayers || nBots >= MIL.maxBots) {
    return false;
  }
  const bot = makeMilBot(api.nextId(), ++room.botN, room.skill);
  bot.team = pickTeam(room);
  bot.room = room;
  initMilPlayer(bot);
  room.players.set(bot.id, bot);
  assignSquad(room, bot);
  pickBotRoles(room);
  bot.kit = milBotKit(bot.team, bot.cls);
  bot.nextKit = bot.kit;
  bot.respawnAt = api.now() + 500 + Math.random() * 2500;
  return true;
}

export function milRemoveBot(room) {
  selectMilMap(room.milMap);
  const bots = [...room.players.values()].filter((other) => other.isBot);
  if (!bots.length) {
    return false;
  }
  const bot = bots.pop();
  removeMilPlayer(room, bot);
  room.players.delete(bot.id);
  pickBotRoles(room);
  return true;
}

const mountKind = (room, player) =>
  player.mount ? room.mil.world.structs.get(player.mount)?.type : null;

export function milLeave(room, player) {
  selectMilMap(room.milMap);
  removeMilPlayer(room, player);
}

function removeMilPlayer(room, player) {
  if (player.veh) {
    leaveVehicle(room, player, true);
  }
  player.mount = 0;
}

export function milHost(room, player, message) {
  selectMilMap(room.milMap);
  if (message.t === 'bot') {
    if (message.op === 'add') {
      milAddBot(room);
    } else if (message.op === 'remove') {
      milRemoveBot(room);
    } else if (message.op === 'skill' && ['easy', 'normal', 'hard'].includes(message.skill)) {
      room.skill = message.skill;
      for (const other of room.players.values()) {
        if (other.isBot) {
          other.skill = message.skill;
        }
      }
    }
  }
}

function enemiesNear(room, team, positionX, positionZ, hit) {
  for (const other of room.players.values()) {
    if (
      other.alive &&
      !other.downed &&
      other.team !== team &&
      dist2(other.pos[0], other.pos[2], positionX, positionZ) < hit
    ) {
      return true;
    }
  }
  return false;
}

function areasOf(room, team) {
  const mil = room.mil;
  const out = [];
  const mainBase = MAIN_BASES[team];
  out.push({
    kind: 'main',
    id: 'main',
    x: mainBase.x,
    z: mainBase.z,
    r: mainBase.r,
    store: Infinity,
    name: mainBase.name,
  });
  mil.sectors.forEach((sector, index) => {
    if (sector.owner !== team) {
      return;
    }
    const sectorDefinition = SECTORS[index];
    out.push({
      kind: 'sector',
      id: sector.id,
      x: sectorDefinition.x,
      z: sectorDefinition.z,
      r: sectorDefinition.r,
      store: sector.store,
      ref: sector,
      name: sectorDefinition.name,
    });
  });
  for (const footprint of mil.fobs.values()) {
    if (footprint.team === team) {
      out.push({
        kind: 'fob',
        id: `F${footprint.id}`,
        x: footprint.x,
        z: footprint.z,
        r: MIL.fobRadius,
        store: footprint.store,
        ref: footprint,
        name: `FOB ${footprint.name}`,
      });
    }
  }
  return out;
}
function areaAt(room, team, positionX, positionZ, withMain = true) {
  let best = null;
  for (const area of areasOf(room, team)) {
    if (!withMain && area.kind === 'main') {
      continue;
    }
    const distance = dist2(area.x, area.z, positionX, positionZ);
    if (distance <= area.r && (!best || distance < best.d)) {
      best = { ...area, d: distance };
    }
  }
  return best;
}
function spendArea(area, amount) {
  if (area.kind === 'main') {
    return true;
  }
  if (area.ref.store < amount) {
    return false;
  }
  area.ref.store -= amount;
  return true;
}

function spawnOptions(room, team) {
  return areasOf(room, team).map((area) => {
    let ok = true;
    let why = '';
    if (area.kind !== 'main') {
      if (area.store < MIL.spawnCost) {
        ok = false;
        why = 'No supply';
      } else if (area.kind === 'sector' && area.ref.contested) {
        ok = false;
        why = 'Contested';
      } else if (area.kind === 'sector' && area.ref.cap < 1) {
        ok = false;
        why = 'Being captured';
      } else if (
        enemiesNear(room, team, area.x, area.z, area.kind === 'fob' ? MIL.fobBlockDist : area.r)
      ) {
        ok = false;
        why = 'Enemies nearby';
      }
    }
    return {
      id: area.id,
      kind: area.kind,
      name: area.name,
      x: area.x,
      z: area.z,
      ok,
      why,
      store: area.store === Infinity ? -1 : Math.floor(area.store),
    };
  });
}

function spawnPoint(room, area) {
  const mil = room.mil;
  for (let index = 0; index < 40; index++) {
    const radius =
      area.kind === 'main'
        ? 6 + Math.random() * 16
        : area.kind === 'fob'
          ? 4 + Math.random() * 10
          : Math.random() * area.r * 0.5;
    const angle = Math.random() * Math.PI * 2;
    const positionX = area.x + Math.cos(angle) * radius;
    const positionZ = area.z + Math.sin(angle) * radius;
    if (waterDepth(positionX, positionZ) > 0.3) {
      continue;
    }
    const positionY = heightAt(positionX, positionZ);
    const near = mil.world.grid.query(
      positionX - 1,
      positionZ - 1,
      positionX + 1,
      positionZ + 1,
      [],
    );
    if (
      near.some(
        (bot) =>
          !bot.soft &&
          bot.max[1] > positionY + 0.05 &&
          bot.min[1] < positionY + 1.8 &&
          positionX > bot.min[0] - 0.5 &&
          positionX < bot.max[0] + 0.5 &&
          positionZ > bot.min[2] - 0.5 &&
          positionZ < bot.max[2] + 0.5,
      )
    ) {
      continue;
    }
    return { x: positionX, y: positionY, z: positionZ };
  }
  return { x: area.x, y: heightAt(area.x, area.z) + 0.5, z: area.z };
}

const BASIC_KIT = (team, classId) => {
  const kit = defaultKit(team, classId);
  return sanitizeKit(
    {
      ...kit,
      vest: 'none',
      helmet: 'none',
      pack: 'none',
      primary: { ...kit.primary, optic: 'iron' },
      mags: kit.mags.slice(0, 3),
      items: { ...kit.items, he: 0, smoke: 0, bandage: 1, binos: 0 },
    },
    team,
  );
};

function deploy(room, player, spawnId, kitIn) {
  if (player.alive || api.now() < player.respawnAt || room.mil.winner >= 0) {
    return;
  }
  const options = spawnOptions(room, player.team);
  const option = options.find((positionX) => positionX.id === spawnId) || options[0];
  if (!option.ok) {
    return api.send(player, { t: 'mmsg', m: `Can't spawn at ${option.name}. ${option.why}.` });
  }
  const area = areasOf(room, player.team).find((positionX) => positionX.id === option.id);
  let kit = sanitizeKit(kitIn || player.nextKit, player.team);
  player.nextKit = kit;
  if (area.kind !== 'main') {
    const cost = MIL.spawnCost + (player.isBot ? 0 : kitCost(kit));
    if (area.ref.store >= cost) {
      area.ref.store -= cost;
    } else {
      area.ref.store -= MIL.spawnCost;
      kit = BASIC_KIT(player.team, kit.cls);
      api.send(player, {
        t: 'mmsg',
        m: 'Not enough supply for your kit. Spawned with basic gear.',
      });
    }
  }
  const point = spawnPoint(room, area);
  const mainBase = MAIN_BASES[player.team];
  const yaw = Math.atan2(point.x, point.z) + (Math.random() - 0.5) * 0.6;
  spawnAt(
    room,
    player,
    point,
    area.kind === 'main' ? (mainBase.team === 0 ? Math.PI : 0) : yaw,
    kit,
  );
}

function applyKit(player, kit) {
  player.kit = kit;
  player.kg = kitWeight(kit);
  player.gear = encodeGear(kit);
  const item = { ...kit.items };
  const prim = mwIndex(kit.primary.id);
  const sec = kit.secondary ? mwIndex(kit.secondary.id) : -1;
  player.slots = [
    prim,
    sec,
    kit.launcher ? W.rpg : -1,
    item.he > 0 ? W.he : -1,
    item.smoke > 0 ? W.smoke : -1,
    item.bandage > 0 ? W.bandage : -1,
    item.medkit > 0 ? W.medkit : -1,
    item.shovel > 0 ? W.shovel : -1,
    W.knife,
  ];
  const mags = kit.mags.map((message) => {
    const weapon = MW[mwIndex(message.w)];
    return { cal: caliberOf(message.w), size: weapon.mag, n: weapon.mag, ammo: message.ammo };
  });
  const loaded = {};
  for (const weaponIndex of [prim, sec]) {
    if (weaponIndex < 0) {
      continue;
    }
    const caliber = caliberOf(MW[weaponIndex].id);
    const kit = mags.findIndex((message) => message.cal === caliber);
    if (kit >= 0) {
      loaded[weaponIndex] = mags.splice(kit, 1)[0];
    } else {
      loaded[weaponIndex] = {
        cal: caliber,
        size: MW[weaponIndex].mag,
        n: MW[weaponIndex].mag,
        ammo: 'fmj',
      };
    }
  }
  if (kit.launcher) {
    loaded[W.rpg] = { cal: 'rocket', size: 1, n: item.rocket > 0 ? 1 : 0, ammo: 'heat' };
    if (item.rocket > 0) {
      item.rocket--;
    }
  }
  player.inv = { loaded, mags, items: item };
}
const invMsg = (player) => ({
  sl: player.slots,
  ld: Object.entries(player.inv.loaded).map(([weaponIndex, message]) => [
    Number(weaponIndex),
    message.n,
    message.ammo,
    message.size,
  ]),
  mg: player.inv.mags.map((message) => [message.cal, message.n, message.size, message.ammo]),
  it: player.inv.items,
});
function sendMed(player) {
  if (!player || player.isBot) {
    return;
  }
  api.send(player, {
    t: 'mmed',
    b: player.bleed | 0,
    w: [roundToTwoDecimals(player.wounds?.arms || 0), roundToTwoDecimals(player.wounds?.legs || 0)],
    hp: Math.max(0, Math.round(player.hp)),
    st: player.downed ? (player.bleed ? 0 : 1) : 0,
  });
}
const sendInv = (player, extra = {}) =>
  api.send(player, { t: 'minv', ...invMsg(player), w: player.weapon, ...extra });

function useItem(player, id) {
  if (!(player.inv.items[id] > 0)) {
    return false;
  }
  player.inv.items[id]--;
  const slotOf = { he: 3, smoke: 4, bandage: 5, medkit: 6 };
  if ((slotOf[id] ?? null) !== null && player.inv.items[id] <= 0) {
    player.slots[slotOf[id]] = -1;
    if (!player.slots.includes(player.weapon)) {
      player.weapon = player.slots[0];
    }
  }
  return true;
}

function doReload(player, weaponIndex) {
  const weapon = MW[weaponIndex];
  const current = player.inv.loaded[weaponIndex];
  if (!current) {
    return;
  }
  if (weapon.rocket) {
    if (current.n === 0 && player.inv.items.rocket > 0) {
      player.inv.items.rocket--;
      current.n = 1;
    }
    return;
  }
  let best = -1;
  for (let kit = 0; kit < player.inv.mags.length; kit++) {
    if (
      player.inv.mags[kit].cal === current.cal &&
      player.inv.mags[kit].n > 0 &&
      (best < 0 || player.inv.mags[kit].n > player.inv.mags[best].n)
    ) {
      best = kit;
    }
  }
  if (best < 0) {
    return;
  }
  const next = player.inv.mags.splice(best, 1)[0];
  if (current.n > 0) {
    player.inv.mags.push({ ...current });
  }
  player.inv.loaded[weaponIndex] = next;
}

const BODY_MS = 120000;
const magSlots = (message) => (String(message.cal).includes('belt') ? 2 : 1);
function invUsed(holder) {
  let count = 0;
  for (const message of holder.inv.mags) {
    count += magSlots(message);
  }
  for (const [kit, entry] of Object.entries(holder.inv.items)) {
    count += (ITEMS[kit]?.size || 0) * entry;
  }
  if (holder.kit.launcher) {
    count += 4;
  }
  return count;
}
function refreshHolder(player) {
  const item = player.inv.items;
  const prim = player.kit.primary ? mwIndex(player.kit.primary.id) : -1;
  const sec = player.kit.secondary ? mwIndex(player.kit.secondary.id) : -1;
  player.slots = [
    prim,
    sec,
    player.kit.launcher ? W.rpg : -1,
    item.he > 0 ? W.he : -1,
    item.smoke > 0 ? W.smoke : -1,
    item.bandage > 0 ? W.bandage : -1,
    item.medkit > 0 ? W.medkit : -1,
    item.shovel > 0 ? W.shovel : -1,
    W.knife,
  ];
  let weight = kitWeight({ ...player.kit, mags: [], items: item });
  for (const message of player.inv.mags) {
    weight += magSlots(message) > 1 ? 2.5 : 0.45;
  }
  player.kg = Math.round(weight * 10) / 10;
  player.gear = encodeGear(player.kit);
  if (!player.slots.includes(player.weapon)) {
    player.weapon = player.slots[0] >= 0 ? player.slots[0] : W.knife;
  }
}

function addBody(room, other) {
  const mil = room.mil;
  if (!other.inv || !other.kit) {
    return;
  }
  const id = mil.bodyId++;
  const newBody = {
    id,
    pid: other.id,
    name: other.name,
    team: other.team,
    x: other.pos[0],
    y: groundFor(mil.world, other.pos[0], other.pos[2], other.pos[1]),
    z: other.pos[2],
    yaw: other.yaw,
    until: api.now() + MIL.bodyMs,
    kit: {
      primary: other.kit.primary,
      secondary: other.kit.secondary,
      launcher: other.kit.launcher,
    },
    inv: {
      loaded: { ...other.inv.loaded },
      mags: other.inv.mags.slice(),
      items: { ...other.inv.items },
    },
  };
  mil.bodies.set(id, newBody);
  if (mil.bodies.size > 40) {
    removeBody(room, mil.bodies.keys().next().value);
  }
  api.broadcast(room, { t: 'mbody', b: bodyMsg(newBody) });
}
const bodyMsg = (lootBody) => [
  lootBody.id,
  lootBody.pid,
  roundToTwoDecimals(lootBody.x),
  roundToTwoDecimals(lootBody.y),
  roundToTwoDecimals(lootBody.z),
  roundToTwoDecimals(lootBody.yaw),
  lootBody.team,
  lootBody.name,
  lootBody.pile ? 1 : 0,
];

function pileOf(room, player) {
  const mil = room.mil;
  for (const body of mil.bodies.values()) {
    if (
      body.pile &&
      body.pid === player.id &&
      Math.hypot(body.x - player.pos[0], body.z - player.pos[2]) < 3
    ) {
      return body;
    }
  }
  const id = mil.bodyId++;
  const forwardX = -Math.sin(player.yaw);
  const forwardZ = -Math.cos(player.yaw);
  const pile = {
    id,
    pid: player.id,
    name: `${player.name}'s dropped gear`,
    team: player.team,
    x: player.pos[0] + forwardX * 0.8,
    y: player.pos[1],
    z: player.pos[2] + forwardZ * 0.8,
    yaw: player.yaw,
    until: api.now() + BODY_MS,
    pile: true,
    kit: { primary: null, secondary: null, launcher: '' },
    inv: { loaded: {}, mags: [], items: {} },
  };
  mil.bodies.set(id, pile);
  if (mil.bodies.size > 60) {
    removeBody(room, mil.bodies.keys().next().value);
  }
  api.broadcast(room, { t: 'mbody', b: bodyMsg(pile) });
  return pile;
}
function handleDrop(room, player, message) {
  if (!player.alive || player.downed || player.veh) {
    return;
  }
  if (message.k === 'mag') {
    const kit = message.i | 0;
    if (!player.inv.mags[kit]) {
      return;
    }
    pileOf(room, player).inv.mags.push(player.inv.mags.splice(kit, 1)[0]);
  } else if (message.k === 'it') {
    const id = String(message.i);
    if (!ITEMS[id] || !(player.inv.items[id] > 0)) {
      return;
    }
    player.inv.items[id]--;
    const pile = pileOf(room, player);
    pile.inv.items[id] = (pile.inv.items[id] || 0) + 1;
  } else if (message.k === 'w') {
    const slot = message.i | 0;
    if (slot === 1 && player.kit.secondary) {
      const weaponIndex = mwIndex(player.kit.secondary.id);
      const pile = pileOf(room, player);
      if (pile.kit.secondary) {
        return api.send(player, { t: 'mmsg', m: 'There is already a sidearm in that pile.' });
      }
      pile.kit.secondary = player.kit.secondary;
      pile.inv.loaded[weaponIndex] = player.inv.loaded[weaponIndex];
      delete player.inv.loaded[weaponIndex];
      player.kit.secondary = null;
    } else if (slot === 2 && player.kit.launcher) {
      const pile = pileOf(room, player);
      if (pile.kit.launcher) {
        return;
      }
      pile.kit.launcher = 'rpg';
      pile.inv.loaded[W.rpg] = player.inv.loaded[W.rpg];
      delete player.inv.loaded[W.rpg];
      player.kit.launcher = '';
    } else {
      return;
    }
  } else {
    return;
  }
  player.kit = { ...player.kit };
  refreshHolder(player);
  player.reloading = false;
  sendInv(player, { kit: player.kit, kg: player.kg });
}
function removeBody(room, id) {
  if (!room.mil.bodies.delete(id)) {
    return;
  }
  for (const player of room.players.values()) {
    if (player.looting?.b === id) {
      player.looting = null;
    }
  }
  api.broadcast(room, { t: 'mbodyx', id });
}

function lootSource(room, player, message) {
  if (!player.alive || player.downed || player.veh) {
    return null;
  }
  if ((message.b ?? null) !== null) {
    const body = room.mil.bodies.get(message.b);
    if (
      body &&
      Math.hypot(body.x - player.pos[0], body.z - player.pos[2]) < 3.2 &&
      Math.abs(body.y - player.pos[1]) < 2.5
    ) {
      return { h: body, key: { b: body.id }, name: body.name };
    }
    return null;
  }
  const other = room.players.get(message.p);
  if (
    other &&
    other.alive &&
    other.downed &&
    other.team !== player.team &&
    Math.hypot(other.pos[0] - player.pos[0], other.pos[2] - player.pos[2]) < 3.2
  ) {
    return { h: other, key: { p: other.id }, name: other.name, player: other };
  }
  return null;
}
function lootView(source) {
  const holder = source.h;
  const weapons = [];
  const add = (slot, width, extra) => {
    if (!width) {
      return;
    }
    const weaponIndex = mwIndex(width);
    const message = holder.inv.loaded[weaponIndex];
    weapons.push([
      slot,
      weaponIndex,
      message ? message.n : 0,
      message ? message.size : 0,
      message ? message.ammo : '',
      extra || '',
    ]);
  };
  add(0, holder.kit.primary?.id, holder.kit.primary?.optic);
  add(1, holder.kit.secondary?.id);
  if (holder.kit.launcher) {
    add(2, 'rpg');
  }
  return {
    t: 'mloot',
    ...source.key,
    n: source.name,
    w: weapons,
    mg: holder.inv.mags.map((message) => [message.cal, message.n, message.size, message.ammo]),
    it: holder.inv.items,
  };
}
function handleLoot(room, player, message) {
  const source = lootSource(room, player, message);
  if (!source) {
    return api.send(player, { t: 'mlootx' });
  }
  player.looting = source.key;
  api.send(player, lootView(source));
}

function handleTake(room, player, message) {
  const source = lootSource(room, player, message);
  if (!source) {
    return api.send(player, { t: 'mlootx' });
  }
  const holder = source.h;
  const cap = capacityOf(player.kit);
  let failure = '';
  if (message.k === 'mag') {
    const magazine = holder.inv.mags[message.i | 0];
    if (!magazine) {
      return;
    }
    if (invUsed(player) + magSlots(magazine) > cap) {
      failure = 'No room in your vest / backpack.';
    } else {
      holder.inv.mags.splice(message.i | 0, 1);
      player.inv.mags.push(magazine);
    }
  } else if (message.k === 'it') {
    const id = String(message.i);
    const definition = ITEMS[id];
    if (!definition || !(holder.inv.items[id] > 0)) {
      return;
    }
    let count = 0;
    while (
      holder.inv.items[id] > 0 &&
      (player.inv.items[id] || 0) < definition.max * 2 &&
      invUsed(player) + definition.size <= cap
    ) {
      holder.inv.items[id]--;
      player.inv.items[id] = (player.inv.items[id] || 0) + 1;
      count++;
    }
    if (!count) {
      failure =
        definition.size && invUsed(player) + definition.size > cap
          ? 'No room in your vest / backpack.'
          : `You can't carry more ${definition.name.toLowerCase()}s.`;
    }
  } else if (message.k === 'w') {
    const slot = message.i | 0;
    const key = ['primary', 'secondary', 'launcher'][slot];
    if (!key || !holder.kit[key]) {
      return;
    }
    if (slot === 2) {
      if (player.kit.launcher) {
        return;
      }
      if (invUsed(player) + 4 > cap) {
        failure = 'No room for the launcher.';
      } else {
        player.kit.launcher = 'rpg';
        holder.kit.launcher = '';
        player.inv.loaded[W.rpg] = holder.inv.loaded[W.rpg] || {
          cal: 'rocket',
          size: 1,
          n: 0,
          ammo: 'heat',
        };
        delete holder.inv.loaded[W.rpg];
      }
    } else {
      const mine = player.kit[key];
      const theirs = holder.kit[key];
      const mineIndex = mine ? mwIndex(mine.id) : -1;
      const theirIndex = mwIndex(theirs.id);
      const myMag = mineIndex >= 0 ? player.inv.loaded[mineIndex] : null;
      const theirMag = holder.inv.loaded[theirIndex];
      if (mineIndex >= 0) {
        delete player.inv.loaded[mineIndex];
      }
      delete holder.inv.loaded[theirIndex];
      player.kit[key] = theirs;
      holder.kit[key] = mine;
      player.inv.loaded[theirIndex] = theirMag || {
        cal: caliberOf(theirs.id),
        size: MW[theirIndex].mag,
        n: 0,
        ammo: 'fmj',
      };
      if (mineIndex >= 0) {
        holder.inv.loaded[mineIndex] = myMag;
      }
      if (player.weapon === mineIndex) {
        player.weapon = theirIndex;
      }
      player.reloading = false;
      player.readyAt = api.now() + 900;
    }
  }
  player.kit = { ...player.kit };
  refreshHolder(player);
  sendInv(player, { kit: player.kit, kg: player.kg, msg: failure || undefined });
  if (source.player) {
    source.player.kit = { ...source.player.kit };
    refreshHolder(source.player);
    sendInv(source.player, { kit: source.player.kit, kg: source.player.kg });
  }
  if (
    holder.pile &&
    !holder.inv.mags.length &&
    !Object.values(holder.inv.items).some((count) => count > 0) &&
    !holder.kit.secondary &&
    !holder.kit.launcher &&
    !holder.kit.primary
  ) {
    removeBody(room, holder.id);
    return api.send(player, { t: 'mlootx' });
  }
  api.send(player, lootView(source));
}

function tickBodies(room, now) {
  for (const body of room.mil.bodies.values()) {
    if (now > body.until) {
      removeBody(room, body.id);
    }
  }
}

function spawnAt(room, player, point, yaw, kit) {
  applyKit(player, kit);
  player.pos = [point.x, point.y, point.z];
  player.yaw = yaw;
  player.pitch = 0;
  player.crouch = false;
  player.prone = false;
  player.hp = MIL.hp;
  player.alive = true;
  player.downed = false;
  player.bleed = 0;
  player.wounds = { arms: 0, legs: 0 };
  player.revives = 0;
  player.dragging = 0;
  player.draggedBy = 0;
  player.spawnCount++;
  player.history = [];
  player.weapon = player.slots[0];
  player.reloading = false;
  player.readyAt = 0;
  player.nextFire = 0;
  player.useStart = 0;
  player.reviving = null;
  player.protectedUntil = api.now() + MIL.spawnProtectMs;
  player.ms = createMilMoveState(point.x, point.y, point.z);
  player.cmdBudget = CMD_BURST;
  player.budgetAt = api.now();
  player.veh = 0;
  player.mount = 0;
  player.lean = 0;
  player.ui = 0;
  if (player.isBot) {
    player.bot = null;
  }
  api.send(player, {
    t: 'respawn',
    p: player.pos,
    yaw,
    sp: player.spawnCount,
    kit,
    kg: player.kg,
    ...invMsg(player),
  });
  if (!player.isBot) {
    sendMed(player);
  }
}

function killPlayer(room, killer, victim, width, head = false) {
  if (!victim.alive) {
    return;
  }
  victim.alive = false;
  victim.downed = false;
  victim.bleed = 0;
  stopDrag(room, victim);
  victim.deaths++;
  const now = api.now();
  victim.recentDeaths = (victim.recentDeaths || []).filter((distance) => now - distance < 180000);
  victim.recentDeaths.push(now);
  victim.respawnAt =
    now + Math.min(MIL.respawnMaxMs, MIL.respawnMs + (victim.recentDeaths.length - 1) * 2500);
  victim.reloading = false;
  if (victim.veh) {
    leaveVehicle(room, victim, true);
  }
  victim.mount = 0;
  if (width !== 'respawn') {
    addBody(room, victim);
  }
  if (killer && killer !== victim && killer.team !== victim.team) {
    killer.kills++;
    addStat(killer, 'k');
    award(
      killer,
      XP.kill + (head ? XP.head : 0),
      head ? 'Enemy killed (headshot)' : 'Enemy killed',
    );
  } else if (killer && killer !== victim && killer.team === victim.team && width !== 'bleed') {
    award(killer, XP.teamkill, 'Team kill');
  }
  addStat(victim, 'd');
  api.broadcast(room, {
    t: 'kill',
    k: killer?.id ?? victim.id,
    kn: killer?.name ?? victim.name,
    kt: killer?.team ?? victim.team,
    v: victim.id,
    vn: victim.name,
    vt: victim.team,
    w: width,
    h: head,
  });
}

function downPlayer(room, attacker, other, width, head) {
  if ((other.revives || 0) >= MIL.maxRevives) {
    return killPlayer(room, attacker, other, width, head);
  }
  if (other.veh) {
    const vehicle = room.mil.vehicles.get(other.veh);
    if (vehicle && vehicle.driver === other.id) {
      vehicle.driver = 0;
    }
  }
  stopDrag(room, other);
  other.downed = true;
  other.downedAt = api.now();
  other.downedUntil = api.now() + MIL.downedMs;
  other.dhp = MIL.downedHp;
  other.downedBy = attacker;
  other.downedWid = width;
  other.bleed = Math.max(1, other.bleed | 0);
  other.reloading = false;
  other.mount = 0;
  other.hp = 0;
  api.send(other, { t: 'mdown', until: MIL.downedMs, giveUp: MIL.giveUpAfterMs });
  sendMed(other);
  api.broadcast(room, {
    t: 'downed',
    v: other.id,
    vn: other.name,
    vt: other.team,
    k: attacker?.id ?? 0,
    kn: attacker?.name ?? '',
  });
}

const RAM_MIN_SPEED = 3;
const RAM_COOLDOWN_MS = 600;
const RAM_BASE_DMG = 20;
const RAM_THROW = 0.6;
const KNOCK_BASE_MS = 1400;
const KNOCK_PER_SPEED_MS = 70;
const KNOCK_MAX_MS = 3200;
function vehicleVelocity(vehicle, definition) {
  if (definition.kind === 'heli') {
    return [vehicle.vx || 0, vehicle.vy || 0, vehicle.vz || 0];
  }
  return [-Math.sin(vehicle.yaw) * vehicle.v, 0, -Math.cos(vehicle.yaw) * vehicle.v];
}
export function knockOver(room, other, velocity, milliseconds, now) {
  if (!other.alive || other.veh) {
    return;
  }
  other.ms.vx = velocity[0];
  other.ms.vy = velocity[1];
  other.ms.vz = velocity[2];
  other.ms.onGround = false;
  other.knockUntil = Math.max(other.knockUntil || 0, now + milliseconds);
  if (other.mount) {
    other.mount = 0;
    api.send(other, { t: 'mmount', id: 0 });
  }
  if (!other.isBot) {
    api.send(other, { t: 'mknock', ms: Math.round(other.knockUntil - now) });
  }
}
function ramPlayers(room, vehicle, definition, now, driver) {
  const velocity = vehicleVelocity(vehicle, definition);
  const speed = Math.hypot(velocity[0], velocity[1], velocity[2]);
  if (speed < RAM_MIN_SPEED) {
    return;
  }
  const cosine = Math.cos(-vehicle.yaw);
  const sine = Math.sin(-vehicle.yaw);
  const heli = definition.kind === 'heli';
  for (const other of room.players.values()) {
    if (!other.alive || other.veh || now - (other.runAt || 0) < RAM_COOLDOWN_MS) {
      continue;
    }
    const release = other.pos[1] - vehicle.y;
    if (release > (heli ? 1.2 : 2) || release < -1.8) {
      continue;
    }
    const rotationX = other.pos[0] - vehicle.x;
    const rotationZ = other.pos[2] - vehicle.z;
    const localX = rotationX * cosine + rotationZ * sine;
    const localZ = -rotationX * sine + rotationZ * cosine;
    const reach = heli ? 0.45 : 1;
    if (
      Math.abs(localX) > (definition.wid / 2 + 0.4) * reach ||
      Math.abs(localZ) > (definition.len / 2 + 0.4) * reach
    ) {
      continue;
    }
    if (
      (other.ms.vx - velocity[0]) * rotationX + (other.ms.vz - velocity[2]) * rotationZ > 0 &&
      now - (other.runAt || 0) < 2000
    ) {
      continue;
    }
    other.runAt = now;
    const side = Math.sign(localX || Math.random() - 0.5);
    const sideX = Math.cos(vehicle.yaw) * side;
    const sideZ = -Math.sin(vehicle.yaw) * side;
    const throwVel = [
      velocity[0] * RAM_THROW + sideX * (1.5 + speed * 0.12),
      2 + speed * 0.15 + Math.max(0, velocity[1]) * 0.5,
      velocity[2] * RAM_THROW + sideZ * (1.5 + speed * 0.12),
    ];
    knockOver(
      room,
      other,
      throwVel,
      Math.min(KNOCK_MAX_MS, KNOCK_BASE_MS + speed * KNOCK_PER_SPEED_MS),
      now,
    );
    const sameTeam = driver && driver.team === other.team;
    if (sameTeam) {
      continue;
    }
    const extra = (speed - RAM_MIN_SPEED) ** 2 * 1.2 * (1 + definition.mass * 0.15);
    hurtPlayer(
      room,
      driver || null,
      other,
      RAM_BASE_DMG + extra,
      'body',
      [vehicle.x, vehicle.y + 1, vehicle.z],
      'vehicle',
    );
  }
}

function hurtPlayer(room, attacker, other, damage, part, from, width) {
  if (!other.alive || api.now() < other.protectedUntil) {
    return;
  }
  const distance = Math.max(1, Math.round(damage));
  if (attacker && attacker !== other) {
    other.lastHurtBy = attacker.id;
    attacker.lastTargetOf = other.id;
    if (other.isBot) {
      botHurt(other, attacker, api.now());
      noticeDamage(other, attacker);
    }
  }
  if (other.downed) {
    other.dhp -= distance;
    if (other.dhp <= 0) {
      killPlayer(room, attacker || other.downedBy || other, other, width, part === 'head');
    }
    return;
  }
  other.hp -= distance;
  const dead = other.hp <= 0;
  if (attacker && attacker !== other) {
    api.send(attacker, {
      t: 'hit',
      v: other.id,
      d: distance,
      pt: part,
      hp: Math.max(0, other.hp),
      pos: [
        roundToTwoDecimals(other.pos[0]),
        roundToTwoDecimals(other.pos[1] + 1),
        roundToTwoDecimals(other.pos[2]),
      ],
      kill: dead,
    });
  }
  api.send(other, {
    t: 'hurt',
    d: distance,
    o: from.map(roundToTwoDecimals),
    hp: Math.max(0, other.hp),
    part,
  });
  if (other.isBot && attacker && !dead) {
    other.alertBy = attacker;
    other.alertAt = api.now();
  }
  if (!dead && width !== 'wire' && width !== 'bleed' && width !== 'base') {
    if (width !== 'fall' && distance >= 12) {
      other.bleed = Math.max(other.bleed | 0, distance >= 55 ? 3 : distance >= 30 ? 2 : 1);
    }
    other.wounds ||= { arms: 0, legs: 0 };
    if (part === 'legs' || width === 'fall') {
      other.wounds.legs = Math.min(1, other.wounds.legs + distance / 60);
    } else if (part === 'arms') {
      other.wounds.arms = Math.min(1, other.wounds.arms + distance / 50);
    }
  }
  sendMed(other);
  if (dead) {
    const overkill = -other.hp;
    if ((part === 'head' && overkill > 40) || overkill > 90 || width === 'crash') {
      killPlayer(room, attacker || other, other, width, part === 'head');
    } else {
      downPlayer(room, attacker, other, width, part === 'head');
    }
  }
}

function damageStruct(room, structure, damage) {
  if (!structure || structure.hp <= 0) {
    return;
  }
  structure.hp -= damage;
  if (structure.hp > 0) {
    if (!structure.lastHpSent || structure.lastHpSent - structure.hp > 50) {
      structure.lastHpSent = structure.hp;
      api.broadcast(room, { t: 'sthp', id: structure.id, hp: Math.round(structure.hp) });
    }
    return;
  }
  destroyStruct(room, structure, true);
}

function destroyStruct(room, structure, boom) {
  const mil = room.mil;
  removeStructure(mil.world, structure.id);
  if (structure.type === 'fob') {
    for (const [id, footprint] of mil.fobs) {
      if (footprint.sid === structure.id) {
        mil.fobs.delete(id);
      }
    }
  }
  for (const player of room.players.values()) {
    if (player.mount === structure.id) {
      player.mount = 0;
    }
  }
  api.broadcast(room, { t: 'stdel', id: structure.id, boom: boom ? 1 : 0 });
}

export function damageVehicle(room, vehicle, damage, builder, width = 'vehicle', hit = null) {
  selectMilMap(room.milMap);
  if (!vehicle.alive) {
    return;
  }
  const definition = VEHICLES[vehicle.type];
  if (vehicle.burning && width !== 'crash' && damage < definition.hp * BURN_FINISH_FRACTION) {
    if (builder) {
      vehicle.lastHit = builder.id;
    }
    return;
  }
  if (hit && definition.heavyArmor) {
    const forwardX = -Math.sin(vehicle.yaw);
    const forwardZ = -Math.cos(vehicle.yaw);
    const distance = Math.hypot(hit.d[0], hit.d[2]) || 1;
    const dot = (hit.d[0] * forwardX + hit.d[2] * forwardZ) / distance;
    damage *= dot < -0.5 ? 0.6 : dot > 0.5 ? 1.6 : 1;
  }
  vehicle.hp -= damage;
  const components = vehicle.comp;
  if (components) {
    const fraction = damage / definition.hp;
    if (hit) {
      const rotationX = hit.p[0] - vehicle.x;
      const rotationZ = hit.p[2] - vehicle.z;
      const cosine = Math.cos(-vehicle.yaw);
      const sine = Math.sin(-vehicle.yaw);
      const localZ = -rotationX * sine + rotationZ * cosine;
      const localY = hit.p[1] - vehicle.y;
      if (definition.kind === 'heli') {
        if (localY > 2.7) {
          components.rotor -= fraction * 3;
        } else if (localZ > 3) {
          components.tail -= fraction * 4;
        } else {
          components.engine -= fraction * 1.5;
        }
      } else if (localY < 1.0) {
        components.wheels -= fraction * 3;
      } else if (
        definition.engineRear ? localZ > definition.len * 0.2 : localZ < -definition.len * 0.2
      ) {
        components.engine -= fraction * 3;
      }
    } else {
      components.engine -= fraction * 1.2;
      components.wheels -= fraction * 1.2;
      if (definition.kind === 'heli') {
        components.rotor -= fraction;
        components.tail -= fraction;
      }
    }
    for (const kit of Object.keys(components)) {
      components[kit] = Math.max(0, Math.min(1, components[kit]));
    }
  }
  if (builder) {
    vehicle.lastHit = builder.id;
  }
  if (vehicle.hp > 0) {
    return;
  }
  const now = api.now();
  if (startBurning(room, vehicle, definition, now)) {
    return;
  }
  vehicle.alive = false;
  vehicle.burning = false;
  vehicle.deadAt = now;
  vehicle.rest = false;
  vehicle.restT = 0;
  vehicle.rotor = 0;
  vehicle.engine = 0;
  launchWreck(vehicle, definition);
  const currentKiller = room.players.get(vehicle.lastHit);
  if (currentKiller && currentKiller.team !== vehicle.team) {
    addStat(currentKiller, 'veh');
    const heavy = VEHICLES[vehicle.type].heavyArmor || VEHICLES[vehicle.type].kind === 'heli';
    award(
      currentKiller,
      heavy ? XP.vehHeavy : XP.vehLight,
      `${VEHICLES[vehicle.type].name} destroyed`,
    );
  }
  (room.mil.fleetDown ||= [[], []])[vehicle.team].push({
    type: vehicle.type,
    at: vehicle.deadAt + (VEH_RESPAWN[vehicle.type] || 120000),
  });
  const killer = room.players.get(vehicle.lastHit) || null;
  for (const id of vehicle.seats) {
    const other = id && room.players.get(id);
    if (other && other.alive) {
      killPlayer(room, killer || other, other, width);
    }
  }
  vehicle.seats.fill(0);
  vehicle.driver = 0;
  api.broadcast(room, {
    t: 'vboom',
    id: vehicle.id,
    p: [
      roundToTwoDecimals(vehicle.x),
      roundToTwoDecimals(vehicle.y + 1),
      roundToTwoDecimals(vehicle.z),
    ],
  });
  explode(
    room,
    [vehicle.x, vehicle.y + 1, vehicle.z],
    { radius: 9, dmg: 90, structDmg: 200, vehDmg: 150 },
    killer,
    'vehicle',
    vehicle,
  );
}

const BURN_MIN_MS = 5000;
const BURN_FINISH_FRACTION = 0.15;
const BURN_EXTRA_MS = 3000;
const BURN_MIN_ALTITUDE_M = 4;
const WRECK_KICK_UP = 9;
const WRECK_KICK_SIDE = 4;
const WRECK_SPIN = 2.4;
function startBurning(room, vehicle, definition, now) {
  if (vehicle.burning || definition.kind !== 'heli') {
    return false;
  }
  if (vehicle.y - heightAt(vehicle.x, vehicle.z) < BURN_MIN_ALTITUDE_M) {
    return false;
  }
  vehicle.burning = true;
  vehicle.burnSeed = Math.random() * 10 + 1;
  vehicle.burnUntil = now + BURN_MIN_MS + Math.random() * BURN_EXTRA_MS;
  vehicle.hp = 0;
  for (const id of vehicle.seats) {
    const other = id && room.players.get(id);
    if (other && !other.isBot) {
      api.send(other, { t: 'mmsg', m: 'The helicopter is going down. Bail out!' });
    }
  }
  return true;
}
function launchWreck(vehicle, definition) {
  const heavy = 1 + (definition.mass || 1) * 0.35;
  const angle = Math.random() * Math.PI * 2;
  if (definition.kind !== 'heli') {
    vehicle.vx = -Math.sin(vehicle.yaw) * (vehicle.v || 0);
    vehicle.vz = -Math.cos(vehicle.yaw) * (vehicle.v || 0);
    vehicle.vy = 0;
  }
  vehicle.vx = (vehicle.vx || 0) + (Math.cos(angle) * WRECK_KICK_SIDE) / heavy;
  vehicle.vz = (vehicle.vz || 0) + (Math.sin(angle) * WRECK_KICK_SIDE) / heavy;
  vehicle.vy = Math.max(vehicle.vy || 0, 0) + WRECK_KICK_UP / heavy;
  const spin = WRECK_SPIN / heavy;
  vehicle.tumble = [
    (Math.random() - 0.5) * 2 * spin,
    (Math.random() - 0.5) * 2 * spin,
    (Math.random() - 0.5) * spin,
  ];
  vehicle.v = 0;
}

function explode(room, at, origin, owner, width, skipVeh = null) {
  const mil = room.mil;
  hearShot(room, owner || { id: 0, team: -1 }, at, null, false, api.now());
  for (const other of room.players.values()) {
    if (!other.alive) {
      continue;
    }
    if (owner && other !== owner && other.team === owner.team) {
      continue;
    }
    const chest = [
      other.pos[0],
      other.pos[1] + (other.prone || other.downed ? 0.3 : 1),
      other.pos[2],
    ];
    const distance = dist3(at, chest);
    if (distance > origin.radius || other.veh) {
      continue;
    }
    if (distance > 0.6 && !clearLineMil(mil.world, at, chest)) {
      continue;
    }
    const damage =
      origin.dmg *
      Math.pow(1 - distance / origin.radius, 1.3) *
      (1 - vestOf(other.kit).prot * 0.4) *
      (other.prone ? 0.6 : 1);
    if (damage >= 1) {
      hurtPlayer(room, owner, other, damage, 'body', at, width);
    }
  }
  for (const structure of [...mil.world.structs.values()]) {
    const distance = dist3(at, [structure.x, structure.y + 0.8, structure.z]);
    if (distance < origin.radius * 0.6) {
      damageStruct(room, structure, origin.structDmg * (1 - distance / (origin.radius * 0.6)));
    }
  }
  for (const vehicle of mil.vehicles.values()) {
    if (!vehicle.alive || vehicle === skipVeh) {
      continue;
    }
    const distance = dist3(at, [vehicle.x, vehicle.y + 1, vehicle.z]);
    if (distance < origin.radius * 0.7 + VEHICLES[vehicle.type].len * 0.3) {
      damageVehicle(
        room,
        vehicle,
        origin.vehDmg *
          Math.max(0.2, 1 - distance / (origin.radius * 0.7 + VEHICLES[vehicle.type].len * 0.3)),
        owner,
        width,
      );
    }
  }
}

function sampleHistory(other, now) {
  const history = other.history;
  if (!history.length) {
    return {
      pos: other.pos,
      crouch: other.crouch,
      lean: other.lean,
      yaw: other.yaw,
      prone: other.prone || other.downed,
    };
  }
  const last = history[history.length - 1];
  if (now >= last.t) {
    return last;
  }
  if (now <= history[0].t) {
    return history[0];
  }
  for (let index = history.length - 1; index > 0; index--) {
    if (history[index - 1].t <= now) {
      const area = history[index - 1];
      const newerSample = history[index];
      const fraction = (now - area.t) / (newerSample.t - area.t);
      return {
        pos: [
          area.pos[0] + (newerSample.pos[0] - area.pos[0]) * fraction,
          area.pos[1] + (newerSample.pos[1] - area.pos[1]) * fraction,
          area.pos[2] + (newerSample.pos[2] - area.pos[2]) * fraction,
        ],
        crouch: fraction < 0.5 ? area.crouch : newerSample.crouch,
        lean: area.lean + (newerSample.lean - area.lean) * fraction,
        yaw: newerSample.yaw,
        prone: newerSample.prone,
      };
    }
  }
  return history[0];
}

function fireBullets(
  room,
  player,
  weaponIndex,
  origin,
  direction,
  rewindTime,
  seed,
  ammo,
  carrierVelocity = null,
) {
  const weapon = MW[weaponIndex];
  const config = milClass(weapon);
  const ammoType = AMMO[ammo] || AMMO.fmj;
  const slug = ammoType.slug;
  const directions =
    weapon.pellets && !slug
      ? pelletDirs(direction, seed, weapon.pellets, weapon.pelletSpread * 1.1)
      : [direction];
  const muzzleVelocity = config.v * (ammoType.v || 1);
  for (const direction of directions) {
    room.mil.bullets.push({
      owner: player,
      w: weaponIndex,
      p: [...origin],
      v: [
        direction[0] * muzzleVelocity + (carrierVelocity?.[0] || 0),
        direction[1] * muzzleVelocity + (carrierVelocity?.[1] || 0),
        direction[2] * muzzleVelocity + (carrierVelocity?.[2] || 0),
      ],
      v0: muzzleVelocity,
      k: config.k,
      t: 0,
      rt: rewindTime,
      ammo,
      dmg: weapon.dmg * config.dmg * ammoType.dmg * (slug ? (weapon.pellets || 1) * 0.55 : 1),
      pen:
        (weapon.class === 'sniper'
          ? 2.5
          : weapon.class === 'rifle' || weapon.class === 'mg'
            ? 1.5
            : 0.6) * ammoType.pen,
    });
  }
}

function handleShoot(room, player, message, now) {
  if (!player.alive || player.downed || room.mil.winner >= 0 || (player.knockUntil || 0) > now) {
    return;
  }
  const gunnerVehicle = player.veh && room.mil.vehicles.get(player.veh);
  const gunner =
    !!gunnerVehicle && gunnerVehicle.alive && isGunner(gunnerVehicle.type, player.seat);
  if (player.veh && !gunner) {
    return;
  }
  const weaponIndex = player.mount || gunner ? W.mg : player.weapon;
  const weapon = MW[weaponIndex];
  if (!weapon || message.w !== weaponIndex || weapon.grenade || weapon.bomb || weapon.item) {
    return;
  }
  const refuse = () => {
    if (!player.isBot && !gunner && now - (player.refuseAt || 0) > 400) {
      player.refuseAt = now;
      sendInv(player);
    }
  };
  if (!gunner && (now < player.readyAt || player.reloading)) {
    return refuse();
  }
  if (now < player.nextFire - 150) {
    return refuse();
  }
  let ammo = 'fmj';
  if (!weapon.melee) {
    const magnitude = gunner
      ? gunnerVehicle.gun
      : player.mount
        ? player.mgMag
        : player.inv.loaded[weaponIndex];
    if (!magnitude || magnitude.n <= 0) {
      return refuse();
    }
    magnitude.n--;
    ammo = magnitude.ammo;
  }
  const gunDefinition = gunner ? VEH_GUNS[gunnerVehicle.type] : null;
  player.nextFire =
    Math.max(player.nextFire, now - 40) +
    (gunDefinition ? gunDefinition.interval : weapon.interval) * 1000;
  player.lastShotAt = now;
  player.lastShotQuiet =
    weapon.melee ||
    isSilenced(weapon, player.kit.primary.id === weapon.id ? player.kit.primary : null) ||
    ammo === 'subsonic';
  const eye = eyeOf(player);
  const origin = isVec3(message.o) && dist3(message.o, eye) < 1.2 ? message.o : eye;
  if (!isVec3(message.d)) {
    return;
  }
  const length = Math.hypot(message.d[0], message.d[1], message.d[2]);
  if (length < 0.5 || length > 1.5) {
    return;
  }
  const direction = message.d.map((component) => component / length);
  const rewindTime = Math.min(now, Math.max(now - 350, isNum(message.rt) ? message.rt : now));
  if (weapon.melee) {
    return melee(room, player, weapon, origin, direction, rewindTime);
  }
  if (gunDefinition && gunDefinition.kind !== 'mg') {
    const config = SHELLS[gunDefinition.kind];
    const spawnOrigin = [
      origin[0] + direction[0] * 2.5,
      origin[1] + direction[1] * 2.5,
      origin[2] + direction[2] * 2.5,
    ];
    room.mil.rockets.push({
      owner: player,
      p: spawnOrigin,
      v: direction.map((positionX) => positionX * config.v),
      t: 0,
      cfg: config,
      kind: gunDefinition.kind,
    });
    hearShot(room, player, origin, direction, false, now);
    noticeShot(room, player, origin, direction, now);
    api.broadcast(
      room,
      {
        t: 'rocket',
        i: player.id,
        o: origin.map(roundToThreeDecimals),
        d: direction.map((positionX) => Math.round(positionX * 100000) / 100000),
        k: gunDefinition.kind,
      },
      player.isBot ? null : player,
    );
    return;
  }
  if (weapon.rocket) {
    room.mil.rockets.push({
      owner: player,
      p: [
        origin[0] + direction[0] * 0.8,
        origin[1] + direction[1] * 0.8,
        origin[2] + direction[2] * 0.8,
      ],
      v: direction.map((positionX) => positionX * ROCKET.v),
      t: 0,
    });
    hearShot(room, player, origin, direction, false, now);
    noticeShot(room, player, origin, direction, now);
    api.broadcast(
      room,
      {
        t: 'rocket',
        i: player.id,
        o: origin.map(roundToThreeDecimals),
        d: direction.map((positionX) => Math.round(positionX * 100000) / 100000),
      },
      player.isBot ? null : player,
    );
    return;
  }
  const seed = Number.isInteger(message.sd) ? message.sd : Math.floor(Math.random() * 2 ** 31);
  const bulletCount = room.mil.bullets.length;
  const carrierVelocity = gunner
    ? platformVelocity(gunnerVehicle.type, gunnerVehicle).map(
        (positionX) => Math.round(positionX * 100) / 100,
      )
    : null;
  fireBullets(
    room,
    player,
    weaponIndex,
    origin,
    direction,
    rewindTime,
    seed,
    ammo,
    carrierVelocity,
  );
  hearShot(room, player, origin, direction, player.lastShotQuiet, now);
  noticeShot(room, player, origin, direction, now);
  if (gunDefinition) {
    for (let index = bulletCount; index < room.mil.bullets.length; index++) {
      room.mil.bullets[index].heavy = true;
    }
  }
  const full = JSON.stringify({
    t: 'shot',
    i: player.id,
    o: origin.map(roundToThreeDecimals),
    d: direction.map((component) => Math.round(component * 100000) / 100000),
    w: weaponIndex,
    a: ammo,
    ...(player.lastShotQuiet ? { q: 1 } : null),
    ...(weapon.pellets ? { sd: seed } : null),
    ...(carrierVelocity ? { pv: carrierVelocity } : null),
  });
  let far = null;
  for (const other of room.players.values()) {
    if (other === player || other.isBot) {
      continue;
    }
    if (dist2(other.pos[0], other.pos[2], origin[0], origin[2]) < 900) {
      sendRaw(other, full);
    } else {
      sendRaw(
        other,
        (far ||= JSON.stringify({
          t: 'shot',
          i: player.id,
          o: origin.map(Math.round),
          w: weaponIndex,
          ...(player.lastShotQuiet ? { q: 1 } : null),
        })),
      );
    }
  }
}

function melee(room, player, weapon, origin, direction, rewindTime) {
  for (const other of room.players.values()) {
    if (!other.alive || other.team === player.team || other === player) {
      continue;
    }
    const sample = sampleHistory(other, rewindTime);
    for (const hitbox of milHitboxes(
      sample.pos,
      sample.crouch,
      sample.lean,
      sample.yaw,
      sample.prone,
    )) {
      const hit = rayAABB(origin, direction, hitbox.min, hitbox.max, weapon.reach);
      if (hit) {
        hurtPlayer(
          room,
          player,
          other,
          weapon.dmg * 1.4 * (hitbox.part === 'head' ? 1.5 : 1),
          hitbox.part,
          origin,
          weapon.id,
        );
        return;
      }
    }
  }
}

const eyeOf = (player) => [
  player.pos[0],
  player.pos[1] + (player.prone ? 0.32 : player.crouch ? PLAYER.crouchEye : PLAYER.eye),
  player.pos[2],
];

function tickBullets(room, now) {
  const mil = room.mil;
  const steps = Math.round(TICK_MS / 1000 / BULLET_DT);
  mil.bullets = mil.bullets.filter((bullet) => {
    for (let step = 0; step < steps; step++) {
      const area = [bullet.p[0], bullet.p[1], bullet.p[2]];
      stepBullet(bullet);
      const seg = [bullet.p[0] - area[0], bullet.p[1] - area[1], bullet.p[2] - area[2]];
      const length = Math.hypot(seg[0], seg[1], seg[2]);
      if (length < 1e-6) {
        continue;
      }
      const direction = [seg[0] / length, seg[1] / length, seg[2] / length];
      if (resolveSegment(room, bullet, area, direction, length, now)) {
        return false;
      }
      if (
        bullet.t > MIL.maxBulletTime ||
        !inBounds(bullet.p[0], bullet.p[2], -50) ||
        bullet.p[1] < -50
      ) {
        return false;
      }
    }
    return true;
  });
}

function resolveSegment(room, bullet, origin, direction, length, now) {
  const mil = room.mil;
  const wallHit = rayWorld(mil.world, origin, direction, length, { pen: bullet.pen });
  const worldT = wallHit ? wallHit.t : length;
  let maxT = worldT;
  let hitVeh = null;
  const vehicleHits = [];
  for (const vehicle of mil.vehicles.values()) {
    if (
      !vehicle.alive ||
      Math.abs(vehicle.x - origin[0]) > length + 15 ||
      Math.abs(vehicle.z - origin[2]) > length + 15
    ) {
      continue;
    }
    if (bullet.owner.veh === vehicle.id) {
      continue;
    }
    const vehicleHit = rayVehicle(vehicle, origin, direction, worldT);
    if ((vehicleHit ?? null) !== null) {
      vehicleHits.push({ v: vehicle, t: vehicleHit });
      if (vehicleHit < maxT) {
        maxT = vehicleHit;
        hitVeh = vehicle;
      }
    }
  }
  const limitFor = (other) => {
    if (!other.veh) {
      return maxT;
    }
    let limit = worldT;
    for (const hit of vehicleHits) {
      if (hit.v.id !== other.veh && hit.t < limit) {
        limit = hit.t;
      }
    }
    return limit;
  };
  const when = Math.min(now, bullet.rt + bullet.t * 1000);
  let best = null;
  for (const other of room.players.values()) {
    if (!other.alive || other === bullet.owner || other.team === bullet.owner.team) {
      continue;
    }
    if (other.veh && !seatExposed(mil.vehicles.get(other.veh)?.type, other.seat)) {
      continue;
    }
    const sample = sampleHistory(other, when);
    if (
      Math.abs(sample.pos[0] - origin[0]) > length + 2 ||
      Math.abs(sample.pos[2] - origin[2]) > length + 2
    ) {
      continue;
    }
    const limit = limitFor(other);
    for (const hitbox of milHitboxes(
      sample.pos,
      sample.crouch,
      sample.lean,
      sample.yaw,
      sample.prone,
    )) {
      const hit = rayAABB(
        origin,
        direction,
        hitbox.min,
        hitbox.max,
        best ? Math.min(best.t, limit) : limit,
      );
      if (hit && (!best || hit.t < best.t)) {
        best = { t: hit.t, q: other, part: hitbox.part };
      }
    }
  }
  const supplyPoint = Math.hypot(bullet.v[0], bullet.v[1], bullet.v[2]);
  const velocityFactor = Math.max(0.35, Math.min(1, Math.pow(supplyPoint / bullet.v0, 1.5)));
  const ammoType = AMMO[bullet.ammo] || AMMO.fmj;
  if (best) {
    const other = best.q;
    const weapon = MW[bullet.w];
    if (best.part === 'body' && Math.random() < 0.3) {
      best.part = 'arms';
    }
    let mult =
      PART_MULT_MIL[best.part] *
      velocityFactor *
      (wallHit && wallHit.t < best.t ? wallHit.mult : 1);
    const weak = weapon.class === 'pistol' || weapon.class === 'smg' || weapon.class === 'shotgun';
    const armor = (prot) => 1 - Math.min(0.9, prot * (weak ? 1.5 : 1) * ammoType.armor);
    if (best.part === 'body') {
      mult *= armor(vestOf(other.kit).prot);
    }
    if (best.part === 'head') {
      mult *= armor(helmetOf(other.kit).prot * 1.07);
    }
    const at = [
      origin[0] + direction[0] * best.t,
      origin[1] + direction[1] * best.t,
      origin[2] + direction[2] * best.t,
    ];
    const hitMessage = JSON.stringify({
      t: 'bhit',
      v: other.id,
      p: at.map(roundToTwoDecimals),
      h: best.part === 'head' ? 1 : 0,
      o: origin.map(roundToTwoDecimals),
    });
    for (const hit of room.players.values()) {
      if (
        !hit.isBot &&
        (hit === bullet.owner || dist2(hit.pos[0], hit.pos[2], at[0], at[2]) < 500)
      ) {
        sendRaw(hit, hitMessage);
      }
    }
    hurtPlayer(room, bullet.owner, other, bullet.dmg * mult, best.part, origin, weapon.id);
    return true;
  }
  if (hitVeh) {
    const at = [
      origin[0] + direction[0] * maxT,
      origin[1] + direction[1] * maxT,
      origin[2] + direction[2] * maxT,
    ];
    damageVehicle(
      room,
      hitVeh,
      bullet.dmg *
        velocityFactor *
        VEHICLES[hitVeh.type].armor *
        (bullet.ammo === 'ap' ? 2.2 : 1) *
        (bullet.heavy ? 3 : 1),
      bullet.owner,
      MW[bullet.w].id,
      { p: at, d: direction },
    );
    return true;
  }
  if (wallHit) {
    const structure =
      (wallHit.box?.sid ?? null) !== null ? mil.world.structs.get(wallHit.box.sid) : null;
    if (structure) {
      damageStruct(
        room,
        structure,
        bullet.dmg * velocityFactor * (STRUCTS[structure.type]?.bulletMult ?? 0.1) * ammoType.pen,
      );
    }
    if (ricochet(bullet, direction, wallHit)) {
      bullet.dmg *= 0.5;
      return false;
    }
    return true;
  }
  return false;
}

function tickRockets(room) {
  const mil = room.mil;
  const deltaTime = TICK_MS / 1000;
  mil.rockets = mil.rockets.filter((hit) => {
    const area = [...hit.p];
    const config = hit.cfg || ROCKET;
    hit.v[1] -= config.g * deltaTime;
    hit.p[0] += hit.v[0] * deltaTime;
    hit.p[1] += hit.v[1] * deltaTime;
    hit.p[2] += hit.v[2] * deltaTime;
    hit.t += deltaTime;
    const seg = [hit.p[0] - area[0], hit.p[1] - area[1], hit.p[2] - area[2]];
    const length = Math.hypot(...seg);
    const direction = seg.map((component) => component / length);
    let hitT = Infinity;
    let veh = null;
    const wallHit = rayWorld(mil.world, area, direction, length);
    if (wallHit) {
      hitT = wallHit.t;
    }
    for (const vehicle of mil.vehicles.values()) {
      if (!vehicle.alive || hit.owner.veh === vehicle.id) {
        continue;
      }
      const vehicleHit = rayVehicle(vehicle, area, direction, Math.min(length, hitT));
      if ((vehicleHit ?? null) !== null && vehicleHit < hitT) {
        hitT = vehicleHit;
        veh = vehicle;
      }
    }
    for (const other of room.players.values()) {
      if (!other.alive || other === hit.owner || other.team === hit.owner.team) {
        continue;
      }
      for (const hitbox of milHitboxes(
        other.pos,
        other.crouch,
        other.lean,
        other.yaw,
        other.prone || other.downed,
      )) {
        const hitResult = rayAABB(area, direction, hitbox.min, hitbox.max, Math.min(length, hitT));
        if (hitResult && hitResult.t < hitT) {
          hitT = hitResult.t;
        }
      }
    }
    if (hitT < Infinity || hit.t > config.maxT || !inBounds(hit.p[0], hit.p[2])) {
      const at =
        hitT < Infinity
          ? area.map((component, index) => component + direction[index] * Math.max(0, hitT - 0.2))
          : hit.p;
      const width = hit.kind || 'rpg';
      api.broadcast(room, {
        t: 'rboom',
        p: at.map(roundToTwoDecimals),
        ...(config.small ? { s: 1 } : null),
      });
      if (veh) {
        damageVehicle(room, veh, config.vehDmg * config.direct, hit.owner, width, {
          p: at,
          d: direction,
        });
      }
      explode(room, at, config, hit.owner, width, veh);
      return false;
    }
    return true;
  });
}

function handleNade(room, player, message, now) {
  const weaponIndex = player.weapon;
  const weapon = MW[weaponIndex];
  if (
    !player.alive ||
    player.downed ||
    player.veh ||
    !weapon?.grenade ||
    message.w !== weaponIndex ||
    now < player.readyAt
  ) {
    return;
  }
  const id = weapon.id === 'he' ? 'he' : 'smoke';
  if (!(player.inv.items[id] > 0) || !isVec3(message.d)) {
    return;
  }
  const length = Math.hypot(message.d[0], message.d[1], message.d[2]);
  if (length < 0.5 || length > 1.5) {
    return;
  }
  const direction = message.d.map((component) => component / length);
  const eye = eyeOf(player);
  const origin = isVec3(message.o) && dist3(message.o, eye) < 1.2 ? message.o : eye;
  useItem(player, id);
  player.readyAt = now + 400;
  const nextId = room.mil.nadeId++;
  room.mil.nades.push({
    id: nextId,
    owner: player,
    w: weaponIndex,
    kind: weapon.grenade,
    n: nadeStartMil(origin, direction, !!message.lob),
    t0: now,
    acc: 0,
  });
  api.broadcast(room, {
    t: 'nade',
    id: nextId,
    i: player.id,
    w: weaponIndex,
    o: origin.map(roundToThreeDecimals),
    d: direction.map(roundToThreeDecimals),
    lob: message.lob ? 1 : 0,
  });
  sendInv(player);
}

function tickNades(room, now) {
  const mil = room.mil;
  mil.nades = mil.nades.filter((nade) => {
    nade.acc += TICK_MS;
    while (nade.acc >= NADE_MIL.dt * 1000) {
      stepNadeMil(nade.n, mil.world);
      nade.acc -= NADE_MIL.dt * 1000;
    }
    if (nade.kind === 'he' && now - nade.t0 >= NADE_MIL.fuseMs) {
      const at = [nade.n.x, nade.n.y + 0.25, nade.n.z];
      api.broadcast(room, { t: 'he', id: nade.id, p: at.map(roundToTwoDecimals) });
      explode(room, at, HE_MIL, nade.owner, 'he');
      return false;
    }
    if (nade.kind === 'smoke' && (nade.n.rest || now - nade.t0 >= NADE_MIL.smokeMaxMs)) {
      api.broadcast(room, {
        t: 'smoke',
        id: nade.id,
        p: [
          roundToTwoDecimals(nade.n.x),
          roundToTwoDecimals(nade.n.y),
          roundToTwoDecimals(nade.n.z),
        ],
      });
      return false;
    }
    return true;
  });
}

function handleMortar(room, player, message, now) {
  const mil = room.mil;
  const structure = mil.world.structs.get(player.mount);
  if (
    !player.alive ||
    player.downed ||
    !structure ||
    structure.type !== 'mortar' ||
    structure.team !== player.team
  ) {
    return;
  }
  if (now < (player.mortarReady || 0)) {
    return;
  }
  const startZ = Number(message.az);
  const element = Math.max(MORTAR.minEl, Math.min(MORTAR.maxEl, Number(message.el)));
  if (!isNum(startZ) || !isNum(element)) {
    return;
  }
  const area = areaAt(room, player.team, structure.x, structure.z, false);
  if (area && !spendArea(area, MIL.mortarShellCost)) {
    return api.send(player, { t: 'mmsg', m: 'No supply for mortar shells.' });
  }
  player.mortarReady = now + MORTAR.cooldown * 1000;
  const azr = (startZ * Math.PI) / 180 + (Math.random() - 0.5) * 0.012;
  const elr = (element * Math.PI) / 180 + (Math.random() - 0.5) * 0.008;
  const muzzleVelocity = MORTAR.v * (1 + (Math.random() - 0.5) * 0.012);
  const origin = [structure.x, structure.y + 1.0, structure.z];
  const velocity = [
    Math.sin(azr) * Math.cos(elr) * muzzleVelocity,
    Math.sin(elr) * muzzleVelocity,
    -Math.cos(azr) * Math.cos(elr) * muzzleVelocity,
  ];
  mil.shells.push({ owner: player, p: origin, v: velocity, t: 0 });
  api.broadcast(room, {
    t: 'mfire',
    p: origin.map(roundToTwoDecimals),
    v: velocity.map(roundToThreeDecimals),
    i: player.id,
  });
}

function tickShells(room) {
  const mil = room.mil;
  const deltaTime = TICK_MS / 1000;
  mil.shells = mil.shells.filter((shell) => {
    const area = [...shell.p];
    shell.v[1] -= MIL.gravity * deltaTime;
    shell.p[0] += shell.v[0] * deltaTime;
    shell.p[1] += shell.v[1] * deltaTime;
    shell.p[2] += shell.v[2] * deltaTime;
    shell.t += deltaTime;
    const seg = [shell.p[0] - area[0], shell.p[1] - area[1], shell.p[2] - area[2]];
    const length = Math.hypot(...seg);
    const hit = rayWorld(
      mil.world,
      area,
      seg.map((component) => component / length),
      length,
    );
    if (hit || shell.t > 60 || !inBounds(shell.p[0], shell.p[2])) {
      const at = hit ? hit.point : shell.p;
      api.broadcast(room, { t: 'mboom', p: at.map(roundToTwoDecimals) });
      explode(
        room,
        [at[0], at[1] + 0.3, at[2]],
        {
          radius: MORTAR.radius,
          dmg: MORTAR.dmg,
          structDmg: MORTAR.structDmg,
          vehDmg: MORTAR.vehDmg,
        },
        shell.owner,
        'mortar',
      );
      return false;
    }
    return true;
  });
}

const BUILD_ROAD_CLEAR_M = 6;
export function handleBuild(room, player, message) {
  selectMilMap(room.milMap);
  const mil = room.mil;
  const type = String(message.k || '');
  const definition = STRUCTS[type];
  if (
    !definition ||
    !player.alive ||
    player.downed ||
    player.veh ||
    !isNum(message.x) ||
    !isNum(message.z)
  ) {
    return;
  }
  const fail = (message) => api.send(player, { t: 'mmsg', m: message });
  if (!(player.inv.items.shovel > 0)) {
    return fail('Only engineers can build.');
  }
  const rotation = Math.round(((((Number(message.rot) || 0) % 4) + 4) % 4) * 90) / 90;
  const { x: positionX, z: positionZ } = message;
  if (dist2(positionX, positionZ, player.pos[0], player.pos[2]) > MIL.buildReach + 3) {
    return fail('Too far.');
  }
  if (!inBounds(positionX, positionZ, 20)) {
    return fail('Out of bounds.');
  }
  if (roadDistanceAt(positionX, positionZ) < BUILD_ROAD_CLEAR_M) {
    return fail('Too close to the road.');
  }
  let area = null;
  let truck = null;
  if (definition.fob) {
    if (
      [...mil.fobs.values()].filter((footprint) => footprint.team === player.team).length >=
      MIL.maxFobs
    ) {
      return fail(`Max ${MIL.maxFobs} FOBs per team.`);
    }
    for (const footprint of mil.fobs.values()) {
      if (dist2(footprint.x, footprint.z, positionX, positionZ) < MIL.fobMinDist) {
        return fail(`Too close to FOB ${footprint.name} (min. ${MIL.fobMinDist} m).`);
      }
    }
    for (const mainBase of MAIN_BASES) {
      if (
        dist2(mainBase.x, mainBase.z, positionX, positionZ) <
        mainBase.r + (mainBase.team === player.team ? 60 : 200)
      ) {
        return fail(
          mainBase.team === player.team
            ? 'Too close to your main base.'
            : "Can't build a FOB near the enemy main base.",
        );
      }
    }
    for (const sector of SECTORS) {
      if (dist2(sector.x, sector.z, positionX, positionZ) < sector.r + 40) {
        return fail(`Too close to objective ${sector.id}. Build outside the capture area.`);
      }
    }
    for (const vehicle of mil.vehicles.values()) {
      if (
        vehicle.alive &&
        vehicle.type === 'truck' &&
        vehicle.cargo >= MIL.fobCost &&
        dist2(vehicle.x, vehicle.z, positionX, positionZ) < 35
      ) {
        truck = vehicle;
      }
    }
    if (!truck) {
      return fail(`Needs a supply truck with ${MIL.fobCost}+ supply within 35 m.`);
    }
  } else {
    area = areaAt(room, player.team, positionX, positionZ, false);
    if (!area) {
      return fail('Build inside a friendly sector or FOB.');
    }
    if (area.store < definition.cost) {
      return fail(`Not enough supply (${definition.cost} needed).`);
    }
    const inArea = [...mil.world.structs.values()].filter(
      (structure) => structure.team === player.team && structure.area === area.id,
    );
    const limit = area.kind === 'fob' ? MIL.structLimitFob : MIL.structLimitSector;
    if (inArea.length >= limit) {
      return fail(`Structure limit reached here (${limit}).`);
    }
    if (mil.world.structs.size >= MIL.structLimitMap) {
      return fail(
        `Map structure limit reached (${MIL.structLimitMap}). Dismantle old defenses first.`,
      );
    }
    if (
      definition.limit &&
      inArea.filter((structure) => structure.type === type).length >= definition.limit
    ) {
      return fail(`Max ${definition.limit} ${definition.name} here.`);
    }
  }
  const positionY = heightAt(positionX, positionZ);
  if (waterDepth(positionX, positionZ) > 0.2) {
    return fail("Can't build in water.");
  }
  const currentFootprint = structureFootprint(type, positionX, positionY, positionZ, rotation);
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (const [centerX, centerZ] of [
    [currentFootprint.min[0], currentFootprint.min[2]],
    [currentFootprint.max[0], currentFootprint.min[2]],
    [currentFootprint.min[0], currentFootprint.max[2]],
    [currentFootprint.max[0], currentFootprint.max[2]],
  ]) {
    const holder = heightAt(centerX, centerZ);
    minHeight = Math.min(minHeight, holder);
    maxHeight = Math.max(maxHeight, holder);
  }
  if (maxHeight - minHeight > (definition.flat ?? 1.6)) {
    return fail(definition.flat ? `${definition.name} needs flatter ground.` : 'Ground too steep.');
  }
  if (structureBlocked(mil.world, type, positionX, positionY, positionZ, rotation)) {
    return fail('Something is in the way.');
  }
  for (const other of room.players.values()) {
    if (
      other.alive &&
      type !== 'wire' &&
      other.pos[0] > currentFootprint.min[0] - 0.3 &&
      other.pos[0] < currentFootprint.max[0] + 0.3 &&
      other.pos[2] > currentFootprint.min[2] - 0.3 &&
      other.pos[2] < currentFootprint.max[2] + 0.3
    ) {
      return fail('Someone is standing there.');
    }
  }
  for (const vehicle of mil.vehicles.values()) {
    if (
      vehicle.alive &&
      dist2(vehicle.x, vehicle.z, positionX, positionZ) < VEHICLES[vehicle.type].len / 2 + 2
    ) {
      return fail('A vehicle is in the way.');
    }
  }
  if (definition.fob) {
    truck.cargo -= MIL.fobCost;
  } else {
    spendArea(area, definition.cost);
  }
  const currentStructure = {
    id: mil.structId++,
    type,
    x: positionX,
    y: positionY,
    z: positionZ,
    rot: rotation,
    team: player.team,
    hp: definition.hp * (player.isBot ? 1 : 0.25),
    area: area ? area.id : null,
    prog: player.isBot ? 1 : 0,
  };
  addStructure(mil.world, currentStructure);
  if (currentStructure.prog >= 1) {
    finishStruct(room, currentStructure, player);
  }
  api.broadcast(room, { t: 'stadd', s: structMsg(currentStructure) });
  return true;
}

function finishStruct(room, structure, builder) {
  const mil = room.mil;
  const definition = STRUCTS[structure.type];
  structure.prog = 1;
  structure.hp = definition.hp;
  if (definition.fob) {
    structure.area = `F${structure.id}`;
    const names = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];
    mil.fobs.set(structure.id, {
      id: structure.id,
      sid: structure.id,
      team: structure.team,
      x: structure.x,
      z: structure.z,
      store: 0,
      name: names[structure.id % names.length],
    });
  }
  if (builder && !builder.isBot) {
    addStat(builder, 'built');
    award(
      builder,
      STRUCTS[structure.type]?.fob ? XP.fob : XP.built,
      STRUCTS[structure.type]?.fob ? 'FOB built' : 'Structure built',
    );
  }
}
function handleConstruct(room, player, message) {
  const structure = room.mil.world.structs.get(message.id);
  if (
    !structure ||
    structure.prog >= 1 ||
    structure.team !== player.team ||
    !player.alive ||
    player.downed ||
    player.veh ||
    dist2(structure.x, structure.z, player.pos[0], player.pos[2]) > 5
  ) {
    return;
  }
  if (!(player.inv.items.shovel > 0)) {
    return;
  }
  const now = api.now();
  if (now - (player.lastConstruct || 0) < 450) {
    return;
  }
  const deltaTime = Math.min(1, (now - (player.lastConstruct || now - 500)) / 1000);
  player.lastConstruct = now;
  structure.prog = Math.min(1, structure.prog + deltaTime / buildTimeOf(structure.type));
  structure.hp = Math.max(
    structure.hp,
    STRUCTS[structure.type].hp * (0.25 + 0.75 * structure.prog),
  );
  if (structure.prog >= 1) {
    finishStruct(room, structure, player);
  }
  api.broadcast(room, {
    t: 'stprog',
    id: structure.id,
    p: Math.round(structure.prog * 100),
    hp: Math.round(structure.hp),
  });
}

function handleUnbuild(room, player, message) {
  const mil = room.mil;
  const structure = mil.world.structs.get(message.id);
  if (
    !structure ||
    !player.alive ||
    player.downed ||
    structure.team !== player.team ||
    dist2(structure.x, structure.z, player.pos[0], player.pos[2]) > 6
  ) {
    return;
  }
  if (!(player.inv.items.shovel > 0)) {
    return api.send(player, { t: 'mmsg', m: 'Only engineers can dismantle.' });
  }
  const area = areaAt(room, player.team, structure.x, structure.z, false);
  if (area && area.ref && structure.type !== 'fob') {
    area.ref.store = Math.min(
      area.kind === 'fob' ? MIL.fobMax : MIL.sectorMax,
      area.ref.store +
        Math.floor(STRUCTS[structure.type].cost * ((structure.prog ?? 1) < 1 ? 0.9 : 0.5)),
    );
  }
  destroyStruct(room, structure, false);
}

function nearUse(room, player, kind, hit = 3.2) {
  const mil = room.mil;
  let best = null;
  for (const structure of mil.world.structs.values()) {
    if (structure.team !== player.team || (structure.prog ?? 1) < 1) {
      continue;
    }
    const ok =
      kind === 'ammo'
        ? structure.type === 'ammo'
        : kind === 'medical'
          ? structure.type === 'medical'
          : kind === 'mount'
            ? structure.type === 'mg' || structure.type === 'mortar'
            : false;
    if (!ok) {
      continue;
    }
    const direction = dist2(structure.x, structure.z, player.pos[0], player.pos[2]);
    if (direction < hit && (!best || direction < best.d)) {
      best = { s: structure, d: direction };
    }
  }
  return best?.s || null;
}
function nearArsenal(room, player) {
  for (const useState of MAPDATA.uses) {
    if (
      useState.team === player.team &&
      dist2(useState.x, useState.z, player.pos[0], player.pos[2]) < 4
    ) {
      return { kind: 'main' };
    }
  }
  const structure = nearUse(room, player, 'ammo', 3.2);
  return structure ? { kind: 'crate', s: structure } : null;
}

function handleUse(room, player, message) {
  if (!player.alive || player.downed || player.veh) {
    return;
  }
  if (message.k === 'ammo') {
    const main = MAPDATA.uses.some(
      (useState) =>
        useState.team === player.team &&
        dist2(useState.x, useState.z, player.pos[0], player.pos[2]) < 4,
    );
    const structure = main ? null : nearUse(room, player, 'ammo');
    if (!main && !structure) {
      return;
    }
    if (!main) {
      const area = areaAt(room, player.team, structure.x, structure.z, false);
      if (!area || !spendArea(area, MIL.resupplyCost)) {
        return api.send(player, { t: 'mmsg', m: 'No supply here.' });
      }
    }
    const current = player.weapon;
    applyKit(player, player.kit);
    player.weapon = player.slots.includes(current) ? current : player.slots[0];
    sendInv(player, { msg: 'Resupplied.' });
  } else if (message.k === 'heal') {
    const structure = nearUse(room, player, 'medical');
    if (
      !structure ||
      (player.hp >= MIL.hp &&
        !player.bleed &&
        !(player.wounds?.arms || player.wounds?.legs) &&
        (player.inv.items.bandage || 0) >= 2)
    ) {
      return;
    }
    const area = areaAt(room, player.team, structure.x, structure.z, false);
    if (area && !spendArea(area, MIL.healCost)) {
      return api.send(player, { t: 'mmsg', m: 'No supply here.' });
    }
    player.hp = MIL.hp;
    player.bleed = 0;
    player.wounds = { arms: 0, legs: 0 };
    player.inv.items.bandage = Math.max(player.inv.items.bandage || 0, 2);
    refreshHolder(player);
    api.send(player, { t: 'mheal', hp: player.hp });
    sendMed(player);
    sendInv(player);
  } else if (message.k === 'mount') {
    if (player.mount) {
      player.mount = 0;
      api.send(player, { t: 'mmount', id: 0 });
      return;
    }
    const structure = nearUse(room, player, 'mount');
    if (!structure) {
      return;
    }
    if ([...room.players.values()].some((other) => other.mount === structure.id)) {
      return api.send(player, { t: 'mmsg', m: 'Someone is already using it.' });
    }
    player.mount = structure.id;
    const [mountX, mountZ] = mountSpot(structure);
    player.ms.x = mountX;
    player.ms.z = mountZ;
    player.ms.vx = 0;
    player.ms.vz = 0;
    player.pos = [mountX, player.ms.y, mountZ];
    if (structure.type === 'mg' && (!player.mgMag || player.mgFor !== structure.id)) {
      player.mgMag = { cal: '5.56 belt', size: 200, n: 200, ammo: 'tracer' };
      player.mgFor = structure.id;
    }
    api.send(player, {
      t: 'mmount',
      id: structure.id,
      k: structure.type,
      am: structure.type === 'mg' ? [W.mg, player.mgMag.n, 'tracer', 200] : null,
    });
  } else if (message.k === 'repair') {
    const vehicle = room.mil.vehicles.get(message.id);
    if (
      !vehicle ||
      !vehicle.alive ||
      !(player.inv.items.shovel > 0) ||
      dist2(vehicle.x, vehicle.z, player.pos[0], player.pos[2]) > VEHICLES[vehicle.type].len / 2 + 3
    ) {
      return;
    }
    const now = api.now();
    if (now - (player.lastRepair || 0) < 900) {
      return;
    }
    player.lastRepair = now;
    const area = areaAt(room, player.team, vehicle.x, vehicle.z);
    const fast = area && spendArea(area, 4);
    const hpBefore = vehicle.hp;
    vehicle.hp = Math.min(VEHICLES[vehicle.type].hp, vehicle.hp + (fast ? 220 : 60));
    if (vehicle.team === player.team) {
      award(player, ((vehicle.hp - hpBefore) / 220) * XP.repair, 'Vehicle repaired');
    }
    if (vehicle.comp) {
      for (const kit of Object.keys(vehicle.comp)) {
        vehicle.comp[kit] = Math.min(1, vehicle.comp[kit] + (fast ? 0.35 : 0.1));
      }
    }
    if (vehicle.flipped) {
      vehicle.flipped = 0;
      vehicle.roll = 0;
      vehicle.rest = false;
    }
  }
}

function handleItem(room, player, message, now) {
  if (!player.alive || player.downed) {
    return;
  }
  const id = message.k === 'medkit' ? 'medkit' : 'bandage';
  const weapon = MW[W[id]];
  if (message.on) {
    if (!(player.inv.items[id] > 0)) {
      return;
    }
    player.useItem = { id, t0: now, target: Number.isInteger(message.tg) ? message.tg : player.id };
    return;
  }
  const useState = player.useItem;
  player.useItem = null;
  if (
    !useState ||
    useState.id !== id ||
    !message.done ||
    now - useState.t0 < weapon.use * 1000 - 300
  ) {
    return;
  }
  const other = room.players.get(useState.target) || player;
  if (
    !other.alive ||
    other.team !== player.team ||
    (other !== player && dist2(other.pos[0], other.pos[2], player.pos[0], player.pos[2]) > 3)
  ) {
    return;
  }
  if (other.downed && id === 'medkit') {
    return;
  }
  if (id === 'medkit' && player.kit.cls !== 'medic') {
    return;
  }
  if (!useItem(player, id)) {
    return;
  }
  if (id === 'bandage') {
    other.bleed = other.bleed >= 3 ? 1 : 0;
    if (!other.downed) {
      other.hp = Math.min(MIL.hp, other.hp + weapon.heal);
    } else if (!other.bleed) {
      other.downedUntil = Math.min(
        api.now() + MIL.downedMaxMs,
        other.downedUntil + MIL.stableExtendMs,
      );
      api.send(other, {
        t: 'mdown',
        until: other.downedUntil - api.now(),
        stable: 1,
        giveUp: Math.max(0, MIL.giveUpAfterMs - (api.now() - other.downedAt)),
      });
    }
  } else {
    other.bleed = 0;
    other.hp = Math.min(MIL.hp, other.hp + weapon.heal);
    other.wounds = { arms: (other.wounds?.arms || 0) * 0.3, legs: (other.wounds?.legs || 0) * 0.3 };
  }
  if (other !== player) {
    addStat(player, 'heal');
    award(player, XP.heal, 'Treated a teammate');
  }
  api.send(other, { t: 'mheal', hp: other.hp, by: player !== other ? player.name : null, k: id });
  sendMed(other);
  sendInv(player);
}

function handleRevive(room, player, message, now) {
  if (!player.alive || player.downed || player.veh) {
    return;
  }
  if (!message.on) {
    player.reviving = null;
    return;
  }
  const other = room.players.get(message.id);
  if (!other || !other.downed || other.team !== player.team || other.veh) {
    return;
  }
  if (dist2(other.pos[0], other.pos[2], player.pos[0], player.pos[2]) > 3) {
    return;
  }
  const medic = player.kit.cls === 'medic' && player.inv.items.medkit > 0;
  if (!medic && other.bleed) {
    return api.send(player, { t: 'mmsg', m: `${other.name} is still bleeding. Bandage first.` });
  }
  player.reviving = { id: other.id, t0: now, medic, dur: medic ? MIL.reviveMs : MIL.reviveMsBasic };
}

function toggleDoor(room, id, open) {
  const mil = room.mil;
  const door = doorById(id);
  if (!door) {
    return false;
  }
  if (!open) {
    const box = door.box;
    for (const other of room.players.values()) {
      if (
        other.alive &&
        other.pos[0] + 0.35 > box.min[0] &&
        other.pos[0] - 0.35 < box.max[0] &&
        other.pos[2] + 0.35 > box.min[2] &&
        other.pos[2] - 0.35 < box.max[2] &&
        other.pos[1] < box.max[1] &&
        other.pos[1] + 1.7 > box.min[1]
      ) {
        return false;
      }
    }
  }
  if (!setDoor(mil.world, id, open)) {
    return false;
  }
  api.broadcast(room, { t: 'mdoor', id, o: open ? 1 : 0 });
  return true;
}
function handleDoor(room, player, message) {
  const door = doorById(message.id | 0);
  if (!door || !player.alive || player.downed || player.veh) {
    return;
  }
  const centerX = (door.box.min[0] + door.box.max[0]) / 2;
  const centerZ = (door.box.min[2] + door.box.max[2]) / 2;
  if (dist2(centerX, centerZ, player.pos[0], player.pos[2]) > 3) {
    return;
  }
  toggleDoor(room, door.id, !room.mil.world.doorOpen.get(door.id));
}
function teamMarkers(room, team, viewer) {
  const now = api.now();
  const list = [];
  for (const [kit, marker] of room.mil.markers[team]) {
    if (now - marker.t > marker.life) {
      room.mil.markers[team].delete(kit);
    } else if (marker.scope === 'team' || !viewer || marker.sq === viewer.squad) {
      list.push([
        marker.k,
        roundToTwoDecimals(marker.x),
        roundToTwoDecimals(marker.z),
        marker.by,
        marker.scope === 'squad' ? SQUADS[marker.sq] : '',
      ]);
    }
  }
  return list;
}
function sendMarkers(room, team) {
  for (const other of room.players.values()) {
    if (other.team === team && !other.isBot) {
      api.send(other, { t: 'mmarks', l: teamMarkers(room, team, other) });
    }
  }
}
function handleMarker(room, player, message) {
  const mil = room.mil;
  const lead = isLeader(room, player);
  if (message.clear) {
    for (const kit of [...mil.markers[player.team].keys()]) {
      if (kit.startsWith(`${player.id}:`)) {
        mil.markers[player.team].delete(kit);
      }
    }
  } else {
    if (
      !MARKER_TYPES[message.k] ||
      !isNum(message.x) ||
      !isNum(message.z) ||
      !inBounds(message.x, message.z)
    ) {
      return;
    }
    if (!lead && message.k !== 'enemy' && message.k !== 'mortar') {
      return api.send(player, {
        t: 'mmsg',
        m: 'Only the squad leader places orders. You can still mark enemies and mortar targets.',
      });
    }
    const scope = lead ? MARKER_TYPES[message.k] : 'squad';
    mil.markers[player.team].set(`${player.id}:${message.k}`, {
      k: message.k,
      x: message.x,
      z: message.z,
      t: api.now(),
      by: player.name,
      scope,
      sq: player.squad,
      life: lead ? 300000 : 60000,
    });
  }
  sendMarkers(room, player.team);
}

function stopDrag(room, player) {
  if (!player) {
    return;
  }
  if (player.dragging) {
    const other = room.players.get(player.dragging);
    if (other) {
      other.draggedBy = 0;
    }
    player.dragging = 0;
    if (!player.isBot) {
      api.send(player, { t: 'mdrag', id: 0 });
    }
  }
  if (player.draggedBy) {
    const direction = room.players.get(player.draggedBy);
    if (direction) {
      direction.dragging = 0;
      if (!direction.isBot) {
        api.send(direction, { t: 'mdrag', id: 0 });
      }
    }
    player.draggedBy = 0;
  }
}
function handleDrag(room, player, message) {
  if (!message.on || player.dragging) {
    return stopDrag(room, player);
  }
  const other = room.players.get(message.id);
  if (
    !other ||
    !other.downed ||
    other.veh ||
    other.draggedBy ||
    other.team !== player.team ||
    !player.alive ||
    player.downed ||
    player.veh ||
    player.mount
  ) {
    return;
  }
  if (dist2(other.pos[0], other.pos[2], player.pos[0], player.pos[2]) > 2.8) {
    return;
  }
  player.dragging = other.id;
  other.draggedBy = player.id;
  player.reviving = null;
  api.send(player, { t: 'mdrag', id: other.id });
}
function tickDrag(room) {
  for (const player of room.players.values()) {
    if (!player.dragging) {
      continue;
    }
    const other = room.players.get(player.dragging);
    if (!other || !other.downed || !player.alive || player.downed || player.veh) {
      stopDrag(room, player);
      continue;
    }
    const forwardX = -Math.sin(player.yaw);
    const forwardZ = -Math.cos(player.yaw);
    const positionX = player.pos[0] - forwardX * 1.1;
    const positionZ = player.pos[2] - forwardZ * 1.1;
    other.ms.x = positionX;
    other.ms.z = positionZ;
    other.ms.y = Math.max(heightAt(positionX, positionZ), player.pos[1] - 0.3);
    other.pos = [other.ms.x, other.ms.y, other.ms.z];
  }
}

function tickRevives(room, now) {
  for (const player of room.players.values()) {
    if (!player.reviving) {
      continue;
    }
    const other = room.players.get(player.reviving.id);
    if (
      !player.alive ||
      player.downed ||
      !other ||
      !other.downed ||
      dist2(other.pos[0], other.pos[2], player.pos[0], player.pos[2]) > 3.5
    ) {
      player.reviving = null;
      continue;
    }
    if (now - player.reviving.t0 >= (player.reviving.dur || MIL.reviveMs)) {
      const medic = player.reviving.medic && useItem(player, 'medkit');
      player.reviving = null;
      stopDrag(room, other);
      other.downed = false;
      other.hp = medic ? MIL.reviveHp : MIL.reviveHpBasic;
      other.bleed = 0;
      other.revives = (other.revives || 0) + 1;
      addStat(player, 'rev');
      award(player, XP.revive, 'Revived a teammate');
      if (medic) {
        other.wounds = {
          arms: (other.wounds?.arms || 0) * 0.5,
          legs: (other.wounds?.legs || 0) * 0.5,
        };
      }
      other.ms.st = Math.min(other.ms.st, 0.25);
      other.protectedUntil = now + 800;
      api.send(other, {
        t: 'mrevived',
        by: player.name,
        hp: other.hp,
        st: 0.25,
        medic: medic ? 1 : 0,
        last: other.revives >= MIL.maxRevives ? 1 : 0,
      });
      sendMed(other);
      api.broadcast(room, { t: 'revived', v: other.id, by: player.id });
      if (!player.isBot) {
        sendInv(player);
      }
    }
  }
}

function handleArsenal(room, player, message) {
  if (!player.alive || player.downed || player.veh) {
    return;
  }
  const at = nearArsenal(room, player);
  if (!at) {
    return;
  }
  const kit = sanitizeKit(message.kit, player.team);
  if (at.kind === 'crate') {
    const area = areaAt(room, player.team, at.s.x, at.s.z, false);
    const cost = kitCost(kit);
    if (!area || !spendArea(area, cost)) {
      return api.send(player, { t: 'mmsg', m: `Not enough supply here (${cost} needed).` });
    }
  }
  applyKit(player, kit);
  player.nextKit = kit;
  player.weapon = player.slots[0];
  player.readyAt = api.now() + 600;
  sendInv(player, { kit, kg: player.kg, msg: 'Gear changed.' });
}

export function handleVehSpawn(room, player, message) {
  selectMilMap(room.milMap);
  const mil = room.mil;
  const tent = MAPDATA.vtents[message.tent];
  const definition = VEHICLES[message.k];
  const fail = (message) => api.send(player, { t: 'mmsg', m: message });
  if (
    !tent ||
    !definition ||
    !player.alive ||
    player.downed ||
    player.veh ||
    tent.team !== player.team
  ) {
    return;
  }
  if (!VEH_CATS[tent.kind].types.includes(message.k)) {
    return;
  }
  if (rankOf(player.xp) < (VEH_RANK[message.k] || 0)) {
    return fail(`${definition.name} unlocks at ${RANKS[VEH_RANK[message.k]].name}.`);
  }
  if (dist2(tent.x, tent.z, player.pos[0], player.pos[2]) > 9) {
    return fail('Get closer to the tent.');
  }
  const now = api.now();
  const cooldown = player.vcd[tent.kind] || 0;
  if (now < cooldown) {
    return fail(
      `You can spawn another ${tent.kind === 'heli' ? 'helicopter' : tent.kind === 'heavy' ? 'armored vehicle' : 'vehicle'} in ${Math.ceil((cooldown - now) / 1000)} s.`,
    );
  }
  if (
    [...mil.vehicles.values()].filter((vehicle) => vehicle.alive && vehicle.team === player.team)
      .length >= MIL.vehPerTeam
  ) {
    return fail('Your team has too many vehicles out.');
  }
  const fleet = fleetOf(room, player.team, message.k);
  if (fleet.free <= 0) {
    return fail(
      fleet.next
        ? `No ${definition.name} available. Next one in ${fleet.next} s.`
        : `All ${FLEET[message.k]} ${definition.name}s of your team are in use.`,
    );
  }
  if (mil.mainStore[player.team] < definition.cost) {
    return fail(`Not enough supply at the main base (${definition.cost}).`);
  }
  const spot = tent.spots.find(
    ([mountX, mountZ]) =>
      ![...mil.vehicles.values()].some(
        (vehicle) =>
          vehicle.alive &&
          dist2(vehicle.x, vehicle.z, mountX, mountZ) < (definition.kind === 'heli' ? 12 : 6),
      ) &&
      ![...room.players.values()].some(
        (other) =>
          other.alive && dist2(other.pos[0], other.pos[2], mountX, mountZ) < definition.len / 2,
      ),
  );
  if (!spot) {
    return fail('All spawn spots are taken.');
  }
  mil.mainStore[player.team] -= definition.cost;
  player.vcd[tent.kind] = now + MIL.vehCooldownMs;
  const currentVehicle = spawnVehicle(room, message.k, player.team, spot[0], spot[1], spot[2]);
  api.send(player, { t: 'mvspawn', id: currentVehicle.id, k: message.k, cd: MIL.vehCooldownMs });
  return currentVehicle;
}

function fleetOf(room, team, type) {
  const now = api.now();
  const down = ((room.mil.fleetDown ||= [[], []])[team] = room.mil.fleetDown[team].filter(
    (direction) => direction.at > now,
  ));
  const alive = [...room.mil.vehicles.values()].filter(
    (vehicle) => vehicle.alive && vehicle.team === team && vehicle.type === type,
  ).length;
  const waiting = down.filter((direction) => direction.type === type);
  const free = (FLEET[type] ?? 2) - alive - waiting.length;
  const next =
    free <= 0 && waiting.length
      ? Math.ceil((Math.min(...waiting.map((direction) => direction.at)) - now) / 1000)
      : 0;
  return { free, next };
}

export function enterVehicle(room, player, message) {
  selectMilMap(room.milMap);
  const mil = room.mil;
  const vehicle = mil.vehicles.get(message.id);
  if (!vehicle || !vehicle.alive || !player.alive || player.downed || player.veh || player.mount) {
    return false;
  }
  if (
    vehicle.team !== player.team &&
    dist2(vehicle.x, vehicle.z, MAIN_BASES[vehicle.team].x, MAIN_BASES[vehicle.team].z) < 220
  ) {
    api.send(player, { t: 'mmsg', m: "You can't take enemy vehicles inside their main base." });
    return false;
  }
  if (
    dist2(vehicle.x, vehicle.z, player.pos[0], player.pos[2]) >
      VEHICLES[vehicle.type].len / 2 + 3.5 ||
    Math.abs(vehicle.y - player.pos[1]) > 4
  ) {
    return false;
  }
  for (const id of vehicle.seats) {
    const other = id && room.players.get(id);
    if (other && other.team !== player.team) {
      api.send(player, { t: 'mmsg', m: 'Occupied by the enemy.' });
      return false;
    }
  }
  const seat =
    Number.isInteger(message.s) &&
    message.s >= 0 &&
    message.s < vehicle.seats.length &&
    !vehicle.seats[message.s]
      ? message.s
      : vehicle.seats.findIndex((positionX) => !positionX);
  if (seat < 0) {
    api.send(player, { t: 'mmsg', m: 'Vehicle is full.' });
    return false;
  }
  if (seat === 0 && rankOf(player.xp) < (VEH_RANK[vehicle.type] || 0)) {
    api.send(player, {
      t: 'mmsg',
      m: `Requires rank ${RANKS[VEH_RANK[vehicle.type]].name}.`,
    });
    return false;
  }
  vehicle.seats[seat] = player.id;
  player.veh = vehicle.id;
  player.seat = seat;
  vehicle.doors &= ~(1 << seat);
  player.prone = false;
  if (seat === 0) {
    vehicle.driver = player.id;
    vehicle.botDrive = null;
    vehicle.handoverAt = api.now();
  }
  vehicle.rest = false;
  api.send(player, { t: 'vin', id: vehicle.id, s: seat });
  if (seat === 0 && !player.isBot) {
    api.send(player, { t: 'vcorr', id: vehicle.id, s: vehState(vehicle) });
  }
  return true;
}

function switchSeat(room, player, seat, now = false) {
  const vehicle = room.mil.vehicles.get(player.veh);
  if (
    !vehicle ||
    !Number.isInteger(seat) ||
    seat < 0 ||
    seat >= vehicle.seats.length ||
    vehicle.seats[seat]
  ) {
    return;
  }
  const definition = VEHICLES[vehicle.type];
  if (!now && (definition.len >= 6 || definition.heavyArmor || definition.kind === 'heli')) {
    player.seatSwap = { s: seat, at: api.now() + 1300 };
    api.send(player, { t: 'mmsg', m: 'Moving to the other seat…' });
    return;
  }
  player.seatSwap = null;
  vehicle.seats[player.seat] = 0;
  if (player.seat === 0) {
    vehicle.driver = 0;
    vehicle.rest = false;
    vehicle.restT = 0;
  }
  vehicle.seats[seat] = player.id;
  player.seat = seat;
  if (seat === 0) {
    vehicle.driver = player.id;
    vehicle.handoverAt = api.now();
  }
  api.send(player, { t: 'vin', id: vehicle.id, s: seat });
  if (seat === 0 && !player.isBot) {
    api.send(player, { t: 'vcorr', id: vehicle.id, s: vehState(vehicle) });
  }
}

export function leaveVehicle(room, player, silent = false) {
  selectMilMap(room.milMap);
  const vehicle = room.mil.vehicles.get(player.veh);
  player.veh = 0;
  if (!vehicle) {
    return;
  }
  if (vehicle.seats[player.seat] === player.id) {
    vehicle.seats[player.seat] = 0;
  }
  if (vehicle.driver === player.id) {
    vehicle.driver = 0;
    vehicle.loading = null;
    vehicle.rest = false;
    vehicle.botDrive = null;
  }
  if (!vehicle.seats.some((positionX) => positionX)) {
    vehicle.engine = 0;
  }
  if (silent || !player.alive) {
    return;
  }
  const definition = VEHICLES[vehicle.type];
  const side = (SEATS[vehicle.type][player.seat] || [0])[0] >= 0 ? 1 : -1;
  const tries = [
    [side * (definition.wid / 2 + 1.0), 0],
    [-side * (definition.wid / 2 + 1.0), 0],
    [0, definition.len / 2 + 1.3],
    [0, -definition.len / 2 - 1.3],
    [side * (definition.wid / 2 + 2.2), 0],
  ];
  let position = null;
  for (const [localX, localZ] of tries) {
    const weapon = vehicleToWorld({ ...vehicle, pitch: 0, roll: 0 }, localX, 0, localZ);
    const gun = heightAt(weapon[0], weapon[2]);
    const near = room.mil.world.grid.query(
      weapon[0] - 0.5,
      weapon[2] - 0.5,
      weapon[0] + 0.5,
      weapon[2] + 0.5,
      [],
    );
    const positionY = Math.max(gun, vehicle.y - 1);
    if (
      near.some(
        (bot) =>
          !bot.soft &&
          weapon[0] + 0.3 > bot.min[0] &&
          weapon[0] - 0.3 < bot.max[0] &&
          weapon[2] + 0.3 > bot.min[2] &&
          weapon[2] - 0.3 < bot.max[2] &&
          bot.max[1] > positionY + 0.4 &&
          bot.min[1] < positionY + 1.8,
      )
    ) {
      continue;
    }
    position = [
      weapon[0],
      definition.kind === 'heli' && !vehicle.onGround ? vehicle.y : Math.max(gun, positionY),
      weapon[2],
    ];
    break;
  }
  position = position || [vehicle.x, vehicle.y + definition.hgt + 0.1, vehicle.z];
  player.pos = position;
  Object.assign(player.ms, createMilMoveState(position[0], position[1], position[2]), {
    st: player.ms.st,
  });
  player.ms.onGround = false;
  if (!player.isBot) {
    api.send(player, { t: 'vout', p: position.map(roundToThreeDecimals) });
  }
}

function handleVehState(room, player, message, now) {
  const vehicle = room.mil.vehicles.get(message.id);
  if (
    !vehicle ||
    !vehicle.alive ||
    vehicle.driver !== player.id ||
    !Array.isArray(message.s) ||
    message.s.length < 13 ||
    !message.s.every(isNum)
  ) {
    return;
  }
  const [
    positionX,
    positionY,
    positionZ,
    yaw,
    pitch,
    roll,
    supplyPoint,
    velocityX,
    velocityY,
    velocityZ,
    steer,
    rotor,
    collective,
  ] = message.s;
  const definition = VEHICLES[vehicle.type];
  const deltaTime = Math.max(0.016, (now - vehicle.last) / 1000);
  const moved = Math.hypot(positionX - vehicle.x, positionZ - vehicle.z);
  const vmaxH = definition.kind === 'heli' ? 85 : definition.vmax + 12;
  if (
    moved > vmaxH * deltaTime * 1.6 + 3 ||
    !inBounds(positionX, positionZ, 2) ||
    positionY < heightAt(positionX, positionZ) - 3 ||
    positionY > 950
  ) {
    api.send(player, { t: 'vcorr', id: vehicle.id, s: vehState(vehicle) });
    vehicle.last = now;
    return;
  }
  const before =
    definition.kind === 'heli'
      ? Math.hypot(vehicle.vx, vehicle.vy, vehicle.vz)
      : Math.abs(vehicle.v);
  const after =
    definition.kind === 'heli'
      ? Math.hypot(velocityX, velocityY, velocityZ)
      : Math.abs(supplyPoint);
  if (deltaTime < 0.3 && before - after > 9 && now - (vehicle.handoverAt || 0) > 1500) {
    damageVehicle(
      room,
      vehicle,
      (before - after - 7) * 22 * definition.mass,
      room.players.get(vehicle.driver),
      'crash',
    );
  }
  vehicle.rest = false;
  Object.assign(vehicle, {
    x: positionX,
    y: positionY,
    z: positionZ,
    yaw,
    pitch,
    roll,
    v: supplyPoint,
    vx: velocityX,
    vy: velocityY,
    vz: velocityZ,
    steer,
    rotor: Math.max(0, Math.min(1, rotor)),
    coll: Math.max(0, Math.min(1, collective)),
    last: now,
    onGround: positionY <= heightAt(positionX, positionZ) + 0.3,
  });
  if (Number.isInteger(message.g)) {
    vehicle.gear = Math.max(-1, Math.min(4, message.g));
  }
  if (Array.isArray(message.r)) {
    for (const structureId of message.r.slice(0, 4)) {
      const structure = room.mil.world.structs.get(structureId);
      if (
        structure &&
        (structure.type === 'wire' ||
          structure.type === 'barricade' ||
          structure.type === 'cover') &&
        Math.abs(supplyPoint) > 3
      ) {
        damageStruct(room, structure, 400);
      }
    }
  }
}
const vehState = (vehicle) =>
  [
    vehicle.x,
    vehicle.y,
    vehicle.z,
    vehicle.yaw,
    vehicle.pitch,
    vehicle.roll,
    vehicle.v,
    vehicle.vx,
    vehicle.vy,
    vehicle.vz,
    vehicle.steer,
    vehicle.rotor,
    vehicle.coll,
  ].map(roundToThreeDecimals);

function tickVehicles(room, now) {
  const mil = room.mil;
  const deltaTime = TICK_MS / 1000;
  const list = [...mil.vehicles.values()];
  mil.world.vehicles = [];
  for (const vehicle of list) {
    if (!vehicle.alive) {
      if (now - vehicle.deadAt > 45000) {
        mil.vehicles.delete(vehicle.id);
        continue;
      }
      if (!vehicle.rest) {
        for (let kit = 0; kit < 2; kit++) {
          stepWreck(vehicle, deltaTime / 2, mil.world);
        }
        const tumbling = (vehicle.tumble || [0, 0, 0]).some((hit) => Math.abs(hit) > 0.05);
        const still =
          vehicle.onGround &&
          !tumbling &&
          Math.hypot(vehicle.vx || 0, vehicle.vy || 0, vehicle.vz || 0) < 0.1;
        vehicle.restT = still ? (vehicle.restT || 0) + deltaTime : 0;
        if (vehicle.restT > 1.5) {
          vehicle.rest = true;
        }
      }
      mil.world.vehicles.push({
        box: vehicleAABB(vehicle),
        parts: vehicleParts(vehicle),
        v: vehicle,
      });
      continue;
    }
    const definition = VEHICLES[vehicle.type];
    if (
      vehicle.burning &&
      (now >= vehicle.burnUntil ||
        (vehicle.onGround && now > vehicle.burnUntil - BURN_MIN_MS + 600))
    ) {
      damageVehicle(room, vehicle, 1, room.players.get(vehicle.lastHit) || null, 'crash');
      mil.world.vehicles.push({
        box: vehicleAABB(vehicle),
        parts: vehicleParts(vehicle),
        v: vehicle,
      });
      continue;
    }
    if (vehicle.gun && now - (vehicle.lastRearm || 0) > 1000) {
      vehicle.lastRearm = now;
      const full = vehicle.gun.n >= vehicle.gun.size && vehicle.gun.spare >= vehicle.gun.maxSpare;
      const slow = Math.abs(vehicle.v || 0) < 1.5;
      const area = !full && slow ? areaAt(room, vehicle.team, vehicle.x, vehicle.z) : null;
      if (area && spendArea(area, 3)) {
        let add = Math.max(1, Math.round(vehicle.gun.maxSpare / 16));
        const top = Math.min(add, vehicle.gun.size - vehicle.gun.n);
        if (top > 0 && !vehicle.gun.reloadAt) {
          vehicle.gun.n += top;
          add -= top;
        }
        vehicle.gun.spare = Math.min(vehicle.gun.maxSpare, vehicle.gun.spare + add);
        vehicle.rearming = now;
      }
    }
    if (vehicle.gun && vehicle.gun.n <= 0 && vehicle.gun.spare > 0) {
      if (!vehicle.gun.reloadAt) {
        vehicle.gun.reloadAt = now + (VEH_GUNS[vehicle.type]?.reload || 3500);
      } else if (now >= vehicle.gun.reloadAt) {
        const kit = Math.min(vehicle.gun.size, vehicle.gun.spare);
        vehicle.gun.n = kit;
        vehicle.gun.spare -= kit;
        vehicle.gun.reloadAt = 0;
      }
    }
    if (
      definition.kind === 'car' &&
      !vehicle.flipped &&
      definition.tip &&
      Math.abs(vehicle.roll) > definition.tip &&
      Math.abs(vehicle.v) > 2
    ) {
      vehicle.flipped = Math.sign(vehicle.roll);
      damageVehicle(
        room,
        vehicle,
        definition.hp * 0.08,
        room.players.get(vehicle.driver) || null,
        'crash',
      );
      for (const id of vehicle.seats) {
        const other = id && room.players.get(id);
        if (other && !other.isBot) {
          api.send(other, {
            t: 'mmsg',
            m: 'The vehicle rolled over. An engineer can flip it.',
          });
        }
      }
    }
    if (
      definition.kind === 'heli' &&
      vehicle.rotor > 0.3 &&
      now - (vehicle.rotorHitAt || 0) > 800
    ) {
      const rotationY = vehicle.y + 3.35;
      const radius = vehicle.type === 'gunship' ? 6.4 : 7.0;
      const list = [];
      mil.world.grid.query(
        vehicle.x - radius,
        vehicle.z - radius,
        vehicle.x + radius,
        vehicle.z + radius,
        list,
      );
      for (const bot of list) {
        if (
          bot.soft ||
          bot.floor ||
          bot.mat === 'edge' ||
          bot.min[1] > rotationY + 0.4 ||
          bot.max[1] < rotationY - 0.4
        ) {
          continue;
        }
        const closestX = Math.max(bot.min[0], Math.min(vehicle.x, bot.max[0]));
        const closestZ = Math.max(bot.min[2], Math.min(vehicle.z, bot.max[2]));
        if (Math.hypot(closestX - vehicle.x, closestZ - vehicle.z) < radius) {
          vehicle.rotorHitAt = now;
          vehicle.comp.rotor = Math.max(0, vehicle.comp.rotor - 0.45);
          damageVehicle(room, vehicle, 120, room.players.get(vehicle.lastHit) || null, 'crash');
          break;
        }
      }
    }
    const driver = vehicle.driver && room.players.get(vehicle.driver);
    if (driver && driver.isBot) {
      let impact = 0;
      if (definition.kind === 'heli') {
        const input = vehicle.botInput || { engine: true, coll: -1, yaw: 0, pitch: 0, roll: 0 };
        if (input.engine) {
          vehicle.engine = 2;
        }
        for (let kit = 0; kit < 2; kit++) {
          impact = Math.max(impact, stepHeli(vehicle, input, deltaTime / 2, mil.world));
        }
        if (impact > 6) {
          damageVehicle(room, vehicle, impact * 30 * definition.mass, driver, 'crash');
        }
      } else {
        const input = vehicle.botInput || { thr: 0, steer: 0, brake: true };
        if (input.thr) {
          vehicle.engine = 2;
        }
        for (let kit = 0; kit < 2; kit++) {
          impact = Math.max(impact, stepCar(vehicle, input, deltaTime / 2, mil.world, list));
        }
        if (impact > 12) {
          damageVehicle(room, vehicle, (impact - 10) * 6 * definition.mass, driver, 'crash');
        }
      }
      vehicle.last = now;
      vehicle.rest = false;
    } else if (!vehicle.driver) {
      if (!vehicle.rest) {
        let impact = 0;
        for (let kit = 0; kit < 2; kit++) {
          impact = Math.max(
            impact,
            definition.kind === 'heli'
              ? stepHeli(vehicle, { engine: false }, deltaTime / 2, mil.world)
              : stepCar(vehicle, { thr: 0, steer: 0, brake: true }, deltaTime / 2, mil.world, list),
          );
        }
        if (impact > 6) {
          damageVehicle(
            room,
            vehicle,
            impact * 30 * definition.mass,
            room.players.get(vehicle.lastHit) || null,
            'crash',
          );
        }
        const still =
          (definition.kind === 'heli'
            ? vehicle.onGround && vehicle.rotor < 0.02
            : Math.abs(vehicle.v) < 0.05) &&
          Math.hypot(vehicle.vx || 0, vehicle.vy || 0, vehicle.vz || 0) < 0.1;
        vehicle.restT = still ? (vehicle.restT || 0) + deltaTime : 0;
        if (vehicle.restT > 1.5) {
          vehicle.rest = true;
        }
      }
      vehicle.last = now;
    }
    ramPlayers(room, vehicle, definition, now, driver);
    let occupied = false;
    for (let index = 0; index < vehicle.seats.length; index++) {
      const other = vehicle.seats[index] && room.players.get(vehicle.seats[index]);
      if (!other || !other.alive) {
        vehicle.seats[index] = 0;
        continue;
      }
      occupied = true;
      const weapon = seatWorld(vehicle, index);
      other.pos = [weapon[0], weapon[1] - 1.1, weapon[2]];
      other.ms.x = other.pos[0];
      other.ms.y = other.pos[1];
      other.ms.z = other.pos[2];
      other.crouch = true;
      restSeated(other.ms, deltaTime, other.kg);
    }
    if (vehicle.driver && !room.players.get(vehicle.driver)) {
      vehicle.driver = 0;
    }
    const currentDriver = vehicle.driver && room.players.get(vehicle.driver);
    if (currentDriver && !currentDriver.isBot) {
      let passengers = 0;
      for (let index = 1; index < vehicle.seats.length; index++) {
        if (
          vehicle.seats[index] &&
          room.players.get(vehicle.seats[index])?.team === currentDriver.team
        ) {
          passengers++;
        }
      }
      const moving = definition.kind === 'heli' ? !vehicle.onGround : Math.abs(vehicle.v) > 3;
      if (passengers && moving && (vehicle.paxT = (vehicle.paxT || 0) + deltaTime) >= 30) {
        vehicle.paxT = 0;
        award(
          currentDriver,
          XP.transport * passengers,
          `Transporting ${passengers} teammate${passengers > 1 ? 's' : ''}`,
        );
      }
    }
    if (vehicle.loading && definition.cargo) {
      tickLoading(room, vehicle, deltaTime);
    }
    if (
      definition.kind === 'heli' &&
      waterDepth(vehicle.x, vehicle.z) > 1.5 &&
      vehicle.y < heightAt(vehicle.x, vehicle.z) + waterDepth(vehicle.x, vehicle.z)
    ) {
      damageVehicle(room, vehicle, 9999, null, 'crash');
    }
    if (
      occupied ||
      [...room.players.values()].some(
        (other) => other.alive && dist2(other.pos[0], other.pos[2], vehicle.x, vehicle.z) < 150,
      )
    ) {
      vehicle.lastNear = now;
    } else if (now - vehicle.lastNear > MIL.vehAbandonMs) {
      mil.vehicles.delete(vehicle.id);
      continue;
    }
    if (occupied || !vehicle.lastUse) {
      vehicle.lastUse = now;
    } else if (now - vehicle.lastUse > MIL.vehIdleMs) {
      mil.vehicles.delete(vehicle.id);
      continue;
    }
    mil.world.vehicles.push({
      box: vehicleAABB(vehicle),
      parts: vehicleParts(vehicle),
      v: vehicle,
    });
  }
}

const rearOf = (vehicle) => {
  const hit = REAR[vehicle.type] || [0, 1, VEHICLES[vehicle.type].len / 2];
  return vehicleToWorld({ ...vehicle, pitch: 0, roll: 0 }, hit[0], hit[1], hit[2]);
};
function unloadTarget(room, team, vehicle) {
  const [rotationX, , rotationZ] = rearOf(vehicle);
  const mil = room.mil;
  for (const supplyTent of MAPDATA.supplyTents) {
    const sector = mil.sectors.find((positionX) => positionX.id === supplyTent.sector);
    if (
      sector.owner === team &&
      dist2(supplyTent.x, supplyTent.z, rotationX, rotationZ) < MIL.tentReach
    ) {
      return { kind: 'sector', ref: sector, max: MIL.sectorMax, x: supplyTent.x, z: supplyTent.z };
    }
  }
  for (const footprint of mil.fobs.values()) {
    if (
      footprint.team === team &&
      dist2(footprint.x, footprint.z, rotationX, rotationZ) < MIL.tentReach
    ) {
      return { kind: 'fob', ref: footprint, max: MIL.fobMax, x: footprint.x, z: footprint.z };
    }
  }
  return null;
}
const loadSource = (vehicle) =>
  SUPPLY_POINTS.find(
    (supplyPoint) => dist2(supplyPoint.x, supplyPoint.z, vehicle.x, vehicle.z) < supplyPoint.r + 10,
  );

function tickLoading(room, vehicle, deltaTime) {
  const mil = room.mil;
  if (Math.abs(vehicle.v) > 1) {
    vehicle.loading = null;
    return;
  }
  const amount = MIL.loadRate * deltaTime;
  if (vehicle.loading === 'load') {
    const supplyPoint = loadSource(vehicle);
    const stock = supplyPoint && mil.points[supplyPoint.id];
    if (!stock || stock.stock <= 0 || vehicle.cargo >= MIL.truckMax) {
      vehicle.loading = null;
      return;
    }
    const kit = Math.min(amount, stock.stock, MIL.truckMax - vehicle.cargo);
    stock.stock -= kit;
    vehicle.cargo += kit;
  } else {
    const target = unloadTarget(room, vehicle.loadTeam ?? vehicle.team, vehicle);
    if (!target || vehicle.cargo <= 0) {
      vehicle.loading = null;
      return;
    }
    const kit = Math.min(amount, vehicle.cargo, target.max - target.ref.store);
    if (kit <= 0) {
      vehicle.loading = null;
      return;
    }
    vehicle.cargo -= kit;
    target.ref.store += kit;
    addStat(room.players.get(vehicle.driver) || room.players.get(vehicle.loadBy), 'sup', kit);
    award(
      room.players.get(vehicle.driver) || room.players.get(vehicle.loadBy),
      kit * XP.supplyPer,
      'Supply delivered',
    );
  }
}

export function handleLoad(room, player, message) {
  selectMilMap(room.milMap);
  const mil = room.mil;
  const vehicle = mil.vehicles.get(message.id ?? player.veh);
  if (
    !vehicle ||
    !vehicle.alive ||
    !VEHICLES[vehicle.type].cargo ||
    !player.alive ||
    player.downed
  ) {
    return false;
  }
  const isDriver = vehicle.driver === player.id;
  const [rotationX, , rotationZ] = rearOf(vehicle);
  if (
    !isDriver &&
    (player.veh || dist2(rotationX, rotationZ, player.pos[0], player.pos[2]) > 3.5)
  ) {
    return false;
  }
  if (!message.on) {
    vehicle.loading = null;
    return false;
  }
  if (Math.abs(vehicle.v) > 1) {
    api.send(player, { t: 'mmsg', m: 'Stop the truck first.' });
    return false;
  }
  if (message.k === 'load') {
    if (!loadSource(vehicle)) {
      api.send(player, { t: 'mmsg', m: 'Park inside a supply point to load.' });
      return false;
    }
    vehicle.loading = 'load';
  } else {
    if (!unloadTarget(room, player.team, vehicle)) {
      api.send(player, {
        t: 'mmsg',
        m: 'Park next to a friendly supply tent or FOB to unload.',
      });
      return false;
    }
    vehicle.loading = 'unload';
    vehicle.loadTeam = player.team;
  }
  return true;
}

export function milMessage(room, player, message, now) {
  selectMilMap(room.milMap);
  if (message.t === 'mperf') {
    return api.send(player, { t: 'mperf', w: room.mil.perf?.win || null });
  }
  switch (message.t) {
    case 'in':
      return handleInput(room, player, message, now);
    case 'shoot':
      return handleShoot(room, player, message, now);
    case 'nade':
      return handleNade(room, player, message, now);
    case 'reload': {
      const weaponIndex = player.mount ? W.mg : player.weapon;
      const weapon = MW[weaponIndex];
      if (
        !player.alive ||
        player.downed ||
        player.reloading ||
        !weapon ||
        weapon.melee ||
        weapon.item ||
        weapon.grenade
      ) {
        return;
      }
      if (player.mount) {
        const structure = room.mil.world.structs.get(player.mount);
        if (!structure || !player.mgMag || player.mgMag.n >= player.mgMag.size) {
          return;
        }
        const area = areaAt(room, player.team, structure.x, structure.z);
        if (!area || !spendArea(area, MIL.mgBeltCost)) {
          return api.send(player, {
            t: 'mmsg',
            m: `Not enough supply to reload (${MIL.mgBeltCost} needed).`,
          });
        }
        player.reloading = true;
        player.reloadWeapon = weaponIndex;
        player.reloadEnd = now + weapon.reloadTime * 1000 - 150;
        return;
      }
      const current = player.inv.loaded[weaponIndex];
      if (!current) {
        return;
      }
      const has = weapon.rocket
        ? player.inv.items.rocket > 0 && current.n === 0
        : player.inv.mags.some((magazine) => magazine.cal === current.cal && magazine.n > 0);
      if (!has) {
        return;
      }
      player.reloading = true;
      player.reloadWeapon = weaponIndex;
      player.reloadEnd = now + weapon.reloadTime * 1000 * 1.15 - 150;
      return;
    }
    case 'switch': {
      const weapon = MW[message.w];
      if (
        !weapon ||
        !player.alive ||
        player.downed ||
        message.w === player.weapon ||
        !Number.isInteger(message.w) ||
        !player.slots.includes(message.w)
      ) {
        return;
      }
      player.weapon = message.w;
      player.reloading = false;
      player.useItem = null;
      player.readyAt =
        now + weapon.drawTime * 1000 * (weapon.slot === 'secondary' ? 0.7 : 1.2) - 150;
      return;
    }
    case 'deploy':
      return deploy(room, player, String(message.sp || 'main'), message.kit);
    case 'kit':
      player.nextKit = sanitizeKit(message.kit, player.team);
      return;
    case 'arsenal':
      return handleArsenal(room, player, message);
    case 'loot':
      return handleLoot(room, player, message);
    case 'take':
      return handleTake(room, player, message);
    case 'drop':
      return handleDrop(room, player, message);
    case 'use':
      return handleUse(room, player, message);
    case 'item':
      return handleItem(room, player, message, now);
    case 'revive':
      return handleRevive(room, player, message, now);
    case 'drag':
      return handleDrag(room, player, message);
    case 'door':
      return handleDoor(room, player, message);
    case 'construct':
      return handleConstruct(room, player, message);
    case 'marker':
      return handleMarker(room, player, message);
    case 'squad':
      return handleSquad(room, player, message);
    case 'vox':
      return handleVox(room, player, message);
    case 'voxs':
      return handleVoxState(room, player, message);
    case 'pullout': {
      const other = room.players.get(message.id);
      if (
        !other ||
        !other.downed ||
        !other.veh ||
        other.team !== player.team ||
        !player.alive ||
        player.downed ||
        player.veh
      ) {
        return;
      }
      const vehicle = room.mil.vehicles.get(other.veh);
      if (
        !vehicle ||
        dist2(vehicle.x, vehicle.z, player.pos[0], player.pos[2]) >
          VEHICLES[vehicle.type].len / 2 + 3.5
      ) {
        return;
      }
      leaveVehicle(room, other);
      return;
    }
    case 'devxp':
      if ((room.solo || room.hostId === player.id) && Number.isFinite(message.n)) {
        award(player, Math.max(-1e6, Math.min(1e6, Math.round(message.n))), 'Dev XP');
      }
      return;
    case 'giveup':
      if (player.downed && api.now() - (player.downedAt || 0) >= MIL.giveUpAfterMs) {
        killPlayer(room, player.downedBy || player, player, player.downedWid || 'bleed');
      }
      return;
    case 'build':
      return handleBuild(room, player, message);
    case 'unbuild':
      return handleUnbuild(room, player, message);
    case 'vspawn':
      return handleVehSpawn(room, player, message);
    case 'venter':
      return enterVehicle(room, player, message);
    case 'vexit': {
      const vehicle = player.veh && room.mil.vehicles.get(player.veh);
      if (!vehicle) {
        return;
      }
      const speed =
        VEHICLES[vehicle.type].kind === 'heli'
          ? Math.hypot(vehicle.vx || 0, vehicle.vz || 0)
          : Math.abs(vehicle.v || 0);
      if (!message.ej && speed > 3) {
        return api.send(player, { t: 'mmsg', m: 'Too fast to get out. Double tap F to jump.' });
      }
      if (!message.ej && hasDoor(vehicle.type, player.seat)) {
        vehicle.doors |= 1 << player.seat;
      }
      leaveVehicle(room, player);
      if (message.ej && speed > 3 && player.alive) {
        hurtPlayer(room, null, player, (speed - 3) * 7, 'legs', player.pos, 'fall');
      }
      return;
    }
    case 'vdoor': {
      let vehicle = player.veh && room.mil.vehicles.get(player.veh);
      let seat = player.seat;
      if (!vehicle) {
        vehicle = room.mil.vehicles.get(message.id);
        seat = message.s | 0;
        if (
          !vehicle ||
          !player.alive ||
          player.downed ||
          dist2(vehicle.x, vehicle.z, player.pos[0], player.pos[2]) >
            VEHICLES[vehicle.type].len / 2 + 3.5
        ) {
          return;
        }
      }
      if (!hasDoor(vehicle.type, seat)) {
        return;
      }
      if (message.open) {
        vehicle.doors |= 1 << seat;
      } else {
        vehicle.doors &= ~(1 << seat);
      }
      return;
    }
    case 'vturret': {
      const vehicle = player.veh && room.mil.vehicles.get(player.veh);
      if (
        !vehicle ||
        !isGunner(vehicle.type, player.seat) ||
        !isNum(message.y) ||
        !isNum(message.p)
      ) {
        return;
      }
      const gun = VEH_GUNS[vehicle.type];
      vehicle.tyaw = Math.atan2(Math.sin(message.y), Math.cos(message.y));
      if (gun.yawLimit) {
        vehicle.tyaw = Math.max(-gun.yawLimit, Math.min(gun.yawLimit, vehicle.tyaw));
      }
      vehicle.tp = Math.max(gun.pitch[0], Math.min(gun.pitch[1], message.p));
      return;
    }
    case 'vengine': {
      const vehicle = player.veh && room.mil.vehicles.get(player.veh);
      if (vehicle && vehicle.driver === player.id && vehicle.alive) {
        vehicle.engine = message.on ? 2 : 0;
      }
      return;
    }
    case 'vseat':
      return player.veh && switchSeat(room, player, message.s);
    case 'vs':
      return handleVehState(room, player, message, now);
    case 'vload':
      return handleLoad(room, player, message);
    case 'mfire':
      return handleMortar(room, player, message, now);
    case 'suicide':
      if (player.alive) {
        killPlayer(room, player, player, 'respawn');
      }
      return;
    default:
  }
}

function handleInput(room, player, message, now) {
  if (!player.alive || message.sp !== player.spawnCount || !Array.isArray(message.c)) {
    return;
  }
  player.cmdBudget = Math.min(
    CMD_BURST,
    player.cmdBudget + ((now - player.budgetAt) / 1000) * CMD_RATE,
  );
  player.budgetAt = now;
  const weapon = MW[player.weapon];
  for (const weaponClass of message.c.slice(0, CMD_BURST)) {
    if (
      !Array.isArray(weaponClass) ||
      weaponClass.length < 12 ||
      !Number.isInteger(weaponClass[0]) ||
      weaponClass[0] <= player.lastSeq
    ) {
      continue;
    }
    if (player.cmdBudget < 1) {
      break;
    }
    if (!isNum(weaponClass[7]) || !isNum(weaponClass[8])) {
      continue;
    }
    player.cmdBudget -= 1;
    player.lastSeq = weaponClass[0];
    player.yaw = weaponClass[7];
    player.pitch = Math.max(-1.6, Math.min(1.6, weaponClass[8]));
    const aim = weaponClass[9] === 1 ? 1 : weaponClass[9] === 2 ? 2 : 0;
    player.aiming = aim > 0;
    player.lean = Math.max(-1, Math.min(1, (Number(weaponClass[11]) || 0) / 100));
    player.ui = (Number(weaponClass[15]) || 0) & 255;
    if (player.veh) {
      continue;
    }
    const knocked = (player.knockUntil || 0) > now;
    const frozen = !!player.mount || player.downed || !!(player.ui & UI_FLAGS.map) || knocked;
    const prevG = player.ms.onGround;
    stepMil(
      player.ms,
      {
        fwd: axis(weaponClass[1]),
        right: axis(weaponClass[2]),
        jump: !!weaponClass[3],
        jumpPress: !!weaponClass[4],
        pace: Math.max(0, Math.min(2, Math.round(Number(weaponClass[5]) || 0))),
        crouch: (!!weaponClass[6] || mountKind(room, player) === 'mortar') && !player.downed,
        prone: !!weaponClass[13] || player.downed || knocked,
        roll: axis(weaponClass[14]),
        yaw: weaponClass[7],
        sprint: !!weaponClass[10] && !player.dragging,
        holdBreath: !!weaponClass[12],
        ads: aim === 1,
        speedMult: milSpeedMult(
          weapon?.moveMult,
          aim,
          player.ui,
          weapon?.slot === 'secondary',
          !!player.dragging,
        ),
        legWound: player.wounds?.legs || 0,
      },
      MOVE_DT,
      room.mil.world,
      { weight: player.kg, frozen },
    );
    if (player.ms.justLanded && player.ms.landSpeed > 9.5 && !prevG) {
      hurtPlayer(
        room,
        null,
        player,
        (player.ms.landSpeed - 9.5) * 14,
        'legs',
        [player.ms.x, player.ms.y, player.ms.z],
        'fall',
      );
    }
  }
  if (!player.veh) {
    player.pos = [player.ms.x, player.ms.y, player.ms.z];
    player.crouch = player.ms.crouch;
    player.prone = player.ms.prone;
  }
}

function tickSectors(room, now) {
  const mil = room.mil;
  if (mil.prepUntil && now < mil.prepUntil) {
    return;
  }
  const deltaTime = Math.min(1, (now - mil.lastCap) / 1000);
  if (now - mil.lastCap < 250) {
    return;
  }
  mil.lastCap = now;
  let changed = false;
  mil.sectors.forEach((sector, index) => {
    const direction = SECTORS[index];
    const count = [0, 0];
    for (const other of room.players.values()) {
      if (!other.alive || other.downed) {
        continue;
      }
      if (other.veh) {
        continue;
      }
      if (
        dist2(other.pos[0], other.pos[2], direction.x, direction.z) < direction.r &&
        Math.abs(other.pos[1] - heightAt(direction.x, direction.z)) < 60
      ) {
        count[other.team]++;
      }
    }
    sector.n = count;
    const before = `${sector.owner}|${sector.capTeam}|${sector.contested}`;
    sector.contested = count[0] > 0 && count[1] > 0;
    if (!sector.contested) {
      const team = count[0] > 0 ? 0 : count[1] > 0 ? 1 : -1;
      if (team >= 0 && canCapture(mil.sectors, team, sector.id, CAPTURE_CHAIN)) {
        const rate = MIL.capRate * [0, 1, 1.5, 1.8, 2][Math.min(4, count[team])] * deltaTime;
        if (sector.owner === team) {
          sector.cap = Math.min(1, sector.cap + rate);
        } else if (sector.owner >= 0) {
          sector.cap -= rate;
          if (sector.cap <= 0) {
            sector.cap = 0;
            api.broadcast(room, {
              t: 'msec',
              id: sector.id,
              ev: 'neutral',
              by: team,
              from: sector.owner,
            });
            sector.owner = -1;
            sector.capTeam = team;
            sector.store = Math.floor(sector.store * 0.5);
            changed = true;
          }
        } else if (sector.capTeam !== team && sector.cap > 0) {
          sector.cap -= rate;
          if (sector.cap <= 0) {
            sector.cap = 0;
            sector.capTeam = team;
          }
        } else {
          sector.capTeam = team;
          sector.cap += rate;
          if (sector.cap >= 1) {
            sector.cap = 1;
            sector.owner = team;
            api.broadcast(room, { t: 'msec', id: sector.id, ev: 'captured', by: team });
            for (const other of room.players.values()) {
              if (
                other.alive &&
                !other.downed &&
                !other.veh &&
                other.team === team &&
                dist2(other.pos[0], other.pos[2], direction.x, direction.z) < direction.r
              ) {
                addStat(other, 'cap');
                award(other, XP.cap, `Objective ${direction.id} captured`);
              }
            }
            changed = true;
          }
        }
      } else if (sector.owner >= 0) {
        sector.cap = Math.min(1, sector.cap + MIL.capRegen * deltaTime);
      } else if (sector.cap > 0) {
        sector.cap = Math.max(0, sector.cap - MIL.capRegen * 0.5 * deltaTime);
      }
    }
    if (`${sector.owner}|${sector.capTeam}|${sector.contested}` !== before) {
      changed = true;
    }
  });
  const origin = mil.sectors[0].owner;
  const all = origin >= 0 && mil.sectors.every((sector) => sector.owner === origin);
  if (!all) {
    if (mil.total) {
      api.broadcast(room, { t: 'mtotal', on: 0, team: mil.total.team });
    }
    mil.total = null;
  } else {
    if (!mil.total || mil.total.team !== origin) {
      mil.total = { team: origin, left: MIL.winHoldMs, paused: false };
      api.broadcast(room, { t: 'mtotal', on: 1, team: origin });
    }
    const wasPaused = mil.total.paused;
    mil.total.paused = mil.sectors.some((sector) => sector.contested || sector.n[1 - origin] > 0);
    if (wasPaused !== mil.total.paused) {
      mil.forceState = true;
    }
    if (!mil.total.paused) {
      mil.total.left -= deltaTime * 1000;
    }
    if (mil.total.left <= 0 && mil.winner < 0) {
      mil.winner = origin;
      room.winner = origin;
      mil.nextMatchAt = now + MIL.winPauseMs;
      api.broadcast(room, { t: 'win', team: origin, mil: 1, stats: statsTable(room) });
      api.log(`* MILSIM ${room.code}: ${origin ? 'BLUFOR' : 'OPFOR'} won by total control`);
    }
  }
  if (changed) {
    mil.forceState = true;
  }
}

function tickPrep(room, now) {
  const mil = room.mil;
  if (!mil.prepUntil || now >= mil.prepUntil) {
    if (mil.prepUntil && !mil.prepDone) {
      mil.prepDone = true;
      api.broadcast(room, {
        t: 'mmsg',
        m: 'The battle has started. Gates are open.',
      });
    }
    return;
  }
  for (const player of room.players.values()) {
    if (!player.alive) {
      continue;
    }
    const mainBase = MAIN_BASES[player.team];
    const vehicle = player.veh && mil.vehicles.get(player.veh);
    const positionX = vehicle ? vehicle.x : player.pos[0];
    const positionZ = vehicle ? vehicle.z : player.pos[2];
    const direction = dist2(positionX, positionZ, mainBase.x, mainBase.z);
    if (direction <= mainBase.r - 4) {
      continue;
    }
    const kit = (mainBase.r - 6) / direction;
    const nextX = mainBase.x + (positionX - mainBase.x) * kit;
    const nextZ = mainBase.z + (positionZ - mainBase.z) * kit;
    if (vehicle) {
      if (vehicle.driver !== player.id) {
        continue;
      }
      vehicle.x = nextX;
      vehicle.z = nextZ;
      vehicle.v = 0;
      vehicle.vx = vehicle.vz = 0;
      if (!player.isBot) {
        api.send(player, { t: 'vcorr', id: vehicle.id, s: vehState(vehicle) });
      }
    } else {
      player.ms.x = nextX;
      player.ms.z = nextZ;
      player.ms.vx = player.ms.vz = 0;
      player.pos = [nextX, player.pos[1], nextZ];
    }
    if (!player.isBot && now - (player.prepWarn || 0) > 3000) {
      player.prepWarn = now;
      api.send(player, {
        t: 'mmsg',
        m: `Preparation phase. Gates open in ${Math.ceil((mil.prepUntil - now) / 1000)} s.`,
      });
    }
  }
}

function tickBaseProtection(room, now) {
  const mil = room.mil;
  for (const mainBase of MAIN_BASES) {
    for (const other of room.players.values()) {
      if (!other.alive || other.team === mainBase.team || other.veh) {
        continue;
      }
      const inside = dist2(other.pos[0], other.pos[2], mainBase.x, mainBase.z) < MIL.baseInnerR;
      if (!inside) {
        other.baseSince = 0;
        continue;
      }
      if (!other.baseSince) {
        other.baseSince = now;
        if (!other.isBot) {
          api.send(other, { t: 'mmsg', m: 'Restricted area. Leave the enemy base now!' });
        }
      } else if (now - other.baseSince > MIL.baseGraceMs) {
        hurtPlayer(
          room,
          null,
          other,
          MIL.baseDps * 0.5,
          'body',
          [mainBase.x, other.pos[1], mainBase.z],
          'base',
        );
      }
    }
    for (const vehicle of mil.vehicles.values()) {
      if (
        !vehicle.alive ||
        vehicle.team === mainBase.team ||
        !vehicle.seats.some((positionX) => positionX)
      ) {
        continue;
      }
      if (dist2(vehicle.x, vehicle.z, mainBase.x, mainBase.z) < MIL.baseInnerR) {
        damageVehicle(room, vehicle, VEHICLES[vehicle.type].hp * 0.04, null, 'base');
      }
    }
  }
}

function tickSupply(room, now) {
  const mil = room.mil;
  for (let kit = 0; kit < 2; kit++) {
    mil.mainStore[kit] = Math.min(
      MIL.mainSupply,
      mil.mainStore[kit] + (MIL.mainRegen * TICK_MS) / 1000,
    );
  }
  if (now - mil.lastPoint > MIL.pointEveryMs) {
    mil.lastPoint = now;
    for (const point of mil.points) {
      point.stock = Math.min(MIL.pointMax, point.stock + MIL.pointProduce);
    }
  }
  if (now - mil.lastUpkeep > MIL.upkeepEveryMs) {
    mil.lastUpkeep = now;
    const count = (id) =>
      [...mil.world.structs.values()].filter((structure) => structure.area === id).length;
    for (const sector of mil.sectors) {
      if (sector.owner >= 0 && sector.store > 0) {
        sector.store = Math.max(
          0,
          sector.store - MIL.upkeepBase - MIL.upkeepPerStructure * count(sector.id),
        );
      }
    }
    for (const footprint of mil.fobs.values()) {
      if (footprint.store > 0) {
        footprint.store = Math.max(
          0,
          footprint.store - MIL.upkeepBase - MIL.upkeepPerStructure * count(`F${footprint.id}`),
        );
      }
    }
  }
}

function sendTeamState(room, player) {
  const mil = room.mil;
  const fobs = [...mil.fobs.values()]
    .filter((fob) => fob.team === player.team)
    .map((fob) => [
      fob.id,
      fob.name,
      roundToTwoDecimals(fob.x),
      roundToTwoDecimals(fob.z),
      Math.floor(fob.store),
    ]);
  const stores = mil.sectors.map((sector) =>
    sector.owner === player.team ? Math.floor(sector.store) : -1,
  );
  const now = api.now();
  const message = JSON.stringify({
    t: 'mteam',
    fobs,
    stores,
    main: Math.floor(mil.mainStore[player.team]),
    spawns: spawnOptions(room, player.team),
    pts: mil.points.map((positionX) => Math.floor(positionX.stock)),
    rs: player.alive ? 0 : Math.max(0, Math.ceil((player.respawnAt - now) / 1000)),
    cd: Object.fromEntries(
      Object.entries(player.vcd || {}).map(([kit, cooldownEnd]) => [
        kit,
        Math.max(0, Math.ceil((cooldownEnd - now) / 1000)),
      ]),
    ),
    fl: Object.fromEntries(
      Object.keys(FLEET).map((kit) => {
        const positionX = fleetOf(room, player.team, kit);
        return [kit, [Math.max(0, positionX.free), positionX.next, FLEET[kit]]];
      }),
    ),
    dn: player.downed ? Math.max(0, Math.ceil((player.downedUntil - now) / 1000)) : 0,
    prep: mil.prepUntil && now < mil.prepUntil ? Math.ceil((mil.prepUntil - now) / 1000) : 0,
    sq: player.squad | 0,
    lead: isLeader(room, player) ? 1 : 0,
    squads: squadsInfo(room, player.team, player),
  });
  if (message === player.tsLast && now - (player.tsAt || 0) < 3000) {
    return;
  }
  player.tsLast = message;
  player.tsAt = now;
  sendRaw(player, message);
}

export function milTick(room, now) {
  selectMilMap(room.milMap);
  const mil = room.mil;
  mil.tick++;
  for (const player of room.players.values()) {
    if (player.seatSwap && now >= player.seatSwap.at) {
      switchSeat(room, player, player.seatSwap.s, true) || (player.seatSwap = null);
    }
  }
  const deltaTime = TICK_MS / 1000;
  const perf = (mil.perf ||= createPerf());
  perfBegin(perf);
  tickVehicles(room, now);
  perfMark(perf, 'vehicles');
  tickBullets(room, now);
  tickRockets(room);
  tickNades(room, now);
  tickShells(room);
  perfMark(perf, 'projectiles');
  tickSectors(room, now);
  tickSupply(room, now);
  tickRevives(room, now);
  tickDrag(room);
  tickPrep(room, now);
  if (mil.tick % 15 === 0) {
    tickBaseProtection(room, now);
  }
  if (mil.tick % 30 === 0) {
    tickBodies(room, now);
  }
  perfMark(perf, 'rules');
  let botMs = 0;
  const rows = new Map();
  for (const player of room.players.values()) {
    if (player.alive) {
      if (player.isBot) {
        const currentNow = performance.now();
        updateMilBot(room, player, now, deltaTime, botApi);
        botMs += performance.now() - currentNow;
      }
      player.history.push({
        t: now,
        pos: [player.pos[0], player.pos[1], player.pos[2]],
        crouch: player.crouch,
        lean: player.lean,
        yaw: player.yaw,
        prone: player.prone || player.downed,
      });
      while (player.history.length && now - player.history[0].t > 1200) {
        player.history.shift();
      }
      if (player.reloading && now >= player.reloadEnd) {
        player.reloading = false;
        if (player.mount && player.reloadWeapon === W.mg) {
          player.mgMag.n = player.mgMag.size;
          api.send(player, {
            t: 'mmount',
            id: player.mount,
            k: 'mg',
            am: [W.mg, player.mgMag.n, 'tracer', 200],
          });
        } else {
          doReload(player, player.reloadWeapon ?? player.weapon);
          if (!player.isBot) {
            sendInv(player, { r: 1 });
          }
        }
      }
      if (player.downed) {
        if (now >= player.downedUntil) {
          killPlayer(room, player.downedBy || player, player, player.downedWid || 'bleed');
        }
      } else {
        if (player.bleed && mil.tick % 3 === 0) {
          player.hp -= (MIL.bleedRates[player.bleed] ?? MIL.bleedRate) * deltaTime * 3;
          if (player.hp <= 0) {
            player.hp = 0;
            downPlayer(room, room.players.get(player.lastHurtBy) || null, player, 'bleed', false);
          }
        }
        if (player.ms.inWire && !player.veh && mil.tick % 6 === 0) {
          hurtPlayer(room, null, player, 1, 'legs', player.pos, 'wire');
        }
      }
    } else if (player.isBot && now >= player.respawnAt && mil.winner < 0) {
      const options = spawnOptions(room, player.team).filter((origin) => origin.ok);
      const pick = updateMilBot.chooseSpawn(room, player, options);
      if (pick) {
        deploy(room, player, pick.id, milBotKit(player.team, player.cls));
      }
    }
    const vehicle = player.veh ? mil.vehicles.get(player.veh) : null;
    const flags =
      (player.ms.sprinting ? 1 : 0) |
      (player.prone ? 2 : 0) |
      (player.downed ? 4 : 0) |
      (player.ui & (UI_FLAGS.map | UI_FLAGS.binos | UI_FLAGS.light | UI_FLAGS.nvg)) |
      (player.useItem || player.reviving || player.dragging ? UI_FLAGS.using : 0) |
      (player.bleed ? 256 : 0) |
      (player.alive && !player.downed && player.hp < 60 ? 512 : 0) |
      (player.draggedBy ? 1024 : 0);
    rows.set(
      player.id,
      playerRow(
        player,
        player.mount && mil.world.structs.get(player.mount)?.type === 'mg' ? W.mg : player.weapon,
        flags,
        vehicle ? vehicle.id : 0,
      ),
    );
  }
  perfMark(perf, 'players');
  if (botMs) {
    const structure = (perf.sec.bots ||= [0, 0]);
    structure[0] += botMs;
    structure[1] = Math.max(structure[1], botMs);
  }
  const vehRows = new Map();
  const toHundredths = (positionX) => Math.round(positionX * 100);
  const toThousandths = (positionX) => Math.round(positionX * 1000);
  for (const vehicle of mil.vehicles.values()) {
    vehRows.set(vehicle.id, [
      vehicle.id,
      vehicle.type,
      vehicle.team,
      toHundredths(vehicle.x),
      toHundredths(vehicle.y),
      toHundredths(vehicle.z),
      toThousandths(vehicle.yaw),
      toThousandths(vehicle.pitch),
      toThousandths(vehicle.roll),
      Math.max(0, Math.round(vehicle.hp)),
      vehicle.alive ? 1 : 0,
      vehicle.driver,
      Math.round(vehicle.cargo),
      toHundredths(vehicle.rotor),
      toHundredths(vehicle.v),
      vehicle.loading === 'load' ? 1 : vehicle.loading === 'unload' ? 2 : 0,
      toHundredths(vehicle.steer || 0),
      vehicle.gear || 1,
      vehicle.engine | 0,
      vehicle.doors | 0,
      toThousandths(vehicle.tyaw || 0),
      toThousandths(vehicle.tp || 0),
      vehicle.gun ? vehicle.gun.n : 0,
      vehicle.gun ? vehicle.gun.spare : 0,
      ...(vehicle.comp
        ? [
            Math.round(vehicle.comp.engine * 100),
            Math.round(vehicle.comp.wheels * 100),
            Math.round(vehicle.comp.rotor * 100),
            Math.round(vehicle.comp.tail * 100),
          ]
        : [100, 100, 100, 100]),
      vehicle.flipped | 0,
      vehicle.burning ? 1 : 0,
    ]);
  }
  const end =
    mil.winner >= 0
      ? { win: mil.winner, ne: Math.max(0, Math.round(mil.nextMatchAt - now)) }
      : null;
  sendSnapshots(room, now, rows, vehRows, end || {}, sendRaw);
  if (mil.forceState || mil.tick % 5 === 0) {
    mil.forceState = false;
    api.broadcast(room, {
      t: 'mstate',
      sec: sectorsMsg(room),
      tc: mil.total ? [mil.total.team, Math.round(mil.total.left), mil.total.paused ? 1 : 0] : null,
    });
  }
  if (mil.tick % 10 === 0) {
    for (const player of room.players.values()) {
      if (!player.isBot) {
        sendTeamState(room, player);
      }
    }
  }
  for (const player of room.players.values()) {
    if (player.isBot || !player.alive) {
      continue;
    }
    const structure = player.ms;
    api.send(player, {
      t: 'ack',
      sp: player.spawnCount,
      s: player.lastSeq,
      ms: [
        roundToThreeDecimals(structure.x),
        roundToThreeDecimals(structure.y),
        roundToThreeDecimals(structure.z),
        roundToThreeDecimals(structure.vx),
        roundToThreeDecimals(structure.vy),
        roundToThreeDecimals(structure.vz),
        structure.onGround ? 1 : 0,
        structure.crouch ? 1 : 0,
        structure.jumpHeld ? 1 : 0,
        roundToThreeDecimals(structure.st),
        roundToThreeDecimals(structure.groundTime),
        structure.prone ? 1 : 0,
        roundToThreeDecimals(structure.rollT),
        structure.rollDir,
      ],
    });
  }
  perfMark(perf, 'net');
  if (mil.winner >= 0 && now >= mil.nextMatchAt) {
    resetMil(room);
  }
  const weapon = perfEnd(perf, TICK_MS, now, {
    players: room.players.size,
    veh: mil.vehicles.size,
    structs: mil.world.structs.size,
    bullets: mil.bullets?.length | 0,
  });
  if (weapon && weapon.slow > 3) {
    api.log(
      `[milsim ${room.code}] slow ticks: ${weapon.slow}/s, avg ${weapon.tick} ms, max ${weapon.max} ms`,
    );
  }
}

const botApi = {
  shoot: (room, player, message, now) => handleShoot(room, player, message, now),
  nade: (room, player, message, now) => handleNade(room, player, message, now),
  reload: (room, player, now) => milMessage(room, player, { t: 'reload' }, now),
  switchTo: (room, player, weaponIndex, now) =>
    milMessage(room, player, { t: 'switch', w: weaponIndex }, now),
  areasOf,
  areaAt,
  spawnOptions,
  vspawn: handleVehSpawn,
  enter: enterVehicle,
  leave: leaveVehicle,
  load: handleLoad,
  build: handleBuild,
  revive: (room, player, id, on, now) => handleRevive(room, player, { id, on }, now),
  bandage: (room, player, now) => {
    if (player.inv.items.bandage > 0 && player.bleed) {
      useItem(player, 'bandage');
      player.bleed = player.bleed >= 3 ? 1 : 0;
    }
  },
  unloadTarget,
  loadSource,
  rearOf,
  W,
  msg: (player, message) => api.send(player, { t: 'mmsg', m: message }),
};
void CLASSES;
