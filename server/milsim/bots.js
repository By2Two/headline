import { canCapture } from '../../shared/milsim/maps.js';
import { HEADGEAR, OUTFITS, FACES, SKINS as SKIN_TONES, encodeLook } from '../../shared/look.js';
import { MW } from '../../shared/milsim/weapons.js';
import {
  milPrimaries,
  defaultKit,
  sanitizeKit,
  MIL,
  VEHICLES,
  CLASS_IDS,
  VEH_GUNS,
  rankOf,
  VEH_RANK,
} from '../../shared/milsim/config.js';
import {
  CAPTURE_CHAIN,
  SECTORS,
  MAIN_BASES,
  SUPPLY_POINTS,
  TERRAIN,
  roadDistanceAt,
  waterAt,
} from '../../shared/milsim/terrain.js';
import { MAPDATA, solidsNear, rayWorld } from '../../shared/milsim/world.js';
import { createMilMoveState, stepMil } from '../../shared/milsim/movement.js';
import { initSense, findCover } from './botsense.js';
import { flyTo, pickLZ, heliportOf, vehGunner } from './botair.js';
import {
  brainUpdate,
  hasTarget,
  isTakingFire,
  takingFireDirection,
  startSprint,
  isSprinting,
} from './botbrain.js';
import { findPath } from './navgrid.js';
import { avoidOnFoot, drive, onBridge, parkingSpot } from './botdrive.js';

const SKILL = {
  easy: { react: 1100, err: 0.012, sight: 200, turn: 2.5, burst: 2 },
  normal: { react: 650, err: 0.006, sight: 320, turn: 4, burst: 3 },
  hard: { react: 380, err: 0.0028, sight: 420, turn: 6, burst: 4 },
};
const NAMES = [
  'Abel',
  'Brisa',
  'Cauã',
  'Dora',
  'Elias',
  'Flor',
  'Gil',
  'Helô',
  'Ivo',
  'Jade',
  'Kiko',
  'Lara',
  'Mel',
  'Noel',
  'Olga',
  'Paco',
  'Quin',
  'Rui',
  'Sol',
  'Teo',
  'Uri',
  'Vivi',
  'Wes',
  'Zeca',
];
const pick = (items) => items[Math.floor(Math.random() * items.length)];
const wrap = (value) => Math.atan2(Math.sin(value), Math.cos(value));
const dist2 = (startX, startZ, endX, endZ) => Math.hypot(startX - endX, startZ - endZ);
const near = [];
const CLASS_CYCLE = [
  'assault',
  'medic',
  'assault',
  'sniper',
  'engineer',
  'assault',
  'medic',
  'assault',
  'engineer',
  'sniper',
];

export function milBotKit(team, classId = 'assault') {
  const prims = milPrimaries(team, classId);
  const prim = pick(prims.length ? prims : milPrimaries(team, 'assault'));
  const index = defaultKit(team, classId);
  const carriesRocket = classId === 'assault' && Math.random() < 0.3;
  return sanitizeKit(
    {
      ...index,
      primary: {
        ...index.primary,
        id: prim.id,
        optic:
          classId === 'sniper'
            ? pick(['scope8', 'scope12'])
            : pick(['iron', 'reddot', 'holo', 'acog']),
      },
      mags: Array.from({ length: 5 }, () => ({ w: prim.id, ammo: 'fmj' })).concat([
        { w: index.secondary.id, ammo: 'fmj' },
      ]),
      vest: pick(['light', 'light', 'heavy']),
      helmet: pick(['light', 'heavy']),
      pack: carriesRocket ? 'large' : pick(['small', 'small', 'none']),
      launcher: carriesRocket ? 'rpg' : '',
      items: { ...index.items, rocket: carriesRocket ? 2 : 0 },
    },
    team,
  );
}

export function pickBotRoles(room) {
  for (const team of [0, 1]) {
    const bots = [...room.players.values()]
      .filter((other) => other.isBot && other.team === team)
      .sort((left, right) => left.id - right.id);
    const nLogi = bots.length >= 5 ? Math.max(1, Math.round(bots.length * 0.1)) : 0;
    bots.forEach((bot, index) => {
      const classId = index < nLogi ? 'engineer' : CLASS_CYCLE[index % CLASS_CYCLE.length];
      const role = index < nLogi ? 'logi' : 'fight';
      if (bot.cls !== classId || bot.role !== role) {
        bot.cls = classId;
        bot.role = role;
        bot.bot = null;
      }
    });
  }
}

export function makeMilBot(id, nearestDistance, skill) {
  const look = {
    head: pick(HEADGEAR).id,
    outfit: pick(OUTFITS).id,
    face: pick(FACES).id,
    skin: pick(SKIN_TONES).id,
  };
  return {
    id,
    ws: null,
    isBot: true,
    room: null,
    name: `BOT ${NAMES[(nearestDistance - 1) % NAMES.length]}`,
    team: 0,
    skill,
    cls: 'assault',
    role: 'fight',
    pos: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    crouch: false,
    aiming: false,
    hp: 100,
    alive: false,
    kills: 0,
    deaths: 0,
    weapon: 0,
    slots: [],
    lk: encodeLook(look),
    skins: {},
    nextFire: 0,
    readyAt: 0,
    reloading: false,
    reloadEnd: 0,
    history: [],
    spawnCount: 0,
    protectedUntil: 0,
    respawnAt: 0,
    ms: createMilMoveState(),
    lastSeq: 0,
  };
}

const enemyBase = (bot) => MAIN_BASES[1 - bot.team];
const ownBase = (bot) => MAIN_BASES[bot.team];
function riverSide(pointX, pointZ) {
  const river = TERRAIN.river;
  let best = Infinity;
  let side = 1;
  for (let index = 0; index < river.length - 1; index++) {
    const [startX, startZ] = river[index];
    const [endX, endZ] = river[index + 1];
    const segmentX = endX - startX;
    const segmentZ = endZ - startZ;
    const fraction = Math.max(
      0,
      Math.min(
        1,
        ((pointX - startX) * segmentX + (pointZ - startZ) * segmentZ) /
          (segmentX * segmentX + segmentZ * segmentZ || 1),
      ),
    );
    const nearestX = startX + segmentX * fraction;
    const nearestZ = startZ + segmentZ * fraction;
    const distance = Math.hypot(pointX - nearestX, pointZ - nearestZ);
    if (distance < best) {
      best = distance;
      side = Math.sign(segmentX * (pointZ - startZ) - segmentZ * (pointX - startX)) || 1;
    }
  }
  return side;
}

const BRIDGE_REACHED_M = 6;
function viaBridge(bot, pointX, pointZ) {
  if (!MAPDATA.bridges.length || onBridge(bot.pos[0], bot.pos[2])) {
    return [pointX, pointZ];
  }
  const mySide = riverSide(bot.pos[0], bot.pos[2]);
  if (mySide === riverSide(pointX, pointZ)) {
    return [pointX, pointZ];
  }
  let best = null;
  let bestCost = Infinity;
  for (const bridge of MAPDATA.bridges) {
    const ends = [bridge.pts[0], bridge.pts[bridge.pts.length - 1]];
    const near = riverSide(ends[0][0], ends[0][1]) === mySide ? ends[0] : ends[1];
    const far = near === ends[0] ? ends[1] : ends[0];
    const cost =
      dist2(bot.pos[0], bot.pos[2], near[0], near[1]) + dist2(far[0], far[1], pointX, pointZ);
    if (cost < bestCost) {
      bestCost = cost;
      best = { near, far };
    }
  }
  if (dist2(bot.pos[0], bot.pos[2], best.near[0], best.near[1]) > BRIDGE_REACHED_M) {
    return best.near;
  }
  return best.far;
}

function safePoint(bot, spotX, spotZ) {
  const enemyBaseSpot = enemyBase(bot);
  const distance = dist2(spotX, spotZ, enemyBaseSpot.x, enemyBaseSpot.z);
  if (distance >= MIL.enemyBaseNoGo) {
    return [spotX, spotZ];
  }
  const index = MIL.enemyBaseNoGo / Math.max(1, distance);
  return [
    enemyBaseSpot.x + (spotX - enemyBaseSpot.x) * index,
    enemyBaseSpot.z + (spotZ - enemyBaseSpot.z) * index,
  ];
}

