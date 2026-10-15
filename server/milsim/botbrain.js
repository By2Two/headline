import { MW } from '../../shared/milsim/weapons.js';
import { milClass, VEHICLES, ROCKET } from '../../shared/milsim/config.js';
import { SURF, surfaceAt } from '../../shared/milsim/terrain.js';
import { clearLineMil } from '../../shared/milsim/world.js';
import { dropAt } from '../../shared/milsim/ballistics.js';
import { weaponRange, friendInLine } from './botsense.js';

export const RAVEN = {
  easy: {
    leadSway: 0.3,
    leadNoise: 0.1,
    sway: 1.5,
    acquireOffsetPerM: 0.2,
    acquireDepthPerM: 1,
    acquireBaseS: 1,
    acquirePerMS: 0.02,
    aimBaseSway: 0.01,
    aimMaxSway: 0.1,
    fireBound: 2.5,
    visibility: 1,
    reactionS: 0.5,
  },
  normal: {
    leadSway: 0.1,
    leadNoise: 0.05,
    sway: 0.5,
    acquireOffsetPerM: 0.1,
    acquireDepthPerM: 0.5,
    acquireBaseS: 0,
    acquirePerMS: 0.01,
    aimBaseSway: 0.002,
    aimMaxSway: 0.05,
    fireBound: 1,
    visibility: 2,
    reactionS: 0.15,
  },
  hard: {
    leadSway: 0.05,
    leadNoise: 0.03,
    sway: 0.25,
    acquireOffsetPerM: 0.06,
    acquireDepthPerM: 0.3,
    acquireBaseS: 0,
    acquirePerMS: 0.006,
    aimBaseSway: 0.001,
    aimMaxSway: 0.03,
    fireBound: 0.7,
    visibility: 3,
    reactionS: 0.1,
  },
};
const paramsOf = (bot) => RAVEN[bot.skill] ?? RAVEN.normal;

const TARGET_TICK_MS = 500;
const CANDIDATES_PER_TICK = 3;
const TRACK_TICK_MS = 200;
const SCAN_MIN_MS = 800;
const SCAN_MAX_MS = 3000;
const DOWNED_TARGET_PENALTY_M = 30;
const FOG_DENSITY = 1 / 650;
const FOV_MIN_DOT = 0.1;
const SQUAD_SHARE_M = 150;
const HIGHLIGHT_MS = 1500;
const STANDING_STILL_SPEED = 0.5;
const SEATED_SPOT_MULTIPLIER = 2;
const AIM_SLERP_RATE = 6;
const AIM_CONSTANT_RAD_S = (5 * Math.PI) / 180;
const FATIGUE_GAIN = 0.04;
const FATIGUE_DRAIN = 0.4;
const ALLOWED_AIM_SPREAD_M = 1;
const WEAPON_TICK_NEAR_MS = 50;
const WEAPON_TICK_FAR_MS = 500;
const WEAPON_TICK_FAR_M = 40;
const NEAR_MISS_M = 5;
const TAKING_FIRE_MS = 3000;
const SPRINT_MS = [3000, 6000];
const SPRINT_COOLDOWN_MS = [5000, 11000];
const ROCKET_MIN_M = 15;
const ROCKET_MAX_M = 300;
const LOOK_FORWARD_CHANCE = 0.8;

const rand = (lower, upper) => lower + Math.random() * (upper - lower);
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const unitRandom = () => {
  const positionZ = rand(-1, 1);
  const angle = rand(0, Math.PI * 2);
  const radius = Math.sqrt(1 - positionZ * positionZ);
  return [radius * Math.cos(angle), positionZ, radius * Math.sin(angle)];
};
const dirOf = (yaw, pitch) => [
  -Math.sin(yaw) * Math.cos(pitch),
  Math.sin(pitch),
  -Math.cos(yaw) * Math.cos(pitch),
];
const dot = (first, second) => first[0] * second[0] + first[1] * second[1] + first[2] * second[2];
const cross = (first, second) => [
  first[1] * second[2] - first[2] * second[1],
  first[2] * second[0] - first[0] * second[2],
  first[0] * second[1] - first[1] * second[0],
];
const length = (vector) => Math.hypot(vector[0], vector[1], vector[2]);
const normalize = (vector) => {
  const magnitude = length(vector) || 1;
  return [vector[0] / magnitude, vector[1] / magnitude, vector[2] / magnitude];
};

