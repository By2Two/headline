import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { structureBoxes } from '../../../shared/milsim/world.js';

const QUARTER_TURN = Math.PI / 2;
const standardMaterial = (color, roughness = 0.8, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });
const LOCAL = {
  burlap: standardMaterial(0xa08d63, 0.97),
  burlapDark: standardMaterial(0x86744f, 0.97),
  dirt: standardMaterial(0x6b5a3e, 1),
  geotextile: standardMaterial(0xb3a27a, 0.95),
  gunmetal: standardMaterial(0x22252a, 0.45, 0.6),
  olive: standardMaterial(0x4a5236, 0.8, 0.1),
  oliveDark: standardMaterial(0x353b27, 0.8, 0.1),
  rust: standardMaterial(0x5a3d2a, 0.7, 0.4),
  canvas: standardMaterial(0x6d6a4c, 0.95),
  white: standardMaterial(0xe6e2d6, 0.8),
  red: standardMaterial(0xa8241e, 0.7),
  rope: standardMaterial(0x8f7d58, 1),
};

let MATS = null;
export function setStructModelMaterials(materials) {
  MATS = materials;
}
const materialByName = (name) => LOCAL[name] || MATS?.[name] || LOCAL.olive;

class Kit {
  constructor() {
    this.parts = new Map();
    this.matrix = new THREE.Matrix4();
    this.euler = new THREE.Euler();
    this.quat = new THREE.Quaternion();
  }

  add(
    geometry,
    material,
    positionX,
    positionY,
    positionZ,
    rotationX = 0,
    rotationY = 0,
    rotationZ = 0,
    scaleX = 1,
    scaleY = 1,
    scaleZ = 1,
  ) {
    this.euler.set(rotationX, rotationY, rotationZ, 'YXZ');
    this.quat.setFromEuler(this.euler);
    this.matrix.compose(
      new THREE.Vector3(positionX, positionY, positionZ),
      this.quat,
      new THREE.Vector3(scaleX, scaleY, scaleZ),
    );
    const placed = geometry.clone().applyMatrix4(this.matrix);
    if (!this.parts.has(material)) {
      this.parts.set(material, []);
    }
    this.parts.get(material).push(placed.index ? placed.toNonIndexed() : placed);
    return this;
  }

  box(
    width,
    height,
    depth,
    material,
    positionX,
    positionY,
    positionZ,
    rotationX = 0,
    rotationY = 0,
    rotationZ = 0,
  ) {
    return this.add(
      new THREE.BoxGeometry(width, height, depth),
      materialByName(material),
      positionX,
      positionY,
      positionZ,
      rotationX,
      rotationY,
      rotationZ,
    );
  }

  cylinder(
    rTop,
    rBottom,
    height,
    material,
    positionX,
    positionY,
    positionZ,
    rotationX = 0,
    rotationY = 0,
    rotationZ = 0,
    segments = 8,
  ) {
    return this.add(
      new THREE.CylinderGeometry(rTop, rBottom, height, segments),
      materialByName(material),
      positionX,
      positionY,
      positionZ,
      rotationX,
      rotationY,
      rotationZ,
    );
  }

  rod(start, end, radius, material, segments = 5) {
    const direction = new THREE.Vector3(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
    const length = direction.length();
    const geometry = new THREE.CylinderGeometry(radius, radius, length, segments);
    geometry.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()),
    );
    geometry.translate((start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2);
    if (!this.parts.has(materialByName(material))) {
      this.parts.set(materialByName(material), []);
    }
    this.parts.get(materialByName(material)).push(geometry.toNonIndexed());
    return this;
  }