function chooseSpawn(room, bot, options) {
  if (!options.length) {
    return null;
  }
  if (bot.role === 'logi') {
    return options.find((option) => option.kind === 'main') || options[0];
  }
  const goal = pickGoal(room, bot);
  const target = SECTORS.find((sector) => sector.id === goal) || SECTORS[0];
  let best = options[0];
  let bestDistance = Infinity;
  for (const option of options) {
    const distance =
      dist2(option.x, option.z, target.x, target.z) + (option.kind === 'main' ? 150 : 0);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = option;
    }
  }
  return best;
}

function pickGoal(room, bot) {
  const mil = room.mil;
  const position = bot.alive ? bot.pos : [ownBase(bot).x, 0, ownBase(bot).z];
  const holdAll = mil.total && mil.total.team === bot.team;
  const lostAll = mil.total && mil.total.team !== bot.team;
  const assigned = {};
  for (const other of room.players.values()) {
    if (other !== bot && other.isBot && other.team === bot.team && other.bot?.goal) {
      assigned[other.bot.goal] = (assigned[other.bot.goal] || 0) + 1;
    }
  }
  const candidate = mil.sectors.map((sector, index) => {
    const distance = SECTORS[index];
    if (!canCapture(mil.sectors, bot.team, sector.id, CAPTURE_CHAIN)) {
      return { id: sector.id, w: -1 };
    }
    let weapon = 1;
    if (holdAll) {
      weapon = sector.contested ? 7 : 1.5;
    } else if (lostAll) {
      weapon = 3 / (1 + (sector.n?.[1 - bot.team] || 0) * 0.5);
    } else {
      if (sector.owner !== bot.team) {
        weapon = 3;
      }
      if (sector.owner === bot.team && sector.contested) {
        weapon = 4;
      }
      if (sector.owner === bot.team && !sector.contested && sector.cap >= 1) {
        weapon = 0.4;
      }
    }
    const goalDistance = dist2(distance.x, distance.z, position[0], position[2]);
    const spread = 1 / (1 + (assigned[sector.id] || 0) * (holdAll ? 0.35 : 0.12));
    return {
      id: sector.id,
      w: ((weapon * 600) / (300 + goalDistance)) * spread * (0.6 + Math.random()),
    };
  });
  candidate.sort((approachAngle, right) => right.w - approachAngle.w);
  return candidate[0].id;
}

function nearestEnemy(room, bot, now) {
  const state = bot.bot;
  if (now < (state.nearAt || 0)) {
    return state.near ?? Infinity;
  }
  state.nearAt = now + 900 + Math.random() * 200;
  let nearestDistance = Infinity;
  for (const other of room.players.values()) {
    if (!other.alive || other.team === bot.team) {
      continue;
    }
    const distance = dist2(other.pos[0], other.pos[2], bot.pos[0], bot.pos[2]);
    if (distance < nearestDistance) {
      nearestDistance = distance;
    }
  }
  state.near = nearestDistance;
  return nearestDistance;
}

export function botHurt(bot, attacker, now) {
  if (!bot.bot || !attacker || attacker === bot) {
    return;
  }
  const sense = initSense(bot);
  sense.supp = Math.min(1, sense.supp + 0.45);
  sense.hurtAt = now;
  const message = sense.mem.get(attacker.id) || {
    conf: 0,
    x: 0,
    y: 0,
    z: 0,
    seen: 0,
    vis: false,
    heard: 0,
  };
  const error = 6 + Math.random() * 10;
  const angle = Math.random() * Math.PI * 2;
  message.x = attacker.pos[0] + Math.cos(angle) * error;
  message.z = attacker.pos[2] + Math.sin(angle) * error;
  message.y = attacker.pos[1];
  message.heard = now;
  message.conf = Math.max(message.conf, 0.8);
  sense.mem.set(attacker.id, message);
  sense.heardAt = now;
  sense.heard = { x: message.x, z: message.z };
  sense.look = { x: message.x, z: message.z, until: now + 3000 };
}

function walkTo(room, bot, now, targetX, targetZ, out, sprintFar = true, options = {}) {
  [targetX, targetZ] = safePoint(bot, targetX, targetZ);
  if (!options.direct) {
    [targetX, targetZ] = viaBridge(bot, targetX, targetZ);
  }
  const deltaX = targetX - bot.pos[0];
  const deltaZ = targetZ - bot.pos[2];
  const distance = Math.hypot(deltaX, deltaZ);
  if (distance < 1.5) {
    return true;
  }
  out.yaw = Math.atan2(-deltaX, -deltaZ);
  out.fwd = 1;
  out.sprint = sprintFar && distance > 60 && bot.ms.st > 0.45;
  const forwardX = -Math.sin(out.yaw);
  const forwardZ = -Math.cos(out.yaw);
  solidsNear(room.mil.world, bot.pos[0] + forwardX * 2, bot.pos[2] + forwardZ * 2, 1.2, near);
  const blocked = near.some(
    (endX) =>
      !endX.soft &&
      endX.max[1] > bot.pos[1] + 0.5 &&
      endX.min[1] < bot.pos[1] + 1.7 &&
      bot.pos[0] + forwardX * 1.5 > endX.min[0] - 0.5 &&
      bot.pos[0] + forwardX * 1.5 < endX.max[0] + 0.5 &&
      bot.pos[2] + forwardZ * 1.5 > endX.min[2] - 0.5 &&
      bot.pos[2] + forwardZ * 1.5 < endX.max[2] + 0.5,
  );
  const lowWall =
    blocked &&
    !near.some(
      (endX) =>
        !endX.soft &&
        endX.max[1] > bot.pos[1] + 1.4 &&
        endX.min[1] < bot.pos[1] + 1.7 &&
        bot.pos[0] + forwardX * 1.5 > endX.min[0] - 0.5 &&
        bot.pos[0] + forwardX * 1.5 < endX.max[0] + 0.5 &&
        bot.pos[2] + forwardZ * 1.5 > endX.min[2] - 0.5 &&
        bot.pos[2] + forwardZ * 1.5 < endX.max[2] + 0.5,
    );
  const door =
    blocked &&
    near.find(
      (endX) =>
        (endX.door ?? null) !== null &&
        bot.pos[0] + forwardX * 1.5 > endX.min[0] - 0.5 &&
        bot.pos[0] + forwardX * 1.5 < endX.max[0] + 0.5 &&
        bot.pos[2] + forwardZ * 1.5 > endX.min[2] - 0.5 &&
        bot.pos[2] + forwardZ * 1.5 < endX.max[2] + 0.5,
    );
  if (door && room.mil.openDoor) {
    room.mil.openDoor(door.door);
  }
  if (lowWall) {
    out.jumpPress = out.jump = true;
  } else if (
    blocked ||
    waterAt(bot.pos[0] + forwardX * 4, bot.pos[1], bot.pos[2] + forwardZ * 4) > 1.3
  ) {
    bot.dodge = bot.dodge || (Math.random() < 0.5 ? 1 : -1);
    bot.dodgeUntil = now + 900;
  }
  if (now < (bot.dodgeUntil || 0)) {
    out.yaw += bot.dodge * 1.1;
  } else {
    bot.dodge = 0;
  }
  if (now < (bot.escapeUntil || 0)) {
    out.yaw = bot.escapeYaw;
    out.sprint = false;
  }
  if (!bot.stuckAt || now - bot.stuckAt > 2500) {
    if (bot.stuckPos && dist2(bot.pos[0], bot.pos[2], bot.stuckPos[0], bot.stuckPos[1]) < 1.5) {
      bot.stuckN = (bot.stuckN || 0) + 1;
      if (bot.stuckN >= 4 && bot.bot) {
        bot.bot.wp = null;
        bot.stuckN = 1;
      }
      if (bot.stuckN >= 2) {
        const want = Math.atan2(-deltaX, -deltaZ);
        const eye = [bot.pos[0], bot.pos[1] + 1.1, bot.pos[2]];
        let best = null;
        for (let index = 0; index < 16; index++) {
          const probeAngle = (index / 16) * Math.PI * 2;
          const direction = [-Math.sin(probeAngle), 0, -Math.cos(probeAngle)];
          const hit = rayWorld(room.mil.world, eye, direction, 25, { skip: (endX) => endX.soft });
          const free = hit ? hit.t : 25;
          const score = free + 5 * Math.cos(probeAngle - want) + Math.random();
          if (free > 2.5 && (!best || score > best.score)) {
            best = { a: probeAngle, score, free };
          }
        }
        if (best) {
          bot.escapeYaw = best.a;
          bot.escapeUntil = now + Math.min(4000, 600 + best.free * 260);
          bot.dodge = 0;
          bot.dodgeUntil = 0;
        }
      } else {
        bot.dodge = -bot.dodge || 1;
        bot.dodgeUntil = now + 1500;
      }
      out.jumpPress = true;
    } else {
      bot.stuckN = 0;
    }
    bot.stuckPos = [bot.pos[0], bot.pos[2]];
    bot.stuckAt = now;
  }
  return false;
}

