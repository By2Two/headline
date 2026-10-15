import * as THREE from 'three';
import { decodeGear } from '../../../shared/milsim/config.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SKIN, SLEEVE } from '../guns.js';
import { applyLookColors } from '../character.js';

const createMaterial = (color, roughness = 0.85, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color: color, roughness: roughness, metalness: metalness });
const STRAP = createMaterial(0x1d1f1c);
const PLATE_EDGE = createMaterial(0x232622, 0.7);
const DARK = createMaterial(0x101113, 0.4, 0.6);
const LENS = new THREE.MeshStandardMaterial({
  color: 0x1b2a33,
  roughness: 0.05,
  metalness: 0.8,
  transparent: true,
  opacity: 0.35,
});
const OBJ_LENS = new THREE.MeshStandardMaterial({
  color: 0x0e1a22,
  roughness: 0.05,
  metalness: 0.9,
  transparent: true,
  opacity: 0.92,
});
const TUBE = DARK.clone();
TUBE.side = THREE.FrontSide;
export const SCOPE_VIEW = new THREE.MeshBasicMaterial({ color: 0xffffff });
export function setScopeTexture(texture) {
  SCOPE_VIEW.map = texture;
  SCOPE_VIEW.needsUpdate = true;
}
const reticleCache = {};
function reticleTexture(kind) {
  if (reticleCache[kind]) {
    return reticleCache[kind];
  }
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const halfSize = size / 2;
  context.translate(halfSize, halfSize);
  const line = (startX, startY, endX, endY, lineWidth, color = '#0a0a0a') => {
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.stroke();
  };
  if (kind === 'x2') {
    line(-halfSize, 0, -10, 0, 1.6);
    line(10, 0, halfSize, 0, 1.6);
    line(0, -halfSize, 0, -10, 1.6);
    line(0, 10, 0, halfSize, 1.6);
    context.fillStyle = '#e02020';
    context.beginPath();
    context.arc(0, 0, 2, 0, Math.PI * 2);
    context.fill();
  } else if (kind === 'acog') {
    context.fillStyle = '#ff6a2a';
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(-9, 16);
    context.lineTo(9, 16);
    context.closePath();
    context.fill();
    line(0, 18, 0, 100, 1.4, '#ff6a2a');
    for (let step = 1; step <= 5; step++) {
      line(-(14 - step * 1.5), 18 + step * 17, 14 - step * 1.5, 18 + step * 17, 1.4, '#ff6a2a');
    }
  } else if (kind === 'scope8') {
    line(-halfSize, 0, -14, 0, 1.4);
    line(14, 0, halfSize, 0, 1.4);
    line(0, -halfSize, 0, -14, 1.4);
    line(0, 14, 0, halfSize, 1.4);
    context.fillStyle = '#0a0a0a';
    for (const step of [-4, -3, -2, -1, 1, 2, 3, 4]) {
      context.beginPath();
      context.arc(step * 24, 0, 2.2, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.arc(0, step * 24, 2.2, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = '#e02020';
    context.beginPath();
    context.arc(0, 0, 2, 0, Math.PI * 2);
    context.fill();
  } else {
    for (const [startX, startY, endX, endY] of [
      [-halfSize, 0, -50, 0],
      [50, 0, halfSize, 0],
      [0, -halfSize, 0, -50],
      [0, 50, 0, halfSize],
    ]) {
      line(startX, startY, endX, endY, 4);
    }
    line(-50, 0, 50, 0, 0.9);
    line(0, -50, 0, 50, 0.9);
    for (let step = -4; step <= 4; step++) {
      if (step) {
        line(step * 12, -3, step * 12, 3, 0.9);
        line(-3, step * 12, 3, step * 12, 0.9);
      }
    }
    context.fillStyle = '#e02020';
    context.beginPath();
    context.arc(0, 0, 1.8, 0, Math.PI * 2);
    context.fill();
  }
  const gradient = context.createRadialGradient(0, 0, halfSize * 0.88, 0, 0, halfSize);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.75)');
  gradient.addColorStop(1, 'rgba(0,0,0,1)');
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(0, 0, halfSize, 0, Math.PI * 2);
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  reticleCache[kind] = texture;
  return texture;
}
function scopeLens(group, kind, radius, positionZ, positionY) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 36), LENS);
  mesh.position.set(0, positionY, positionZ);
  group.add(mesh);
  const reticle = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 36),
    new THREE.MeshBasicMaterial({
      map: reticleTexture(kind),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  reticle.position.set(0, positionY, positionZ + 0.0006);
  const rim = new THREE.Mesh(new THREE.RingGeometry(radius * 0.97, radius * 1.32, 28), DARK);
  rim.position.set(0, positionY, positionZ + 0.001);
  group.add(rim);
  reticle.visible = false;
  group.add(reticle);
  return { mesh, reticle, glass: LENS, z: positionZ, kind };
}
const RED = new THREE.MeshBasicMaterial({ color: 0xff2020, depthTest: false });
const RED_GLOW = new THREE.MeshBasicMaterial({
  color: 0xff3a3a,
  transparent: true,
  opacity: 0.85,
  depthTest: false,
});

function blk(width, height, depth, material, positionX, positionY, positionZ) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(positionX, positionY, positionZ);
  mesh.castShadow = true;
  return mesh;
}

