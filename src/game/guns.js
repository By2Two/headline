import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const mat = (config, row = 0.6, metalness = 0.2) =>
  new THREE.MeshStandardMaterial({ color: config, roughness: row, metalness: metalness });
export const box = (
  width,
  height,
  depth,
  material,
  positionX = 0,
  positionY = 0,
  positionZ = 0,
  rotationX = 0,
) => {
  const metalness = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  metalness.position.set(positionX, positionY, positionZ);
  metalness.rotation.x = rotationX;
  return metalness;
};
export const cyl = (row, length, material, positionX, positionY, positionZ) => {
  const metalness = new THREE.Mesh(new THREE.CylinderGeometry(row, row, length, 10), material);
  metalness.rotation.x = Math.PI / 2;
  metalness.position.set(positionX, positionY, positionZ);
  return metalness;
};

export const METAL = mat(0x2b2e33, 0.4, 0.6);
export const DARK = mat(0x1b1d20, 0.5, 0.5);
export const WOOD = mat(0x7a4f2a, 0.8, 0);
export const SKIN = mat(0xd2a27a, 0.9, 0);
export const SLEEVE = mat(0x3a4a3a, 0.9, 0);
export const GREEN = mat(0x3b4a3a, 0.6, 0.3);
export const TAN = mat(0x8c7a5b, 0.7, 0.1);
export const STEEL = mat(0xb9c0c7, 0.25, 0.9);
export const BLACK = mat(0x121315, 0.6, 0.3);
export const GUNMETAL = mat(0x1f2226, 0.5, 0.5);
export const CHROME = mat(0xb9c0c7, 0.25, 0.9);
export const POLY = mat(0x16171a, 0.65, 0.2);
export const GREEN_STOCK = mat(0x3b4a3a, 0.6, 0.3);
export const TAN_STOCK = mat(0x8c7a5b, 0.7, 0.1);

function hands(group, withLeft, leftZ = -0.3) {
  group.add(box(0.05, 0.06, 0.1, SKIN, 0.0, -0.1, 0.03));
  const arm = box(0.075, 0.075, 0.45, SLEEVE, 0.04, -0.14, 0.3, 0.1);
  group.add(arm);
  if (withLeft) {
    group.add(box(0.055, 0.05, 0.1, SKIN, -0.01, -0.045, leftZ));
    group.add(box(0.075, 0.075, 0.45, SLEEVE, -0.08, -0.12, leftZ + 0.3, 0.25));
  }
  return arm;
}

function buildR8(withHands = true) {
  const group = new THREE.Group();
  group.add(box(0.04, 0.05, 0.14, METAL, 0, 0.01, -0.05));
  group.add(cyl(0.012, 0.2, DARK, 0, 0.02, -0.2));
  group.add(box(0.02, 0.012, 0.2, METAL, 0, 0.037, -0.2));
  const cylinder = new THREE.Group();
  cylinder.position.set(0, 0.014, -0.05);
  cylinder.add(cyl(0.03, 0.07, DARK, 0, 0, 0));
  for (let index = 0; index < 4; index++) {
    const groove = box(0.006, 0.064, 0.072, BLACK, 0, 0, 0);
    groove.rotation.z = (index * Math.PI) / 4;
    cylinder.add(groove);
  }
  group.add(cylinder);
  const hammer = new THREE.Group();
  hammer.position.set(0, 0.035, 0.02);
  hammer.add(box(0.012, 0.04, 0.015, DARK, 0, 0.015, 0));
  group.add(hammer);
  group.add(box(0.036, 0.035, 0.06, METAL, 0, -0.022, 0.015));
  group.add(box(0.036, 0.1, 0.05, WOOD, 0, -0.068, 0.032, 0.3));
  group.add(box(0.008, 0.03, 0.04, DARK, 0, -0.03, -0.01));
  if (withHands) {
    hands(group, false);
  }
  return {
    group: group,
    muzzle: new THREE.Vector3(0, 0.02, -0.31),
    base: new THREE.Vector3(0.17, -0.17, -0.3),
    hammer,
    cylinder,
  };
}

const boxGeometry = ([
  sizeX,
  sizeY,
  sizeZ,
  positionX = 0,
  positionY = 0,
  positionZ = 0,
  rotationX = 0,
  rotationY = 0,
  rotationZ = 0,
]) =>
  new THREE.BoxGeometry(sizeX, sizeY, sizeZ).applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(positionX, positionY, positionZ),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rotationX, rotationY, rotationZ)),
      new THREE.Vector3(1, 1, 1),
    ),
  );
const mergedBoxes = (material, specs) =>
  new THREE.Mesh(mergeGeometries(specs.map(boxGeometry)), material);

const sight = (mesh) => {
  mesh.userData.sight = true;
  return mesh;
};

const tube = (
  topRadius,
  bottomRadius,
  length,
  material,
  positionX,
  positionY,
  positionZ,
  segments = 14,
) => {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(topRadius, bottomRadius, length, segments),
    material,
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(positionX, positionY, positionZ);
  return mesh;
};

function addRail(group, { y: positionY, fromZ, toZ, width = 0.02, material = BLACK }) {
  const length = toZ - fromZ;
  const specs = [[width, 0.006, length, 0, positionY, (fromZ + toZ) / 2]];
  for (let positionZ = fromZ + 0.006; positionZ < toZ - 0.004; positionZ += 0.012) {
    specs.push([width + 0.004, 0.004, 0.006, 0, positionY + 0.004, positionZ]);
  }
  group.add(mergedBoxes(material, specs));
}

function addRifleGrip(group, { z: positionZ, material, rake = 0.3, length = 0.1 }) {
  const centerY = -0.04 - (length / 2) * Math.cos(rake);
  const centerZ = positionZ + (length / 2) * Math.sin(rake);
  group.add(box(0.036, length, 0.048, material, 0, centerY, centerZ, -rake));
  group.add(
    box(
      0.038,
      0.012,
      0.05,
      material,
      0,
      centerY - (length / 2) * Math.cos(rake) + 0.004,
      centerZ + (length / 2) * Math.sin(rake),
      -rake,
    ),
  );
  const guardFront = positionZ - 0.075;
  group.add(
    mergedBoxes(DARK, [
      [0.012, 0.006, 0.075, 0, -0.07, (guardFront + positionZ) / 2],
      [0.012, 0.03, 0.006, 0, -0.055, guardFront],
    ]),
  );
  group.add(box(0.007, 0.022, 0.006, DARK, 0, -0.052, positionZ - 0.03, 0.3));
}

function addMagazine(
  group,
  { z: positionZ, height, curve = 0, material = DARK, width = 0.032, depth = 0.058, top = -0.04 },
) {
  const magnitude = new THREE.Group();
  magnitude.position.set(0, top, positionZ);
  magnitude.rotation.x = curve * 0.5;
  magnitude.add(box(width, height * 0.55, depth, material, 0, -height * 0.275, 0));
  const lower = new THREE.Group();
  lower.position.set(0, -height * 0.53, 0);
  lower.rotation.x = curve * 0.5;
  lower.add(box(width, height * 0.5, depth * 0.96, material, 0, -height * 0.25, 0));
  lower.add(box(width + 0.004, 0.01, depth + 0.006, BLACK, 0, -height * 0.5, 0));
  lower.add(
    mergedBoxes(BLACK, [[width + 0.002, height * 0.36, 0.004, 0, -height * 0.25, depth * 0.2]]),
  );
  magnitude.add(lower);
  group.add(magnitude);
}

