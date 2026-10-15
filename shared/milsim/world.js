import { buildIronLandmarks } from './ironpass.js';
import {
  ACTIVE_MAP,
  selectTerrain,
  HALF,
  TERRAIN,
  heightAt,
  rng,
  fbm,
  SURF,
  surfaceAt,
  MAIN_BASES,
  SECTORS,
  SUPPLY_POINTS,
  TOWNS,
  waterDepth,
  rayTerrain,
  RIVER_HALF_W,
} from './terrain.js';

const box = (minX, minY, minZ, maxX, maxY, maxZ, material, extra) => ({
  min: [Math.min(minX, maxX), Math.min(minY, maxY), Math.min(minZ, maxZ)],
  max: [Math.max(minX, maxX), Math.max(minY, maxY), Math.max(minZ, maxZ)],
  mat: material,
  ...extra,
});
function frame(originX, originZ, rotation) {
  const quarterTurns = ((rotation % 4) + 4) % 4;
  const toWorld = (positionX, positionZ) =>
    quarterTurns === 0
      ? [originX + positionX, originZ + positionZ]
      : quarterTurns === 1
        ? [originX + positionZ, originZ - positionX]
        : quarterTurns === 2
          ? [originX - positionX, originZ - positionZ]
          : [originX - positionZ, originZ + positionX];
  return (lx0, minY, lz0, lx1, maxY, lz1, material, extra) => {
    const [startX, startZ] = toWorld(lx0, lz0);
    const [endX, endZ] = toWorld(lx1, lz1);
    return box(startX, minY, startZ, endX, maxY, endZ, material, extra);
  };
}

function wall(
  placeBox,
  out,
  axis,
  start,
  end,
  lineOffset,
  thickness,
  minY,
  height,
  openings,
  material,
) {
  const currentOpenings = openings
    .filter((origin) => origin.b > start && origin.a < end)
    .sort((left, right) => left.a - right.a);
  let current = start;
  const piece = (startA, endA, startY, endY) => {
    if (endA - startA < 0.02 || endY - startY < 0.02) {
      return;
    }
    out.push(
      axis === 'x'
        ? placeBox(
            startA,
            startY,
            lineOffset - thickness / 2,
            endA,
            endY,
            lineOffset + thickness / 2,
            material,
          )
        : placeBox(
            lineOffset - thickness / 2,
            startY,
            startA,
            lineOffset + thickness / 2,
            endY,
            endA,
            material,
          ),
    );
  };
  for (const origin of currentOpenings) {
    piece(current, origin.a, minY, minY + height);
    piece(origin.a, origin.b, minY, minY + origin.y0);
    piece(origin.a, origin.b, minY + origin.y1, minY + height);
    current = origin.b;
  }
  piece(current, end, minY, minY + height);
}

const DOORS = [];
function addDoor(placeBox, centerX, wallZ, minY) {
  const id = DOORS.length;
  const doorBox = placeBox(
    centerX - 0.64,
    minY,
    wallZ - 0.05,
    centerX + 0.64,
    minY + 2.22,
    wallZ + 0.05,
    'door',
    { door: id },
  );
  const axis = doorBox.max[0] - doorBox.min[0] > doorBox.max[2] - doorBox.min[2] ? 'x' : 'z';
  DOORS.push({
    id,
    box: doorBox,
    axis,
    hinge:
      axis === 'x'
        ? [doorBox.min[0], (doorBox.min[2] + doorBox.max[2]) / 2]
        : [(doorBox.min[0] + doorBox.max[0]) / 2, doorBox.min[2]],
    len: 1.28,
    y0: minY,
    h: 2.22,
  });
}

function house(
  out,
  positionX,
  positionZ,
  rotation,
  width,
  depth,
  floors,
  material,
  ruined = false,
  random = Math.random,
) {
  const placeBox = frame(positionX, positionZ, rotation);
  let gmin = Infinity;
  for (const [pointX, pointZ] of [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [-width / 2, depth / 2],
    [width / 2, depth / 2],
    [0, 0],
  ]) {
    const quarterTurns = ((rotation % 4) + 4) % 4;
    const [sideX, sideZ] =
      quarterTurns === 0
        ? [pointX, pointZ]
        : quarterTurns === 1
          ? [pointZ, -pointX]
          : quarterTurns === 2
            ? [-pointX, -pointZ]
            : [-pointZ, pointX];
    gmin = Math.min(gmin, heightAt(positionX + sideX, positionZ + sideZ));
  }
  const floorY = heightAt(positionX, positionZ) + 0.25;
  out.push(
    placeBox(
      -width / 2 - 0.1,
      gmin - 1.2,
      -depth / 2 - 0.1,
      width / 2 + 0.1,
      floorY,
      depth / 2 + 0.1,
      'concrete',
      {
        floor: true,
      },
    ),
  );
  const town = 0.25;
  const FLOOR_HEIGHT = 3.0;
  const win = (lineOffset, openingWidth = 1.1) => ({
    a: lineOffset - openingWidth / 2,
    b: lineOffset + openingWidth / 2,
    y0: 1.0,
    y1: 2.1,
  });
  const door = (lineOffset) => ({ a: lineOffset - 0.65, b: lineOffset + 0.65, y0: 0, y1: 2.25 });
  const stairX = width / 2 - town - 0.65;
  for (let floorIndex = 0; floorIndex < floors; floorIndex++) {
    const positionY = floorY + floorIndex * FLOOR_HEIGHT;
    const height = floorIndex === floors - 1 ? FLOOR_HEIGHT + 0.15 : FLOOR_HEIGHT;
    const keep = (part) => !ruined || random() > 0.35;
    const front =
      floorIndex === 0
        ? [door(-width * 0.15), win(width * 0.28)]
        : [win(-width * 0.25), win(width * 0.25)];
    const back = floorIndex === 0 ? [door(width * 0.2), win(-width * 0.25)] : [win(0)];
    const scratch = [];
    wall(
      placeBox,
      scratch,
      'x',
      -width / 2,
      width / 2,
      -depth / 2 + town / 2,
      town,
      positionY,
      height,
      front,
      material,
    );
    wall(
      placeBox,
      scratch,
      'x',
      -width / 2,
      width / 2,
      depth / 2 - town / 2,
      town,
      positionY,
      height,
      back,
      material,
    );
    wall(
      placeBox,
      scratch,
      'z',
      -depth / 2 + town,
      depth / 2 - town,
      -width / 2 + town / 2,
      town,
      positionY,
      height,
      [win(-depth * 0.2), win(depth * 0.22)],
      material,
    );
    wall(
      placeBox,
      scratch,
      'z',
      -depth / 2 + town,
      depth / 2 - town,
      width / 2 - town / 2,
      town,
      positionY,
      height,
      floors > 1 ? [win(-depth * 0.25)] : [win(0)],
      material,
    );
    if (depth > 8 && width > 8) {
      wall(
        placeBox,
        scratch,
        'x',
        -width / 2 + town,
        stairX - 0.8,
        0.5,
        0.15,
        positionY,
        FLOOR_HEIGHT - 0.05,
        [{ a: -width * 0.1 - 0.5, b: -width * 0.1 + 0.5, y0: 0, y1: 2.2 }],
        material,
      );
    }
    for (const part of scratch) {
      if (keep(part)) {
        out.push(part);
      }
    }
    if (floorIndex === 0 && !ruined) {
      addDoor(placeBox, -width * 0.15, -depth / 2 + town / 2, positionY);
      addDoor(placeBox, width * 0.2, depth / 2 - town / 2, positionY);
    }
    if (floorIndex < floors - 1) {
      const levelY = positionY + FLOOR_HEIGHT;
      const hole0 = depth / 2 - town - 3.3;
      const hole1 = depth / 2 - town;
      out.push(
        placeBox(
          -width / 2 + town,
          levelY - 0.2,
          -depth / 2 + town,
          width / 2 - town,
          levelY,
          hole0,
          'concrete',
          { floor: true },
        ),
      );
      out.push(
        placeBox(-width / 2 + town, levelY - 0.2, hole0, stairX - 0.65, levelY, hole1, 'concrete', {
          floor: true,
        }),
      );
      for (let debrisIndex = 0; debrisIndex < 10; debrisIndex++) {
        const slotZ = hole1 - 0.3 - debrisIndex * 0.3;
        out.push(
          placeBox(
            stairX - 0.65,
            positionY,
            slotZ,
            stairX + 0.65,
            positionY + 0.3 * (debrisIndex + 1),
            slotZ + 0.3,
            'wood',
            {
              floor: true,
              stair: true,
            },
          ),
        );
      }
    }
  }
  if (!ruined) {
    const top = floorY + floors * FLOOR_HEIGHT + 0.15;
    out.push(
      placeBox(
        -width / 2 - 0.3,
        top,
        -depth / 2 - 0.3,
        width / 2 + 0.3,
        top + 0.25,
        depth / 2 + 0.3,
        'roof',
        {
          roof: random() < 0.6 ? 'gable' : 'flat',
        },
      ),
    );
  }
  return {
    x: positionX,
    z: positionZ,
    w: rotation % 2 ? depth : width,
    d: rotation % 2 ? width : depth,
  };
}

