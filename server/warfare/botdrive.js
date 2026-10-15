import { VEHICLES } from '../../shared/warfare/config.js';
import { TERRAIN, heightAt, waterAt } from '../../shared/warfare/terrain.js';
import { MAPDATA, rayWorld } from '../../shared/warfare/world.js';
import { roadPath } from './roads.js';

const CAR_LOOKAHEAD_M = 4;
const CAR_LOOKAHEAD_GAIN = 0.5;
const TANK_LOOKAHEAD_M = 3;
const TANK_LOOKAHEAD_GAIN = 1;
const FUTURE_LOOKAHEAD_GAIN = 3;
const WAYPOINT_DONE_M = 2.5;
const PROJECTED_DONE_M = 0.2;
const CRUISE_FRACTION = 0.6;
const CORNER_SPEED_MIN = 0.15;
const REVERSE_SPEED = 7;
const ARRIVE_M = 12;
const ARRIVE_SLOW_M = 50;
const ARRIVE_SLOW_SPEED = 6;
const OFF_ROUTE_M = 24;
const REPATH_MS = 8000;
const RESYNC_MS = 1000;
const LANE_M = 2.2;
const WIDE_LANE_M = 0.6;
const BRIDGE_LANE_M = 1.5;
const STILL_SPEED = 1.5;
const AVOID_RECHECK_MS = 1000;
const DETOUR_LAST_STEP_M = 5;
const SENSOR_TIME_S = 1;
const SENSOR_MIN_M = 3;
const BLOCKER_WAIT_MS = 1500;
const DIRECTION_HYSTERESIS = 0.3;
const DIRECTION_CLEAR_AHEAD = 0.7;
const DIRECTION_COMMIT_MS = 1800;
const DRIVE_PATHING_PAD_M = 0.8;
const FOOT_PATHING_RADIUS_M = 0.8;

const distance = (startX, startZ, endX, endZ) => Math.hypot(startX - endX, startZ - endZ);
const clamp = (positionX, minimum, maximum) => Math.max(minimum, Math.min(maximum, positionX));
const wrapAngle = (angle) => {
  const full = Math.PI * 2;
  return ((angle % full) + full) % full;
};

export function onBridge(positionX, positionZ) {
  for (const bridge of MAPDATA.bridges) {
    for (let index = 0; index < bridge.pts.length - 1; index++) {
      const [startX, startZ] = bridge.pts[index];
      const [endX, endZ] = bridge.pts[index + 1];
      const segmentX = endX - startX;
      const segmentZ = endZ - startZ;
      const fraction = clamp(
        ((positionX - startX) * segmentX + (positionZ - startZ) * segmentZ) /
          (segmentX * segmentX + segmentZ * segmentZ || 1),
        0,
        1,
      );
      if (
        Math.hypot(
          positionX - startX - segmentX * fraction,
          positionZ - startZ - segmentZ * fraction,
        ) <
        bridge.hw + 3
      ) {
        return true;
      }
    }
  }
  return false;
}

function closestOnSegment(startX, startZ, endX, endZ, pointX, pointZ) {
  const segmentX = endX - startX;
  const segmentZ = endZ - startZ;
  const fraction = clamp(
    ((pointX - startX) * segmentX + (pointZ - startZ) * segmentZ) /
      (segmentX * segmentX + segmentZ * segmentZ || 1),
    0,
    1,
  );
  return [startX + segmentX * fraction, startZ + segmentZ * fraction];
}

const groundY = (positionX, positionZ) =>
  onBridge(positionX, positionZ) ? null : heightAt(positionX, positionZ);

function stretchClear(world, from, to) {
  const fromY = groundY(from[0], from[1]);
  const toY = groundY(to[0], to[1]);
  if (fromY === null || toY === null) {
    return false;
  }
  if (
    waterAt(to[0], toY, to[1]) > 0.6 ||
    Math.abs(toY - fromY) > distance(from[0], from[1], to[0], to[1]) * 0.6
  ) {
    return false;
  }
  const deltaX = to[0] - from[0];
  const deltaY = toY - fromY;
  const deltaZ = to[1] - from[1];
  const length = Math.hypot(deltaX, deltaY, deltaZ);
  if (length < 0.01) {
    return true;
  }
  const hit = rayWorld(
    world,
    [from[0], fromY + 1, from[1]],
    [deltaX / length, deltaY / length, deltaZ / length],
    length,
    {
      noTerrain: true,
      skip: (box) => box.soft || (box.floor && !box.stair) || box.mat === 'edge',
    },
  );
  return !hit;
}