function addScope(group, { z: positionZ, size }) {
  const firstPart = group.children.length;
  const big = size === 'big';
  const tubeLength = big ? 0.2 : 0.11;
  const radius = big ? 0.017 : 0.014;
  const positionY = 0.072;
  group.add(cyl(radius, tubeLength, DARK, 0, positionY, positionZ));
  group.add(
    tube(
      big ? 0.029 : 0.021,
      radius,
      big ? 0.07 : 0.035,
      DARK,
      0,
      positionY,
      positionZ - tubeLength / 2 - (big ? 0.03 : 0.015),
    ),
  );
  group.add(
    tube(radius, big ? 0.022 : 0.018, 0.04, DARK, 0, positionY, positionZ + tubeLength / 2 + 0.018),
  );
  group.add(
    tube(
      big ? 0.026 : 0.019,
      big ? 0.026 : 0.019,
      0.004,
      BLACK,
      0,
      positionY,
      positionZ - tubeLength / 2 - (big ? 0.065 : 0.033),
    ),
  );
  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.016, 10), BLACK);
  turret.position.set(0, positionY + radius + 0.006, positionZ - 0.01);
  group.add(turret);
  const side = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.016, 10), BLACK);
  side.rotation.z = Math.PI / 2;
  side.position.set(radius + 0.006, positionY, positionZ - 0.01);
  group.add(side);
  for (const ringZ of [positionZ - tubeLength * 0.32, positionZ + tubeLength * 0.32]) {
    group.add(
      mergedBoxes(BLACK, [
        [radius * 2 + 0.008, 0.008, 0.012, 0, positionY + radius + 0.002, ringZ],
        [0.012, positionY - radius - 0.03, 0.012, 0, (positionY - radius + 0.03) / 2, ringZ],
      ]),
    );
  }
  for (const part of group.children.slice(firstPart)) {
    part.traverse((object) => (object.userData.modelScope = true));
  }
}

function addMuzzleDevice(group, { kind, z: positionZ, y: positionY = 0.012, radius = 0.011 }) {
  if (kind === 'brake') {
    group.add(box(radius * 2.6, radius * 2.4, 0.05, DARK, 0, positionY, positionZ - 0.025));
    group.add(
      mergedBoxes(
        BLACK,
        [0, 1, 2].map((index) => [
          radius * 2.8,
          radius * 1.2,
          0.006,
          0,
          positionY,
          positionZ - 0.01 - index * 0.013,
        ]),
      ),
    );
    return positionZ - 0.05;
  }
  if (kind === 'flash') {
    group.add(cyl(radius * 1.45, 0.05, DARK, 0, positionY, positionZ - 0.025));
    group.add(
      mergedBoxes(
        BLACK,
        [-1, 1].flatMap((side) => [
          [0.003, radius * 1.6, 0.03, side * radius * 1.3, positionY, positionZ - 0.032],
          [radius * 1.6, 0.003, 0.03, 0, positionY + side * radius * 1.3, positionZ - 0.032],
        ]),
      ),
    );
    return positionZ - 0.05;
  }
  return positionZ;
}

function addSuppressor(
  group,
  { z: positionZ, y: positionY = 0.012, radius = 0.024, length = 0.26 },
) {
  group.add(cyl(radius, length, BLACK, 0, positionY, positionZ - length / 2));
  group.add(cyl(radius + 0.0015, 0.012, DARK, 0, positionY, positionZ - 0.008));
  group.add(cyl(radius + 0.0015, 0.012, DARK, 0, positionY, positionZ - length + 0.008));
  group.add(
    mergedBoxes(
      DARK,
      [0, 1, 2, 3].map((index) => [
        radius * 2 + 0.002,
        0.004,
        0.004,
        0,
        positionY + radius - 0.001,
        positionZ - 0.05 - index * 0.05,
      ]),
    ),
  );
  return positionZ - length;
}

function addStock(group, { kind, z: positionZ, length = 0.24, material, bullpup = false }) {
  if (bullpup || kind === 'none') {
    return;
  }
  const back = positionZ + length;
  if (kind === 'collapsible') {
    group.add(cyl(0.015, length * 0.9, BLACK, 0, 0.006, positionZ + length * 0.45));
    group.add(box(0.044, 0.07, length * 0.5, material, 0, -0.012, back - length * 0.25));
    group.add(box(0.03, 0.022, length * 0.42, material, 0, 0.032, back - length * 0.26));
    group.add(box(0.046, 0.075, 0.012, BLACK, 0, -0.014, back + 0.004));
  } else if (kind === 'thin') {
    group.add(
      mergedBoxes(
        BLACK,
        [-1, 1].map((side) => [0.006, 0.006, length, side * 0.016, 0.002, positionZ + length / 2]),
      ),
    );
    group.add(box(0.04, 0.06, 0.01, BLACK, 0, -0.01, back));
  } else if (kind === 'skeleton') {
    group.add(
      mergedBoxes(material, [
        [0.03, 0.016, length, 0, 0.018, positionZ + length / 2],
        [0.03, 0.014, length * 0.85, 0, -0.04, positionZ + length * 0.48, -0.12],
        [0.034, 0.08, 0.016, 0, -0.012, back],
      ]),
    );
  } else if (kind === 'wood') {
    group.add(box(0.046, 0.07, length, material, 0, -0.02, positionZ + length / 2, 0.1));
    group.add(box(0.044, 0.04, length * 0.5, material, 0, -0.05, back - length * 0.3, 0.2));
    group.add(box(0.048, 0.092, 0.01, DARK, 0, -0.045, back + 0.002, 0.12));
  } else if (kind === 'sniper') {
    group.add(
      mergedBoxes(material, [
        [0.046, 0.034, length, 0, 0.012, positionZ + length / 2],
        [0.044, 0.03, length * 0.7, 0, -0.065, positionZ + length * 0.62],
        [0.046, 0.1, length * 0.28, 0, -0.024, back - length * 0.14],
        [0.04, 0.06, 0.05, 0, -0.03, positionZ + 0.02, 0.35],
      ]),
    );
    group.add(box(0.036, 0.016, length * 0.42, BLACK, 0, 0.036, back - length * 0.3));
    group.add(box(0.05, 0.11, 0.014, BLACK, 0, -0.026, back + 0.006));
  } else {
    group.add(box(0.045, 0.072, length, material, 0, -0.02, positionZ + length / 2));
    group.add(box(0.043, 0.035, length * 0.6, material, 0, -0.058, back - length * 0.32, 0.18));
    group.add(box(0.047, 0.088, 0.012, BLACK, 0, -0.03, back + 0.004));
  }
}

function addHandguard(group, { kind, z: positionZ, length, material, y: positionY = -0.005 }) {
  const center = positionZ - length / 2;
  if (kind === 'rail') {
    group.add(box(0.056, 0.056, length, material, 0, positionY, center));
    for (const [rotationX, rotationY, rotationZ] of [
      [0, positionY + 0.03, 0],
      [0, positionY - 0.03, Math.PI],
      [0.03, positionY, -Math.PI / 2],
      [-0.03, positionY, Math.PI / 2],
    ]) {
      const rail = new THREE.Group();
      addRail(rail, {
        y: 0,
        fromZ: positionZ - length + 0.01,
        toZ: positionZ - 0.01,
        width: 0.018,
      });
      rail.position.set(rotationX, rotationY, 0);
      rail.rotation.z = rotationZ;
      group.add(rail);
    }
  } else if (kind === 'wood') {
    group.add(box(0.062, 0.046, length, material, 0, positionY - 0.01, center));
    group.add(
      box(0.05, 0.022, length * 0.82, material, 0, positionY + 0.03, center + length * 0.06),
    );
    group.add(
      mergedBoxes(DARK, [
        [0.064, 0.008, 0.012, 0, positionY - 0.01, positionZ - length + 0.008],
        [0.064, 0.05, 0.012, 0, positionY, positionZ - 0.006],
      ]),
    );
  } else if (kind === 'ribbed') {
    group.add(box(0.058, 0.054, length, material, 0, positionY, center));
    const ribs = [];
    for (
      let rotationZ = positionZ - length + 0.015;
      rotationZ < positionZ - 0.01;
      rotationZ += 0.022
    ) {
      ribs.push([0.06, 0.008, 0.008, 0, positionY - 0.022, rotationZ]);
    }
    group.add(mergedBoxes(DARK, ribs));
  } else if (kind === 'tube') {
    group.add(cyl(0.03, length, material, 0, positionY + 0.008, center));
    const slots = [];
    for (
      let rotationZ = positionZ - length + 0.02;
      rotationZ < positionZ - 0.015;
      rotationZ += 0.03
    ) {
      slots.push([0.062, 0.01, 0.016, 0, positionY + 0.008, rotationZ]);
    }
    group.add(mergedBoxes(BLACK, slots));
  }
}

