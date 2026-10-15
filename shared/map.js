const makeBox = (
  positionX,
  positionZ,
  width,
  depth,
  height = 3,
  positionY = 0,
  material = 'wall',
) => ({
  min: [positionX - width / 2, positionY, positionZ - depth / 2],
  max: [positionX + width / 2, positionY + height, positionZ + depth / 2],
  mat: material,
});

const makeDoor = (positionX, positionZ, width, depth, height = 2.6, health = 200) => ({
  ...makeBox(positionX, positionZ, width, depth, height, 0, 'door'),
  hp: health,
});

function car(positionX, positionZ, axis = 'z', baseY = 0) {
  const alongZ = axis === 'z';
  const addBox = (offsetX, offsetZ, width, depth, height, positionY, material) =>
    alongZ
      ? makeBox(
          positionX + offsetX,
          positionZ + offsetZ,
          width,
          depth,
          height,
          positionY + baseY,
          material,
        )
      : makeBox(
          positionX + offsetZ,
          positionZ + offsetX,
          depth,
          width,
          height,
          positionY + baseY,
          material,
        );
  return [
    addBox(0, 0, 1.9, 4.3, 0.75, 0.25, 'car'),
    addBox(0, 0.3, 1.7, 2.1, 0.55, 1.0, 'car'),
    addBox(0.95, 1.35, 0.3, 0.7, 0.55, 0, 'tire'),
    addBox(-0.95, 1.35, 0.3, 0.7, 0.55, 0, 'tire'),
    addBox(0.95, -1.35, 0.3, 0.7, 0.55, 0, 'tire'),
    addBox(-0.95, -1.35, 0.3, 0.7, 0.55, 0, 'tire'),
  ];
}

const outer = (halfX, halfZ, height = 6) => [
  makeBox(0, -halfZ - 0.5, halfX * 2 + 2, 1, height),
  makeBox(0, halfZ + 0.5, halfX * 2 + 2, 1, height),
  makeBox(-halfX - 0.5, 0, 1, halfZ * 2, height),
  makeBox(halfX + 0.5, 0, 1, halfZ * 2, height),
];

const ARENA = {
  id: 'arena',
  name: 'Arena',
  desc: 'The classic: open middle, lanes on the sides.',
  hx: 30,
  hz: 30,
  theme: {
    sky: 0xa9bfd3,
    fog: [40, 140],
    floor: ['#76806d', '#626b5a'],
    wall: ['#cfc6b3', '#a89e8a'],
    hemi: 1.0,
    sun: 2.4,
  },
  boxes: [
    ...outer(30, 30),
    makeBox(-6, -19, 1, 8, 4),
    makeBox(6, -19, 1, 8, 4),
    makeBox(0, -15, 13, 1, 4),
    makeBox(-6, 19, 1, 8, 4),
    makeBox(6, 19, 1, 8, 4),
    makeBox(0, 15, 13, 1, 4),
    makeBox(-16, -11, 10, 1, 4),
    makeBox(16, -11, 10, 1, 4),
    makeBox(-16, 11, 10, 1, 4),
    makeBox(16, 11, 10, 1, 4),
    makeBox(0, 0, 5, 5, 4.5),
    makeBox(0, -7, 2, 2, 1.0, 0, 'crate'),
    makeBox(0, 7, 2, 2, 1.0, 0, 'crate'),
    makeBox(-9, 0, 2, 2, 2.2, 0, 'crate'),
    makeBox(9, 0, 2, 2, 2.2, 0, 'crate'),
    makeBox(-25, -5, 3, 3, 1.0, 0, 'crate'),
    makeBox(-25, -5, 1.6, 1.6, 1.0, 1.0, 'crate'),
    makeBox(25, 5, 3, 3, 1.0, 0, 'crate'),
    makeBox(25, 5, 1.6, 1.6, 1.0, 1.0, 'crate'),
    makeBox(-25, 6, 2, 2, 1.0, 0, 'crate'),
    makeBox(25, -6, 2, 2, 1.0, 0, 'crate'),
    makeBox(-25, -20, 6, 6, 1.2),
    makeBox(-21.5, -20, 1, 6, 0.8),
    makeBox(-20.5, -20, 1, 6, 0.4),
    makeBox(25, 20, 6, 6, 1.2),
    makeBox(21.5, 20, 1, 6, 0.8),
    makeBox(20.5, 20, 1, 6, 0.4),
  ],
  spawn: {
    T: { x: [-5, 5], z: [16.5, 28.5], yaw: 0 },
    CT: { x: [-5, 5], z: [-28.5, -16.5], yaw: Math.PI },
  },
};