const pathClear = (world, points) =>
  points.every(
    (player, pointIndex) => pointIndex === 0 || stretchClear(world, points[pointIndex - 1], player),
  );

function vehicleObstacle(vehicle) {
  const definition = VEHICLES[vehicle.type];
  return {
    x: vehicle.x,
    z: vehicle.z,
    yaw: vehicle.yaw,
    halfLen: definition.len / 2,
    halfWid: definition.wid / 2,
  };
}
function boxObstacle(box) {
  return {
    x: (box.min[0] + box.max[0]) / 2,
    z: (box.min[2] + box.max[2]) / 2,
    yaw: 0,
    halfLen: (box.max[2] - box.min[2]) / 2,
    halfWid: (box.max[0] - box.min[0]) / 2,
  };
}
const obstacleRadius = (obstacle) => Math.hypot(obstacle.halfLen, obstacle.halfWid);

function avoidObstacle(world, path, index, origin, obstacle, pathingRadius) {
  const reach = obstacleRadius(obstacle) + pathingRadius;
  let after = -1;
  for (let pathIndex = index; pathIndex < path.length; pathIndex++) {
    if (distance(path[pathIndex][0], path[pathIndex][1], obstacle.x, obstacle.z) > reach) {
      after = pathIndex;
      break;
    }
  }
  if (after < 0) {
    return false;
  }
  const forwardX = -Math.sin(obstacle.yaw);
  const forwardZ = -Math.cos(obstacle.yaw);
  const front = obstacle.halfLen + pathingRadius;
  const side = obstacle.halfWid + pathingRadius;
  const corners = [
    [forwardX * front + forwardZ * side, forwardZ * front - forwardX * side],
    [forwardX * front - forwardZ * side, forwardZ * front + forwardX * side],
    [-forwardX * front - forwardZ * side, -forwardZ * front + forwardX * side],
    [-forwardX * front + forwardZ * side, -forwardZ * front - forwardX * side],
  ];
  const fromAngle = Math.atan2(origin[1] - obstacle.z, origin[0] - obstacle.x);
  const nextPoint = path[after];
  const toNext = wrapAngle(
    Math.atan2(nextPoint[1] - obstacle.z, nextPoint[0] - obstacle.x) - fromAngle,
  );
  const shortWay = toNext < Math.PI;
  const angles = corners.map(([cornerX, cornerZ]) =>
    wrapAngle(Math.atan2(cornerZ, cornerX) - fromAngle),
  );
  const near = [];
  const far = [];
  angles.forEach((angle, pathIndex) => (shortWay !== angle < toNext ? far : near).push(pathIndex));
  const order = (list, ascending) =>
    list
      .sort((left, right) =>
        ascending ? angles[left] - angles[right] : angles[right] - angles[left],
      )
      .map((index) => [obstacle.x + corners[index][0], obstacle.z + corners[index][1]]);
  const tryDetour = (detour) => {
    if (!detour.length) {
      return false;
    }
    const last = detour[detour.length - 1];
    const gap = distance(last[0], last[1], nextPoint[0], nextPoint[1]) || 1;
    const step = Math.min(DETOUR_LAST_STEP_M, gap) / gap;
    const exit = [
      last[0] + (nextPoint[0] - last[0]) * step,
      last[1] + (nextPoint[1] - last[1]) * step,
    ];
    return pathClear(world, [origin, ...detour, exit]);
  };
  let detour = order(near, shortWay);
  if (!tryDetour(detour)) {
    const farSorted = order(far, !shortWay);
    const extended = farSorted.length ? [...detour, farSorted[farSorted.length - 1]] : [];
    if (tryDetour(extended)) {
      detour = extended;
    } else {
      detour = order(far, !shortWay);
      if (!tryDetour(detour)) {
        return false;
      }
    }
  }
  path.splice(index, after - index, ...detour);
  return true;
}

