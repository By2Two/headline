import { MIL } from './config.js';
import { heightAt } from './terrain.js';
import { rayWorld } from './world.js';

export const BULLET_DT = 1 / 120;
export const SIGHT_HEIGHT = 0.065;

const HARD = new Set([
  'metal',
  'metalroof',
  'concrete',
  'containerR',
  'containerG',
  'containerB',
  'containerY',
  'bridge',
  'silo',
  'vehicle',
]);
export function ricochet(bullet, direction, hit) {
  if (bullet.ric || !hit || !hit.normal) {
    return false;
  }
  const normal = hit.normal;
  const cos = -(direction[0] * normal[0] + direction[1] * normal[1] + direction[2] * normal[2]);
  if (cos <= 0 || cos > 0.22) {
    return false;
  }
  const hard = hit.terrain
    ? hit.point[1] < heightAt(hit.point[0], hit.point[2]) + 0.05 && cos < 0.12
    : HARD.has(hit.mat);
  if (!hard) {
    return false;
  }
  const speed = Math.hypot(bullet.v[0], bullet.v[1], bullet.v[2]) * 0.5;
  const dotNormal = direction[0] * normal[0] + direction[1] * normal[1] + direction[2] * normal[2];
  const reflection = [
    direction[0] - 2 * dotNormal * normal[0],
    direction[1] - 2 * dotNormal * normal[1],
    direction[2] - 2 * dotNormal * normal[2],
  ];
  bullet.p = [
    hit.point[0] + normal[0] * 0.03,
    hit.point[1] + normal[1] * 0.03,
    hit.point[2] + normal[2] * 0.03,
  ];
  bullet.v = [reflection[0] * speed, reflection[1] * speed, reflection[2] * speed];
  bullet.ric = true;
  return true;
}

export function stepBullet(bullet, deltaTime = BULLET_DT) {
  const speed = Math.hypot(bullet.v[0], bullet.v[1], bullet.v[2]);
  const drag = Math.exp(-bullet.k * speed * deltaTime);
  bullet.v[0] *= drag;
  bullet.v[1] = bullet.v[1] * drag - MIL.gravity * deltaTime;
  bullet.v[2] *= drag;
  bullet.p[0] += bullet.v[0] * deltaTime;
  bullet.p[1] += bullet.v[1] * deltaTime;
  bullet.p[2] += bullet.v[2] * deltaTime;
  bullet.t += deltaTime;
}

const zeroCache = new Map();
export function zeroAngle(muzzleVelocity, drag, range, sightH = 0) {
  if (!range || !muzzleVelocity) {
    return 0;
  }
  const key = `${muzzleVelocity}|${drag}|${range}|${sightH}`;
  if (zeroCache.has(key)) {
    return zeroCache.get(key);
  }
  let angle = 0;
  for (let item = 0; item < 6; item++) {
    const bullet = {
      p: [0, -sightH, 0],
      v: [muzzleVelocity * Math.cos(angle), muzzleVelocity * Math.sin(angle), 0],
      k: drag,
      t: 0,
    };
    let prevX = 0;
    let prevY = bullet.p[1];
    let guard = 0;
    while (bullet.p[0] < range && guard++ < 4000) {
      prevX = bullet.p[0];
      prevY = bullet.p[1];
      stepBullet(bullet, BULLET_DT);
    }
    const fraction = (range - prevX) / (bullet.p[0] - prevX || 1);
    const height = prevY + (bullet.p[1] - prevY) * fraction;
    angle += -height / range;
  }
  zeroCache.set(key, angle);
  return angle;
}

export function dropAt(muzzleVelocity, drag, distance, angle = 0) {
  const bullet = {
    p: [0, 0, 0],
    v: [muzzleVelocity * Math.cos(angle), muzzleVelocity * Math.sin(angle), 0],
    k: drag,
    t: 0,
  };
  let guard = 0;
  while (bullet.p[0] < distance && guard++ < 4000) {
    stepBullet(bullet, 1 / 240);
  }
  return { drop: -bullet.p[1], t: bullet.t, v: Math.hypot(bullet.v[0], bullet.v[1]) };
}

export const NADE_MIL = {
  dt: 1 / 60,
  gravity: 13,
  throwSpeed: 15,
  lobSpeed: 7,
  radius: 0.07,
  bounce: 0.35,
  friction: 0.65,
  fuseMs: 4200,
  smokeMaxMs: 3000,
  smokeMs: 35000,
  smokeRadius: 6,
};

export function nadeStartMil(origin, direction, lob = false) {
  const speed = lob ? NADE_MIL.lobSpeed : NADE_MIL.throwSpeed;
  return {
    x: origin[0] + direction[0] * 0.4,
    y: origin[1] + direction[1] * 0.4 - 0.1,
    z: origin[2] + direction[2] * 0.4,
    vx: direction[0] * speed,
    vy: direction[1] * speed + 2.0,
    vz: direction[2] * speed,
    rest: false,
  };
}