function freeSeat(transport, bot) {
  const target = VEH_GUNS[transport.type];
  if (
    target &&
    !transport.seats[target.seat] &&
    (transport.botFly?.wantGunner || transport.driver)
  ) {
    return target.seat;
  }
  const index = transport.seats.findIndex(
    (sector, index) => index > 0 && !sector && !(transport.type === 'truck'),
  );
  return index > 0 ? index : -1;
}

function humanRide(room, bot) {
  let best = null;
  let bestDistance = 90;
  for (const candidateVehicle of room.mil.vehicles.values()) {
    if (
      !candidateVehicle.alive ||
      candidateVehicle.team !== bot.team ||
      !candidateVehicle.driver ||
      VEHICLES[candidateVehicle.type].cargo
    ) {
      continue;
    }
    const driver = room.players.get(candidateVehicle.driver);
    if (!driver || driver.isBot) {
      continue;
    }
    const slow =
      VEHICLES[candidateVehicle.type].kind === 'heli'
        ? candidateVehicle.onGround ||
          Math.hypot(candidateVehicle.vx, candidateVehicle.vy, candidateVehicle.vz) < 2
        : Math.abs(candidateVehicle.v) < 2;
    if (!slow) {
      continue;
    }
    const distance = dist2(candidateVehicle.x, candidateVehicle.z, bot.pos[0], bot.pos[2]);
    if (distance < bestDistance && freeSeat(candidateVehicle, bot) > 0) {
      bestDistance = distance;
      best = candidateVehicle;
    }
  }
  return best;
}

function boardVehicle(room, bot, now, api, target, out) {
  const seat = freeSeat(target, bot);
  if (seat <= 0) {
    return false;
  }
  if (dist2(target.x, target.z, bot.pos[0], bot.pos[2]) < VEHICLES[target.type].len / 2 + 2.5) {
    if (api.enter(room, bot, { id: target.id, s: seat })) {
      bot.bot.rideSince = now;
    }
  } else {
    walkTo(room, bot, now, target.x, target.z, out);
  }
  return true;
}

function chooseVehicle(room, bot, dGoal, enemyGoal) {
  const rank = rankOf(bot.xp);
  const ok = (index) => rank >= (VEH_RANK[index] || 0);
  const near = [...room.players.values()].filter(
    (other) =>
      other.isBot &&
      other.alive &&
      !other.veh &&
      other.team === bot.team &&
      dist2(other.pos[0], other.pos[2], bot.pos[0], bot.pos[2]) < 40,
  ).length;
  const radius = Math.random();
  if (dGoal > 700 && radius < 0.3) {
    if (radius < 0.08 && near >= 1 && ok('gunship')) {
      return { tent: 'heli', k: 'gunship' };
    }
    if (ok('heli')) {
      return { tent: 'heli', k: 'heli' };
    }
  }
  if (enemyGoal && radius < 0.5) {
    const index = radius < 0.38 ? 'apc' : radius < 0.46 ? 'ifv' : 'tank';
    if (ok(index)) {
      return { tent: 'heavy', k: index };
    }
    if (ok('apc')) {
      return { tent: 'heavy', k: 'apc' };
    }
  }
  return {
    tent: 'car',
    k: near >= 4 ? 'transport' : radius < 0.75 || !ok('mjeep') ? 'jeep' : 'mjeep',
  };
}

const BUILD_ROAD_CLEAR_M = 8;
function engineerBuild(room, bot, now, api, sector) {
  if (
    bot.cls !== 'engineer' ||
    !sector ||
    sector.owner !== bot.team ||
    sector.store < 150 ||
    now < (bot.bot.buildAt || 0)
  ) {
    return;
  }
  bot.bot.buildAt = now + 40000 + Math.random() * 30000;
  const index = pick(['sandbags', 'sandbags', 'cover', 'barricade', 'hesco', 'wire']);
  const spot = [0, 1, -1, 2, -2, 3, -3, 4]
    .map((turn) => bot.yaw + (turn * Math.PI) / 4)
    .map((angle) => [angle, bot.pos[0] - Math.sin(angle) * 4, bot.pos[2] - Math.cos(angle) * 4])
    .find(([, siteX, siteZ]) => roadDistanceAt(siteX, siteZ) > BUILD_ROAD_CLEAR_M);
  if (!spot) {
    return;
  }
  const [buildAngle, currentSiteX, currentSiteZ] = spot;
  api.build(room, bot, {
    k: index,
    x: Math.round(currentSiteX * 2) / 2,
    z: Math.round(currentSiteZ * 2) / 2,
    rot: buildAngle / (Math.PI / 2),
  });
}

const ORDER_TICK_MS = 500;
const RAVEN_THINK_M = 1100;
const VEHICLE_SEARCH_M = 150;
const WAYPOINT_DONE_M = 2.5;
const PATHS_PER_TICK = 1;
const EXIT_UNDER_FIRE_M = 40;
const BURNING_HP = 0.15;
const TENT_WALK_M = 60;

function orderNodes(room, bot) {
  const nodes = room.mil.sectors.map((sector, index) => ({
    id: sector.id,
    x: SECTORS[index].x,
    z: SECTORS[index].z,
    r: SECTORS[index].r,
    owner: sector.owner,
    contested: sector.contested,
    capturable: canCapture(room.mil.sectors, bot.team, sector.id, CAPTURE_CHAIN),
    isBase: false,
  }));
  const base = ownBase(bot);
  nodes.push({
    id: 'base',
    x: base.x,
    z: base.z,
    r: base.r,
    owner: bot.team,
    contested: false,
    capturable: false,
    isBase: true,
  });
  return nodes;
}

function adjacentNodes(nodes, node) {
  return nodes
    .filter((other) => other !== node)
    .sort(
      (left, right) =>
        dist2(left.x, left.z, node.x, node.z) - dist2(right.x, right.z, node.x, node.z),
    )
    .slice(0, 2);
}

function closestNode(nodes, bot) {
  let best = nodes[0];
  let bestDistance = Infinity;
  for (const node of nodes) {
    const distance = dist2(node.x, node.z, bot.pos[0], bot.pos[2]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = node;
    }
  }
  return best;
}

const shouldGoto = (node, team) =>
  node.isBase
    ? false
    : (node.owner !== team && node.capturable) || (node.owner === team && node.contested);

function attackNode(room, bot, node, now) {
  const state = bot.bot;
  state.targetNode = node.id;
  if (!node.isBase) {
    state.goal = node.id;
  }
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(Math.random()) * node.r * (node.isBase ? 0.3 : 0.6);
  moveTo(room, bot, node.x + Math.cos(angle) * radius, node.z + Math.sin(angle) * radius, now);
}

