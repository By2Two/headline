import * as THREE from 'three';
import { getMap } from '../../shared/map.js';

const TILE = 2;

function makeTexture(draw, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  draw(context, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function speckle(context, size, amount) {
  for (let index = 0; index < (size * size) / 6; index++) {
    context.fillStyle = `rgba(0,0,0,${Math.random() * amount})`;
    context.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
}

function wallTexture([base, line]) {
  return makeTexture((context, size) => {
    context.fillStyle = base;
    context.fillRect(0, 0, size, size);
    speckle(context, size, 0.12);
    context.strokeStyle = line;
    context.lineWidth = 4;
    context.strokeRect(2, 2, size - 4, size - 4);
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, size / 2);
    context.lineTo(size, size / 2);
    context.stroke();
  });
}

function crateTexture() {
  return makeTexture((context, size) => {
    context.fillStyle = '#a97b45';
    context.fillRect(0, 0, size, size);
    speckle(context, size, 0.2);
    context.strokeStyle = '#6a4a26';
    context.lineWidth = 3;
    for (let positionY = 0; positionY <= size; positionY += size / 4) {
      context.beginPath();
      context.moveTo(0, positionY);
      context.lineTo(size, positionY);
      context.stroke();
    }
    context.lineWidth = 10;
    context.strokeRect(5, 5, size - 10, size - 10);
    context.lineWidth = 6;
    context.beginPath();
    context.moveTo(8, 8);
    context.lineTo(size - 8, size - 8);
    context.moveTo(size - 8, 8);
    context.lineTo(8, size - 8);
    context.stroke();
  });
}

function floorTexture([base, line]) {
  return makeTexture((context, size) => {
    context.fillStyle = base;
    context.fillRect(0, 0, size, size);
    speckle(context, size, 0.18);
    context.strokeStyle = line;
    context.lineWidth = 3;
    context.strokeRect(0, 0, size, size);
    context.beginPath();
    context.moveTo(size / 2, 0);
    context.lineTo(size / 2, size);
    context.moveTo(0, size / 2);
    context.lineTo(size, size / 2);
    context.lineWidth = 1;
    context.stroke();
  });
}

function siteTexture(letter) {
  const texture = makeTexture((context, size) => {
    context.clearRect(0, 0, size, size);
    context.font = `900 ${size * 0.8}px Impact, Arial Black, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = 'rgba(190, 30, 25, 0.85)';
    context.fillText(letter, size / 2, size / 2 + size * 0.04);
    context.globalCompositeOperation = 'destination-out';
    for (let index = 0; index < 500; index++) {
      context.fillStyle = `rgba(0,0,0,${Math.random() * 0.5})`;
      context.fillRect(
        Math.random() * size,
        Math.random() * size,
        2 + Math.random() * 5,
        2 + Math.random() * 5,
      );
    }
  });
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function doorTexture() {
  return makeTexture((context, size) => {
    context.fillStyle = '#8a5a2b';
    context.fillRect(0, 0, size, size);
    speckle(context, size, 0.25);
    context.strokeStyle = '#5c3a18';
    context.lineWidth = 4;
    for (let positionX = 0; positionX <= size; positionX += size / 6) {
      context.beginPath();
      context.moveTo(positionX, 0);
      context.lineTo(positionX, size);
      context.stroke();
    }
    context.lineWidth = 12;
    for (const positionY of [size * 0.2, size * 0.8]) {
      context.beginPath();
      context.moveTo(0, positionY);
      context.lineTo(size, positionY);
      context.stroke();
    }
  });
}

function burntTexture() {
  return makeTexture((context, size) => {
    context.fillStyle = '#3a2e26';
    context.fillRect(0, 0, size, size);
    for (let index = 0; index < 60; index++) {
      context.fillStyle = Math.random() < 0.5 ? 'rgba(140,70,30,0.45)' : 'rgba(10,10,10,0.55)';
      context.beginPath();
      context.arc(
        Math.random() * size,
        Math.random() * size,
        4 + Math.random() * 22,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
    speckle(context, size, 0.3);
  });
}

function scaleBoxUV(geometry, width, height, depth) {
  const texture = geometry.attributes.uv;
  const faces = [
    [depth, height],
    [depth, height],
    [width, depth],
    [width, depth],
    [width, height],
    [width, height],
  ];
  for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
    for (let vertexIndex = 0; vertexIndex < 4; vertexIndex++) {
      const index = faceIndex * 4 + vertexIndex;
      texture.setXY(
        index,
        (texture.getX(index) * faces[faceIndex][0]) / TILE,
        (texture.getY(index) * faces[faceIndex][1]) / TILE,
      );
    }
  }
  texture.needsUpdate = true;
}

export function buildWorld(scene, mapId) {
  const map = getMap(mapId);
  const theme = map.theme;
  const group = new THREE.Group();
  scene.background = new THREE.Color(theme.sky);
  scene.fog = new THREE.Fog(theme.sky, theme.fog[0], theme.fog[1]);

  group.add(new THREE.HemisphereLight(0xe3eeff, 0x6b6a60, theme.hemi));
  const sun = new THREE.DirectionalLight(0xfff0d8, theme.sun);
  const ext = Math.max(map.hx, map.hz) + 15;
  sun.position.set(30, 55, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -ext,
    right: ext,
    top: ext,
    bottom: -ext,
    near: 1,
    far: 160,
  });
  sun.shadow.bias = -0.0005;
  group.add(sun);

  const materials = {
    wall: new THREE.MeshStandardMaterial({ map: wallTexture(theme.wall), roughness: 0.95 }),
    crate: new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.9 }),
    ground: new THREE.MeshStandardMaterial({ map: floorTexture(theme.floor), roughness: 1 }),
    roof: new THREE.MeshStandardMaterial({
      map: wallTexture([theme.wall[1], theme.wall[1]]),
      roughness: 1,
      color: 0x9a9a9a,
    }),
    door: new THREE.MeshStandardMaterial({ map: doorTexture(), roughness: 0.85 }),
    car: new THREE.MeshStandardMaterial({ map: burntTexture(), roughness: 0.75, metalness: 0.35 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 }),
  };

  const floorWidth = map.hx * 2 + 4;
  const floorDepth = map.hz * 2 + 4;
  const currentFloorTexture = floorTexture(theme.floor);
  currentFloorTexture.repeat.set(floorWidth / TILE, floorDepth / TILE);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(floorWidth, floorDepth),
    new THREE.MeshStandardMaterial({ map: currentFloorTexture, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const doorMeshes = new Map();
  for (const box of [...map.boxes, ...map.doors]) {
    const width = box.max[0] - box.min[0];
    const height = box.max[1] - box.min[1];
    const depth = box.max[2] - box.min[2];
    const geometry = new THREE.BoxGeometry(width, height, depth);
    scaleBoxUV(geometry, width, height, depth);
    const mesh = new THREE.Mesh(geometry, materials[box.mat] || materials.wall);
    mesh.position.set(
      (box.min[0] + box.max[0]) / 2,
      (box.min[1] + box.max[1]) / 2,
      (box.min[2] + box.max[2]) / 2,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (box.mat === 'door') {
      doorMeshes.set(box.door, mesh);
    }
  }
  group.userData.doors = doorMeshes;

  const siteGlow = new Map();
  for (const [name, site] of Object.entries(map.sites || {})) {
    const centerX = (site.x[0] + site.x[1]) / 2;
    const centerZ = (site.z[0] + site.z[1]) / 2;
    let positionY = 0;
    for (const box of map.boxes) {
      if (
        box.floor &&
        centerX > box.min[0] &&
        centerX < box.max[0] &&
        centerZ > box.min[2] &&
        centerZ < box.max[2]
      ) {
        positionY = Math.max(positionY, box.max[1]);
      }
    }
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.MeshStandardMaterial({
        map: siteTexture(name),
        transparent: true,
        depthWrite: false,
        roughness: 1,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(centerX, positionY + 0.02, centerZ);
    group.add(mesh);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(site.x[1] - site.x[0], site.z[1] - site.z[0]),
      new THREE.MeshBasicMaterial({
        color: 0xff2a1a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(centerX, positionY + 0.03, centerZ);
    glow.visible = false;
    group.add(glow);
    siteGlow.set(name, glow);
  }
  group.userData.siteGlow = siteGlow;
  scene.add(group);
  return group;
}

export function disposeWorld(scene, group) {
  scene.remove(group);
  group.traverse((object) => {
    if (object.geometry) {
      object.geometry.dispose();
    }
    if (object.material) {
      if (object.material.map) {
        object.material.map.dispose();
      }
      object.material.dispose();
    }
    if (object.shadow?.map) {
      object.shadow.map.dispose();
    }
  });
}
