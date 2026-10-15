import { ACTIVE_MAP, HALF, heightAt, waterAt } from '../../shared/milsim/terrain.js';
import { MAPDATA } from '../../shared/milsim/world.js';

const CELL_M = 4;
const MAX_GRADE = 0.85;
const SLOPE_COST = 6;
const DEEP_WATER_M = 0.6;
const WALL_MIN_HEIGHT_M = 1.3;
const SEARCH_NODE_LIMIT = 90000;
const HEURISTIC_WEIGHT = 1.5;
const BLOCKED = 0;

const cache = new Map();

function build() {
  const size = Math.ceil((HALF * 2) / CELL_M);
  const heights = new Float32Array((size + 1) * (size + 1));
  for (let innerIndex = 0; innerIndex <= size; innerIndex++) {
    for (let index = 0; index <= size; index++) {
      heights[innerIndex * (size + 1) + index] = heightAt(
        -HALF + index * CELL_M,
        -HALF + innerIndex * CELL_M,
      );
    }
  }
  const corner = (index, innerIndex) => heights[innerIndex * (size + 1) + index];
  const cost = new Float32Array(size * size);
  for (let innerIndex = 0; innerIndex < size; innerIndex++) {
    for (let index = 0; index < size; index++) {
      const h00 = corner(index, innerIndex);
      const h10 = corner(index + 1, innerIndex);
      const h01 = corner(index, innerIndex + 1);
      const h11 = corner(index + 1, innerIndex + 1);
      const grade =
        Math.max(
          Math.abs(h10 - h00),
          Math.abs(h11 - h01),
          Math.abs(h01 - h00),
          Math.abs(h11 - h10),
        ) / CELL_M;
      const positionX = -HALF + (index + 0.5) * CELL_M;
      const positionZ = -HALF + (innerIndex + 0.5) * CELL_M;
      const ground = (h00 + h10 + h01 + h11) / 4;
      if (grade > MAX_GRADE || waterAt(positionX, ground, positionZ) > DEEP_WATER_M) {
        cost[innerIndex * size + index] = BLOCKED;
      } else {
        cost[innerIndex * size + index] = 1 + grade * SLOPE_COST;
      }
    }
  }
  const cellOf = (coordinate) =>
    Math.max(0, Math.min(size - 1, Math.floor((coordinate + HALF) / CELL_M)));
  for (const box of MAPDATA.boxes) {
    if (box.soft || box.floor || box.bridge || (box.door ?? null) !== null) {
      continue;
    }
    const centerX = (box.min[0] + box.max[0]) / 2;
    const centerZ = (box.min[2] + box.max[2]) / 2;
    if (box.max[1] - heightAt(centerX, centerZ) < WALL_MIN_HEIGHT_M) {
      continue;
    }
    for (
      let innerIndex = cellOf(box.min[2] + 0.5);
      innerIndex <= cellOf(box.max[2] - 0.5);
      innerIndex++
    ) {
      for (let index = cellOf(box.min[0] + 0.5); index <= cellOf(box.max[0] - 0.5); index++) {
        cost[innerIndex * size + index] = BLOCKED;
      }
    }
  }
  for (const bridge of MAPDATA.bridges) {
    for (let index = 0; index < bridge.pts.length - 1; index++) {
      const [startX, startZ] = bridge.pts[index];
      const [endX, endZ] = bridge.pts[index + 1];
      const steps = Math.ceil(Math.hypot(endX - startX, endZ - startZ) / (CELL_M / 2));
      for (let step = 0; step <= steps; step++) {
        const positionX = startX + ((endX - startX) * step) / steps;
        const positionZ = startZ + ((endZ - startZ) * step) / steps;
        const reach = Math.max(1, Math.floor((bridge.hw - 1) / CELL_M));
        for (let offsetJ = -reach; offsetJ <= reach; offsetJ++) {
          for (let offsetI = -reach; offsetI <= reach; offsetI++) {
            const index = cellOf(positionX) + offsetI;
            const innerIndex = cellOf(positionZ) + offsetJ;
            if (index >= 0 && innerIndex >= 0 && index < size && innerIndex < size) {
              cost[innerIndex * size + index] = 1;
            }
          }
        }
      }
    }
  }
  return {
    size,
    cost,
    cellOf,
    gScore: new Float32Array(size * size),
    cameFrom: new Int32Array(size * size),
    stamp: new Uint32Array(size * size),
    closedStamp: new Uint32Array(size * size),
    search: 0,
    heap: new Int32Array(size * size),
    heapScore: new Float32Array(size * size),
  };
}