export function avoidStillVehicles(room, path, index, origin, options) {
  const target = path[index];
  if (!target) {
    return;
  }
  let best = null;
  let bestDistance = Infinity;
  for (const obstacle of room.mil.vehicles.values()) {
    if (
      obstacle === options.self ||
      !obstacle.alive ||
      options.avoided.has(obstacle.id) ||
      Math.abs(obstacle.v || 0) > STILL_SPEED
    ) {
      continue;
    }
    if (VEHICLES[obstacle.type].kind === 'heli' && !obstacle.onGround) {
      continue;
    }
    const [closestX, closestZ] = closestOnSegment(
      origin[0],
      origin[1],
      target[0],
      target[1],
      obstacle.x,
      obstacle.z,
    );
    if (
      distance(closestX, closestZ, obstacle.x, obstacle.z) >
      obstacleRadius(vehicleObstacle(obstacle)) + options.pathingRadius
    ) {
      continue;
    }
    const currentDistance = distance(obstacle.x, obstacle.z, origin[0], origin[1]);
    if (currentDistance < bestDistance) {
      bestDistance = currentDistance;
      best = obstacle;
    }
  }
  if (best) {
    avoidObstacle(
      room.mil.world,
      path,
      index,
      origin,
      vehicleObstacle(best),
      options.pathingRadius,
    );
    options.avoided.add(best.id);
    return;
  }
  if (options.boxes) {
    avoidBoxes(room, path, index, origin, options);
  }
}

function avoidBoxes(room, path, index, origin, options) {
  const target = path[index];
  const deltaX = target[0] - origin[0];
  const deltaZ = target[1] - origin[1];
  const length = Math.hypot(deltaX, deltaZ);
  if (length < 1) {
    return;
  }
  const positionY = groundY(origin[0], origin[1]);
  const baseY = positionY === null ? (options.y ?? 0) : positionY;
  const normalX = deltaX / length;
  const normalZ = deltaZ / length;
  let nearest = null;
  for (const offset of [-options.pathingRadius, 0, options.pathingRadius]) {
    const hit = rayWorld(
      room.mil.world,
      [origin[0] + normalZ * offset, baseY + 0.8, origin[1] - normalX * offset],
      [normalX, 0, normalZ],
      length,
      {
        noTerrain: true,
        skip: (box) => box.soft || box.floor || box.bridge || box.mat === 'edge' || box.tree,
      },
    );
    if (hit?.box && (!nearest || hit.t < nearest.t)) {
      nearest = hit;
    }
  }
  if (!nearest || options.avoided.has(nearest.box)) {
    return;
  }
  options.avoided.add(nearest.box);
  avoidObstacle(
    room.mil.world,
    path,
    index,
    origin,
    boxObstacle(nearest.box),
    options.pathingRadius,
  );
}

export function avoidOnFoot(room, bot, path, index) {
  const driveState = bot.bot;
  if (driveState.footAvoidPath !== path) {
    driveState.footAvoidPath = path;
    driveState.footAvoided = new Set();
  }
  avoidStillVehicles(room, path, index, [bot.pos[0], bot.pos[2]], {
    self: null,
    avoided: driveState.footAvoided,
    pathingRadius: FOOT_PATHING_RADIUS_M,
  });
}

function roadRoute(vehicle, destination) {
  const raw = roadPath(vehicle.x, vehicle.z, destination[0], destination[1]);
  const wide = VEHICLES[vehicle.type].wid > 3;
  return raw.map((player, index) => {
    if (index === 0 || index === raw.length - 1) {
      return player;
    }
    const previous = raw[index - 1];
    const stepX = player[0] - previous[0];
    const stepZ = player[1] - previous[1];
    const length = Math.hypot(stepX, stepZ) || 1;
    const lane = onBridge(player[0], player[1]) ? BRIDGE_LANE_M : wide ? WIDE_LANE_M : LANE_M;
    return [player[0] - (stepZ / length) * lane, player[1] + (stepX / length) * lane];
  });
}

function drivePathingRadius(vehicle) {
  return VEHICLES[vehicle.type].wid / 2 + DRIVE_PATHING_PAD_M;
}

function newWaypoint(room, vehicle, route) {
  route.avoidAt = 0;
  checkAvoid(room, vehicle, route, 0);
}

function checkAvoid(room, vehicle, route, now) {
  if (now < route.avoidAt) {
    return;
  }
  route.avoidAt = now + AVOID_RECHECK_MS;
  avoidStillVehicles(room, route.points, route.index, [vehicle.x, vehicle.z], {
    self: vehicle,
    avoided: route.avoided,
    pathingRadius: drivePathingRadius(vehicle),
    boxes: true,
    y: vehicle.y,
  });
}