function warehouse(out, positionX, positionZ, rotation, width, depth, height, material = 'metal') {
  const placeBox = frame(positionX, positionZ, rotation);
  const floorY = heightAt(positionX, positionZ) + 0.1;
  out.push(
    placeBox(-width / 2, floorY - 1.5, -depth / 2, width / 2, floorY, depth / 2, 'concrete', {
      floor: true,
    }),
  );
  const town = 0.3;
  if (material === 'metal') {
    const top = Math.min(height - 0.8, 4.6);
    const openX = { a: -width / 2 + 1.4, b: width / 2 - 1.4, y0: 0, y1: top };
    const openZ = { a: -depth / 2 + 1.4, b: depth / 2 - 1.4, y0: 0, y1: top };
    wall(
      placeBox,
      out,
      'x',
      -width / 2,
      width / 2,
      -depth / 2 + town / 2,
      town,
      floorY,
      height,
      [openX],
      material,
    );
    wall(
      placeBox,
      out,
      'x',
      -width / 2,
      width / 2,
      depth / 2 - town / 2,
      town,
      floorY,
      height,
      [openX],
      material,
    );
    wall(
      placeBox,
      out,
      'z',
      -depth / 2 + town,
      depth / 2 - town,
      -width / 2 + town / 2,
      town,
      floorY,
      height,
      [openZ],
      material,
    );
    wall(
      placeBox,
      out,
      'z',
      -depth / 2 + town,
      depth / 2 - town,
      width / 2 - town / 2,
      town,
      floorY,
      height,
      [openZ],
      material,
    );
    for (let pointX = -width / 2 + 6; pointX < width / 2 - 3; pointX += 6) {
      for (const spotZ of [-1, 1]) {
        out.push(
          placeBox(
            pointX - 0.15,
            floorY,
            spotZ * (depth / 2 - town / 2) - 0.15,
            pointX + 0.15,
            floorY + top,
            spotZ * (depth / 2 - town / 2) + 0.15,
            material,
          ),
        );
      }
    }
    out.push(
      placeBox(
        -width / 2 - 0.4,
        floorY + height,
        -depth / 2 - 0.4,
        width / 2 + 0.4,
        floorY + height + 0.3,
        depth / 2 + 0.4,
        'metalroof',
      ),
    );
    return {
      x: positionX,
      z: positionZ,
      w: rotation % 2 ? depth : width,
      d: rotation % 2 ? width : depth,
    };
  }
  const gate = { a: -2.8, b: 2.8, y0: 0, y1: 4.6 };
  wall(
    placeBox,
    out,
    'x',
    -width / 2,
    width / 2,
    -depth / 2 + town / 2,
    town,
    floorY,
    height,
    [gate, { a: width / 2 - 4, b: width / 2 - 2.8, y0: 0, y1: 2.2 }],
    material,
  );
  wall(
    placeBox,
    out,
    'x',
    -width / 2,
    width / 2,
    depth / 2 - town / 2,
    town,
    floorY,
    height,
    [gate],
    material,
  );
  const highWindow = (lineOffset) => ({
    a: lineOffset - 1.2,
    b: lineOffset + 1.2,
    y0: 3.4,
    y1: 4.4,
  });
  wall(
    placeBox,
    out,
    'z',
    -depth / 2 + town,
    depth / 2 - town,
    -width / 2 + town / 2,
    town,
    floorY,
    height,
    [highWindow(-depth / 4), highWindow(depth / 4), { a: -0.65, b: 0.65, y0: 0, y1: 2.2 }],
    material,
  );
  wall(
    placeBox,
    out,
    'z',
    -depth / 2 + town,
    depth / 2 - town,
    width / 2 - town / 2,
    town,
    floorY,
    height,
    [highWindow(-depth / 4), highWindow(depth / 4)],
    material,
  );
  out.push(
    placeBox(
      -width / 2 - 0.4,
      floorY + height,
      -depth / 2 - 0.4,
      width / 2 + 0.4,
      floorY + height + 0.3,
      depth / 2 + 0.4,
      'metalroof',
    ),
  );
  return {
    x: positionX,
    z: positionZ,
    w: rotation % 2 ? depth : width,
    d: rotation % 2 ? width : depth,
  };
}

function container(out, positionX, positionZ, rotation, stack = 1, color = 0) {
  const placeBox = frame(positionX, positionZ, rotation);
  const positionY = heightAt(positionX, positionZ);
  const material = ['containerR', 'containerG', 'containerB', 'containerY'][color % 4];
  for (let step = 0; step < stack; step++) {
    out.push(
      placeBox(
        -3.05,
        positionY - 0.3 + step * 2.6,
        -1.22,
        3.05,
        positionY + 2.3 + step * 2.6,
        1.22,
        material,
      ),
    );
  }
  return { x: positionX, z: positionZ, w: rotation % 2 ? 2.5 : 6.2, d: rotation % 2 ? 6.2 : 2.5 };
}

function cylinder(out, positionX, positionZ, radius, height, material) {
  const positionY = heightAt(positionX, positionZ);
  out.push(
    box(
      positionX - radius,
      positionY - 0.5,
      positionZ - radius,
      positionX + radius,
      positionY + height,
      positionZ + radius,
      material,
      { shape: 'cyl' },
    ),
  );
  return { x: positionX, z: positionZ, w: radius * 2, d: radius * 2 };
}

function guardTower(out, positionX, positionZ, rotation, material = 'wood') {
  for (const towerBox of structureBoxes(
    'tower',
    positionX,
    heightAt(positionX, positionZ),
    positionZ,
    rotation,
  )) {
    out.push({ ...towerBox, mat: towerBox.mat === 'wood' ? material : towerBox.mat });
  }
  return { x: positionX, z: positionZ, w: 6, d: 8 };
}

function commTower(out, positionX, positionZ, height = 42) {
  const positionY = heightAt(positionX, positionZ);
  out.push(
    box(
      positionX - 1.2,
      positionY - 0.5,
      positionZ - 1.2,
      positionX + 1.2,
      positionY + height,
      positionZ + 1.2,
      'lattice',
      { shape: 'lattice' },
    ),
  );
  out.push(
    box(
      positionX - 2,
      positionY - 0.5,
      positionZ - 2,
      positionX + 2,
      positionY + 0.4,
      positionZ + 2,
      'concrete',
      { floor: true },
    ),
  );
}

function bunker(out, positionX, positionZ, rotation, width = 5, depth = 4.5) {
  const placeBox = frame(positionX, positionZ, rotation);
  const positionY = heightAt(positionX, positionZ) - 0.2;
  const town = 0.6;
  const slit = (lineOffset, openingWidth) => ({
    a: lineOffset - openingWidth / 2,
    b: lineOffset + openingWidth / 2,
    y0: 1.2,
    y1: 1.55,
  });
  out.push(
    placeBox(
      -width / 2,
      positionY - 1,
      -depth / 2,
      width / 2,
      positionY + 0.1,
      depth / 2,
      'concrete',
      { floor: true },
    ),
  );
  wall(
    placeBox,
    out,
    'x',
    -width / 2,
    width / 2,
    -depth / 2 + town / 2,
    town,
    positionY,
    2.3,
    [slit(-width * 0.22, 1.2), slit(width * 0.22, 1.2)],
    'concrete',
  );
  wall(
    placeBox,
    out,
    'x',
    -width / 2,
    width / 2,
    depth / 2 - town / 2,
    town,
    positionY,
    2.3,
    [{ a: -0.55, b: 0.55, y0: 0, y1: 2.0 }],
    'concrete',
  );
  wall(
    placeBox,
    out,
    'z',
    -depth / 2 + town,
    depth / 2 - town,
    -width / 2 + town / 2,
    town,
    positionY,
    2.3,
    [slit(0, 1)],
    'concrete',
  );
  wall(
    placeBox,
    out,
    'z',
    -depth / 2 + town,
    depth / 2 - town,
    width / 2 - town / 2,
    town,
    positionY,
    2.3,
    [slit(0, 1)],
    'concrete',
  );
  out.push(
    placeBox(
      -width / 2 - 0.3,
      positionY + 2.3,
      -depth / 2 - 0.3,
      width / 2 + 0.3,
      positionY + 2.8,
      depth / 2 + 0.3,
      'concrete',
    ),
  );
  return { x: positionX, z: positionZ, w: width + 1, d: depth + 1 };
}

function lineOf(out, minX, minZ, maxX, maxZ, material, height, town, gaps = []) {
  const alongX = Math.abs(maxX - minX) >= Math.abs(maxZ - minZ);
  const start = alongX ? Math.min(minX, maxX) : Math.min(minZ, maxZ);
  const end = alongX ? Math.max(minX, maxX) : Math.max(minZ, maxZ);
  const lineOffset = alongX ? minZ : minX;
  const seg = 4;
  for (let offset = start; offset < end - 0.01; offset += seg) {
    const segmentEnd = Math.min(end, offset + seg);
    const mid = (offset + segmentEnd) / 2;
    if (gaps.some(([gapStart, gapEnd]) => mid > gapStart && mid < gapEnd)) {
      continue;
    }
    const gateX = alongX ? mid : lineOffset;
    const gateZ = alongX ? lineOffset : mid;
    const positionY = heightAt(gateX, gateZ);
    out.push(
      alongX
        ? box(
            offset,
            positionY - 0.6,
            lineOffset - town / 2,
            segmentEnd,
            positionY + height,
            lineOffset + town / 2,
            material,
          )
        : box(
            lineOffset - town / 2,
            positionY - 0.6,
            offset,
            lineOffset + town / 2,
            positionY + height,
            segmentEnd,
            material,
          ),
    );
  }
}

function fenceRect(out, minX, minZ, maxX, maxZ, gapSide = 'n') {
  const gaps = (offset, box) => [[(offset + box) / 2 - 3, (offset + box) / 2 + 3]];
  lineOf(out, minX, minZ, maxX, minZ, 'fence', 1.0, 0.1, gapSide === 'n' ? gaps(minX, maxX) : []);
  lineOf(out, minX, maxZ, maxX, maxZ, 'fence', 1.0, 0.1, gapSide === 's' ? gaps(minX, maxX) : []);
  lineOf(out, minX, minZ, minX, maxZ, 'fence', 1.0, 0.1, gapSide === 'w' ? gaps(minZ, maxZ) : []);
  lineOf(out, maxX, minZ, maxX, maxZ, 'fence', 1.0, 0.1, gapSide === 'e' ? gaps(minZ, maxZ) : []);
}