export function eyeOf(player) {
  return [
    player.pos[0],
    player.pos[1] + (player.prone ? 0.32 : player.crouch ? 1.15 : 1.62),
    player.pos[2],
  ];
}

export function brainOf(bot) {
  bot.bot.brain ||= {
    target: null,
    targetTickAt: 0,
    trackTickAt: 0,
    scanAt: 0,
    weaponTickAt: 0,
    fire: false,
    acquireOffset: [0, 0, 0],
    acquireStart: 0,
    acquireMs: 1,
    faceYaw: bot.yaw,
    facePitch: 0,
    fatigue: 0,
    phase: rand(0, Math.PI * 2),
    timeOffset: rand(0, 10),
    skipNextScan: false,
    takingFireUntil: 0,
    takingFireDir: null,
    pendingFire: [],
    sprintUntil: 0,
    sprintCooldownUntil: 0,
    lastSeen: null,
  };
  return bot.bot.brain;
}

function targetBody(room, other) {
  if (other.veh) {
    const vehicle = room.mil.vehicles.get(other.veh);
    if (vehicle) {
      const definition = VEHICLES[vehicle.type];
      const heli = definition.kind === 'heli';
      return {
        point: [vehicle.x, vehicle.y + definition.hgt * 0.5, vehicle.z],
        velocity: heli
          ? [vehicle.vx || 0, vehicle.vy || 0, vehicle.vz || 0]
          : [
              -Math.sin(vehicle.yaw) * (vehicle.v || 0),
              0,
              -Math.cos(vehicle.yaw) * (vehicle.v || 0),
            ],
        vehicle: vehicle,
        armored: !!definition.heavyArmor,
      };
    }
  }
  const height = other.prone || other.downed ? 0.25 : other.crouch ? 0.85 : 1.15;
  return {
    point: [other.pos[0], other.pos[1] + height, other.pos[2]],
    velocity: [other.ms?.vx || 0, other.ms?.vy || 0, other.ms?.vz || 0],
    vehicle: null,
    armored: false,
  };
}

const hasRocket = (bot) =>
  bot.slots[2] >= 0 && (bot.inv.loaded[bot.slots[2]]?.n > 0 || bot.inv.items.rocket > 0);
const hasAmmo = (bot, slot) =>
  slot >= 0 &&
  (bot.inv.loaded[slot]?.n > 0 ||
    bot.inv.mags.some((message) => message.cal === bot.inv.loaded[slot]?.cal && message.n > 0));

function effectiveWeapon(bot, body, distance) {
  if (body.armored) {
    return hasRocket(bot) && distance > ROCKET_MIN_M && distance < ROCKET_MAX_M ? bot.slots[2] : -1;
  }
  const primary = bot.slots[0];
  const secondary = bot.slots[1];
  const primaryWeapon = MW[primary];
  const primaryOk = hasAmmo(bot, primary) && distance < weaponRange(primaryWeapon, bot)[1];
  if (
    primaryOk &&
    !(primaryWeapon?.class === 'sniper' && distance < 18 && hasAmmo(bot, secondary))
  ) {
    return primary;
  }
  if (hasAmmo(bot, secondary) && distance < weaponRange(MW[secondary], bot)[1]) {
    return secondary;
  }
  if (body.vehicle && hasRocket(bot) && distance > ROCKET_MIN_M && distance < ROCKET_MAX_M) {
    return bot.slots[2];
  }
  return -1;
}

const isHighlighted = (other, now) =>
  other.lastShotAt && now - other.lastShotAt < HIGHLIGHT_MS && !other.lastShotQuiet;

