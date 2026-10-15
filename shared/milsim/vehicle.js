import { VEHICLES, SEATS, GEARS } from './config.js';
import { heightAt, surfaceAt, SURF, waterAt, normalAt, HALF } from './terrain.js';

const GRAVITY = 9.81;
const near = [];

export function createVehicle(id, type, team, positionX, positionZ, yaw) {
  const definition = VEHICLES[type];
  const positionY = heightAt(positionX, positionZ) + (definition.kind === 'heli' ? 0 : 0.0);
  return {
    id,
    type,
    team,
    x: positionX,
    y: positionY,
    z: positionZ,
    yaw,
    pitch: 0,
    roll: 0,
    v: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    steer: 0,
    yawRate: 0,
    rotor: 0,
    coll: 0,
    onGround: true,
    hp: definition.hp,
    alive: true,
    cargo: 0,
    seats: new Array(SEATS[type].length).fill(0),
    comp: { engine: 1, wheels: 1, rotor: 1, tail: 1 },
    flipped: 0,
  };
}

export function vehicleAABB(vehicle, out = { min: [0, 0, 0], max: [0, 0, 0], mat: 'vehicle' }) {
  const definition = VEHICLES[vehicle.type];
  const cosine = Math.abs(Math.cos(vehicle.yaw));
  const sine = Math.abs(Math.sin(vehicle.yaw));
  const halfX = (definition.wid / 2) * cosine + (definition.len / 2) * sine;
  const halfZ = (definition.wid / 2) * sine + (definition.len / 2) * cosine;
  const index = definition.kind === 'heli' ? 0.55 : 0.9;
  out.min[0] = vehicle.x - halfX * index;
  out.max[0] = vehicle.x + halfX * index;
  out.min[2] = vehicle.z - halfZ * index;
  out.max[2] = vehicle.z + halfZ * index;
  out.min[1] = vehicle.y + (definition.kind === 'heli' ? 0.3 : 0.5);
  out.max[1] = vehicle.y + definition.hgt;
  out.vid = vehicle.id;
  return out;
}

export function vehicleParts(vehicle) {
  const definition = VEHICLES[vehicle.type];
  const heli = definition.kind === 'heli';
  const length = heli ? definition.len * 0.45 : definition.len;
  const width = definition.wid * 0.92;
  const sampleCount = Math.max(2, Math.round(length / width) + 1);
  const forwardX = -Math.sin(vehicle.yaw);
  const forwardZ = -Math.cos(vehicle.yaw);
  const out = [];
  for (let index = 0; index < sampleCount; index++) {
    const off = (index / (sampleCount - 1) - 0.5) * (length - width) + (heli ? -1.2 : 0);
    const centerX = vehicle.x + forwardX * off;
    const centerZ = vehicle.z + forwardZ * off;
    out.push({
      min: [centerX - width / 2, vehicle.y + (heli ? 0.3 : 0.45), centerZ - width / 2],
      max: [centerX + width / 2, vehicle.y + definition.hgt, centerZ + width / 2],
      mat: 'vehicle',
      vid: vehicle.id,
    });
  }
  return out;
}

export function vehicleToWorld(vehicle, localX, localY, localZ) {
  const cosYaw = Math.cos(vehicle.yaw);
  const sinYaw = Math.sin(vehicle.yaw);
  const cosPitch = Math.cos(vehicle.pitch);
  const sinPitch = Math.sin(vehicle.pitch);
  const cosRoll = Math.cos(vehicle.roll);
  const sinRoll = Math.sin(vehicle.roll);
  const positionX = localX * cosRoll - localY * sinRoll;
  let positionY = localX * sinRoll + localY * cosRoll;
  let positionZ = localZ;
  const pitchedY = positionY * cosPitch - positionZ * sinPitch;
  const pitchedZ = positionY * sinPitch + positionZ * cosPitch;
  positionY = pitchedY;
  positionZ = pitchedZ;
  const yawedX = positionX * cosYaw + positionZ * sinYaw;
  const yawedZ = -positionX * sinYaw + positionZ * cosYaw;
  return [vehicle.x + yawedX, vehicle.y + positionY, vehicle.z + yawedZ];
}
export const seatWorld = (vehicle, index) => {
  const seat = SEATS[vehicle.type][index] || SEATS[vehicle.type][0];
  return vehicleToWorld(vehicle, seat[0], seat[1], seat[2]);
};

