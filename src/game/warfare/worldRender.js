import * as THREE from 'three';
import {
  ACTIVE_MAP,
  HALF,
  CELL,
  N,
  TERRAIN,
  SURF,
  heightAt,
  FIELDS,
  SECTORS,
  RIVER_HALF_W,
  fbm,
} from '../../../shared/warfare/terrain.js';
import { MAPDATA } from '../../../shared/warfare/world.js';
import { WorldLod } from './worldLod.js';

export const WORLD_Q = {
  terrain: [450, 950],
  trees: [420, 2600],
};

function canvasTex(size, draw, repeat = true) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  }
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
const photoCache = {};
export function photoTex(name) {
  if (photoCache[name]) {
    return photoCache[name];
  }
  const texture = new THREE.TextureLoader().load(`tex/${name}.jpg`);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return (photoCache[name] = texture);
}
const speck = (context, size, count, alpha, light = false) => {
  for (let speckIndex = 0; speckIndex < count; speckIndex++) {
    context.fillStyle = light
      ? `rgba(255,255,255,${Math.random() * alpha})`
      : `rgba(0,0,0,${Math.random() * alpha})`;
    context.fillRect(
      Math.random() * size,
      Math.random() * size,
      1 + Math.random() * 2,
      1 + Math.random() * 2,
    );
  }
};
function plainTex(base, amount = 0.12) {
  return canvasTex(128, (context, size) => {
    context.fillStyle = base;
    context.fillRect(0, 0, size, size);
    speck(context, size, 1400, amount);
    speck(context, size, 400, amount * 0.6, true);
  });
}
function brickTex(base, mortar) {
  return canvasTex(128, (context, size) => {
    context.fillStyle = mortar;
    context.fillRect(0, 0, size, size);
    const brickHeight = size / 8;
    for (let row = 0; row < 8; row++) {
      for (let column = -1; column < 4; column++) {
        const positionX = column * (size / 4) + (row % 2 ? size / 8 : 0);
        const variation = Math.floor(Math.random() * 30) - 15;
        context.fillStyle = shade(base, variation);
        context.fillRect(positionX + 2, row * brickHeight + 2, size / 4 - 4, brickHeight - 4);
      }
    }
    speck(context, size, 600, 0.15);
  });
}
function corrugatedTex(base) {
  return canvasTex(128, (context, size) => {
    context.fillStyle = base;
    context.fillRect(0, 0, size, size);
    for (let positionX = 0; positionX < size; positionX += 8) {
      context.fillStyle = 'rgba(255,255,255,0.10)';
      context.fillRect(positionX, 0, 3, size);
      context.fillStyle = 'rgba(0,0,0,0.18)';
      context.fillRect(positionX + 5, 0, 2, size);
    }
    for (let index = 0; index < 30; index++) {
      context.fillStyle = `rgba(110,60,30,${Math.random() * 0.25})`;
      context.fillRect(
        Math.random() * size,
        Math.random() * size,
        3 + Math.random() * 10,
        2 + Math.random() * 18,
      );
    }
  });
}
function plankTex(base) {
  return canvasTex(128, (context, size) => {
    context.fillStyle = base;
    context.fillRect(0, 0, size, size);
    for (let positionY = 0; positionY < size; positionY += 16) {
      context.fillStyle = shade(base, Math.floor(Math.random() * 30) - 15);
      context.fillRect(0, positionY + 1, size, 14);
      context.fillStyle = 'rgba(0,0,0,0.35)';
      context.fillRect(0, positionY, size, 1);
    }
    speck(context, size, 500, 0.2);
  });
}
function sandbagTex() {
  return canvasTex(128, (context, size) => {
    context.fillStyle = '#7d6c4c';
    context.fillRect(0, 0, size, size);
    const rowHeight = size / 6;
    for (let row = 0; row < 6; row++) {
      for (let column = -1; column < 4; column++) {
        const positionX = column * (size / 3) + (row % 2 ? size / 6 : 0);
        context.fillStyle = shade('#a8926a', Math.floor(Math.random() * 24) - 12);
        context.beginPath();
        context.ellipse(
          positionX + size / 6,
          row * rowHeight + rowHeight / 2,
          size / 6 - 2,
          rowHeight / 2 - 1.5,
          0,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
    }
    speck(context, size, 400, 0.18);
  });
}
function hescoTex() {
  return canvasTex(128, (context, size) => {
    context.fillStyle = '#b4a27a';
    context.fillRect(0, 0, size, size);
    speck(context, size, 900, 0.2);
    context.strokeStyle = 'rgba(70,70,60,0.75)';
    context.lineWidth = 2;
    for (let index = 0; index <= size; index += 16) {
      context.beginPath();
      context.moveTo(index, 0);
      context.lineTo(index, size);
      context.moveTo(0, index);
      context.lineTo(size, index);
      context.stroke();
    }
  });
}
function roofTex() {
  return canvasTex(128, (context, size) => {
    context.fillStyle = '#5c3428';
    context.fillRect(0, 0, size, size);
    for (let positionY = 0; positionY < size; positionY += 12) {
      for (let positionX = (positionY / 12) % 2 ? -8 : 0; positionX < size; positionX += 16) {
        context.fillStyle = shade('#7a4535', Math.floor(Math.random() * 30) - 15);
        context.fillRect(positionX + 1, positionY + 1, 14, 10);
      }
    }
  });
}
function crossTex() {
  return canvasTex(128, (context, size) => {
    context.fillStyle = '#d9d9d4';
    context.fillRect(0, 0, size, size);
    context.fillStyle = '#c42020';
    context.fillRect(size * 0.4, size * 0.15, size * 0.2, size * 0.7);
    context.fillRect(size * 0.15, size * 0.4, size * 0.7, size * 0.2);
  });
}
function ammoTex() {
  return canvasTex(128, (context, size) => {
    context.fillStyle = '#4b5a33';
    context.fillRect(0, 0, size, size);
    speck(context, size, 500, 0.2);
    context.fillStyle = '#e8d24a';
    context.font = 'bold 30px sans-serif';
    context.textAlign = 'center';
    context.fillText('AMMO', size / 2, size / 2 + 10);
    context.strokeStyle = '#2c3520';
    context.lineWidth = 6;
    context.strokeRect(3, 3, size - 6, size - 6);
  });
}
function shade(hex, delta) {
  const packedColor = parseInt(hex.slice(1), 16);
  const clampChannel = (value) => Math.max(0, Math.min(255, value + delta));
  return `rgb(${clampChannel(packedColor >> 16)},${clampChannel((packedColor >> 8) & 255)},${clampChannel(packedColor & 255)})`;
}

export function makeMaterials() {
  const standardMaterial = (offset) =>
    new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, ...offset });
  const materials = {
    plaster1: standardMaterial({ map: plainTex('#c9bba0') }),
    plaster2: standardMaterial({ map: plainTex('#b3a58b') }),
    plaster3: standardMaterial({ map: plainTex('#d8d1c2') }),
    brick: standardMaterial({ map: brickTex('#8e5a43', '#6b625a') }),
    stone: standardMaterial({ map: brickTex('#8f8a7e', '#5d5a52') }),
    concrete: standardMaterial({ map: plainTex('#9a978f', 0.18) }),
    wood: standardMaterial({ map: plankTex('#6e5034') }),
    plank: standardMaterial({ map: plankTex('#8a6a44') }),
    metal: standardMaterial({ map: corrugatedTex('#7f8a8f'), metalness: 0.25, roughness: 0.7 }),
    metalroof: standardMaterial({ map: corrugatedTex('#5d6468'), metalness: 0.25, roughness: 0.7 }),
    roof: standardMaterial({ map: roofTex() }),
    tent: standardMaterial({ map: plainTex('#5f6143', 0.15) }),
    barn: standardMaterial({ map: plankTex('#7a3a2a') }),
    sandbag: standardMaterial({ map: sandbagTex() }),
    hesco: standardMaterial({ map: hescoTex() }),
    steel: standardMaterial({ color: 0x3c3f42, metalness: 0.5, roughness: 0.5 }),
    containerR: standardMaterial({ map: corrugatedTex('#8a3a2c'), metalness: 0.3, roughness: 0.6 }),
    containerG: standardMaterial({ map: corrugatedTex('#3f6b45'), metalness: 0.3, roughness: 0.6 }),
    containerB: standardMaterial({ map: corrugatedTex('#2f5376'), metalness: 0.3, roughness: 0.6 }),
    containerY: standardMaterial({ map: corrugatedTex('#b8902d'), metalness: 0.3, roughness: 0.6 }),
    silo: standardMaterial({ map: corrugatedTex('#b6b8b5'), metalness: 0.4, roughness: 0.5 }),
    tank: standardMaterial({ color: 0xc7c9c2, metalness: 0.35, roughness: 0.45 }),
    log: standardMaterial({ map: plankTex('#6d4c2f') }),
    bridge: standardMaterial({ map: plainTex('#8a8780', 0.2) }),
    ammo: standardMaterial({ map: ammoTex() }),
    medical: standardMaterial({ map: crossTex() }),
    radio: standardMaterial({ color: 0x3a4434, roughness: 0.7 }),
    crate: standardMaterial({ map: plankTex('#a97b45') }),
    lattice: standardMaterial({ color: 0x9aa0a3, metalness: 0.6, roughness: 0.4 }),
    rock: standardMaterial({ map: plainTex('#7b776e', 0.25), flatShading: true }),
    fence: standardMaterial({ map: plankTex('#7a6040') }),
    wire: standardMaterial({ color: 0x8c8c86, metalness: 0.7, roughness: 0.4 }),
    vehicle: standardMaterial({ color: 0x555555 }),
  };
  return materials;
}

