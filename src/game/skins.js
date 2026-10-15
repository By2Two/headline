import * as THREE from 'three';
import { SKINS, skinOfId } from '../../shared/skins.js';
import {
  METAL,
  DARK,
  WOOD,
  GREEN,
  TAN,
  STEEL,
  BLACK,
  GUNMETAL,
  CHROME,
  POLY,
  GREEN_STOCK,
  TAN_STOCK,
} from './guns.js';

const ROLE = new Map([
  [METAL, 'body'],
  [GREEN, 'body'],
  [TAN, 'body'],
  [GUNMETAL, 'body'],
  [CHROME, 'body'],
  [POLY, 'wood'],
  [GREEN_STOCK, 'wood'],
  [TAN_STOCK, 'wood'],
  [DARK, 'dark'],
  [BLACK, 'dark'],
  [WOOD, 'wood'],
  [STEEL, 'blade'],
]);

const currentRandom = (seed) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

function draw(spec) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const color = spec.colors;
  const random = currentRandom(1234);
  switch (spec.tex) {
    case 'camo':
      context.fillStyle = color[0];
      context.fillRect(0, 0, size, size);
      for (let colIndex = 1; colIndex < color.length; colIndex++) {
        context.fillStyle = color[colIndex];
        for (let index = 0; index < 14 - colIndex * 2; index++) {
          const positionX = random() * size;
          const positionY = random() * size;
          const count = 3 + Math.floor(random() * 4);
          for (let innerIndex = 0; innerIndex < count; innerIndex++) {
            context.beginPath();
            context.arc(
              positionX + (random() - 0.5) * 50,
              positionY + (random() - 0.5) * 50,
              10 + random() * 22,
              0,
              Math.PI * 2,
            );
            context.fill();
          }
        }
      }
      break;
    case 'stripes':
      context.fillStyle = color[0];
      context.fillRect(0, 0, size, size);
      context.fillStyle = color[1];
      for (let index = -size; index < size * 2; index += 26 + random() * 20) {
        context.beginPath();
        const width = 6 + random() * 10;
        context.moveTo(index, 0);
        context.lineTo(index + width, 0);
        context.lineTo(index + width - 60 + random() * 30, size);
        context.lineTo(index - 60, size);
        context.fill();
      }
      break;
    case 'fade': {
      const gradient = context.createLinearGradient(0, 0, size, size);
      color.forEach((colorStop, index) =>
        gradient.addColorStop(index / (color.length - 1), colorStop),
      );
      context.fillStyle = gradient;
      context.fillRect(0, 0, size, size);
      break;
    }
    case 'carbon':
      for (let positionY = 0; positionY < size; positionY += 16) {
        for (let positionX = 0; positionX < size; positionX += 16) {
          const odd = ((positionX + positionY) / 16) % 2;
          const gradient = context.createLinearGradient(
            positionX,
            positionY,
            odd ? positionX + 16 : positionX,
            odd ? positionY : positionY + 16,
          );
          gradient.addColorStop(0, color[1]);
          gradient.addColorStop(0.5, color[0]);
          gradient.addColorStop(1, color[1]);
          context.fillStyle = gradient;
          context.fillRect(positionX, positionY, 16, 16);
        }
      }
      break;
    case 'asiimov': {
      const [base, orange, black, grey] = color;
      context.fillStyle = base;
      context.fillRect(0, 0, size, size);
      context.fillStyle = grey;
      for (let index = -size; index < size; index += 10) {
        context.save();
        context.translate(index, 0);
        context.rotate(-0.6);
        context.fillRect(0, size * 0.62, 2, size);
        context.restore();
      }
      context.fillStyle = orange;
      context.beginPath();
      context.moveTo(0, size * 0.15);
      context.lineTo(size * 0.55, size * 0.15);
      context.lineTo(size * 0.35, size * 0.55);
      context.lineTo(0, size * 0.55);
      context.fill();
      context.beginPath();
      context.moveTo(size * 0.7, size * 0.55);
      context.lineTo(size, size * 0.55);
      context.lineTo(size, size * 0.9);
      context.lineTo(size * 0.55, size * 0.9);
      context.fill();
      context.fillStyle = black;
      context.fillRect(0, size * 0.56, size, size * 0.05);
      context.fillRect(size * 0.6, size * 0.08, size * 0.4, size * 0.04);
      context.beginPath();
      context.moveTo(size * 0.55, size * 0.15);
      context.lineTo(size * 0.62, size * 0.15);
      context.lineTo(size * 0.42, size * 0.55);
      context.lineTo(size * 0.35, size * 0.55);
      context.fill();
      break;
    }
    case 'splat':
      context.fillStyle = color[0];
      context.fillRect(0, 0, size, size);
      for (let index = 0; index < 40; index++) {
        context.fillStyle = color[1 + (index % (color.length - 1))];
        const positionX = random() * size;
        const positionY = random() * size;
        context.beginPath();
        context.arc(positionX, positionY, 3 + random() * 14, 0, Math.PI * 2);
        context.fill();
        for (let innerIndex = 0; innerIndex < 5; innerIndex++) {
          context.beginPath();
          context.arc(
            positionX + (random() - 0.5) * 40,
            positionY + (random() - 0.5) * 40,
            1 + random() * 4,
            0,
            Math.PI * 2,
          );
          context.fill();
        }
      }
      break;
    default:
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

const imageTextures = new Map();
const imageLoads = new Map();
let pendingImages = 0;
export const skinImagesPending = () => pendingImages > 0;

function imageTexture(name) {
  if (imageTextures.has(name)) {
    return imageTextures.get(name);
  }
  pendingImages++;
  let resolveLoad = null;
  imageLoads.set(
    name,
    new Promise((resolve) => {
      resolveLoad = resolve;
    }),
  );
  const finish = () => {
    pendingImages--;
    resolveLoad();
  };
  const texture = new THREE.TextureLoader().load(`skins/${name}.jpg`, finish, undefined, finish);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  imageTextures.set(name, texture);
  return texture;
}

export function whenSkinImagesReady() {
  for (const skin of SKINS) {
    for (const role of ['body', 'dark', 'wood', 'blade']) {
      if (skin[role]?.img) {
        imageTexture(skin[role].img);
      }
    }
  }
  return Promise.all(imageLoads.values());
}

const SKIN_TILE_SIZE = 0.22;

function projectByPartSize(material, tileSize) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.skinTileSize = { value: tileSize };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vSkinPos;\nvarying vec3 vSkinNormal;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvSkinPos = position;\nvSkinNormal = normal;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'varying vec3 vSkinPos;',
          'varying vec3 vSkinNormal;',
          'uniform float skinTileSize;',
          'vec2 skinUv() {',
          '  vec3 axis = abs(vSkinNormal);',
          '  vec2 plane = axis.x > axis.y && axis.x > axis.z ? vSkinPos.zy',
          '    : axis.y > axis.z ? vSkinPos.xz : vSkinPos.xy;',
          '  return plane / skinTileSize;',
          '}',
        ].join('\n'),
      )
      .replace('#include <map_fragment>', 'diffuseColor *= texture2D(map, skinUv());')
      .replace(
        '#include <emissivemap_fragment>',
        '#ifdef USE_EMISSIVEMAP\ntotalEmissiveRadiance *= texture2D(emissiveMap, skinUv()).rgb;\n#endif',
      );
  };
  material.customProgramCacheKey = () => 'skin-projected';
}