function concealment(other) {
  const posture = other.prone || other.downed ? 0.5 : other.crouch ? 0.8 : 1;
  const surface = surfaceAt(other.pos[0], other.pos[2]);
  const vegetation = surface === SURF.forest ? 0.6 : surface === SURF.field ? 0.85 : 1;
  const still = Math.hypot(other.ms?.vx || 0, other.ms?.vz || 0) < 1;
  const ghillie = other.kit?.ghillie && still ? 0.5 : 1;
  return posture * vegetation * ghillie;
}

export function canSee(room, bot, other, now, considerFov = false) {
  const brain = brainOf(bot);
  const eye = eyeOf(bot);
  const body = targetBody(room, other);
  const delta = [body.point[0] - eye[0], body.point[1] - eye[1], body.point[2] - eye[2]];
  const distance = length(delta);
  const direction = normalize(delta);
  const facing = dirOf(brain.faceYaw, brain.facePitch);
  const alignment = dot(direction, facing);
  let chance = 1;
  if (brain.target !== other) {
    const fog = Math.exp(-Math.pow(distance * FOG_DENSITY, 2));
    chance = alignment * fog * fog;
    if (isHighlighted(other, now)) {
      chance *= 2;
    } else if (Math.hypot(body.velocity[0], body.velocity[2]) < STANDING_STILL_SPEED) {
      chance = Math.max(0, chance) ** 2;
    }
    chance *=
      paramsOf(bot).visibility * (body.vehicle ? SEATED_SPOT_MULTIPLIER : concealment(other));
  }
  if (Math.random() >= chance) {
    return false;
  }
  if (considerFov && !isHighlighted(other, now) && alignment <= FOV_MIN_DOT) {
    return false;
  }
  const spread = body.vehicle
    ? [1.2, 0.8, 1.2]
    : other.prone
      ? [0.5, 0.15, 0.5]
      : [0.35, 0.5, 0.35];
  for (let sample = 0; sample < 3; sample++) {
    const point = [
      body.point[0] + rand(-1, 1) * spread[0],
      body.point[1] + rand(-1, 1) * spread[1],
      body.point[2] + rand(-1, 1) * spread[2],
    ];
    if (clearLineMil(room.mil.world, eye, point)) {
      return true;
    }
  }
  return false;
}

function setTarget(room, bot, other, now, api) {
  const brain = brainOf(bot);
  if (brain.target === other) {
    return;
  }
  brain.target = other;
  bot.target = other;
  const body = targetBody(room, other);
  const eye = eyeOf(bot);
  const delta = [body.point[0] - eye[0], body.point[1] - eye[1], body.point[2] - eye[2]];
  const distance = length(delta);
  const player = paramsOf(bot);
  const side = unitRandom();
  const depth = rand(-1, 1) * player.acquireDepthPerM;
  brain.acquireOffset = [
    side[0] * player.acquireOffsetPerM * distance + delta[0] * depth,
    side[1] * player.acquireOffsetPerM * distance + delta[1] * depth,
    side[2] * player.acquireOffsetPerM * distance + delta[2] * depth,
  ];
  brain.acquireStart = now;
  brain.acquireMs = Math.max(1, (player.acquireBaseS + player.acquirePerMS * distance) * 1000);
  brain.sprintUntil = 0;
  const slot = effectiveWeapon(bot, body, distance);
  if (slot >= 0 && bot.weapon !== slot) {
    api.switchTo(room, bot, slot, now);
  }
}

function dropTarget(room, bot, now, api) {
  const brain = brainOf(bot);
  brain.target = null;
  bot.target = null;
  brain.fire = false;
  if (bot.weapon !== bot.slots[0] && hasAmmo(bot, bot.slots[0])) {
    api.switchTo(room, bot, bot.slots[0], now);
  }
}

export const hasTarget = (bot) => !!bot.bot?.brain?.target;
export const isTakingFire = (bot, now) => (bot.bot?.brain?.takingFireUntil ?? 0) > now;
export const takingFireDirection = (bot) => bot.bot?.brain?.takingFireDir;

