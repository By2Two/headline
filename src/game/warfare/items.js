import * as THREE from 'three';
import { box, cyl, mat, SKIN, SLEEVE, DARK, BLACK, METAL, GREEN, WOOD, BUILDERS } from '../guns.js';

const OLIVE = mat(0x4b5532, 0.8, 0.1);
const WHITE = mat(0xeae6dc, 0.95, 0);
const RED = mat(0xb02020, 0.7, 0);
const PAPER = mat(0xe8e0c4, 0.95, 0);
const STEELB = mat(0x6d7378, 0.45, 0.6);

function hands(group, withLeft, leftZ = -0.3, leftY = -0.045) {
  group.add(box(0.05, 0.06, 0.1, SKIN, 0.0, -0.1, 0.03));
  group.add(box(0.075, 0.075, 0.45, SLEEVE, 0.04, -0.14, 0.3, 0.1));
  if (withLeft) {
    group.add(box(0.055, 0.05, 0.1, SKIN, -0.01, leftY, leftZ));
    group.add(box(0.075, 0.075, 0.45, SLEEVE, -0.08, leftY - 0.075, leftZ + 0.3, 0.25));
  }
}

function buildRpg(height = true) {
  const group = new THREE.Group();
  group.add(cyl(0.032, 0.95, OLIVE, 0, 0.03, -0.12));
  group.add(cyl(0.045, 0.12, WOOD, 0, 0.03, -0.05));
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.22, 12), DARK);
  cone.rotation.x = -Math.PI / 2;
  cone.position.set(0, 0.03, -0.78);
  group.add(cone);
  group.add(cyl(0.05, 0.12, GREEN, 0, 0.03, -0.62));
  group.add(box(0.03, 0.12, 0.05, BLACK, 0, -0.05, 0.02, 0.2));
  group.add(box(0.03, 0.1, 0.04, BLACK, 0, -0.05, -0.2, 0.1));
  group.add(box(0.02, 0.05, 0.05, DARK, -0.035, 0.08, -0.1));
  if (height) {
    hands(group, true, -0.2);
  }
  return {
    group: group,
    muzzle: new THREE.Vector3(0, 0.03, -0.9),
    base: new THREE.Vector3(0.18, -0.16, -0.36),
    support: -0.2,
  };
}

function buildBandage(height = true) {
  const group = new THREE.Group();
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 14), WHITE);
  roll.rotation.z = Math.PI / 2;
  roll.position.set(-0.04, -0.04, -0.1);
  group.add(roll);
  const tail = box(0.06, 0.004, 0.12, WHITE, -0.04, -0.075, -0.03);
  group.add(tail);
  if (height) {
    hands(group, true, -0.1, -0.06);
  }
  return {
    group: group,
    muzzle: new THREE.Vector3(0, 0, -0.2),
    base: new THREE.Vector3(0.1, -0.16, -0.32),
    item: true,
    roll,
  };
}

function buildMedkit(height = true) {
  const group = new THREE.Group();
  group.add(box(0.2, 0.12, 0.08, RED, -0.04, -0.03, -0.12));
  group.add(box(0.07, 0.022, 0.082, WHITE, -0.04, -0.03, -0.12));
  group.add(box(0.022, 0.07, 0.082, WHITE, -0.04, -0.03, -0.12));
  group.add(box(0.1, 0.02, 0.02, BLACK, -0.04, 0.04, -0.12));
  if (height) {
    hands(group, true, -0.12, -0.05);
  }
  return {
    group: group,
    muzzle: new THREE.Vector3(0, 0, -0.2),
    base: new THREE.Vector3(0.12, -0.17, -0.34),
    item: true,
  };
}

const FLAME = new THREE.MeshBasicMaterial({ color: 0x6fc8ff });
const FLAME_CORE = new THREE.MeshBasicMaterial({ color: 0xf2fbff });
function buildShovel(height = true) {
  const group = new THREE.Group();
  group.add(box(0.035, 0.04, 0.26, BLACK, 0, -0.06, -0.06));
  group.add(cyl(0.012, 0.3, STEELB, 0, -0.045, -0.3));
  group.add(cyl(0.02, 0.05, METAL, 0, -0.045, -0.46));
  group.add(cyl(0.012, 0.22, DARK, 0.03, -0.1, 0.1));
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.1, 8), FLAME);
  flame.rotation.x = -Math.PI / 2;
  flame.position.set(0, -0.045, -0.54);
  group.add(flame);
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.05, 6), FLAME_CORE);
  core.rotation.x = -Math.PI / 2;
  core.position.set(0, -0.045, -0.52);
  group.add(core);
  if (height) {
    hands(group, true, -0.18, -0.06);
  }
  return {
    group: group,
    muzzle: new THREE.Vector3(0, -0.045, -0.6),
    base: new THREE.Vector3(0.16, -0.17, -0.34),
    melee: true,
    flame,
  };
}