  build(group = new THREE.Group()) {
    for (const [material, list] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
}

const BAG_LEN = 0.56;
const BAG_H = 0.2;
const bagGeometry = (() => {
  const geometry = new THREE.CapsuleGeometry(0.1, BAG_LEN - 0.2, 3, 8);
  geometry.rotateZ(Math.PI / 2);
  geometry.scale(1, 1, 1.55);
  return geometry;
})();

function bagWall(kit, startX, startZ, endX, endZ, height, rows = 1) {
  const length = Math.hypot(endX - startX, endZ - startZ);
  const angle = Math.atan2(-(endZ - startZ), endX - startX);
  const directionX = (endX - startX) / length;
  const directionZ = (endZ - startZ) / length;
  const layers = Math.max(1, Math.round(height / BAG_H));
  for (let layer = 0; layer < layers; layer++) {
    const offset = layer % 2 ? BAG_LEN / 2 : 0;
    const count = Math.floor((length - offset) / BAG_LEN);
    for (let row = 0; row < rows; row++) {
      const depth = (row - (rows - 1) / 2) * 0.34;
      for (let step = 0; step < count; step++) {
        const along =
          offset + BAG_LEN / 2 + step * BAG_LEN + (length - offset - count * BAG_LEN) / 2;
        const jitter = Math.sin(layer * 7.1 + step * 3.7 + row) * 0.02;
        kit.add(
          bagGeometry,
          (layer + step + row) % 3 ? LOCAL.burlap : LOCAL.burlapDark,
          startX + directionX * along - directionZ * depth,
          BAG_H / 2 + layer * (BAG_H * 0.92),
          startZ + directionZ * along + directionX * depth,
          0,
          angle + jitter,
          jitter,
        );
      }
    }
  }
}

function crate(
  kit,
  width,
  height,
  depth,
  material,
  positionX,
  positionY,
  positionZ,
  rotationY = 0,
) {
  kit.box(
    width,
    height,
    depth,
    material,
    positionX,
    positionY + height / 2,
    positionZ,
    0,
    rotationY,
  );
  for (const offsetX of [-1, 1]) {
    kit.box(
      0.04,
      height + 0.01,
      depth + 0.01,
      'wood',
      positionX + Math.cos(rotationY) * offsetX * (width / 2 - 0.02),
      positionY + height / 2,
      positionZ - Math.sin(rotationY) * offsetX * (width / 2 - 0.02),
      0,
      rotationY,
    );
  }
}

function ammoCan(kit, positionX, positionY, positionZ, rotationY = 0) {
  kit.box(0.28, 0.18, 0.12, 'olive', positionX, positionY + 0.09, positionZ, 0, rotationY);
  kit.box(0.2, 0.02, 0.03, 'gunmetal', positionX, positionY + 0.19, positionZ, 0, rotationY);
}

const MODELS = {
  sandbags(kit) {
    bagWall(kit, -1.5, 0, 1.5, 0, 1.0, 2);
  },
  cover(kit) {
    bagWall(kit, -1.25, 0, 1.25, 0, 1.0, 1);
  },
  barricade(kit) {
    for (const positionX of [-1.35, 0, 1.35]) {
      kit.box(0.12, 1.45, 0.12, 'wood', positionX, 0.6, 0);
    }
    for (const positionY of [0.25, 0.65, 1.05]) {
      kit.box(3, 0.2, 0.05, 'plank', 0, positionY, -0.08, 0, 0, Math.sin(positionY * 9) * 0.03);
    }
    kit.box(1.6, 0.12, 0.05, 'plank', -0.68, 0.65, 0.08, 0, 0, 0.62);
    kit.box(1.6, 0.12, 0.05, 'plank', 0.68, 0.65, 0.08, 0, 0, -0.62);
  },
  wall(kit) {
    kit.box(3, 2.6, 0.24, 'concrete', 0, 1.5, 0);
    kit.box(3, 0.32, 0.5, 'concrete', 0, 0.16, 0);
    kit.box(3, 0.18, 0.36, 'concrete', 0, 0.38, 0);
    for (const positionX of [-0.9, 0.9]) {
      kit.add(
        new THREE.TorusGeometry(0.07, 0.015, 4, 10, Math.PI),
        materialByName('steel'),
        positionX,
        2.8,
        0,
      );
    }
  },
  hesco(kit) {
    for (const centerX of [-1.05, 1.05]) {
      kit.box(2.02, 2.1, 1.02, 'geotextile', centerX, 1.05, 0);
      kit.box(1.9, 0.06, 0.9, 'dirt', centerX, 2.11, 0);
      for (let step = 0; step <= 6; step++) {
        const positionX = centerX - 1.03 + (step * 2.06) / 6;
        for (const positionZ of [-0.53, 0.53]) {
          kit.rod([positionX, 0, positionZ], [positionX, 2.15, positionZ], 0.012, 'wire', 4);
        }
      }
      for (let step = 0; step <= 6; step++) {
        const positionY = (step * 2.15) / 6;
        for (const positionZ of [-0.53, 0.53]) {
          kit.rod(
            [centerX - 1.03, positionY, positionZ],
            [centerX + 1.03, positionY, positionZ],
            0.01,
            'wire',
            4,
          );
        }
        for (const positionX of [centerX - 1.03, centerX + 1.03]) {
          kit.rod([positionX, positionY, -0.53], [positionX, positionY, 0.53], 0.01, 'wire', 4);
        }
      }
    }
  },
  hedgehog(kit) {
    const beams = [
      [
        [-0.7, 0.05, -0.4],
        [0.7, 1.0, 0.4],
      ],
      [
        [0.7, 0.05, -0.4],
        [-0.7, 1.0, 0.4],
      ],
      [
        [0, 0.05, 0.75],
        [0, 1.0, -0.75],
      ],
    ];
    for (const [beam, box] of beams) {
      kit.rod(beam, box, 0.07, 'rust', 4);
      kit.rod(
        [beam[0] + 0.05, beam[1], beam[2]],
        [box[0] + 0.05, box[1], box[2]],
        0.025,
        'steel',
        4,
      );
    }
  },
  wire(kit) {
    const coil = (positionY, positionZ, radius) => {
      const turns = 22;
      const points = [];
      for (let step = 0; step <= turns * 10; step++) {
        const angle = (step / 10) * Math.PI * 2;
        points.push(
          new THREE.Vector3(
            -1.9 + (3.8 * step) / (turns * 10),
            positionY + Math.sin(angle) * radius,
            positionZ + Math.cos(angle) * radius,
          ),
        );
      }
      kit.add(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), turns * 10, 0.008, 3),
        materialByName('wire'),
        0,
        0,
        0,
      );
    };
    coil(0.3, -0.18, 0.3);
    coil(0.3, 0.18, 0.3);
    coil(0.78, 0, 0.26);
    for (const positionX of [-1.8, 0, 1.8]) {
      kit.box(0.04, 1.1, 0.04, 'steel', positionX, 0.5, 0);
    }
  },
  post(kit) {
    bagWall(kit, -1.8, -1.45, 1.8, -1.45, 1.1, 2);
    bagWall(kit, -1.45, -1.1, -1.45, 1.8, 1.1, 2);
    bagWall(kit, 1.45, -1.1, 1.45, 1.8, 1.1, 2);
  },
  mg(kit, group) {
    bagWall(kit, -1.8, -1.45, 1.8, -1.45, 1.1, 2);
    bagWall(kit, -1.45, -1.1, -1.45, 1.2, 1.1, 2);
    bagWall(kit, 1.45, -1.1, 1.45, 1.2, 1.1, 2);
    ammoCan(kit, 0.9, 0, -0.6);
    ammoCan(kit, 0.95, 0.18, -0.6, 0.2);
    ammoCan(kit, -0.9, 0, -0.5, -0.3);
    group.userData.mg = mountedGun(group, 0, -0.9);
  },
  mortar(kit, group) {
    bagWall(kit, -1.5, -1.15, 1.5, -1.15, 0.8, 2);
    bagWall(kit, -1.15, -0.8, -1.15, 0.9, 0.8, 2);
    bagWall(kit, 1.15, -0.8, 1.15, 0.9, 0.8, 2);
    crate(kit, 0.55, 0.3, 0.35, 'olive', 0.55, 0, 0.45, 0.3);
    crate(kit, 0.55, 0.3, 0.35, 'olive', 0.6, 0.3, 0.42, 0.1);
    group.userData.mortar = mortarTube(group);
  },
  tower(kit) {
    const towerHeight = 4;
    for (const [positionX, positionZ] of [
      [-1.4, -1.4],
      [1.4, -1.4],
      [-1.4, 1.4],
      [1.4, 1.4],
    ]) {
      kit.box(0.2, towerHeight + 2.2, 0.2, 'wood', positionX, (towerHeight + 2.2) / 2, positionZ);
    }
    for (const [angle, box] of [
      [
        [-1.4, -1.4],
        [1.4, -1.4],
      ],
      [
        [1.4, -1.4],
        [1.4, 1.4],
      ],
      [
        [1.4, 1.4],
        [-1.4, 1.4],
      ],
      [
        [-1.4, 1.4],
        [-1.4, -1.4],
      ],
    ]) {
      kit.rod([angle[0], 0.3, angle[1]], [box[0], towerHeight - 0.3, box[1]], 0.05, 'wood', 4);
      kit.rod([box[0], 0.3, box[1]], [angle[0], towerHeight - 0.3, angle[1]], 0.05, 'wood', 4);
    }
    kit.box(3.1, 0.2, 3.1, 'plank', 0, towerHeight - 0.1, 0);
    for (const [width, depth, positionX, positionZ] of [
      [3.1, 0.1, 0, -1.5],
      [0.1, 3.0, -1.5, 0],
      [0.1, 3.0, 1.5, 0],
    ]) {
      kit.box(width, 1.0, depth, 'plank', positionX, towerHeight + 0.5, positionZ);
    }
    kit.box(3.4, 0.12, 3.4, 'canvas', 0, towerHeight + 2.3, 0, 0.05);
    for (const positionX of [-0.5, 0.5]) {
      kit.rod([positionX, 0, 1.55 + 4.5], [positionX, towerHeight, 1.55], 0.06, 'wood', 4);
    }
    for (let step = 0; step < 10; step++) {
      kit.box(
        1.0,
        0.06,
        0.4,
        'plank',
        0,
        towerHeight - 0.4 * step - 0.03,
        1.55 + step * 0.45 + 0.22,
      );
    }
  },
  bunker(kit) {
    for (const box of structureBoxes('bunker', 0, 0, 0, 0)) {
      kit.box(
        box.max[0] - box.min[0],
        box.max[1] - box.min[1],
        box.max[2] - box.min[2],
        box.mat,
        (box.min[0] + box.max[0]) / 2,
        (box.min[1] + box.max[1]) / 2,
        (box.min[2] + box.max[2]) / 2,
      );
    }
    bagWall(kit, -2.0, -1.6, 2.0, -1.6, 0.4, 1);
    for (const positionZ of [-0.8, 0, 0.8]) {
      kit.box(4.0, 0.06, 0.6, 'canvas', 0, 2.63, positionZ, 0, 0, Math.sin(positionZ * 5) * 0.03);
    }
  },
  ammo(kit) {
    crate(kit, 0.75, 0.38, 0.45, 'ammo', -0.25, 0, 0, 0.05);
    crate(kit, 0.75, 0.38, 0.45, 'ammo', 0.3, 0, 0.02, -0.08);
    crate(kit, 0.6, 0.3, 0.4, 'ammo', 0, 0.38, 0, 0.12);
    ammoCan(kit, 0.45, 0.38, -0.05);
    ammoCan(kit, 0.45, 0.56, -0.02, 0.1);
  },
  medical(kit) {
    kit.box(1.3, 0.04, 0.45, 'canvas', 0, 0.32, 0.15);
    for (const offsetZ of [-0.22, 0.22]) {
      kit.rod([-0.68, 0.32, 0.15 + offsetZ], [0.68, 0.32, 0.15 + offsetZ], 0.02, 'steel', 4);
    }
    for (const [positionX, positionZ] of [
      [-0.5, -0.07],
      [0.5, -0.07],
      [-0.5, 0.37],
      [0.5, 0.37],
    ]) {
      kit.box(0.03, 0.3, 0.03, 'steel', positionX, 0.15, positionZ);
    }
    crate(kit, 0.5, 0.42, 0.3, 'medical', -0.35, 0.34, 0.15);
    kit.box(0.3, 0.3, 0.2, 'olive', 0.45, 0.15, -0.25, 0, 0.4);
    kit.box(0.12, 0.12, 0.21, 'red', 0.45, 0.18, -0.25, 0, 0.4);
  },
  fob(kit, group) {
    kit.box(0.9, 0.9, 0.7, 'radio', 0, 0.45, 0);
    kit.box(0.7, 0.2, 0.5, 'gunmetal', 0, 1.0, 0);
    kit.box(0.5, 0.08, 0.05, 'gunmetal', 0, 0.7, -0.36);
    kit.cylinder(0.015, 0.02, 4.5, 'steel', 0.3, 3.35, 0.15);
    for (const [positionX, positionY, positionZ] of [
      [1.05, 0, -0.2],
      [1.6, 0, 0.1],
      [1.3, 0.35, -0.05],
    ]) {
      crate(
        kit,
        0.6,
        0.35,
        0.45,
        'crate',
        positionX,
        positionY,
        positionZ,
        Math.sin(positionX * 4) * 0.2,
      );
    }
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.45),
      new THREE.MeshStandardMaterial({ color: 0xd8d0b0, side: THREE.DoubleSide }),
    );
    flag.position.set(0.66, 5.3, 0.15);
    group.add(flag);
  },
};