const FACE = [
  {
    n: [1, 0, 0],
    c: (bounds, unusedBounds) => [
      [bounds[0][1], bounds[1][0], bounds[2][1]],
      [bounds[0][1], bounds[1][0], bounds[2][0]],
      [bounds[0][1], bounds[1][1], bounds[2][0]],
      [bounds[0][1], bounds[1][1], bounds[2][1]],
    ],
    uv: (width, height, depth) => [depth, height],
  },
  {
    n: [-1, 0, 0],
    c: (bounds) => [
      [bounds[0][0], bounds[1][0], bounds[2][0]],
      [bounds[0][0], bounds[1][0], bounds[2][1]],
      [bounds[0][0], bounds[1][1], bounds[2][1]],
      [bounds[0][0], bounds[1][1], bounds[2][0]],
    ],
    uv: (width, height, depth) => [depth, height],
  },
  {
    n: [0, 1, 0],
    c: (bounds) => [
      [bounds[0][0], bounds[1][1], bounds[2][1]],
      [bounds[0][1], bounds[1][1], bounds[2][1]],
      [bounds[0][1], bounds[1][1], bounds[2][0]],
      [bounds[0][0], bounds[1][1], bounds[2][0]],
    ],
    uv: (width, height, depth) => [width, depth],
  },
  {
    n: [0, -1, 0],
    c: (bounds) => [
      [bounds[0][0], bounds[1][0], bounds[2][0]],
      [bounds[0][1], bounds[1][0], bounds[2][0]],
      [bounds[0][1], bounds[1][0], bounds[2][1]],
      [bounds[0][0], bounds[1][0], bounds[2][1]],
    ],
    uv: (width, height, depth) => [width, depth],
  },
  {
    n: [0, 0, 1],
    c: (bounds) => [
      [bounds[0][0], bounds[1][0], bounds[2][1]],
      [bounds[0][1], bounds[1][0], bounds[2][1]],
      [bounds[0][1], bounds[1][1], bounds[2][1]],
      [bounds[0][0], bounds[1][1], bounds[2][1]],
    ],
    uv: (width, height, depth) => [width, height],
  },
  {
    n: [0, 0, -1],
    c: (bounds) => [
      [bounds[0][1], bounds[1][0], bounds[2][0]],
      [bounds[0][0], bounds[1][0], bounds[2][0]],
      [bounds[0][0], bounds[1][1], bounds[2][0]],
      [bounds[0][1], bounds[1][1], bounds[2][0]],
    ],
    uv: (width, height, depth) => [width, height],
  },
];
export function boxesGeometry(list, tile = 2) {
  const position = [];
  const normals = [];
  const currentUvs = [];
  const indices = [];
  for (const item of list) {
    const bounds = [
      [item.min[0], item.max[0]],
      [item.min[1], item.max[1]],
      [item.min[2], item.max[2]],
    ];
    const width = item.max[0] - item.min[0];
    const height = item.max[1] - item.min[1];
    const depth = item.max[2] - item.min[2];
    for (const face of FACE) {
      if (
        face.n[1] === -1 &&
        item.min[1] <
          heightAt((item.min[0] + item.max[0]) / 2, (item.min[2] + item.max[2]) / 2) + 0.1
      ) {
        continue;
      }
      const base = position.length / 3;
      const corners = face.c(bounds);
      const [textureWidth, textureHeight] = face.uv(width, height, depth);
      const uvs = [
        [0, 0],
        [textureWidth / tile, 0],
        [textureWidth / tile, textureHeight / tile],
        [0, textureHeight / tile],
      ];
      for (let regionKey = 0; regionKey < 4; regionKey++) {
        position.push(...corners[regionKey]);
        normals.push(...face.n);
        currentUvs.push(...uvs[regionKey]);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(currentUvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

const SURF_COL = {
  [SURF.grass]: [0x5d773a, 0x7b8a47],
  [SURF.field]: [0x9d9450, 0x6f8b3a],
  [SURF.forest]: [0x3c4f27, 0x4a5a2c],
  [SURF.rock]: [0x7b776f, 0x8e8a80],
  [SURF.sand]: [0xa89a73, 0xb5a77e],
  [SURF.water]: [0x4a4f3e, 0x55594a],
  [SURF.dirt]: [0x7f6b4d, 0x8a7656],
  [SURF.asphalt]: [0x45474a, 0x4b4d50],
  [SURF.concrete]: [0x8a8880, 0x96938a],
};
const IRON_COL = {
  [SURF.grass]: [0x998260, 0xb7a07b],
  [SURF.forest]: [0x5d6240, 0x7d7851],
  [SURF.rock]: [0x65584e, 0x93806b],
  [SURF.sand]: [0xbba27e, 0xc5b08c],
  [SURF.dirt]: [0x91775a, 0xac9170],
};
const scratchColor = new THREE.Color();
const scratchColorB = new THREE.Color();
function terrainColor(positionX, positionZ, surface, height, out) {
  const [colorA, colorB] =
    (ACTIVE_MAP === 'ironpass' ? IRON_COL[surface] : null) ||
    SURF_COL[surface] ||
    SURF_COL[SURF.grass];
  const noise = fbm(positionX / 40, positionZ / 40, 3, 91);
  if (surface === SURF.field) {
    const fieldIndex = FIELDS.findIndex(
      ([fieldMinX, fieldMinZ, fieldMaxX, fieldMaxZ]) =>
        positionX > fieldMinX &&
        positionX < fieldMaxX &&
        positionZ > fieldMinZ &&
        positionZ < fieldMaxZ,
    );
    const crops = [0xb39d55, 0x6c8a38, 0x7a5c3c, 0x9aa04c];
    out.setHex(crops[(fieldIndex + 4) % 4]);
    const stripe =
      Math.sin(((fieldIndex % 2 ? positionX : positionZ) / 3) * Math.PI) > 0 ? 0.92 : 1.04;
    return out.multiplyScalar(stripe * (0.9 + noise * 0.2));
  }
  out.setHex(colorA).lerp(scratchColorB.setHex(colorB), noise);
  if (ACTIVE_MAP !== 'ironpass' && surface === SURF.grass && height > 120) {
    out.lerp(scratchColorB.setHex(0x7d7d63), Math.min(1, (height - 120) / 60));
  }
  if (surface === SURF.grass) {
    out.multiplyScalar(0.88 + fbm(positionX / 9, positionZ / 9, 2, 13) * 0.24);
  }
  return out;
}

export const TERRAIN_LOD = { steps: [1, 2, 4] };
function terrainMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  });
  const texture = {
    tGrass: photoTex('grass'),
    tDirt: photoTex('dirt'),
    tRock: photoTex('rock'),
    tGravel: photoTex('gravel'),
  };
  material.onBeforeCompile = (shader) => {
    for (const key in texture) {
      shader.uniforms[key] = { value: texture[key] };
    }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec2 vWorldXZ;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvWorldXZ = (modelMatrix * vec4(position, 1.0)).xz;\nvSplat = splat;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec4 vSplat;
varying vec2 vWorldXZ;
uniform sampler2D tGrass, tDirt, tRock, tGravel;
vec3 detailOf(sampler2D t, vec2 a, vec2 b) {
  vec3 avg = max(textureLod(t, vec2(0.5), 12.0).rgb, vec3(0.02));
  return (texture2D(t, a).rgb * 0.62 + texture2D(t, b).rgb * 0.38) / avg;
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec2 uvA = vWorldXZ / 6.0;
vec2 uvB = mat2(0.8, -0.6, 0.6, 0.8) * vWorldXZ / 21.0;
vec4 w = vSplat / max(dot(vSplat, vec4(1.0)), 0.001);
vec3 d = vec3(0.0);
if (w.x > 0.01) d += w.x * detailOf(tGrass, uvA, uvB);
if (w.y > 0.01) d += w.y * detailOf(tDirt, uvA, uvB);
if (w.z > 0.01) d += w.z * detailOf(tRock, uvA * 0.6, uvB * 0.6);
if (w.w > 0.01) d += w.w * detailOf(tGravel, uvA * 1.4, uvB);
d = 1.0 + (d - 1.0) * 1.2;
float dl = dot(d, vec3(0.299, 0.587, 0.114));
d = mix(vec3(dl), d, 0.55);
float mac = dot(texture2D(tGrass, vWorldXZ / 310.0).rgb / max(textureLod(tGrass, vec2(0.5), 12.0).rgb, vec3(0.02)), vec3(0.333));
d *= mix(1.0, mac, 0.45);
diffuseColor.rgb *= clamp(d, vec3(0.35), vec3(1.9));`,
      );
  };
  return material;
}
const SPLAT = {
  [SURF.grass]: [1, 0, 0, 0],
  [SURF.field]: [0.75, 0.25, 0, 0],
  [SURF.forest]: [0.7, 0.3, 0, 0],
  [SURF.rock]: [0, 0.1, 0.9, 0],
  [SURF.sand]: [0, 0.15, 0, 0.85],
  [SURF.water]: [0, 0.3, 0, 0.7],
  [SURF.dirt]: [0.1, 0.9, 0, 0],
  [SURF.asphalt]: [0, 0.6, 0, 0.4],
  [SURF.concrete]: [0, 0.3, 0, 0.7],
};
const IRON_SPLAT = { [SURF.grass]: [0.35, 0.65, 0, 0], [SURF.forest]: [0.6, 0.4, 0, 0] };
function splatOf(surface, normalY, out, offset) {
  const splat =
    (ACTIVE_MAP === 'ironpass' && IRON_SPLAT[surface]) || SPLAT[surface] || SPLAT[SURF.grass];
  const steepness = Math.min(1, Math.max(0, (0.9 - normalY) / 0.18));
  out[offset] = splat[0] * (1 - steepness);
  out[offset + 1] = splat[1] * (1 - steepness);
  out[offset + 2] = splat[2] * (1 - steepness) + steepness;
  out[offset + 3] = splat[3] * (1 - steepness);
}
function terrainChunkGeo(chunkColumn, chunkRow, CHUNK_CELLS, step) {
  const { H: heights, surf } = TERRAIN;
  const gridSize = CHUNK_CELLS / step + 1;
  const hAt = (gridX, gridZ) =>
    heights[Math.max(0, Math.min(N - 1, gridZ)) * N + Math.max(0, Math.min(N - 1, gridX))];
  const perim = 4 * (gridSize - 1);
  const total = gridSize * gridSize + perim;
  const position = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const color = new Float32Array(total * 3);
  const spl = new Float32Array(total * 4);
  const put = (value, gridX, gridZ, positionY) => {
    const positionX = -HALF + gridX * CELL;
    const positionZ = -HALF + gridZ * CELL;
    const offset = value * 3;
    position[offset] = positionX;
    position[offset + 1] = positionY;
    position[offset + 2] = positionZ;
    const normalX = -(hAt(gridX + 1, gridZ) - hAt(gridX - 1, gridZ)) / (2 * CELL);
    const normalZ = -(hAt(gridX, gridZ + 1) - hAt(gridX, gridZ - 1)) / (2 * CELL);
    const distance = Math.hypot(normalX, 1, normalZ);
    normals[offset] = normalX / distance;
    normals[offset + 1] = 1 / distance;
    normals[offset + 2] = normalZ / distance;
    const gridIndex = Math.min(N - 1, gridZ) * N + Math.min(N - 1, gridX);
    terrainColor(positionX, positionZ, surf[gridIndex], heights[gridIndex], scratchColor);
    color[offset] = scratchColor.r;
    color[offset + 1] = scratchColor.g;
    color[offset + 2] = scratchColor.b;
    splatOf(surf[gridIndex], normals[offset + 1], spl, value * 4);
  };
  for (let innerIndex = 0; innerIndex < gridSize; innerIndex++) {
    for (let index = 0; index < gridSize; index++) {
      const gridX = chunkColumn * CHUNK_CELLS + index * step;
      const gridZ = chunkRow * CHUNK_CELLS + innerIndex * step;
      put(innerIndex * gridSize + index, gridX, gridZ, hAt(gridX, gridZ));
    }
  }
  const indices = [];
  for (let innerIndex = 0; innerIndex < gridSize - 1; innerIndex++) {
    for (let index = 0; index < gridSize - 1; index++) {
      const topLeft = innerIndex * gridSize + index;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + gridSize;
      const bottomRight = bottomLeft + 1;
      indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
    }
  }
  const ring = [];
  for (let index = 0; index < gridSize - 1; index++) {
    ring.push(index);
  }
  for (let innerIndex = 0; innerIndex < gridSize - 1; innerIndex++) {
    ring.push(innerIndex * gridSize + gridSize - 1);
  }
  for (let index = gridSize - 1; index > 0; index--) {
    ring.push((gridSize - 1) * gridSize + index);
  }
  for (let innerIndex = gridSize - 1; innerIndex > 0; innerIndex--) {
    ring.push(innerIndex * gridSize);
  }
  const drop = 1.5 + step * 1.5;
  ring.forEach((vertex, index) => {
    const skirtIndex = gridSize * gridSize + index;
    position.copyWithin(skirtIndex * 3, vertex * 3, vertex * 3 + 3);
    position[skirtIndex * 3 + 1] -= drop;
    normals.copyWithin(skirtIndex * 3, vertex * 3, vertex * 3 + 3);
    color.copyWithin(skirtIndex * 3, vertex * 3, vertex * 3 + 3);
    spl.copyWithin(skirtIndex * 4, vertex * 4, vertex * 4 + 4);
  });
  for (let index = 0; index < ring.length; index++) {
    const ringVertex = ring[index];
    const nextRingVertex = ring[(index + 1) % ring.length];
    const startIndex = gridSize * gridSize + index;
    const endIndex = gridSize * gridSize + ((index + 1) % ring.length);
    indices.push(
      ringVertex,
      startIndex,
      nextRingVertex,
      nextRingVertex,
      startIndex,
      endIndex,
      ringVertex,
      nextRingVertex,
      startIndex,
      nextRingVertex,
      endIndex,
      startIndex,
    );
  }
  const chunkGeometry = new THREE.BufferGeometry();
  chunkGeometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  chunkGeometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  chunkGeometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  chunkGeometry.setAttribute('splat', new THREE.BufferAttribute(spl, 4));
  chunkGeometry.setIndex(indices);
  chunkGeometry.computeBoundingSphere();
  return chunkGeometry;
}

function buildTerrain(group, lod, quality) {
  const CHUNK_CELLS = 64;
  const chunks = (N - 1) / CHUNK_CELLS;
  const material = terrainMaterial();
  const { H: heights } = TERRAIN;
  for (let chunkRow = 0; chunkRow < chunks; chunkRow++) {
    for (let chunkColumn = 0; chunkColumn < chunks; chunkColumn++) {
      const meshes = TERRAIN_LOD.steps.map((step, levelIndex) => {
        const mesh = new THREE.Mesh(
          terrainChunkGeo(chunkColumn, chunkRow, CHUNK_CELLS, step),
          material,
        );
        mesh.receiveShadow = levelIndex === 0;
        mesh.visible = false;
        group.add(mesh);
        return mesh;
      });
      let lowest = Infinity;
      let highest = -Infinity;
      for (let innerIndex = 0; innerIndex <= CHUNK_CELLS; innerIndex++) {
        for (let index = 0; index <= CHUNK_CELLS; index++) {
          const height =
            heights[(chunkRow * CHUNK_CELLS + innerIndex) * N + chunkColumn * CHUNK_CELLS + index];
          if (height < lowest) {
            lowest = height;
          }
          if (height > highest) {
            highest = height;
          }
        }
      }
      const chunkStartX = -HALF + chunkColumn * CHUNK_CELLS * CELL;
      const chunkStartZ = -HALF + chunkRow * CHUNK_CELLS * CELL;
      lod.add({
        kind: 'terrain',
        box: [
          chunkStartX,
          lowest,
          chunkStartZ,
          chunkStartX + CHUNK_CELLS * CELL,
          highest,
          chunkStartZ + CHUNK_CELLS * CELL,
        ],
        levels: quality.terrain,
        occ: true,
        apply(level, visible) {
          meshes.forEach(
            (lodMesh, levelIndex) =>
              (lodMesh.visible = visible && levelIndex === Math.min(level, 2)),
          );
        },
      });
    }
  }
}

function roadTexture(asphalt) {
  const size = 512;
  const texture = canvasTex(size, (context, size) => drawRoad(context, size, asphalt, null));
  const image = new Image();
  image.onload = () => {
    drawRoad(texture.image.getContext('2d'), size, asphalt, image);
    texture.needsUpdate = true;
  };
  image.src = `tex/${asphalt ? 'asphalt' : 'track'}.jpg`;
  return texture;
}
function drawRoad(context, size, asphalt, image) {
  {
    if (image) {
      context.drawImage(image, 0, 0, size, size);
      context.fillStyle = asphalt ? 'rgba(40,42,46,0.35)' : 'rgba(110,88,60,0.25)';
      context.fillRect(0, 0, size, size);
    } else {
      context.fillStyle = asphalt ? '#46484b' : '#806b4c';
      context.fillRect(0, 0, size, size);
      speck(context, size, 2000 * (size / 128) ** 2, asphalt ? 0.25 : 0.3);
      speck(context, size, 600 * (size / 128) ** 2, 0.12, true);
    }
    context.save();
    context.scale(size / 128, size / 128);
    size = 128;
    if (asphalt) {
      context.fillStyle = 'rgba(230,220,160,0.85)';
      context.fillRect(size / 2 - 2, 0, 4, size * 0.5);
      context.fillStyle = 'rgba(235,235,235,0.7)';
      context.fillRect(6, 0, 3, size);
      context.fillRect(size - 9, 0, 3, size);
    } else {
      context.fillStyle = 'rgba(60,45,30,0.35)';
      context.fillRect(size * 0.22, 0, size * 0.12, size);
      context.fillRect(size * 0.66, 0, size * 0.12, size);
      context.fillStyle = 'rgba(90,110,50,0.4)';
      context.fillRect(0, 0, 8, size);
      context.fillRect(size - 8, 0, 8, size);
    }
    context.restore();
  }
}

const RIBBON_STEP_M = 2;
const RIBBON_COLUMNS = 4;
function densify(points) {
  const out = [];
  const source = [];
  for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex++) {
    const [startX, startZ] = points[segmentIndex];
    const [endX, endZ] = points[segmentIndex + 1];
    const segments = Math.max(
      1,
      Math.ceil(Math.hypot(endX - startX, endZ - startZ) / RIBBON_STEP_M),
    );
    for (let index = 0; index < segments; index++) {
      out.push([
        startX + ((endX - startX) * index) / segments,
        startZ + ((endZ - startZ) * index) / segments,
      ]);
      source.push(segmentIndex + index / segments);
    }
  }
  out.push(points[points.length - 1]);
  source.push(points.length - 1);
  return { out, source };
}

function ribbon(points, half, yOf, vScale) {
  const { out: line, source } = densify(points);
  const position = [];
  const uvs = [];
  const indices = [];
  const columns = RIBBON_COLUMNS + 1;
  let along = 0;
  for (let pointIndex = 0; pointIndex < line.length; pointIndex++) {
    const point = line[pointIndex];
    const previousPoint = line[Math.max(0, pointIndex - 1)];
    const nextPoint = line[Math.min(line.length - 1, pointIndex + 1)];
    let deltaX = nextPoint[0] - previousPoint[0];
    let deltaZ = nextPoint[1] - previousPoint[1];
    const distance = Math.hypot(deltaX, deltaZ) || 1;
    deltaX /= distance;
    deltaZ /= distance;
    if (pointIndex > 0) {
      along += Math.hypot(point[0] - line[pointIndex - 1][0], point[1] - line[pointIndex - 1][1]);
    }
    const sourceIndex = Math.round(source[pointIndex]);
    for (let column = 0; column < columns; column++) {
      const columnRatio = column / RIBBON_COLUMNS;
      const offset = (columnRatio * 2 - 1) * half;
      const positionX = point[0] - deltaZ * offset;
      const positionZ = point[1] + deltaX * offset;
      position.push(
        positionX,
        yOf(positionX, positionZ, sourceIndex, source[pointIndex]),
        positionZ,
      );
      uvs.push(columnRatio, along / vScale);
    }
    if (pointIndex > 0) {
      const row = (pointIndex - 1) * columns;
      for (let column = 0; column < RIBBON_COLUMNS; column++) {
        const offset = row + column;
        indices.push(
          offset,
          offset + columns,
          offset + 1,
          offset + 1,
          offset + columns,
          offset + columns + 1,
        );
      }
    }
  }
  const ribbonGeometry = new THREE.BufferGeometry();
  ribbonGeometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  ribbonGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  ribbonGeometry.setIndex(indices);
  ribbonGeometry.computeVertexNormals();
  return ribbonGeometry;
}

function buildRoads(group) {
  const asph = new THREE.MeshStandardMaterial({
    map: roadTexture(true),
    roughness: 0.95,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const dirt = new THREE.MeshStandardMaterial({
    map: roadTexture(false),
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  for (const road of TERRAIN.roads) {
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        const geometry = ribbon(
          run,
          road.hw,
          (positionX, positionZ) => heightAt(positionX, positionZ) + 0.06,
          road.kind === 'asphalt' ? 10 : 8,
        );
        const mesh = new THREE.Mesh(geometry, road.kind === 'asphalt' ? asph : dirt);
        mesh.receiveShadow = true;
        group.add(mesh);
      }
      run = [];
    };
    road.pts.forEach((point, pointIndex) => {
      if (road.riverAt[pointIndex]) {
        flush();
      } else {
        run.push(point);
      }
    });
    flush();
  }
  for (const bridge of MAPDATA.bridges) {
    const deckAt = (_positionX, _positionZ, _pointIndex, at) => {
      if (!bridge.dh) {
        return bridge.deck;
      }
      const index = Math.min(bridge.dh.length - 2, Math.floor(at));
      return bridge.dh[index] + (bridge.dh[index + 1] - bridge.dh[index]) * (at - index);
    };
    const geometry = ribbon(
      bridge.pts,
      bridge.hw - 0.4,
      (positionX, positionZ, pointIndex, at) => deckAt(positionX, positionZ, pointIndex, at) + 0.04,
      10,
    );
    group.add(new THREE.Mesh(geometry, asph));
  }
}

function buildWater(group) {
  const material = new THREE.MeshStandardMaterial({
    color: 0x3f5f66,
    roughness: 0.12,
    metalness: 0.25,
    transparent: true,
    opacity: 0.86,
  });
  const river = TERRAIN.river;
  const waterLevels = TERRAIN.wl;
  const levelAt = (at) => {
    const index = Math.min(waterLevels.length - 2, Math.floor(at));
    return waterLevels[index] + (waterLevels[index + 1] - waterLevels[index]) * (at - index);
  };
  const geometry = ribbon(
    river,
    RIVER_HALF_W + 4,
    (positionX, positionZ, pointIndex, at) => levelAt(at) + 0.02,
    20,
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  group.add(mesh);
  return material;
}

function addCyl(group, box, materials) {
  const cylinderRadius = (box.max[0] - box.min[0]) / 2;
  const height = box.max[1] - box.min[1];
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(cylinderRadius, cylinderRadius, height, 20),
    materials[box.mat] || materials.concrete,
  );
  mesh.position.set(
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  );
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
  if (box.mat === 'silo') {
    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(cylinderRadius * 1.02, cylinderRadius * 0.7, 20),
      materials.metalroof,
    );
    cap.position.set(mesh.position.x, box.max[1] + cylinderRadius * 0.35, mesh.position.z);
    group.add(cap);
  }
}
function latticeBoxes(box) {
  const out = [];
  const centerX = (box.min[0] + box.max[0]) / 2;
  const centerZ = (box.min[2] + box.max[2]) / 2;
  const baseY = box.min[1] + 0.5;
  const boxHeight = box.max[1] - baseY;
  const baseWidth = 2.2;
  const seg = 14;
  for (let segmentIndex = 0; segmentIndex < seg; segmentIndex++) {
    const startRatio = segmentIndex / seg;
    const endRatio = (segmentIndex + 1) / seg;
    const startWidth = baseWidth * (1 - startRatio * 0.75);
    const endWidth = baseWidth * (1 - endRatio * 0.75);
    const startY = baseY + startRatio * boxHeight;
    const endY = baseY + endRatio * boxHeight;
    for (const [sideX, sideZ] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const startX = centerX + (sideX * startWidth) / 2;
      const startZ = centerZ + (sideZ * startWidth) / 2;
      const endX = centerX + (sideX * endWidth) / 2;
      const endZ = centerZ + (sideZ * endWidth) / 2;
      out.push({
        min: [Math.min(startX, endX) - 0.06, startY, Math.min(startZ, endZ) - 0.06],
        max: [Math.max(startX, endX) + 0.06, endY, Math.max(startZ, endZ) + 0.06],
      });
    }
    out.push({
      min: [centerX - endWidth / 2, endY - 0.05, centerZ - endWidth / 2 - 0.04],
      max: [centerX + endWidth / 2, endY + 0.05, centerZ - endWidth / 2 + 0.04],
    });
    out.push({
      min: [centerX - endWidth / 2, endY - 0.05, centerZ + endWidth / 2 - 0.04],
      max: [centerX + endWidth / 2, endY + 0.05, centerZ + endWidth / 2 + 0.04],
    });
    out.push({
      min: [centerX - endWidth / 2 - 0.04, endY - 0.05, centerZ - endWidth / 2],
      max: [centerX - endWidth / 2 + 0.04, endY + 0.05, centerZ + endWidth / 2],
    });
    out.push({
      min: [centerX + endWidth / 2 - 0.04, endY - 0.05, centerZ - endWidth / 2],
      max: [centerX + endWidth / 2 + 0.04, endY + 0.05, centerZ + endWidth / 2],
    });
  }
  out.push({
    min: [centerX - 0.05, box.max[1], centerZ - 0.05],
    max: [centerX + 0.05, box.max[1] + 6, centerZ + 0.05],
  });
  out.push({
    min: [centerX - 0.5, box.max[1] - 3, centerZ - 0.2],
    max: [centerX + 0.5, box.max[1] - 1.5, centerZ + 0.2],
  });
  return out;
}
export function hedgehogMesh(box, material) {
  const geometry = new THREE.Group();
  const size = box.max[0] - box.min[0];
  for (const [rotationX, rotationZ] of [
    [0.8, 0],
    [-0.8, 0],
    [0, Math.PI / 2 + 0.8],
  ]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.14, size * 1.15, 0.14), material);
    beam.rotation.set(rotationX, rotationZ, 0.6 * Math.sign(rotationX || 1));
    geometry.add(beam);
  }
  geometry.position.set(
    (box.min[0] + box.max[0]) / 2,
    box.min[1] + (box.max[1] - box.min[1]) * 0.55,
    (box.min[2] + box.max[2]) / 2,
  );
  geometry.traverse((offset) => {
    if (offset.isMesh) {
      offset.castShadow = true;
    }
  });
  return geometry;
}
function hash3(positionX, positionY, positionZ) {
  const hash = Math.sin(positionX * 127.1 + positionY * 311.7 + positionZ * 74.7) * 43758.5453;
  return hash - Math.floor(hash);
}
function vnoise(positionX, positionY, positionZ) {
  const cellX = Math.floor(positionX);
  const cellY = Math.floor(positionY);
  const cellZ = Math.floor(positionZ);
  const smooth = (amount) => amount * amount * (3 - 2 * amount);
  const fractionX = smooth(positionX - cellX);
  const fractionY = smooth(positionY - cellY);
  const fractionZ = smooth(positionZ - cellZ);
  const lerp = (from, to, amount) => from + (to - from) * amount;
  const cornerValue = (deltaX, deltaY, deltaZ) =>
    hash3(cellX + deltaX, cellY + deltaY, cellZ + deltaZ);
  return lerp(
    lerp(
      lerp(cornerValue(0, 0, 0), cornerValue(1, 0, 0), fractionX),
      lerp(cornerValue(0, 1, 0), cornerValue(1, 1, 0), fractionX),
      fractionY,
    ),
    lerp(
      lerp(cornerValue(0, 0, 1), cornerValue(1, 0, 1), fractionX),
      lerp(cornerValue(0, 1, 1), cornerValue(1, 1, 1), fractionX),
      fractionY,
    ),
    fractionZ,
  );
}
const fbm3 = (positionX, positionY, positionZ) =>
  vnoise(positionX, positionY, positionZ) * 0.6 +
  vnoise(positionX * 2.1, positionY * 2.1, positionZ * 2.1) * 0.28 +
  vnoise(positionX * 4.3, positionY * 4.3, positionZ * 4.3) * 0.12;

function lumpyGeometry(
  radius,
  detail,
  { amp: amplitude = 0.25, freq: frequency = 1.6, seed = 0, squash = 1, paint },
) {
  const geometry = new THREE.IcosahedronGeometry(1, detail).toNonIndexed();
  const positionAttribute = geometry.attributes.position;
  const color = new Float32Array(positionAttribute.count * 3);
  let yMin = Infinity;
  let yMax = -Infinity;
  const heights = [];
  for (let index = 0; index < positionAttribute.count; index++) {
    const positionX = positionAttribute.getX(index);
    const positionY = positionAttribute.getY(index);
    const positionZ = positionAttribute.getZ(index);
    const noise = fbm3(
      positionX * frequency + seed,
      positionY * frequency + seed * 0.7,
      positionZ * frequency + seed * 1.3,
    );
    const bumpRadius = radius * (1 + amplitude * (noise - 0.5) * 2);
    positionAttribute.setXYZ(
      index,
      positionX * bumpRadius,
      positionY * bumpRadius * squash,
      positionZ * bumpRadius,
    );
    geometry.attributes.normal.setXYZ(index, positionX, positionY, positionZ);
    heights.push(positionY * bumpRadius * squash);
    yMin = Math.min(yMin, heights[index]);
    yMax = Math.max(yMax, heights[index]);
    color[index * 3] = noise;
  }
  for (let index = 0; index < positionAttribute.count; index++) {
    const [red, green, blue] = paint
      ? paint((heights[index] - yMin) / (yMax - yMin || 1), color[index * 3])
      : [1, 1, 1];
    color[index * 3] = red;
    color[index * 3 + 1] = green;
    color[index * 3 + 2] = blue;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  return geometry;
}

function rockMeshes(list, material) {
  const VARIANTS = 4;
  const rockMat = material.clone();
  rockMat.vertexColors = true;
  const geometries = [];
  for (let variantIndex = 0; variantIndex < VARIANTS; variantIndex++) {
    const geometry = lumpyGeometry(0.5, 1, {
      amp: 0.2 + variantIndex * 0.03,
      freq: 1.5 + variantIndex * 0.35,
      seed: variantIndex * 17.3,
      squash: 0.85 + (variantIndex % 2) * 0.12,
      paint: (positionY, noise) => {
        const brightness = 0.66 + 0.42 * positionY + (noise - 0.5) * 0.35;
        return [brightness, brightness * 0.99, brightness * 0.96];
      },
    });
    const positionAttribute = geometry.attributes.position;
    for (let index = 0; index < positionAttribute.count; index++) {
      if (positionAttribute.getY(index) < -0.4) {
        positionAttribute.setY(index, -0.4 - (positionAttribute.getY(index) + 0.4) * 0.15);
      }
    }
    geometry.computeVertexNormals();
    geometries.push(geometry);
  }
  const byVariant = geometries.map(() => []);
  list.forEach((rock, index) => byVariant[index % VARIANTS].push(rock));
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const vector = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  return byVariant
    .filter((rocks) => rocks.length)
    .map((rocks, variantIndex) => {
      const rockInstances = new THREE.InstancedMesh(
        geometries[variantIndex],
        rockMat,
        rocks.length,
      );
      rocks.forEach((rock, index) => {
        quaternion.setFromAxisAngle(vector, index * 2.39 + variantIndex);
        matrix.compose(
          new THREE.Vector3(
            (rock.min[0] + rock.max[0]) / 2,
            (rock.min[1] + rock.max[1]) / 2 + (rock.max[1] - rock.min[1]) * 0.08,
            (rock.min[2] + rock.max[2]) / 2,
          ),
          quaternion,
          new THREE.Vector3(
            (rock.max[0] - rock.min[0]) * 1.1,
            (rock.max[1] - rock.min[1]) * 1.25,
            (rock.max[2] - rock.min[2]) * 1.1,
          ),
        );
        rockInstances.setMatrixAt(index, matrix);
        const hash = hash3(rock.min[0], rock.min[2], index);
        tint.setRGB(
          0.82 + hash * 0.4,
          0.82 + hash * 0.36 + (hash > 0.6 ? 0.04 : 0),
          0.82 + hash * 0.3 - (hash > 0.6 ? 0.05 : 0),
        );
        rockInstances.setColorAt(index, tint);
      });
      rockInstances.castShadow = rockInstances.receiveShadow = true;
      rockInstances.computeBoundingSphere();
      return rockInstances;
    });
}
function gableRoof(box, material) {
  const width = box.max[0] - box.min[0];
  const depth = box.max[2] - box.min[2];
  const alongX = width >= depth;
  const roofLength = alongX ? width : depth;
  const span = alongX ? depth : width;
  const roofHeight = Math.min(2.2, span * 0.35);
  const shape = new THREE.Shape();
  shape.moveTo(-span / 2, 0);
  shape.lineTo(span / 2, 0);
  shape.lineTo(0, roofHeight);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: roofLength, bevelEnabled: false });
  geometry.translate(0, 0, -roofLength / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set((box.min[0] + box.max[0]) / 2, box.max[1], (box.min[2] + box.max[2]) / 2);
  if (alongX) {
    mesh.rotation.y = Math.PI / 2;
  }
  mesh.castShadow = true;
  return mesh;
}

function mergeSimple(list) {
  const position = [];
  const currentNormals = [];
  const colr = [];
  const indices = [];
  for (const item of list) {
    const geometry = item.index ? item.toNonIndexed() : item;
    const base = position.length / 3;
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const colors = geometry.attributes.color;
    for (let index = 0; index < positions.count; index++) {
      position.push(positions.getX(index), positions.getY(index), positions.getZ(index));
      currentNormals.push(normals.getX(index), normals.getY(index), normals.getZ(index));
      colr.push(
        colors ? colors.getX(index) : 1,
        colors ? colors.getY(index) : 1,
        colors ? colors.getZ(index) : 1,
      );
      indices.push(base + index);
    }
  }
  const currentGeometry = new THREE.BufferGeometry();
  currentGeometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  currentGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(currentNormals, 3));
  currentGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  currentGeometry.setIndex(indices);
  return currentGeometry;
}
function paintY(geometry, paint) {
  const positionAttribute = geometry.attributes.position;
  let lowestY = Infinity;
  let highestY = -Infinity;
  for (let index = 0; index < positionAttribute.count; index++) {
    lowestY = Math.min(lowestY, positionAttribute.getY(index));
    highestY = Math.max(highestY, positionAttribute.getY(index));
  }
  const color = new Float32Array(positionAttribute.count * 3);
  for (let index = 0; index < positionAttribute.count; index++) {
    const [red, geometry, blue] = paint(
      (positionAttribute.getY(index) - lowestY) / (highestY - lowestY || 1),
      index,
    );
    color[index * 3] = red;
    color[index * 3 + 1] = geometry;
    color[index * 3 + 2] = blue;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  return geometry;
}
function trunkGeometry(height, rBase, rTop) {
  const flare = new THREE.CylinderGeometry(
    rBase * 0.85,
    rBase * 1.45,
    0.9,
    7,
    1,
    true,
  ).toNonIndexed();
  flare.translate(0, 0.45, 0);
  const body = new THREE.CylinderGeometry(
    rTop,
    rBase * 0.85,
    height - 0.6,
    7,
    1,
    true,
  ).toNonIndexed();
  body.translate(0, 0.6 + (height - 0.6) / 2, 0);
  const shade = (heightRatio, index) => {
    const brightness = 0.62 + 0.55 * heightRatio + (hash3(index, 3.1, 1.7) - 0.5) * 0.18;
    return [brightness, brightness * 0.92, brightness * 0.82];
  };
  return [paintY(flare, shade), paintY(body, shade)];
}

function pineTopGeometry() {
  const tiers = [];
  for (let tierIndex = 0; tierIndex < 6; tierIndex++) {
    const radius = 2.5 - tierIndex * 0.34;
    const coneHeight = 2.8 - tierIndex * 0.1;
    const cone = new THREE.ConeGeometry(radius, coneHeight, 9, 1, false).toNonIndexed();
    const positionAttribute = cone.attributes.position;
    for (let index = 0; index < positionAttribute.count; index++) {
      const positionY = positionAttribute.getY(index);
      if (positionY < 0) {
        const angle = Math.atan2(positionAttribute.getZ(index), positionAttribute.getX(index));
        const innerIndex = 1 + (hash3(tierIndex, Math.round(angle * 4), 2.2) - 0.5) * 0.34;
        positionAttribute.setX(index, positionAttribute.getX(index) * innerIndex);
        positionAttribute.setZ(index, positionAttribute.getZ(index) * innerIndex);
        positionAttribute.setY(
          index,
          positionY - 0.22 * (0.5 + 0.5 * Math.sin(angle * 3 + tierIndex)),
        );
      }
    }
    cone.rotateY(tierIndex * 0.7);
    cone.translate(0, 3.1 + tierIndex * 1.3 + coneHeight / 2, 0);
    paintY(cone, (heightRatio, index) => {
      const noise = hash3(tierIndex * 9.1, index, 4.4);
      const brightness = 0.66 + 0.5 * heightRatio + (noise - 0.5) * 0.14;
      return [brightness * 0.95, brightness, brightness * 0.92];
    });
    tiers.push(cone);
  }
  return mergeSimple(tiers);
}

function oakTopGeometry() {
  const blobs = [
    [0, 5.8, 0, 2.6],
    [1.9, 5.2, 0.8, 2.0],
    [-1.8, 5.4, -0.9, 2.1],
    [0.6, 7.4, -0.6, 1.8],
    [-0.5, 5.1, 2.0, 1.75],
  ];
  const parts = blobs.map(([positionX, positionY, positionZ, radius], index) => {
    const geometry = lumpyGeometry(radius, 1, {
      amp: 0.2,
      freq: 1.2,
      seed: index * 7.7,
      squash: 0.82,
      paint: (heightRatio, noise) => {
        const brightness = 0.72 + 0.5 * heightRatio + (noise - 0.5) * 0.08;
        return [brightness * 0.96, brightness * 1.02, brightness * 0.92];
      },
    });
    geometry.translate(positionX, positionY, positionZ);
    return geometry;
  });
  return mergeSimple(parts);
}
function oakTrunkGeometry() {
  const parts = trunkGeometry(4.6, 0.34, 0.26);
  for (const [rotationZ, offsetX, trunkHeight] of [
    [0.7, 0.05, 2.4],
    [-0.75, -0.05, 2.2],
  ]) {
    const branch = new THREE.CylinderGeometry(0.1, 0.17, trunkHeight, 5, 1, true).toNonIndexed();
    branch.translate(0, trunkHeight / 2, 0);
    branch.rotateZ(rotationZ);
    branch.translate(offsetX, 3.4, 0);
    parts.push(
      paintY(branch, (heightRatio) => [
        0.55 + 0.4 * heightRatio,
        0.5 + 0.36 * heightRatio,
        0.42 + 0.3 * heightRatio,
      ]),
    );
  }
  return mergeSimple(parts);
}
function treeGeometries() {
  return {
    pineTrunk: mergeSimple(trunkGeometry(9.6, 0.2, 0.09)),
    pineTop: pineTopGeometry(),
    oakTrunk: oakTrunkGeometry(),
    oakTop: oakTopGeometry(),
  };
}
function bushGeometry() {
  const parts = [
    [0, 0.65, 0, 1],
    [0.7, 0.5, 0.35, 0.72],
    [-0.65, 0.5, -0.3, 0.78],
  ].map(([positionX, positionY, positionZ, radius], index) => {
    const geometry = lumpyGeometry(radius, 1, {
      amp: 0.22,
      freq: 1.5,
      seed: index * 5.1,
      squash: 0.8,
      paint: (heightRatio, noise) => {
        const brightness = 0.75 + 0.45 * heightRatio + (noise - 0.5) * 0.08;
        return [brightness, brightness * 1.03, brightness * 0.9];
      },
    });
    geometry.translate(positionX, positionY, positionZ);
    return geometry;
  });
  return mergeSimple(parts);
}

function impostorTex(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, 128, 256);
  context.fillStyle = '#5a4634';
  if (kind === 'pine') {
    context.fillRect(61, 140, 6, 116);
    for (let tierIndex = 0; tierIndex < 6; tierIndex++) {
      const treeWidth = (2.5 - tierIndex * 0.34) * 25.6;
      const trunkBottomY = 256 - (3.1 + tierIndex * 1.3) * 25.6;
      const trunkTopY = trunkBottomY - (2.8 - tierIndex * 0.1) * 25.6;
      context.fillStyle = tierIndex % 2 ? '#c8d0c4' : '#b9c3b4';
      context.beginPath();
      context.moveTo(64 - treeWidth, trunkBottomY + 4);
      context.lineTo(64 + treeWidth, trunkBottomY + 4);
      context.lineTo(64, trunkTopY);
      context.closePath();
      context.fill();
    }
  } else {
    context.fillRect(58, 130, 12, 126);
    const blobs = [
      [0, 5.8, 2.6],
      [1.9, 5.2, 2.0],
      [-1.8, 5.4, 2.1],
      [0.6, 7.4, 1.8],
      [-0.5, 5.1, 1.75],
    ];
    blobs.forEach(([positionX, positionY, radius], tierIndex) => {
      context.fillStyle = tierIndex % 2 ? '#c4ccbd' : '#b5bfae';
      context.beginPath();
      context.ellipse(
        64 + positionX * 25.6 * 0.82,
        256 - positionY * 25.6,
        radius * 25.6 * 1.02,
        radius * 25.6 * 0.86,
        0,
        0,
        Math.PI * 2,
      );
      context.fill();
    });
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function impostorGeo(width, height) {
  const geometry = new THREE.BufferGeometry();
  const halfWidth = width / 2;
  const position = [
    -halfWidth,
    0,
    0,
    halfWidth,
    0,
    0,
    halfWidth,
    height,
    0,
    -halfWidth,
    height,
    0,
    0,
    0,
    -halfWidth,
    0,
    0,
    halfWidth,
    0,
    height,
    halfWidth,
    0,
    height,
    -halfWidth,
  ];
  const uvs = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1];
  const normals = new Array(24).fill(0).map((_, index) => (index % 3 === 1 ? 1 : 0));
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  geometry.computeBoundingSphere();
  return geometry;
}

function buildTrees(group, lod, quality) {
  const geometry = treeGeometries();
  const materials = {
    trunk: new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1, vertexColors: true }),
    pine: new THREE.MeshStandardMaterial({
      color: 0x34502e,
      roughness: 1,
      flatShading: true,
      vertexColors: true,
    }),
    oak: new THREE.MeshStandardMaterial({
      color: 0x4c6a2e,
      roughness: 1,
      flatShading: false,
      vertexColors: true,
    }),
    bush: new THREE.MeshStandardMaterial({
      color: 0x506b34,
      roughness: 1,
      flatShading: false,
      vertexColors: true,
    }),
  };
  const tints = { pine: [0.3, 0.3, 0.22], oak: [0.24, 0.4, 0.27], bush: [0.25, 0.35, 0.25] };
  const color = new THREE.Color();
  const tintOf = (tint, tree) =>
    color.setHSL(
      tint[0] + Math.sin(tree.x * 0.13 + tree.z) * 0.03,
      tint[1],
      tint[2] + Math.sin(tree.z * 0.21) * 0.05,
    );
  const meanCol = (hex, tint) =>
    new THREE.Color(hex).multiply(new THREE.Color().setHSL(...tint)).multiplyScalar(2);
  const lum = (color) => 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b || 1;
  const avgPine = lum(new THREE.Color().setHSL(...tints.pine));
  const avgOak = lum(new THREE.Color().setHSL(...tints.oak));
  const impMat = {
    pine: new THREE.MeshLambertMaterial({
      map: impostorTex('pine'),
      color: meanCol(0x2f4a2a, tints.pine).multiplyScalar((1 / avgPine) * 0.8),
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    }),
    oak: new THREE.MeshLambertMaterial({
      map: impostorTex('oak'),
      color: meanCol(0x46622c, tints.oak).multiplyScalar((1 / avgOak) * 0.8),
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    }),
  };
  const impGeo = { pine: impostorGeo(5.2, 10.4), oak: impostorGeo(7.4, 10.4) };
  const resolution = 256;
  const buckets = new Map();
  const key = (positionX, positionZ) =>
    `${Math.floor((positionX + HALF) / resolution)},${Math.floor((positionZ + HALF) / resolution)}`;
  const bucketOf = (positionX, positionZ) => {
    const bucketKey = key(positionX, positionZ);
    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, {
        pine: [],
        oak: [],
        bush: [],
        x0: Infinity,
        z0: Infinity,
        x1: -Infinity,
        z1: -Infinity,
        y0: Infinity,
        y1: -Infinity,
      });
    }
    const bucket = buckets.get(bucketKey);
    bucket.x0 = Math.min(bucket.x0, positionX - 4);
    bucket.x1 = Math.max(bucket.x1, positionX + 4);
    bucket.z0 = Math.min(bucket.z0, positionZ - 4);
    bucket.z1 = Math.max(bucket.z1, positionZ + 4);
    return bucket;
  };
  for (const tree of MAPDATA.trees) {
    const bucket = bucketOf(tree.x, tree.z);
    bucket[tree.kind].push(tree);
    bucket.y0 = Math.min(bucket.y0, tree.y);
    bucket.y1 = Math.max(bucket.y1, tree.y + 12 * tree.s);
  }
  for (const bush of MAPDATA.bushes) {
    const bucket = bucketOf(bush.x, bush.z);
    bucket.bush.push(bush);
    bucket.y0 = Math.min(bucket.y0, bush.y);
    bucket.y1 = Math.max(bucket.y1, bush.y + 2);
  }
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const point = new THREE.Vector3();
  const vector = new THREE.Vector3(0, 1, 0);
  const bushGeo = bushGeometry();
  for (const bucket of buckets.values()) {
    const inst = (
      geometry,
      material,
      list,
      scaleOf,
      shadow,
      colorOf,
      yawOf = (tree) => tree.r || 0,
    ) => {
      if (!list.length) {
        return null;
      }
      const instanced = new THREE.InstancedMesh(geometry, material, list.length);
      list.forEach((tree, index) => {
        quaternion.setFromAxisAngle(vector, yawOf(tree));
        const instanceScale = scaleOf(tree);
        scale.set(instanceScale[0], instanceScale[1], instanceScale[2]);
        point.set(tree.x, tree.y - 0.3, tree.z);
        matrix.compose(point, quaternion, scale);
        instanced.setMatrixAt(index, matrix);
        if (colorOf) {
          instanced.setColorAt(index, colorOf(tree));
        }
      });
      instanced.castShadow = shadow;
      instanced.receiveShadow = true;
      instanced.computeBoundingSphere();
      instanced.visible = false;
      group.add(instanced);
      return instanced;
    };
    const near = [
      inst(
        geometry.pineTrunk,
        materials.trunk,
        bucket.pine,
        (tree) => [tree.s, tree.s, tree.s],
        true,
      ),
      inst(
        geometry.pineTop,
        materials.pine,
        bucket.pine,
        (tree) => [tree.s, tree.s, tree.s],
        true,
        (tree) => tintOf(tints.pine, tree),
      ),
      inst(
        geometry.oakTrunk,
        materials.trunk,
        bucket.oak,
        (tree) => [tree.s, tree.s, tree.s],
        true,
      ),
      inst(
        geometry.oakTop,
        materials.oak,
        bucket.oak,
        (tree) => [tree.s, tree.s, tree.s],
        true,
        (tree) => tintOf(tints.oak, tree),
      ),
    ].filter(Boolean);
    const far = [
      inst(
        impGeo.pine,
        impMat.pine,
        bucket.pine,
        (tree) => [tree.s, tree.s, tree.s],
        false,
        (tree) => tintOf(tints.pine, tree).multiplyScalar(1 / avgPine),
        (tree) => (tree.r || 0) + 0.4,
      ),
      inst(
        impGeo.oak,
        impMat.oak,
        bucket.oak,
        (tree) => [tree.s, tree.s, tree.s],
        false,
        (tree) => tintOf(tints.oak, tree).multiplyScalar(1 / avgOak),
        (tree) => (tree.r || 0) + 0.4,
      ),
    ].filter(Boolean);
    const bush = inst(
      bushGeo,
      materials.bush,
      bucket.bush,
      (tree) => [tree.s * 0.85, tree.s * 0.85, tree.s * 0.85],
      false,
      (tree) => tintOf(tints.bush, tree),
    );
    const box = [bucket.x0, bucket.y0, bucket.z0, bucket.x1, bucket.y1, bucket.z1];
    if (near.length) {
      lod.add({
        kind: 'trees',
        box,
        levels: quality.trees,
        occ: true,
        apply(level, visible) {
          for (const lodMesh of near) {
            lodMesh.visible = visible && level === 0;
          }
          for (const lodMesh of far) {
            lodMesh.visible = visible && level === 1;
          }
        },
      });
    }
    if (bush) {
      lod.add({
        kind: 'bush',
        box,
        levels: BUSH_LEVELS,
        occ: true,
        apply: (level, visible) => (bush.visible = visible && level === 0),
      });
    }
  }
}
const BUSH_LEVELS = [520];

function labelTex(text, background = '#2b3a2a', foreground = '#f0e6c8', width = 256, height = 96) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = foreground;
  context.lineWidth = 5;
  context.strokeRect(5, 5, width - 10, height - 10);
  context.fillStyle = foreground;
  context.font = `bold ${Math.floor(height * 0.36)}px Bahnschrift, Arial Narrow, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, width / 2, height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildFlag(color) {
  const geometry = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 9, 8),
    new THREE.MeshStandardMaterial({ color: 0xb0b4b8, metalness: 0.6, roughness: 0.4 }),
  );
  pole.position.y = 4.5;
  geometry.add(pole);
  const flagMat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.9 });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3, 8, 1), flagMat);
  flag.position.set(1.15, 8.2, 0);
  geometry.add(flag);
  geometry.userData = { flag, flagMat };
  return geometry;
}

