import { MW } from '../../shared/warfare/weapons.js';
import { seatExposed, VEHICLES } from '../../shared/warfare/config.js';
import { SURF, surfaceAt } from '../../shared/warfare/terrain.js';
import { clearLineMil } from '../../shared/warfare/world.js';

export const SENSE = {
  easy: {
    react: [1000, 2000],
    visual: 0.6,
    hearing: 0.6,
    aimErr: 0.0055,
    burst: 2,
    cover: 0.35,
    memory: 6000,
    lead: 0.35,
    ballistic: 0.45,
    sight: 380,
    turn: 2.5,
  },
  normal: {
    react: [600, 1200],
    visual: 1,
    hearing: 1,
    aimErr: 0.0028,
    burst: 3,
    cover: 0.65,
    memory: 10000,
    lead: 0.65,
    ballistic: 0.75,
    sight: 520,
    turn: 4,
  },
  hard: {
    react: [300, 700],
    visual: 1.35,
    hearing: 1.3,
    aimErr: 0.0014,
    burst: 4,
    cover: 0.9,
    memory: 15000,
    lead: 0.85,
    ballistic: 0.92,
    sight: 680,
    turn: 6,
  },
};
export const senseOf = (bot) => SENSE[bot.skill] || SENSE.normal;

const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const hypotenuse = Math.hypot;

export function weaponRange(weapon, bot) {
  if (!weapon || weapon.melee) {
    return [2, 3];
  }
  const weaponClass = weapon.class;
  const scoped = !!weapon.scope || ['acog', 'scope8', 'scope12'].includes(bot?.kit?.primary?.optic);
  if (weapon.slot === 'secondary' || weaponClass === 'pistol') {
    return [30, 50];
  }
  if (weaponClass === 'shotgun') {
    return [20, 35];
  }
  if (weaponClass === 'smg') {
    return [70, 110];
  }
  if (weaponClass === 'sniper') {
    return [500, 850];
  }
  if (weaponClass === 'mg') {
    return [300, 550];
  }
  return scoped ? [300, 500] : [200, 380];
}

export function fireStyle(weapon, distance, skill) {
  if (!weapon.auto) {
    return { burst: 1, pause: distance < 40 ? 180 : distance < 150 ? 450 : 900 };
  }
  if (distance < 25) {
    return { burst: skill.burst + 3, pause: 250 };
  }
  if (distance < 110) {
    return { burst: Math.max(2, skill.burst), pause: 350 + distance * 3 };
  }
  return { burst: 1, pause: 500 + distance * 1.2 };
}

function lightOf(room, other, now) {
  const message =
    ((((room.mil.dayT0 ?? null) !== null ? (now - room.mil.dayT0) / 60000 : 20) % 90) + 90) % 90;
  const base = message < 4 || message >= 65 ? 0.4 : message < 8 || message >= 61 ? 0.7 : 1;
  return other.ui & 32 ? Math.max(base, 1.6) : base;
}

function visRate(room, bot, other, distance, fovScale, now) {
  const base =
    distance < 50 ? 4 : distance < 150 ? 1.6 : distance < 300 ? 0.6 : distance < 500 ? 0.25 : 0.1;
  const speed = hypotenuse(other.ms?.vx || 0, other.ms?.vz || 0);
  const motion = speed > 4 ? 1.8 : speed > 1.5 ? 1.2 : 0.6;
  const posture = other.prone || other.downed ? 0.35 : other.crouch ? 0.65 : 1;
  const surface = surfaceAt(other.pos[0], other.pos[2]);
  const veg = surface === SURF.forest ? 0.55 : surface === SURF.field ? 0.8 : 1;
  const ghillie = other.kit?.ghillie && speed < 1 ? 0.5 : 1;
  const flash = other.lastShotAt && now - other.lastShotAt < 1500 && !other.lastShotQuiet ? 3 : 1;
  return (
    base *
    motion *
    posture *
    veg *
    ghillie *
    flash *
    lightOf(room, other, now) *
    fovScale *
    senseOf(bot).visual
  );
}