export function rayVehicle(vehicle, other, direction, maxT) {
  const definition = VEHICLES[vehicle.type];
  const cosYaw = Math.cos(-vehicle.yaw);
  const sinYaw = Math.sin(-vehicle.yaw);
  const rotationX = other[0] - vehicle.x;
  const rotationZ = other[2] - vehicle.z;
  const localOrigin = [
    rotationX * cosYaw + rotationZ * sinYaw,
    other[1] - vehicle.y,
    -rotationX * sinYaw + rotationZ * cosYaw,
  ];
  const localDirection = [
    direction[0] * cosYaw + direction[2] * sinYaw,
    direction[1],
    -direction[0] * sinYaw + direction[2] * cosYaw,
  ];
  const heli = definition.kind === 'heli';
  const halfWidth = definition.wid / 2;
  const halfLength = heli ? definition.len * 0.32 : definition.len / 2;
  const min = [-halfWidth, heli ? 0.3 : 0.45, -halfLength];
  const max = [halfWidth, definition.hgt, heli ? halfLength * 0.9 : halfLength];
  let nearT = 0;
  let farT = maxT;
  for (let index = 0; index < 3; index++) {
    if (Math.abs(localDirection[index]) < 1e-9) {
      if (localOrigin[index] < min[index] || localOrigin[index] > max[index]) {
        return null;
      }
      continue;
    }
    let nearEdge = (min[index] - localOrigin[index]) / localDirection[index];
    let farEdge = (max[index] - localOrigin[index]) / localDirection[index];
    if (nearEdge > farEdge) {
      [nearEdge, farEdge] = [farEdge, nearEdge];
    }
    nearT = Math.max(nearT, nearEdge);
    farT = Math.min(farT, farEdge);
    if (nearT > farT) {
      return null;
    }
  }
  return nearT;
}

export function groundFor(world, positionX, positionZ, positionY) {
  let ground = heightAt(positionX, positionZ);
  if (!world) {
    return ground;
  }
  world.grid.query(positionX - 0.5, positionZ - 0.5, positionX + 0.5, positionZ + 0.5, near);
  for (const farEdge of near) {
    if (!farEdge.floor) {
      continue;
    }
    if (
      positionX > farEdge.min[0] &&
      positionX < farEdge.max[0] &&
      positionZ > farEdge.min[2] &&
      positionZ < farEdge.max[2] &&
      farEdge.max[1] <= positionY + 1.2 &&
      farEdge.max[1] > ground
    ) {
      ground = farEdge.max[1];
    }
  }
  return ground;
}

const SURF_GRIP = {
  [SURF.asphalt]: 1,
  [SURF.concrete]: 1,
  [SURF.dirt]: 0.9,
  [SURF.grass]: 0.72,
  [SURF.field]: 0.62,
  [SURF.sand]: 0.6,
  [SURF.forest]: 0.5,
  [SURF.rock]: 0.55,
  [SURF.water]: 0.25,
};