function helipad(group, positionX, positionY, positionZ) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  context.fillStyle = '#5a5c5a';
  context.fillRect(0, 0, 256, 256);
  context.strokeStyle = '#e8e2c8';
  context.lineWidth = 10;
  context.beginPath();
  context.arc(128, 128, 110, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = '#e8e2c8';
  context.font = 'bold 150px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('H', 128, 136);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(9, 40),
    new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(positionX, positionY + 0.08, positionZ);
  mesh.receiveShadow = true;
  group.add(mesh);
}

function canopy(width, depth, height, color) {
  const geometry = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide });
  const pole = new THREE.MeshStandardMaterial({ color: 0x3a3a36, metalness: 0.4, roughness: 0.6 });
  for (const [sideX, sideZ] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const point = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, height, 6), pole);
    point.position.set((sideX * width) / 2, height / 2, (sideZ * depth) / 2);
    geometry.add(point);
  }
  const slope = Math.hypot(width / 2, 0.9);
  for (const sideX of [-1, 1]) {
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(slope, depth + 0.4), cloth);
    roof.rotation.set(-Math.PI / 2, 0, -sideX * Math.atan2(0.9, width / 2), 'ZXY');
    roof.position.set((sideX * width) / 4, height + 0.45, 0);
    roof.castShadow = true;
    geometry.add(roof);
  }
  const back = new THREE.Mesh(new THREE.PlaneGeometry(width, height), cloth);
  back.position.set(0, height / 2, depth / 2);
  geometry.add(back);
  return geometry;
}