const eyeOf = (player) => [
  player.pos[0],
  player.pos[1] + (player.prone ? 0.32 : player.crouch ? 1.15 : 1.62),
  player.pos[2],
];

function memOf(bot, id) {
  const sense = bot.bot.sense;
  let message = sense.mem.get(id);
  if (!message) {
    sense.mem.set(id, (message = { conf: 0, x: 0, y: 0, z: 0, seen: 0, vis: false, heard: 0 }));
  }
  return message;
}

export function initSense(bot) {
  bot.bot.sense ||= {
    mem: new Map(),
    aware: 0,
    nextLook: 0,
    look: null,
    supp: 0,
    confirmedAt: 0,
    target: null,
  };
  return bot.bot.sense;
}

export function perceive(room, bot, now, deltaTime, eye = eyeOf(bot), yaw = bot.yaw, wide = false) {
  const sense = initSense(bot);
  const skill = senseOf(bot);
  const weapon = MW[bot.weapon];
  const scoped = !!weapon?.scope || ['acog', 'scope8', 'scope12'].includes(bot.kit?.primary?.optic);
  const sight = skill.sight * (scoped ? 1.4 : 1) * (wide ? 1.3 : 1);
  const seenNow = new Set();
  for (const other of room.players.values()) {
    if (!other.alive || other.team === bot.team) {
      continue;
    }
    if (other.veh) {
      const targetVehicle = room.mil.vehicles.get(other.veh);
      if (!targetVehicle || !seatExposed(targetVehicle.type, other.seat)) {
        continue;
      }
    }
    const deltaX = other.pos[0] - eye[0];
    const deltaZ = other.pos[2] - eye[2];
    const distance = hypotenuse(deltaX, deltaZ);
    if (distance > sight) {
      continue;
    }
    const angle = Math.abs(wrap(Math.atan2(-deltaX, -deltaZ) - yaw));
    const fovScale = wide ? (angle < 1.6 ? 1 : 0.4) : angle < 1.05 ? 1 : angle < 1.75 ? 0.3 : 0;
    const message = memOf(bot, other.id);
    let visible = false;
    if (fovScale > 0) {
      const chest = [
        other.pos[0],
        other.pos[1] + (other.prone || other.downed ? 0.25 : other.crouch ? 0.8 : 1.15),
        other.pos[2],
      ];
      if (
        clearLineMil(room.mil.world, eye, chest) ||
        clearLineMil(room.mil.world, eye, [
          other.pos[0],
          other.pos[1] + (other.prone ? 0.35 : other.crouch ? 1.15 : 1.6),
          other.pos[2],
        ])
      ) {
        visible = true;
      }
    }
    if (visible) {
      message.conf = Math.min(
        1.6,
        message.conf + visRate(room, bot, other, distance, fovScale, now) * deltaTime,
      );
      if (message.conf >= 1) {
        message.x = other.pos[0];
        message.y = other.pos[1];
        message.z = other.pos[2];
        message.seen = now;
        seenNow.add(other.id);
      } else if (message.conf > 0.3 && !sense.look) {
        sense.look = { x: other.pos[0], z: other.pos[2], until: now + 1500 };
      }
    }
    message.vis = visible && message.conf >= 1;
  }
  sense.vmem ||= new Map();
  let lbest = null;
  let lbestD = Infinity;
  for (const vehicle of room.mil.vehicles.values()) {
    const definition = VEHICLES[vehicle.type];
    if (
      !vehicle.alive ||
      vehicle.team === bot.team ||
      definition.heavyArmor ||
      !vehicle.seats.some(Boolean)
    ) {
      continue;
    }
    const deltaX = vehicle.x - eye[0];
    const deltaZ = vehicle.z - eye[2];
    const distance = hypotenuse(deltaX, deltaZ);
    const vehicleMemory = sense.vmem.get(vehicle.id) || { conf: 0 };
    if (distance > sight * 1.4) {
      sense.vmem.delete(vehicle.id);
      continue;
    }
    const angle = Math.abs(wrap(Math.atan2(-deltaX, -deltaZ) - yaw));
    const isAbove = vehicle.y - eye[1] > 15;
    const fovScale = wide ? 1 : angle < 1.05 ? 1 : angle < 1.75 ? 0.4 : isAbove ? 0.15 : 0;
    if (
      fovScale > 0 &&
      clearLineMil(room.mil.world, eye, [vehicle.x, vehicle.y + definition.hgt * 0.5, vehicle.z])
    ) {
      const base = distance < 150 ? 6 : distance < 400 ? 2.5 : 1;
      vehicleMemory.conf = Math.min(
        1.6,
        vehicleMemory.conf +
          base *
            fovScale *
            (definition.kind === 'heli' ? 1.6 : 1) *
            senseOf(bot).visual *
            deltaTime,
      );
      if (vehicleMemory.conf >= 1 && distance < lbestD) {
        lbestD = distance;
        lbest = vehicle;
      }
    } else {
      vehicleMemory.conf = Math.max(0, vehicleMemory.conf - deltaTime * 0.4);
    }
    sense.vmem.set(vehicle.id, vehicleMemory);
  }
  sense.light = lbest;
  if (lbest && sense.lightId !== lbest.id) {
    sense.lightId = lbest.id;
    sense.lightReactAt =
      now + senseOf(bot).react[0] + Math.random() * (senseOf(bot).react[1] - senseOf(bot).react[0]);
  }
  let best = null;
  let bestScore = -Infinity;
  for (const [id, message] of sense.mem) {
    const other = room.players.get(id);
    if (!other || !other.alive) {
      sense.mem.delete(id);
      continue;
    }
    if (!seenNow.has(id)) {
      message.vis = false;
      message.conf = Math.max(
        0,
        message.conf - deltaTime * (message.conf >= 1 ? 1000 / skill.memory : 0.25),
      );
      if (message.conf <= 0 && now - Math.max(message.seen, message.heard) > skill.memory) {
        sense.mem.delete(id);
      }
      continue;
    }
    const distance = hypotenuse(other.pos[0] - eye[0], other.pos[2] - eye[2]);
    const score =
      -distance +
      (other.lastTargetOf === bot.id ? 120 : 0) +
      (other.downed ? -400 : 0) +
      (other.veh ? -60 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = other;
    }
  }
  const recentNoise = sense.heardAt && now - sense.heardAt < 8000;
  const knows = [...sense.mem.values()].some(
    (message) => message.conf >= 1 || now - message.seen < skill.memory,
  );
  sense.aware = best || sense.light ? 3 : knows ? 2 : recentNoise || sense.look ? 1 : 0;
  if (best && sense.target !== best) {
    sense.confirmedAt = now;
    sense.reactAt = now + skill.react[0] + Math.random() * (skill.react[1] - skill.react[0]);
    shareWithSquad(room, bot, best, now);
  }
  sense.target = best;
  if (sense.look && now > sense.look.until) {
    sense.look = null;
  }
  return best;
}