function rifleLike(config, withHands) {
  const group = new THREE.Group();
  const body = config.body ?? GUNMETAL;
  const furn = config.furn ?? POLY;
  const length = config.len ?? 0.46;
  const height = config.hgt ?? 0.08;
  const width = config.wid ?? 0.056;
  const baseZ = config.bullpup ? 0.04 : -0.1;
  const front = baseZ - length / 2;
  const rear = baseZ + length / 2;

  group.add(box(width, height * 0.55, length, body, 0, -height * 0.2, baseZ));
  group.add(box(width * 0.92, height * 0.48, length * 0.98, body, 0, height * 0.24, baseZ));
  group.add(
    box(
      0.004,
      height * 0.22,
      length * 0.18,
      BLACK,
      width / 2,
      height * 0.16,
      baseZ - length * 0.05,
    ),
  );
  group.add(
    box(0.012, 0.012, 0.024, DARK, width / 2 + 0.005, height * 0.24, baseZ + length * 0.12),
  );
  if (config.topRail) {
    addRail(group, { y: height * 0.48 + 0.003, fromZ: front + 0.02, toZ: rear - 0.03 });
  }
  if (config.carry) {
    group.add(box(0.022, 0.03, length * 0.5, BLACK, 0, height / 2 + 0.017, baseZ));
    group.add(
      mergedBoxes(BLACK, [
        [0.016, 0.018, 0.012, 0, height / 2 + 0.004, baseZ - length * 0.22],
        [0.016, 0.018, 0.012, 0, height / 2 + 0.004, baseZ + length * 0.22],
      ]),
    );
  }

  const hgLength = config.hg ?? 0.24;
  const hgFront = front + 0.03 - hgLength;
  if (hgLength > 0) {
    addHandguard(group, {
      kind: config.handguard ?? 'tube',
      z: front + 0.03,
      length: hgLength,
      material: furn,
    });
  }
  const barrelLength = config.barrel ?? 0.3;
  const barrelRadius = config.br ?? 0.011;
  const barrelBack = hgLength > 0 ? hgFront + 0.05 : front + 0.02;
  group.add(cyl(barrelRadius, barrelLength, DARK, 0, 0.012, barrelBack - barrelLength / 2));
  let muzzleZ = barrelBack - barrelLength;
  if (hgLength > 0 && !config.suppressor && config.handguard !== 'none') {
    group.add(box(0.026, 0.03, 0.02, DARK, 0, 0.018, hgFront - 0.012));
  }
  if (!config.scope && !config.carry) {
    group.add(sight(box(0.005, 0.03, 0.006, DARK, 0, 0.04, muzzleZ + 0.05)));
    group.add(
      sight(
        mergedBoxes(
          DARK,
          [-1, 1].map((side) => [0.004, 0.026, 0.012, side * 0.011, 0.038, muzzleZ + 0.05]),
        ),
      ),
    );
    group.add(
      sight(
        mergedBoxes(
          DARK,
          [-1, 1].map((side) => [
            0.006,
            0.016,
            0.01,
            side * 0.007,
            height * 0.48 + 0.008,
            rear - 0.03,
          ]),
        ),
      ),
    );
  }
  if (config.suppressor) {
    muzzleZ = addSuppressor(group, { z: muzzleZ + 0.01 });
  } else {
    muzzleZ = addMuzzleDevice(group, {
      kind: config.muzzle ?? 'flash',
      z: muzzleZ,
      radius: barrelRadius,
    });
  }

  const magZ = config.bullpup ? baseZ + length * 0.3 : baseZ - 0.06;
  if (config.mag === 'box') {
    group.add(box(0.08, 0.12, 0.13, DARK, 0.015, -0.1, magZ));
    group.add(
      mergedBoxes(BLACK, [
        [0.082, 0.006, 0.132, 0.015, -0.1, magZ],
        [0.006, 0.08, 0.06, 0.056, -0.1, magZ],
      ]),
    );
    group.add(box(0.02, 0.03, 0.12, mat(0xb08a3a, 0.4, 0.7), 0.04, -0.02, magZ - 0.1));
  } else if (config.mag === 'top') {
    group.add(box(0.05, 0.03, length * 0.85, BLACK, 0, height / 2 + 0.016, baseZ));
    group.add(
      box(0.044, 0.006, length * 0.7, mat(0x3a3d42, 0.3, 0.4), 0, height / 2 + 0.033, baseZ),
    );
  } else if (config.mag !== 'none' && config.mag !== 'grip') {
    group.add(box(0.04, 0.024, 0.07, body, 0, -0.04, magZ));
    addMagazine(group, {
      z: magZ,
      height: config.magH ?? 0.15,
      curve: config.magCurve ?? 0,
      top: -0.05,
    });
  }

  const gripZ = config.bullpup ? baseZ - length * 0.2 : baseZ + length * 0.28;
  addRifleGrip(group, {
    z: gripZ - 0.02,
    material: furn,
    rake: config.mag === 'grip' ? 0.15 : 0.3,
    length: 0.1,
  });
  if (config.mag === 'grip') {
    addMagazine(group, {
      z: gripZ - 0.01,
      height: config.magH ?? 0.15,
      top: -0.13,
      width: 0.028,
      depth: 0.04,
    });
  }
  if (config.foregrip) {
    group.add(box(0.026, 0.07, 0.03, BLACK, 0, -0.07, (hgLength > 0 ? hgFront : front) + 0.03));
  }

  addStock(group, {
    kind: config.stock ?? 'full',
    z: rear - 0.02,
    length: config.stockLen ?? 0.24,
    material: furn,
    bullpup: config.bullpup,
  });
  if (config.bullpup) {
    group.add(box(width + 0.004, height * 1.1, 0.014, BLACK, 0, -0.01, rear + 0.006));
  }
  if (config.scope) {
    addScope(group, { z: baseZ - 0.03, size: config.scope });
  }
  if (config.bolt) {
    group.add(cyl(0.004, 0.04, DARK, width / 2 + 0.018, 0.02, baseZ + length * 0.2));
    group.children[group.children.length - 1].rotation.set(0, 0, Math.PI / 2);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), DARK);
    knob.position.set(width / 2 + 0.04, 0.012, baseZ + length * 0.2);
    group.add(knob);
  }
  if (config.bipod) {
    for (const side of [-1, 1]) {
      group.add(box(0.01, 0.13, 0.01, DARK, side * 0.03, -0.06, muzzleZ + 0.18, 0.5));
      group.add(box(0.014, 0.008, 0.02, BLACK, side * 0.03, -0.115, muzzleZ + 0.145));
    }
  }
  const support = hgLength > 0 ? front + 0.03 - hgLength / 2 : baseZ - length * 0.3;
  if (withHands) {
    hands(group, true, support);
  }
  return {
    group: group,
    muzzle: new THREE.Vector3(0, 0.012, muzzleZ),
    base: new THREE.Vector3(0.2, -0.2, -0.34),
    support,
    silenced: !!config.suppressor,
  };
}

function buildRifle(height = true) {
  return rifleLike(
    {
      len: 0.46,
      hgt: 0.085,
      body: METAL,
      furn: WOOD,
      handguard: 'wood',
      hg: 0.26,
      barrel: 0.36,
      br: 0.012,
      muzzle: 'brake',
      magH: 0.17,
      magCurve: -0.42,
      stock: 'wood',
      stockLen: 0.27,
    },
    height,
  );
}

function buildM4(height = true) {
  return rifleLike(
    {
      len: 0.44,
      hgt: 0.08,
      handguard: 'rail',
      hg: 0.28,
      barrel: 0.14,
      suppressor: true,
      topRail: true,
      magH: 0.16,
      stock: 'collapsible',
      stockLen: 0.24,
    },
    height,
  );
}