export function structureToWorld(positionX, positionZ, rotation, lootX, lootZ) {
  const angle = rotation * (Math.PI / 2);
  const lineOffset = Math.cos(angle);
  const step = Math.sin(angle);
  return [
    positionX + lootX * lineOffset + lootZ * step,
    positionZ - lootX * step + lootZ * lineOffset,
  ];
}

const SLICE_MIN_M = 0.35;
const SLICE_MAX_M = 1;
const SLICES_MAX = 48;
function placeStructureBoxes(local, positionX, positionZ, rotation) {
  const exact = Math.abs(rotation - Math.round(rotation)) < 1e-6;
  const out = [];
  for (const box of local) {
    const width = box.max[0] - box.min[0];
    const depth = box.max[2] - box.min[2];
    let normalX = 1;
    let normalZ = 1;
    if (!exact) {
      const cell = Math.max(SLICE_MIN_M, Math.min(SLICE_MAX_M, Math.min(width, depth)));
      normalX = Math.max(1, Math.ceil(width / cell - 0.01));
      normalZ = Math.max(1, Math.ceil(depth / cell - 0.01));
      while (normalX * normalZ > SLICES_MAX) {
        normalX = Math.max(1, Math.ceil(normalX / 2));
        normalZ = Math.max(1, Math.ceil(normalZ / 2));
      }
    }
    for (let index = 0; index < normalX; index++) {
      for (let cellIndex = 0; cellIndex < normalZ; cellIndex++) {
        const minX = box.min[0] + (width * index) / normalX;
        const maxX = box.min[0] + (width * (index + 1)) / normalX;
        const minZ = box.min[2] + (depth * cellIndex) / normalZ;
        const maxZ = box.min[2] + (depth * (cellIndex + 1)) / normalZ;
        const points = [
          structureToWorld(positionX, positionZ, rotation, minX, minZ),
          structureToWorld(positionX, positionZ, rotation, maxX, minZ),
          structureToWorld(positionX, positionZ, rotation, minX, maxZ),
          structureToWorld(positionX, positionZ, rotation, maxX, maxZ),
        ];
        out.push({
          ...box,
          min: [
            Math.min(...points.map((part) => part[0])),
            box.min[1],
            Math.min(...points.map((part) => part[1])),
          ],
          max: [
            Math.max(...points.map((part) => part[0])),
            box.max[1],
            Math.max(...points.map((part) => part[1])),
          ],
        });
      }
    }
  }
  return out;
}

export function structureBoxes(type, positionX, positionY, positionZ, rotation = 0) {
  const placeBox = frame(0, 0, 0);
  const gaps = positionY - 0.45;
  const out = [];
  switch (type) {
    case 'sandbags':
      out.push(placeBox(-1.5, gaps, -0.4, 1.5, positionY + 1.0, 0.4, 'sandbag'));
      break;
    case 'barricade':
      out.push(placeBox(-1.5, gaps, -0.13, 1.5, positionY + 1.3, 0.13, 'plank'));
      break;
    case 'wall':
      out.push(placeBox(-1.5, gaps, -0.25, 1.5, positionY + 2.8, 0.25, 'concrete'));
      break;
    case 'hesco':
      out.push(placeBox(-2.1, gaps, -0.55, 2.1, positionY + 2.2, 0.55, 'hesco'));
      break;
    case 'hedgehog':
      out.push(
        placeBox(-0.75, gaps, -0.75, 0.75, positionY + 1.0, 0.75, 'steel', { shape: 'hedgehog' }),
      );
      break;
    case 'wire':
      out.push(placeBox(-2, gaps, -0.4, 2, positionY + 0.8, 0.4, 'wire', { soft: true }));
      break;
    case 'cover':
      out.push(placeBox(-1.25, gaps, -0.25, 1.25, positionY + 1.0, 0.25, 'sandbag'));
      break;
    case 'post':
    case 'mg':
    case 'mortar': {
      const step = type === 'mortar' ? 1.5 : 1.8;
      const height = type === 'mortar' ? 0.8 : 1.1;
      out.push(placeBox(-step, gaps, -step, step, positionY + height, -step + 0.7, 'sandbag'));
      out.push(
        placeBox(
          -step,
          gaps,
          -step + 0.7,
          -step + 0.7,
          positionY + height,
          step - (type === 'post' ? 0 : 0.6),
          'sandbag',
        ),
      );
      out.push(
        placeBox(
          step - 0.7,
          gaps,
          -step + 0.7,
          step,
          positionY + height,
          step - (type === 'post' ? 0 : 0.6),
          'sandbag',
        ),
      );
      if (type === 'mg') {
        out.push(
          placeBox(-0.15, gaps, -step + 0.75, 0.15, positionY + 1.05, -step + 1.05, 'steel', {
            prop: 'mg',
          }),
        );
      }
      if (type === 'mortar') {
        out.push(
          placeBox(-0.2, gaps, -0.2, 0.2, positionY + 0.6, 0.2, 'steel', {
            prop: 'mortar',
            soft: true,
          }),
        );
      }
      break;
    }
    case 'tower': {
      const structureHeight = 4.0;
      for (const [pointX, pointZ] of [
        [-1.4, -1.4],
        [1.4, -1.4],
        [-1.4, 1.4],
        [1.4, 1.4],
      ]) {
        out.push(
          placeBox(
            pointX - 0.12,
            gaps,
            pointZ - 0.12,
            pointX + 0.12,
            positionY + structureHeight,
            pointZ + 0.12,
            'wood',
          ),
        );
      }
      out.push(
        placeBox(
          -1.55,
          positionY + structureHeight - 0.2,
          -1.55,
          1.55,
          positionY + structureHeight,
          1.55,
          'wood',
          { floor: true },
        ),
      );
      out.push(
        placeBox(
          -1.55,
          positionY + structureHeight,
          -1.55,
          1.55,
          positionY + structureHeight + 1.0,
          -1.43,
          'plank',
        ),
      );
      out.push(
        placeBox(
          -1.55,
          positionY + structureHeight,
          -1.43,
          -1.43,
          positionY + structureHeight + 1.0,
          1.55,
          'plank',
        ),
      );
      out.push(
        placeBox(
          1.43,
          positionY + structureHeight,
          -1.43,
          1.55,
          positionY + structureHeight + 1.0,
          1.55,
          'plank',
        ),
      );
      out.push(
        placeBox(
          -1.55,
          positionY + structureHeight + 2.2,
          -1.55,
          1.55,
          positionY + structureHeight + 2.35,
          1.55,
          'plank',
        ),
      );
      for (const [pointX, pointZ] of [
        [-1.4, -1.4],
        [1.4, -1.4],
        [-1.4, 1.4],
        [1.4, 1.4],
      ]) {
        out.push(
          placeBox(
            pointX - 0.06,
            positionY + structureHeight,
            pointZ - 0.06,
            pointX + 0.06,
            positionY + structureHeight + 2.2,
            pointZ + 0.06,
            'wood',
          ),
        );
      }
      for (let index = 0; index < 10; index++) {
        const minZ = 1.55 + index * 0.45;
        out.push(
          placeBox(
            -0.5,
            gaps,
            minZ,
            0.5,
            positionY + structureHeight - 0.4 * index,
            minZ + 0.45,
            'wood',
            { floor: true, stair: true },
          ),
        );
      }
      break;
    }
    case 'bunker': {
      const town = 0.5;
      const slit = (lineOffset, openingWidth) => ({
        a: lineOffset - openingWidth / 2,
        b: lineOffset + openingWidth / 2,
        y0: 1.15,
        y1: 1.5,
      });
      wall(
        placeBox,
        out,
        'x',
        -2,
        2,
        -2 + town / 2,
        town,
        gaps,
        2.2 + 0.45,
        [slit(-0.9, 1.0), slit(0.9, 1.0)].map((origin) => ({
          ...origin,
          y0: origin.y0 + 0.45,
          y1: origin.y1 + 0.45,
        })),
        'concrete',
      );
      wall(
        placeBox,
        out,
        'x',
        -2,
        2,
        2 - town / 2,
        town,
        gaps,
        2.65,
        [{ a: -0.5, b: 0.5, y0: 0, y1: 2.45 }],
        'concrete',
      );
      wall(
        placeBox,
        out,
        'z',
        -2 + town,
        2 - town,
        -2 + town / 2,
        town,
        gaps,
        2.65,
        [{ a: -0.45, b: 0.45, y0: 1.6, y1: 1.95 }],
        'concrete',
      );
      wall(
        placeBox,
        out,
        'z',
        -2 + town,
        2 - town,
        2 - town / 2,
        town,
        gaps,
        2.65,
        [{ a: -0.45, b: 0.45, y0: 1.6, y1: 1.95 }],
        'concrete',
      );
      out.push(placeBox(-2.2, positionY + 2.2, -2.2, 2.2, positionY + 2.6, 2.2, 'concrete'));
      break;
    }
    case 'ammo':
      out.push(placeBox(-0.6, gaps, -0.35, 0.6, positionY + 0.7, 0.35, 'ammo', { use: 'ammo' }));
      break;
    case 'medical':
      out.push(
        placeBox(-0.7, gaps, -0.4, 0.7, positionY + 0.85, 0.4, 'medical', { use: 'medical' }),
      );
      break;
    case 'fob':
      out.push(placeBox(-0.5, gaps, -0.4, 0.5, positionY + 1.15, 0.4, 'radio', { use: 'fob' }));
      out.push(placeBox(0.7, gaps, -0.5, 1.9, positionY + 0.7, 0.5, 'crate'));
      break;
    case 'vtent':
      out.push(placeBox(-0.9, gaps, -0.4, 0.9, positionY + 0.8, 0.4, 'crate', { use: 'vtent' }));
      break;
    case 'arsenal':
      out.push(placeBox(-1.2, gaps, -0.5, 1.2, positionY + 1.0, 0.5, 'ammo', { use: 'arsenal' }));
      break;
    default:
  }
  return placeStructureBoxes(out, positionX, positionZ, rotation);
}