function shareWithSquad(room, bot, other, now) {
  for (const origin of room.players.values()) {
    if (
      origin === bot ||
      !origin.isBot ||
      !origin.alive ||
      origin.team !== bot.team ||
      origin.squad !== bot.squad ||
      !origin.bot
    ) {
      continue;
    }
    if (hypotenuse(origin.pos[0] - bot.pos[0], origin.pos[2] - bot.pos[2]) > 400) {
      continue;
    }
    const sense = initSense(origin);
    const message = memOf(origin, other.id);
    const error = 8 + Math.random() * 12;
    const angle = Math.random() * Math.PI * 2;
    message.heard = now;
    message.x = other.pos[0] + Math.cos(angle) * error;
    message.z = other.pos[2] + Math.sin(angle) * error;
    message.y = other.pos[1];
    message.conf = Math.max(message.conf, 0.45);
    sense.heardAt = now;
    sense.heard = { x: message.x, z: message.z };
    if (!sense.look) {
      sense.look = { x: message.x, z: message.z, until: now + 4000 };
    }
  }
}

export function hearShot(room, shooter, origin, distance, quiet, now) {
  const range = quiet ? 220 : 900;
  for (const bot of room.players.values()) {
    if (!bot.isBot || !bot.alive || bot.team === shooter.team || !bot.bot) {
      continue;
    }
    const deltaX = origin[0] - bot.pos[0];
    const deltaZ = origin[2] - bot.pos[2];
    const currentDistance = hypotenuse(deltaX, deltaZ);
    const skill = senseOf(bot);
    if (currentDistance > range * skill.hearing) {
      continue;
    }
    const sense = initSense(bot);
    const angErr = (0.12 + currentDistance / 2500) * (Math.random() * 2 - 1);
    const angle = Math.atan2(deltaZ, deltaX) + angErr;
    const est = currentDistance * (0.7 + Math.random() * 0.6);
    sense.heardAt = now;
    sense.heard = { x: bot.pos[0] + Math.cos(angle) * est, z: bot.pos[2] + Math.sin(angle) * est };
    if (!sense.look || sense.aware < 3) {
      sense.look = { x: sense.heard.x, z: sense.heard.z, until: now + 3500 };
    }
    if (distance) {
      const offsetX = bot.pos[0] - origin[0];
      const offsetY = bot.pos[1] + 1.2 - origin[1];
      const offsetZ = bot.pos[2] - origin[2];
      const along = offsetX * distance[0] + offsetY * distance[1] + offsetZ * distance[2];
      if (along > 0) {
        const projectedX = offsetX - distance[0] * along;
        const projectedY = offsetY - distance[1] * along;
        const projectedZ = offsetZ - distance[2] * along;
        if (hypotenuse(projectedX, projectedY, projectedZ) < 4) {
          sense.supp = Math.min(1, sense.supp + 0.3);
          const message = memOf(bot, shooter.id);
          message.conf = Math.max(message.conf, 0.7);
          message.heard = now;
          message.x = sense.heard.x;
          message.z = sense.heard.z;
        }
      }
    }
  }
}