function buildBag(kind, height = true) {
  const group = new THREE.Group();
  const med = kind === 'medbag';
  group.add(box(0.2, 0.13, 0.12, med ? WHITE : OLIVE, -0.04, -0.04, -0.12));
  group.add(box(0.205, 0.02, 0.125, DARK, -0.04, 0.03, -0.12));
  if (med) {
    group.add(box(0.06, 0.02, 0.125, RED, -0.04, -0.03, -0.12));
    group.add(box(0.02, 0.06, 0.125, RED, -0.04, -0.03, -0.12));
  } else {
    group.add(box(0.205, 0.025, 0.04, BLACK, -0.04, -0.06, -0.12));
    group.add(box(0.05, 0.05, 0.13, mat(0xc9a64a, 0.7, 0.2), -0.04, -0.03, -0.12));
  }
  group.add(box(0.1, 0.02, 0.02, BLACK, -0.04, 0.05, -0.12));
  if (height) {
    hands(group, true, -0.12, -0.05);
  }
  return {
    group: group,
    muzzle: new THREE.Vector3(0, 0, -0.2),
    base: new THREE.Vector3(0.12, -0.17, -0.34),
    item: true,
  };
}
function buildBeacon(height = true) {
  const group = new THREE.Group();
  group.add(box(0.1, 0.07, 0.1, OLIVE, -0.04, -0.05, -0.13));
  group.add(cyl(0.006, 0.18, METAL, -0.04, 0.05, -0.13));
  group.add(box(0.03, 0.02, 0.03, RED, -0.04, 0.15, -0.13));
  group.add(box(0.07, 0.01, 0.07, BLACK, -0.04, -0.015, -0.13));
  if (height) {
    hands(group, true, -0.13, -0.05);
  }
  return {
    group: group,
    muzzle: new THREE.Vector3(0, 0, -0.2),
    base: new THREE.Vector3(0.12, -0.17, -0.34),
    item: true,
  };
}

export function registerMilBuilders() {
  BUILDERS.rpg ||= buildRpg;
  BUILDERS.bandage ||= buildBandage;
  BUILDERS.medkit ||= buildMedkit;
  BUILDERS.shovel ||= buildShovel;
  BUILDERS.ammobag ||= (height) => buildBag('ammobag', height);
  BUILDERS.medbag ||= (height) => buildBag('medbag', height);
  BUILDERS.beacon ||= buildBeacon;
}
export const MIL_BUILDERS = {
  rpg: buildRpg,
  bandage: buildBandage,
  medkit: buildMedkit,
  shovel: buildShovel,
  ammobag: (height) => buildBag('ammobag', height),
  medbag: (height) => buildBag('medbag', height),
  beacon: buildBeacon,
};

const BINO_BODY = mat(0x2a3326, 0.85, 0.1);
const BINO_RUB = mat(0x121412, 0.95, 0);
const BINO_GLASS = new THREE.MeshStandardMaterial({
  color: 0x1d3550,
  roughness: 0.08,
  metalness: 0.6,
  emissive: 0x0a1424,
});
function tube(topRadius, bottomRadius, length, material, positionX, positionY, positionZ) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(topRadius, bottomRadius, length, 18),
    material,
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(positionX, positionY, positionZ);
  return mesh;
}
export function buildBinos(height = true) {
  const group = new THREE.Group();
  for (const side of [-1, 1]) {
    const positionX = side * 0.034;
    group.add(tube(0.021, 0.019, 0.1, BINO_BODY, positionX, 0, 0.0));
    group.add(tube(0.027, 0.022, 0.035, BINO_BODY, positionX, 0, -0.065));
    group.add(tube(0.028, 0.028, 0.008, BINO_RUB, positionX, 0, -0.085));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.023, 18), BINO_GLASS);
    lens.position.set(positionX, 0, -0.0895);
    lens.rotation.y = Math.PI;
    group.add(lens);
    group.add(tube(0.017, 0.018, 0.028, BINO_RUB, positionX, 0, 0.062));
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.011, 14), BINO_GLASS);
    eye.position.set(positionX, 0, 0.0765);
    group.add(eye);
  }
  group.add(box(0.05, 0.012, 0.03, BINO_BODY, 0, 0.012, -0.02));
  group.add(box(0.05, 0.012, 0.03, BINO_BODY, 0, -0.012, 0.03));
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.022, 14), BINO_RUB);
  knob.rotation.z = Math.PI / 2;
  knob.position.set(0, 0.016, 0.035);
  group.add(knob);
  if (height) {
    for (const side of [-1, 1]) {
      group.add(box(0.045, 0.06, 0.075, SKIN, side * 0.062, -0.012, 0.0));
      group.add(box(0.07, 0.07, 0.4, SLEEVE, side * 0.1, -0.075, 0.23, 0.35));
    }
  }
  return group;
}
export function buildPaperMap() {
  const group = new THREE.Group();
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.3), PAPER);
  sheet.rotation.x = -1.0;
  group.add(sheet);
  return group;
}