function nextWaypoint(room, vehicle, route) {
  route.last = route.points[route.index];
  if (route.index < route.points.length - 1) {
    route.index++;
    newWaypoint(room, vehicle, route);
  }
}

function newRoute(room, vehicle, destination, key) {
  const route = {
    key,
    points: roadRoute(vehicle, destination),
    index: 0,
    last: [vehicle.x, vehicle.z],
    syncAt: 0,
    avoided: new Set(),
  };
  newWaypoint(room, vehicle, route);
  return route;
}

function keepOnRoute(room, driveState, vehicle, destination, now) {
  const route = driveState.route;
  if (now < route.syncAt) {
    return;
  }
  route.syncAt = now + RESYNC_MS;
  const target = route.points[route.index];
  const [closestX, closestZ] = closestOnSegment(
    route.last[0],
    route.last[1],
    target[0],
    target[1],
    vehicle.x,
    vehicle.z,
  );
  if (
    distance(closestX, closestZ, vehicle.x, vehicle.z) > OFF_ROUTE_M &&
    !(driveState.rePathAt > now)
  ) {
    driveState.rePathAt = now + REPATH_MS;
    driveState.route = newRoute(room, vehicle, destination, route.key);
  }
}

function projectedTarget(room, vehicle, route, minDistance, speedGain) {
  const target = route.points[route.index];
  const stepX = target[0] - route.last[0];
  const stepZ = target[1] - route.last[1];
  const length = Math.hypot(stepX, stepZ);
  if (length < 0.01) {
    nextWaypoint(room, vehicle, route);
    return route.last;
  }
  const ahead = Math.max(minDistance, speedGain * Math.abs(vehicle.v));
  const point = closestOnSegment(
    route.last[0],
    route.last[1],
    target[0],
    target[1],
    vehicle.x + (stepX / length) * ahead,
    vehicle.z + (stepZ / length) * ahead,
  );
  if (distance(point[0], point[1], target[0], target[1]) < PROJECTED_DONE_M) {
    nextWaypoint(room, vehicle, route);
  }
  return point;
}

function futureTarget(vehicle, route) {
  const target = route.points[route.index];
  const next = route.points[route.index + 1];
  if (!next) {
    return target;
  }
  const ahead = Math.max(CAR_LOOKAHEAD_M, FUTURE_LOOKAHEAD_GAIN * Math.abs(vehicle.v));
  const extra = Math.max(0, ahead - distance(target[0], target[1], vehicle.x, vehicle.z));
  const stepX = next[0] - target[0];
  const stepZ = next[1] - target[1];
  const length = Math.hypot(stepX, stepZ) || 1;
  return [target[0] + (stepX / length) * extra, target[1] + (stepZ / length) * extra];
}

function senseAhead(room, bot, vehicle) {
  const definition = VEHICLES[vehicle.type];
  const forwardX = -Math.sin(vehicle.yaw);
  const forwardZ = -Math.cos(vehicle.yaw);
  const reach = definition.len / 2 + Math.max(SENSOR_MIN_M, Math.abs(vehicle.v) * SENSOR_TIME_S);
  const halfWidth = definition.wid / 2 + 0.3;
  const inBox = (positionX, positionZ, pad) => {
    const rotationX = positionX - vehicle.x;
    const rotationZ = positionZ - vehicle.z;
    const along = rotationX * forwardX + rotationZ * forwardZ;
    const across = rotationX * forwardZ - rotationZ * forwardX;
    return along > 0 && along < reach + pad && Math.abs(across) < halfWidth + pad ? across : null;
  };
  for (const other of room.players.values()) {
    if (!other.alive || other.veh || other.team !== bot.team || other.downed) {
      continue;
    }
    const across = inBox(other.pos[0], other.pos[2], 0);
    if (across !== null) {
      return { kind: 'friend', across };
    }
  }
  let leader = null;
  for (const obstacle of room.mil.vehicles.values()) {
    if (obstacle === vehicle || !obstacle.alive || Math.abs(obstacle.v || 0) <= STILL_SPEED) {
      continue;
    }
    const across = inBox(obstacle.x, obstacle.z, VEHICLES[obstacle.type].wid / 2);
    if (across === null) {
      continue;
    }
    const sameWay = Math.cos(obstacle.yaw - vehicle.yaw) > 0.5;
    if (!sameWay) {
      return { kind: 'oncoming', across };
    }
    if (!leader || Math.abs(obstacle.v) < Math.abs(leader.v)) {
      leader = obstacle;
    }
  }
  return leader ? { kind: 'leader', speed: Math.abs(leader.v) } : null;
}

