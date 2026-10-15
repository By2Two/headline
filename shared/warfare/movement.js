import { PLAYER } from '../constants.js';
import { MOVE_MIL, SLIDE } from './config.js';
import { heightAt, waterAt, waterLevel, surfaceAt, SURF } from './terrain.js';
import { solidsNear } from './world.js';

export function createMilMoveState(positionX = 0, positionY = 0, positionZ = 0) {
  return {
    x: positionX,
    y: positionY,
    z: positionZ,
    vx: 0,
    vy: 0,
    vz: 0,
    onGround: true,
    crouch: false,
    prone: false,
    rollT: 0,
    rollDir: 0,
    poseT: 0,
    jumpHeld: false,
    groundTime: 0,
    justLanded: false,
    landSpeed: 0,
    st: 1,
    sprinting: false,
    inWire: 0,
    slideT: 0,
    slideDx: 0,
    slideDz: 0,
    slideCool: 0,
  };
}

export const milSpeedMult = (moveMult, aim, uiFlags = 0, pistol = false, drag = false) =>
  (moveMult ?? 1) *
  (uiFlags & 16 ? 0.6 : aim === 1 ? (pistol ? 0.88 : MOVE_MIL.adsMult) : 1) *
  (uiFlags & 64 ? 0.5 : 1) *
  (drag ? 0.35 : 1);

export const heightOf = (state) =>
  state.prone ? MOVE_MIL.proneHeight : state.crouch ? PLAYER.crouchHeight : PLAYER.height;

export function restSeated(state) {
  state.st = 1;
  state.sprinting = false;
  state.slideT = 0;
}

const near = [];
const PLAYER_RADIUS = PLAYER.radius;

function overlaps(box, positionX, positionY, positionZ, height) {
  return (
    positionX + PLAYER_RADIUS > box.min[0] &&
    positionX - PLAYER_RADIUS < box.max[0] &&
    positionZ + PLAYER_RADIUS > box.min[2] &&
    positionZ - PLAYER_RADIUS < box.max[2] &&
    positionY + height > box.min[1] + 1e-4 &&
    positionY < box.max[1] - 1e-4
  );
}
function anyOverlap(list, positionX, positionY, positionZ, height) {
  for (let index = 0; index < list.length; index++) {
    if (!list[index].soft && overlaps(list[index], positionX, positionY, positionZ, height)) {
      return list[index];
    }
  }
  return null;
}
function topAt(list, positionX, positionY, positionZ, height) {
  let top = -Infinity;
  for (let index = 0; index < list.length; index++) {
    const box = list[index];
    if (!box.soft && overlaps(box, positionX, positionY, positionZ, height) && box.max[1] > top) {
      top = box.max[1];
    }
  }
  return top;
}
function groundAt(list, positionX, positionY, positionZ) {
  let ground = heightAt(positionX, positionZ);
  for (let index = 0; index < list.length; index++) {
    const box = list[index];
    if (box.soft) {
      continue;
    }
    if (
      positionX + PLAYER_RADIUS > box.min[0] &&
      positionX - PLAYER_RADIUS < box.max[0] &&
      positionZ + PLAYER_RADIUS > box.min[2] &&
      positionZ - PLAYER_RADIUS < box.max[2] &&
      box.max[1] <= positionY + 0.06 &&
      box.max[1] > ground
    ) {
      ground = box.max[1];
    }
  }
  return ground;
}