function buildSmg(height = true) {
  return rifleLike(
    {
      len: 0.34,
      hgt: 0.078,
      handguard: 'ribbed',
      hg: 0.13,
      barrel: 0.08,
      suppressor: true,
      magH: 0.15,
      magCurve: -0.3,
      stock: 'thin',
      stockLen: 0.2,
    },
    height,
  );
}

function buildAwp(height = true) {
  return rifleLike(
    {
      len: 0.5,
      hgt: 0.07,
      wid: 0.05,
      body: GREEN,
      furn: GREEN_STOCK,
      handguard: 'tube',
      hg: 0.2,
      barrel: 0.5,
      br: 0.014,
      muzzle: 'brake',
      mag: 'stick',
      magH: 0.09,
      stock: 'sniper',
      stockLen: 0.32,
      scope: 'big',
      bolt: true,
    },
    height,
  );
}

function buildScout(height = true) {
  return rifleLike(
    {
      len: 0.46,
      hgt: 0.062,
      wid: 0.046,
      body: TAN,
      furn: TAN_STOCK,
      handguard: 'tube',
      hg: 0.18,
      barrel: 0.46,
      br: 0.011,
      muzzle: 'flash',
      magH: 0.07,
      stock: 'sniper',
      stockLen: 0.28,
      scope: 'small',
      bolt: true,
    },
    height,
  );
}

function shotgunLike(config, height) {
  const group = new THREE.Group();
  const body = config.body ?? METAL;
  const furn = config.furn ?? WOOD;
  const barrelLength = config.barrel ?? 0.6;
  group.add(box(0.054, 0.05, 0.3, body, 0, -0.008, -0.05));
  group.add(box(0.05, 0.03, 0.29, body, 0, 0.03, -0.052));
  group.add(box(0.004, 0.022, 0.07, BLACK, 0.027, 0.012, -0.07));
  group.add(box(0.02, 0.006, 0.26, DARK, 0, 0.047, -0.05));
  group.add(cyl(0.016, barrelLength, DARK, 0, 0.022, -0.2 - barrelLength / 2));
  group.add(cyl(0.011, 0.012, BLACK, 0, 0.022, -0.2 - barrelLength - 0.004));
  group.add(sight(new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), STEEL)));
  group.children[group.children.length - 1].position.set(0, 0.042, -0.2 - barrelLength + 0.02);
  if (config.mag === 'box') {
    group.add(box(0.042, 0.022, 0.08, body, 0, -0.04, -0.06));
    addMagazine(group, { z: -0.06, height: 0.11, width: 0.04, depth: 0.07, top: -0.05 });
  } else {
    group.add(cyl(0.014, barrelLength * 0.78, DARK, 0, -0.018, -0.2 - barrelLength * 0.39));
    group.add(cyl(0.016, 0.014, BLACK, 0, -0.018, -0.2 - barrelLength * 0.78));
    group.add(box(0.03, 0.03, 0.012, DARK, 0, 0.002, -0.2 - barrelLength * 0.76));
  }
  if (config.stock !== 'none') {
    addStock(group, { kind: 'full', z: 0.1, length: 0.27, material: furn });
  }
  addRifleGrip(group, { z: 0.06, material: furn, rake: 0.32, length: 0.1 });
  const pump = new THREE.Group();
  pump.add(box(0.052, 0.05, 0.17, furn, 0, -0.02, -0.32));
  const grooves = [];
  for (let positionZ = -0.39; positionZ < -0.25; positionZ += 0.018) {
    grooves.push([0.054, 0.004, 0.006, 0, -0.045, positionZ]);
  }
  pump.add(mergedBoxes(DARK, grooves));
  group.add(pump);
  if (height) {
    hands(group, false);
    pump.add(box(0.055, 0.05, 0.1, SKIN, -0.01, -0.045, -0.32));
    pump.add(box(0.075, 0.075, 0.45, SLEEVE, -0.08, -0.12, -0.02, 0.25));
  }
  return {
    group: group,
    muzzle: new THREE.Vector3(0, 0.022, -0.2 - barrelLength),
    base: new THREE.Vector3(0.2, -0.2, -0.34),
    pump: config.pump ? pump : null,
    support: -0.32,
  };
}

function buildShotgun(height = true) {
  return shotgunLike({ barrel: 0.62, pump: true, body: METAL, furn: WOOD }, height);
}

function knifeHandle(group, { length, material, z: positionZ = 0 }) {
  group.add(box(0.03, 0.036, length, material, 0, -0.06, positionZ));
  const rings = [];
  for (let index = 0; index < 4; index++) {
    rings.push([0.032, 0.038, 0.005, 0, -0.06, positionZ - length * 0.3 + index * length * 0.2]);
  }
  group.add(mergedBoxes(DARK, rings));
  group.add(box(0.034, 0.04, 0.014, DARK, 0, -0.06, positionZ + length / 2 + 0.005));
}

function extrudedProfile(drawProfile, thickness, material) {
  const shape = new THREE.Shape();
  drawProfile(shape);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness * 0.4,
    bevelEnabled: true,
    bevelThickness: thickness * 0.3,
    bevelSize: Math.min(0.003, thickness * 0.35),
    bevelSegments: 1,
    curveSegments: 10,
  });
  geometry.translate(0, 0, -thickness * 0.2);
  geometry.rotateY(Math.PI / 2);
  return new THREE.Mesh(geometry, material);
}

function knifeBlade(
  group,
  { length, height, z: positionZ, thickness = 0.008, tipLength = 0.045, style = 'clip' },
) {
  const total = length + tipLength * 0.6;
  const spine = height * 0.45;
  const edge = -height * 0.55;
  const blade = extrudedProfile(
    (shape) => {
      shape.moveTo(0, spine);
      if (style === 'katana') {
        shape.quadraticCurveTo(total * 0.55, spine + height * 0.2, total, spine + height * 0.85);
        shape.lineTo(total - height * 1.3, edge + height * 0.95);
        shape.quadraticCurveTo(total * 0.55, edge + height * 0.2, 0, edge);
      } else if (style === 'claw') {
        shape.quadraticCurveTo(total * 0.65, spine, total, spine + total * 0.5);
        shape.lineTo(total - 0.014, spine + total * 0.48);
        shape.quadraticCurveTo(total * 0.5, edge + height * 0.35, 0, edge);
      } else {
        shape.lineTo(total * 0.66, spine);
        shape.lineTo(total, spine - height * 0.6);
        shape.quadraticCurveTo(total * 0.93, edge * 0.85, total * 0.6, edge);
        shape.lineTo(0, edge);
      }
      shape.closePath();
    },
    thickness,
    STEEL,
  );
  blade.position.set(0, -0.055, positionZ + length / 2);
  group.add(blade);
  if (style === 'clip') {
    group.add(
      box(
        thickness + 0.002,
        height * 0.12,
        length * 0.5,
        DARK,
        0,
        -0.055 + height * 0.14,
        positionZ + length * 0.12,
      ),
    );
  }
}

function meleeHands(group, positionZ = 0, dynamicArm = false) {
  group.add(box(0.064, 0.082, 0.078, SKIN, 0, -0.06, positionZ));
  group.add(box(0.017, 0.04, 0.04, SKIN, 0.038, -0.045, positionZ - 0.016));
  const arm = box(0.075, 0.075, 0.45, SLEEVE, 0.03, -0.085, positionZ + 0.27, 0.06);
  group.add(arm);
  return dynamicArm ? arm : null;
}

function meleeResult(group, height, muzzleZ, base = new THREE.Vector3(0.16, -0.14, -0.3)) {
  const result = { group: group, muzzle: new THREE.Vector3(0, -0.05, muzzleZ), base, melee: true };
  if (height) {
    result.arm = meleeHands(group, 0, true);
  }
  return result;
}

function buildKnife(height = true) {
  const group = new THREE.Group();
  knifeHandle(group, { length: 0.12, material: BLACK });
  group.add(box(0.05, 0.022, 0.016, DARK, 0, -0.06, -0.068));
  knifeBlade(group, { length: 0.2, height: 0.045, z: -0.17 });
  return meleeResult(group, height, -0.3);
}