function tentProps(group, props) {
  const team = props.team === 0 ? 0x7a6a48 : 0x4f5a3c;
  if (props.kind === 'vtent') {
    const geometry = canopy(props.w, props.d, 2.6, team);
    geometry.position.set(props.x, props.y, props.z);
    group.add(geometry);
    const label = { car: 'VEHICLE DEPOT', heavy: 'ARMOR DEPOT', heli: 'HELIPORT' }[props.cat];
    const currentLabel = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: labelTex(label, 'rgba(20,24,18,0.85)', '#f0e6c8', 320, 80),
        depthWrite: false,
        transparent: true,
      }),
    );
    currentLabel.position.set(props.x, props.y + 4.2, props.z);
    currentLabel.scale.set(3.6, 0.9, 1);
    group.add(currentLabel);
    return null;
  }
}

function sky(group) {
  const geometry = new THREE.SphereGeometry(2400, 24, 12);
  const currentColor = [];
  const positionAttribute = geometry.attributes.position;
  const top = new THREE.Color(0x5f8fc4);
  const hor = new THREE.Color(0xc9d6df);
  for (let index = 0; index < positionAttribute.count; index++) {
    const altitude = Math.max(0, positionAttribute.getY(index) / 2400);
    const color = hor.clone().lerp(top, Math.pow(altitude, 0.6));
    currentColor.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(currentColor, 3));
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    }),
  );
  mesh.renderOrder = -10;
  group.add(mesh);
  return mesh;
}

