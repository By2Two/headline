import { raycastWorld } from './raycast.js';

export const NADE = {
  dt: 1 / 60,
  gravity: 16,
  throwSpeed: 17,
  lobSpeed: 8,
  radius: 0.07,
  bounce: 0.42,
  friction: 0.72,
  heFuseMs: 1600,
  heRadius: 9,
  heDmg: 98,
  smokeMaxMs: 2500,
  smokeMs: 18000,
  smokeRadius: 4.2,
};

export function nadeStart(origin, direction, lob = false) {
  const speed = lob ? NADE.lobSpeed : NADE.throwSpeed;
  return {
    x: origin[0] + direction[0] * 0.4,
    y: origin[1] + direction[1] * 0.4 - 0.1,
    z: origin[2] + direction[2] * 0.4,
    vx: direction[0] * speed,
    vy: direction[1] * speed + 2.2,
    vz: direction[2] * speed,
    rest: false,
  };
}

export function stepNade(grenade, solids) {
  if (grenade.rest) {
    return false;
  }
  const deltaTime = NADE.dt;
  grenade.vy -= NADE.gravity * deltaTime;
  const speed = Math.hypot(grenade.vx, grenade.vy, grenade.vz);
  const distance = speed * deltaTime;
  if (distance < 1e-6) {
    return false;
  }
  const direction = [grenade.vx / speed, grenade.vy / speed, grenade.vz / speed];
  const hit = raycastWorld(
    [grenade.x, grenade.y, grenade.z],
    direction,
    distance + NADE.radius,
    solids,
  );
  if (!hit) {
    grenade.x += grenade.vx * deltaTime;
    grenade.y += grenade.vy * deltaTime;
    grenade.z += grenade.vz * deltaTime;
    return false;
  }
  const back = Math.max(0, hit.t - NADE.radius);
  grenade.x += direction[0] * back;
  grenade.y += direction[1] * back;
  grenade.z += direction[2] * back;
  const [normalX, normalY, normalZ] = hit.normal;
  const normalSpeed = grenade.vx * normalX + grenade.vy * normalY + grenade.vz * normalZ;
  const tangentX = grenade.vx - normalSpeed * normalX;
  const tangentY = grenade.vy - normalSpeed * normalY;
  const tangentZ = grenade.vz - normalSpeed * normalZ;
  grenade.vx = tangentX * NADE.friction - normalSpeed * normalX * NADE.bounce;
  grenade.vy = tangentY * NADE.friction - normalSpeed * normalY * NADE.bounce;
  grenade.vz = tangentZ * NADE.friction - normalSpeed * normalZ * NADE.bounce;
  if (normalY > 0.7 && Math.hypot(grenade.vx, grenade.vy, grenade.vz) < 1.2) {
    grenade.vx = grenade.vy = grenade.vz = 0;
    grenade.rest = true;
  }
  return Math.abs(normalSpeed) > 2;
}

export function smokeBlocks(smokes, from, to) {
  for (const smoke of smokes) {
    const center = [smoke.p[0], smoke.p[1] + 1.2, smoke.p[2]];
    const direction = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const len2 =
      direction[0] * direction[0] + direction[1] * direction[1] + direction[2] * direction[2] || 1;
    const coverage = Math.max(
      0,
      Math.min(
        1,
        ((center[0] - from[0]) * direction[0] +
          (center[1] - from[1]) * direction[1] +
          (center[2] - from[2]) * direction[2]) /
          len2,
      ),
    );
    const distance = Math.hypot(
      from[0] + direction[0] * coverage - center[0],
      from[1] + direction[1] * coverage - center[1],
      from[2] + direction[2] * coverage - center[2],
    );
    if (distance < NADE.smokeRadius * 0.85) {
      return true;
    }
  }
  return false;
}