const MOUNT_SPOT_Z = { mg: -0.3, mortar: 0.55 };
export function mountSpot(step) {
  return structureToWorld(step.x, step.z, step.rot, 0, MOUNT_SPOT_Z[step.type] ?? 0);
}

export function structureBlocked(world, type, positionX, positionY, positionZ, rotation) {
  const pad = 0.08;
  return structureBoxes(type, positionX, positionY, positionZ, rotation).some((step) =>
    world.grid
      .query(step.min[0], step.min[2], step.max[0], step.max[2], [])
      .some(
        (box) =>
          box.mat !== 'edge' &&
          box.max[1] > positionY + 0.1 &&
          step.min[0] + pad < box.max[0] &&
          step.max[0] - pad > box.min[0] &&
          step.min[2] + pad < box.max[2] &&
          step.max[2] - pad > box.min[2] &&
          step.min[1] < box.max[1] &&
          step.max[1] > box.min[1],
      ),
  );
}

export function structureFootprint(type, positionX, positionY, positionZ, rotation) {
  const boxes = structureBoxes(type, positionX, positionY, positionZ, rotation);
  const floorIndex = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  for (const box of boxes) {
    for (let index = 0; index < 3; index++) {
      floorIndex.min[index] = Math.min(floorIndex.min[index], box.min[index]);
      floorIndex.max[index] = Math.max(floorIndex.max[index], box.max[index]);
    }
  }
  return floorIndex;
}