function collideCar(vehicle, definition, world, others) {
  const sampleCount = Math.max(2, Math.round(definition.len / definition.wid) + 1);
  const radius = definition.wid * 0.5;
  const forwardX = -Math.sin(vehicle.yaw);
  const forwardZ = -Math.cos(vehicle.yaw);
  let hit = 0;
  for (let index = 0; index < sampleCount; index++) {
    const off = (index / (sampleCount - 1) - 0.5) * (definition.len - definition.wid);
    const centerX = vehicle.x + forwardX * off;
    const centerZ = vehicle.z + forwardZ * off;
    world.grid.query(centerX - radius, centerZ - radius, centerX + radius, centerZ + radius, near);
    for (const nearBox of near) {
      if (
        nearBox.soft ||
        (nearBox.floor && !nearBox.stair) ||
        nearBox.max[1] < vehicle.y + 0.6 ||
        nearBox.min[1] > vehicle.y + definition.hgt
      ) {
        continue;
      }
      if (nearBox.tree && definition.tracks) {
        continue;
      }
      if (
        nearBox.mat === 'edge' ||
        nearBox.tree ||
        nearBox.max[1] - Math.max(nearBox.min[1], vehicle.y) > 0.2
      ) {
        const closestX = Math.max(nearBox.min[0], Math.min(centerX, nearBox.max[0]));
        const closestZ = Math.max(nearBox.min[2], Math.min(centerZ, nearBox.max[2]));
        const deltaX = centerX - closestX;
        const deltaZ = centerZ - closestZ;
        const direction = Math.hypot(deltaX, deltaZ);
        if (direction < radius) {
          const normalX = direction > 1e-4 ? deltaX / direction : -forwardX * Math.sign(off || 1);
          const normalZ = direction > 1e-4 ? deltaZ / direction : -forwardZ * Math.sign(off || 1);
          const push = radius - direction + 0.01;
          vehicle.x += normalX * push;
          vehicle.z += normalZ * push;
          hit = Math.max(hit, Math.abs(vehicle.v));
          if ((nearBox.sid ?? null) !== null) {
            (vehicle.rammed ||= []).push(nearBox.sid);
          }
        }
      }
    }
    for (const other of others || []) {
      if (other === vehicle || !other.alive) {
        continue;
      }
      const otherDefinition = VEHICLES[other.type];
      const deltaX = centerX - other.x;
      const deltaZ = centerZ - other.z;
      const direction = Math.hypot(deltaX, deltaZ);
      const combinedRadius = radius + otherDefinition.wid * 0.6;
      if (direction < combinedRadius && direction > 1e-3 && Math.abs(other.y - vehicle.y) < 3) {
        vehicle.x += (deltaX / direction) * (combinedRadius - direction) * 0.5;
        vehicle.z += (deltaZ / direction) * (combinedRadius - direction) * 0.5;
        hit = Math.max(hit, Math.abs(vehicle.v));
      }
    }
  }
  if (hit > 0.5) {
    vehicle.v *= -0.15;
  }
  return hit;
}

const STEER_RATE = 5;
const moveTowards = (from, target, step) =>
  Math.abs(target - from) <= step ? target : from + Math.sign(target - from) * step;
const torqueCurve = (speed, top) => Math.max(0, 1 - (Math.max(0, speed) / top) ** 2);