const makeRegion = (minX, maxX, minZ, maxZ) => ({ x0: minX, x1: maxX, z0: minZ, z1: maxZ });

const makeFloor = (minX, maxX, minZ, maxZ, height) => ({
  min: [minX, 0, minZ],
  max: [maxX, height, maxZ],
  mat: 'ground',
  floor: true,
});

function ramp(minX, maxX, minZ, maxZ, direction, startHeight, endHeight, steps) {
  const out = [];
  const alongX = direction[1] === 'x';
  const length = alongX ? maxX - minX : maxZ - minZ;
  for (let step = 0; step < steps; step++) {
    const height = startHeight + ((step + 1) * (endHeight - startHeight)) / steps;
    if (height <= 0.01) {
      continue;
    }
    const start =
      direction[0] === '+' ? step * (length / steps) : length - (step + 1) * (length / steps);
    const end = start + length / steps;
    out.push(
      alongX
        ? makeFloor(minX + start, minX + end, minZ, maxZ, height)
        : makeFloor(minX, maxX, minZ + start, minZ + end, height),
    );
  }
  return out;
}

function carve(halfX, halfZ, open, height = 7) {
  const isOpen = (positionX, positionZ) =>
    open.some(
      (margin) =>
        positionX > margin.x0 &&
        positionX < margin.x1 &&
        positionZ > margin.z0 &&
        positionZ < margin.z1,
    );
  const out = [];
  let previous = new Map();
  for (let positionZ = -halfZ; positionZ < halfZ; positionZ++) {
    const current = new Map();
    let positionX = -halfX;
    while (positionX < halfX) {
      if (isOpen(positionX + 0.5, positionZ + 0.5)) {
        positionX++;
        continue;
      }
      let maxX = positionX;
      while (maxX < halfX && !isOpen(maxX + 0.5, positionZ + 0.5)) {
        maxX++;
      }
      const key = `${positionX},${maxX}`;
      let existing = previous.get(key);
      if (existing) {
        existing.max[2] = positionZ + 1;
      } else {
        out.push(
          (existing = {
            min: [positionX, 0, positionZ],
            max: [maxX, height, positionZ + 1],
            mat: 'wall',
          }),
        );
      }
      current.set(key, existing);
      positionX = maxX;
    }
    previous = current;
  }
  return out;
}