const HEAD_OF = { none: 'cap', light: 'helmet', heavy: 'nvg' };

const GHILLIE_HEX = [0x4a5a2c, 0x5c6b34, 0x6b6a3a, 0x3d4a24, 0x7a7244, 0x4a3f26];
const GHILLIE_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });

export function applyMilGear(rig, code, baseLook) {
  const key = `${code}|${JSON.stringify(baseLook)}`;
  if (rig.milGearKey === key) {
    return;
  }
  rig.milGearKey = key;
  const gear = decodeGear(code);
  rig.setLook({ ...baseLook, head: HEAD_OF[gear.helmet] || 'cap', outfit: gear.uniform });
  if (rig.milGear) {
    rig.torso.remove(rig.milGear);
    rig.milGear.traverse((object) => object.geometry?.dispose());
  }
  const group = new THREE.Group();
  rig.milGear = group;
  rig.torso.add(group);
  const metalness = rig.m;
  for (const color of rig.torso.children) {
    if (!color.isMesh) {
      continue;
    }
    if (color.material === metalness.vest) {
      color.visible = gear.vest !== 'none';
    }
    if (color.material === metalness.pouch) {
      color.visible = gear.vest !== 'none';
    }
  }
  if (gear.vest === 'light') {
    group.add(blk(0.46, 0.06, 0.29, STRAP, 0, 0.5, 0));
  }
  if (gear.vest === 'heavy') {
    group.add(blk(0.42, 0.4, 0.06, metalness.vest, 0, 0.32, -0.17));
    group.add(blk(0.42, 0.4, 0.06, metalness.vest, 0, 0.32, 0.17));
    group.add(blk(0.44, 0.02, 0.07, PLATE_EDGE, 0, 0.53, -0.17));
    for (const positionX of [-0.13, 0, 0.13]) {
      group.add(blk(0.1, 0.16, 0.07, metalness.pouch, positionX, 0.2, -0.22));
    }
    group.add(blk(0.14, 0.1, 0.05, metalness.pouch, -0.12, 0.42, -0.21));
    for (const side of [-1, 1]) {
      group.add(blk(0.07, 0.3, 0.32, metalness.vest, side * 0.25, 0.3, 0));
      group.add(blk(0.09, 0.05, 0.36, STRAP, side * 0.15, 0.53, 0));
    }
    group.add(blk(0.3, 0.08, 0.3, metalness.vest, 0, 0.58, 0.02));
  }
  for (const tuft of rig.milGhillie || []) {
    tuft.parent?.remove(tuft);
    tuft.geometry?.dispose();
  }
  rig.milGhillie = [];
  const lookNow = { ...baseLook, head: HEAD_OF[gear.helmet] || 'cap', outfit: gear.uniform };
  applyLookColors(rig.m, lookNow);
  if (gear.ghillie) {
    rig.m.suit.color.setHex(0x3a4422);
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const cover = (
      parent,
      currentColor,
      size,
      strips,
      { front = true, len: length = 0.2 } = {},
    ) => {
      const geometries = [];
      const paint = (geometry, color) => {
        const vertexCount = geometry.attributes.position.count;
        const arr = new Float32Array(vertexCount * 3);
        for (let index = 0; index < vertexCount; index++) {
          arr[index * 3] = color.r;
          arr[index * 3 + 1] = color.g;
          arr[index * 3 + 2] = color.b;
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        return geometry;
      };
      const shell = new THREE.BoxGeometry(size[0], size[1], size[2]);
      shell.translate(currentColor[0], currentColor[1], currentColor[2]);
      geometries.push(paint(shell, new THREE.Color(0x2e3818)));
      const [halfX, halfY, halfZ] = [size[0] / 2, size[1] / 2, size[2] / 2];
      const vector = new THREE.Vector3(0, 1, 0);
      for (let index = 0; index < strips; index++) {
        const areas = [halfY * halfZ, halfY * halfZ, halfX * halfZ, halfX * halfY, halfX * halfY];
        const normals = [
          [1, 0, 0],
          [-1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
          [0, 0, -1],
        ];
        let roughness = random() * areas.reduce((accumulator, area) => accumulator + area, 0);
        let faceIndex = 0;
        while (faceIndex < 4 && roughness > areas[faceIndex]) {
          roughness -= areas[faceIndex++];
        }
        if (!front && faceIndex === 4) {
          faceIndex = 3;
        }
        const normal = normals[faceIndex];
        const currentVector = new THREE.Vector3(
          normal[0] ? normal[0] * halfX : (random() * 2 - 1) * halfX,
          normal[1] ? normal[1] * halfY : (random() * 2 - 1) * halfY,
          normal[2] ? normal[2] * halfZ : (random() * 2 - 1) * halfZ,
        );
        const out = new THREE.Vector3(normal[0], 0, normal[2]);
        if (normal[1]) {
          out.set(random() - 0.5, 0, random() - 0.5).normalize();
        }
        const tilt = 0.15 + random() * 0.55;
        const direction = new THREE.Vector3(0, -Math.cos(tilt), 0).addScaledVector(
          out,
          Math.sin(tilt),
        );
        const leafLength = length * (0.5 + random() * 0.9);
        const width = 0.03 + random() * 0.035;
        const strip = new THREE.BoxGeometry(width, leafLength, 0.012);
        const matrix = new THREE.Matrix4()
          .makeRotationAxis(direction, random() * Math.PI)
          .multiply(
            new THREE.Matrix4().makeRotationFromQuaternion(
              new THREE.Quaternion().setFromUnitVectors(vector, direction),
            ),
          );
        matrix.setPosition(
          currentColor[0] + currentVector.x + direction.x * leafLength * 0.5,
          currentColor[1] + currentVector.y + direction.y * leafLength * 0.5,
          currentColor[2] + currentVector.z + direction.z * leafLength * 0.5,
        );
        strip.applyMatrix4(matrix);
        const color = new THREE.Color(GHILLIE_HEX[Math.floor(random() * GHILLIE_HEX.length)]);
        color.multiplyScalar(0.75 + random() * 0.5);
        geometries.push(paint(strip, color));
      }
      const mesh = new THREE.Mesh(mergeGeometries(geometries), GHILLIE_MAT);
      geometries.forEach((geometry) => geometry.dispose());
      mesh.castShadow = true;
      parent.add(mesh);
      rig.milGhillie.push(mesh);
    };
    cover(rig.torso, [0, 0.3, 0], [0.54, 0.5, 0.34], 230, { len: 0.24 });
    cover(rig.head, [0, 0.17, 0], [0.26, 0.17, 0.27], 70, { front: false, len: 0.14 });
    for (const { thigh, knee } of rig.legs) {
      cover(thigh, [0, -0.22, 0], [0.21, 0.46, 0.24], 80, { len: 0.2 });
      cover(knee, [0, -0.18, 0], [0.2, 0.36, 0.23], 65, { len: 0.18 });
    }
  }
  if (gear.pack !== 'none') {
    const big = gear.pack === 'large';
    group.add(
      blk(
        big ? 0.4 : 0.34,
        big ? 0.55 : 0.38,
        big ? 0.24 : 0.16,
        metalness.pouch,
        0,
        big ? 0.3 : 0.35,
        big ? 0.3 : 0.24,
      ),
    );
    group.add(
      blk(big ? 0.36 : 0.3, 0.1, 0.05, metalness.vest, 0, big ? 0.18 : 0.27, big ? 0.43 : 0.33),
    );
    if (big) {
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.44, 10), metalness.gear);
      roll.rotation.z = Math.PI / 2;
      roll.position.set(0, 0.62, 0.3);
      group.add(roll);
    }
    for (const side of [-1, 1]) {
      group.add(
        blk(0.05, 0.4, 0.03, STRAP, side * 0.13, 0.33, -0.15 + (gear.vest === 'heavy' ? -0.06 : 0)),
      );
    }
  }
}