function turningRadius(definition) {
  return definition.tracks ? 0 : definition.wheelbase / Math.tan(definition.steer);
}

function canTurnTowards(vehicle, deltaX, deltaZ) {
  const length = Math.hypot(deltaX, deltaZ);
  if (length < 4) {
    return true;
  }
  const forwardX = -Math.sin(vehicle.yaw);
  const forwardZ = -Math.cos(vehicle.yaw);
  const cross = Math.abs((deltaX / length) * forwardZ - (deltaZ / length) * forwardX);
  return length > 2 * turningRadius(VEHICLES[vehicle.type]) * cross + 1;
}

function blockerInput(vehicle, blocker, driveState, now) {
  const away = blocker.across > 0 ? -0.3 : 0.3;
  if (vehicle.v > 0.1) {
    driveState.blockedSince = driveState.blockedSince || now;
    return { thr: -1, steer: away, brake: false };
  }
  driveState.blockedSince = driveState.blockedSince || now;
  if (now - driveState.blockedSince < BLOCKER_WAIT_MS) {
    return { thr: 0, steer: 0, brake: true };
  }
  return { thr: 0.4, steer: away, brake: false };
}

function carInput(room, vehicle, route, driveState, now, slowNear) {
  const definition = VEHICLES[vehicle.type];
  const reversing = driveState.reverseUntil > now;
  const point = projectedTarget(room, vehicle, route, CAR_LOOKAHEAD_M, CAR_LOOKAHEAD_GAIN);
  const future = futureTarget(vehicle, route);
  const deltaX = point[0] - vehicle.x;
  const deltaZ = point[1] - vehicle.z;
  const length = Math.hypot(deltaX, deltaZ) || 1;
  const futureDeltaX = future[0] - vehicle.x;
  const futureDeltaZ = future[1] - vehicle.z;
  const futureLength = Math.hypot(futureDeltaX, futureDeltaZ) || 1;
  const bend = clamp(
    (futureDeltaX * deltaX + futureDeltaZ * deltaZ) / (futureLength * length),
    0,
    1,
  );
  const cruise = definition.vmax * CRUISE_FRACTION;
  let wanted = reversing
    ? REVERSE_SPEED
    : cruise * (CORNER_SPEED_MIN + (1 - CORNER_SPEED_MIN) * bend ** 3);
  wanted = Math.min(wanted, slowNear);
  const speed = Math.abs(vehicle.v);
  let throttle = clamp(wanted - speed, 0, 1);
  if (speed > 1.1 * wanted) {
    throttle = -1;
  }
  const rotationX = Math.cos(vehicle.yaw);
  const rotationZ = -Math.sin(vehicle.yaw);
  const forwardX = -Math.sin(vehicle.yaw);
  const forwardZ = -Math.cos(vehicle.yaw);
  const localX = deltaX * rotationX + deltaZ * rotationZ;
  const localZ = deltaX * forwardX + deltaZ * forwardZ;
  const ahead = localZ / length;
  let direction = driveState.driveDir || 1;
  if (ahead > DIRECTION_CLEAR_AHEAD) {
    direction = 1;
  } else if (now >= (driveState.driveDirUntil || 0)) {
    if (!canTurnTowards(vehicle, deltaX, deltaZ) !== reversing) {
      direction = 1;
    } else if (Math.abs(ahead) > DIRECTION_HYSTERESIS) {
      direction = Math.sign(ahead);
    }
  }
  if (direction !== driveState.driveDir) {
    driveState.driveDir = direction;
    driveState.driveDirUntil = now + DIRECTION_COMMIT_MS;
  }
  let throttleInput = clamp(direction * throttle, -1, 0.8);
  let steer = clamp((localX * 5) / (1 + speed), -1, 1);
  if (reversing) {
    throttleInput = -0.7;
  }
  if (direction < 0 || reversing) {
    steer = -steer;
  }
  const facing = Math.abs(localZ / length);
  steer *= 1 - 0.5 * facing;
  throttleInput *= 0.5 + 0.5 * facing;
  return { thr: throttleInput, steer, brake: false, boost: true };
}

