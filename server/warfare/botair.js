import { VEH_GUNS, SHELLS } from '../../shared/warfare/config.js';
import { SECTORS, MAIN_BASES, heightAt, waterDepth, HALF } from '../../shared/warfare/terrain.js';
import { MAPDATA } from '../../shared/warfare/world.js';
import { perceive, senseOf, friendInLine, initSense } from './botsense.js';

const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const HOVER = 1 / 1.75;

function flatAt(positionX, positionZ, radius) {
  const centerHeight = heightAt(positionX, positionZ);
  let maxDifference = 0;
  for (let sampleIndex = 0; sampleIndex < 8; sampleIndex++) {
    const angle = (sampleIndex / 8) * Math.PI * 2;
    maxDifference = Math.max(
      maxDifference,
      Math.abs(
        heightAt(positionX + Math.cos(angle) * radius, positionZ + Math.sin(angle) * radius) -
          centerHeight,
      ),
    );
  }
  return maxDifference;
}
function clearAt(world, positionX, positionZ, radius) {
  const list = world.grid.query(
    positionX - radius,
    positionZ - radius,
    positionX + radius,
    positionZ + radius,
    [],
  );
  for (const bot of list) {
    if (bot.mat === 'edge') {
      continue;
    }
    if (bot.max[1] < heightAt((bot.min[0] + bot.max[0]) / 2, (bot.min[2] + bot.max[2]) / 2) + 0.6) {
      continue;
    }
    return false;
  }
  return true;
}
export function pickLZ(room, team, sectorId) {
  const sector = SECTORS.find((score) => score.id === sectorId) || SECTORS[0];
  const enemyBase = MAIN_BASES[1 - team];
  const toEnemy = Math.atan2(enemyBase.z - sector.z, enemyBase.x - sector.x);
  let best = null;
  let bestS = -Infinity;
  for (let sampleIndex = 0; sampleIndex < 28; sampleIndex++) {
    const side = sampleIndex % 2 ? 1 : -1;
    const angle =
      toEnemy +
      side * (Math.PI / 2 + (Math.random() - 0.5) * 1.2) +
      (sampleIndex > 20 ? Math.PI : 0);
    const radius = sector.r + 110 + Math.random() * 120;
    const positionX = clamp(sector.x + Math.cos(angle) * radius, -HALF + 60, HALF - 60);
    const positionZ = clamp(sector.z + Math.sin(angle) * radius, -HALF + 60, HALF - 60);
    if (waterDepth(positionX, positionZ) > 0.1) {
      continue;
    }
    const flat = flatAt(positionX, positionZ, 10);
    if (flat > 2.2 || !clearAt(room.mil.world, positionX, positionZ, 14)) {
      continue;
    }
    const enemies = [...room.players.values()].filter(
      (other) =>
        other.alive &&
        other.team !== team &&
        Math.hypot(other.pos[0] - positionX, other.pos[2] - positionZ) < 160,
    ).length;
    const score = -flat * 4 - enemies * 30 - Math.abs(radius - (sector.r + 160)) * 0.05;
    if (score > bestS) {
      bestS = score;
      best = [positionX, positionZ];
    }
  }
  return best;
}