export function friendInLine(room, bot, eye, targetX, targetY, targetZ) {
  const deltaX = targetX - eye[0];
  const deltaY = targetY - eye[1];
  const deltaZ = targetZ - eye[2];
  const length = hypotenuse(deltaX, deltaY, deltaZ) || 1;
  for (const other of room.players.values()) {
    if (
      other === bot ||
      !other.alive ||
      other.team !== bot.team ||
      (other.veh && other.veh === bot.veh)
    ) {
      continue;
    }
    const offsetX = other.pos[0] - eye[0];
    const offsetY = other.pos[1] + 1 - eye[1];
    const offsetZ = other.pos[2] - eye[2];
    const along = (offsetX * deltaX + offsetY * deltaY + offsetZ * deltaZ) / length;
    if (along < 1 || along > length - 1) {
      continue;
    }
    const projectedX = offsetX - (deltaX / length) * along;
    const projectedY = offsetY - (deltaY / length) * along;
    const projectedZ = offsetZ - (deltaZ / length) * along;
    if (hypotenuse(projectedX, projectedY, projectedZ) < 1.3) {
      return true;
    }
  }
  return false;
}

export function findCover(room, bot, threat) {
  let best = null;
  let bestD = Infinity;
  for (let attempt = 0; attempt < 14; attempt++) {
    const angle = (attempt / 14) * Math.PI * 2;
    for (const radius of [3.5, 7, 11]) {
      const positionX = bot.pos[0] + Math.cos(angle) * radius;
      const positionZ = bot.pos[2] + Math.sin(angle) * radius;
      const positionY = bot.pos[1];
      const eye = [positionX, positionY + 1.05, positionZ];
      if (clearLineMil(room.mil.world, eye, [threat.x, (threat.y ?? positionY) + 1.3, threat.z])) {
        continue;
      }
      if (
        !clearLineMil(
          room.mil.world,
          [bot.pos[0], positionY + 1, bot.pos[2]],
          [positionX, positionY + 1, positionZ],
        )
      ) {
        continue;
      }
      const dToThreat = hypotenuse(positionX - threat.x, positionZ - threat.z);
      const score = radius + Math.max(0, 60 - dToThreat) * 0.3;
      if (score < bestD) {
        bestD = score;
        best = [positionX, positionZ];
      }
    }
    if (best && bestD < 6) {
      break;
    }
  }
  return best;
}

export { eyeOf as senseEye };
