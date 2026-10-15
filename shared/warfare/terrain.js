import { ironHeight } from './ironpass.js';
import { IRON_PASS, FRONTIER, mapId } from './maps.js';

export const HALF = 1024;
export const CELL = 4;
export const N = (HALF * 2) / CELL + 1;

function hash2(cellX, cellZ, seed) {
  let hash =
    Math.imul(cellX, 374761393) ^ Math.imul(cellZ, 668265263) ^ Math.imul(seed, 2147483647);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}
const smooth = (progress) => progress * progress * (3 - 2 * progress);
function vnoise(positionX, positionZ, seed) {
  const cellX = Math.floor(positionX);
  const cellZ = Math.floor(positionZ);
  const fractionX = smooth(positionX - cellX);
  const fractionZ = smooth(positionZ - cellZ);
  const cornerA = hash2(cellX, cellZ, seed);
  const cornerB = hash2(cellX + 1, cellZ, seed);
  const cornerC = hash2(cellX, cellZ + 1, seed);
  const cornerD = hash2(cellX + 1, cellZ + 1, seed);
  return (
    cornerA +
    (cornerB - cornerA) * fractionX +
    (cornerC - cornerA) * fractionZ +
    (cornerA - cornerB - cornerC + cornerD) * fractionX * fractionZ
  );
}
export function fbm(positionX, positionZ, oct = 4, seed = 7) {
  let sector = 0;
  let amplitude = 0.5;
  let spline = 1;
  for (let index = 0; index < oct; index++) {
    sector += amplitude * vnoise(positionX * spline, positionZ * spline, seed + index * 31);
    spline *= 2.03;
    amplitude *= 0.5;
  }
  return sector / (1 - Math.pow(0.5, oct));
}
export function rng(seed) {
  let cornerA = seed >>> 0 || 1;
  return () => {
    cornerA = (Math.imul(cornerA, 1664525) + 1013904223) >>> 0;
    return cornerA / 4294967296;
  };
}

export let MAIN_BASES = [
  { team: 0, name: 'Main Base North', x: -60, z: -870, r: 115 },
  { team: 1, name: 'Main Base South', x: 60, z: 870, r: 115 },
];

export let SECTORS = [
  { id: 'A', name: 'Oakridge', x: -560, z: -10, r: 75, kind: 'village' },
  { id: 'B', name: 'Riverside Crossing', x: -140, z: 70, r: 85, kind: 'industrial' },
  { id: 'C', name: 'Hill 314 Comms', x: 270, z: -110, r: 65, kind: 'hill' },
  { id: 'D', name: 'Hadley Farm Outpost', x: 610, z: 70, r: 75, kind: 'outpost' },
];

export let SUPPLY_POINTS = [
  { id: 0, name: 'North Depot', x: -650, z: -520, r: 32 },
  { id: 1, name: 'South Depot', x: 650, z: 540, r: 32 },
  { id: 2, name: 'Lumber Mill', x: -720, z: 500, r: 32 },
  { id: 3, name: 'Fuel Depot', x: 720, z: -470, r: 32 },
  { id: 4, name: 'Grain Silos', x: 60, z: -300, r: 30 },
];

export let TOWNS = [
  { name: 'Kirov', x: -270, z: -440, r: 95, houses: 16 },
  { name: 'Mirna', x: 320, z: 420, r: 105, houses: 20 },
  { name: 'Oakridge', x: -560, z: -10, r: 70, houses: 10 },
  { name: 'Hadley', x: 610, z: 70, r: 45, houses: 4 },
  { name: 'Brennick', x: -330, z: 520, r: 50, houses: 6 },
  { name: 'Volsk', x: 540, z: -250, r: 45, houses: 5 },
];

let RIVER_PTS = [
  [-1120, -260],
  [-880, -205],
  [-700, -165],
  [-560, -128],
  [-400, -55],
  [-250, 25],
  [-140, 62],
  [-20, 95],
  [120, 128],
  [280, 160],
  [440, 205],
  [600, 245],
  [780, 300],
  [920, 360],
  [1120, 400],
];
export let RIVER_HALF_W = 11;
let RIVER_BANK = 26;