function buildMachete(height = true) {
  const group = new THREE.Group();
  knifeHandle(group, { length: 0.15, material: BLACK });
  knifeBlade(group, { length: 0.46, height: 0.078, z: -0.305, thickness: 0.009, tipLength: 0.08 });
  return meleeResult(group, height, -0.6, new THREE.Vector3(0.16, -0.12, -0.32));
}

function buildAxe(height = true) {
  const group = new THREE.Group();
  group.add(box(0.034, 0.036, 0.55, WOOD, 0, -0.06, -0.18));
  group.add(
    mergedBoxes(
      BLACK,
      [0, 1, 2, 3].map((index) => [0.037, 0.039, 0.008, 0, -0.06, 0.02 + index * 0.02]),
    ),
  );
  group.add(box(0.03, 0.065, 0.09, DARK, 0, -0.03, -0.42));
  const head = extrudedProfile(
    (shape) => {
      shape.moveTo(-0.022, 0.0);
      shape.lineTo(-0.016, 0.06);
      shape.lineTo(-0.065, 0.135);
      shape.quadraticCurveTo(0, 0.155, 0.06, 0.13);
      shape.lineTo(0.016, 0.06);
      shape.lineTo(0.022, 0.0);
      shape.closePath();
    },
    0.014,
    STEEL,
  );
  head.position.set(0, -0.025, -0.44);
  group.add(head);
  group.add(box(0.03, 0.04, 0.04, DARK, 0, -0.07, -0.43));
  if (height) {
    meleeHands(group, 0.01);
  }
  return {
    group: group,
    muzzle: new THREE.Vector3(0, 0.1, -0.45),
    base: new THREE.Vector3(0.17, -0.16, -0.3),
    melee: true,
  };
}

function buildKarambit(height = true) {
  const group = new THREE.Group();
  knifeHandle(group, { length: 0.11, material: BLACK });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 16), DARK);
  ring.position.set(0, -0.06, 0.08);
  ring.rotation.y = Math.PI / 2;
  group.add(ring);
  group.add(box(0.034, 0.02, 0.012, DARK, 0, -0.06, -0.058));
  knifeBlade(group, {
    length: 0.12,
    height: 0.03,
    z: -0.12,
    thickness: 0.007,
    tipLength: 0.03,
    style: 'claw',
  });
  return meleeResult(group, height, -0.18);
}

function buildButterfly(height = true) {
  const group = new THREE.Group();
  const spin = new THREE.Group();
  spin.position.set(0, -0.06, 0);
  const knife = new THREE.Group();
  knife.position.set(0, 0.06, 0);
  spin.add(knife);
  for (const side of [-1, 1]) {
    knife.add(box(0.012, 0.026, 0.12, METAL, side * 0.01, -0.06, 0.0));
    knife.add(
      mergedBoxes(
        BLACK,
        [0, 1, 2].map((index) => [0.004, 0.012, 0.012, side * 0.017, -0.06, -0.03 + index * 0.03]),
      ),
    );
  }
  knife.add(box(0.03, 0.03, 0.01, DARK, 0, -0.06, 0.063));
  knifeBlade(knife, { length: 0.17, height: 0.036, z: -0.14, thickness: 0.006, tipLength: 0.035 });
  group.add(spin);
  const result = meleeResult(group, height, -0.26);
  result.spin = spin;
  return result;
}

function buildBayonet(height = true) {
  const group = new THREE.Group();
  knifeHandle(group, { length: 0.13, material: WOOD });
  group.add(box(0.07, 0.02, 0.018, DARK, 0, -0.06, -0.072));
  group.add(cyl(0.008, 0.012, DARK, 0.03, -0.06, -0.072));
  knifeBlade(group, { length: 0.26, height: 0.04, z: -0.2 });
  return meleeResult(group, height, -0.37, new THREE.Vector3(0.16, -0.14, -0.32));
}

function buildM9(height = true) {
  const group = new THREE.Group();
  knifeHandle(group, { length: 0.13, material: BLACK });
  group.add(box(0.075, 0.022, 0.02, DARK, 0, -0.06, -0.072));
  knifeBlade(group, { length: 0.25, height: 0.055, z: -0.2, thickness: 0.009, tipLength: 0.05 });
  const teeth = [];
  for (let index = 0; index < 6; index++) {
    teeth.push([0.0095, 0.01, 0.014, 0, -0.024, -0.12 - index * 0.026, 0.4]);
  }
  group.add(mergedBoxes(DARK, teeth));
  return meleeResult(group, height, -0.36, new THREE.Vector3(0.16, -0.14, -0.32));
}

function buildKatana(height = true) {
  const group = new THREE.Group();
  group.add(box(0.03, 0.036, 0.22, BLACK, 0, -0.06, 0.02));
  const wrap = [];
  for (let index = 0; index < 8; index++) {
    wrap.push([0.032, 0.038, 0.01, 0, -0.06, -0.07 + index * 0.025, 0, 0, index % 2 ? 0.5 : -0.5]);
  }
  group.add(mergedBoxes(mat(0x6b1f1f, 0.8, 0), wrap));
  group.add(box(0.034, 0.04, 0.016, DARK, 0, -0.06, 0.135));
  group.add(box(0.07, 0.07, 0.01, DARK, 0, -0.06, -0.095));
  group.add(box(0.034, 0.044, 0.02, mat(0xb08a3a, 0.4, 0.7), 0, -0.058, -0.108));
  knifeBlade(group, { length: 0.62, height: 0.036, z: -0.42, tipLength: 0.05, style: 'katana' });
  const result = meleeResult(group, false, -0.75, new THREE.Vector3(0.17, -0.13, -0.34));
  if (height) {
    const grip = (positionZ) => {
      const hand = new THREE.Group();
      hand.add(box(0.06, 0.072, 0.07, SKIN, 0, -0.06, positionZ));
      hand.add(box(0.016, 0.04, 0.036, SKIN, 0.036, -0.05, positionZ - 0.012));
      return hand;
    };
    group.add(grip(-0.03));
    result.leftHand = grip(0.09);
    group.add(result.leftHand);
    result.arm = box(0.075, 0.075, 0.45, SLEEVE, 0, 0, 0);
    result.arm2 = box(0.075, 0.075, 0.45, SLEEVE, 0, 0, 0);
    group.add(result.arm, result.arm2);
  }
  return result;
}

const SLIDE_BACK_Z = 0.035;

function addPistolGrip(group, { gripMat, panelMat, rake, gripLength, gripTopZ, extendedMag }) {
  const centerY = -0.03 - (gripLength / 2) * Math.cos(rake);
  const centerZ = gripTopZ + (gripLength / 2) * Math.sin(rake);
  group.add(box(0.03, gripLength, 0.046, gripMat, 0, centerY, centerZ, -rake));
  if (panelMat !== gripMat) {
    group.add(box(0.034, gripLength * 0.72, 0.034, panelMat, 0, centerY + 0.006, centerZ, -rake));
  }
  group.add(box(0.03, 0.012, 0.024, gripMat, 0, -0.026, gripTopZ + 0.03));
  const bottomY = centerY - (gripLength / 2) * Math.cos(rake);
  const bottomZ = centerZ + (gripLength / 2) * Math.sin(rake);
  const plateDepth = extendedMag ? 0.05 : 0.009;
  group.add(
    box(
      0.032,
      plateDepth,
      0.048,
      DARK,
      0,
      bottomY - plateDepth / 2 + 0.004,
      bottomZ + (plateDepth / 2) * Math.sin(rake),
      -rake,
    ),
  );
}

function addTriggerGuard(group, frontZ, bottomY = -0.052) {
  const backZ = 0.004;
  group.add(box(0.011, 0.006, backZ - frontZ, DARK, 0, bottomY, (frontZ + backZ) / 2));
  group.add(box(0.011, -0.03 - bottomY + 0.004, 0.006, DARK, 0, (bottomY - 0.03) / 2, frontZ));
  group.add(box(0.006, 0.019, 0.005, DARK, 0, -0.037, frontZ * 0.4, 0.3));
}

