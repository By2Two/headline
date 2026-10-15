import { PLAYER, MOVE } from './constants.js';

export function createMoveState(positionX = 0, positionY = 0, positionZ = 0) {
  return {
    x: positionX,
    y: positionY,
    z: positionZ,
    vx: 0,
    vy: 0,
    vz: 0,
    onGround: true,
    crouch: false,
    jumpHeld: false,
    jumpBuf: 0,
    groundTime: 0,
    justLanded: false,
    landSpeed: 0,
  };
}

function overlapsBox(box, positionX, positionY, positionZ, height) {
  const radius = PLAYER.radius;
  return (
    positionX + radius > box.min[0] &&
    positionX - radius < box.max[0] &&
    positionZ + radius > box.min[2] &&
    positionZ - radius < box.max[2] &&
    positionY + height > box.min[1] + 1e-4 &&
    positionY < box.max[1] - 1e-4
  );
}

function overlapsAny(positionX, positionY, positionZ, height, boxes) {
  for (let index = 0; index < boxes.length; index++) {
    if (overlapsBox(boxes[index], positionX, positionY, positionZ, height)) {
      return true;
    }
  }
  return false;
}

function topAt(positionX, positionY, positionZ, height, boxes) {
  let top = -Infinity;
  for (let index = 0; index < boxes.length; index++) {
    const box = boxes[index];
    if (overlapsBox(box, positionX, positionY, positionZ, height) && box.max[1] > top) {
      top = box.max[1];
    }
  }
  return top;
}

function ceilingAt(positionX, positionY, positionZ, height, boxes) {
  let ceiling = Infinity;
  for (let index = 0; index < boxes.length; index++) {
    const box = boxes[index];
    if (overlapsBox(box, positionX, positionY, positionZ, height) && box.min[1] < ceiling) {
      ceiling = box.min[1];
    }
  }
  return ceiling;
}

function groundBelow(positionX, positionY, positionZ, boxes) {
  const radius = PLAYER.radius;
  let ground = 0;
  for (let index = 0; index < boxes.length; index++) {
    const box = boxes[index];
    if (
      positionX + radius > box.min[0] &&
      positionX - radius < box.max[0] &&
      positionZ + radius > box.min[2] &&
      positionZ - radius < box.max[2] &&
      box.max[1] <= positionY + 0.001 &&
      box.max[1] > ground
    ) {
      ground = box.max[1];
    }
  }
  return ground;
}

const BODY_REACH_M = 3;
export function solidsWithBodies(solids, state, bodies) {
  const radius = PLAYER.radius;
  const height = state.crouch ? PLAYER.crouchHeight : PLAYER.height;
  let extra = null;
  for (const body of bodies) {
    if (Math.abs(body.x - state.x) > BODY_REACH_M || Math.abs(body.z - state.z) > BODY_REACH_M) {
      continue;
    }
    const box = {
      min: [body.x - radius, body.y, body.z - radius],
      max: [
        body.x + radius,
        body.y + (body.crouch ? PLAYER.crouchHeight : PLAYER.height),
        body.z + radius,
      ],
    };
    if (overlapsBox(box, state.x, state.y, state.z, height)) {
      continue;
    }
    (extra ||= []).push(box);
  }
  return extra ? solids.concat(extra) : solids;
}

const JUMP_BUFFER = 0.1;

function accelerate(state, wishX, wishZ, wishCap, wishFull, accel, deltaTime) {
  const current = state.vx * wishX + state.vz * wishZ;
  const add = wishCap - current;
  if (add <= 0) {
    return;
  }
  const accelerationStep = Math.min(accel * deltaTime * wishFull, add);
  state.vx += accelerationStep * wishX;
  state.vz += accelerationStep * wishZ;
}