function buildMap() {
  DOORS.length = 0;
  const random = rng(ACTIVE_MAP === 'ironpass' ? 20261007 : 20251004);
  const boxes = [];
  const lots = [];
  const props = [];
  const uses = [];
  const trees = [];
  const bushes = [];
  const rocks = [];
  const free = (positionX, positionZ, width, depth, pad = 2) =>
    !lots.some(
      (lot) =>
        Math.abs(lot.x - positionX) < (lot.w + width) / 2 + pad &&
        Math.abs(lot.z - positionZ) < (lot.d + depth) / 2 + pad,
    );
  const roadFree = (positionX, positionZ, width, depth) => {
    for (let offset = -width / 2; offset <= width / 2; offset += 2) {
      for (let box = -depth / 2; box <= depth / 2; box += 2) {
        const step = surfaceAt(positionX + offset, positionZ + box);
        if (
          step === SURF.asphalt ||
          step === SURF.dirt ||
          step === SURF.water ||
          step === SURF.sand
        ) {
          return false;
        }
      }
    }
    return true;
  };
  const add = (lot) => lot && lots.push(lot);
  const HOUSE_MATS = ['plaster1', 'plaster2', 'plaster3', 'brick'];

  const vtents = [];
  for (const mainBase of MAIN_BASES) {
    const step = mainBase.team === 0 ? 1 : -1;
    const { x: positionX, z: positionZ } = mainBase;
    const halfSize = 95;
    const gatesX = (worldZ) => {
      const gaps = [[positionX - 8, positionX + 8]];
      for (const road of TERRAIN.roads) {
        for (let gateIndex = 0; gateIndex < road.pts.length - 1; gateIndex++) {
          const [startX, startZ] = road.pts[gateIndex];
          const [endX, endZ] = road.pts[gateIndex + 1];
          if ((startZ - worldZ) * (endZ - worldZ) <= 0 && startZ !== endZ) {
            const centerX = startX + ((worldZ - startZ) / (endZ - startZ)) * (endX - startX);
            if (Math.abs(centerX - positionX) < halfSize) {
              gaps.push([centerX - 9, centerX + 9]);
            }
          }
        }
      }
      return gaps;
    };
    const gatesZ = (worldX) => {
      const gaps = [[positionZ - 7, positionZ + 7]];
      for (const road of TERRAIN.roads) {
        for (let roadPointIndex = 0; roadPointIndex < road.pts.length - 1; roadPointIndex++) {
          const [startX, startZ] = road.pts[roadPointIndex];
          const [endX, endZ] = road.pts[roadPointIndex + 1];
          if ((startX - worldX) * (endX - worldX) <= 0 && startX !== endX) {
            const centerZ = startZ + ((worldX - startX) / (endX - startX)) * (endZ - startZ);
            if (Math.abs(centerZ - positionZ) < halfSize) {
              gaps.push([centerZ - 9, centerZ + 9]);
            }
          }
        }
      }
      return gaps;
    };
    lineOf(
      boxes,
      positionX - halfSize,
      positionZ - halfSize,
      positionX + halfSize,
      positionZ - halfSize,
      'hesco',
      2.2,
      1.1,
      gatesX(positionZ - halfSize),
    );
    lineOf(
      boxes,
      positionX - halfSize,
      positionZ + halfSize,
      positionX + halfSize,
      positionZ + halfSize,
      'hesco',
      2.2,
      1.1,
      [...gatesX(positionZ + halfSize), [positionX + 30, positionX + 44]],
    );
    lineOf(
      boxes,
      positionX - halfSize,
      positionZ - halfSize,
      positionX - halfSize,
      positionZ + halfSize,
      'hesco',
      2.2,
      1.1,
      gatesZ(positionX - halfSize),
    );
    lineOf(
      boxes,
      positionX + halfSize,
      positionZ - halfSize,
      positionX + halfSize,
      positionZ + halfSize,
      'hesco',
      2.2,
      1.1,
      gatesZ(positionX + halfSize),
    );
    lots.push({ x: positionX, z: positionZ, w: halfSize * 2 + 4, d: halfSize * 2 + 4 });
    for (const [centerX, centerZ] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      guardTower(
        boxes,
        positionX + centerX * (halfSize - 5),
        positionZ + centerZ * (halfSize - 5),
        centerZ * step > 0 ? 2 : 0,
      );
    }
    warehouse(boxes, positionX - 55, positionZ - step * 60, 0, 18, 9, 4.2, 'tent');
    warehouse(boxes, positionX - 30, positionZ - step * 60, 0, 18, 9, 4.2, 'tent');
    warehouse(boxes, positionX + 55, positionZ - step * 58, 1, 14, 10, 4.5, 'concrete');
    house(
      boxes,
      positionX + 30,
      positionZ - step * 62,
      mainBase.team === 0 ? 2 : 0,
      12,
      9,
      2,
      'concrete',
      false,
      random,
    );
    for (const [startX, startZ] of [
      [-6, 4],
      [6, 4],
    ]) {
      const pointX = positionX + startX;
      const pointZ = positionZ + step * startZ;
      for (const box of structureBoxes('arsenal', pointX, heightAt(pointX, pointZ), pointZ, 0)) {
        boxes.push({ ...box, team: mainBase.team });
      }
      uses.push({
        use: 'arsenal',
        team: mainBase.team,
        x: pointX,
        y: heightAt(pointX, pointZ),
        z: pointZ,
      });
    }
    for (let currentStep = 0; currentStep < 6; currentStep++) {
      boxes.push(
        ...structureBoxes(
          'sandbags',
          positionX - 40 + currentStep * 16,
          heightAt(positionX - 40 + currentStep * 16, positionZ + step * 30),
          positionZ + step * 30,
          0,
        ),
      );
    }
    const yawOut = step > 0 ? Math.PI : 0;
    const tent = (kind, tentX, tentZ, spots, width = 7, depth = 5) => {
      const tentY = heightAt(tentX, tentZ);
      for (const box of structureBoxes('vtent', tentX, tentY, tentZ, 0)) {
        boxes.push({ ...box, team: mainBase.team, tent: vtents.length });
      }
      vtents.push({
        id: vtents.length,
        kind,
        team: mainBase.team,
        x: tentX,
        z: tentZ,
        spots: spots.map(([spotX, spotZ]) => [spotX, spotZ, yawOut]),
      });
      props.push({
        kind: 'vtent',
        cat: kind,
        team: mainBase.team,
        x: tentX,
        y: tentY,
        z: tentZ + step * 1.6,
        w: width,
        d: depth,
        rot: 0,
      });
    };
    const carSpots = [];
    for (let currentStep = 0; currentStep < 6; currentStep++) {
      carSpots.push([positionX - 80 + currentStep * 12, positionZ + step * 60]);
    }
    tent('car', positionX - 50, positionZ + step * 44, carSpots, 9, 6);
    tent(
      'heavy',
      positionX - 80,
      positionZ + step * 18,
      [
        [positionX - 84, positionZ + step * 36],
        [positionX - 70, positionZ + step * 36],
      ],
      8,
      6,
    );
    for (const pointX of [45, 72]) {
      props.push({
        kind: 'helipad',
        x: positionX + pointX,
        y: heightAt(positionX + pointX, positionZ + step * 40),
        z: positionZ + step * 40,
      });
    }
    tent(
      'heli',
      positionX + 58,
      positionZ + step * 22,
      [
        [positionX + 45, positionZ + step * 40],
        [positionX + 72, positionZ + step * 40],
      ],
      5,
      4,
    );
    props.push({
      kind: 'flag',
      team: mainBase.team,
      x: positionX,
      y: heightAt(positionX, positionZ - step * 20),
      z: positionZ - step * 20,
    });
  }

  if (ACTIVE_MAP === 'ironpass') {
    buildIronLandmarks({
      boxes,
      lots,
      props,
      heightAt,
      box,
      house,
      warehouse,
      container,
      cylinder,
      bunker,
      guardTower,
      commTower,
      lineOf,
      structureBoxes,
      sectors: SECTORS,
      random: random,
    });
  } else {
    {
      const { x: positionX, z: positionZ } = SECTORS[0];
      add(house(boxes, positionX + 22, positionZ - 26, 0, 9, 16, 2, 'stone', false, random));
      boxes.push(
        ...structureBoxes(
          'tower',
          positionX + 22,
          heightAt(positionX + 22, positionZ - 40),
          positionZ - 40,
          0,
        ).map((box) => ({
          ...box,
          mat: box.mat === 'wood' ? 'stone' : box.mat,
        })),
      );
      lots.push({ x: positionX + 22, z: positionZ - 40, w: 4, d: 8 });
      add(bunker(boxes, positionX - 60, positionZ - 55, 0));
      add(bunker(boxes, positionX + 70, positionZ + 30, 3));
      lineOf(
        boxes,
        positionX - 40,
        positionZ + 45,
        positionX + 10,
        positionZ + 45,
        'stone',
        1.1,
        0.6,
        [[positionX - 18, positionX - 12]],
      );
    }
    {
      const { x: positionX, z: positionZ } = SECTORS[1];
      add(warehouse(boxes, positionX - 45, positionZ + 55, 0, 24, 14, 7));
      add(warehouse(boxes, positionX + 35, positionZ + 70, 1, 22, 12, 6.5));
      add(warehouse(boxes, positionX - 40, positionZ - 50, 0, 26, 14, 7, 'brick'));
      add(warehouse(boxes, positionX + 45, positionZ - 40, 0, 20, 12, 6));
      add(cylinder(boxes, positionX + 70, positionZ - 10 - 30, 3.2, 14, 'silo'));
      add(cylinder(boxes, positionX + 78, positionZ - 10 - 30, 3.2, 14, 'silo'));
      for (let step = 0; step < 6; step++) {
        add(
          container(
            boxes,
            positionX - 10 + (step % 3) * 7,
            positionZ + 40 + Math.floor(step / 3) * 4,
            0,
            step % 2 ? 2 : 1,
            step,
          ),
        );
      }
      for (let step = 0; step < 4; step++) {
        add(
          container(boxes, positionX + 10 + step * 4, positionZ - 60, 1, 1 + (step % 2), step + 2),
        );
      }
      add(bunker(boxes, positionX - 30, positionZ + 18, 0));
      add(bunker(boxes, positionX + 30, positionZ - 12, 2));
    }
    {
      const { x: positionX, z: positionZ } = SECTORS[2];
      commTower(boxes, positionX + 4, positionZ - 4);
      lots.push({ x: positionX + 4, z: positionZ - 4, w: 6, d: 6 });
      add(house(boxes, positionX - 14, positionZ + 8, 1, 10, 7, 1, 'concrete', false, random));
      add(bunker(boxes, positionX + 30, positionZ - 30, 0));
      add(bunker(boxes, positionX - 30, positionZ + 34, 2));
      add(bunker(boxes, positionX + 34, positionZ + 26, 1));
      add(guardTower(boxes, positionX - 28, positionZ - 24, 0));
      for (let offset = 0; offset < 12; offset++) {
        const angle = (offset / 12) * Math.PI * 2;
        const road = 38;
        const spotX = positionX + Math.cos(angle) * road;
        const spotZ = positionZ + Math.sin(angle) * road;
        if (offset % 3 === 1) {
          continue;
        }
        boxes.push(
          ...structureBoxes(
            'sandbags',
            spotX,
            heightAt(spotX, spotZ),
            spotZ,
            Math.abs(Math.cos(angle)) > 0.7 ? 1 : 0,
          ),
        );
      }
    }
    {
      const { x: positionX, z: positionZ } = SECTORS[3];
      add(house(boxes, positionX - 30, positionZ - 18, 0, 11, 9, 2, 'plaster2', false, random));
      add(warehouse(boxes, positionX - 34, positionZ + 22, 1, 18, 11, 6.5, 'barn'));
      const originX = positionX + 26;
      const originZ = positionZ - 4;
      lineOf(boxes, originX - 20, originZ - 20, originX + 20, originZ - 20, 'hesco', 2.2, 1.1);
      lineOf(boxes, originX - 20, originZ + 20, originX + 20, originZ + 20, 'hesco', 2.2, 1.1, [
        [originX - 4, originX + 4],
      ]);
      lineOf(boxes, originX - 20, originZ - 20, originX - 20, originZ + 20, 'hesco', 2.2, 1.1, [
        [originZ - 4, originZ + 4],
      ]);
      lineOf(boxes, originX + 20, originZ - 20, originX + 20, originZ + 20, 'hesco', 2.2, 1.1);
      lots.push({ x: originX, z: originZ, w: 44, d: 44 });
      guardTower(boxes, originX - 16, originZ - 16, 0);
      guardTower(boxes, originX + 16, originZ + 12, 2);
      bunker(boxes, originX + 6, originZ - 4, 0, 6, 5);
      fenceRect(boxes, positionX - 80, positionZ + 32, positionX - 52, positionZ + 70, 'n');
    }
  }

  const supplyTents = [];
  for (const sector of SECTORS) {
    let best = null;
    for (let road = 14; road <= sector.r * 0.75 && !best; road += 4) {
      for (let offset = 0; offset < 16 && !best; offset++) {
        const angle = (offset / 16) * Math.PI * 2 + road * 0.13;
        const tentX = sector.x + Math.cos(angle) * road;
        const tentZ = sector.z + Math.sin(angle) * road;
        const surface = surfaceAt(tentX, tentZ);
        if (
          !free(tentX, tentZ, 8, 8, 3) ||
          waterDepth(tentX, tentZ) > 0 ||
          surface === SURF.asphalt ||
          surface === SURF.dirt ||
          surface === SURF.water
        ) {
          continue;
        }
        if (normalAtLocal(tentX, tentZ) < 0.97) {
          continue;
        }
        best = { sector: sector.id, x: tentX, z: tentZ };
      }
    }
    best ||= { sector: sector.id, x: sector.x + 16, z: sector.z + 16 };
    supplyTents.push(best);
    lots.push({ x: best.x, z: best.z, w: 9, d: 9 });
    props.push({
      kind: 'stent',
      sector: sector.id,
      x: best.x,
      y: heightAt(best.x, best.z),
      z: best.z,
    });
  }

  for (const supplyPoint of SUPPLY_POINTS) {
    const { x: positionX, z: positionZ } = supplyPoint;
    if (supplyPoint.name === 'Fuel Depot') {
      for (const [originX, originZ] of [
        [-22, -14],
        [-8, -16],
        [10, -15],
      ]) {
        add(cylinder(boxes, positionX + originX, positionZ + originZ, 5, 6, 'tank'));
      }
      add(warehouse(boxes, positionX + 22, positionZ + 18, 1, 14, 10, 5));
    } else if (supplyPoint.name === 'Lumber Mill') {
      add(warehouse(boxes, positionX - 18, positionZ - 20, 0, 22, 12, 6, 'barn'));
      for (let step = 0; step < 6; step++) {
        const lootX = positionX + 10 + (step % 3) * 6;
        const lootZ = positionZ + 16 + Math.floor(step / 3) * 5;
        boxes.push(
          box(
            lootX - 2.5,
            heightAt(lootX, lootZ) - 0.3,
            lootZ - 1.2,
            lootX + 2.5,
            heightAt(lootX, lootZ) + 1.4,
            lootZ + 1.2,
            'log',
          ),
        );
      }
      lots.push({ x: positionX + 16, z: positionZ + 18, w: 18, d: 12 });
    } else if (supplyPoint.name === 'Grain Silos') {
      for (let step = 0; step < 4; step++) {
        add(cylinder(boxes, positionX - 18 + step * 8, positionZ - 18, 3.4, 16, 'silo'));
      }
      add(warehouse(boxes, positionX + 18, positionZ + 14, 0, 18, 10, 6));
    } else {
      add(warehouse(boxes, positionX - 20, positionZ - 18, 0, 24, 14, 7));
      add(warehouse(boxes, positionX + 22, positionZ - 16, 1, 20, 12, 6));
      for (let step = 0; step < 5; step++) {
        add(container(boxes, positionX - 12 + step * 7, positionZ + 22, 1, 1 + (step % 2), step));
      }
    }
    props.push({
      kind: 'supplysign',
      x: positionX,
      y: heightAt(positionX, positionZ),
      z: positionZ,
    });
    lots.push({ x: positionX, z: positionZ, w: supplyPoint.r * 1.4, d: supplyPoint.r * 1.4 });
  }

  const roads = TERRAIN.roads;
  for (const town of TOWNS) {
    let placed = 0;
    for (let tries = 0; tries < 400 && placed < town.houses; tries++) {
      const road = roads[Math.floor(random() * roads.length)];
      const step = Math.floor(random() * (road.pts.length - 1));
      const [startX, startZ] = road.pts[step];
      const [endX, endZ] = road.pts[step + 1];
      if (Math.hypot(startX - town.x, startZ - town.z) > town.r) {
        continue;
      }
      const deltaX = endX - startX;
      const deltaZ = endZ - startZ;
      const length = Math.hypot(deltaX, deltaZ) || 1;
      const side = random() < 0.5 ? -1 : 1;
      const off = road.hw + 6 + random() * 6;
      const houseX = startX + (-deltaZ / length) * off * side;
      const houseZ = startZ + (deltaX / length) * off * side;
      const frontX = startX - houseX;
      const frontZ = startZ - houseZ;
      const rotation =
        Math.abs(frontX) > Math.abs(frontZ) ? (frontX > 0 ? 3 : 1) : frontZ > 0 ? 2 : 0;
      const width = 7 + Math.floor(random() * 4);
      const depth = 7 + Math.floor(random() * 3);
      const frontWidth = rotation % 2 ? depth : width;
      const frontDepth = rotation % 2 ? width : depth;
      if (
        !free(houseX, houseZ, frontWidth, frontDepth, 3) ||
        !roadFree(houseX, houseZ, frontWidth + 2, frontDepth + 2)
      ) {
        continue;
      }
      if (waterDepth(houseX, houseZ) > 0) {
        continue;
      }
      const floors = random() < 0.3 ? 2 : 1;
      add(
        house(
          boxes,
          houseX,
          houseZ,
          rotation,
          width,
          depth,
          floors,
          HOUSE_MATS[Math.floor(random() * HOUSE_MATS.length)],
          random() < 0.12,
          random,
        ),
      );
      placed++;
      if (
        random() < 0.35 &&
        free(
          houseX + (-deltaZ / length) * side * 10,
          houseZ + (deltaX / length) * side * 10,
          4,
          4,
          1,
        )
      ) {
        const sideX = houseX + (-deltaZ / length) * side * (frontDepth / 2 + 4);
        const sideZ = houseZ + (deltaX / length) * side * (frontDepth / 2 + 4);
        if (roadFree(sideX, sideZ, 4, 4)) {
          lineOf(boxes, sideX - 5, sideZ, sideX + 5, sideZ, 'fence', 1.0, 0.1);
        }
      }
    }
  }

  for (let step = 0, made = 0; step < 900 && made < 26; step++) {
    const positionX = (random() * 2 - 1) * (HALF - 160);
    const positionZ = (random() * 2 - 1) * (HALF - 160);
    const step = surfaceAt(positionX, positionZ);
    if (step !== SURF.grass && step !== SURF.field) {
      continue;
    }
    if (!free(positionX, positionZ, 14, 14, 20) || !roadFree(positionX, positionZ, 14, 14)) {
      continue;
    }
    if (normalAtLocal(positionX, positionZ) < 0.95) {
      continue;
    }
    if (random() < 0.7) {
      add(
        house(
          boxes,
          positionX,
          positionZ,
          Math.floor(random() * 4),
          7 + Math.floor(random() * 3),
          7 + Math.floor(random() * 2),
          1,
          HOUSE_MATS[Math.floor(random() * 4)],
          random() < 0.6,
          random,
        ),
      );
    } else {
      add(
        warehouse(
          boxes,
          positionX,
          positionZ,
          Math.floor(random() * 2),
          14,
          9,
          5,
          random() < 0.5 ? 'barn' : 'metal',
        ),
      );
    }
    made++;
  }

  const CHECKPOINT_HUT_M = 15;
  const checkpoint = (positionX, positionZ, rotation) => {
    for (const originX of [-8, 8]) {
      boxes.push(
        ...structureBoxes(
          'post',
          positionX + (rotation % 2 ? 0 : originX),
          heightAt(
            positionX + (rotation % 2 ? 0 : originX),
            positionZ + (rotation % 2 ? originX : 0),
          ),
          positionZ + (rotation % 2 ? originX : 0),
          rotation,
        ),
      );
    }
    add(
      house(
        boxes,
        positionX + (rotation % 2 ? 0 : CHECKPOINT_HUT_M),
        positionZ + (rotation % 2 ? CHECKPOINT_HUT_M : 0),
        rotation,
        3,
        3,
        1,
        'plaster3',
        false,
        random,
      ),
    );
    for (const originX of [-2.5, 2.5]) {
      boxes.push(
        ...structureBoxes(
          'hedgehog',
          positionX + (rotation % 2 ? 4 : originX),
          heightAt(positionX, positionZ),
          positionZ + (rotation % 2 ? originX : 4),
          0,
        ),
      );
    }
    lots.push({ x: positionX, z: positionZ, w: 22, d: 22 });
  };
  if (ACTIVE_MAP === 'kestrel') {
    checkpoint(-250, -330, 0);
    checkpoint(130, 385, 1);
    checkpoint(690, -260, 0);
    checkpoint(-640, -300, 0);
    for (const [positionX, positionZ] of [
      [-420, -300],
      [420, 250],
      [-360, 300],
      [120, -520],
      [-140, -700],
      [380, 700],
      [880, -60],
      [-830, 140],
    ]) {
      guardTower(boxes, positionX, positionZ, Math.floor(random() * 4));
      for (const origin of [
        [5, 0, 1],
        [-5, 0, 1],
        [0, 5, 0],
      ]) {
        boxes.push(
          ...structureBoxes(
            'sandbags',
            positionX + origin[0],
            heightAt(positionX + origin[0], positionZ + origin[1]),
            positionZ + origin[1],
            origin[2],
          ),
        );
      }
      lots.push({ x: positionX, z: positionZ, w: 14, d: 14 });
    }
  } else {
    for (const [positionX, positionZ, rotation] of [
      [-600, -570, 0],
      [550, 585, 0],
      [-620, 250, 1],
      [760, -380, 1],
    ]) {
      checkpoint(positionX, positionZ, rotation);
    }
  }
  for (const road of roads) {
    for (const bridge of road.bridges) {
      const [positionX, positionZ] = road.pts[Math.max(0, bridge.a - 4)];
      if (free(positionX + 12, positionZ, 6, 6, 2)) {
        add(bunker(boxes, positionX + 12, positionZ, 0));
      }
    }
  }

  const bridges = [];
  for (const road of roads) {
    for (const bridge of road.bridges) {
      const start = Math.max(0, bridge.a - 1);
      const points = road.pts.slice(start, Math.min(road.pts.length, bridge.b + 2));
      const deckAt = (index) =>
        (bridge.ya ?? null) === null
          ? bridge.deck
          : bridge.ya +
            (bridge.yb - bridge.ya) *
              Math.max(0, Math.min(1, (index - bridge.a) / Math.max(1, bridge.b - bridge.a)));
      for (let step = 0; step < points.length - 1; step++) {
        const [startX, startZ] = points[step];
        const [endX, endZ] = points[step + 1];
        const halfWidth = road.hw + 0.6;
        const segments = 3;
        for (let segment = 0; segment < segments; segment++) {
          const startRatio = segment / segments;
          const endRatio = (segment + 1) / segments;
          const minX = startX + (endX - startX) * startRatio;
          const minZ = startZ + (endZ - startZ) * startRatio;
          const maxX = startX + (endX - startX) * endRatio;
          const maxZ = startZ + (endZ - startZ) * endRatio;
          const bx0 = Math.min(minX, maxX) - (halfWidth - 0.3);
          const bx1 = Math.max(minX, maxX) + (halfWidth - 0.3);
          const bz0 = Math.min(minZ, maxZ) - (halfWidth - 0.3);
          const bz1 = Math.max(minZ, maxZ) + (halfWidth - 0.3);
          let tmin = Infinity;
          for (const [sideX, sideZ] of [
            [bx0, bz0],
            [bx1, bz0],
            [bx0, bz1],
            [bx1, bz1],
            [(bx0 + bx1) / 2, (bz0 + bz1) / 2],
          ]) {
            tmin = Math.min(tmin, heightAt(sideX, sideZ));
          }
          const deckHeight = deckAt(start + step + (startRatio + endRatio) / 2);
          const low = deckHeight - 0.7 - tmin < 2.2 ? tmin - 0.5 : deckHeight - 0.7;
          boxes.push(
            box(bx0, low, bz0, bx1, deckHeight + 0.02, bz1, 'bridge', {
              floor: true,
              bridge: true,
            }),
          );
        }
      }
      const span = road.pts.slice(bridge.a, bridge.b + 1);
      const halfPath = road.hw + 0.6 - 0.45;
      for (let step = 0; step < span.length - 1; step++) {
        const [startX, startZ] = span[step];
        const [endX, endZ] = span[step + 1];
        const distance = Math.hypot(endX - startX, endZ - startZ) || 1;
        const normalX = -(endZ - startZ) / distance;
        const normalZ = (endX - startX) / distance;
        for (let currentStep = 0; currentStep < distance; currentStep += 1.2) {
          const pointX = startX + ((endX - startX) * currentStep) / distance;
          const pointZ = startZ + ((endZ - startZ) * currentStep) / distance;
          const deckHeight = deckAt(bridge.a + step + currentStep / distance);
          for (const side of [-1, 1]) {
            const centerX = pointX + normalX * halfPath * side;
            const centerZ = pointZ + normalZ * halfPath * side;
            boxes.push(
              box(
                centerX - 0.15,
                deckHeight,
                centerZ - 0.15,
                centerX + 0.15,
                deckHeight + 1.0,
                centerZ + 0.15,
                'bridge',
                {
                  bridge: true,
                  rail: true,
                },
              ),
            );
          }
        }
      }
      bridges.push({
        pts: points,
        deck: bridge.deck,
        dh: points.map((_, index) => deckAt(start + index)),
        hw: road.hw + 0.6,
      });
    }
  }

  for (let positionX = -HALF + 6; positionX < HALF - 6; positionX += 9) {
    for (let positionZ = -HALF + 6; positionZ < HALF - 6; positionZ += 9) {
      const jitterX = positionX + (random() - 0.5) * 8;
      const jitterZ = positionZ + (random() - 0.5) * 8;
      const step = surfaceAt(jitterX, jitterZ);
      const density =
        step === SURF.forest
          ? 0.85
          : step === SURF.grass
            ? 0.025 + 0.06 * fbm(jitterX / 90, jitterZ / 90, 2, 5)
            : step === SURF.rock
              ? 0.08
              : 0;
      if (random() > density * (ACTIVE_MAP === 'ironpass' ? 0.18 : 1)) {
        continue;
      }
      if (!free(jitterX, jitterZ, 1, 1, 1.5)) {
        continue;
      }
      const positionY = heightAt(jitterX, jitterZ);
      const high = positionY > 120;
      const kind = high || random() < 0.45 ? 'pine' : 'oak';
      const scale = 0.75 + random() * 0.6;
      trees.push({ x: jitterX, y: positionY, z: jitterZ, s: scale, kind, r: random() * 6.28 });
      const trunkRadius = 0.22 * scale;
      boxes.push(
        box(
          jitterX - trunkRadius,
          positionY - 0.5,
          jitterZ - trunkRadius,
          jitterX + trunkRadius,
          positionY + (kind === 'pine' ? 9 : 6.5) * scale,
          jitterZ + trunkRadius,
          'trunk',
          { tree: true },
        ),
      );
      if (step === SURF.forest && random() < 0.5) {
        bushes.push({
          x: jitterX + (random() - 0.5) * 5,
          y: heightAt(jitterX, jitterZ),
          z: jitterZ + (random() - 0.5) * 5,
          s: 0.6 + random() * 0.9,
        });
      }
    }
  }
  for (let step = 0; step < 420; step++) {
    const positionX = (random() * 2 - 1) * (HALF - 40);
    const positionZ = (random() * 2 - 1) * (HALF - 40);
    const step = surfaceAt(positionX, positionZ);
    if (step !== SURF.rock && !(step === SURF.grass && random() < 0.25)) {
      continue;
    }
    if (!free(positionX, positionZ, 3, 3, 1)) {
      continue;
    }
    const width = 1.2 + random() * 2.8;
    const height = 0.8 + random() * 1.8;
    const positionY = heightAt(positionX, positionZ);
    boxes.push(
      box(
        positionX - width / 2,
        positionY - 0.8,
        positionZ - width * 0.4,
        positionX + width / 2,
        positionY + height,
        positionZ + width * 0.4,
        'rock',
        {
          shape: 'rock',
        },
      ),
    );
    rocks.push({ x: positionX, z: positionZ });
  }
  if (ACTIVE_MAP === 'ironpass') {
    for (const box of boxes) {
      if (!box.floor || box.bridge || box.stair) {
        continue;
      }
      const centerX = (box.min[0] + box.max[0]) / 2;
      const centerZ = (box.min[2] + box.max[2]) / 2;
      if (Math.abs(box.max[1] - heightAt(centerX, centerZ)) > 0.8) {
        continue;
      }
      let low = box.min[1];
      for (let positionX = box.min[0]; positionX <= box.max[0] + 0.01; positionX += 2) {
        for (let positionZ = box.min[2]; positionZ <= box.max[2] + 0.01; positionZ += 2) {
          low = Math.min(low, heightAt(positionX, positionZ) - 0.4);
        }
      }
      box.min[1] = low;
    }
  }
  const edge = HALF - 2;
  boxes.push(
    box(-HALF, -50, -HALF, HALF, 600, -edge, 'edge'),
    box(-HALF, -50, edge, HALF, 600, HALF, 'edge'),
    box(-HALF, -50, -HALF, -edge, 600, HALF, 'edge'),
    box(edge, -50, -HALF, HALF, 600, HALF, 'edge'),
  );
  const gridSize = Math.round(Math.sqrt(TERRAIN.roadD.length));
  const roadDist = (positionX, positionZ) => {
    const index = Math.max(0, Math.min(gridSize - 1, Math.round((positionX + HALF) / 4)));
    const innerIndex = Math.max(0, Math.min(gridSize - 1, Math.round((positionZ + HALF) / 4)));
    return TERRAIN.roadD[innerIndex * gridSize + index];
  };
  const LANE = 5.2;
  const onRoad = (box) => {
    for (
      let positionX = box.min[0];
      positionX <= box.max[0] + 0.01;
      positionX += Math.max(0.5, Math.min(1.5, box.max[0] - box.min[0]))
    ) {
      for (
        let positionZ = box.min[2];
        positionZ <= box.max[2] + 0.01;
        positionZ += Math.max(0.5, Math.min(1.5, box.max[2] - box.min[2]))
      ) {
        if (roadDist(positionX, positionZ) < LANE) {
          return true;
        }
      }
    }
    return false;
  };
  const keepsOnRoad = (box) =>
    box.floor || box.bridge || box.mat === 'edge' || box.max[0] - box.min[0] > 60;
  const cut = new Set(boxes.filter((box) => !keepsOnRoad(box) && onRoad(box)));
  const CLUSTER_MAX_M = 30;
  const TOUCH_M = 0.05;
  const HASH_M = 8;
  const hash = new Map();
  const cellsOf = (box) => {
    const out = [];
    for (
      let index = Math.floor(box.min[0] / HASH_M);
      index <= Math.floor(box.max[0] / HASH_M);
      index++
    ) {
      for (
        let currentIndex = Math.floor(box.min[2] / HASH_M);
        currentIndex <= Math.floor(box.max[2] / HASH_M);
        currentIndex++
      ) {
        out.push(`${index},${currentIndex}`);
      }
    }
    return out;
  };
  for (const box of boxes) {
    if (box.bridge || box.mat === 'edge' || box.max[0] - box.min[0] > 60) {
      continue;
    }
    for (const key of cellsOf(box)) {
      if (!hash.has(key)) {
        hash.set(key, []);
      }
      hash.get(key).push(box);
    }
  }
  const touching = (offset, box) =>
    offset.min[0] <= box.max[0] + TOUCH_M &&
    offset.max[0] >= box.min[0] - TOUCH_M &&
    offset.min[1] <= box.max[1] + TOUCH_M &&
    offset.max[1] >= box.min[1] - TOUCH_M &&
    offset.min[2] <= box.max[2] + TOUCH_M &&
    offset.max[2] >= box.min[2] - TOUCH_M;
  const removed = new Set(cut);
  for (const start of cut) {
    const cluster = new Set([start]);
    const queue = [start];
    const extent = { x0: start.min[0], x1: start.max[0], z0: start.min[2], z1: start.max[2] };
    let tooBig = false;
    while (queue.length && !tooBig) {
      const box = queue.pop();
      for (const key of cellsOf(box)) {
        for (const origin of hash.get(key) || []) {
          if (cluster.has(origin) || !touching(box, origin)) {
            continue;
          }
          cluster.add(origin);
          queue.push(origin);
          extent.x0 = Math.min(extent.x0, origin.min[0]);
          extent.x1 = Math.max(extent.x1, origin.max[0]);
          extent.z0 = Math.min(extent.z0, origin.min[2]);
          extent.z1 = Math.max(extent.z1, origin.max[2]);
          if (extent.x1 - extent.x0 > CLUSTER_MAX_M || extent.z1 - extent.z0 > CLUSTER_MAX_M) {
            tooBig = true;
          }
        }
      }
    }
    if (!tooBig) {
      for (const box of cluster) {
        removed.add(box);
      }
    }
  }
  const kept = boxes.filter((box) => !removed.has(box));
  const treesKept = trees.filter((town) => roadDist(town.x, town.z) >= 7);
  const doors = DOORS.filter((door) => !onRoad(door.box));
  return {
    doors,
    boxes: kept,
    props,
    uses,
    trees: treesKept,
    bushes: bushes.filter((town) => roadDist(town.x, town.z) >= LANE),
    vtents,
    supplyTents,
    bridges,
    removedFromRoads: boxes.length - kept.length,
  };
}