const DUST_OPEN = [
  makeRegion(-14, 14, 40, 52),
  makeRegion(-3, 3, 28, 40),
  makeRegion(-9, 9, 14, 29),
  makeRegion(-2, 2, 12, 14),
  makeRegion(-22, -14, 42, 48),
  makeRegion(-26, -20, 45, 51),
  makeRegion(-28, -26, 46, 50),
  makeRegion(-44, -28, 36, 52),
  makeRegion(-47, -44, 44, 48),
  makeRegion(-44, -34, 14, 36),
  makeRegion(-42, -32, -4, 16),
  makeRegion(-14, -9, 18, 22),
  makeRegion(-18, -14, -4, 22),
  makeRegion(-14, -12, -4, 12),
  makeRegion(-26, -18, -4, 0),
  makeRegion(-44, -22, -26, -4),
  makeRegion(-22, -12, -12, -6),
  makeRegion(-12, 14, -16, 12),
  makeRegion(-3, 3, -32, -16),
  makeRegion(-8, 8, -46, -32),
  makeRegion(-30, -8, -40, -36),
  makeRegion(-30, -26, -36, -26),
  makeRegion(8, 28, -40, -36),
  makeRegion(24, 28, -36, -28),
  makeRegion(14, 24, 44, 49),
  makeRegion(21, 26, 30, 46),
  makeRegion(22, 32, 2, 30),
  makeRegion(9, 22, 20, 24),
  makeRegion(27, 34, -8, 2),
  makeRegion(22, 36, -28, -8),
  makeRegion(14, 19, -5, -1),
  makeRegion(17, 21, -16, -1),
  makeRegion(21, 22, -16, -13),
  makeRegion(21, 22, -11, -9),
];