export function stepMil(state, input, deltaTime, world, option = {}) {
  state.justLanded = false;
  solidsNear(world, state.x, state.z, 3, near);
  const currentHeight = heightOf(state);
  for (let index = near.length - 1; index >= 0; index--) {
    if (overlaps(near[index], state.x, state.y + 0.06, state.z, currentHeight - 0.1)) {
      near.splice(index, 1);
    }
  }
  const deep = waterAt(state.x, state.y, state.z) > 0.6;
  if (input.prone && !deep && !state.prone) {
    const forwardX = -Math.sin(input.yaw);
    const forwardZ = -Math.cos(input.yaw);
    const room =
      !anyOverlap(
        near,
        state.x + forwardX * 0.8,
        state.y + 0.05,
        state.z + forwardZ * 0.8,
        MOVE_MIL.proneHeight - 0.05,
      ) &&
      !anyOverlap(
        near,
        state.x - forwardX * 0.6,
        state.y + 0.05,
        state.z - forwardZ * 0.6,
        MOVE_MIL.proneHeight - 0.05,
      );
    if (room) {
      state.prone = true;
      state.crouch = false;
      state.poseT = 0.2;
    }
  } else if (input.prone && !deep) {
    state.crouch = false;
  } else if (state.prone) {
    const want = input.crouch ? PLAYER.crouchHeight : PLAYER.height;
    if (!anyOverlap(near, state.x, state.y, state.z, want)) {
      state.prone = false;
      state.crouch = !!input.crouch;
      state.poseT = 0.2;
    } else if (!anyOverlap(near, state.x, state.y, state.z, PLAYER.crouchHeight)) {
      state.prone = false;
      state.crouch = true;
      state.poseT = 0.2;
    }
  } else if (input.crouch) {
    const fast = Math.hypot(state.vx, state.vz);
    if (
      !state.crouch &&
      state.sprinting &&
      state.onGround &&
      fast > SLIDE.minSpeed &&
      !(state.slideT > 0) &&
      !(state.slideCool > 0) &&
      !option.frozen
    ) {
      state.slideT = SLIDE.time;
      state.slideDx = state.vx / fast;
      state.slideDz = state.vz / fast;
    }
    state.crouch = true;
  } else if (state.crouch && !anyOverlap(near, state.x, state.y, state.z, PLAYER.height)) {
    state.crouch = false;
  }
  if (state.slideCool > 0) {
    state.slideCool -= deltaTime;
  }
  if (state.slideT > 0 && (!state.onGround || state.prone || !state.crouch || option.frozen)) {
    state.slideT = 0;
  }
  const height = heightOf(state);
  const weightEffects = { speed: 1 };

  state.inWire = 0;
  for (const box of near) {
    if (box.mat === 'wire' && overlaps(box, state.x, state.y, state.z, height)) {
      state.inWire = 1;
    }
  }
  const waterDepth = waterAt(state.x, state.y, state.z);
  const swim = waterDepth > 1.35;

  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  let wishX = -sin * input.fwd + cos * input.right;
  let wishZ = -cos * input.fwd - sin * input.right;
  const distance = Math.hypot(wishX, wishZ);
  if (distance > 0) {
    wishX /= distance;
    wishZ /= distance;
  }
  const leg = input.legWound || 0;
  const canSprint =
    input.sprint &&
    input.fwd > 0 &&
    !state.crouch &&
    !state.prone &&
    !input.ads &&
    !swim &&
    !state.inWire &&
    leg < 0.6;
  state.sprinting = canSprint && distance > 0 && state.onGround;
  const pace = input.pace ?? (input.walk ? 1 : 0);
  let base = state.prone
    ? MOVE_MIL.prone * (pace ? 0.6 : 1)
    : state.crouch
      ? pace === 2
        ? MOVE_MIL.crouchWalk * 0.7
        : pace
          ? MOVE_MIL.crouchWalk
          : MOVE_MIL.crouchRun
      : canSprint
        ? MOVE_MIL.sprint
        : pace === 2
          ? MOVE_MIL.slow
          : pace
            ? MOVE_MIL.walk
            : MOVE_MIL.run;
  if (input.fwd < 0) {
    base *= 0.65;
  } else if (input.right) {
    base *= input.fwd > 0 ? 0.92 : state.prone ? 0.5 : 0.8;
  }
  if (!state.crouch && !state.prone && state.onGround) {
    const surface = surfaceAt(state.x, state.z);
    const deck =
      surface === SURF.water && waterDepth === 0 && state.y > heightAt(state.x, state.z) + 0.5;
    if (surface === SURF.asphalt || surface === SURF.concrete || deck) {
      base *= 1.05;
    }
  }
  if (state.poseT > 0) {
    state.poseT -= deltaTime;
    base *= 0.15;
  }
  if (leg > 0) {
    base *= 1 - 0.25 * leg;
  }
  base *= weightEffects.speed * Math.min(1, input.speedMult ?? 1);
  if (waterDepth > 0.4) {
    base *= Math.max(0.35, 1 - (waterDepth - 0.4) * 0.55);
  }
  if (state.inWire) {
    base *= 0.3;
  }
  if (distance > 0) {
    const ahead =
      heightAt(state.x + wishX * 0.8, state.z + wishZ * 0.8) - heightAt(state.x, state.z);
    const slope = ahead / 0.8;
    if (slope > 0) {
      base *= Math.max(0.3, 1 - slope * 0.45);
    } else {
      base *= Math.min(1.12, 1 - slope * 0.1);
    }
    if (
      slope > MOVE_MIL.maxSlope &&
      state.onGround &&
      state.y <= heightAt(state.x, state.z) + 0.05
    ) {
      base *= 0.1;
    }
  }
  if (option.frozen) {
    base = 0;
  }
  const wish = distance > 0 ? base : 0;

  if ((input.jump && !state.jumpHeld) || input.jumpPress) {
    if (state.onGround && !state.crouch && !state.prone && !swim && !option.frozen) {
      const again = state.groundTime < 0.35;
      let jumpSpeed = MOVE_MIL.jump * (again ? 0.85 : 1);
      const forwardX = -sin;
      const forwardZ = -cos;
      for (const box of near) {
        if (box.soft) {
          continue;
        }
        const probeX = state.x + forwardX * 0.7;
        const probeZ = state.z + forwardZ * 0.7;
        if (
          probeX + PLAYER_RADIUS > box.min[0] &&
          probeX - PLAYER_RADIUS < box.max[0] &&
          probeZ + PLAYER_RADIUS > box.min[2] &&
          probeZ - PLAYER_RADIUS < box.max[2]
        ) {
          const top = topAt(near, probeX, state.y + 0.05, probeZ, 0.01 + height);
          const climb = top - state.y;
          if (
            climb > 0.4 &&
            climb <= 1.45 &&
            !anyOverlap(near, probeX, top + 0.02, probeZ, height)
          ) {
            jumpSpeed = Math.max(jumpSpeed, Math.sqrt(2 * MOVE_MIL.gravity * (climb + 0.25)));
          }
        }
      }
      state.vy = jumpSpeed;
      state.onGround = false;
    }
  }
  if (state.slideT > 0 && ((input.jump && !state.jumpHeld) || input.jumpPress) && !option.frozen) {
    const speed = Math.max(Math.hypot(state.vx, state.vz), MOVE_MIL.sprint);
    state.vx = state.slideDx * speed;
    state.vz = state.slideDz * speed;
    state.vy = MOVE_MIL.jump * 0.9;
    state.onGround = false;
    state.slideT = 0;
    state.slideCool = SLIDE.cooldown;
    state.crouch = false;
  }
  state.jumpHeld = !!input.jump;

  if (state.slideT > 0) {
    state.slideT -= deltaTime;
    const friction = Math.max(0, state.slideT / SLIDE.time);
    const slideSpeed =
      MOVE_MIL.crouchRun + (SLIDE.speed - MOVE_MIL.crouchRun) * friction * friction;
    state.vx = state.slideDx * slideSpeed;
    state.vz = state.slideDz * slideSpeed;
    state.groundTime += deltaTime;
    if (state.slideT <= 0) {
      state.slideCool = SLIDE.cooldown;
    }
  } else if (state.onGround || swim) {
    const speed = Math.hypot(state.vx, state.vz);
    if (speed > 0.01) {
      const control = Math.max(speed, MOVE_MIL.stopSpeed);
      const drop = control * MOVE_MIL.friction * deltaTime;
      const friction = Math.max(speed - drop, 0) / speed;
      state.vx *= friction;
      state.vz *= friction;
    } else {
      state.vx = state.vz = 0;
    }
    const current = state.vx * wishX + state.vz * wishZ;
    const add = wish - current;
    if (add > 0) {
      const accelerationStep = Math.min(MOVE_MIL.accel * deltaTime * Math.max(wish, 3), add);
      state.vx += accelerationStep * wishX;
      state.vz += accelerationStep * wishZ;
    }
    state.groundTime += deltaTime;
  } else {
    state.groundTime = 0;
    const current = state.vx * wishX + state.vz * wishZ;
    const add = Math.min(wish, 1) - current;
    if (add > 0) {
      const accelerationStep = Math.min(MOVE_MIL.airAccel * deltaTime * wish, add);
      state.vx += accelerationStep * wishX;
      state.vz += accelerationStep * wishZ;
    }
  }

  if (state.prone && input.roll && state.rollT <= 0 && !option.frozen) {
    state.rollT = MOVE_MIL.rollTime;
    state.rollDir = input.roll > 0 ? 1 : -1;
  }
  if (state.rollT > 0) {
    state.rollT -= deltaTime;
    const rotationX = Math.cos(input.yaw);
    const rotationZ = -Math.sin(input.yaw);
    state.vx = rotationX * state.rollDir * MOVE_MIL.rollSpeed;
    state.vz = rotationZ * state.rollDir * MOVE_MIL.rollSpeed;
    if (state.rollT <= 0) {
      state.vx = state.vz = 0;
    }
  }

  state.st = 1;

  const step = PLAYER.step;
  const nextX = state.x + state.vx * deltaTime;
  if (anyOverlap(near, nextX, state.y, state.z, height)) {
    const top = topAt(near, nextX, state.y, state.z, height);
    if (top - state.y <= step && !anyOverlap(near, nextX, top, state.z, height)) {
      state.y = top;
      state.x = nextX;
    } else {
      state.vx = 0;
    }
  } else {
    state.x = nextX;
  }
  const nextZ = state.z + state.vz * deltaTime;
  if (anyOverlap(near, state.x, state.y, nextZ, height)) {
    const top = topAt(near, state.x, state.y, nextZ, height);
    if (top - state.y <= step && !anyOverlap(near, state.x, top, nextZ, height)) {
      state.y = top;
      state.z = nextZ;
    } else {
      state.vz = 0;
    }
  } else {
    state.z = nextZ;
  }

  if (state.slideT > 0 && Math.hypot(state.vx, state.vz) < 2.2) {
    state.slideT = 0;
    state.slideCool = SLIDE.cooldown;
  }
  const groundHeight = groundAt(near, state.x, state.y + 0.5, state.z);
  if (swim) {
    const surfY = (waterLevel(state.x, state.z) ?? heightAt(state.x, state.z) + waterDepth) - 1.25;
    state.y += (Math.max(surfY, groundHeight) - state.y) * Math.min(1, deltaTime * 4);
    state.vy = 0;
    state.onGround = true;
    return state;
  }
  if (state.onGround && state.vy <= 0) {
    if (state.y - groundHeight <= step + 0.15 && groundHeight - state.y < 0.5) {
      state.y = groundHeight;
      state.vy = 0;
    } else if (groundHeight > state.y) {
      state.y = groundHeight;
      state.vy = 0;
    } else {
      state.onGround = false;
    }
  }
  if (!state.onGround) {
    state.vy -= MOVE_MIL.gravity * deltaTime;
    const nextY = state.y + state.vy * deltaTime;
    if (state.vy <= 0) {
      const groundBelow = groundAt(near, state.x, state.y + 0.05, state.z);
      if (nextY <= groundBelow) {
        state.justLanded = true;
        state.landSpeed = -state.vy;
        state.y = groundBelow;
        state.vy = 0;
        state.onGround = true;
      } else {
        state.y = nextY;
      }
    } else if (anyOverlap(near, state.x, nextY, state.z, height)) {
      state.vy = 0;
    } else {
      state.y = nextY;
    }
  }
  const terrainHeight = heightAt(state.x, state.z);
  if (state.y < terrainHeight - 0.02) {
    state.y = terrainHeight;
    if (state.vy < 0) {
      state.vy = 0;
    }
    state.onGround = true;
  }
  return state;
}