function normalAtLocal(positionX, positionZ) {
  const epsilon = 3;
  const deltaX =
    heightAt(positionX + epsilon, positionZ) - heightAt(positionX - epsilon, positionZ);
  const deltaZ =
    heightAt(positionX, positionZ + epsilon) - heightAt(positionX, positionZ - epsilon);
  return (2 * epsilon) / Math.hypot(deltaX, 2 * epsilon, deltaZ);
}

export let MAPDATA = buildMap();
const mapCache = new Map([[ACTIVE_MAP, MAPDATA]]);
export function selectMilMap(id) {
  selectTerrain(id);
  if (!mapCache.has(ACTIVE_MAP)) {
    mapCache.set(ACTIVE_MAP, buildMap());
  }
  const next = mapCache.get(ACTIVE_MAP);
  if (MAPDATA === next) {
    return;
  }
  MAPDATA = next;
  if (!doorCache.has(MAPDATA)) {
    doorCache.set(MAPDATA, new Map((MAPDATA.doors || []).map((depth) => [depth.id, depth])));
  }
  DOOR_BY_ID = doorCache.get(MAPDATA);
}

export class BoxGrid {
  constructor(cell = 24) {
    this.cell = cell;
    this.n = Math.ceil((HALF * 2) / cell) + 2;
    this.cells = new Array(this.n * this.n);
    for (let index = 0; index < this.cells.length; index++) {
      this.cells[index] = [];
    }
    this.stamp = 1;
  }
  ci(value) {
    return Math.max(0, Math.min(this.n - 1, Math.floor((value + HALF) / this.cell) + 1));
  }
  insert(box) {
    box._s = 0;
    const minI = this.ci(box.min[0]);
    const maxI = this.ci(box.max[0]);
    const minJ = this.ci(box.min[2]);
    const maxJ = this.ci(box.max[2]);
    for (let innerIndex = minJ; innerIndex <= maxJ; innerIndex++) {
      for (let index = minI; index <= maxI; index++) {
        this.cells[innerIndex * this.n + index].push(box);
      }
    }
  }
  remove(box) {
    const minI = this.ci(box.min[0]);
    const maxI = this.ci(box.max[0]);
    const minJ = this.ci(box.min[2]);
    const maxJ = this.ci(box.max[2]);
    for (let innerIndex = minJ; innerIndex <= maxJ; innerIndex++) {
      for (let index = minI; index <= maxI; index++) {
        const lineOffset = this.cells[innerIndex * this.n + index];
        const currentIndex = lineOffset.indexOf(box);
        if (currentIndex >= 0) {
          lineOffset.splice(currentIndex, 1);
        }
      }
    }
  }
  query(minX, minZ, maxX, maxZ, out = []) {
    out.length = 0;
    const step = ++this.stamp;
    const minI = this.ci(minX);
    const maxI = this.ci(maxX);
    const minJ = this.ci(minZ);
    const maxJ = this.ci(maxZ);
    for (let innerIndex = minJ; innerIndex <= maxJ; innerIndex++) {
      for (let index = minI; index <= maxI; index++) {
        const lineOffset = this.cells[innerIndex * this.n + index];
        for (let index = 0; index < lineOffset.length; index++) {
          const box = lineOffset[index];
          if (box._s !== step) {
            box._s = step;
            out.push(box);
          }
        }
      }
    }
    return out;
  }
}

