import { PLAYER } from '../shared/constants.js';
import { groundAt } from '../shared/map.js';

const CELL = 0.5;
const PAD = PLAYER.radius + 0.15;
const grids = new Map();

const STEP = PLAYER.step + 0.01;

function gridOf(map) {
  let grid = grids.get(map.id);
  if (grid) {
    return grid;
  }
  const columns = Math.round((map.hx * 2) / CELL);
  const rows = Math.round((map.hz * 2) / CELL);
  const blocked = new Uint8Array(columns * rows);
  const height = new Float32Array(columns * rows);
  for (let index = 0; index < columns; index++) {
    for (let innerIndex = 0; innerIndex < rows; innerIndex++) {
      const positionX = -map.hx + (index + 0.5) * CELL;
      const positionZ = -map.hz + (innerIndex + 0.5) * CELL;
      const groundHeight = groundAt(map, positionX, positionZ);
      height[index * rows + innerIndex] = groundHeight;
      for (const box of map.boxes) {
        if (box.max[1] <= groundHeight + STEP || box.min[1] > groundHeight + 1.7) {
          continue;
        }
        if (
          positionX > box.min[0] - PAD &&
          positionX < box.max[0] + PAD &&
          positionZ > box.min[2] - PAD &&
          positionZ < box.max[2] + PAD
        ) {
          blocked[index * rows + innerIndex] = 1;
          break;
        }
      }
    }
  }
  grid = {
    map,
    NX: columns,
    NZ: rows,
    blocked,
    height,
    g: new Float32Array(columns * rows),
    from: new Int32Array(columns * rows),
    seen: new Uint32Array(columns * rows),
    closed: new Uint32Array(columns * rows),
    stamp: 0,
  };
  grids.set(map.id, grid);
  return grid;
}

function nearestFree(grid, column, row) {
  const { NX: columns, NZ: rows, blocked } = grid;
  const free = (index, innerIndex) =>
    index >= 0 &&
    innerIndex >= 0 &&
    index < columns &&
    innerIndex < rows &&
    !blocked[index * rows + innerIndex];
  if (free(column, row)) {
    return [column, row];
  }
  for (let ring = 1; ring < 12; ring++) {
    for (let offsetI = -ring; offsetI <= ring; offsetI++) {
      for (const offsetJ of [-ring, ring]) {
        if (free(column + offsetI, row + offsetJ)) {
          return [column + offsetI, row + offsetJ];
        }
        if (free(column + offsetJ, row + offsetI)) {
          return [column + offsetJ, row + offsetI];
        }
      }
    }
  }
  return [column, row];
}

class Heap {
  constructor() {
    this.a = [];
  }
  push(node, score) {
    const heap = this.a;
    heap.push([score, node]);
    let index = heap.length - 1;
    while (index > 0) {
      const player = (index - 1) >> 1;
      if (heap[player][0] <= heap[index][0]) {
        break;
      }
      [heap[player], heap[index]] = [heap[index], heap[player]];
      index = player;
    }
  }
  pop() {
    const heap = this.a;
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const ring = left + 1;
        let message = index;
        if (left < heap.length && heap[left][0] < heap[message][0]) {
          message = left;
        }
        if (ring < heap.length && heap[ring][0] < heap[message][0]) {
          message = ring;
        }
        if (message === index) {
          break;
        }
        [heap[message], heap[index]] = [heap[index], heap[message]];
        index = message;
      }
    }
    return top[1];
  }
  get size() {
    return this.a.length;
  }
}

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

export function findPath(map, startX, startZ, endX, endZ) {
  const grid = gridOf(map);
  const { NX: columns, NZ: rows, blocked, height, g: groundHeight, from, seen, closed } = grid;
  const cellX = (coordinate) =>
    Math.max(0, Math.min(columns - 1, Math.floor((coordinate + map.hx) / CELL)));
  const cellZ = (coordinate) =>
    Math.max(0, Math.min(rows - 1, Math.floor((coordinate + map.hz) / CELL)));
  const [startI, startJ] = nearestFree(grid, cellX(startX), cellZ(startZ));
  const [targetI, targetJ] = nearestFree(grid, cellX(endX), cellZ(endZ));
  const start = startI * rows + startJ;
  const goal = targetI * rows + targetJ;
  const stamp = ++grid.stamp;
  const heuristic = (index, innerIndex) => {
    const deltaX = Math.abs(index - targetI);
    const deltaZ = Math.abs(innerIndex - targetJ);
    return deltaX + deltaZ + (Math.SQRT2 - 2) * Math.min(deltaX, deltaZ);
  };
  const open = new Heap();
  groundHeight[start] = 0;
  from[start] = -1;
  seen[start] = stamp;
  open.push(start, heuristic(startI, startJ));
  let found = false;
  let iter = 0;
  while (open.size && iter++ < columns * rows * 4) {
    const current = open.pop();
    if (closed[current] === stamp) {
      continue;
    }
    closed[current] = stamp;
    if (current === goal) {
      found = true;
      break;
    }
    const column = (current / rows) | 0;
    const row = current % rows;
    for (const [offsetI, offsetJ, cost] of DIRS) {
      const index = column + offsetI;
      const innerIndex = row + offsetJ;
      if (index < 0 || innerIndex < 0 || index >= columns || innerIndex >= rows) {
        continue;
      }
      const key = index * rows + innerIndex;
      if (blocked[key] || Math.abs(height[key] - height[current]) > STEP) {
        continue;
      }
      if (
        offsetI &&
        offsetJ &&
        (blocked[column * rows + innerIndex] || blocked[index * rows + row])
      ) {
        continue;
      }
      const newCost = groundHeight[current] + cost;
      if (seen[key] === stamp && newCost >= groundHeight[key]) {
        continue;
      }
      seen[key] = stamp;
      groundHeight[key] = newCost;
      from[key] = current;
      open.push(key, newCost + heuristic(index, innerIndex) * 1.5);
    }
  }
  if (!found) {
    return null;
  }
  const toX = (index) => -map.hx + (index + 0.5) * CELL;
  const toZ = (innerIndex) => -map.hz + (innerIndex + 0.5) * CELL;
  const path = [];
  for (let key = goal; key !== start && key !== -1; key = from[key]) {
    path.push([toX((key / rows) | 0), toZ(key % rows)]);
  }
  path.reverse();
  return path;
}

export function walkable(map, startX, startZ, endX, endZ) {
  const { NX: columns, NZ: rows, blocked, height } = gridOf(map);
  const cellX = (coordinate) =>
    Math.max(0, Math.min(columns - 1, Math.floor((coordinate + map.hx) / CELL)));
  const cellZ = (coordinate) =>
    Math.max(0, Math.min(rows - 1, Math.floor((coordinate + map.hz) / CELL)));
  const distance = Math.hypot(endX - startX, endZ - startZ);
  const steps = Math.ceil(distance / (CELL * 0.5));
  let last = height[cellX(startX) * rows + cellZ(startZ)];
  for (let step = 1; step <= steps; step++) {
    const score = step / steps;
    const key =
      cellX(startX + (endX - startX) * score) * rows + cellZ(startZ + (endZ - startZ) * score);
    if (blocked[key] || Math.abs(height[key] - last) > STEP) {
      return false;
    }
    last = height[key];
  }
  return true;
}