function mountedGun(group, positionX, positionZ) {
  const prop = new THREE.Group();
  const kit = new Kit();
  for (const angle of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
    kit.rod(
      [0, 0.95, 0],
      [Math.sin(angle) * 0.55, 0, Math.cos(angle) * 0.55 - 0.1],
      0.025,
      'gunmetal',
      5,
    );
  }
  kit.cylinder(0.05, 0.05, 0.16, 'gunmetal', 0, 1.02, 0);
  kit.build(prop);
  const gun = new THREE.Group();
  const gunKit = new Kit();
  gunKit.box(0.16, 0.18, 0.62, 'gunmetal', 0, 0, 0.02);
  gunKit.cylinder(0.045, 0.045, 0.55, 'gunmetal', 0, 0.01, -0.55, Math.PI / 2, 0, 0, 10);
  gunKit.cylinder(0.022, 0.022, 0.5, 'gunmetal', 0, 0.01, -1.05, Math.PI / 2);
  gunKit.cylinder(0.035, 0.03, 0.08, 'gunmetal', 0, 0.01, -1.32, Math.PI / 2);
  for (const offsetX of [-0.08, 0.08]) {
    gunKit.box(0.03, 0.14, 0.03, 'gunmetal', offsetX, -0.02, 0.38);
  }
  gunKit.box(0.2, 0.025, 0.04, 'gunmetal', 0, 0.05, 0.37);
  gunKit.box(0.04, 0.06, 0.04, 'gunmetal', 0, 0.12, -0.15);
  gunKit.box(0.26, 0.18, 0.12, 'olive', 0.2, -0.06, -0.02);
  gunKit.build(gun);
  gun.position.y = 1.18;
  prop.add(gun);
  prop.position.set(positionX, 0.05, positionZ);
  prop.userData.gun = gun;
  group.add(prop);
  return prop;
}