export const doorStartsOpen = (id) => id % 3 === 0;
let DOOR_BY_ID = new Map((MAPDATA.doors || []).map((depth) => [depth.id, depth]));
const doorCache = new WeakMap([[MAPDATA, DOOR_BY_ID]]);
export const doorById = (id) => DOOR_BY_ID.get(id);
export function createWorld() {
  const grid = new BoxGrid(24);
  for (const box of MAPDATA.boxes) {
    grid.insert(box);
  }
  const doorOpen = new Map();
  for (const door of MAPDATA.doors || []) {
    const open = doorStartsOpen(door.id);
    doorOpen.set(door.id, open);
    if (!open) {
      grid.insert(door.box);
    }
  }
  return { grid, structs: new Map(), vehicles: [], doorOpen };
}
export function setDoor(world, id, open) {
  const door = DOOR_BY_ID.get(id);
  if (!door || world.doorOpen.get(id) === open) {
    return false;
  }
  world.doorOpen.set(id, open);
  if (open) {
    world.grid.remove(door.box);
  } else {
    world.grid.insert(door.box);
  }
  return true;
}

export function addStructure(world, step) {
  const boxes = structureBoxes(step.type, step.x, step.y, step.z, step.rot).map((box) => ({
    ...box,
    sid: step.id,
    team: step.team,
  }));
  step.boxes = boxes;
  for (const box of boxes) {
    if (!box.soft) {
      world.grid.insert(box);
    }
  }
  world.structs.set(step.id, step);
}
export function removeStructure(world, id) {
  const step = world.structs.get(id);
  if (!step) {
    return;
  }
  for (const box of step.boxes) {
    if (!box.soft) {
      world.grid.remove(box);
    }
  }
  world.structs.delete(id);
}