function buildSlide({ length, material, height = 0.034, width = 0.031, slideCut = false }) {
  const slide = new THREE.Group();
  const frontZ = SLIDE_BACK_Z - length;
  const topY = 0.008 + height / 2;
  if (slideCut) {
    const rearLength = length * 0.56;
    slide.add(box(width, height, rearLength, material, 0, 0.008, SLIDE_BACK_Z - rearLength / 2));
    const frontLength = length - rearLength;
    const frontCenterZ = frontZ + frontLength / 2;
    for (const side of [-1, 1]) {
      slide.add(
        box(0.006, height * 0.82, frontLength, material, side * 0.0125, 0.004, frontCenterZ),
      );
    }
    slide.add(box(width, 0.012, 0.014, material, 0, topY - 0.006, frontZ + 0.007));
    slide.add(cyl(0.0085, frontLength, DARK, 0, 0.008, frontCenterZ));
  } else {
    slide.add(box(width, height, length, material, 0, 0.008, SLIDE_BACK_Z - length / 2));
  }
  for (let index = 0; index < 5; index++) {
    slide.add(
      box(
        width + 0.003,
        height * 0.62,
        0.003,
        DARK,
        0,
        0.006,
        SLIDE_BACK_Z - 0.012 - index * 0.007,
      ),
    );
  }
  slide.add(box(0.004, 0.012, 0.03, BLACK, width / 2, topY - 0.008, SLIDE_BACK_Z - length * 0.42));
  slide.add(sight(box(0.005, 0.008, 0.006, DARK, 0, topY + 0.004, frontZ + 0.009)));
  for (const side of [-1, 1]) {
    slide.add(
      sight(box(0.009, 0.008, 0.006, DARK, side * 0.0085, topY + 0.004, SLIDE_BACK_Z - 0.006)),
    );
  }
  slide.add(cyl(0.0068, 0.008, DARK, 0, 0.006, frontZ - 0.002));
  slide.add(cyl(0.0042, 0.01, BLACK, 0, 0.006, frontZ - 0.003));
  return { slide, frontZ };
}

function pistolLike(config, height) {
  const group = new THREE.Group();
  const length = config.length ?? 0.19;
  const slideMat = config.slideMat ?? METAL;
  const frameMat = config.frameMat ?? POLY;
  const gripMat = config.gripMat ?? frameMat;
  const pistols = [];
  const slides = [];
  let muzzleZ = 0;
  const buildOne = (positionX) => {
    const pistol = new THREE.Group();
    pistol.position.x = positionX;
    const { slide, frontZ } = buildSlide({
      length,
      material: slideMat,
      height: config.slideHeight,
      slideCut: config.slideCut,
    });
    pistol.add(slide);
    const frameFrontZ = frontZ + length * 0.1;
    const frameLength = SLIDE_BACK_Z - 0.006 - frameFrontZ;
    pistol.add(box(0.029, 0.022, frameLength, frameMat, 0, -0.019, frameFrontZ + frameLength / 2));
    if (config.rail) {
      pistol.add(box(0.024, 0.008, 0.05, frameMat, 0, -0.033, frameFrontZ + 0.03));
      for (let index = 0; index < 3; index++) {
        pistol.add(box(0.026, 0.004, 0.005, DARK, 0, -0.037, frameFrontZ + 0.012 + index * 0.014));
      }
    }
    addTriggerGuard(pistol, config.slideCut ? -0.058 : -0.05);
    addPistolGrip(pistol, {
      gripMat,
      panelMat: config.panelMat ?? gripMat,
      rake: config.rake ?? 0.22,
      gripLength: config.gripLength ?? 0.1,
      gripTopZ: 0.016,
      extendedMag: config.extendedMag,
    });
    if (config.hammer) {
      pistol.add(box(0.01, 0.017, 0.01, DARK, 0, 0.02, SLIDE_BACK_Z + 0.004, -0.35));
    }
    if (config.frontMag) {
      pistol.add(box(0.024, 0.075, 0.03, DARK, 0, -0.068, frameFrontZ + 0.03, 0.3));
      pistol.add(box(0.027, 0.009, 0.036, DARK, 0, -0.105, frameFrontZ + 0.018, 0.3));
    }
    muzzleZ = frontZ - 0.006;
    group.add(pistol);
    pistols.push(pistol);
    slides.push(slide);
  };
  buildOne(0);
  if (config.dual) {
    buildOne(-0.24);
  }
  if (config.suppressor) {
    group.add(cyl(0.008, 0.014, DARK, 0, 0.006, muzzleZ - 0.004));
    group.add(cyl(0.017, 0.15, BLACK, 0, 0.006, muzzleZ - 0.085));
    for (const positionZ of [muzzleZ - 0.014, muzzleZ - 0.156]) {
      group.add(cyl(0.0185, 0.008, DARK, 0, 0.006, positionZ));
    }
    muzzleZ -= 0.162;
  }
  if (height) {
    hands(group, false);
    if (config.dual) {
      pistols[1].add(box(0.05, 0.06, 0.1, SKIN, 0, -0.1, 0.03));
      pistols[1].add(box(0.075, 0.075, 0.45, SLEEVE, -0.04, -0.14, 0.3, 0.1));
    }
  }
  return {
    group: group,
    muzzle: new THREE.Vector3(0, 0.006, muzzleZ),
    base: new THREE.Vector3(config.dual ? 0.12 : 0.17, -0.17, -0.3),
    silenced: !!config.suppressor,
    slides,
    ...(config.dual
      ? {
          leftGrip: new THREE.Vector3(-0.24, -0.1, 0.03),
          muzzle2: new THREE.Vector3(-0.24, 0.006, muzzleZ),
          pistols,
        }
      : null),
  };
}

function buildPistol(height = true) {
  return pistolLike(
    { length: 0.19, slideMat: METAL, frameMat: POLY, hammer: true, rail: true, gripLength: 0.106 },
    height,
  );
}

function buildTec9(height = true) {
  const group = new THREE.Group();
  group.add(box(0.032, 0.044, 0.15, GUNMETAL, 0, 0.002, -0.045));
  const bolt = new THREE.Group();
  bolt.add(cyl(0.005, 0.014, DARK, -0.022, 0.014, -0.06));
  bolt.children[0].rotation.set(0, 0, Math.PI / 2);
  group.add(bolt);
  const shroudCenterZ = -0.163;
  group.add(cyl(0.016, 0.086, BLACK, 0, 0.004, shroudCenterZ));
  for (let index = 0; index < 5; index++) {
    for (const side of [-1, 1]) {
      group.add(
        box(0.004, 0.008, 0.01, DARK, side * 0.015, 0.004, shroudCenterZ - 0.034 + index * 0.017),
      );
    }
  }
  group.add(cyl(0.0065, 0.012, DARK, 0, 0.004, -0.211));
  group.add(cyl(0.004, 0.014, BLACK, 0, 0.004, -0.212));
  group.add(box(0.005, 0.009, 0.006, DARK, 0, 0.024, -0.198));
  group.add(box(0.02, 0.01, 0.008, DARK, 0, 0.028, 0.022));
  group.add(box(0.024, 0.12, 0.03, DARK, 0, -0.078, -0.082));
  group.add(box(0.027, 0.01, 0.034, DARK, 0, -0.14, -0.082));
  addTriggerGuard(group, -0.06);
  addPistolGrip(group, {
    gripMat: POLY,
    panelMat: POLY,
    rake: 0.28,
    gripLength: 0.095,
    gripTopZ: 0.012,
  });
  if (height) {
    hands(group, false);
  }
  return {
    group: group,
    muzzle: new THREE.Vector3(0, 0.004, -0.22),
    base: new THREE.Vector3(0.17, -0.17, -0.3),
    slides: [bolt],
  };
}

