import * as THREE from 'three';
import { BUILDERS } from '../game/guns.js';
import { applySkin, skinImagesPending } from '../game/skins.js';

let renderer = null;
let scene;
let cam;
const cache = new Map();

function setup() {
  const canvas = document.createElement('canvas');
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(1, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffe0b0, 1.2);
  rim.position.set(-3, 1, -2);
  scene.add(rim);
  cam = new THREE.OrthographicCamera(-1, 1, 0.5, -0.5, 0.1, 20);
  cam.position.set(0, 0, 5);
}

export function weaponThumb(weaponId, skinId = 'default', width = 256, height = 128) {
  const cacheKey = `${weaponId}:${skinId}:${width}x${height}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  if (!renderer) {
    setup();
  }
  if (!BUILDERS[weaponId]) {
    return '';
  }
  renderer.setSize(width, height, false);
  const group = BUILDERS[weaponId](false).group;
  applySkin(group, skinId);
  group.rotation.set(0.12, Math.PI / 2, -0.08);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  group.position.sub(center);
  const aspect = width / height;
  const fit = Math.max(size.x / aspect, size.y) * 0.62;
  Object.assign(cam, { left: -fit * aspect, right: fit * aspect, top: fit, bottom: -fit });
  cam.updateProjectionMatrix();
  scene.add(group);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(group);
  group.traverse((object) => object.geometry?.dispose());
  if (!skinImagesPending()) {
    cache.set(cacheKey, url);
  }
  return url;
}