export function attachGear(gun, attack, muzzle, { pistol = false } = {}) {
  if (gun.userData.attachGroup) {
    gun.remove(gun.userData.attachGroup);
  }
  const group = new THREE.Group();
  group.userData.optic = true;
  let tip = muzzle.clone();
  if (attack?.muzzle === 'suppressor') {
    const length = pistol ? 0.13 : 0.2;
    const suppressor = cyl(
      pistol ? 0.017 : 0.022,
      length,
      BLACK,
      0,
      muzzle.y,
      muzzle.z - length / 2 + 0.01,
    );
    group.add(suppressor);
    tip = new THREE.Vector3(0, muzzle.y, muzzle.z - length + 0.01);
  }
  if (attack?.muzzle === 'comp') {
    const length = 0.07;
    group.add(cyl(pistol ? 0.016 : 0.02, length, METAL, 0, muzzle.y, muzzle.z - length / 2 + 0.01));
    group.add(box(0.026, 0.006, 0.03, BLACK, 0, muzzle.y + 0.018, muzzle.z - 0.03));
    tip = new THREE.Vector3(0, muzzle.y, muzzle.z - length + 0.01);
  }
  if (attack?.muzzle === 'brake') {
    const length = 0.06;
    group.add(cyl(pistol ? 0.016 : 0.02, length, DARK, 0, muzzle.y, muzzle.z - length / 2 + 0.01));
    for (const side of [-1, 1]) {
      group.add(box(0.008, 0.026, 0.03, BLACK, side * 0.02, muzzle.y, muzzle.z - 0.03));
    }
    tip = new THREE.Vector3(0, muzzle.y, muzzle.z - length + 0.01);
  }
  if (attack?.rail === 'laser') {
    const positionZ = pistol ? -0.12 : muzzle.z * 0.55;
    group.add(box(0.02, 0.024, 0.06, DARK, 0.03, -0.03, positionZ));
    group.add(
      box(
        0.008,
        0.008,
        0.006,
        new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
        0.03,
        -0.03,
        positionZ - 0.033,
      ),
    );
  }
  if (attack?.grip === 'angled') {
    group.add(box(0.03, 0.05, 0.075, BLACK, 0, -0.055, muzzle.z * 0.45, -0.5));
  }
  if (attack?.mag === 'ext') {
    group.add(box(0.03, 0.07, 0.045, BLACK, 0, -0.12, -0.02));
  }
  if (attack?.rail === 'light') {
    const positionZ = pistol ? -0.12 : muzzle.z * 0.55;
    const laser = cyl(0.016, 0.09, METAL, 0, pistol ? -0.035 : -0.035, positionZ);
    group.add(laser);
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.014, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff6d0 }),
    );
    lens.position.set(0, -0.035, positionZ - 0.046);
    lens.rotation.y = Math.PI;
    group.add(lens);
  }
  if (attack?.grip === 'grip') {
    group.add(box(0.03, 0.09, 0.035, BLACK, 0, -0.075, muzzle.z * 0.45));
  }
  if (attack?.grip === 'bipod') {
    for (const side of [-1, 1]) {
      group.add(box(0.01, 0.15, 0.012, DARK, side * 0.025, -0.08, muzzle.z * 0.7, 0.35));
    }
  }
  group.traverse((object) => {
    object.userData.optic = true;
    if (object.isMesh) {
      object.castShadow = true;
    }
  });
  gun.add(group);
  gun.userData.attachGroup = group;
  return tip;
}
