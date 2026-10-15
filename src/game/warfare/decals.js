import * as THREE from 'three';

const MAX_DECALS = 600;
const SURFACE_OFFSET_M = 0.006;
const SIZES = { terrain: 0.16, wood: 0.07, plank: 0.07, metal: 0.05, default: 0.06 };
const METALS = new Set([
  'metal',
  'metalroof',
  'steel',
  'containerR',
  'containerG',
  'containerB',
  'containerY',
  'silo',
]);
const WOODS = new Set(['wood', 'plank', 'barn', 'crate', 'fence']);
const SOFT = new Set(['sandbag', 'hesco', 'dirt']);

function holeTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const center = size / 2;
  const ring = context.createRadialGradient(center, center, 4, center, center, center);
  ring.addColorStop(0, 'rgba(0,0,0,1)');
  ring.addColorStop(0.22, 'rgba(10,10,10,1)');
  ring.addColorStop(0.32, 'rgba(70,70,70,0.9)');
  ring.addColorStop(0.55, 'rgba(40,40,40,0.45)');
  ring.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = ring;
  context.beginPath();
  for (let step = 0; step <= 18; step++) {
    const angle = (step / 18) * Math.PI * 2;
    const radius = center * (0.75 + 0.25 * Math.sin(step * 5.3) * Math.cos(step * 2.1));
    context[step ? 'lineTo' : 'moveTo'](
      center + Math.cos(angle) * radius,
      center + Math.sin(angle) * radius,
    );
  }
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function decalKind(hit) {
  if (hit.terrain) {
    return 'terrain';
  }
  const material = hit.mat || hit.box?.mat;
  if (METALS.has(material)) {
    return 'metal';
  }
  if (WOODS.has(material)) {
    return 'wood';
  }
  if (SOFT.has(material)) {
    return 'soft';
  }
  return 'default';
}

const TINTS = {
  terrain: new THREE.Color(0x3a2e22),
  metal: new THREE.Color(0xb8b4a8),
  wood: new THREE.Color(0x2a1a0e),
  soft: new THREE.Color(0x4a3c28),
  default: new THREE.Color(0x222222),
};

export class BulletDecals {
  constructor(scene) {
    this.material = new THREE.MeshBasicMaterial({
      map: holeTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      vertexColors: false,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.material, MAX_DECALS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.owners = new Array(MAX_DECALS).fill(null);
    this.next = 0;
    this.matrix = new THREE.Matrix4();
    this.quat = new THREE.Quaternion();
    this.roll = new THREE.Quaternion();
    this.normal = new THREE.Vector3();
    this.position = new THREE.Vector3();
    this.scale = new THREE.Vector3();
    this.zAxis = new THREE.Vector3(0, 0, 1);
    this.hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    scene.add(this.mesh);
  }

  add(hit) {
    const box = hit.box;
    if (!hit.normal || box?.vid !== undefined || box?.soft || (box?.door ?? null) !== null) {
      return;
    }
    const kind = decalKind(hit);
    const size = (SIZES[kind] ?? SIZES.default) * (0.8 + Math.random() * 0.45);
    this.normal.set(hit.normal[0], hit.normal[1], hit.normal[2]).normalize();
    this.position
      .set(hit.point[0], hit.point[1], hit.point[2])
      .addScaledVector(this.normal, SURFACE_OFFSET_M);
    this.quat.setFromUnitVectors(this.zAxis, this.normal);
    this.roll.setFromAxisAngle(this.zAxis, Math.random() * Math.PI * 2);
    this.quat.multiply(this.roll);
    this.scale.set(size, size, size);
    this.matrix.compose(this.position, this.quat, this.scale);
    const slot = this.next;
    this.next = (this.next + 1) % MAX_DECALS;
    this.mesh.setMatrixAt(slot, this.matrix);
    this.mesh.setColorAt(slot, TINTS[kind]);
    this.owners[slot] = box?.sid ?? null;
    this.mesh.count = Math.max(this.mesh.count, slot + 1);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  removeOwner(structureId) {
    let changed = false;
    for (let step = 0; step < this.mesh.count; step++) {
      if (this.owners[step] === structureId) {
        this.mesh.setMatrixAt(step, this.hidden);
        this.owners[step] = null;
        changed = true;
      }
    }
    if (changed) {
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  clear() {
    this.mesh.count = 0;
    this.next = 0;
    this.owners.fill(null);
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.map.dispose();
    this.material.dispose();
  }
}