export function buildMilWorld(scene) {
  const group = new THREE.Group();
  const materials = makeMaterials();
  scene.background = new THREE.Color(0xc9d6df);
  scene.fog = new THREE.Fog(0xc4d0d8, 350, 1500);
  const hemi = new THREE.HemisphereLight(0xdfe9f3, 0x5a5a48, 1.05);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -70,
    right: 70,
    top: 70,
    bottom: -70,
    near: 1,
    far: 400,
  });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  group.add(sun, sun.target);
  const skyMesh = sky(group);

  const lod = new WorldLod();
  buildTerrain(group, lod, WORLD_Q);
  buildRoads(group);
  const waterMat = buildWater(group);
  buildTrees(group, lod, WORLD_Q);

  const resolution = 256;
  const buckets = new Map();
  const special = [];
  const rocks = [];
  const regions = new Map();
  const regionOf = (positionX, positionZ) => {
    const regionKey = `${Math.floor((positionX + HALF) / resolution)}|${Math.floor((positionZ + HALF) / resolution)}`;
    if (!regions.has(regionKey)) {
      const geometry = new THREE.Group();
      group.add(geometry);
      regions.set(regionKey, {
        g: geometry,
        box: [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity],
      });
    }
    return regions.get(regionKey);
  };
  const addTo = (mesh) => {
    mesh.geometry?.computeBoundingBox();
    const bounds = new THREE.Box3().setFromObject(mesh);
    const region = regionOf((bounds.min.x + bounds.max.x) / 2, (bounds.min.z + bounds.max.z) / 2);
    region.g.add(mesh);
    const box = region.box;
    box[0] = Math.min(box[0], bounds.min.x);
    box[1] = Math.min(box[1], bounds.min.y);
    box[2] = Math.min(box[2], bounds.min.z);
    box[3] = Math.max(box[3], bounds.max.x);
    box[4] = Math.max(box[4], bounds.max.y);
    box[5] = Math.max(box[5], bounds.max.z);
  };
  for (const box of MAPDATA.boxes) {
    if (box.tree || box.mat === 'edge') {
      continue;
    }
    if (box.shape === 'rock') {
      rocks.push(box);
      continue;
    }
    if (box.shape === 'cyl' || box.shape === 'hedgehog') {
      special.push(box);
      continue;
    }
    const list = box.shape === 'lattice' ? latticeBoxes(box) : [box];
    const material = box.shape === 'lattice' ? 'lattice' : box.mat;
    const centerX = Math.floor(((box.min[0] + box.max[0]) / 2 + HALF) / resolution);
    const centerZ = Math.floor(((box.min[2] + box.max[2]) / 2 + HALF) / resolution);
    const regionKey = `${material}|${centerX}|${centerZ}`;
    if (!buckets.has(regionKey)) {
      buckets.set(regionKey, []);
    }
    buckets.get(regionKey).push(...list);
    if (box.roof === 'gable') {
      special.push({ ...box, shape: 'gable' });
    }
  }
  for (const [regionKey, list] of buckets) {
    const material = materials[regionKey.split('|')[0]] || materials.concrete;
    const mesh = new THREE.Mesh(boxesGeometry(list), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    addTo(mesh);
  }
  const scratchGroup = new THREE.Group();
  for (const currentSpecial of special) {
    if (currentSpecial.shape === 'cyl') {
      addCyl(scratchGroup, currentSpecial, materials);
    } else if (currentSpecial.shape === 'hedgehog') {
      scratchGroup.add(hedgehogMesh(currentSpecial, materials.steel));
    } else if (currentSpecial.shape === 'gable') {
      scratchGroup.add(gableRoof(currentSpecial, materials.roof));
    }
  }
  for (const offset of [...scratchGroup.children]) {
    addTo(offset);
  }
  for (const instances of rockMeshes(rocks, materials.rock)) {
    group.add(instances);
  }
  for (const region of regions.values()) {
    lod.add({
      kind: 'region',
      box: region.box,
      levels: [],
      occ: true,
      apply: (level, visible) => (region.g.visible = visible),
    });
  }

  for (const props of MAPDATA.props) {
    if (props.kind === 'vtent') {
      tentProps(group, props);
    } else if (props.kind === 'helipad') {
      helipad(group, props.x, props.y, props.z);
    } else if (props.kind === 'flag') {
      const face = buildFlag(props.team === 0 ? 0xe8892b : 0x4a9be8);
      face.position.set(props.x, props.y, props.z);
      group.add(face);
    }
  }
  const sectorFlags = new Map();
  for (const size of SECTORS) {
    const face = buildFlag(0xdddddd);
    const flagX = size.x + (size.id === 'C' ? 10 : 0);
    const flagZ = size.z + (size.id === 'C' ? 6 : 0);
    face.position.set(flagX, heightAt(flagX, flagZ), flagZ);
    group.add(face);
    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: labelTex(size.id, 'rgba(0,0,0,0.55)', '#ffffff', 96, 96),
        depthWrite: false,
        transparent: true,
      }),
    );
    label.position.set(0, 10.4, 0);
    label.scale.set(1.6, 1.6, 1);
    face.add(label);
    sectorFlags.set(size.id, face);
  }

  scene.add(group);
  group.userData = { sun, hemi, skyMesh, sectorFlags, mats: materials, waterMat, lod };
  return group;
}

export function disposeMilWorld(scene, group) {
  scene.remove(group);
  group.traverse((offset) => {
    if (offset.geometry) {
      offset.geometry.dispose();
    }
    const materials = Array.isArray(offset.material)
      ? offset.material
      : offset.material
        ? [offset.material]
        : [];
    for (const material of materials) {
      if (material.map) {
        material.map.dispose();
      }
      material.dispose();
    }
  });
}