export function flyTo(vehicle, target, deltaTime) {
  const ground = heightAt(vehicle.x, vehicle.z);
  const deltaX = target.x - vehicle.x;
  const deltaZ = target.z - vehicle.z;
  const distance = Math.hypot(deltaX, deltaZ);
  const forwardX = -Math.sin(vehicle.yaw);
  const forwardZ = -Math.cos(vehicle.yaw);
  const forward = vehicle.vx * forwardX + vehicle.vz * forwardZ;
  const lateralSpeed = vehicle.vx * -forwardZ + vehicle.vz * forwardX;
  const ahead = Math.max(
    ground,
    heightAt(vehicle.x + forwardX * 60, vehicle.z + forwardZ * 60),
    heightAt(vehicle.x + forwardX * 120, vehicle.z + forwardZ * 120),
  );
  let targetY;
  let wantSpeed;
  if (target.land && distance < 30) {
    wantSpeed = Math.min(5, distance * 0.35);
    targetY = ground + (distance < 7 && Math.hypot(vehicle.vx, vehicle.vz) < 2.5 ? -2 : 8);
  } else {
    wantSpeed = Math.min(
      target.speed ?? 42,
      Math.max(3, (distance - (target.land ? 18 : 0)) * 0.22),
    );
    targetY =
      Math.max(ground, ahead - 10) +
      (target.alt ?? 70) * (target.land ? clamp(distance / 250, 0.25, 1) : 1);
  }
  const wantColl = clamp(HOVER + (targetY - vehicle.y) * 0.035 - vehicle.vy * 0.07, 0.05, 1);
  const collective = clamp((wantColl - vehicle.coll) * 6, -1, 1);
  const wantYaw =
    distance > 25 || (target.face ?? null) === null ? Math.atan2(-deltaX, -deltaZ) : target.face;
  const yaw = clamp(wrap(wantYaw - vehicle.yaw) * 1.6, -1, 1);
  const aligned = Math.abs(wrap(Math.atan2(-deltaX, -deltaZ) - vehicle.yaw)) < 0.5 || distance < 25;
  const pitch = clamp(((aligned ? wantSpeed : 0) - forward) * 0.09, -1, 1);
  const roll = clamp(-lateralSpeed * 0.12, -0.8, 0.8);
  return { engine: true, coll: collective, yaw, pitch, roll, dist: distance };
}

export const heliportOf = (team) =>
  MAPDATA.vtents.find((vtent) => vtent.team === team && vtent.kind === 'heli');

