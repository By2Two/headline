import * as THREE from 'three';

const CAP = 96;

function boxes(list) {
  const geometries = [];
  for (const [width, height, depth, positionX, positionY, positionZ, shade] of list) {
    const geometry = new THREE.BoxGeometry(width, height, depth).toNonIndexed();
    geometry.translate(positionX, positionY, positionZ);
    const vertexCount = geometry.attributes.position.count;
    const color = new Float32Array(vertexCount * 3).fill(shade);
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
    geometry.deleteAttribute('uv');
    geometries.push(geometry);
  }
  let total = 0;
  for (const geometry of geometries) {
    total += geometry.attributes.position.count;
  }
  const position = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const currentColor = new Float32Array(total * 3);
  let offset = 0;
  for (const geometry of geometries) {
    position.set(geometry.attributes.position.array, offset);
    normals.set(geometry.attributes.normal.array, offset);
    currentColor.set(geometry.attributes.color.array, offset);
    offset += geometry.attributes.position.array.length;
    geometry.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  out.setAttribute('color', new THREE.BufferAttribute(currentColor, 3));
  out.computeBoundingSphere();
  return out;
}

const SKIN = 0.55;
const DARK = 0.18;
const STAND = [
  [0.17, 0.9, 0.2, -0.11, 0.45, 0, 1],
  [0.17, 0.9, 0.2, 0.11, 0.45, 0, 1],
  [0.46, 0.62, 0.3, 0, 1.22, 0, 0.85],
  [0.22, 0.25, 0.24, 0, 1.68, 0, SKIN],
  [0.26, 0.12, 0.28, 0, 1.82, 0, 0.8],
  [0.11, 0.11, 0.5, 0.2, 1.3, -0.2, 1],
  [0.11, 0.11, 0.5, -0.16, 1.3, -0.25, 1],
  [0.06, 0.1, 0.95, 0.06, 1.36, -0.4, DARK],
];
const CROUCH = [
  [0.17, 0.35, 0.55, -0.11, 0.3, -0.1, 1],
  [0.17, 0.5, 0.2, 0.11, 0.25, 0.1, 1],
  [0.46, 0.6, 0.3, 0, 0.82, 0.02, 0.85],
  [0.22, 0.25, 0.24, 0, 1.26, 0, SKIN],
  [0.26, 0.12, 0.28, 0, 1.4, 0, 0.8],
  [0.11, 0.11, 0.5, 0.2, 0.92, -0.2, 1],
  [0.11, 0.11, 0.5, -0.16, 0.92, -0.25, 1],
  [0.06, 0.1, 0.95, 0.06, 0.98, -0.4, DARK],
];
const PRONE = [
  [0.4, 0.22, 1.1, 0, 0.13, 0.75, 1],
  [0.48, 0.3, 0.7, 0, 0.17, -0.05, 0.85],
  [0.22, 0.24, 0.24, 0, 0.25, -0.55, SKIN],
  [0.26, 0.12, 0.28, 0, 0.36, -0.55, 0.8],
  [0.1, 0.1, 0.5, 0.18, 0.12, -0.55, 1],
  [0.1, 0.1, 0.5, -0.18, 0.12, -0.6, 1],
  [0.06, 0.08, 0.95, 0.06, 0.18, -0.95, DARK],
];

export function meshLod(root, near) {
  const userData = root.userData;
  if (userData.lodNear === near && (userData.lodN = (userData.lodN || 0) + 1) % 90) {
    return;
  }
  userData.lodNear = near;
  root.traverse((mesh) => {
    if (!mesh.isMesh) {
      return;
    }
    const depth = mesh.userData;
    if (depth.cs0 === undefined) {
      depth.cs0 = mesh.castShadow;
    }
    mesh.castShadow = near && depth.cs0;
    if (depth.small === undefined) {
      if (!mesh.geometry.boundingSphere) {
        mesh.geometry.computeBoundingSphere();
      }
      depth.small =
        mesh.geometry.boundingSphere.radius * Math.max(mesh.scale.x, mesh.scale.y, mesh.scale.z) <
        0.12;
    }
    if (depth.small) {
      mesh.layers.set(near ? 0 : 1);
    }
  });
}

export class Crowd {
  constructor(scene) {
    this.mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
    });
    this.meshes = [STAND, CROUCH, PRONE].map((definition) => {
      const instances = new THREE.InstancedMesh(boxes(definition), this.mat, CAP);
      instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      instances.setColorAt(0, new THREE.Color(1, 1, 1));
      instances.instanceColor.setUsage(THREE.DynamicDrawUsage);
      instances.count = 0;
      instances.frustumCulled = false;
      instances.castShadow = false;
      instances.receiveShadow = false;
      scene.add(instances);
      return instances;
    });
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.p = new THREE.Vector3();
    this.s = new THREE.Vector3(0.96, 0.96, 0.96);
    this.up = new THREE.Vector3(0, 1, 0);
  }

  begin() {
    for (const mesh of this.meshes) {
      mesh.count = 0;
    }
  }

  add(pose, positionX, positionY, positionZ, yaw, color) {
    const instances = this.meshes[pose];
    if (instances.count >= CAP) {
      return;
    }
    this.q.setFromAxisAngle(this.up, yaw);
    this.p.set(positionX, positionY, positionZ);
    this.m4.compose(this.p, this.q, this.s);
    instances.setMatrixAt(instances.count, this.m4);
    instances.setColorAt(instances.count, color);
    instances.count++;
  }

  end() {
    for (const instances of this.meshes) {
      if (!instances.count) {
        continue;
      }
      instances.instanceMatrix.needsUpdate = true;
      instances.instanceColor.needsUpdate = true;
    }
  }

  dispose(scene) {
    for (const mesh of this.meshes) {
      scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.mat.dispose();
  }
}