function potentialTargets(room, bot) {
  const list = [];
  for (const other of room.players.values()) {
    if (!other.alive || other.team === bot.team) {
      continue;
    }
    if (other.veh) {
      const vehicle = room.mil.vehicles.get(other.veh);
      if (!vehicle || !vehicle.alive || vehicle.hp < VEHICLES[vehicle.type].hp * 0.15) {
        continue;
      }
    }
    const distance = Math.hypot(other.pos[0] - bot.pos[0], other.pos[2] - bot.pos[2]);
    list.push({
      q: other,
      score: distance + (other.downed ? DOWNED_TARGET_PENALTY_M : 0),
      distance,
    });
  }
  list.sort((left, right) => left.score - right.score);
  return list;
}

function targetTick(room, bot, now, api) {
  const brain = brainOf(bot);
  let found = null;
  let checked = 0;
  for (const { q: other, distance } of potentialTargets(room, bot)) {
    if (checked >= CANDIDATES_PER_TICK) {
      break;
    }
    if (effectiveWeapon(bot, targetBody(room, other), distance) < 0) {
      continue;
    }
    checked++;
    if (canSee(room, bot, other, now, true)) {
      found = other;
      break;
    }
    if (isHighlighted(other, now) && distance < 30 && Math.random() < 0.2) {
      lookAt(bot, [other.pos[0], other.pos[1] + 1.2, other.pos[2]]);
      brain.skipNextScan = true;
    }
  }
  if (found) {
    setTarget(room, bot, found, now, api);
    return;
  }
  if (!brain.target) {
    for (const mate of room.players.values()) {
      const shared = mate.bot?.brain?.target;
      if (
        mate === bot ||
        !mate.isBot ||
        !mate.alive ||
        mate.team !== bot.team ||
        mate.squad !== bot.squad ||
        !shared?.alive ||
        Math.hypot(mate.pos[0] - bot.pos[0], mate.pos[2] - bot.pos[2]) > SQUAD_SHARE_M
      ) {
        continue;
      }
      const distance = Math.hypot(shared.pos[0] - bot.pos[0], shared.pos[2] - bot.pos[2]);
      if (effectiveWeapon(bot, targetBody(room, shared), distance) >= 0) {
        setTarget(room, bot, shared, now, api);
        break;
      }
    }
  }
}

function trackTick(room, bot, now, api) {
  const brain = brainOf(bot);
  const other = brain.target;
  if (!other) {
    return;
  }
  if (!other.alive) {
    dropTarget(room, bot, now, api);
  } else if (canSee(room, bot, other, now)) {
    const body = targetBody(room, other);
    brain.lastSeen = { point: body.point, velocity: body.velocity, t: now };
  } else {
    dropTarget(room, bot, now, api);
  }
}

export function lookAt(bot, point) {
  const brain = brainOf(bot);
  const eye = eyeOf(bot);
  const deltaX = point[0] - eye[0];
  const deltaY = point[1] - eye[1];
  const deltaZ = point[2] - eye[2];
  brain.lookYaw = Math.atan2(-deltaX, -deltaZ);
  brain.lookPitch = Math.atan2(deltaY, Math.hypot(deltaX, deltaZ));
}

