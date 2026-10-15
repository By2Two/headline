import { PLAYER } from './constants.js';

export function rayAABB(origin, direction, min, max, tMax = Infinity) {
  let tNear = 0;
  let tFar = tMax;
  let nAxis = -1;
  let nSign = 0;
  for (let index = 0; index < 3; index++) {
    if (Math.abs(direction[index]) < 1e-9) {
      if (origin[index] < min[index] || origin[index] > max[index]) {
        return null;
      }
      continue;
    }
    const inv = 1 / direction[index];
    let farT = (min[index] - origin[index]) * inv;
    let currentFarT = (max[index] - origin[index]) * inv;
    let sign = -1;
    if (farT > currentFarT) {
      const scratch = farT;
      farT = currentFarT;
      currentFarT = scratch;
      sign = 1;
    }
    if (farT > tNear) {
      tNear = farT;
      nAxis = index;
      nSign = sign;
    }
    if (currentFarT < tFar) {
      tFar = currentFarT;
    }
    if (tNear > tFar) {
      return null;
    }
  }
  const normal = [0, 0, 0];
  if (nAxis >= 0) {
    normal[nAxis] = nSign;
  }
  return { t: tNear, normal };
}

export function raycastWorld(origin, direction, maxT, boxes) {
  let best = null;
  for (let index = 0; index < boxes.length; index++) {
    const farDistance = boxes[index];
    const limit = best ? best.t : maxT;
    const hit = rayAABB(origin, direction, farDistance.min, farDistance.max, limit);
    if (hit && hit.t <= limit) {
      best = { t: hit.t, normal: hit.normal, mat: farDistance.mat };
    }
  }
  if (direction[1] < -1e-6) {
    const distance = -origin[1] / direction[1];
    if (distance >= 0 && distance < (best ? best.t : maxT)) {
      best = { t: distance, normal: [0, 1, 0], mat: 'floor' };
    }
  }
  if (best) {
    best.point = [
      origin[0] + direction[0] * best.t,
      origin[1] + direction[1] * best.t,
      origin[2] + direction[2] * best.t,
    ];
  }
  return best;
}

export function playerHitboxes(position, crouch) {
  const height = crouch ? PLAYER.crouchHeight : PLAYER.height;
  const [positionX, positionY, positionZ] = position;
  const legsTop = positionY + height * 0.46;
  const headBot = positionY + height - 0.3;
  return [
    {
      part: 'head',
      min: [positionX - 0.19, headBot, positionZ - 0.19],
      max: [positionX + 0.19, positionY + height, positionZ + 0.19],
    },
    {
      part: 'body',
      min: [positionX - 0.3, legsTop, positionZ - 0.3],
      max: [positionX + 0.3, headBot, positionZ + 0.3],
    },
    {
      part: 'legs',
      min: [positionX - 0.25, positionY, positionZ - 0.25],
      max: [positionX + 0.25, legsTop, positionZ + 0.25],
    },
  ];
}

function rayRange(origin, direction, min, max, tMax) {
  let nearT = 0;
  let farT = tMax;
  let nAxis = -1;
  let nSign = 0;
  let fAxis = -1;
  let fSign = 0;
  for (let index = 0; index < 3; index++) {
    if (Math.abs(direction[index]) < 1e-9) {
      if (origin[index] < min[index] || origin[index] > max[index]) {
        return null;
      }
      continue;
    }
    const inv = 1 / direction[index];
    let nearDistance = (min[index] - origin[index]) * inv;
    let farDistance = (max[index] - origin[index]) * inv;
    let hitAxis = -1;
    if (nearDistance > farDistance) {
      [nearDistance, farDistance] = [farDistance, nearDistance];
      hitAxis = 1;
    }
    if (nearDistance > nearT) {
      nearT = nearDistance;
      nAxis = index;
      nSign = hitAxis;
    }
    if (farDistance < farT) {
      farT = farDistance;
      fAxis = index;
      fSign = -hitAxis;
    }
    if (nearT > farT) {
      return null;
    }
  }
  const normal = [0, 0, 0];
  if (nAxis >= 0) {
    normal[nAxis] = nSign;
  }
  const exitNormal = [0, 0, 0];
  if (fAxis >= 0) {
    exitNormal[fAxis] = fSign;
  }
  return { t0: nearT, t1: farT, normal, exitNormal };
}

const MAT_COST = { crate: 1, wall: 2.5, door: 0.6, car: 1.6, tire: 1.2, roof: 2.5 };

export function traceShot(origin, direction, maxT, boxes, pen = 0) {
  const segs = [];
  for (const farDistance of boxes) {
    const hit = rayRange(origin, direction, farDistance.min, farDistance.max, maxT);
    if (hit) {
      segs.push({ ...hit, mat: farDistance.mat, box: farDistance });
    }
  }
  segs.sort((left, right) => left.t0 - right.t0);
  let stop = maxT;
  let normal = null;
  if (direction[1] < -1e-6) {
    const floorT = -origin[1] / direction[1];
    if (floorT >= 0 && floorT < stop) {
      stop = floorT;
      normal = [0, 1, 0];
    }
  }
  let budget = pen;
  let mult = 1;
  const layers = [];
  const holes = [];
  const touched = [];
  for (const seg of segs) {
    if (seg.t0 >= stop) {
      break;
    }
    touched.push({ box: seg.box, t: seg.t0 });
    const thick = Math.min(seg.t1, stop) - seg.t0;
    const cost = thick * (MAT_COST[seg.mat] ?? 2.5);
    if (pen <= 0 || cost > budget) {
      stop = seg.t0;
      normal = seg.normal;
      break;
    }
    budget -= cost;
    mult *= (seg.mat === 'crate' ? 0.9 : 0.75) * (1 - 0.25 * (cost / pen));
    layers.push({ t: seg.t1, mult });
    holes.push({ t: seg.t0, normal: seg.normal }, { t: seg.t1, normal: seg.exitNormal });
  }
  const at = (distance) => [
    origin[0] + direction[0] * distance,
    origin[1] + direction[1] * distance,
    origin[2] + direction[2] * distance,
  ];
  return {
    t: stop,
    point: at(stop),
    normal,
    touched,
    holes: holes
      .filter((hole) => hole.t < stop)
      .map((hole) => ({ point: at(hole.t), normal: hole.normal })),
    multAt: (distance) => {
      let multiplier = 1;
      for (const layer of layers) {
        if (layer.t <= distance) {
          multiplier = layer.mult;
        }
      }
      return multiplier;
    },
  };
}