export function stepPlayer(state, input, deltaTime, boxes) {
  state.justLanded = false;

  if (input.crouch) {
    state.crouch = true;
  } else if (state.crouch && !overlapsAny(state.x, state.y, state.z, PLAYER.height, boxes)) {
    state.crouch = false;
  }
  const height = state.crouch ? PLAYER.crouchHeight : PLAYER.height;

  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  let wishX = -sin * input.fwd + cos * input.right;
  let wishZ = -cos * input.fwd - sin * input.right;
  const distance = Math.hypot(wishX, wishZ);
  if (distance > 0) {
    wishX /= distance;
    wishZ /= distance;
  }
  const maxSpeed =
    (state.crouch ? MOVE.crouch : input.walk ? MOVE.walk : MOVE.run) * (input.speedMult ?? 1);
  const wish = distance > 0 ? maxSpeed : 0;

  if ((input.jump && !state.jumpHeld) || input.jumpPress) {
    state.jumpBuf = JUMP_BUFFER;
  }
  state.jumpHeld = !!input.jump;
  if (state.onGround && (state.jumpBuf > 0 || (input.jump && state.groundTime > 0))) {
    state.vy = MOVE.jump;
    state.onGround = false;
    state.jumpBuf = 0;
  }
  state.jumpBuf = Math.max(0, state.jumpBuf - deltaTime);

  if (state.onGround) {
    const speed = Math.hypot(state.vx, state.vz);
    if (speed > 0.01) {
      const control = Math.max(speed, MOVE.stopSpeed);
      const drop = control * MOVE.friction * deltaTime;
      const friction = Math.max(speed - drop, 0) / speed;
      state.vx *= friction;
      state.vz *= friction;
    } else {
      state.vx = 0;
      state.vz = 0;
    }
    accelerate(state, wishX, wishZ, wish, wish && Math.max(wish, 4), MOVE.accel, deltaTime);
    state.groundTime += deltaTime;
  } else {
    state.groundTime = 0;
    accelerate(state, wishX, wishZ, Math.min(wish, MOVE.airCap), wish, MOVE.airAccel, deltaTime);
    const distance = Math.hypot(state.vx, state.vz);
    if (distance > MOVE.maxAir) {
      state.vx *= MOVE.maxAir / distance;
      state.vz *= MOVE.maxAir / distance;
    }
  }

  const nextX = state.x + state.vx * deltaTime;
  if (overlapsAny(nextX, state.y, state.z, height, boxes)) {
    const top = topAt(nextX, state.y, state.z, height, boxes);
    if (top - state.y <= PLAYER.step && !overlapsAny(nextX, top, state.z, height, boxes)) {
      state.y = top;
      state.x = nextX;
    } else {
      state.vx = 0;
    }
  } else {
    state.x = nextX;
  }

  const nextZ = state.z + state.vz * deltaTime;
  if (overlapsAny(state.x, state.y, nextZ, height, boxes)) {
    const top = topAt(state.x, state.y, nextZ, height, boxes);
    if (top - state.y <= PLAYER.step && !overlapsAny(state.x, top, nextZ, height, boxes)) {
      state.y = top;
      state.z = nextZ;
    } else {
      state.vz = 0;
    }
  } else {
    state.z = nextZ;
  }

  const groundHeight = groundBelow(state.x, state.y, state.z, boxes);
  if (state.onGround && state.vy <= 0) {
    if (state.y - groundHeight <= PLAYER.step) {
      state.y = groundHeight;
      state.vy = 0;
    } else {
      state.onGround = false;
    }
  }
  if (!state.onGround) {
    state.vy -= MOVE.gravity * deltaTime;
    const nextY = state.y + state.vy * deltaTime;
    if (state.vy <= 0) {
      if (nextY <= groundHeight) {
        state.justLanded = true;
        state.landSpeed = -state.vy;
        state.y = groundHeight;
        state.vy = 0;
        state.onGround = true;
      } else {
        state.y = nextY;
      }
    } else if (overlapsAny(state.x, nextY, state.z, height, boxes)) {
      state.y = ceilingAt(state.x, nextY, state.z, height, boxes) - height - 1e-3;
      state.vy = 0;
    } else {
      state.y = nextY;
    }
  }
  return state;
}