function scanTick(room, bot, now, context) {
  const brain = brainOf(bot);
  if (brain.skipNextScan || brain.target) {
    brain.skipNextScan = false;
    return;
  }
  let facing;
  if (isTakingFire(bot, now) && brain.takingFireDir) {
    facing = [...brain.takingFireDir];
  } else if (context.coverFacing) {
    const noise = unitRandom();
    facing = [context.coverFacing[0] + noise[0] * 0.1, 0, context.coverFacing[1] + noise[2] * 0.1];
  } else {
    const lookForward = context.sprinting || Math.random() < LOOK_FORWARD_CHANCE;
    const current = dirOf(brain.faceYaw, brain.facePitch);
    const noise = unitRandom();
    facing = context.sprinting
      ? [0, 0, 0]
      : [current[0] * 0.5 + noise[0], current[1] * 0.5 + noise[1], current[2] * 0.5 + noise[2]];
    if (context.moveDir && lookForward) {
      facing[0] += context.moveDir[0] * 1.5;
      facing[2] += context.moveDir[1] * 1.5;
    }
    const bias = squadFacingBias(room, bot);
    const eyeOffset = lookForward ? 0.1 : 0.4;
    facing[0] += bias[0] * eyeOffset;
    facing[2] += bias[1] * eyeOffset;
    facing = normalize(facing);
    if (context.sprinting) {
      facing[1] = 0;
    } else {
      facing[1] *= rand(0.1, 1);
      if (facing[1] < 0) {
        facing[1] *= 0.2;
      }
    }
  }
  if (length(facing) > 0.01) {
    brain.lookYaw = Math.atan2(-facing[0], -facing[2]);
    brain.lookPitch = Math.atan2(facing[1], Math.hypot(facing[0], facing[2]));
  }
}

function squadFacingBias(room, bot) {
  let positionX = 0;
  let positionZ = 0;
  let sum = 0;
  for (const mate of room.players.values()) {
    if (
      mate === bot ||
      !mate.alive ||
      mate.team !== bot.team ||
      mate.squad !== bot.squad ||
      mate.veh
    ) {
      continue;
    }
    const deltaX = bot.pos[0] - mate.pos[0];
    const deltaZ = bot.pos[2] - mate.pos[2];
    if (Math.hypot(deltaX, deltaZ) > 40) {
      continue;
    }
    positionX += deltaX;
    positionZ += deltaZ;
    sum++;
  }
  if (!sum) {
    return [0, 0];
  }
  const length = Math.hypot(positionX, positionZ) || 1;
  return [positionX / length, positionZ / length];
}

function aimDirection(bot, now) {
  const brain = brainOf(bot);
  const player = paramsOf(bot);
  const time = now / 1000 + brain.timeOffset;
  const sway = player.aimBaseSway + player.aimMaxSway * brain.fatigue;
  const forward = dirOf(brain.faceYaw, brain.facePitch);
  return normalize([
    forward[0] + Math.sin(time * 3.1) * sway,
    forward[1] + Math.cos(time * 5.3) * sway,
    forward[2] + Math.cos(time * 3.7) * sway,
  ]);
}

function aimPoint(room, bot, now) {
  const brain = brainOf(bot);
  const other = brain.target;
  const player = paramsOf(bot);
  const body = targetBody(room, other);
  const eye = eyeOf(bot);
  const progress = Math.min(1, (now - brain.acquireStart) / brain.acquireMs);
  const remaining = 1 - progress * progress;
  const point = [
    body.point[0] + brain.acquireOffset[0] * remaining,
    body.point[1] + brain.acquireOffset[1] * remaining,
    body.point[2] + brain.acquireOffset[2] * remaining,
  ];
  const distance = Math.hypot(point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]);
  const weapon = MW[bot.weapon];
  const rocket = bot.weapon === bot.slots[2];
  const speed = rocket ? ROCKET.v : milClass(weapon).v || 0;
  const time = now / 1000;
  const noise = [
    Math.sin(time * 0.2 * 7.9 + brain.phase),
    Math.sin(time * 0.2 * 8.3 + brain.phase),
    Math.sin(time * 0.2 * 8.9 + brain.phase),
  ];
  const swayNoise = [
    Math.sin(time * 0.2333 * 7.9 + brain.phase),
    Math.sin(time * 0.2333 * 8.3 + brain.phase),
    Math.sin(time * 0.2333 * 8.9 + brain.phase),
  ];
  if (speed > 0) {
    const flight =
      (distance / speed) *
      (1 + player.leadSway * (noise[0] + noise[2]) + rand(-player.leadNoise, player.leadNoise));
    const facing = dirOf(brain.faceYaw, brain.facePitch);
    const along = dot(body.velocity, facing);
    const sideways = length([
      body.velocity[0] - along * facing[0],
      body.velocity[1] - along * facing[1],
      body.velocity[2] - along * facing[2],
    ]);
    for (let lead = 0; lead < 3; lead++) {
      point[lead] += (body.velocity[lead] + noise[lead] * sideways * 0.3) * flight;
    }
    point[1] += rocket
      ? 0.5 * ROCKET.g * flight * flight
      : dropAt(speed, milClass(weapon).k, distance).drop;
  }
  for (let lead = 0; lead < 3; lead++) {
    point[lead] += swayNoise[lead] * player.sway;
  }
  return point;
}