export function navGrid() {
  if (!cache.has(ACTIVE_MAP)) {
    cache.set(ACTIVE_MAP, build());
  }
  return cache.get(ACTIVE_MAP);
}

const centerOf = (navigation, cell) => {
  const index = cell % navigation.size;
  const innerIndex = (cell - index) / navigation.size;
  return [-HALF + (index + 0.5) * CELL_M, -HALF + (innerIndex + 0.5) * CELL_M];
};

function nearestOpen(navigation, index, innerIndex) {
  for (let radius = 0; radius < 12; radius++) {
    for (let offsetJ = -radius; offsetJ <= radius; offsetJ++) {
      for (let offsetI = -radius; offsetI <= radius; offsetI++) {
        if (Math.max(Math.abs(offsetI), Math.abs(offsetJ)) !== radius) {
          continue;
        }
        const positionX = index + offsetI;
        const positionY = innerIndex + offsetJ;
        if (
          positionX >= 0 &&
          positionY >= 0 &&
          positionX < navigation.size &&
          positionY < navigation.size &&
          navigation.cost[positionY * navigation.size + positionX] !== BLOCKED
        ) {
          return positionY * navigation.size + positionX;
        }
      }
    }
  }
  return -1;
}

function lineOpen(navigation, from, to) {
  const size = navigation.size;
  let currentX = from % size;
  let currentY = (from - currentX) / size;
  const endX = to % size;
  const endY = (to - endX) / size;
  const deltaX = Math.abs(endX - currentX);
  const deltaY = Math.abs(endY - currentY);
  const stepX = currentX < endX ? 1 : -1;
  const stepY = currentY < endY ? 1 : -1;
  let error = deltaX - deltaY;
  const startCost = navigation.cost[from];
  for (;;) {
    const cost = navigation.cost[currentY * size + currentX];
    if (cost === BLOCKED || cost > startCost + 2.5) {
      return false;
    }
    if (currentX === endX && currentY === endY) {
      return true;
    }
    const doubleError = error * 2;
    if (doubleError > -deltaY) {
      error -= deltaY;
      currentX += stepX;
    }
    if (doubleError < deltaX) {
      error += deltaX;
      currentY += stepY;
    }
  }
}

const NEIGHBORS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