function mortarTube(group) {
  const prop = new THREE.Group();
  const kit = new Kit();
  kit.cylinder(0.32, 0.34, 0.05, 'steel', 0, 0.03, 0, 0, 0, 0, 12);
  kit.build(prop);
  const tube = new THREE.Group();
  const tubeKit = new Kit();
  tubeKit.cylinder(0.055, 0.065, 1.25, 'gunmetal', 0, 0.62, 0, 0, 0, 0, 10);
  tubeKit.cylinder(0.07, 0.07, 0.06, 'gunmetal', 0, 1.22, 0, 0, 0, 0, 10);
  tubeKit.build(tube);
  tube.position.y = 0.05;
  tube.rotation.x = -0.6;
  prop.add(tube);
  const bipod = new Kit();
  bipod.rod([0, 0.75, -0.45], [-0.3, 0, -0.62], 0.018, 'steel');
  bipod.rod([0, 0.75, -0.45], [0.3, 0, -0.62], 0.018, 'steel');
  bipod.build(prop);
  prop.userData.tube = tube;
  group.add(prop);
  return prop;
}

function genericModel(kit, type) {
  for (const box of structureBoxes(type, 0, 0, 0, 0)) {
    kit.box(
      box.max[0] - box.min[0],
      box.max[1] - box.min[1],
      box.max[2] - box.min[2],
      box.mat,
      (box.min[0] + box.max[0]) / 2,
      (box.min[1] + box.max[1]) / 2,
      (box.min[2] + box.max[2]) / 2,
    );
  }
}

export function structureModel(type) {
  const group = new THREE.Group();
  const kit = new Kit();
  (MODELS[type] || ((step) => genericModel(step, type)))(kit, group);
  kit.build(group);
  return group;
}

export function placeStructureModel(group, positionX, positionY, positionZ, rotation) {
  group.position.set(positionX, positionY, positionZ);
  group.rotation.y = rotation * QUARTER_TURN;
  return group;
}