const scratchList = [];
export function solidsNear(world, positionX, positionZ, road, out = []) {
  world.grid.query(positionX - road, positionZ - road, positionX + road, positionZ + road, out);
  for (const value of world.vehicles) {
    if (
      Math.abs(value.box.min[0] - positionX) < road + 12 &&
      Math.abs(value.box.min[2] - positionZ) < road + 12
    ) {
      for (const part of value.parts || [value.box]) {
        out.push(part);
      }
    }
  }
  return out;
}

export function groundBelowMil(world, positionX, positionZ, positionY, road = 0.3) {
  let gaps = heightAt(positionX, positionZ);
  world.grid.query(
    positionX - road,
    positionZ - road,
    positionX + road,
    positionZ + road,
    scratchList,
  );
  for (const box of scratchList) {
    if (
      positionX + road > box.min[0] &&
      positionX - road < box.max[0] &&
      positionZ + road > box.min[2] &&
      positionZ - road < box.max[2] &&
      box.max[1] <= positionY + 0.05 &&
      box.max[1] > gaps
    ) {
      gaps = box.max[1];
    }
  }
  return gaps;
}

function rayBox(origin, depth, min, max, tMax) {
  let nearT = 0;
  let farT = tMax;
  let nAxis = -1;
  let nSign = 0;
  for (let index = 0; index < 3; index++) {
    if (Math.abs(depth[index]) < 1e-9) {
      if (origin[index] < min[index] || origin[index] > max[index]) {
        return null;
      }
      continue;
    }
    const inv = 1 / depth[index];
    let offset = (min[index] - origin[index]) * inv;
    let box = (max[index] - origin[index]) * inv;
    let step = -1;
    if (offset > box) {
      const scratch = offset;
      offset = box;
      box = scratch;
      step = 1;
    }
    if (offset > nearT) {
      nearT = offset;
      nAxis = index;
      nSign = step;
    }
    if (box < farT) {
      farT = box;
    }
    if (nearT > farT) {
      return null;
    }
  }
  const normal = [0, 0, 0];
  if (nAxis >= 0) {
    normal[nAxis] = nSign;
  }
  return { t: nearT, t1: farT, normal: normal };
}
export { rayBox };

const PEN_COST = {
  door: 0.7,
  plank: 1,
  fence: 0.4,
  wood: 1.6,
  crate: 1,
  ammo: 1.2,
  medical: 1,
  tent: 0.3,
  barn: 1.2,
  wire: 0,
  metal: 2,
  metalroof: 2,
  roof: 3,
  plaster1: 3.5,
  plaster2: 3.5,
  plaster3: 3.5,
};

export function rayWorld(world, origin, depth, maxT, options = {}) {
  const terrainHit = options.noTerrain ? null : rayTerrain(origin, depth, maxT);
  let limit = terrainHit ?? maxT;
  let best = null;
  const grid = world.grid;
  const cell = grid.cell;
  const step = ++grid.stamp;
  let cellI = grid.ci(origin[0]);
  let cellJ = grid.ci(origin[2]);
  const stepX = depth[0] > 0 ? 1 : -1;
  const stepZ = depth[2] > 0 ? 1 : -1;
  const cellMin = (index) => (index - 1) * cell - HALF;
  const tDX = Math.abs(depth[0]) > 1e-9 ? cell / Math.abs(depth[0]) : Infinity;
  const tDZ = Math.abs(depth[2]) > 1e-9 ? cell / Math.abs(depth[2]) : Infinity;
  let tMX =
    Math.abs(depth[0]) > 1e-9
      ? (cellMin(cellI + (depth[0] > 0 ? 1 : 0)) - origin[0]) / depth[0]
      : Infinity;
  let tMZ =
    Math.abs(depth[2]) > 1e-9
      ? (cellMin(cellJ + (depth[2] > 0 ? 1 : 0)) - origin[2]) / depth[2]
      : Infinity;
  const pending = [];
  let pen = options.pen || 0;
  let mult = 1;
  outer: for (let guard = 0; guard < 600; guard++) {
    if (cellI < 0 || cellJ < 0 || cellI >= grid.n || cellJ >= grid.n) {
      break;
    }
    const lineOffset = grid.cells[cellJ * grid.n + cellI];
    for (let index = 0; index < lineOffset.length; index++) {
      const box = lineOffset[index];
      if (box._s === step) {
        continue;
      }
      box._s = step;
      if ((box.soft && !options.soft) || (options.skip && options.skip(box))) {
        continue;
      }
      const height = rayBox(origin, depth, box.min, box.max, limit);
      if (height) {
        pending.push({ t: height.t, t1: height.t1, normal: height.normal, box: box });
      }
    }
    const tNext = Math.min(tMX, tMZ);
    if (pending.length) {
      pending.sort((left, right) => left.t - right.t);
      while (pending.length && pending[0].t <= tNext) {
        const height = pending.shift();
        if (height.t > limit) {
          break;
        }
        const cost = PEN_COST[height.box.mat];
        const thick = height.t1 - height.t;
        if (cost !== undefined && pen > 0 && thick * cost <= pen) {
          pen -= thick * cost;
          mult *= 0.75;
          continue;
        }
        best = {
          t: height.t,
          normal: height.normal,
          mat: height.box.mat,
          box: height.box,
          terrain: false,
          mult,
        };
        limit = height.t;
        break outer;
      }
    }
    if (tNext > limit) {
      break;
    }
    if (tMX < tMZ) {
      tMX += tDX;
      cellI += stepX;
    } else {
      tMZ += tDZ;
      cellJ += stepZ;
    }
  }
  if (!best && (terrainHit ?? null) !== null) {
    best = { t: terrainHit, normal: null, mat: 'terrain', terrain: true, mult: 1 };
  }
  if (best) {
    best.point = [
      origin[0] + depth[0] * best.t,
      origin[1] + depth[1] * best.t,
      origin[2] + depth[2] * best.t,
    ];
    if (!best.normal) {
      const epsilon = 0.8;
      const positionX = best.point[0];
      const positionZ = best.point[2];
      const deltaX =
        heightAt(positionX + epsilon, positionZ) - heightAt(positionX - epsilon, positionZ);
      const deltaZ =
        heightAt(positionX, positionZ + epsilon) - heightAt(positionX, positionZ - epsilon);
      const lot = Math.hypot(deltaX, 2 * epsilon, deltaZ);
      best.normal = [-deltaX / lot, (2 * epsilon) / lot, -deltaZ / lot];
    }
  }
  return best;
}

export function clearLineMil(world, offset, box) {
  const depth = [box[0] - offset[0], box[1] - offset[1], box[2] - offset[2]];
  const length = Math.hypot(depth[0], depth[1], depth[2]);
  if (length < 0.05) {
    return true;
  }
  const hit = rayWorld(
    world,
    offset,
    [depth[0] / length, depth[1] / length, depth[2] / length],
    length - 0.2,
    {
      skip: (endX) => endX.mat === 'edge',
    },
  );
  return !hit;
}

export { RIVER_HALF_W };