export function stepCar(vehicle, input, deltaTime, world, others) {
  const definition = VEHICLES[vehicle.type];
  const forwardX = -Math.sin(vehicle.yaw);
  const forwardZ = -Math.cos(vehicle.yaw);
  const waterDepth = waterAt(vehicle.x, vehicle.y, vehicle.z);
  let surf = surfaceAt(vehicle.x, vehicle.z);
  if (surf === SURF.water && waterDepth === 0 && vehicle.y > heightAt(vehicle.x, vehicle.z) + 0.5) {
    surf = SURF.asphalt;
  }
  let grip = SURF_GRIP[surf] ?? 0.7;
  if (surf !== SURF.asphalt && surf !== SURF.concrete && surf !== SURF.dirt) {
    grip = Math.max(grip, definition.offroad * (grip / 0.72));
  }
  const drowned = waterDepth > 1.1 && definition.kind === 'car';
  const eng = vehicle.comp ? vehicle.comp.engine : 1;
  const wheels = vehicle.comp ? vehicle.comp.wheels : 1;
  if (wheels < 1) {
    grip *= 0.7 + 0.3 * wheels;
  }
  const maxSpeed =
    definition.vmax *
    Math.min(1, grip + 0.08) *
    (drowned ? 0.12 : 1) *
    (eng < 0.5 ? 0.7 : 1) *
    (definition.tracks ? (wheels > 0 ? 1 : 0) : 0.4 + 0.6 * wheels);
  if (vehicle.flipped) {
    input = { thr: 0, steer: 0, brake: true };
  }
  const throttleInput = eng > 0 ? input.thr || 0 : 0;
  const power = (input.boost ? 1 : 0.7) * (eng < 0.5 ? 0.55 : 1);
  let acceleration = 0;
  if ((input.gear ?? null) !== null) {
    const gear = GEARS[input.gear] || GEARS[1];
    const direction = input.gear < 0 ? -1 : 1;
    const gearSpeed = maxSpeed * gear.v;
    const along = vehicle.v * direction;
    if (throttleInput > 0) {
      if (along < -0.3) {
        acceleration = direction * definition.brake;
      } else {
        acceleration =
          direction *
          definition.accel *
          gear.a *
          power *
          torqueCurve(along, gearSpeed) *
          (along < 4 ? 1.5 : 1);
      }
    } else if (throttleInput < 0) {
      acceleration = -Math.sign(vehicle.v) * definition.brake;
    }
    if (along > gearSpeed + 0.5) {
      acceleration -= direction * 1.6;
    }
  } else {
    if (throttleInput > 0) {
      acceleration =
        vehicle.v < -0.3
          ? definition.brake
          : definition.accel *
            torqueCurve(vehicle.v, maxSpeed) *
            throttleInput *
            power *
            (vehicle.v < 4 ? 1.5 : 1);
    } else if (throttleInput < 0) {
      acceleration =
        vehicle.v > 0.3
          ? -definition.brake
          : -definition.accel *
            0.5 *
            Math.max(0, 1 + vehicle.v / (maxSpeed * 0.35)) *
            -throttleInput;
    }
  }
  if (input.brake) {
    acceleration = -Math.sign(vehicle.v) * definition.brake * 1.2;
  }
  acceleration -=
    GRAVITY *
    Math.sin(vehicle.pitch) *
    (definition.tracks ? 0.3 : definition.heavyArmor ? 0.4 : 0.6);
  acceleration -=
    vehicle.v * (0.04 + (1 - grip) * (definition.tracks ? 0.15 : 0.35)) +
    Math.sign(vehicle.v) * vehicle.v * vehicle.v * 0.0016;
  vehicle.v += acceleration * deltaTime;
  if (
    !throttleInput &&
    !input.brake &&
    Math.abs(vehicle.v) < 0.25 &&
    Math.abs(vehicle.pitch) < 0.12
  ) {
    vehicle.v = 0;
  }
  if (definition.tracks) {
    vehicle.steer = moveTowards(vehicle.steer, input.steer || 0, STEER_RATE * deltaTime);
    const turn =
      vehicle.steer *
      definition.pivot *
      (1 - Math.min(0.5, (Math.abs(vehicle.v) / definition.vmax) * 0.5)) *
      (wheels > 0 ? 1 : 0.5);
    if (vehicle.onGround) {
      vehicle.yaw -= turn * deltaTime * (vehicle.v < -0.3 ? -1 : 1);
    }
    if (Math.abs(vehicle.steer) > 0.1) {
      vehicle.v *= 1 - 0.25 * Math.abs(vehicle.steer) * deltaTime;
    }
    if (wheels <= 0) {
      vehicle.v *= Math.exp(-deltaTime * 4);
    }
  } else {
    const steerMax = definition.steer * (1 - Math.min(0.65, Math.abs(vehicle.v) / 40));
    vehicle.steer = moveTowards(
      vehicle.steer,
      (input.steer || 0) * steerMax,
      STEER_RATE * definition.steer * deltaTime,
    );
    if (vehicle.onGround) {
      vehicle.yaw -=
        (vehicle.v / definition.wheelbase) *
        Math.tan(vehicle.steer) *
        deltaTime *
        Math.min(1, grip + 0.3);
    }
    if (wheels < 0.6 && vehicle.onGround) {
      vehicle.yaw -= (0.6 - wheels) * 0.08 * (vehicle.v / definition.wheelbase) * deltaTime;
    }
  }
  vehicle.x += forwardX * vehicle.v * deltaTime;
  vehicle.z += forwardZ * vehicle.v * deltaTime;
  vehicle.x = Math.max(-HALF + 8, Math.min(HALF - 8, vehicle.x));
  vehicle.z = Math.max(-HALF + 8, Math.min(HALF - 8, vehicle.z));
  const impact = world ? collideCar(vehicle, definition, world, others) : 0;
  const halfLength = definition.wheelbase / 2;
  const halfWidth = definition.wid * 0.42;
  const rotationX = Math.cos(vehicle.yaw);
  const rotationZ = -Math.sin(vehicle.yaw);
  const currentForwardX = -Math.sin(vehicle.yaw);
  const currentForwardZ = -Math.cos(vehicle.yaw);
  const groundAt = (offsetX, offsetZ) =>
    groundFor(
      world,
      vehicle.x + rotationX * offsetX + currentForwardX * offsetZ,
      vehicle.z + rotationZ * offsetX + currentForwardZ * offsetZ,
      vehicle.y,
    );
  const frontLeft = groundAt(-halfWidth, halfLength);
  const frontRight = groundAt(halfWidth, halfLength);
  const backLeft = groundAt(-halfWidth, -halfLength);
  const backRight = groundAt(halfWidth, -halfLength);
  const target = (frontLeft + frontRight + backLeft + backRight) / 4;
  const pitchTarget = Math.atan2(
    (frontLeft + frontRight) / 2 - (backLeft + backRight) / 2,
    definition.wheelbase,
  );
  const rollTarget = Math.atan2(
    (frontRight + backRight) / 2 - (frontLeft + backLeft) / 2,
    definition.wid * 0.84,
  );
  let land = 0;
  if (vehicle.y > target + 0.25) {
    vehicle.onGround = false;
    vehicle.vy -= GRAVITY * deltaTime;
    vehicle.y += vehicle.vy * deltaTime;
    if (vehicle.y <= target) {
      land = Math.max(0, -vehicle.vy - 6);
      vehicle.y = target;
      vehicle.vy = 0;
      vehicle.onGround = true;
    }
  } else {
    if (!vehicle.onGround) {
      land = Math.max(0, -vehicle.vy - 6);
    }
    vehicle.onGround = true;
    vehicle.vy = ((target - vehicle.y) / deltaTime) * 0.5;
    vehicle.y += (target - vehicle.y) * Math.min(1, deltaTime * 14);
    if (vehicle.y < target - 0.05) {
      vehicle.y = target - 0.05;
    }
  }
  vehicle.pitch += (pitchTarget - vehicle.pitch) * Math.min(1, deltaTime * 8);
  vehicle.roll +=
    ((vehicle.flipped ? vehicle.flipped * 1.45 : rollTarget) - vehicle.roll) *
    Math.min(1, deltaTime * (vehicle.flipped ? 4 : 8));
  if (grip < 0.8 && Math.abs(vehicle.v) > 4) {
    vehicle.pitch +=
      Math.sin(performance.now() * 0.02 + vehicle.id) *
      0.004 *
      (1 - grip) *
      Math.min(1, Math.abs(vehicle.v) / 15);
  }
  return Math.max(impact > 7 ? impact : 0, land * 2);
}