export function stepNadeMil(grenade, world) {
  if (grenade.rest) {
    return false;
  }
  const deltaTime = NADE_MIL.dt;
  grenade.vy -= NADE_MIL.gravity * deltaTime;
  const speed = Math.hypot(grenade.vx, grenade.vy, grenade.vz);
  const distance = speed * deltaTime;
  if (distance < 1e-6) {
    return false;
  }
  const direction = [grenade.vx / speed, grenade.vy / speed, grenade.vz / speed];
  const hit = rayWorld(
    world,
    [grenade.x, grenade.y, grenade.z],
    direction,
    distance + NADE_MIL.radius,
    { skip: (box) => box.soft },
  );
  if (!hit) {
    grenade.x += grenade.vx * deltaTime;
    grenade.y += grenade.vy * deltaTime;
    grenade.z += grenade.vz * deltaTime;
    const ground = heightAt(grenade.x, grenade.z);
    if (grenade.y < ground + NADE_MIL.radius) {
      grenade.y = ground + NADE_MIL.radius;
    }
    return false;
  }
  const back = Math.max(0, hit.t - NADE_MIL.radius);
  grenade.x += direction[0] * back;
  grenade.y += direction[1] * back;
  grenade.z += direction[2] * back;
  const [normalX, normalY, normalZ] = hit.normal;
  const normalSpeed = grenade.vx * normalX + grenade.vy * normalY + grenade.vz * normalZ;
  const tangentX = grenade.vx - normalSpeed * normalX;
  const tangentY = grenade.vy - normalSpeed * normalY;
  const tangentZ = grenade.vz - normalSpeed * normalZ;
  grenade.vx = tangentX * NADE_MIL.friction - normalSpeed * normalX * NADE_MIL.bounce;
  grenade.vy = tangentY * NADE_MIL.friction - normalSpeed * normalY * NADE_MIL.bounce;
  grenade.vz = tangentZ * NADE_MIL.friction - normalSpeed * normalZ * NADE_MIL.bounce;
  if (normalY > 0.6 && Math.hypot(grenade.vx, grenade.vy, grenade.vz) < 1.0) {
    grenade.vx = grenade.vy = grenade.vz = 0;
    grenade.rest = true;
  }
  return Math.abs(normalSpeed) > 2;
}

export const LEAN_HEAD = 0.42;
export const LEAN_BODY = 0.2;
export function milHitboxes(position, crouch, lean = 0, yaw = 0, prone = false) {
  const [positionX, positionY, positionZ] = position;
  if (prone) {
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const at = (direction, reflection, bottom, top, part) => ({
      part,
      min: [
        positionX + forwardX * direction - reflection,
        positionY + bottom,
        positionZ + forwardZ * direction - reflection,
      ],
      max: [
        positionX + forwardX * direction + reflection,
        positionY + top,
        positionZ + forwardZ * direction + reflection,
      ],
    });
    return [
      at(0.85, 0.16, 0.05, 0.38, 'head'),
      at(0.25, 0.3, 0, 0.36, 'body'),
      at(-0.55, 0.26, 0, 0.3, 'legs'),
    ];
  }
  const height = crouch ? 1.3 : 1.8;
  const rotationX = Math.cos(yaw);
  const rotationZ = -Math.sin(yaw);
  const headOffsetX = rotationX * lean * LEAN_HEAD;
  const headOffsetZ = rotationZ * lean * LEAN_HEAD;
  const bodyOffsetX = rotationX * lean * LEAN_BODY;
  const bodyOffsetZ = rotationZ * lean * LEAN_BODY;
  const legsTop = positionY + height * 0.46;
  const headBot = positionY + height - 0.3 - Math.abs(lean) * 0.06;
  return [
    {
      part: 'head',
      min: [positionX + headOffsetX - 0.17, headBot, positionZ + headOffsetZ - 0.17],
      max: [positionX + headOffsetX + 0.17, headBot + 0.3, positionZ + headOffsetZ + 0.17],
    },
    {
      part: 'body',
      min: [positionX + bodyOffsetX - 0.28, legsTop, positionZ + bodyOffsetZ - 0.28],
      max: [positionX + bodyOffsetX + 0.28, headBot, positionZ + bodyOffsetZ + 0.28],
    },
    {
      part: 'legs',
      min: [positionX - 0.24, positionY, positionZ - 0.24],
      max: [positionX + 0.24, legsTop, positionZ + 0.24],
    },
  ];
}

export const mortarRange = (velocity, elDeg) =>
  (velocity * velocity * Math.sin((2 * elDeg * Math.PI) / 180)) / MIL.gravity;
export const mortarTime = (velocity, elDeg) =>
  (2 * velocity * Math.sin((elDeg * Math.PI) / 180)) / MIL.gravity;