function weaponTick(room, bot, now, api) {
  const brain = brainOf(bot);
  const other = brain.target;
  const current = bot.inv.loaded[bot.weapon];
  if (current && current.n === 0 && !bot.reloading) {
    if (bot.inv.mags.some((message) => message.cal === current.cal && message.n > 0)) {
      api.reload(room, bot, now);
    } else if (other) {
      const body = targetBody(room, other);
      const slot = effectiveWeapon(
        bot,
        body,
        Math.hypot(other.pos[0] - bot.pos[0], other.pos[2] - bot.pos[2]),
      );
      if (slot >= 0 && slot !== bot.weapon) {
        api.switchTo(room, bot, slot, now);
      } else {
        dropTarget(room, bot, now, api);
      }
    }
  }
  if (!other || !brain.target) {
    brain.fire = false;
    if (
      current &&
      !bot.reloading &&
      current.n < (current.size || 30) * 0.4 &&
      bot.inv.mags.some((message) => message.cal === current.cal && message.n > 0)
    ) {
      api.reload(room, bot, now);
    }
    return WEAPON_TICK_FAR_MS;
  }
  const weapon = MW[bot.weapon];
  const eye = eyeOf(bot);
  const point = aimPoint(room, bot, now);
  const delta = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]];
  const distance = length(delta);
  const next =
    WEAPON_TICK_NEAR_MS +
    (WEAPON_TICK_FAR_MS - WEAPON_TICK_NEAR_MS) * Math.min(1, distance / WEAPON_TICK_FAR_M);
  if (weapon && !weapon.auto && brain.fire) {
    brain.fire = false;
    return WEAPON_TICK_NEAR_MS;
  }
  const forward = aimDirection(bot, now);
  const side = normalize(cross(forward, [0, 1, 0]));
  const upVector = cross(forward, side);
  const bound = paramsOf(bot).fireBound * ALLOWED_AIM_SPREAD_M;
  const inside =
    dot(delta, forward) > 0 &&
    Math.abs(dot(delta, side)) < bound &&
    Math.abs(dot(delta, upVector)) < bound;
  brain.fire = false;
  if (inside && current?.n > 0 && !bot.reloading && canSee(room, bot, other, now)) {
    const body = targetBody(room, other);
    brain.fire = !friendInLine(room, bot, eye, body.point[0], body.point[1], body.point[2]);
  }
  return next;
}

export function noticeShot(room, shooter, origin, direction, now) {
  if (!direction) {
    return;
  }
  for (const bot of room.players.values()) {
    if (!bot.isBot || !bot.alive || bot.team === shooter.team || !bot.bot) {
      continue;
    }
    const offsetX = bot.pos[0] - origin[0];
    const offsetY = bot.pos[1] + 1 - origin[1];
    const offsetZ = bot.pos[2] - origin[2];
    const along = offsetX * direction[0] + offsetY * direction[1] + offsetZ * direction[2];
    if (along <= 0) {
      continue;
    }
    const miss = Math.hypot(
      offsetX - direction[0] * along,
      offsetY - direction[1] * along,
      offsetZ - direction[2] * along,
    );
    if (miss >= NEAR_MISS_M) {
      continue;
    }
    const weapon = MW[shooter.weapon];
    const speed = milClass(weapon).v || 800;
    const brain = brainOf(bot);
    brain.pendingFire.push({
      at: now + (along / speed) * 1000 + paramsOf(bot).reactionS * 1000,
      dir: [-direction[0], -direction[1], -direction[2]],
    });
  }
}