function newAttackOrder(room, bot, nodes, now) {
  const closest = closestNode(nodes, bot);
  if (closest.owner !== bot.team && closest.capturable) {
    return attackNode(room, bot, closest, now);
  }
  const choices = [];
  for (const node of adjacentNodes(nodes, closest)) {
    if (node.owner !== bot.team && node.capturable) {
      choices.push(node);
      if (node.owner >= 0) {
        choices.push(node);
      }
    }
  }
  if (choices.length) {
    return attackNode(room, bot, choices[Math.floor(Math.random() * choices.length)], now);
  }
  const enemy = nodes.filter((node) => node.owner !== bot.team && node.capturable);
  if (enemy.length) {
    return attackNode(room, bot, enemy[Math.floor(Math.random() * enemy.length)], now);
  }
  const own = nodes.filter((node) => !node.isBase);
  const contested = own.filter((node) => node.contested);
  const pick = contested.length ? contested : own;
  return attackNode(room, bot, pick[Math.floor(Math.random() * pick.length)], now);
}

function leaveCover(room, bot) {
  const state = bot.bot;
  if (state.coverKey) {
    room.mil.coverTaken?.delete(state.coverKey);
  }
  state.coverKey = null;
  state.cover = null;
  state.dugIn = false;
  state.coverFacing = null;
}

function moveTo(room, bot, positionX, positionZ, now) {
  const state = bot.bot;
  leaveCover(room, bot);
  state.gotoPoint = [positionX, positionZ];
  state.footPath = [[positionX, positionZ]];
  state.footPathIndex = 0;
  state.hasPath = true;
  state.footPathPending = true;
  state.footPathSince = now;
}

function digInTowards(room, bot, direction, now) {
  const state = bot.bot;
  leaveCover(room, bot);
  state.dugIn = true;
  state.hasPath = false;
  state.coverFacing = [direction[0], direction[2]];
  const threat = {
    x: bot.pos[0] + direction[0] * 40,
    y: bot.pos[1],
    z: bot.pos[2] + direction[2] * 40,
  };
  const spot = findCover(room, bot, threat);
  room.mil.coverTaken ||= new Set();
  if (spot) {
    const key = `${Math.round(spot[0] / 2)}|${Math.round(spot[1] / 2)}`;
    if (!room.mil.coverTaken.has(key)) {
      room.mil.coverTaken.add(key);
      state.coverKey = key;
      state.cover = spot;
      startSprint(bot, now);
    }
  }
}