const matCache = new Map();
function materialFor(skinId, role) {
  const key = `${skinId}:${role}`;
  if (matCache.has(key)) {
    return matCache.get(key);
  }
  const spec = skinOfId(skinId)[role];
  let material = null;
  if (spec) {
    const isTextured = !!(spec.img || spec.tex);
    material = new THREE.MeshStandardMaterial({
      color: isTextured ? 0xffffff : spec.color,
      roughness: Math.max(0.25, spec.rough ?? 0.5),
      metalness: Math.min(0.45, spec.metal ?? 0.2),
      map: spec.img ? imageTexture(spec.img) : spec.tex ? draw(spec) : null,
    });
    if (spec.img && spec.glow) {
      material.emissive.setHex(0xffffff);
      material.emissiveMap = material.map;
      material.emissiveIntensity = spec.glow;
    }
    if (spec.img) {
      projectByPartSize(material, spec.tile ?? SKIN_TILE_SIZE);
    }
    if (spec.emissive) {
      material.emissive.setHex(spec.emissive);
      material.emissiveIntensity = spec.glow ?? 1;
    }
  }
  matCache.set(key, material);
  return material;
}

export function applySkin(group, skinId = 'default') {
  if (!group) {
    return;
  }
  group.traverse((object) => {
    if (!object.isMesh) {
      return;
    }
    if (!object.userData.baseMat) {
      object.userData.baseMat = object.material;
    }
    const base = object.userData.baseMat;
    const role = ROLE.get(base);
    if (!role) {
      return;
    }
    object.material = (skinId !== 'default' && materialFor(skinId, role)) || base;
  });
}