function tankInput(room, vehicle, route, driveState, now, slowNear) {
  const point = projectedTarget(room, vehicle, route, TANK_LOOKAHEAD_M, TANK_LOOKAHEAD_GAIN);
  const deltaX = point[0] - vehicle.x;
  const deltaZ = point[1] - vehicle.z;
  const localX = deltaX * Math.cos(vehicle.yaw) - deltaZ * Math.sin(vehicle.yaw);
  const localZ = -deltaX * Math.sin(vehicle.yaw) - deltaZ * Math.cos(vehicle.yaw);
  const ahead = Math.abs(localZ) > Math.abs(localX);
  const target = route.points[route.index];
  if (
    driveState.reverseUntil > now &&
    ahead &&
    distance(target[0], target[1], vehicle.x, vehicle.z) > WAYPOINT_DONE_M
  ) {
    return { thr: -Math.sign(localZ) * 0.5, steer: 0, brake: false, boost: true };
  }
  let throttleInput = ahead ? Math.sign(localZ) : 0;
  if (Math.abs(vehicle.v) > slowNear) {
    throttleInput = 0;
  }
  const steer = clamp(localX, -1, 1) * (vehicle.v < -0.3 ? -1 : 1);
  return { thr: throttleInput, steer, brake: false, boost: true };
}

export function drive(room, bot, vehicle, destination, now, arriveM = ARRIVE_M) {
  const driveState = bot.bot;
  const key = `${Math.round(destination[0])},${Math.round(destination[1])}`;
  if (!driveState.route || driveState.route.key !== key) {
    driveState.route = newRoute(room, vehicle, destination, key);
  }
  const toEnd = distance(vehicle.x, vehicle.z, destination[0], destination[1]);
  if (toEnd < arriveM) {
    vehicle.botInput = { thr: 0, steer: 0, brake: true };
    return Math.abs(vehicle.v) < 0.8;
  }
  if (toEnd < 30 && (vehicle.stuckWatch?.events.length ?? 0) > 0) {
    vehicle.botInput = { thr: 0, steer: 0, brake: true };
    return Math.abs(vehicle.v) < 0.8;
  }
  keepOnRoute(room, driveState, vehicle, destination, now);
  const route = driveState.route;
  let target = route.points[route.index];
  while (
    route.index < route.points.length - 1 &&
    distance(target[0], target[1], vehicle.x, vehicle.z) < WAYPOINT_DONE_M
  ) {
    nextWaypoint(room, vehicle, route);
    target = route.points[route.index];
  }
  checkAvoid(room, vehicle, route, now);
  const blocker = senseAhead(room, bot, vehicle);
  if (blocker && (blocker.kind === 'friend' || blocker.kind === 'oncoming')) {
    vehicle.botInput = blockerInput(vehicle, blocker, driveState, now);
    return false;
  }
  driveState.blockedSince = 0;
  let slowNear = toEnd < ARRIVE_SLOW_M ? ARRIVE_SLOW_SPEED : Infinity;
  if (blocker?.kind === 'leader') {
    slowNear = Math.min(slowNear, Math.max(0, blocker.speed - 0.5));
  }
  const definition = VEHICLES[vehicle.type];
  vehicle.botInput = definition.tracks
    ? tankInput(room, vehicle, route, driveState, now, slowNear)
    : carInput(room, vehicle, route, driveState, now, slowNear);
  return false;
}

const PARKING = new Map();
export function parkingSpot(room, positionX, positionZ) {
  const key = `${Math.round(positionX)},${Math.round(positionZ)}`;
  if (PARKING.has(key)) {
    return PARKING.get(key);
  }
  let best = [positionX, positionZ];
  let bestScore = -Infinity;
  for (let index = 0; index < 12; index++) {
    const angle = (index / 12) * Math.PI * 2;
    for (const radius of [14, 20]) {
      const spot = [positionX + Math.cos(angle) * radius, positionZ + Math.sin(angle) * radius];
      if (!stretchClear(room.mil.world, [positionX, positionZ], spot)) {
        continue;
      }
      let roadGap = Infinity;
      for (const road of TERRAIN.roads) {
        for (const player of road.pts) {
          roadGap = Math.min(roadGap, distance(player[0], player[1], spot[0], spot[1]));
        }
      }
      const score = Math.min(roadGap, 15) - radius * 0.2;
      if (score > bestScore) {
        bestScore = score;
        best = spot;
      }
    }
  }
  PARKING.set(key, best);
  return best;
}
