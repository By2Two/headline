import { HALF, N, CELL, TERRAIN } from '../../../shared/warfare/terrain.js';

const MIP = 4;
const MIPPED_SIZE = Math.ceil((N - 1) / MIP);
let MIN_H;
let lodTerrain;
function refreshHeights() {
  if (lodTerrain === TERRAIN) {
    return;
  }
  lodTerrain = TERRAIN;
  MIN_H = (() => {
    const out = new Float32Array(MIPPED_SIZE * MIPPED_SIZE);
    const heights = TERRAIN.H;
    for (let innerIndex = 0; innerIndex < MIPPED_SIZE; innerIndex++) {
      for (let index = 0; index < MIPPED_SIZE; index++) {
        let lowest = Infinity;
        for (let rowOffset = 0; rowOffset <= MIP; rowOffset++) {
          for (let columnOffset = 0; columnOffset <= MIP; columnOffset++) {
            const gridX = Math.min(N - 1, index * MIP + columnOffset);
            const gridZ = Math.min(N - 1, innerIndex * MIP + rowOffset);
            lowest = Math.min(lowest, heights[gridZ * N + gridX]);
          }
        }
        out[innerIndex * MIPPED_SIZE + index] = lowest;
      }
    }
    return out;
  })();
}
const MIPPED_CELL = CELL * MIP;
function minHeight(positionX, positionZ) {
  const index = Math.floor((positionX + HALF) / MIPPED_CELL);
  const innerIndex = Math.floor((positionZ + HALF) / MIPPED_CELL);
  if (index < 0 || innerIndex < 0 || index >= MIPPED_SIZE || innerIndex >= MIPPED_SIZE) {
    return -Infinity;
  }
  return MIN_H[innerIndex * MIPPED_SIZE + index];
}
function clearLos(eyeX, eyeY, eyeZ, targetX, targetY, targetZ) {
  const deltaX = targetX - eyeX;
  const deltaY = targetY - eyeY;
  const deltaZ = targetZ - eyeZ;
  const length = Math.hypot(deltaX, deltaZ);
  const steps = Math.ceil(length / MIPPED_CELL);
  for (let step = 1; step < steps; step++) {
    const fraction = step / steps;
    if (
      minHeight(eyeX + deltaX * fraction, eyeZ + deltaZ * fraction) >
      eyeY + deltaY * fraction + 1
    ) {
      return false;
    }
  }
  return true;
}

const NEAR_ALWAYS = 200;

export class WorldLod {
  constructor() {
    refreshHeights();
    this.items = [];
    this.i = 0;
    this.lastCam = null;
  }

  add(item) {
    item.level = -1;
    item.vis = true;
    this.items.push(item);
    return item;
  }

  update(cam, zoomFactor = 1, budget = 24) {
    const its = this.items;
    if (!its.length) {
      return;
    }
    const lastCamera = this.lastCam;
    const moved = lastCamera ? Math.hypot(cam.x - lastCamera[0], cam.z - lastCamera[2]) : Infinity;
    let steps =
      moved > 60
        ? its.length
        : moved > 15
          ? Math.min(its.length, budget * 3)
          : Math.min(its.length, budget);
    if (moved > 15) {
      this.lastCam = [cam.x, cam.y, cam.z];
    }
    if (!lastCamera) {
      this.lastCam = [cam.x, cam.y, cam.z];
    }
    while (steps-- > 0) {
      const item = its[this.i];
      this.i = (this.i + 1) % its.length;
      this.eval(item, cam, zoomFactor);
    }
  }

  eval(item, cam, zoomFactor) {
    const rowOffset = item.box;
    const closestX = Math.max(rowOffset[0], Math.min(cam.x, rowOffset[3]));
    const closestZ = Math.max(rowOffset[2], Math.min(cam.z, rowOffset[5]));
    const distance = Math.hypot(closestX - cam.x, closestZ - cam.z);
    const effectiveDistance = distance * zoomFactor;
    let level = 0;
    while (level < item.levels.length && effectiveDistance > item.levels[level]) {
      level++;
    }
    let visible = true;
    if (item.occ && distance > NEAR_ALWAYS) {
      const top = rowOffset[4] + 2;
      const middleX = (rowOffset[0] + rowOffset[3]) / 2;
      const middleZ = (rowOffset[2] + rowOffset[5]) / 2;
      visible =
        clearLos(cam.x, cam.y, cam.z, middleX, top, middleZ) ||
        clearLos(cam.x, cam.y, cam.z, rowOffset[0], top, rowOffset[2]) ||
        clearLos(cam.x, cam.y, cam.z, rowOffset[3], top, rowOffset[2]) ||
        clearLos(cam.x, cam.y, cam.z, rowOffset[0], top, rowOffset[5]) ||
        clearLos(cam.x, cam.y, cam.z, rowOffset[3], top, rowOffset[5]);
    }
    if (level !== item.level || visible !== item.vis) {
      item.level = level;
      item.vis = visible;
      item.apply(level, visible);
    }
  }

  refresh(cam, zoomFactor = 1) {
    for (const item of this.items) {
      item.level = -1;
      this.eval(item, cam, zoomFactor);
    }
  }

  stats() {
    let visible = 0;
    for (const item of this.items) {
      if (item.vis) {
        visible++;
      }
    }
    return { items: this.items.length, visible: visible };
  }
}