const HELI_MAX_RATE = 1.5;
const HELI_ANGULAR_ACCEL = 3.2;
const HELI_ATTITUDE_GAIN = 3;
const HELI_ANGULAR_DRAG = 0.2;
const HELI_ANGULAR_DRAG_PER_MS = 0.01;
const HELI_MAX_TILT = 1.25;
const HELI_COUNTER_FORCE = 0.3;
const HELI_FORWARD_LIFT = 0.03;
const HELI_DRAG_ALONG = 0.1;
const HELI_DRAG_SIDE = 0.28;
const HELI_DRAG_SIDE_PER_MS = 0.02;
const HELI_DRAG_VERTICAL = 0.3;
const HELI_BURN_LIFT = 0.3;
const HELI_BURN_AUTHORITY = 0.2;
const HELI_BURN_TUMBLE = 1.0;
const HELI_BURN_SPIN = 1.25;
const HELI_BURN_SPIN_MAX = 3.2;

export function stepHeli(vehicle, input, deltaTime, world) {
  const components = vehicle.comp || { engine: 1, rotor: 1, tail: 1 };
  if (components.engine <= 0) {
    input = { ...input, engine: false };
  }
  vehicle.rotor = Math.max(
    0,
    Math.min(1, vehicle.rotor + (input.engine ? deltaTime / 6 : -deltaTime / 10)),
  );
  vehicle.coll = Math.max(0, Math.min(1, vehicle.coll + (input.coll || 0) * deltaTime * 0.55));
  if (!input.engine) {
    vehicle.coll = Math.max(0, vehicle.coll - deltaTime * 0.3);
  }
  const burning = !!vehicle.burning;
  const tPitch = -(input.pitch || 0) * 0.42;
  const tRoll = -(input.roll || 0) * 0.5;
  const ground = groundFor(world, vehicle.x, vehicle.z, vehicle.y);
  const onGround = vehicle.y <= ground + 0.05;
  const forwardX = -Math.sin(vehicle.yaw);
  const forwardZ = -Math.cos(vehicle.yaw);
  const forwardSpeed = vehicle.vx * forwardX + vehicle.vz * forwardZ;
  const sideSpeed = -vehicle.vx * forwardZ + vehicle.vz * forwardX;
  vehicle.pitchRate ||= 0;
  vehicle.rollRate ||= 0;
  if (onGround && vehicle.rotor < 0.5) {
    const index = Math.min(1, deltaTime * 6);
    vehicle.pitch -= vehicle.pitch * index;
    vehicle.roll -= vehicle.roll * index;
    vehicle.pitchRate = 0;
    vehicle.rollRate = 0;
  } else {
    const authority = vehicle.rotor * (burning ? HELI_BURN_AUTHORITY : 1);
    const angularDrag = HELI_ANGULAR_DRAG + Math.max(0, forwardSpeed) * HELI_ANGULAR_DRAG_PER_MS;
    const steerRate = (target, current, rate) => {
      const wanted =
        Math.max(-HELI_MAX_RATE, Math.min(HELI_MAX_RATE, (target - current) * HELI_ATTITUDE_GAIN)) *
        authority;
      const step = HELI_ANGULAR_ACCEL * deltaTime * (burning ? HELI_BURN_AUTHORITY : 1);
      return (
        (rate + Math.max(-step, Math.min(step, wanted - rate))) * Math.exp(-angularDrag * deltaTime)
      );
    };
    vehicle.pitchRate = steerRate(onGround ? 0 : tPitch, vehicle.pitch, vehicle.pitchRate);
    vehicle.rollRate = steerRate(onGround ? 0 : tRoll, vehicle.roll, vehicle.rollRate);
    if (burning) {
      const seed = vehicle.burnSeed || 1;
      vehicle.pitchRate += Math.sin(seed * 7.3) * HELI_BURN_TUMBLE * deltaTime;
      vehicle.rollRate += Math.cos(seed * 4.1) * HELI_BURN_TUMBLE * deltaTime;
    }
    vehicle.pitch = Math.max(
      -HELI_MAX_TILT,
      Math.min(HELI_MAX_TILT, vehicle.pitch + vehicle.pitchRate * deltaTime),
    );
    vehicle.roll = Math.max(
      -HELI_MAX_TILT,
      Math.min(HELI_MAX_TILT, vehicle.roll + vehicle.rollRate * deltaTime),
    );
  }
  if (!onGround || vehicle.rotor > 0.5) {
    vehicle.yawRate +=
      ((input.yaw || 0) * vehicle.rotor - vehicle.yawRate) * Math.min(1, deltaTime * 3);
  } else {
    vehicle.yawRate = 0;
  }
  if (components.tail < 0.5 && !onGround) {
    vehicle.yawRate += (0.5 - components.tail) * 2.4 * vehicle.rotor * deltaTime;
  }
  if (burning && !onGround) {
    vehicle.yawRate = Math.min(HELI_BURN_SPIN_MAX, vehicle.yawRate + HELI_BURN_SPIN * deltaTime);
  }
  vehicle.yaw += vehicle.yawRate * deltaTime;
  let lift =
    vehicle.coll *
    vehicle.rotor *
    GRAVITY *
    1.75 *
    (components.rotor <= 0 ? 0 : components.rotor < 0.5 ? 0.72 : 1) *
    (components.engine < 0.5 ? 0.85 : 1) *
    (burning ? HELI_BURN_LIFT : 1);
  const upVector = vehicleToWorld(
    { x: 0, y: 0, z: 0, yaw: vehicle.yaw, pitch: vehicle.pitch, roll: vehicle.roll },
    0,
    1,
    0,
  );
  const speed = Math.hypot(vehicle.vx, vehicle.vy, vehicle.vz);
  if (speed > 0.5) {
    const against = Math.max(
      0,
      -(upVector[0] * vehicle.vx + upVector[1] * vehicle.vy + upVector[2] * vehicle.vz) / speed,
    );
    lift *= 1 + HELI_COUNTER_FORCE * against;
  }
  lift += Math.max(0, forwardSpeed) * HELI_FORWARD_LIFT * vehicle.rotor;
  let accelerationX = upVector[0] * lift;
  let accelerationY = upVector[1] * lift - GRAVITY;
  let accelerationZ = upVector[2] * lift;
  const alongDrag = forwardSpeed * HELI_DRAG_ALONG + forwardSpeed * Math.abs(forwardSpeed) * 0.003;
  const sideDrag = sideSpeed * (HELI_DRAG_SIDE + Math.abs(sideSpeed) * HELI_DRAG_SIDE_PER_MS);
  accelerationX -= forwardX * alongDrag - forwardZ * sideDrag;
  accelerationZ -= forwardZ * alongDrag + forwardX * sideDrag;
  accelerationY -= vehicle.vy * HELI_DRAG_VERTICAL;
  const heightAboveGround = vehicle.y - ground;
  if (heightAboveGround < 6 && vehicle.rotor > 0.5) {
    accelerationY += (1 - heightAboveGround / 6) * 2.2 * vehicle.coll;
  }
  vehicle.vx += accelerationX * deltaTime;
  vehicle.vy += accelerationY * deltaTime;
  vehicle.vz += accelerationZ * deltaTime;
  vehicle.x += vehicle.vx * deltaTime;
  vehicle.y += vehicle.vy * deltaTime;
  vehicle.z += vehicle.vz * deltaTime;
  vehicle.y = Math.min(vehicle.y, 900);
  vehicle.x = Math.max(-HALF + 10, Math.min(HALF - 10, vehicle.x));
  vehicle.z = Math.max(-HALF + 10, Math.min(HALF - 10, vehicle.z));
  vehicle.v = Math.hypot(vehicle.vx, vehicle.vz);
  let impact = 0;
  const groundHeight = groundFor(world, vehicle.x, vehicle.z, vehicle.y);
  if (vehicle.y <= groundHeight) {
    const sinkSpeed = -vehicle.vy;
    const tilt = Math.max(Math.abs(vehicle.pitch), Math.abs(vehicle.roll));
    if (sinkSpeed > 5 || vehicle.v > 12 || tilt > 0.6) {
      impact = sinkSpeed + vehicle.v * 0.6 + tilt * 15;
    }
    vehicle.y = groundHeight;
    if (vehicle.vy < 0) {
      vehicle.vy = 0;
    }
    const smoothing = Math.exp(-deltaTime * 6);
    vehicle.vx *= smoothing;
    vehicle.vz *= smoothing;
    vehicle.onGround = true;
  } else {
    vehicle.onGround = false;
  }
  if (world && vehicle.v + Math.abs(vehicle.vy) > 3) {
    world.grid.query(vehicle.x - 4, vehicle.z - 4, vehicle.x + 4, vehicle.z + 4, near);
    for (const farEdge of near) {
      if (farEdge.soft || farEdge.mat === 'edge') {
        continue;
      }
      if (
        vehicle.x > farEdge.min[0] - 3.5 &&
        vehicle.x < farEdge.max[0] + 3.5 &&
        vehicle.z > farEdge.min[2] - 3.5 &&
        vehicle.z < farEdge.max[2] + 3.5 &&
        vehicle.y + 3 > farEdge.min[1] &&
        vehicle.y + 0.5 < farEdge.max[1] &&
        !farEdge.floor
      ) {
        impact = Math.max(impact, (vehicle.v + Math.abs(vehicle.vy)) * 1.5);
        vehicle.vx *= -0.3;
        vehicle.vz *= -0.3;
      }
    }
  }
  return impact;
}