const DUST = {
  id: 'dust',
  name: 'Dunes',
  desc: 'Dust II-style: Long A, Short/Catwalk, Mid doors, B tunnels and two bomb sites, with ramps and height changes.',
  hx: 48,
  hz: 54,
  theme: {
    sky: 0xe8d4ad,
    fog: [60, 190],
    floor: ['#c9a76a', '#b08f57'],
    wall: ['#dcc293', '#b99d6c'],
    hemi: 1.1,
    sun: 2.7,
  },
  boxes: [
    ...outer(48, 54, 7),
    ...carve(48, 54, DUST_OPEN),
    makeFloor(-14, 14, 40, 52, 1.0),
    makeFloor(-3, 3, 37, 40, 1.0),
    ...ramp(-3, 3, 33, 37, '-z', 1.0, 0.5, 2),
    makeFloor(-3, 3, 28, 33, 0.5),
    makeBox(-10, 47, 2, 2, 1.1, 1.0, 'crate'),
    makeBox(9, 45, 2.5, 1.5, 1.2, 1.0, 'crate'),
    makeFloor(-9, 9, 14, 29, 0.5),
    makeFloor(-2, 2, 13, 14, 0.5),
    makeFloor(-2, 2, 12, 13, 0.25),
    makeBox(-4, 21, 2, 2, 1.1, 0.5, 'crate'),
    makeBox(-4, 21, 1.6, 1.6, 1.0, 1.6, 'crate'),
    makeBox(4.5, 24, 1.6, 1.6, 1.0, 0.5, 'crate'),
    makeBox(3, 17, 2, 1.4, 1.2, 0.5, 'crate'),
    makeFloor(-22, -14, 42, 48, 1.0),
    makeFloor(-26, -20, 45, 51, 1.15),
    makeFloor(-28, -26, 46, 50, 1.3),
    makeFloor(-44, -28, 36, 52, 1.3),
    makeFloor(-47, -44, 44, 48, 1.3),
    makeBox(-31, 39.5, 2.5, 2.5, 1.5, 1.3, 'crate'),
    ...ramp(-44, -34, 26, 36, '-z', 1.3, 0.5, 4),
    makeFloor(-44, -34, 14, 26, 0.5),
    makeFloor(-42, -32, 5, 16, 0.5),
    ...ramp(-42, -32, -4, 5, '-z', 0.5, 2.0, 6),
    ...car(-38, 22, 'z', 0.5),
    makeBox(-35.5, 8, 2, 2, 1.2, 0.5, 'crate'),
    ...ramp(-14, -9, 18, 22, '-x', 0.5, 1.6, 5),
    makeFloor(-18, -14, -4, 22, 1.6),
    makeBox(-13, 4, 2, 16, 2.6),
    ...ramp(-22, -18, -4, 0, '-x', 1.6, 2.0, 2),
    makeFloor(-26, -22, -4, 0, 2.0),
    makeFloor(-44, -22, -26, -4, 2.0),
    makeFloor(-42, -31, -26, -22, 2.6),
    ...ramp(-42, -31, -22, -20, '-z', 2.0, 2.6, 3),
    makeBox(-40, -7, 3, 3, 1.6, 2.0, 'crate'),
    makeBox(-33, -14, 2, 2, 1.1, 2.0, 'crate'),
    makeBox(-33, -14, 1.6, 1.6, 1.0, 3.1, 'crate'),
    makeBox(-26.5, -6.5, 2, 2, 1.1, 2.0, 'crate'),
    makeBox(-29, -19, 4, 0.8, 1.2, 2.0),
    makeBox(-24.5, -9, 1.5, 1.5, 3, 2.0),
    ...ramp(-20, -12, -12, -6, '-x', 0, 2.0, 8),
    makeFloor(-22, -20, -12, -6, 2.0),
    ...ramp(-30, -26, -36, -26, '+z', 0, 2.0, 8),
    makeBox(0, -12, 7, 3, 4),
    makeBox(8, 3, 5, 0.8, 1.3),
    makeBox(-7, 6, 2, 2, 1.1, 0, 'crate'),
    makeBox(10, -10, 2, 2, 1.4, 0, 'crate'),
    makeBox(-3, -40, 2, 2, 1.1, 0, 'crate'),
    makeFloor(14, 24, 44, 49, 1.25),
    makeFloor(21, 26, 30, 46, 1.25),
    makeFloor(22, 32, 2, 30, 1.25),
    makeBox(19, 46.5, 10, 5, 0.4, 4.25, 'roof'),
    makeBox(23.5, 38, 5, 16, 0.4, 4.25, 'roof'),
    makeBox(27, 16, 10, 28, 0.4, 4.6, 'roof'),
    makeBox(30.5, 24, 2, 3, 1.1, 1.25, 'crate'),
    makeBox(23.5, 10, 2.5, 2, 1.3, 1.25, 'crate'),
    ...ramp(17, 22, 20, 24, '-x', 1.25, 0.5, 3),
    makeFloor(9, 17, 20, 24, 0.5),
    makeBox(15.5, 22, 13, 4, 0.4, 3.7, 'roof'),
    ...ramp(27, 34, -8, 2, '-z', 1.25, 0, 5),
    makeFloor(30, 36, -28, -24, 1.0),
    ...ramp(30, 36, -24, -21, '-z', 0, 1.0, 3),
    makeBox(30.5, -11, 2.5, 2, 1.5, 0, 'crate'),
    makeBox(34, -10.5, 4, 1, 5),
    makeBox(28, -18, 2, 2, 1.1, 0, 'crate'),
    makeBox(28, -18, 1.6, 1.6, 1.0, 1.1, 'crate'),
    makeBox(24.5, -21, 2, 2, 1.2, 0, 'crate'),
    makeBox(21.5, -10, 1, 2, 1.5),
    makeBox(21.5, -10, 1, 2, 3.6, 3.4),
    makeBox(19.8, -10, 1.6, 1.6, 1.0, 0, 'crate'),
  ],
  doors: [
    makeDoor(-1.1, 12.5, 1.8, 0.3, 2.9, 250),
    makeDoor(1.85, 13, 0.3, 2, 2.9, 250),
    makeDoor(-27.5, 47, 0.3, 2, 3.9, 250),
    makeDoor(-26.2, 49.8, 1.6, 0.3, 3.9, 250),
    makeDoor(21.5, -15.2, 0.3, 1.6, 2.8, 220),
  ],
  sites: { A: { x: [-40, -27], z: [-19, -7] }, B: { x: [24, 34], z: [-25, -13] } },
  lanes: [
    [-38, 20],
    [-16, 8],
    [0, 20],
    [27, 16],
    [15, 22],
  ],
  stage: {
    A: [
      [-38, 16],
      [-16, 6],
    ],
    B: [
      [27, 12],
      [16, -3],
    ],
  },
  ctPeek: [
    [0, 4],
    [-36, 6],
    [24, 2],
  ],
  spawn: {
    T: { x: [-10, 10], z: [44, 50], yaw: 0 },
    CT: { x: [-6, 6], z: [-44, -36], yaw: Math.PI },
  },
};