export function vehGunner(room, bot, vehicle, now, deltaTime, api) {
  const gun = VEH_GUNS[vehicle.type];
  if (!gun) {
    return;
  }
  const skill = senseOf(bot);
  const sense = initSense(bot);
  const eye = [bot.pos[0], bot.pos[1] + 1.6, bot.pos[2]];
  const tyawW = vehicle.yaw + (vehicle.tyaw || 0);
  if (now >= (sense.nextLook || 0)) {
    sense.nextLook = now + 250;
    perceive(room, bot, now, 0.25, eye, tyawW, true);
    if (gun.kind !== 'mg' || !sense.target) {
      let vehicleTarget = null;
      let bestDistance = gun.kind === 'cannon' ? 900 : gun.kind === 'autocannon' ? 700 : 500;
      for (const currentVehicle of room.mil.vehicles.values()) {
        if (
          !currentVehicle.alive ||
          currentVehicle.team === vehicle.team ||
          !currentVehicle.driver
        ) {
          continue;
        }
        const difference = Math.hypot(currentVehicle.x - vehicle.x, currentVehicle.z - vehicle.z);
        if (
          difference < bestDistance &&
          Math.abs(
            wrap(
              Math.atan2(-(currentVehicle.x - vehicle.x), -(currentVehicle.z - vehicle.z)) - tyawW,
            ),
          ) < 1.4
        ) {
          bestDistance = difference;
          vehicleTarget = currentVehicle;
        }
      }
      sense.vtarget = vehicleTarget;
    } else {
      sense.vtarget = null;
    }
  }
  const other = sense.target;
  const currentVehicleTarget = sense.vtarget;
  let targetX;
  let targetY;
  let targetZ;
  let targetVelocityX = 0;
  let targetVelocityZ = 0;
  if (currentVehicleTarget && (gun.kind !== 'mg' || !other)) {
    targetX = currentVehicleTarget.x;
    targetY = currentVehicleTarget.y + 1.2;
    targetZ = currentVehicleTarget.z;
    targetVelocityX =
      currentVehicleTarget.vx ||
      -Math.sin(currentVehicleTarget.yaw) * (currentVehicleTarget.v || 0);
    targetVelocityZ =
      currentVehicleTarget.vz ||
      -Math.cos(currentVehicleTarget.yaw) * (currentVehicleTarget.v || 0);
  } else if (other) {
    targetX = other.pos[0];
    targetY = other.pos[1] + (other.prone ? 0.3 : other.crouch ? 0.9 : 1.2);
    targetZ = other.pos[2];
    targetVelocityX = other.ms?.vx || 0;
    targetVelocityZ = other.ms?.vz || 0;
  } else {
    const look = sense.look || sense.heard;
    const want = look
      ? wrap(Math.atan2(-(look.x - vehicle.x), -(look.z - vehicle.z)) - vehicle.yaw)
      : 0;
    vehicle.tyaw = turnTo(vehicle.tyaw || 0, want, gun.turn * 0.5 * deltaTime, gun.yawLimit);
    vehicle.tp = (vehicle.tp || 0) + (0 - (vehicle.tp || 0)) * Math.min(1, deltaTime);
    return;
  }
  const deltaX = targetX - eye[0];
  const deltaZ = targetZ - eye[2];
  const distance = Math.hypot(deltaX, deltaZ);
  const shell = gun.kind === 'mg' ? null : SHELLS[gun.kind];
  const speed = shell ? shell.v : 850;
  const timeOfFlight = distance / speed;
  const lead = skill.lead * (0.8 + Math.random() * 0.4);
  const aimX = targetX + targetVelocityX * timeOfFlight * lead;
  const aimZ = targetZ + targetVelocityZ * timeOfFlight * lead;
  const drop = shell
    ? 0.5 * shell.g * timeOfFlight * timeOfFlight * (skill.ballistic + (Math.random() - 0.5) * 0.3)
    : 0;
  const wantYaw = wrap(Math.atan2(-(aimX - eye[0]), -(aimZ - eye[2])) - vehicle.yaw);
  const wantP =
    Math.atan2(targetY + drop - eye[1], Math.hypot(aimX - eye[0], aimZ - eye[2])) -
    (vehicle.pitch || 0);
  vehicle.tyaw = turnTo(vehicle.tyaw || 0, wantYaw, gun.turn * deltaTime, gun.yawLimit);
  vehicle.tp = clamp(
    (vehicle.tp || 0) +
      clamp(wantP - (vehicle.tp || 0), -gun.turn * 0.6 * deltaTime, gun.turn * 0.6 * deltaTime),
    gun.pitch[0],
    gun.pitch[1],
  );
  const aligned =
    Math.abs(wrap(wantYaw - vehicle.tyaw)) < 0.02 + 1.5 / Math.max(distance, 20) &&
    Math.abs(wantP - vehicle.tp) < 0.04;
  if (
    !aligned ||
    now < (sense.reactAt || 0) ||
    !vehicle.gun ||
    vehicle.gun.n <= 0 ||
    now < (bot.nextVFire || 0)
  ) {
    return;
  }
  if (friendInLine(room, bot, eye, targetX, targetY, targetZ)) {
    return;
  }
  const error = skill.aimErr * (1 + distance / 300) * (1 + sense.supp);
  const worldYaw = vehicle.yaw + vehicle.tyaw + (Math.random() - 0.5) * 2 * error;
  const worldPitch = (vehicle.pitch || 0) + vehicle.tp + (Math.random() - 0.5) * 2 * error;
  const currentDifference = [
    -Math.sin(worldYaw) * Math.cos(worldPitch),
    Math.sin(worldPitch),
    -Math.cos(worldYaw) * Math.cos(worldPitch),
  ];
  api.shoot(
    room,
    bot,
    {
      w: api.W.mg,
      o: [bot.pos[0], bot.pos[1] + 1.15, bot.pos[2]],
      d: currentDifference,
      rt: now - 100,
    },
    now,
  );
  sense.burstN = (sense.burstN || 0) + 1;
  const burst = gun.kind === 'mg' ? (distance < 150 ? 8 : 4) : 1;
  if (sense.burstN >= burst) {
    sense.burstN = 0;
    bot.nextVFire = now + (gun.kind === 'mg' ? 500 + distance * 1.5 : 400 + Math.random() * 600);
  } else {
    bot.nextVFire = now + gun.interval * 1000;
  }
}
function turnTo(current, want, step, limit) {
  let difference = wrap(want - current);
  difference = clamp(difference, -step, step);
  let next = wrap(current + difference);
  if (limit) {
    next = clamp(next, -limit, limit);
  }
  return next;
}