function nearbyVehicleWithSeat(room, bot, now) {
  let best = null;
  let bestDistance = VEHICLE_SEARCH_M;
  for (const candidate of room.mil.vehicles.values()) {
    const definition = VEHICLES[candidate.type];
    if (
      !candidate.alive ||
      candidate.team !== bot.team ||
      candidate.logiBot ||
      definition.cargo ||
      candidate.hp < definition.hp * BURNING_HP
    ) {
      continue;
    }
    if (definition.kind === 'heli' && !candidate.botFly) {
      continue;
    }
    if (
      ((candidate.stuckUntil ?? 0) > now || (candidate.dropUntil ?? 0) > now) &&
      !candidate.driver
    ) {
      continue;
    }
    const driver = candidate.driver && room.players.get(candidate.driver);
    if (driver && !driver.isBot) {
      continue;
    }
    if (!candidate.driver && rankOf(bot.xp) < (VEH_RANK[candidate.type] || 0)) {
      continue;
    }
    const seat = candidate.driver ? freeSeat(candidate, bot) : 0;
    if (
      seat < 0 ||
      ridersComing(room, candidate) >= seatsFree(candidate) + (candidate.driver ? 0 : 1)
    ) {
      continue;
    }
    const distance = dist2(candidate.x, candidate.z, bot.pos[0], bot.pos[2]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

function ravenOrders(room, bot, now) {
  const state = bot.bot;
  const nodes = orderNodes(room, bot);
  if (isTakingFire(bot, now)) {
    if (!state.dugIn) {
      const direction = takingFireDirection(bot);
      if (direction) {
        digInTowards(room, bot, direction, now);
      }
    }
    return;
  }
  const atBase =
    dist2(ownBase(bot).x, ownBase(bot).z, bot.pos[0], bot.pos[2]) < ownBase(bot).r + 40;
  if (atBase && !state.targetVehicle && !state.dugIn) {
    const vehicle = nearbyVehicleWithSeat(room, bot, now);
    if (vehicle) {
      state.targetVehicle = vehicle.id;
      return;
    }
  }
  const closest = closestNode(nodes, bot);
  const target = nodes.find((node) => node.id === state.targetNode);
  if (state.targetNode !== closest.id && shouldGoto(closest, bot.team)) {
    attackNode(room, bot, closest, now);
  } else if (state.targetNode === closest.id && !shouldGoto(closest, bot.team)) {
    newAttackOrder(room, bot, nodes, now);
  } else if (state.dugIn || (!state.hasPath && !state.targetVehicle)) {
    const vehicle = !state.dugIn && nearbyVehicleWithSeat(room, bot, now);
    if (vehicle) {
      state.targetVehicle = vehicle.id;
      return;
    }
    if (!target || !shouldGoto(target, bot.team)) {
      newAttackOrder(room, bot, nodes, now);
    } else {
      attackNode(room, bot, target, now);
    }
  }
}

function followPath(room, bot, now, out) {
  const state = bot.bot;
  if (state.footPathPending) {
    const mil = room.mil;
    if (mil.pathTick !== now) {
      mil.pathTick = now;
      mil.pathsThisTick = 0;
    }
    if (mil.pathsThisTick < PATHS_PER_TICK) {
      mil.pathsThisTick++;
      state.footPathPending = false;
      state.footPath = findPath(bot.pos[0], bot.pos[2], state.gotoPoint[0], state.gotoPoint[1]) || [
        state.gotoPoint,
      ];
      state.footPathIndex = 0;
    }
  }
  let waypoint = state.footPath[state.footPathIndex];
  while (waypoint && dist2(waypoint[0], waypoint[1], bot.pos[0], bot.pos[2]) < WAYPOINT_DONE_M) {
    state.footPathIndex++;
    waypoint = state.footPath[state.footPathIndex];
  }
  if (!waypoint) {
    state.hasPath = false;
    return true;
  }
  avoidOnFoot(room, bot, state.footPath, state.footPathIndex);
  waypoint = state.footPath[state.footPathIndex];
  walkTo(room, bot, now, waypoint[0], waypoint[1], out, false, { direct: true });
  if (bot.stuckN >= 3) {
    state.footPathPending = true;
    bot.stuckN = 0;
  }
  return false;
}

function localAvoidance(room, bot) {
  let positionX = 0;
  let positionZ = 0;
  for (const mate of room.players.values()) {
    if (mate === bot || !mate.alive || mate.team !== bot.team || mate.veh || mate.downed) {
      continue;
    }
    const deltaX = bot.pos[0] - mate.pos[0];
    const deltaZ = bot.pos[2] - mate.pos[2];
    const distance = Math.hypot(deltaX, deltaZ);
    if (distance > 0.01 && distance < 1.5) {
      const push = 2 * (1 - distance / 1.5);
      positionX += (deltaX / distance) * push;
      positionZ += (deltaZ / distance) * push;
    }
  }
  return [positionX, positionZ];
}

function takeWheel(room, bot, target, now) {
  const state = bot.bot;
  if (!SECTORS.some((sector) => sector.id === state.goal)) {
    newAttackOrder(room, bot, orderNodes(room, bot), now);
  }
  if (VEHICLES[target.type].kind === 'heli') {
    target.botFly = {
      goal: state.goal,
      phase: 'board',
      departAt: now + 12000,
      attack: target.type === 'gunship',
      wantGunner: target.type === 'gunship',
    };
  } else {
    target.botDrive = {
      goal: state.goal,
      departAt: now + 8000,
      heavy: !!VEHICLES[target.type].heavyArmor,
    };
  }
}

function ravenFight(room, bot, now, skill, api, out) {
  const state = bot.bot;
  if (now >= (state.orderAt || 0)) {
    state.orderAt = now + ORDER_TICK_MS * (0.9 + Math.random() * 0.2);
    ravenOrders(room, bot, now);
  }
  if (state.targetVehicle) {
    const vehicle = room.mil.vehicles.get(state.targetVehicle);
    const seat = vehicle && vehicle.alive ? (vehicle.driver ? freeSeat(vehicle, bot) : 0) : -1;
    if (seat < 0) {
      state.targetVehicle = null;
    } else if (
      dist2(vehicle.x, vehicle.z, bot.pos[0], bot.pos[2]) <
      VEHICLES[vehicle.type].len / 2 + 2.5
    ) {
      if (api.enter(room, bot, { id: vehicle.id, s: seat })) {
        state.rideSince = now;
        state.hasPath = false;
        if (seat === 0 && !vehicle.botDrive && !vehicle.botFly) {
          takeWheel(room, bot, vehicle, now);
        }
      }
      state.targetVehicle = null;
      return;
    } else {
      walkTo(room, bot, now, vehicle.x, vehicle.z, out, false);
      return;
    }
  }
  const goalSector = SECTORS.find((sector) => sector.id === state.goal);
  const goalDistance = goalSector ? dist2(goalSector.x, goalSector.z, bot.pos[0], bot.pos[2]) : 0;
  const atBase = dist2(ownBase(bot).x, ownBase(bot).z, bot.pos[0], bot.pos[2]) < 220;
  if (
    goalDistance > MIL.botWalkDist &&
    atBase &&
    now >= (state.vehPlanAt || 0) &&
    !hasTarget(bot)
  ) {
    const sector = room.mil.sectors.find((sector) => sector.id === state.goal);
    state.vehPlan ||= chooseVehicle(room, bot, goalDistance, sector && sector.owner !== bot.team);
    const tent = MAPDATA.vtents.find(
      (vtent) => vtent.team === bot.team && vtent.kind === state.vehPlan.tent,
    );
    const tentNear = tent && dist2(tent.x, tent.z, bot.pos[0], bot.pos[2]) < TENT_WALK_M;
    if (tentNear && now >= (bot.vcd?.[tent.kind] || 0)) {
      if (dist2(tent.x, tent.z, bot.pos[0], bot.pos[2]) > 6) {
        walkTo(room, bot, now, tent.x, tent.z, out, false);
        return;
      }
      const vehicle = api.vspawn(room, bot, { tent: tent.id, k: state.vehPlan.k });
      state.vehPlan = null;
      state.vehPlanAt = now + 20000;
      if (vehicle) {
        state.targetVehicle = vehicle.id;
        return;
      }
    } else {
      state.vehPlan = null;
      state.vehPlanAt = now + 15000;
    }
  }
  if (state.dugIn) {
    if (state.cover && dist2(state.cover[0], state.cover[1], bot.pos[0], bot.pos[2]) > 1.2) {
      walkTo(room, bot, now, state.cover[0], state.cover[1], out, false);
    } else {
      out.crouch = !hasTarget(bot) || bot.reloading;
    }
    return;
  }
  if (state.hasPath) {
    followPath(room, bot, now, out);
    if (out.fwd) {
      const push = localAvoidance(room, bot);
      if (push[0] || push[1]) {
        const moveX = -Math.sin(out.yaw) + push[0] * 0.4;
        const moveZ = -Math.cos(out.yaw) + push[1] * 0.4;
        out.yaw = Math.atan2(-moveX, -moveZ);
      }
    }
  } else {
    const sector = room.mil.sectors.find((sector) => sector.id === state.goal);
    if (sector) {
      engineerBuild(room, bot, now, api, sector);
    }
  }
}

function ravenVehicleExit(room, bot, vehicle, now, api) {
  const definition = VEHICLES[vehicle.type];
  const botDriven = !!room.players.get(vehicle.driver)?.isBot;
  const everyoneOut = () => {
    if (botDriven) {
      dropOff(room, api, vehicle, now);
    } else {
      api.leave(room, bot);
    }
    return true;
  };
  if (vehicle.hp < definition.hp * BURNING_HP) {
    return everyoneOut();
  }
  const goal = SECTORS.find((sector) => sector.id === (vehicle.botDrive?.goal ?? bot.bot.goal));
  if (
    goal &&
    !definition.heavyArmor &&
    definition.kind !== 'heli' &&
    isTakingFire(bot, now) &&
    dist2(vehicle.x, vehicle.z, goal.x, goal.z) < goal.r + EXIT_UNDER_FIRE_M
  ) {
    return everyoneOut();
  }
  return false;
}

const PARK_ARRIVE_M = 3;
function logiRole(room, bot, now, skill, api, out) {
  const state = bot.bot;
  const mil = room.mil;
  let truck = state.truck && mil.vehicles.get(state.truck);
  if (truck && truck.comp && truck.comp.engine <= 0.02) {
    if (bot.veh === truck.id) {
      api.leave(room, bot);
    }
    truck.logiBot = null;
    truck = null;
  }
  if (truck && (!truck.alive || (truck.driver && truck.driver !== bot.id))) {
    truck = null;
  }
  if (!truck) {
    state.truck = 0;
    state.phase = null;
    if (state.fightUntil > now) {
      return ravenFight(room, bot, now, skill, api, out);
    }
    let free = null;
    let supplyDistance = 450;
    for (const vehicle of mil.vehicles.values()) {
      if (
        !vehicle.alive ||
        vehicle.type !== 'truck' ||
        vehicle.team !== bot.team ||
        vehicle.driver ||
        (vehicle.comp && vehicle.comp.engine <= 0.02) ||
        (vehicle.logiBot && vehicle.logiBot !== bot.id && room.players.get(vehicle.logiBot)?.alive)
      ) {
        continue;
      }
      const distance = dist2(vehicle.x, vehicle.z, bot.pos[0], bot.pos[2]);
      if (distance < supplyDistance) {
        supplyDistance = distance;
        free = vehicle;
      }
    }
    if (free) {
      state.truck = free.id;
      free.logiBot = bot.id;
      return;
    }
    const tent = MAPDATA.vtents.find((vtent) => vtent.team === bot.team && vtent.kind === 'car');
    if (now < (bot.vcd?.car || 0) || now < (state.noTruckUntil || 0)) {
      return ravenFight(room, bot, now, skill, api, out);
    }
    if (dist2(tent.x, tent.z, bot.pos[0], bot.pos[2]) > 6) {
      return walkTo(room, bot, now, tent.x, tent.z, out);
    }
    const currentVehicle = api.vspawn(room, bot, { tent: tent.id, k: 'truck' });
    if (currentVehicle) {
      state.truck = currentVehicle.id;
      currentVehicle.logiBot = bot.id;
    } else {
      state.noTruckUntil = now + 15000;
      return ravenFight(room, bot, now, skill, api, out);
    }
    return;
  }
  if (bot.veh !== truck.id) {
    if (state.fightUntil > now) {
      return ravenFight(room, bot, now, skill, api, out);
    }
    if (bot.veh) {
      return api.leave(room, bot);
    }
    if (dist2(truck.x, truck.z, bot.pos[0], bot.pos[2]) < VEHICLES.truck.len / 2 + 2.5) {
      api.enter(room, bot, { id: truck.id, s: 0 });
    } else {
      walkTo(room, bot, now, truck.x, truck.z, out);
    }
    return;
  }
  if (bot.seat !== 0) {
    return;
  }
  if (!state.phase || (state.phase === 'wait' && now >= (state.nextPick || 0))) {
    if (truck.cargo < MIL.truckMax * 0.6) {
      const busy = (point) =>
        [...mil.vehicles.values()].some(
          (candidate) =>
            candidate !== truck &&
            candidate.alive &&
            candidate.loading === 'load' &&
            dist2(candidate.x, candidate.z, point.x, point.z) < point.r + 12,
        );
      const score = (candidate) =>
        dist2(candidate.x, candidate.z, truck.x, truck.z) +
        (mil.points[candidate.id].stock < MIL.truckMax * 0.6 ? 2500 : 0) +
        (busy(candidate) ? 1500 : 0);
      const supplyPoint =
        [...SUPPLY_POINTS]
          .filter(
            (positionX) =>
              mil.points[positionX.id].stock > 300 && !(state.skipPt?.[positionX.id] > now),
          )
          .sort((left, right) => score(left) - score(right))[0] || SUPPLY_POINTS[0];
      state.phase = 'load';
      state.dest = [supplyPoint.x, supplyPoint.z];
    } else {
      const cands = [];
      for (const supplyTent of MAPDATA.supplyTents) {
        const sector = mil.sectors.find((positionX) => positionX.id === supplyTent.sector);
        if (sector.owner !== bot.team || sector.store >= MIL.sectorMax - 150) {
          continue;
        }
        cands.push({
          x: supplyTent.x,
          z: supplyTent.z,
          sector: supplyTent.sector,
          need: 1 - sector.store / MIL.sectorMax,
          hot: sector.contested,
        });
      }
      for (const fob of mil.fobs.values()) {
        if (fob.team !== bot.team || fob.store >= MIL.fobMax - 150) {
          continue;
        }
        cands.push({
          x: fob.x,
          z: fob.z,
          sector: null,
          need: (1 - fob.store / MIL.fobMax) * 1.3,
          hot: false,
        });
      }
      for (const candidate of cands) {
        candidate.score =
          candidate.need *
          (candidate.hot ? 0.25 : 1) *
          (600 / (400 + dist2(candidate.x, candidate.z, truck.x, truck.z)));
      }
      const target = cands.sort((left, right) => right.score - left.score)[0] || null;
      if (target) {
        state.hotOk = false;
        state.phase = 'unload';
        state.dest = [target.x, target.z];
        state.sector = target.sector;
      } else {
        state.phase = 'wait';
        state.nextPick = now + 5000;
      }
    }
  }
  if (state.phase === 'wait') {
    const spot = parkingSpot(room, truck.x, truck.z);
    state.parkAt ||= spot;
    drive(room, bot, truck, state.parkAt, now, PARK_ARRIVE_M);
    return;
  }
  state.parkAt = null;
  const destination = state.dest;
  if (state.phase === 'unload' && state.sector) {
    const sector = mil.sectors.find((sector) => sector.id === state.sector);
    const goalSector = SECTORS.find((sector) => sector.id === state.sector);
    if (sector && sector.owner !== bot.team) {
      state.phase = null;
    } else if (sector && sector.contested && !state.hotOk) {
      const other =
        MAPDATA.supplyTents.some((supplyTent) => {
          const candidateSector = mil.sectors.find(
            (positionX) => positionX.id === supplyTent.sector,
          );
          return (
            candidateSector.id !== sector.id &&
            candidateSector.owner === bot.team &&
            !candidateSector.contested &&
            candidateSector.store < MIL.sectorMax - 150
          );
        }) ||
        [...mil.fobs.values()].some((fob) => fob.team === bot.team && fob.store < MIL.fobMax - 150);
      if (other) {
        state.phase = null;
      } else {
        state.hotOk = true;
      }
    }
    if (
      state.phase &&
      sector &&
      sector.contested &&
      dist2(truck.x, truck.z, goalSector.x, goalSector.z) < 170
    ) {
      truck.botInput = { thr: 0, steer: 0, brake: true };
      if (Math.abs(truck.v) < 0.8) {
        api.leave(room, bot);
        state.fightUntil = now + 40000;
        state.goal = goalSector.id;
        state.goalAt = now + 40000;
      }
      return;
    }
  }
  if (!state.phase) {
    return;
  }
  const arrived = drive(room, bot, truck, destination, now);
  if (!arrived) {
    return;
  }
  if (state.phase === 'load') {
    if (!truck.loading) {
      const source = api.loadSource(truck);
      if (truck.cargo >= MIL.truckMax - 5 || !source || mil.points[source.id].stock < 50) {
        if (source && mil.points[source.id].stock < 50) {
          (state.skipPt ||= {})[source.id] = now + 60000;
        }
        state.phase = null;
      } else {
        api.load(room, bot, { id: truck.id, on: 1, k: 'load' });
      }
    }
  } else if (state.phase === 'unload') {
    if (!truck.loading) {
      if (truck.cargo < 5 || !api.load(room, bot, { id: truck.id, on: 1, k: 'unload' })) {
        state.phase = null;
      }
    }
  }
}

const DROP_COOLDOWN_MS = 45000;
function dropOff(room, api, vehicle, now) {
  dismountAll(room, api, vehicle);
  vehicle.botDrive = null;
  vehicle.botInput = { thr: 0, steer: 0, brake: true };
  vehicle.dropUntil = now + DROP_COOLDOWN_MS;
}

function dismountAll(room, api, vehicle, keep = () => false) {
  for (const id of [...vehicle.seats]) {
    const other = id && room.players.get(id);
    if (other && other.isBot && !keep(other)) {
      api.leave(room, other);
    }
  }
}

function pilotHeli(room, bot, vehicle, now, deltaTime, api) {
  const flight = vehicle.botFly;
  const health = heliportOf(bot.team);
  const sector = SECTORS.find((sector) => sector.id === flight.goal) || SECTORS[0];
  const definition = VEHICLES[vehicle.type];
  if (flight.phase !== 'return' && flight.phase !== 'board' && vehicle.hp < definition.hp * 0.4) {
    flight.phase = 'return';
  }
  if (flight.phase === 'board') {
    vehicle.botInput = { engine: true, coll: -1, yaw: 0, pitch: 0, roll: 0 };
    const waiting = vehicle.seats.some((sector, index) => index > 0 && !sector);
    const gunnerOk = !flight.wantGunner || vehicle.seats[VEH_GUNS[vehicle.type]?.seat];
    if ((now >= flight.departAt || !waiting) && gunnerOk) {
      flight.phase = flight.attack ? 'orbit' : 'go';
      flight.lz = flight.attack ? null : pickLZ(room, bot.team, flight.goal);
      if (!flight.attack && !flight.lz) {
        flight.phase = 'return';
      }
    } else if (now >= flight.departAt + 25000 && !gunnerOk) {
      flight.phase = 'return';
    }
    return;
  }
  if (flight.phase === 'go') {
    const input = flyTo(
      vehicle,
      { x: flight.lz[0], z: flight.lz[1], alt: 75, speed: 45, land: true },
      deltaTime,
    );
    vehicle.botInput = input;
    if (vehicle.onGround && input.dist < 25 && vehicle.rotor > 0.5) {
      flight.phase = 'unload';
      flight.unloadAt = now + 3500;
      dismountAll(room, api, vehicle, (other) => other === bot);
      for (const id of vehicle.seats) {
        const other = id && room.players.get(id);
        if (other && !other.isBot) {
          api.msg?.(other, 'Landing zone. Get out!');
        }
      }
    }
    return;
  }
  if (flight.phase === 'unload') {
    vehicle.botInput = { engine: true, coll: -1, yaw: 0, pitch: 0, roll: 0 };
    if (
      now >= flight.unloadAt &&
      !vehicle.seats.some((sector, index) => index > 0 && sector && room.players.get(sector)?.isBot)
    ) {
      flight.phase = 'return';
    }
    return;
  }
  if (flight.phase === 'orbit') {
    flight.ang = (flight.ang ?? Math.random() * Math.PI * 2) + deltaTime * 0.06;
    const orbitRadius = sector.r + 90;
    const targetX = sector.x + Math.cos(flight.ang) * orbitRadius;
    const targetZ = sector.z + Math.sin(flight.ang) * orbitRadius;
    const input = flyTo(vehicle, { x: targetX, z: targetZ, alt: 70, speed: 22 }, deltaTime);
    if (input.dist < 120) {
      input.yaw = Math.max(
        -1,
        Math.min(
          1,
          wrap(Math.atan2(-(sector.x - vehicle.x), -(sector.z - vehicle.z)) - vehicle.yaw) * 1.4,
        ),
      );
    }
    vehicle.botInput = input;
    const target = vehicle.gun;
    if (
      (target && target.n <= 0 && target.spare <= 0) ||
      now > (flight.orbitUntil ||= now + 240000)
    ) {
      flight.phase = 'return';
    }
    return;
  }
  const currentInput = flyTo(
    vehicle,
    { x: health.x, z: health.z, alt: 70, speed: 45, land: true },
    deltaTime,
  );
  vehicle.botInput = currentInput;
  if (vehicle.onGround && currentInput.dist < 30) {
    vehicle.botFly = null;
    vehicle.botInput = { engine: false, coll: -1, yaw: 0, pitch: 0, roll: 0 };
    dismountAll(room, api, vehicle);
  }
}

const STUCK_MOVE_M = 0.4;
const STUCK_TIME_MS = 1500;
const STUCK_REVERSE_MS = 1000;
const STUCK_MAX_EVENTS = 2;
const STUCK_EVENT_LIFETIME_MS = 30000;
const STUCK_ABANDON_MS = 60000;
function vehicleStuck(room, bot, vehicle, now, api) {
  const watch = (vehicle.stuckWatch ||= { x: vehicle.x, z: vehicle.z, at: now, events: [] });
  if (dist2(vehicle.x, vehicle.z, watch.x, watch.z) > STUCK_MOVE_M) {
    watch.x = vehicle.x;
    watch.z = vehicle.z;
    watch.at = now;
    return false;
  }
  if (now - watch.at < STUCK_TIME_MS) {
    return false;
  }
  watch.events = watch.events.filter((at) => now - at < STUCK_EVENT_LIFETIME_MS);
  watch.events.push(now);
  watch.at = now + STUCK_REVERSE_MS;
  if (watch.events.length > STUCK_MAX_EVENTS) {
    vehicle.stuckWatch = null;
    vehicle.botDrive = null;
    vehicle.stuckUntil = now + STUCK_ABANDON_MS;
    vehicle.botInput = { thr: 0, steer: 0, brake: true };
    dismountAll(room, api, vehicle);
    return true;
  }
  bot.bot.reverseUntil = now + STUCK_REVERSE_MS;
  bot.bot.route = null;
  return false;
}

const RIDER_WAIT_MAX_MS = 30000;
const PLAYER_WAIT_M = 25;
function seatsFree(vehicle) {
  return vehicle.seats.filter((sector, index) => index > 0 && !sector).length;
}
function ridersComing(room, vehicle) {
  let count = 0;
  for (const other of room.players.values()) {
    if (other.isBot && other.alive && !other.veh && other.bot?.targetVehicle === vehicle.id) {
      count++;
    }
  }
  return count;
}
function playerApproaching(room, vehicle, team) {
  for (const other of room.players.values()) {
    if (other.isBot || !other.alive || other.veh || other.team !== team) {
      continue;
    }
    const deltaX = vehicle.x - other.pos[0];
    const deltaZ = vehicle.z - other.pos[2];
    const distance = Math.hypot(deltaX, deltaZ);
    const facing = (-Math.sin(other.yaw) * deltaX - Math.cos(other.yaw) * deltaZ) / (distance || 1);
    if (distance < PLAYER_WAIT_M && facing > 0.7) {
      return true;
    }
  }
  return false;
}
function waitForRiders(room, bot, vehicle, now, departAt) {
  if (!seatsFree(vehicle) || Math.abs(vehicle.v) > 4) {
    return false;
  }
  if (playerApproaching(room, vehicle, bot.team)) {
    return true;
  }
  if (now > departAt + RIDER_WAIT_MAX_MS) {
    return false;
  }
  return now < departAt || ridersComing(room, vehicle) > 0;
}

function driveRole(room, bot, vehicle, now, api) {
  const bestDistance = vehicle.botDrive;
  if (waitForRiders(room, bot, vehicle, now, bestDistance.departAt)) {
    vehicle.botInput = { thr: 0, steer: 0, brake: true };
    vehicle.stuckWatch = null;
    return;
  }
  if (vehicleStuck(room, bot, vehicle, now, api)) {
    return;
  }
  const sector = SECTORS.find((sector) => sector.id === bestDistance.goal);
  const [deltaX, deltaZ] = safePoint(bot, sector.x, sector.z);
  const goalDistance = dist2(vehicle.x, vehicle.z, sector.x, sector.z);
  if (bestDistance.heavy) {
    const target = VEH_GUNS[vehicle.type];
    const passengers = vehicle.seats.some(
      (id, index) => index > 0 && id && !(target && index === target.seat),
    );
    if (passengers && goalDistance < sector.r + 140) {
      vehicle.botInput = { thr: 0, steer: 0, brake: true };
      if (Math.abs(vehicle.v) < 0.8) {
        dismountAll(
          room,
          api,
          vehicle,
          (other) => other === bot || (target && other.seat === target.seat),
        );
      }
      return;
    }
    const health = holdPoint(sector);
    bestDistance.slowT =
      Math.abs(vehicle.v) < 1.5 && !bestDistance.holding ? (bestDistance.slowT || 0) + 1 / 30 : 0;
    bestDistance.holding =
      goalDistance < sector.r * 0.45 ||
      dist2(vehicle.x, vehicle.z, health[0], health[1]) < 18 ||
      (bestDistance.holding && goalDistance < sector.r * 3) ||
      (goalDistance < sector.r * 3 && bestDistance.slowT > 6);
    if (bestDistance.holding) {
      vehicle.botInput = { thr: 0, steer: 0, brake: true };
      const sector = room.mil.sectors.find((positionX) => positionX.id === bestDistance.goal);
      if (sector.owner === bot.team && !sector.contested && sector.cap >= 1) {
        bestDistance.goal = pickGoal(room, bot);
      }
      return;
    }
    drive(room, bot, vehicle, health, now);
    return;
  }
  if (goalDistance < sector.r + 70 || bestDistance.leaving) {
    bestDistance.leaving = true;
    vehicle.botInput = { thr: 0, steer: 0, brake: true };
    if (Math.abs(vehicle.v) < 0.8) {
      dropOff(room, api, vehicle, now);
    }
    return;
  }
  drive(room, bot, vehicle, [deltaX, deltaZ], now);
}

const HOLD = new Map();
function holdPoint(sector) {
  let health = HOLD.get(sector.id);
  if (health) {
    return health;
  }
  let bestDistance = Infinity;
  for (const radius of TERRAIN.roads) {
    for (let index = 0; index < radius.pts.length; index++) {
      if (radius.riverAt?.[index]) {
        continue;
      }
      const distance = dist2(radius.pts[index][0], radius.pts[index][1], sector.x, sector.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        health = radius.pts[index];
      }
    }
  }
  health = bestDistance < sector.r * 2.5 ? health : [sector.x, sector.z];
  HOLD.set(sector.id, health);
  return health;
}

function passengerRole(room, bot, vehicle, now, api) {
  const driver = room.players.get(vehicle.driver);
  if (!driver) {
    return api.leave(room, bot);
  }
  if (driver.isBot) {
    if (!vehicle.botDrive && !vehicle.botFly && driver.role !== 'logi') {
      api.leave(room, bot);
    }
    return;
  }
  const state = bot.bot;
  const heli = VEHICLES[vehicle.type].kind === 'heli';
  const stopped = heli ? vehicle.onGround : Math.abs(vehicle.v) < 1;
  state.stopT = stopped ? (state.stopT || 0) + 1 / 30 : 0;
  const sector = SECTORS.find((sector) => sector.id === state.goal);
  const nearGoal = sector && dist2(vehicle.x, vehicle.z, sector.x, sector.z) < sector.r + 260;
  const awayFromBase = dist2(vehicle.x, vehicle.z, ownBase(bot).x, ownBase(bot).z) > 300;
  if (
    state.stopT > (heli ? 1.5 : 3) &&
    (nearGoal || awayFromBase) &&
    now - (state.rideSince || 0) > 8000
  ) {
    api.leave(room, bot);
  }
}

function medicRevive(room, bot, now, api, out) {
  if (bot.cls !== 'medic' || !(bot.inv.items.medkit > 0)) {
    return false;
  }
  let best = null;
  let bestDistance = 90;
  for (const other of room.players.values()) {
    if (!other.downed || other.team !== bot.team) {
      continue;
    }
    const distance = dist2(other.pos[0], other.pos[2], bot.pos[0], bot.pos[2]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = other;
    }
  }
  if (!best) {
    if (bot.reviving) {
      api.revive(room, bot, 0, 0, now);
    }
    return false;
  }
  if (bestDistance > 2.2) {
    walkTo(room, bot, now, best.pos[0], best.pos[2], out);
    if (bot.reviving) {
      api.revive(room, bot, 0, 0, now);
    }
  } else {
    out.crouch = true;
    out.yaw = Math.atan2(-(best.pos[0] - bot.pos[0]), -(best.pos[2] - bot.pos[2]));
    if (!bot.reviving) {
      api.revive(room, bot, best.id, 1, now);
    }
  }
  return true;
}

export function updateMilBot(room, bot, now, deltaTime, api) {
  const skill = SKILL[bot.skill] || SKILL.normal;
  bot.bot ||= {};
  if (bot.downed) {
    return;
  }
  if (room.mil.prepUntil && now < room.mil.prepUntil) {
    const ride = !bot.veh && humanRide(room, bot);
    if (ride) {
      const out = {
        fwd: 0,
        sprint: false,
        crouch: false,
        prone: false,
        walk: false,
        yaw: bot.yaw,
        pitch: 0,
      };
      boardVehicle(room, bot, now, api, ride, out);
      bot.yaw = out.yaw;
      if (!bot.veh) {
        stepMil(
          bot.ms,
          {
            fwd: out.fwd,
            right: 0,
            jump: false,
            jumpPress: false,
            walk: false,
            crouch: false,
            prone: false,
            yaw: bot.yaw,
            sprint: out.sprint,
            ads: false,
            speedMult: 1,
          },
          deltaTime,
          room.mil.world,
          { weight: bot.kg, frozen: false },
        );
        bot.pos = [bot.ms.x, bot.ms.y, bot.ms.z];
      }
    }
    return;
  }
  if (bot.bleed && now - (bot.bot.bleedAt ||= now) > 2500) {
    api.bandage(room, bot, now);
    bot.bot.bleedAt = 0;
  }
  const out = {
    fwd: 0,
    sprint: false,
    crouch: false,
    prone: false,
    walk: false,
    yaw: bot.yaw,
    pitch: 0,
    jumpPress: false,
  };
  if (bot.veh) {
    const vehicle = room.mil.vehicles.get(bot.veh);
    if (!vehicle) {
      return;
    }
    if (
      bot.seat === 0 &&
      !vehicle.loading &&
      ((bot.role === 'logi' && bot.bot.phase !== 'wait') ||
        (vehicle.botDrive && now >= vehicle.botDrive.departAt && !vehicle.botDrive.holding))
    ) {
      const watch =
        vehicle.watch && vehicle.watch.id === bot.id
          ? vehicle.watch
          : (vehicle.watch = { id: bot.id, x: vehicle.x, z: vehicle.z, t: now });
      if (dist2(vehicle.x, vehicle.z, watch.x, watch.z) > 6) {
        Object.assign(watch, { x: vehicle.x, z: vehicle.z, t: now });
      } else if (now - watch.t > 25000) {
        vehicle.watch = null;
        vehicle.botDrive = null;
        vehicle.botInput = { thr: 0, steer: 0, brake: true };
        vehicle.logiBot = null;
        if (bot.role === 'logi') {
          bot.bot.truck = null;
          bot.bot.noTruckUntil = now + 30000;
        }
        bot.bot.noCarUntil = now + 30000;
        for (const id of [...vehicle.seats]) {
          const other = id && room.players.get(id);
          if (other && other.isBot) {
            api.leave(room, other);
          }
        }
        return;
      }
    } else if (vehicle.watch?.id === bot.id) {
      vehicle.watch = null;
    }
    if (bot.role !== 'logi' && ravenVehicleExit(room, bot, vehicle, now, api)) {
      return;
    }
    const target = VEH_GUNS[vehicle.type];
    if (target && bot.seat === target.seat) {
      if (!vehicle.driver || !room.players.get(vehicle.driver)) {
        return api.leave(room, bot);
      }
      vehGunner(room, bot, vehicle, now, deltaTime, api);
      return;
    }
    if (bot.role === 'logi') {
      if (now >= (bot.nextThink || 0)) {
        bot.nextThink = now + 300;
      }
      logiRole(room, bot, now, skill, api, out);
      return;
    }
    if (bot.seat === 0 && vehicle.botDrive && vehicle.comp && vehicle.comp.engine <= 0.02) {
      dismountAll(room, api, vehicle);
      vehicle.botDrive = null;
      return;
    }
    if (bot.seat === 0 && vehicle.botFly) {
      return pilotHeli(room, bot, vehicle, now, deltaTime, api);
    }
    if (bot.seat === 0 && vehicle.botDrive) {
      return driveRole(room, bot, vehicle, now, api);
    }
    if (bot.seat === 0) {
      return api.leave(room, bot);
    }
    passengerRole(room, bot, vehicle, now, api);
    return;
  }
  const nearE = nearestEnemy(room, bot, now);
  const think = nearE < RAVEN_THINK_M;
  if (hasTarget(bot) || !medicRevive(room, bot, now, api, out)) {
    if (bot.role === 'logi') {
      logiRole(room, bot, now, skill, api, out);
    } else {
      ravenFight(room, bot, now, skill, api, out);
    }
  }
  if (bot.veh) {
    return;
  }
  const enemyBaseSpot = enemyBase(bot);
  if (dist2(bot.pos[0], bot.pos[2], enemyBaseSpot.x, enemyBaseSpot.z) < MIL.enemyBaseNoGo) {
    out.yaw = Math.atan2(bot.pos[0] - enemyBaseSpot.x, bot.pos[2] - enemyBaseSpot.z);
    out.fwd = 1;
  }
  const knocked = (bot.knockUntil || 0) > now;
  if (knocked) {
    out.fwd = 0;
  }
  const moving = out.fwd > 0;
  const fighting = hasTarget(bot);
  if (moving && !fighting && bot.bot.hasPath && now >= 0) {
    startSprint(bot, now);
  }
  const sprinting = moving && !fighting && isSprinting(bot, now) && bot.ms.st > 0.15;
  const moveYaw = out.yaw;
  const moveDir = moving ? [-Math.sin(moveYaw), -Math.cos(moveYaw)] : null;
  brainUpdate(room, bot, now, deltaTime, knocked ? { ...api, shoot: () => {} } : api, {
    think,
    moveDir,
    sprinting,
    speed: moving ? (sprinting ? 5.5 : fighting ? 2 : 3.2) : 0,
    coverFacing: bot.bot.dugIn ? bot.bot.coverFacing : null,
  });
  const release = wrap(moveYaw - bot.yaw);
  const forward = moving ? Math.cos(release) : 0;
  const right = moving ? -Math.sin(release) : 0;
  bot.aiming = fighting;
  const steps = nearE > 950 ? 1 : Math.round(deltaTime * 60);
  const stepDeltaTime = deltaTime / steps;
  const weapon = MW[bot.weapon];
  for (let index = 0; index < steps; index++) {
    stepMil(
      bot.ms,
      {
        fwd: forward,
        right,
        jump: false,
        jumpPress: out.jumpPress && index === 0,
        walk: fighting && moving,
        crouch: out.crouch,
        prone: out.prone || knocked,
        yaw: bot.yaw,
        sprint: sprinting && Math.abs(release) < 0.5,
        ads: fighting,
        speedMult: (weapon?.moveMult ?? 1) * (fighting ? 0.55 : 1),
      },
      stepDeltaTime,
      room.mil.world,
      { weight: bot.kg, frozen: !!bot.reviving || knocked },
    );
  }
  bot.pos = [bot.ms.x, bot.ms.y, bot.ms.z];
  bot.crouch = bot.ms.crouch;
  bot.prone = bot.ms.prone;
}
updateMilBot.chooseSpawn = chooseSpawn;
void CLASS_IDS;
