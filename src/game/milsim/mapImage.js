import {
  HALF,
  TERRAIN,
  SURF,
  heightAt,
  TOWNS,
  waterDepth,
} from '../../../shared/milsim/terrain.js';
import { MAPDATA } from '../../../shared/milsim/world.js';

export const MAP_PX = 1024;
let cached = null;
let cachedTerrain = null;

const COL = {
  [SURF.grass]: [196, 205, 160],
  [SURF.field]: [222, 214, 160],
  [SURF.forest]: [150, 178, 120],
  [SURF.rock]: [190, 182, 168],
  [SURF.sand]: [222, 210, 175],
  [SURF.water]: [120, 165, 200],
  [SURF.dirt]: [200, 180, 140],
  [SURF.asphalt]: [120, 120, 120],
  [SURF.concrete]: [185, 185, 180],
};

export const toPx = (value) => ((value + HALF) / (HALF * 2)) * MAP_PX;

export function mapCanvas() {
  if (cached && cachedTerrain === TERRAIN) {
    return cached;
  }
  cachedTerrain = TERRAIN;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = MAP_PX;
  const context = canvas.getContext('2d');
  const image = context.createImageData(MAP_PX, MAP_PX);
  const pixels = image.data;
  const metersPerPixel = (HALF * 2) / MAP_PX;
  const gridSize = Math.round(Math.sqrt(TERRAIN.surf.length));
  for (let pixelY = 0; pixelY < MAP_PX; pixelY++) {
    for (let pixelX = 0; pixelX < MAP_PX; pixelX++) {
      const positionX = -HALF + (pixelX + 0.5) * metersPerPixel;
      const positionZ = -HALF + (pixelY + 0.5) * metersPerPixel;
      const height = heightAt(positionX, positionZ);
      const slopeX =
        heightAt(positionX + metersPerPixel, positionZ) -
        heightAt(positionX - metersPerPixel, positionZ);
      const slopeZ =
        heightAt(positionX, positionZ + metersPerPixel) -
        heightAt(positionX, positionZ - metersPerPixel);
      const shade = Math.max(0.55, Math.min(1.25, 1 + (-slopeX * 0.7 - slopeZ * 0.7) * 0.35));
      const index = Math.min(gridSize - 1, Math.round((positionX + HALF) / 4));
      const innerIndex = Math.min(gridSize - 1, Math.round((positionZ + HALF) / 4));
      let surface = TERRAIN.surf[innerIndex * gridSize + index];
      if (waterDepth(positionX, positionZ) > 0.2) {
        surface = SURF.water;
      }
      const color = COL[surface] || COL[SURF.grass];
      const alt = Math.min(1, Math.max(0, (height - 40) / 160));
      const offset = (pixelY * MAP_PX + pixelX) * 4;
      pixels[offset] = Math.min(255, (color[0] * (1 - alt * 0.25) + 150 * alt * 0.25) * shade);
      pixels[offset + 1] = Math.min(255, (color[1] * (1 - alt * 0.3) + 120 * alt * 0.3) * shade);
      pixels[offset + 2] = Math.min(255, (color[2] * (1 - alt * 0.35) + 90 * alt * 0.35) * shade);
      pixels[offset + 3] = 255;
      if (surface !== SURF.water) {
        const contourLevel = Math.floor(height / 10);
        const contourRight = Math.floor(heightAt(positionX + metersPerPixel, positionZ) / 10);
        const contourDown = Math.floor(heightAt(positionX, positionZ + metersPerPixel) / 10);
        if (contourLevel !== contourRight || contourLevel !== contourDown) {
          const major = Math.max(contourLevel, contourRight, contourDown) % 5 === 0;
          const intensity = major ? 0.62 : 0.82;
          pixels[offset] *= intensity;
          pixels[offset + 1] *= intensity * 0.97;
          pixels[offset + 2] *= intensity * 0.9;
        }
      }
    }
  }
  context.putImageData(image, 0, 0);
  const toPixel = toPx;
  context.strokeStyle = 'rgb(90,140,190)';
  context.lineWidth = 12 / metersPerPixel;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  TERRAIN.river.forEach(([positionX, positionZ], intensity) =>
    intensity
      ? context.lineTo(toPixel(positionX), toPixel(positionZ))
      : context.moveTo(toPixel(positionX), toPixel(positionZ)),
  );
  context.stroke();
  for (const road of TERRAIN.roads) {
    const draw = (width, color) => {
      context.strokeStyle = color;
      context.lineWidth = width;
      context.beginPath();
      road.pts.forEach(([positionX, positionZ], intensity) =>
        intensity
          ? context.lineTo(toPixel(positionX), toPixel(positionZ))
          : context.moveTo(toPixel(positionX), toPixel(positionZ)),
      );
      context.stroke();
    };
    if (road.kind === 'asphalt') {
      draw(6, 'rgb(70,60,50)');
      draw(4, 'rgb(240,200,90)');
    } else {
      draw(4, 'rgb(110,90,60)');
      draw(2, 'rgb(250,240,215)');
    }
  }
  context.fillStyle = 'rgba(60,50,45,0.85)';
  for (const box of MAPDATA.boxes) {
    if (
      box.tree ||
      box.mat === 'edge' ||
      box.mat === 'rock' ||
      box.mat === 'fence' ||
      box.mat === 'sandbag' ||
      box.mat === 'trunk' ||
      box.bridge
    ) {
      continue;
    }
    const width = box.max[0] - box.min[0];
    const depth = box.max[2] - box.min[2];
    if (width > 60 || depth > 60) {
      continue;
    }
    if (box.max[1] - box.min[1] < 0.5 && !box.floor) {
      continue;
    }
    context.fillRect(
      toPixel(box.min[0]),
      toPixel(box.min[2]),
      Math.max(1, width / metersPerPixel),
      Math.max(1, depth / metersPerPixel),
    );
  }
  context.strokeStyle = 'rgb(40,40,40)';
  context.lineWidth = 3;
  for (const bridge of MAPDATA.bridges) {
    context.beginPath();
    bridge.pts.forEach(([positionX, positionZ], intensity) =>
      intensity
        ? context.lineTo(toPixel(positionX), toPixel(positionZ))
        : context.moveTo(toPixel(positionX), toPixel(positionZ)),
    );
    context.stroke();
  }
  context.strokeStyle = 'rgba(30,40,60,0.28)';
  context.lineWidth = 1;
  context.font = 'bold 10px Bahnschrift, Arial Narrow, sans-serif';
  context.fillStyle = 'rgba(20,30,50,0.75)';
  for (let intensity = 0; intensity <= 20; intensity++) {
    const lineSpacing = (intensity * 100 * MAP_PX) / (HALF * 2);
    context.beginPath();
    context.moveTo(lineSpacing, 0);
    context.lineTo(lineSpacing, MAP_PX);
    context.moveTo(0, lineSpacing);
    context.lineTo(MAP_PX, lineSpacing);
    context.stroke();
    if (intensity < 20) {
      context.fillText(String(intensity).padStart(2, '0'), lineSpacing + 2, 10);
      context.fillText(String(intensity).padStart(2, '0'), 2, lineSpacing + 11);
    }
  }
  context.textAlign = 'center';
  for (const town of TOWNS) {
    context.font = 'italic bold 15px Georgia, serif';
    context.lineWidth = 3;
    context.strokeStyle = 'rgba(255,255,240,0.85)';
    context.strokeText(town.name, toPixel(town.x), toPixel(town.z) - 14);
    context.fillStyle = 'rgb(40,30,20)';
    context.fillText(town.name, toPixel(town.x), toPixel(town.z) - 14);
  }
  cached = canvas;
  return canvas;
}