const WRECK_BOUNCE = 0.25;
const WRECK_FRICTION = 2.5;
const WRECK_SPIN_DAMP_GROUND = 4;
export function stepWreck(vehicle, deltaTime, world) {
  const spin = (vehicle.tumble ||= [0, 0, 0]);
  vehicle.vx = vehicle.vx || 0;
  vehicle.vy = vehicle.vy || 0;
  vehicle.vz = vehicle.vz || 0;
  vehicle.vy -= GRAVITY * deltaTime;
  vehicle.x = Math.max(-HALF + 8, Math.min(HALF - 8, vehicle.x + vehicle.vx * deltaTime));
  vehicle.y += vehicle.vy * deltaTime;
  vehicle.z = Math.max(-HALF + 8, Math.min(HALF - 8, vehicle.z + vehicle.vz * deltaTime));
  vehicle.pitch += spin[0] * deltaTime;
  vehicle.roll += spin[1] * deltaTime;
  vehicle.yaw += spin[2] * deltaTime;
  const ground = groundFor(world, vehicle.x, vehicle.z, vehicle.y);
  let impact = 0;
  if (vehicle.y <= ground) {
    impact = Math.max(0, -vehicle.vy);
    vehicle.y = ground;
    vehicle.vy = impact > 3 ? impact * WRECK_BOUNCE : 0;
    const keep = Math.exp(-WRECK_FRICTION * deltaTime);
    vehicle.vx *= keep;
    vehicle.vz *= keep;
    const damp = Math.exp(-WRECK_SPIN_DAMP_GROUND * deltaTime);
    spin[0] *= damp;
    spin[1] *= damp;
    spin[2] *= damp;
    const restRoll = Math.round(vehicle.roll / (Math.PI / 2)) * (Math.PI / 2);
    const index = Math.min(1, deltaTime * 3);
    vehicle.pitch -= Math.atan2(Math.sin(vehicle.pitch), Math.cos(vehicle.pitch)) * index;
    vehicle.roll += (restRoll - vehicle.roll) * index;
    vehicle.onGround = true;
  } else {
    vehicle.onGround = false;
  }
  if (world && Math.hypot(vehicle.vx, vehicle.vz) > 1) {
    world.grid.query(vehicle.x - 2, vehicle.z - 2, vehicle.x + 2, vehicle.z + 2, near);
    for (const farEdge of near) {
      if (farEdge.soft || farEdge.floor || farEdge.mat === 'edge') {
        continue;
      }
      if (
        vehicle.x > farEdge.min[0] &&
        vehicle.x < farEdge.max[0] &&
        vehicle.z > farEdge.min[2] &&
        vehicle.z < farEdge.max[2] &&
        vehicle.y < farEdge.max[1]
      ) {
        vehicle.vx *= -0.2;
        vehicle.vz *= -0.2;
        break;
      }
    }
  }
  vehicle.v = Math.hypot(vehicle.vx, vehicle.vz);
  return impact;
}

export function settle(vehicle) {
  const sampleCount = normalAt(vehicle.x, vehicle.z);
  vehicle.y = heightAt(vehicle.x, vehicle.z);
  vehicle.pitch = 0;
  vehicle.roll = 0;
  void sampleCount;
}