export function noticeDamage(bot, attacker) {
  if (!bot.bot || !attacker || attacker === bot || brainOf(bot).target) {
    return;
  }
  lookAt(bot, [
    attacker.pos[0] + rand(-6, 6),
    attacker.pos[1] + 1.2,
    attacker.pos[2] + rand(-6, 6),
  ]);
}

export function startSprint(bot, now) {
  const brain = brainOf(bot);
  if (now < brain.sprintCooldownUntil || brain.target) {
    return;
  }
  brain.sprintUntil = now + rand(...SPRINT_MS);
  brain.sprintCooldownUntil = now + rand(...SPRINT_COOLDOWN_MS);
}

export const isSprinting = (bot, now) => brainOf(bot).sprintUntil > now;

export function brainUpdate(room, bot, now, deltaTime, api, context) {
  const brain = brainOf(bot);
  if (brain.target && !brain.target.alive) {
    dropTarget(room, bot, now, api);
  }
  for (let index = brain.pendingFire.length - 1; index >= 0; index--) {
    const event = brain.pendingFire[index];
    if (now >= event.at) {
      brain.takingFireDir = event.dir;
      brain.takingFireUntil = now + TAKING_FIRE_MS;
      brain.pendingFire.splice(index, 1);
    }
  }
  if (context.think && now >= brain.targetTickAt) {
    brain.targetTickAt = now + TARGET_TICK_MS;
    targetTick(room, bot, now, api);
  }
  if (now >= brain.trackTickAt) {
    brain.trackTickAt = now + TRACK_TICK_MS;
    trackTick(room, bot, now, api);
  }
  if (now >= brain.scanAt) {
    brain.scanAt = now + rand(SCAN_MIN_MS, SCAN_MAX_MS);
    scanTick(room, bot, now, context);
  }
  if (now >= brain.weaponTickAt) {
    brain.weaponTickAt = now + weaponTick(room, bot, now, api);
  }
  let wantYaw = brain.lookYaw ?? brain.faceYaw;
  let wantPitch = brain.lookPitch ?? 0;
  if (brain.target) {
    const eye = eyeOf(bot);
    const point = aimPoint(room, bot, now);
    wantYaw = Math.atan2(-(point[0] - eye[0]), -(point[2] - eye[2]));
    wantPitch = Math.atan2(point[1] - eye[1], Math.hypot(point[0] - eye[0], point[2] - eye[2]));
  } else if (context.sprinting && context.moveDir) {
    wantYaw = Math.atan2(-context.moveDir[0], -context.moveDir[1]);
    wantPitch = 0;
  }
  const step = (current, want) => {
    const diff = wrap(want - current);
    const slerped = current + diff * Math.min(1, AIM_SLERP_RATE * deltaTime);
    const rest = wrap(want - slerped);
    return slerped + Math.sign(rest) * Math.min(Math.abs(rest), AIM_CONSTANT_RAD_S * deltaTime);
  };
  brain.faceYaw = wrap(step(brain.faceYaw, wantYaw));
  brain.facePitch = Math.max(-1.4, Math.min(1.4, step(brain.facePitch, wantPitch)));
  brain.fatigue = Math.max(
    0,
    Math.min(
      1,
      brain.fatigue + (context.speed || 0) * FATIGUE_GAIN * deltaTime - FATIGUE_DRAIN * deltaTime,
    ),
  );
  bot.yaw = brain.faceYaw;
  bot.pitch = brain.facePitch;
  if (
    brain.fire &&
    brain.target &&
    now >= bot.nextFire &&
    !bot.reloading &&
    bot.inv.loaded[bot.weapon]?.n > 0 &&
    now > bot.readyAt
  ) {
    const eye = eyeOf(bot);
    const direction = aimDirection(bot, now);
    api.shoot(room, bot, { w: bot.weapon, o: eye, d: direction, rt: now - 100 }, now);
  }
  return !!brain.target;
}