export let ROADS = [
  {
    kind: 'asphalt',
    name: 'MSR Hammer',
    pts: [
      [-60, -800],
      [-70, -700],
      [-140, -600],
      [-240, -500],
      [-270, -440],
      [-250, -330],
      [-190, -200],
      [-160, -60],
      [-140, 62],
      [-100, 180],
      [-20, 300],
      [120, 380],
      [260, 410],
      [320, 420],
      [300, 520],
      [200, 640],
      [90, 740],
      [60, 800],
    ],
  },
  {
    kind: 'asphalt',
    name: 'East Route',
    pts: [
      [-20, -800],
      [120, -760],
      [320, -700],
      [520, -600],
      [690, -500],
      [720, -470],
      [700, -330],
      [620, -180],
      [610, 70],
      [620, 160],
      [640, 245],
      [660, 380],
      [650, 540],
      [520, 640],
      [330, 730],
      [140, 800],
      [60, 800],
    ],
  },
  {
    kind: 'dirt',
    name: 'West Track',
    pts: [
      [-100, -800],
      [-300, -760],
      [-500, -660],
      [-650, -520],
      [-660, -380],
      [-600, -240],
      [-562, -128],
      [-560, -10],
      [-610, 140],
      [-680, 320],
      [-720, 500],
      [-560, 640],
      [-330, 740],
      [-120, 800],
      [20, 820],
    ],
  },
  {
    kind: 'dirt',
    name: 'Kirov - North Depot',
    pts: [
      [-270, -440],
      [-420, -470],
      [-560, -500],
      [-650, -520],
    ],
  },
  {
    kind: 'dirt',
    name: 'Oakridge - Riverside',
    pts: [
      [-560, -10],
      [-450, 40],
      [-320, 80],
      [-210, 92],
      [-150, 105],
    ],
  },
  {
    kind: 'dirt',
    name: 'Riverside - Hill 314',
    pts: [
      [-160, -60],
      [-20, -90],
      [120, -110],
      [270, -110],
    ],
  },
  {
    kind: 'dirt',
    name: 'Hill 314 - Hadley',
    pts: [
      [270, -110],
      [400, -40],
      [520, 30],
      [610, 70],
    ],
  },
  {
    kind: 'dirt',
    name: 'Silos road',
    pts: [
      [-190, -200],
      [-60, -260],
      [60, -300],
      [200, -330],
      [380, -300],
      [540, -250],
      [700, -330],
    ],
  },
  {
    kind: 'dirt',
    name: 'Mirna - South Depot',
    pts: [
      [320, 420],
      [460, 470],
      [560, 520],
      [650, 540],
    ],
  },
  {
    kind: 'dirt',
    name: 'Brennick road',
    pts: [
      [-100, 180],
      [-220, 340],
      [-330, 520],
      [-480, 600],
      [-560, 640],
    ],
  },
  {
    kind: 'dirt',
    name: 'Volsk lane',
    pts: [
      [540, -250],
      [560, -120],
      [610, 70],
    ],
  },
];

export let FIELDS = [
  [380, 280, 520, 360],
  [180, 470, 290, 600],
  [400, 470, 520, 560],
  [520, -20, 700, 30],
  [650, 100, 760, 200],
  [-480, -120, -380, -40],
  [-720, -80, -620, 60],
  [-460, 100, -360, 200],
  [-200, 420, -80, 560],
  [-80, -380, 40, -320],
  [100, -420, 220, -340],
];