const WAREHOUSE = {
  id: 'warehouse',
  name: 'Warehouse',
  desc: 'Indoors and dark. Shelves, crates and catwalks.',
  hx: 26,
  hz: 22,
  theme: {
    sky: 0x2c3036,
    fog: [28, 90],
    floor: ['#7a7d82', '#5f6266'],
    wall: ['#959aa1', '#767b82'],
    hemi: 0.95,
    sun: 1.9,
  },
  boxes: [
    ...outer(26, 22, 7),
    makeBox(17, 0, 1, 8, 3),
    makeBox(-17, 0, 1, 8, 3),
    makeBox(-7, 8, 10, 1, 3.5),
    makeBox(7, 8, 10, 1, 3.5),
    makeBox(-7, -8, 10, 1, 3.5),
    makeBox(7, -8, 10, 1, 3.5),
    makeBox(0, 0, 3, 3, 1.2, 0, 'crate'),
    makeBox(0, 0, 1.6, 1.6, 1.1, 1.2, 'crate'),
    makeBox(-8, 2, 2, 2, 2.2, 0, 'crate'),
    makeBox(8, -2, 2, 2, 2.2, 0, 'crate'),
    makeBox(-4, -3, 2, 2, 1.0, 0, 'crate'),
    makeBox(4, 3, 2, 2, 1.0, 0, 'crate'),
    makeBox(-14, 15, 2, 2, 1.0, 0, 'crate'),
    makeBox(14, -15, 2, 2, 1.0, 0, 'crate'),
    makeBox(0, 16, 4, 2, 1.2, 0, 'crate'),
    makeBox(0, -16, 4, 2, 1.2, 0, 'crate'),
    makeBox(-18, 17, 6, 6, 1.2),
    makeBox(-14.5, 17, 1, 6, 0.8),
    makeBox(-13.5, 17, 1, 6, 0.4),
    makeBox(18, -17, 6, 6, 1.2),
    makeBox(14.5, -17, 1, 6, 0.8),
    makeBox(13.5, -17, 1, 6, 0.4),
  ],
  spawn: {
    T: { x: [19, 24], z: [-6, 6], yaw: Math.PI / 2 },
    CT: { x: [-24, -19], z: [-6, 6], yaw: -Math.PI / 2 },
  },
};

const STREETS = {
  id: 'streets',
  name: 'Streets',
  desc: 'Two long streets, buildings in the middle and alleys.',
  hx: 22,
  hz: 36,
  theme: {
    sky: 0x9fb3c8,
    fog: [40, 130],
    floor: ['#4b4e53', '#d8c66a'],
    wall: ['#b8a894', '#8f7f6c'],
    hemi: 1.0,
    sun: 2.3,
  },
  boxes: [
    ...outer(22, 36),
    makeBox(0, -20, 10, 10, 6),
    makeBox(0, 0, 10, 14, 6),
    makeBox(0, 20, 10, 10, 6),
    makeBox(-19, -10, 6, 12, 6),
    makeBox(19, 10, 6, 12, 6),
    makeBox(-19, 18, 6, 8, 5),
    makeBox(19, -18, 6, 8, 5),
    ...car(-12, -4, 'z'),
    ...car(12, 6, 'z'),
    ...car(-13, 14, 'z'),
    ...car(13, -14, 'z'),
    ...car(-10, 25, 'x'),
    ...car(10, -25, 'x'),
    makeBox(-10, 30, 4, 1, 2.5),
    makeBox(10, 30, 4, 1, 2.5),
    makeBox(-10, -30, 4, 1, 2.5),
    makeBox(10, -30, 4, 1, 2.5),
  ],
  spawn: {
    T: { x: [-8, 8], z: [31, 35], yaw: 0 },
    CT: { x: [-8, 8], z: [-35, -31], yaw: Math.PI },
  },
};