function receiverTop(gun, muzzleZ, pistol = false) {
  let top = -Infinity;
  let zMin = Infinity;
  let zMax = -Infinity;
  gun.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(gun.matrixWorld).invert();
  const box = new THREE.Box3();
  gun.traverse((object) => {
    if (
      !object.isMesh ||
      object.material === SKIN ||
      object.material === SLEEVE ||
      object.userData.optic ||
      object.userData.modelScope ||
      object.userData.sight
    ) {
      return;
    }
    if (!object.geometry.boundingBox) {
      object.geometry.computeBoundingBox();
    }
    box
      .copy(object.geometry.boundingBox)
      .applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, object.matrixWorld));
    const centerZ = (box.min.z + box.max.z) / 2;
    if (pistol ? box.max.y < 0.2 : centerZ > muzzleZ * 0.45 && centerZ < 0.2 && box.max.y < 0.12) {
      top = Math.max(top, box.max.y);
    }
    zMin = Math.min(zMin, box.min.z);
    zMax = Math.max(zMax, box.max.z);
  });
  return { top: Number.isFinite(top) ? top : 0.04, zMin, zMax };
}

export function attachOptic(gun, optic, { muzzleZ = -0.6, pistol = false, builtIn = false } = {}) {
  if (gun.userData.opticGroup) {
    gun.remove(gun.userData.opticGroup);
    gun.userData.opticGroup = null;
  }
  const tubeScope = ['x2', 'acog', 'scope8', 'scope12'].includes(optic);
  gun.traverse((object) => {
    if (object.userData.sight || object.userData.modelScope) {
      object.visible = !(object.userData.sight || tubeScope);
    }
  });
  const { top } = receiverTop(gun, muzzleZ, pistol);
  const group = new THREE.Group();
  group.userData.optic = true;
  group.traverse((object) => (object.userData.optic = true));
  let sightY = top + 0.024;
  let scopeLensInfo = null;
  const opticZ = pistol ? -0.06 : -0.12;
  if (builtIn && !['x2', 'acog', 'scope8', 'scope12'].includes(optic)) {
    sightY = 0.072;
  } else if (optic === 'iron' || pistol) {
    const rear = pistol ? 0.0 : opticZ + 0.14;
    const front = muzzleZ + (pistol ? 0.02 : 0.1);
    sightY = top + (pistol ? 0.014 : 0.026);
    for (const side of [-1, 1]) {
      group.add(
        blk(
          0.0035,
          sightY - top + 0.003,
          0.006,
          DARK,
          side * 0.0055,
          (top + sightY + 0.003) / 2,
          rear,
        ),
      );
    }
    group.add(blk(0.014, (sightY - top) * 0.4, 0.006, DARK, 0, top + (sightY - top) * 0.2, rear));
    const postH = sightY - 0.012;
    group.add(blk(0.004, postH, 0.006, DARK, 0, 0.012 + postH / 2, front));
    if (!pistol) {
      for (const side of [-1, 1]) {
        group.add(blk(0.004, postH * 0.9, 0.012, DARK, side * 0.012, 0.012 + postH * 0.45, front));
      }
    }
  } else if (optic === 'reddot') {
    sightY = top + 0.036;
    group.add(blk(0.026, 0.012, 0.05, DARK, 0, top + 0.006, opticZ));
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.06, 16, 1, true), DARK);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, sightY, opticZ);
    tube.material = DARK.clone();
    tube.material.side = THREE.DoubleSide;
    group.add(tube);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.018, 16), LENS);
    lens.position.set(0, sightY, opticZ - 0.028);
    group.add(lens);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0009, 8, 6), RED);
    dot.position.set(0, sightY, opticZ - 0.03);
    dot.renderOrder = 20;
    group.add(dot);
    group.userData.reticle = dot;
  } else if (optic === 'holo') {
    sightY = top + 0.038;
    group.add(blk(0.034, 0.016, 0.07, DARK, 0, top + 0.008, opticZ));
    for (const side of [-1, 1]) {
      group.add(blk(0.004, 0.04, 0.05, DARK, side * 0.017, sightY, opticZ - 0.005));
    }
    group.add(blk(0.038, 0.005, 0.05, DARK, 0, sightY + 0.022, opticZ - 0.005));
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.034), LENS);
    lens.position.set(0, sightY, opticZ - 0.03);
    group.add(lens);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.0042, 0.0049, 24), RED_GLOW);
    ring.position.set(0, sightY, opticZ - 0.032);
    ring.renderOrder = 20;
    group.add(ring);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0007, 8), RED);
    dot.position.set(0, sightY, opticZ - 0.033);
    dot.renderOrder = 21;
    group.add(dot);
    group.userData.reticle = ring;
  } else if (optic === 'acog' || optic === 'scope8' || optic === 'x2') {
    const big = optic === 'scope8';
    const compact = optic === 'x2';
    const roughness = big ? 0.024 : 0.02;
    sightY = top + roughness + 0.014;
    group.add(blk(0.024, 0.014, big ? 0.14 : compact ? 0.06 : 0.08, DARK, 0, top + 0.007, opticZ));
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(
        roughness,
        roughness,
        big ? 0.3 : compact ? 0.1 : 0.15,
        14,
        1,
        true,
      ),
      TUBE,
    );
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, sightY, opticZ);
    group.add(tube);
    const cap = new THREE.Mesh(new THREE.CircleGeometry(roughness * 1.04, 20), OBJ_LENS);
    cap.rotation.y = Math.PI;
    cap.position.set(0, sightY, opticZ - (big ? 0.15 : compact ? 0.05 : 0.075) + 0.006);
    group.add(cap);
    for (const deltaZ of [-1, 1]) {
      const bell = new THREE.Mesh(
        new THREE.CylinderGeometry(roughness * 1.08, roughness * 1.04, 0.04, 14, 1, true),
        TUBE,
      );
      bell.rotation.x = Math.PI / 2;
      bell.position.set(
        0,
        sightY,
        opticZ + deltaZ * ((big ? 0.15 : compact ? 0.05 : 0.075) - 0.02),
      );
      group.add(bell);
    }
    scopeLensInfo = scopeLens(
      group,
      optic,
      roughness * 0.98,
      opticZ + (big ? 0.15 : compact ? 0.05 : 0.075) - 0.012,
      sightY,
    );
  } else if (optic === 'scope12') {
    const roughness = 0.017;
    const length = 0.36;
    sightY = top + 0.042;
    for (const deltaZ of [-0.07, 0.06]) {
      group.add(
        blk(0.026, sightY - top, 0.024, DARK, 0, top + (sightY - top) / 2, opticZ + deltaZ),
      );
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(roughness + 0.004, roughness + 0.004, 0.022, 16),
        DARK,
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, sightY, opticZ + deltaZ);
      group.add(ring);
    }
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(roughness, roughness, length, 16, 1, true),
      TUBE,
    );
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, sightY, opticZ);
    group.add(tube);
    const bell = new THREE.Mesh(
      new THREE.CylinderGeometry(roughness, 0.03, 0.07, 18, 1, true),
      TUBE,
    );
    bell.rotation.x = Math.PI / 2;
    bell.position.set(0, sightY + 0.006, opticZ - length / 2 - 0.02);
    group.add(bell);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.06, 18, 1, true), DARK);
    shade.rotation.x = Math.PI / 2;
    shade.position.set(0, sightY + 0.006, opticZ - length / 2 - 0.085);
    group.add(shade);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.028, 18), LENS);
    lens.rotation.y = Math.PI;
    lens.position.set(0, sightY + 0.006, opticZ - length / 2 - 0.056);
    group.add(lens);
    const eye = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, roughness, 0.06, 16, 1, true),
      TUBE,
    );
    eye.rotation.x = Math.PI / 2;
    eye.position.set(0, sightY, opticZ + length / 2 + 0.02);
    group.add(eye);
    const turret = (positionX, positionY, rotationX, rotationZ) => {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.026, 12), DARK);
      knob.rotation.set(rotationX, 0, rotationZ);
      knob.position.set(positionX, positionY, opticZ - 0.01);
      group.add(knob);
    };
    turret(0, sightY + roughness + 0.012, 0, 0);
    turret(roughness + 0.012, sightY, 0, Math.PI / 2);
    turret(-roughness - 0.01, sightY, 0, Math.PI / 2);
    scopeLensInfo = scopeLens(group, 'scope12', 0.0215, opticZ + length / 2 + 0.04, sightY);
  }
  group.traverse((object) => {
    object.userData.optic = true;
    if (object.isMesh) {
      object.castShadow = true;
    }
  });
  gun.add(group);
  gun.userData.opticGroup = group;
  return { group: group, sightY, sightZ: opticZ, lens: scopeLensInfo };
}