function subdivide(points, step = 12) {
  const out = [];
  const pointAt = (clampedIndex) => points[Math.max(0, Math.min(points.length - 1, clampedIndex))];
  for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex++) {
    const previousPoint = pointAt(pointIndex - 1);
    const startPoint = pointAt(pointIndex);
    const endPoint = pointAt(pointIndex + 1);
    const nextPoint = pointAt(pointIndex + 2);
    const length = Math.hypot(endPoint[0] - startPoint[0], endPoint[1] - startPoint[1]);
    const count = Math.max(1, Math.ceil(length / step));
    for (let sampleIndex = 0; sampleIndex < count; sampleIndex++) {
      const progress = sampleIndex / count;
      const squaredT = progress * progress;
      const cubedT = squaredT * progress;
      const spline = (cornerA, cornerB, cornerC, cornerD) =>
        0.5 *
        (2 * cornerB +
          (-cornerA + cornerC) * progress +
          (2 * cornerA - 5 * cornerB + 4 * cornerC - cornerD) * squaredT +
          (-cornerA + 3 * cornerB - 3 * cornerC + cornerD) * cubedT);
      out.push([
        spline(previousPoint[0], startPoint[0], endPoint[0], nextPoint[0]),
        spline(previousPoint[1], startPoint[1], endPoint[1], nextPoint[1]),
      ]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function segDist(pointX, pointZ, startX, startZ, endX, endZ) {
  const deltaX = endX - startX;
  const deltaZ = endZ - startZ;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ || 1;
  const progress = Math.max(
    0,
    Math.min(1, ((pointX - startX) * deltaX + (pointZ - startZ) * deltaZ) / lengthSquared),
  );
  const closestX = startX + deltaX * progress;
  const closestZ = startZ + deltaZ * progress;
  return [Math.hypot(pointX - closestX, pointZ - closestZ), progress];
}

const gauss = (positionX, positionZ, centerX, centerZ, radius) =>
  Math.exp(-((positionX - centerX) ** 2 + (positionZ - centerZ) ** 2) / (radius * radius));
function frontierHeight(positionX, positionZ) {
  let height = 30 + 22 * fbm(positionX / 480 + 5, positionZ / 480 + 9, 5, 5);
  height += 6 * (fbm(positionX / 110, positionZ / 110, 3, 23) - 0.5);
  const ridged = (sector) =>
    1 - Math.abs(2 * fbm(positionX / sector, positionZ / sector, 4, 47) - 1);
  height += 125 * gauss(positionX, positionZ, -900, -300, 320) * (0.55 + 0.6 * ridged(160));
  height += 110 * gauss(positionX, positionZ, 930, 520, 300) * (0.55 + 0.6 * ridged(150));
  height += 95 * gauss(positionX, positionZ, 900, -720, 260) * (0.55 + 0.6 * ridged(150));
  height += 105 * gauss(positionX, positionZ, -880, 780, 280) * (0.55 + 0.6 * ridged(160));
  height += 58 * gauss(positionX, positionZ, -410, 400, 150);
  height += 26 * gauss(positionX, positionZ, 220, -250, 110);
  height += 20 * gauss(positionX, positionZ, -250, -150, 120);
  height += 22 * gauss(positionX, positionZ, 330, 620, 120);
  height -= 10 * gauss(positionX, positionZ, 0, 40, 480);
  const edge = Math.max(Math.abs(positionX), Math.abs(positionZ));
  if (edge > HALF - 120) {
    height += ((edge - (HALF - 120)) / 120) ** 2 * 70;
  }
  return height;
}

function baseHeight(positionX, positionZ) {
  if (ACTIVE_MAP === 'ironpass') {
    return ironHeight(positionX, positionZ, fbm, HALF);
  }
  if (ACTIVE_MAP === 'frontier') {
    return frontierHeight(positionX, positionZ);
  }
  let height = 28 + 26 * fbm(positionX / 520 + 11, positionZ / 520 + 3, 5, 3);
  height += 7 * (fbm(positionX / 120, positionZ / 120, 3, 19) - 0.5);
  const ridged = (sector) =>
    1 - Math.abs(2 * fbm(positionX / sector, positionZ / sector, 4, 41) - 1);
  height += 165 * gauss(positionX, positionZ, -800, -790, 300) * (0.55 + 0.6 * ridged(170));
  height += 140 * gauss(positionX, positionZ, 820, -760, 280) * (0.55 + 0.6 * ridged(150));
  height += 150 * gauss(positionX, positionZ, -800, 790, 290) * (0.55 + 0.6 * ridged(160));
  height += 130 * gauss(positionX, positionZ, 800, 820, 270) * (0.55 + 0.6 * ridged(150));
  height += 75 * gauss(positionX, positionZ, -820, 120, 200) * (0.6 + 0.5 * ridged(130));
  height += 70 * gauss(positionX, positionZ, 900, -60, 190) * (0.6 + 0.5 * ridged(130));
  height += 44 * gauss(positionX, positionZ, 270, -110, 135);
  height += 26 * gauss(positionX, positionZ, -420, -300, 120);
  height += 30 * gauss(positionX, positionZ, 420, 250, 110);
  height += 22 * gauss(positionX, positionZ, -360, 300, 120);
  height += 24 * gauss(positionX, positionZ, 120, -520, 130);
  height -= 12 * gauss(positionX, positionZ, 0, 80, 520);
  const edge = Math.max(Math.abs(positionX), Math.abs(positionZ));
  if (edge > HALF - 120) {
    height += ((edge - (HALF - 120)) / 120) ** 2 * 70;
  }
  return height;
}

const SURF = {
  grass: 0,
  field: 1,
  forest: 2,
  rock: 3,
  sand: 4,
  water: 5,
  dirt: 6,
  asphalt: 7,
  concrete: 8,
};
export { SURF };
export const SURF_NAMES = Object.keys(SURF);

function generate() {
  const high = new Float32Array(N * N);
  const surf = new Uint8Array(N * N);
  const water = new Float32Array(N * N).fill(-1e9);
  const gridIndex = (index, innerIndex) => innerIndex * N + index;
  const worldX = (index) => -HALF + index * CELL;
  const toGridIndex = (positionX) => Math.round((positionX + HALF) / CELL);
  for (let innerIndex = 0; innerIndex < N; innerIndex++) {
    for (let index = 0; index < N; index++) {
      high[gridIndex(index, innerIndex)] = baseHeight(worldX(index), worldX(innerIndex));
    }
  }
  const sample = (positionX, positionZ) => {
    const fractionX = Math.max(0, Math.min(N - 1.001, (positionX + HALF) / CELL));
    const fractionZ = Math.max(0, Math.min(N - 1.001, (positionZ + HALF) / CELL));
    const index = Math.floor(fractionX);
    const innerIndex = Math.floor(fractionZ);
    const fraction = fractionX - index;
    const blendZ = fractionZ - innerIndex;
    const cornerA = high[gridIndex(index, innerIndex)];
    const cornerB = high[gridIndex(index + 1, innerIndex)];
    const cornerC = high[gridIndex(index, innerIndex + 1)];
    const cornerD = high[gridIndex(index + 1, innerIndex + 1)];
    return (
      cornerA +
      (cornerB - cornerA) * fraction +
      (cornerC - cornerA) * blendZ +
      (cornerA - cornerB - cornerC + cornerD) * fraction * blendZ
    );
  };

  const river = subdivide(RIVER_PTS, 10);
  const riverLengths = [0];
  for (let pointIndex = 1; pointIndex < river.length; pointIndex++) {
    riverLengths.push(
      riverLengths[pointIndex - 1] +
        Math.hypot(
          river[pointIndex][0] - river[pointIndex - 1][0],
          river[pointIndex][1] - river[pointIndex - 1][1],
        ),
    );
  }
  let waterLevels = river.map(([positionX, positionZ]) => sample(positionX, positionZ) - 3);
  for (let pass = 0; pass < 6; pass++) {
    waterLevels = waterLevels.map(
      (fractionZ, pointIndex) =>
        (waterLevels[Math.max(0, pointIndex - 2)] +
          waterLevels[Math.max(0, pointIndex - 1)] +
          fractionZ +
          waterLevels[Math.min(waterLevels.length - 1, pointIndex + 1)] +
          waterLevels[Math.min(waterLevels.length - 1, pointIndex + 2)]) /
        5,
    );
  }
  for (let pointIndex = 1; pointIndex < waterLevels.length; pointIndex++) {
    waterLevels[pointIndex] = Math.min(waterLevels[pointIndex], waterLevels[pointIndex - 1] - 0.01);
  }
  const rDist = new Float32Array(N * N).fill(1e9);
  const riverWaterLevels = new Float32Array(N * N);
  const reach = RIVER_BANK + 8;
  for (let pointIndex = 0; pointIndex < river.length - 1; pointIndex++) {
    const [startX, startZ] = river[pointIndex];
    const [endX, endZ] = river[pointIndex + 1];
    const minI = Math.max(0, toGridIndex(Math.min(startX, endX) - reach));
    const maxI = Math.min(N - 1, toGridIndex(Math.max(startX, endX) + reach));
    const minJ = Math.max(0, toGridIndex(Math.min(startZ, endZ) - reach));
    const maxJ = Math.min(N - 1, toGridIndex(Math.max(startZ, endZ) + reach));
    for (let innerIndex = minJ; innerIndex <= maxJ; innerIndex++) {
      for (let index = minI; index <= maxI; index++) {
        const [cornerD, progress] = segDist(
          worldX(index),
          worldX(innerIndex),
          startX,
          startZ,
          endX,
          endZ,
        );
        const id = gridIndex(index, innerIndex);
        if (cornerD < rDist[id]) {
          rDist[id] = cornerD;
          riverWaterLevels[id] =
            waterLevels[pointIndex] +
            (waterLevels[pointIndex + 1] - waterLevels[pointIndex]) * progress;
        }
      }
    }
  }
  for (let id = 0; id < N * N; id++) {
    const cornerD = rDist[id];
    if (cornerD > reach) {
      continue;
    }
    const width = riverWaterLevels[id];
    if (cornerD < RIVER_HALF_W + 1.5) {
      const depth = 2.6 * (1 - (cornerD / (RIVER_HALF_W + 1.5)) ** 2) + 0.4;
      high[id] = Math.min(high[id], width - depth);
      water[id] = width;
    } else if (cornerD < RIVER_BANK) {
      const pointIndex = (cornerD - RIVER_HALF_W - 1.5) / (RIVER_BANK - RIVER_HALF_W - 1.5);
      const bank = width + 0.2 + pointIndex * pointIndex * 4;
      high[id] = Math.min(high[id], bank);
      if (high[id] < width + 0.05) {
        water[id] = width;
      }
    }
  }

  const plateau = (centerX, centerZ, radius, blend, strength = 1) => {
    let sector = 0;
    let count = 0;
    for (let cornerA = 0; cornerA < 16; cornerA++) {
      const angle = (cornerA / 16) * Math.PI * 2;
      for (const ringRadius of [0, radius * 0.5, radius]) {
        sector += sample(
          centerX + Math.cos(angle) * ringRadius,
          centerZ + Math.sin(angle) * ringRadius,
        );
        count++;
      }
    }
    const target = sector / count;
    const outerRadius = radius + blend;
    for (
      let innerIndex = Math.max(0, toGridIndex(centerZ - outerRadius));
      innerIndex <= Math.min(N - 1, toGridIndex(centerZ + outerRadius));
      innerIndex++
    ) {
      for (
        let index = Math.max(0, toGridIndex(centerX - outerRadius));
        index <= Math.min(N - 1, toGridIndex(centerX + outerRadius));
        index++
      ) {
        const cornerD = Math.hypot(worldX(index) - centerX, worldX(innerIndex) - centerZ);
        if (cornerD > outerRadius) {
          continue;
        }
        const id = gridIndex(index, innerIndex);
        if (rDist[id] < RIVER_BANK) {
          continue;
        }
        const falloff = cornerD < radius ? 1 : 1 - smooth((cornerD - radius) / blend);
        high[id] += (target - high[id]) * falloff * strength;
      }
    }
    return target;
  };
  const plateaus = {};
  const isIronPass = ACTIVE_MAP === 'ironpass';
  for (const cornerB of MAIN_BASES) {
    plateaus[`base${cornerB.team}`] = plateau(
      cornerB.x,
      cornerB.z,
      isIronPass ? cornerB.r * 1.22 : cornerB.r,
      60,
    );
  }
  for (const progress of TOWNS) {
    plateaus[`town:${progress.name}`] = plateau(
      progress.x,
      progress.z,
      progress.r * 0.8,
      50,
      progress.name === 'Hadley' ? 0.8 : 0.9,
    );
  }
  for (const sector of SECTORS) {
    if (sector.kind !== 'hill') {
      plateaus[`sector:${sector.id}`] = plateau(
        sector.x,
        sector.z,
        sector.r * (isIronPass ? 0.95 : 0.6),
        40,
        isIronPass ? 0.95 : 0.8,
      );
    }
  }
  if (ACTIVE_MAP === 'kestrel') {
    plateaus['sector:C'] = plateau(270, -110, 38, 30, 0.85);
  } else {
    for (const sector of SECTORS.filter((sector) => sector.kind === 'hill')) {
      plateaus[`sector:${sector.id}`] = plateau(sector.x, sector.z, sector.r * 0.9, 35, 1);
    }
  }
  for (const supplyPoint of SUPPLY_POINTS) {
    plateaus[`sp:${supplyPoint.id}`] = plateau(
      supplyPoint.x,
      supplyPoint.z,
      supplyPoint.r + 10,
      30,
    );
  }

  const roads = ROADS.map((roadDefinition) => {
    const points = subdivide(roadDefinition.pts, 6);
    const halfWidth = roadDefinition.kind === 'asphalt' ? 4.2 : 3.0;
    let prof = points.map(([positionX, positionZ]) => sample(positionX, positionZ));
    const riverAt = points.map(([positionX, positionZ]) => {
      const fractionX = Math.min(N - 1, Math.max(0, toGridIndex(positionX)));
      const fractionZ = Math.min(N - 1, Math.max(0, toGridIndex(positionZ)));
      return rDist[gridIndex(fractionX, fractionZ)] < RIVER_HALF_W + 9;
    });
    const bridges = [];
    for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
      if (!riverAt[pointIndex] || (pointIndex > 0 && riverAt[pointIndex - 1])) {
        continue;
      }
      let endIndex = pointIndex;
      while (endIndex < points.length - 1 && riverAt[endIndex + 1]) {
        endIndex++;
      }
      let cornerA = Math.max(0, pointIndex - 2);
      let cornerB = Math.min(points.length - 1, endIndex + 2);
      if (ACTIVE_MAP === 'ironpass') {
        while (
          cornerA > 0 &&
          prof[cornerA - 1] >= prof[cornerA] - 0.15 &&
          pointIndex - cornerA < 20
        ) {
          cornerA--;
        }
        while (
          cornerB < points.length - 1 &&
          prof[cornerB + 1] >= prof[cornerB] - 0.15 &&
          cornerB - endIndex < 20
        ) {
          cornerB++;
        }
        for (let neighbor = cornerA + 1; neighbor < cornerB; neighbor++) {
          riverAt[neighbor] = true;
        }
      }
      const wlMin =
        (riverWaterLevels[
          gridIndex(toGridIndex(points[pointIndex][0]), toGridIndex(points[pointIndex][1]))
        ] || 0) + 2.2;
      if (ACTIVE_MAP === 'ironpass') {
        const startY = Math.max(prof[cornerA], wlMin);
        const endY = Math.max(prof[cornerB], wlMin);
        for (let neighbor = cornerA; neighbor <= cornerB; neighbor++) {
          prof[neighbor] =
            startY + ((endY - startY) * (neighbor - cornerA)) / Math.max(1, cornerB - cornerA);
        }
        bridges.push({
          a: cornerA,
          b: cornerB,
          deck: Math.max(startY, endY),
          ya: startY,
          yb: endY,
        });
      } else {
        const deck = Math.max(prof[cornerA], prof[cornerB], wlMin);
        for (let neighbor = cornerA; neighbor <= cornerB; neighbor++) {
          prof[neighbor] = deck;
        }
        bridges.push({ a: cornerA, b: cornerB, deck });
      }
    }
    const win = roadDefinition.kind === 'asphalt' ? 9 : 6;
    for (let pass = 0; pass < 3; pass++) {
      const nextProfile = prof.slice();
      for (let pointIndex = 0; pointIndex < prof.length; pointIndex++) {
        if (bridges.some((bridge) => pointIndex >= bridge.a && pointIndex <= bridge.b)) {
          continue;
        }
        let sector = 0;
        let count = 0;
        for (let neighbor = -win; neighbor <= win; neighbor++) {
          const fractionZ = prof[Math.max(0, Math.min(prof.length - 1, pointIndex + neighbor))];
          sector += fractionZ;
          count++;
        }
        nextProfile[pointIndex] = sector / count;
      }
      prof = nextProfile;
    }
    return { ...roadDefinition, pts: points, prof, hw: halfWidth, bridges, riverAt };
  });
  if (ACTIVE_MAP === 'ironpass') {
    const done = new Set();
    for (let roadIndex = 0; roadIndex < roads.length; roadIndex++) {
      for (let otherIndex = roadIndex + 1; otherIndex < roads.length; otherIndex++) {
        const currentRoad = roads[roadIndex];
        const otherRoad = roads[otherIndex];
        for (let pointIndex = 0; pointIndex < currentRoad.pts.length; pointIndex += 2) {
          let bestIndex = -1;
          let bestDistance = 12;
          for (let neighbor = 0; neighbor < otherRoad.pts.length; neighbor++) {
            const cornerD = Math.hypot(
              otherRoad.pts[neighbor][0] - currentRoad.pts[pointIndex][0],
              otherRoad.pts[neighbor][1] - currentRoad.pts[pointIndex][1],
            );
            if (cornerD < bestDistance) {
              bestDistance = cornerD;
              bestIndex = neighbor;
            }
          }
          if (bestIndex < 0) {
            continue;
          }
          const key = `${roadIndex}:${otherIndex}:${Math.round(currentRoad.pts[pointIndex][0] / 20)}:${Math.round(currentRoad.pts[pointIndex][1] / 20)}`;
          if (done.has(key)) {
            continue;
          }
          done.add(key);
          const target = (currentRoad.prof[pointIndex] + otherRoad.prof[bestIndex]) / 2;
          const blend = (road, cornerC) => {
            const difference = target - road.prof[cornerC];
            for (let index = -8; index <= 8; index++) {
              const neighbor = cornerC + index;
              if (
                neighbor < 0 ||
                neighbor >= road.prof.length ||
                road.bridges.some((bridge) => neighbor >= bridge.a && neighbor <= bridge.b)
              ) {
                continue;
              }
              road.prof[neighbor] += difference * (1 - smooth(Math.abs(index) / 8));
            }
          };
          blend(currentRoad, pointIndex);
          blend(otherRoad, bestIndex);
        }
      }
    }
  }
  for (const road of roads) {
    for (const end of [0, 1]) {
      const endIndex = end ? road.pts.length - 1 : 0;
      const [endX, endZ] = road.pts[endIndex];
      let best = null;
      for (const otherRoad of roads) {
        if (otherRoad === road) {
          continue;
        }
        for (let neighbor = 0; neighbor < otherRoad.pts.length; neighbor++) {
          const cornerD = Math.hypot(
            otherRoad.pts[neighbor][0] - endX,
            otherRoad.pts[neighbor][1] - endZ,
          );
          if (cornerD < 18 && (!best || cornerD < best.d)) {
            best = { d: cornerD, h: otherRoad.prof[neighbor] };
          }
        }
      }
      if (!best || road.bridges.some((bridge) => endIndex >= bridge.a && endIndex <= bridge.b)) {
        continue;
      }
      const span = Math.min(9, road.pts.length - 1);
      const diff = best.h - road.prof[endIndex];
      for (let index = 0; index <= span; index++) {
        const pointIndex = end ? endIndex - index : endIndex + index;
        road.prof[pointIndex] += diff * (1 - smooth(index / span));
      }
    }
  }
  if (ACTIVE_MAP === 'ironpass') {
    const inArea = (positionX, positionZ) =>
      SECTORS.some(
        (sector) => Math.hypot(positionX - sector.x, positionZ - sector.z) < sector.r * 0.95,
      ) ||
      MAIN_BASES.some(
        (mainBase) => Math.hypot(positionX - mainBase.x, positionZ - mainBase.z) < mainBase.r * 1.2,
      ) ||
      SUPPLY_POINTS.some(
        (supplyPoint) =>
          Math.hypot(positionX - supplyPoint.x, positionZ - supplyPoint.z) < supplyPoint.r + 10,
      );
    for (const road of roads) {
      const { pts: points, prof, bridges } = road;
      const fixed = points.map(([positionX, positionZ]) => inArea(positionX, positionZ));
      fixed.forEach((spline, neighbor) => {
        if (spline) {
          prof[neighbor] = sample(points[neighbor][0], points[neighbor][1]);
        }
      });
      const hold = points.map(
        (_, neighbor) =>
          fixed[neighbor] || bridges.some((bridge) => neighbor >= bridge.a && neighbor <= bridge.b),
      );
      const count = prof.length;
      const seg = (neighbor) =>
        Math.hypot(
          points[neighbor][0] - points[neighbor - 1][0],
          points[neighbor][1] - points[neighbor - 1][1],
        ) * 0.22;
      const lower = new Float64Array(count).fill(-Infinity);
      const upper = new Float64Array(count).fill(Infinity);
      for (let neighbor = 0; neighbor < count; neighbor++) {
        if (hold[neighbor]) {
          lower[neighbor] = upper[neighbor] = prof[neighbor];
        } else if (neighbor > 0) {
          lower[neighbor] = lower[neighbor - 1] - seg(neighbor);
          upper[neighbor] = upper[neighbor - 1] + seg(neighbor);
        }
      }
      let lowerBound = -Infinity;
      let upperBound = Infinity;
      for (let neighbor = count - 1; neighbor >= 0; neighbor--) {
        if (hold[neighbor]) {
          lowerBound = upperBound = prof[neighbor];
          continue;
        }
        if (neighbor < count - 1) {
          lowerBound -= seg(neighbor + 1);
          upperBound += seg(neighbor + 1);
        }
        const low = Math.max(lower[neighbor], lowerBound);
        const high = Math.min(upper[neighbor], upperBound);
        lower[neighbor] = low <= high ? low : (low + high) / 2;
        upper[neighbor] = low <= high ? high : (low + high) / 2;
      }
      for (let neighbor = 0; neighbor < count; neighbor++) {
        if (!hold[neighbor]) {
          prof[neighbor] = Math.max(lower[neighbor], Math.min(upper[neighbor], prof[neighbor]));
        }
      }
      for (let pass = 0; pass < 3; pass++) {
        for (let neighbor = 1; neighbor < count; neighbor++) {
          if (!hold[neighbor]) {
            prof[neighbor] = Math.max(
              lower[neighbor],
              Math.min(
                upper[neighbor],
                Math.max(
                  prof[neighbor - 1] - seg(neighbor),
                  Math.min(prof[neighbor - 1] + seg(neighbor), prof[neighbor]),
                ),
              ),
            );
          }
        }
        for (let neighbor = count - 2; neighbor >= 0; neighbor--) {
          if (!hold[neighbor]) {
            prof[neighbor] = Math.max(
              lower[neighbor],
              Math.min(
                upper[neighbor],
                Math.max(
                  prof[neighbor + 1] - seg(neighbor + 1),
                  Math.min(prof[neighbor + 1] + seg(neighbor + 1), prof[neighbor]),
                ),
              ),
            );
          }
        }
      }
    }
  }
  const roadD = new Float32Array(N * N).fill(1e9);
  const roadH = new Float32Array(N * N);
  const roadK = new Uint8Array(N * N);
  for (const road of roads) {
    const reachR = road.hw + 9;
    for (let pointIndex = 0; pointIndex < road.pts.length - 1; pointIndex++) {
      if (road.riverAt[pointIndex] && road.riverAt[pointIndex + 1]) {
        continue;
      }
      const [startX, startZ] = road.pts[pointIndex];
      const [endX, endZ] = road.pts[pointIndex + 1];
      for (
        let innerIndex = Math.max(0, toGridIndex(Math.min(startZ, endZ) - reachR));
        innerIndex <= Math.min(N - 1, toGridIndex(Math.max(startZ, endZ) + reachR));
        innerIndex++
      ) {
        for (
          let index = Math.max(0, toGridIndex(Math.min(startX, endX) - reachR));
          index <= Math.min(N - 1, toGridIndex(Math.max(startX, endX) + reachR));
          index++
        ) {
          const [cornerD, progress] = segDist(
            worldX(index),
            worldX(innerIndex),
            startX,
            startZ,
            endX,
            endZ,
          );
          const id = gridIndex(index, innerIndex);
          if (cornerD < roadD[id]) {
            roadD[id] = cornerD;
            roadH[id] =
              road.prof[pointIndex] +
              (road.prof[pointIndex + 1] - road.prof[pointIndex]) * progress;
            roadK[id] = road.kind === 'asphalt' ? 2 : 1;
          }
        }
      }
    }
  }
  for (let id = 0; id < N * N; id++) {
    const cornerD = roadD[id];
    const halfWidth = roadK[id] === 2 ? 4.2 : 3.0;
    if (cornerD > halfWidth + 9) {
      continue;
    }
    if (rDist[id] < RIVER_HALF_W + 3) {
      continue;
    }
    const pointIndex = cornerD < halfWidth + 1 ? 1 : 1 - smooth((cornerD - halfWidth - 1) / 8);
    high[id] += (roadH[id] - 0.08 - high[id]) * pointIndex;
  }

  const inField = (positionX, positionZ) =>
    FIELDS.some(
      ([fieldMinX, fieldMinZ, fieldMaxX, fieldMaxZ]) =>
        positionX > fieldMinX &&
        positionX < fieldMaxX &&
        positionZ > fieldMinZ &&
        positionZ < fieldMaxZ,
    );
  const forestMask = (positionX, positionZ) =>
    fbm(positionX / 260 + 40, positionZ / 260 - 12, 4, 77);
  const nearAny = (positionX, positionZ, list, pad) =>
    list.some(
      (otherRoad) =>
        Math.hypot(positionX - otherRoad.x, positionZ - otherRoad.z) < (otherRoad.r || 0) + pad,
    );
  for (let innerIndex = 0; innerIndex < N; innerIndex++) {
    for (let index = 0; index < N; index++) {
      const id = gridIndex(index, innerIndex);
      const positionX = worldX(index);
      const positionZ = worldX(innerIndex);
      let sector = SURF.grass;
      const slopeX =
        (high[gridIndex(Math.min(N - 1, index + 1), innerIndex)] -
          high[gridIndex(Math.max(0, index - 1), innerIndex)]) /
        (2 * CELL);
      const slopeZ =
        (high[gridIndex(index, Math.min(N - 1, innerIndex + 1))] -
          high[gridIndex(index, Math.max(0, innerIndex - 1))]) /
        (2 * CELL);
      const slope = Math.hypot(slopeX, slopeZ);
      if (water[id] > high[id] + 0.05) {
        sector = SURF.water;
      } else if (rDist[id] < RIVER_HALF_W + 6) {
        sector = SURF.sand;
      } else if (roadD[id] < (roadK[id] === 2 ? 4.2 : 3.0)) {
        sector = roadK[id] === 2 ? SURF.asphalt : SURF.dirt;
      } else if (nearAny(positionX, positionZ, MAIN_BASES, -25)) {
        sector = SURF.concrete;
      } else if (slope > 0.75 || high[id] > 175) {
        sector = SURF.rock;
      } else if (inField(positionX, positionZ)) {
        sector = SURF.field;
      } else if (
        forestMask(positionX, positionZ) > (ACTIVE_MAP === 'ironpass' ? 0.72 : 0.56) &&
        !nearAny(positionX, positionZ, TOWNS, 10) &&
        !nearAny(positionX, positionZ, SECTORS, 5) &&
        !nearAny(positionX, positionZ, SUPPLY_POINTS, 15) &&
        !nearAny(positionX, positionZ, MAIN_BASES, 30) &&
        roadD[id] > 9
      ) {
        sector = SURF.forest;
      }
      surf[id] = sector;
    }
  }
  return { H: high, surf, water, roads, river, wl: waterLevels, plat: plateaus, rDist, roadD };
}

export let ACTIVE_MAP = 'kestrel';
export let CAPTURE_CHAIN = null;
const original = {
  MAIN_BASES,
  SECTORS,
  SUPPLY_POINTS,
  TOWNS,
  ROADS,
  FIELDS,
  RIVER_PTS,
  RIVER_HALF_W,
  RIVER_BANK,
};
export let TERRAIN = generate();
const terrainCache = new Map([['kestrel', TERRAIN]]);

export function roadDistanceAt(positionX, positionZ) {
  const size = Math.round(Math.sqrt(TERRAIN.roadD.length));
  const index = Math.max(0, Math.min(size - 1, Math.round((positionX + HALF) / 4)));
  const innerIndex = Math.max(0, Math.min(size - 1, Math.round((positionZ + HALF) / 4)));
  return TERRAIN.roadD[innerIndex * size + index];
}
export function selectTerrain(id) {
  id = mapId(id);
  if (id === ACTIVE_MAP) {
    return;
  }
  ACTIVE_MAP = id;
  const low = id === 'ironpass' ? IRON_PASS : id === 'frontier' ? FRONTIER : null;
  MAIN_BASES = low ? low.bases : original.MAIN_BASES;
  SUPPLY_POINTS = low ? low.supply : original.SUPPLY_POINTS;
  FIELDS = low ? low.fields : original.FIELDS;
  RIVER_PTS = low ? low.river : original.RIVER_PTS;
  RIVER_HALF_W = low ? low.riverHalfWidth : original.RIVER_HALF_W;
  RIVER_BANK = low ? low.riverBank : original.RIVER_BANK;
  SECTORS = low ? low.sectors : original.SECTORS;
  TOWNS = low ? low.towns : original.TOWNS;
  ROADS = low ? low.roads : original.ROADS;
  CAPTURE_CHAIN = null;
  if (!terrainCache.has(id)) {
    terrainCache.set(id, generate());
  }
  TERRAIN = terrainCache.get(id);
  ({ H: heights, surf, water } = TERRAIN);
}

let { H: heights, surf, water } = TERRAIN;
export function heightAt(positionX, positionZ) {
  const fractionX = Math.max(0, Math.min(N - 1, (positionX + HALF) / CELL));
  const fractionZ = Math.max(0, Math.min(N - 1, (positionZ + HALF) / CELL));
  const index = Math.min(N - 2, fractionX | 0);
  const innerIndex = Math.min(N - 2, fractionZ | 0);
  const fraction = fractionX - index;
  const currentFractionZ = fractionZ - innerIndex;
  const currentIndex = innerIndex * N + index;
  const cornerA = heights[currentIndex];
  const cornerB = heights[currentIndex + 1];
  const cornerC = heights[currentIndex + N];
  const cornerD = heights[currentIndex + N + 1];
  if (fraction + currentFractionZ <= 1) {
    return cornerA + (cornerB - cornerA) * fraction + (cornerC - cornerA) * currentFractionZ;
  }
  return (
    cornerD + (cornerC - cornerD) * (1 - fraction) + (cornerB - cornerD) * (1 - currentFractionZ)
  );
}

export function normalAt(positionX, positionZ) {
  const endIndex = 1.5;
  const deltaX =
    heightAt(positionX + endIndex, positionZ) - heightAt(positionX - endIndex, positionZ);
  const deltaZ =
    heightAt(positionX, positionZ + endIndex) - heightAt(positionX, positionZ - endIndex);
  const distance = Math.hypot(deltaX, 2 * endIndex, deltaZ);
  return [-deltaX / distance, (2 * endIndex) / distance, -deltaZ / distance];
}

const cellOf = (positionX, positionZ) => {
  const index = Math.max(0, Math.min(N - 1, Math.round((positionX + HALF) / CELL)));
  const innerIndex = Math.max(0, Math.min(N - 1, Math.round((positionZ + HALF) / CELL)));
  return innerIndex * N + index;
};
export const surfaceAt = (positionX, positionZ) => surf[cellOf(positionX, positionZ)];
export function waterDepth(positionX, positionZ) {
  const width = water[cellOf(positionX, positionZ)];
  if (width < -1e8) {
    return 0;
  }
  return Math.max(0, width - heightAt(positionX, positionZ));
}
export function waterLevel(positionX, positionZ) {
  const width = water[cellOf(positionX, positionZ)];
  return width < -1e8 ? null : width;
}
export function waterAt(positionX, positionY, positionZ) {
  const width = water[cellOf(positionX, positionZ)];
  if (width < -1e8 || positionY > width - 0.2) {
    return 0;
  }
  return Math.max(0, width - heightAt(positionX, positionZ));
}
export const inBounds = (positionX, positionZ, pad = 0) =>
  Math.abs(positionX) < HALF - pad && Math.abs(positionZ) < HALF - pad;

export function gridRef(positionX, positionZ) {
  const blockX = Math.floor((positionX + HALF) / 100);
  const blockZ = Math.floor((positionZ + HALF) / 100);
  const subX = Math.floor(((positionX + HALF) % 100) / 10);
  const subZ = Math.floor(((positionZ + HALF) % 100) / 10);
  return `${String(blockX).padStart(2, '0')}${subX}-${String(blockZ).padStart(2, '0')}${subZ}`;
}

export function rayTerrain(otherRoad, cornerD, maxT) {
  let progress = 0;
  let prevT = 0;
  let prevAbove = otherRoad[1] - heightAt(otherRoad[0], otherRoad[2]);
  if (prevAbove < 0) {
    return 0;
  }
  while (progress < maxT) {
    const step = Math.max(0.6, Math.min(12, prevAbove * 0.6));
    progress = Math.min(maxT, progress + step);
    const positionX = otherRoad[0] + cornerD[0] * progress;
    const positionY = otherRoad[1] + cornerD[1] * progress;
    const positionZ = otherRoad[2] + cornerD[2] * progress;
    if (Math.abs(positionX) > HALF + 200 || Math.abs(positionZ) > HALF + 200) {
      return null;
    }
    const above = positionY - heightAt(positionX, positionZ);
    if (above < 0) {
      let cornerA = prevT;
      let cornerB = progress;
      for (let index = 0; index < 10; index++) {
        const middle = (cornerA + cornerB) / 2;
        if (
          otherRoad[1] +
            cornerD[1] * middle -
            heightAt(otherRoad[0] + cornerD[0] * middle, otherRoad[2] + cornerD[2] * middle) <
          0
        ) {
          cornerB = middle;
        } else {
          cornerA = middle;
        }
      }
      return cornerB;
    }
    prevT = progress;
    prevAbove = above;
    if (progress >= maxT) {
      break;
    }
  }
  return null;
}