const pillarBoxes = [];
for (const positionX of [-12, -6, 0, 6, 12]) {
  for (const positionZ of [-12, -6, 0, 6, 12]) {
    if (Math.abs(positionX) === 12 && Math.abs(positionZ) === 12) {
      continue;
    }
    if (positionX === 0 && positionZ === 0) {
      pillarBoxes.push(makeBox(0, 0, 4, 4, 4.5));
    } else if (((positionX + positionZ) / 6) % 2 === 0) {
      pillarBoxes.push(makeBox(positionX, positionZ, 2, 2, 4));
    } else {
      pillarBoxes.push(makeBox(positionX, positionZ, 2, 2, 1.1, 0, 'crate'));
    }
  }
}
const PILLARS = {
  id: 'pillars',
  name: 'Pillars',
  desc: 'Snowy courtyard full of pillars. Small and fast.',
  hx: 20,
  hz: 20,
  theme: {
    sky: 0xdfe8f0,
    fog: [30, 110],
    floor: ['#e9eef2', '#cdd6dd'],
    wall: ['#c6ced6', '#9fa9b3'],
    hemi: 1.15,
    sun: 2.0,
  },
  boxes: [
    ...outer(20, 20, 5),
    ...pillarBoxes,
    makeBox(10, 15, 1, 6, 2.5),
    makeBox(15, 10, 6, 1, 2.5),
    makeBox(-10, -15, 1, 6, 2.5),
    makeBox(-15, -10, 6, 1, 2.5),
  ],
  spawn: {
    T: { x: [12, 18], z: [12, 18], yaw: Math.PI / 4 },
    CT: { x: [-18, -12], z: [-18, -12], yaw: (-3 * Math.PI) / 4 },
  },
};

export function groundAt(map, positionX, positionZ) {
  let positionY = 0;
  for (const box of map.boxes) {
    if (
      box.floor &&
      positionX >= box.min[0] &&
      positionX <= box.max[0] &&
      positionZ >= box.min[2] &&
      positionZ <= box.max[2]
    ) {
      positionY = Math.max(positionY, box.max[1]);
    }
  }
  return positionY;
}

function openPoints(map) {
  const points = [];
  for (let positionX = -map.hx + 3; positionX <= map.hx - 3; positionX += 3) {
    for (let positionZ = -map.hz + 3; positionZ <= map.hz - 3; positionZ += 3) {
      const margin = 0.9;
      const ground = groundAt(map, positionX, positionZ);
      const blocked = map.boxes.some(
        (box) =>
          box.min[1] < ground + 1.8 &&
          box.max[1] > ground + 0.05 &&
          positionX + margin > box.min[0] &&
          positionX - margin < box.max[0] &&
          positionZ + margin > box.min[2] &&
          positionZ - margin < box.max[2],
      );
      if (!blocked) {
        points.push([positionX, positionZ]);
      }
    }
  }
  return points;
}

export const MAPS = [ARENA, DUST, WAREHOUSE, STREETS, PILLARS];
for (const map of MAPS) {
  map.doors = (map.doors || []).map((depth, index) => ({ ...depth, door: index }));
  map.openPoints = openPoints(map);
}

export const solidsOf = (map, broken) =>
  map.doors.length
    ? [...map.boxes, ...map.doors.filter((depth) => !broken?.has(depth.door))]
    : map.boxes;
export const DEFAULT_MAP = 'arena';
export const getMap = (id) => MAPS.find((map) => map.id === id) || ARENA;

export const TEST_SPAWN = { T: { x: -14, z: 4, yaw: 0 }, CT: { x: -14, z: -4, yaw: Math.PI } };