export function findPath(currentX, startZ, endX, endZ) {
  const navigation = navGrid();
  const size = navigation.size;
  let start = navigation.cellOf(startZ) * size + navigation.cellOf(currentX);
  let goal = navigation.cellOf(endZ) * size + navigation.cellOf(endX);
  if (navigation.cost[start] === BLOCKED) {
    start = nearestOpen(navigation, start % size, Math.floor(start / size));
  }
  if (navigation.cost[goal] === BLOCKED) {
    goal = nearestOpen(navigation, goal % size, Math.floor(goal / size));
  }
  if (start < 0 || goal < 0) {
    return null;
  }
  const goalX = goal % size;
  const goalZ = (goal - goalX) / size;
  const heuristic = (cell) => {
    const centerX = cell % size;
    const deltaX = Math.abs(centerX - goalX);
    const deltaY = Math.abs((cell - centerX) / size - goalZ);
    return Math.max(deltaX, deltaY) + (Math.SQRT2 - 1) * Math.min(deltaX, deltaY);
  };
  const search = ++navigation.search;
  let heapSize = 0;
  const push = (cell, score) => {
    let index = heapSize++;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (navigation.heapScore[parent] <= score) {
        break;
      }
      navigation.heap[index] = navigation.heap[parent];
      navigation.heapScore[index] = navigation.heapScore[parent];
      index = parent;
    }
    navigation.heap[index] = cell;
    navigation.heapScore[index] = score;
  };
  const pop = () => {
    const top = navigation.heap[0];
    const lastCell = navigation.heap[--heapSize];
    const lastScore = navigation.heapScore[heapSize];
    let index = 0;
    for (;;) {
      let child = index * 2 + 1;
      if (child >= heapSize) {
        break;
      }
      if (child + 1 < heapSize && navigation.heapScore[child + 1] < navigation.heapScore[child]) {
        child++;
      }
      if (navigation.heapScore[child] >= lastScore) {
        break;
      }
      navigation.heap[index] = navigation.heap[child];
      navigation.heapScore[index] = navigation.heapScore[child];
      index = child;
    }
    navigation.heap[index] = lastCell;
    navigation.heapScore[index] = lastScore;
    return top;
  };
  navigation.stamp[start] = search;
  navigation.gScore[start] = 0;
  navigation.cameFrom[start] = -1;
  push(start, heuristic(start));
  let expanded = 0;
  let found = false;
  while (heapSize > 0 && expanded < SEARCH_NODE_LIMIT) {
    const cell = pop();
    if (navigation.closedStamp[cell] === search) {
      continue;
    }
    navigation.closedStamp[cell] = search;
    if (cell === goal) {
      found = true;
      break;
    }
    expanded++;
    const centerX = cell % size;
    const cellZ = (cell - centerX) / size;
    for (const [offsetI, offsetJ, step] of NEIGHBORS) {
      const neighborX = centerX + offsetI;
      const neighborZ = cellZ + offsetJ;
      if (neighborX < 0 || neighborZ < 0 || neighborX >= size || neighborZ >= size) {
        continue;
      }
      const next = neighborZ * size + neighborX;
      const cost = navigation.cost[next];
      if (cost === BLOCKED || navigation.closedStamp[next] === search) {
        continue;
      }
      if (
        offsetI &&
        offsetJ &&
        (navigation.cost[cellZ * size + neighborX] === BLOCKED ||
          navigation.cost[neighborZ * size + centerX] === BLOCKED)
      ) {
        continue;
      }
      const currentCost = navigation.gScore[cell] + step * (cost + navigation.cost[cell]) * 0.5;
      if (navigation.stamp[next] !== search || currentCost < navigation.gScore[next]) {
        navigation.stamp[next] = search;
        navigation.gScore[next] = currentCost;
        navigation.cameFrom[next] = cell;
        push(next, currentCost + heuristic(next) * HEURISTIC_WEIGHT);
      }
    }
  }
  if (!found) {
    return null;
  }
  const cells = [];
  for (let cell = goal; cell !== -1; cell = navigation.cameFrom[cell]) {
    cells.push(cell);
  }
  cells.reverse();
  const smooth = [cells[0]];
  let anchor = 0;
  for (let index = 2; index < cells.length; index++) {
    if (!lineOpen(navigation, cells[anchor], cells[index])) {
      smooth.push(cells[index - 1]);
      anchor = index - 1;
    }
  }
  smooth.push(cells[cells.length - 1]);
  const points = smooth.slice(1).map((cell) => centerOf(navigation, cell));
  points[points.length - 1] = [endX, endZ];
  return points;
}

export function walkable(positionX, positionZ) {
  const navigation = navGrid();
  return (
    navigation.cost[
      navigation.cellOf(positionZ) * navigation.size + navigation.cellOf(positionX)
    ] !== BLOCKED
  );
}