function buildDeagle(height = true) {
  const group = new THREE.Group();
  group.add(box(0.036, 0.04, 0.115, CHROME, 0, 0.012, -0.165));
  group.add(box(0.026, 0.012, 0.115, CHROME, 0, 0.036, -0.165));
  group.add(box(0.016, 0.007, 0.2, DARK, 0, 0.045, -0.12));
  group.add(cyl(0.0075, 0.006, BLACK, 0, 0.014, -0.224));
  const slide = new THREE.Group();
  slide.add(box(0.042, 0.048, 0.15, CHROME, 0, 0.012, -0.035));
  for (let index = 0; index < 6; index++) {
    slide.add(box(0.045, 0.03, 0.003, DARK, 0, 0.01, 0.03 - index * 0.007));
  }
  slide.add(box(0.004, 0.014, 0.034, BLACK, 0.021, 0.024, -0.06));
  for (const side of [-1, 1]) {
    slide.add(box(0.006, 0.01, 0.014, DARK, side * 0.023, 0.026, 0.026));
  }
  group.add(slide);
  group.add(box(0.034, 0.026, 0.19, DARK, 0, -0.023, -0.075));
  group.add(box(0.012, 0.022, 0.012, DARK, 0, 0.034, 0.045, -0.4));
  addTriggerGuard(group, -0.068, -0.058);
  addPistolGrip(group, {
    gripMat: POLY,
    panelMat: POLY,
    rake: 0.25,
    gripLength: 0.115,
    gripTopZ: 0.02,
  });
  if (height) {
    hands(group, false);
  }
  return {
    group: group,
    muzzle: new THREE.Vector3(0, 0.014, -0.232),
    base: new THREE.Vector3(0.17, -0.17, -0.3),
    slides: [slide],
  };
}

export function buildC4(height = true) {
  const group = new THREE.Group();
  const CLAY = mat(0xb9a57a, 0.85, 0);
  const TAPE = mat(0x2a2b2e, 0.7, 0.1);
  for (const positionX of [-0.055, 0, 0.055]) {
    group.add(box(0.05, 0.045, 0.26, CLAY, positionX, 0, -0.13));
  }
  group.add(box(0.17, 0.05, 0.03, TAPE, 0, 0, -0.04));
  group.add(box(0.17, 0.05, 0.03, TAPE, 0, 0, -0.22));
  group.add(box(0.11, 0.025, 0.13, BLACK, 0, 0.034, -0.13));
  group.add(box(0.08, 0.004, 0.035, mat(0x7dbb6a, 0.4, 0), 0, 0.048, -0.09));
  const keys = [];
  const KEY = mat(0x8c8f94, 0.5, 0.3);
  for (let row = 0; row < 3; row++) {
    for (let config = 0; config < 3; config++) {
      const keyButton = box(
        0.018,
        0.006,
        0.014,
        KEY,
        -0.025 + config * 0.025,
        0.049,
        -0.125 - row * 0.02,
      );
      keys.push(keyButton);
      group.add(keyButton);
    }
  }
  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.007, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0x400000 }),
  );
  led.position.set(0.042, 0.05, -0.065);
  group.add(led);
  group.add(cyl(0.004, 0.12, mat(0xc0392b, 0.6, 0), 0.07, 0.03, -0.13));
  group.add(cyl(0.004, 0.12, mat(0x2a6fd6, 0.6, 0), -0.07, 0.03, -0.13));
  let finger = null;
  if (height) {
    group.add(box(0.09, 0.05, 0.12, SKIN, 0.02, -0.05, -0.1));
    group.add(box(0.075, 0.075, 0.45, SLEEVE, 0.06, -0.1, 0.18, 0.1));
    finger = new THREE.Group();
    finger.add(box(0.045, 0.035, 0.07, SKIN, -0.05, 0.075, -0.08));
    finger.add(box(0.016, 0.016, 0.05, SKIN, -0.02, 0.07, -0.13));
    finger.add(box(0.075, 0.075, 0.4, SLEEVE, -0.13, 0.04, 0.12, 0.2));
    group.add(finger);
  }
  return {
    group: group,
    muzzle: new THREE.Vector3(0, 0.05, -0.26),
    base: new THREE.Vector3(0.17, -0.25, -0.52),
    bomb: true,
    led,
    keys,
    finger,
  };
}

function nadeHands(group) {
  group.add(box(0.072, 0.048, 0.078, SKIN, 0.006, -0.048, -0.058));
  group.add(box(0.022, 0.03, 0.055, SKIN, -0.036, -0.012, -0.068));
  group.add(box(0.03, 0.03, 0.05, SKIN, 0.034, -0.006, -0.05));
  group.add(box(0.075, 0.075, 0.42, SLEEVE, 0.045, -0.105, 0.17, 0.25));
  const left = new THREE.Group();
  left.add(box(0.045, 0.04, 0.07, SKIN, -0.075, 0.035, -0.04));
  left.add(box(0.016, 0.016, 0.045, SKIN, -0.04, 0.045, -0.062));
  const arm = box(0.065, 0.065, 0.36, SLEEVE, -0.16, -0.07, 0.12, 0.55);
  arm.rotation.y = -0.5;
  left.add(arm);
  group.add(left);
  return left;
}

function nadeModel(height, buildBody, ringPos) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  buildBody(body);
  group.add(body);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.0025, 6, 14), STEEL);
  ring.position.copy(ringPos);
  group.add(ring);
  const left = height ? nadeHands(group) : null;
  return {
    group: group,
    body,
    ring,
    ringBase: ringPos.clone(),
    left,
    muzzle: new THREE.Vector3(0, 0, -0.1),
    base: new THREE.Vector3(0.1, -0.1, -0.28),
    nade: true,
  };
}

function buildHe(height = true) {
  return nadeModel(
    height,
    (group) => {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.036, 14, 10), mat(0x4a5a34, 0.6, 0.2));
      body.scale.set(1, 1.2, 1);
      body.position.set(0, -0.02, -0.06);
      group.add(body);
      const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.025, 10), DARK);
      fuse.position.set(0, 0.03, -0.06);
      group.add(fuse);
      group.add(box(0.012, 0.075, 0.008, STEEL, 0.026, 0.0, -0.06));
    },
    new THREE.Vector3(-0.02, 0.045, -0.06),
  );
}

function buildSmokeNade(height = true) {
  return nadeModel(
    height,
    (group) => {
      const can = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.11, 14),
        mat(0x7b8086, 0.5, 0.4),
      );
      can.position.set(0, 0, -0.06);
      group.add(can);
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0305, 0.0305, 0.025, 14),
        mat(0xd8d8d8, 0.6, 0),
      );
      band.position.set(0, 0.015, -0.06);
      group.add(band);
      group.add(box(0.012, 0.08, 0.008, STEEL, 0.03, 0.01, -0.06));
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 10), DARK);
      top.position.set(0, 0.064, -0.06);
      group.add(top);
    },
    new THREE.Vector3(-0.022, 0.07, -0.06),
  );
}

export function buildDefuseKit(height = true) {
  const group = new THREE.Group();
  const YEL = mat(0xe0b52a, 0.55, 0.1);
  group.add(box(0.05, 0.03, 0.11, YEL, 0, -0.02, -0.07));
  group.add(box(0.046, 0.012, 0.04, mat(0x1b1d20, 0.4, 0.3), 0, -0.001, -0.06));
  group.add(box(0.008, 0.008, 0.05, STEEL, -0.012, -0.02, -0.15));
  group.add(box(0.008, 0.008, 0.05, STEEL, 0.012, -0.02, -0.15));
  group.add(cyl(0.003, 0.08, mat(0xc0392b, 0.6, 0), 0.02, -0.03, -0.17));
  group.add(cyl(0.003, 0.08, mat(0x2a6fd6, 0.6, 0), -0.02, -0.03, -0.17));
  if (height) {
    hands(group, false);
  }
  return {
    group: group,
    muzzle: new THREE.Vector3(0, -0.02, -0.18),
    base: new THREE.Vector3(0.1, -0.2, -0.32),
    kit: true,
  };
}

function compactGroup(group, skip) {
  group.updateMatrixWorld(true);
  const toLocal = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const byMaterial = new Map();
  const merged = [];
  group.traverse((object) => {
    if (!object.isMesh) {
      return;
    }
    for (let node = object; node && node !== group; node = node.parent) {
      if (skip.has(node)) {
        return;
      }
    }
    const geometry = object.geometry.index
      ? object.geometry.toNonIndexed()
      : object.geometry.clone();
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toLocal, object.matrixWorld));
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') {
        geometry.deleteAttribute(name);
      }
    }
    geometry.clearGroups();
    const key = object.userData.sight
      ? `sight:${object.material.uuid}`
      : object.userData.modelScope
        ? `scope:${object.material.uuid}`
        : object.material.uuid;
    if (!byMaterial.has(key)) {
      byMaterial.set(key, {
        material: object.material,
        isSight: !!object.userData.sight,
        isScope: !!object.userData.modelScope,
        geometries: [],
      });
    }
    byMaterial.get(key).geometries.push(geometry);
    merged.push(object);
  });
  for (const object of merged) {
    object.parent.remove(object);
    object.geometry.dispose();
  }
  for (const { material, isSight, isScope, geometries } of byMaterial.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    mesh.castShadow = true;
    mesh.userData.sight = isSight;
    mesh.userData.modelScope = isScope;
    group.add(mesh);
    geometries.forEach((geometry) => geometry.dispose());
  }
}

function compactGun(built) {
  const animated = [
    ...(built.slides ?? []),
    ...(built.pistols ?? []),
    ...(built.keys ?? []),
    built.pump,
    built.hammer,
    built.cylinder,
    built.body,
    built.ring,
    built.left,
    built.finger,
    built.led,
    built.arm,
    built.arm2,
    built.leftHand,
    built.spin,
  ].filter(Boolean);
  const skip = new Set(animated);
  compactGroup(built.group, skip);
  for (const part of animated) {
    if (part.isGroup) {
      compactGroup(part, new Set(animated.filter((other) => other !== part)));
    }
  }
  return built;
}

const RAW_BUILDERS = {
  rifle: buildRifle,
  m4: buildM4,
  smg: buildSmg,
  awp: buildAwp,
  scout: buildScout,
  pistol: buildPistol,
  deagle: buildDeagle,
  knife: buildKnife,
  machete: buildMachete,
  axe: buildAxe,
  katana: buildKatana,
  shotgun: buildShotgun,
  r8: buildR8,
  c4: buildC4,
  defkit: buildDefuseKit,
  he: buildHe,
  smoke: buildSmokeNade,
  karambit: buildKarambit,
  butterfly: buildButterfly,
  bayonet: buildBayonet,
  m9: buildM9,
  m4a4: (height = true) =>
    rifleLike(
      {
        len: 0.44,
        handguard: 'rail',
        hg: 0.26,
        barrel: 0.22,
        carry: true,
        magH: 0.15,
        stock: 'collapsible',
        stockLen: 0.22,
      },
      height,
    ),
  famas: (height = true) =>
    rifleLike(
      {
        bullpup: true,
        len: 0.5,
        carry: true,
        handguard: 'ribbed',
        hg: 0.12,
        barrel: 0.26,
        magH: 0.13,
      },
      height,
    ),
  aug: (height = true) =>
    rifleLike(
      {
        bullpup: true,
        len: 0.52,
        body: GREEN_STOCK,
        furn: GREEN_STOCK,
        handguard: 'tube',
        hg: 0.1,
        barrel: 0.3,
        scope: 'small',
        magH: 0.13,
        foregrip: true,
      },
      height,
    ),
  sg553: (height = true) =>
    rifleLike(
      {
        len: 0.44,
        body: TAN,
        furn: TAN_STOCK,
        handguard: 'ribbed',
        scope: 'small',
        magH: 0.15,
        magCurve: -0.3,
        stock: 'skeleton',
        stockLen: 0.24,
      },
      height,
    ),
  scar20: (height = true) =>
    rifleLike(
      {
        len: 0.5,
        handguard: 'rail',
        hg: 0.3,
        barrel: 0.42,
        muzzle: 'brake',
        scope: 'big',
        magH: 0.1,
        stock: 'sniper',
        stockLen: 0.28,
      },
      height,
    ),
  g3sg1: (height = true) =>
    rifleLike(
      {
        len: 0.5,
        body: METAL,
        furn: GREEN_STOCK,
        handguard: 'ribbed',
        hg: 0.3,
        barrel: 0.42,
        scope: 'big',
        magH: 0.12,
        magCurve: -0.1,
        stockLen: 0.28,
      },
      height,
    ),
  mp9: (height = true) =>
    rifleLike(
      {
        len: 0.3,
        hgt: 0.07,
        hg: 0,
        barrel: 0.08,
        muzzle: 'none',
        mag: 'grip',
        magH: 0.15,
        stock: 'thin',
        stockLen: 0.18,
        foregrip: true,
        topRail: true,
      },
      height,
    ),
  mac10: (height = true) =>
    rifleLike(
      {
        len: 0.24,
        hgt: 0.09,
        wid: 0.06,
        hg: 0,
        barrel: 0.08,
        muzzle: 'none',
        mag: 'grip',
        magH: 0.17,
        stock: 'none',
      },
      height,
    ),
  p90: (height = true) =>
    rifleLike(
      {
        bullpup: true,
        len: 0.42,
        hgt: 0.09,
        handguard: 'ribbed',
        hg: 0.08,
        barrel: 0.12,
        mag: 'top',
        furn: BLACK,
      },
      height,
    ),
  mp7: (height = true) =>
    rifleLike(
      {
        len: 0.3,
        hgt: 0.075,
        handguard: 'rail',
        hg: 0.08,
        barrel: 0.1,
        mag: 'grip',
        magH: 0.14,
        stock: 'thin',
        stockLen: 0.2,
        foregrip: true,
        topRail: true,
      },
      height,
    ),
  xm1014: (height = true) => shotgunLike({ barrel: 0.58, furn: POLY, body: GUNMETAL }, height),
  mag7: (height = true) =>
    shotgunLike({ barrel: 0.36, mag: 'box', stock: 'none', furn: POLY, body: GUNMETAL }, height),
  sawedoff: (height = true) => shotgunLike({ barrel: 0.3, pump: true, stock: 'none' }, height),
  m249: (height = true) =>
    rifleLike(
      {
        len: 0.5,
        hgt: 0.1,
        handguard: 'ribbed',
        hg: 0.26,
        barrel: 0.4,
        br: 0.014,
        mag: 'box',
        stockLen: 0.26,
        bipod: true,
        carry: true,
      },
      height,
    ),
  negev: (height = true) =>
    rifleLike(
      {
        len: 0.48,
        hgt: 0.09,
        handguard: 'rail',
        hg: 0.3,
        barrel: 0.38,
        br: 0.014,
        mag: 'box',
        furn: BLACK,
        stock: 'skeleton',
        stockLen: 0.24,
        bipod: true,
        carry: true,
      },
      height,
    ),
  glock: (height = true) =>
    pistolLike(
      {
        length: 0.18,
        slideMat: GUNMETAL,
        frameMat: POLY,
        rail: true,
        rake: 0.3,
        gripLength: 0.098,
      },
      height,
    ),
  usp: (height = true) =>
    pistolLike(
      {
        length: 0.19,
        slideMat: GUNMETAL,
        frameMat: POLY,
        hammer: true,
        rail: true,
        suppressor: true,
      },
      height,
    ),
  tec9: buildTec9,
  cz75: (height = true) =>
    pistolLike(
      {
        length: 0.19,
        slideMat: METAL,
        frameMat: METAL,
        panelMat: WOOD,
        slideHeight: 0.03,
        hammer: true,
        frontMag: true,
        rake: 0.2,
      },
      height,
    ),
  dualies: (height = true) =>
    pistolLike(
      {
        length: 0.21,
        slideMat: STEEL,
        frameMat: STEEL,
        panelMat: BLACK,
        slideCut: true,
        hammer: true,
        dual: true,
      },
      height,
    ),
};

export const BUILDERS = Object.fromEntries(
  Object.entries(RAW_BUILDERS).map(([id, build]) => [
    id,
    (height = true) => compactGun(build(height)),
  ]),
);
