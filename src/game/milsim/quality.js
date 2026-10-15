import { WORLD_Q } from './worldRender.js';

export const PRESETS = {
  low: {
    label: 'Low',
    shadows: false,
    shadowMap: 1024,
    shadowDist: 45,
    terrain: [260, 600],
    trees: [260, 2600],
    charLod: [22, 70],
    vehLod: 30,
    particles: 0.45,
    decals: 40,
    maxPixelRatio: 1,
  },
  medium: {
    label: 'Medium',
    shadows: true,
    shadowMap: 1024,
    shadowDist: 60,
    terrain: [400, 900],
    trees: [380, 2600],
    charLod: [22, 90],
    vehLod: 45,
    particles: 0.75,
    decals: 80,
    maxPixelRatio: 1.25,
  },
  high: {
    label: 'High',
    shadows: true,
    shadowMap: 2048,
    shadowDist: 75,
    terrain: [550, 1200],
    trees: [520, 2600],
    charLod: [32, 130],
    vehLod: 70,
    particles: 1,
    decals: 140,
    maxPixelRatio: 2,
  },
  ultra: {
    label: 'Ultra',
    shadows: true,
    shadowMap: 4096,
    shadowDist: 100,
    terrain: [800, 1600],
    trees: [750, 2600],
    charLod: [65, 200],
    vehLod: 110,
    particles: 1,
    decals: 220,
    maxPixelRatio: 2,
  },
};
export const RES_SCALES = [0.5, 0.67, 0.75, 0.85, 1];

export function detectPreset(renderer) {
  let gpu = '';
  try {
    const context = renderer.getContext();
    const ext = context.getExtension('WEBGL_debug_renderer_info');
    gpu = String(
      ext
        ? context.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        : context.getParameter(context.RENDERER),
    ).toLowerCase();
  } catch {}
  const cores = navigator.hardwareConcurrency || 4;
  if (/swiftshader|llvmpipe|software|basic render/.test(gpu)) {
    return 'low';
  }
  if (/mali|adreno|powervr|apple gpu/.test(gpu)) {
    return 'low';
  }
  if (/intel/.test(gpu) && !/arc/.test(gpu)) {
    return cores >= 8 ? 'medium' : 'low';
  }
  if (/rtx [34]0[6-9]0|rtx [34]0[0-9]0 ti|rx [67][7-9]00|radeon pro/.test(gpu)) {
    return 'high';
  }
  if (cores <= 4) {
    return 'low';
  }
  return 'medium';
}

export function resolvePreset(settings, renderer) {
  let id = settings.milGfx;
  if (!PRESETS[id]) {
    try {
      id = localStorage.getItem('headline-milsim-gfx-auto');
    } catch {
      id = null;
    }
    if (!PRESETS[id]) {
      id = detectPreset(renderer);
      try {
        localStorage.setItem('headline-milsim-gfx-auto', id);
      } catch {}
    }
  }
  return { id, ...PRESETS[id] };
}

export function applyQuality(engine) {
  const quality = engine.gfx;
  const renderer = engine.renderer;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio);
  const userScale = RES_SCALES.includes(engine.settings.milRes) ? engine.settings.milRes : 1;
  engine.resUser = userScale;
  engine.resDyn = Math.min(engine.resDyn || 1, 1);
  renderer.setPixelRatio(pixelRatio * userScale * engine.resDyn);
  engine.resize();
  const userData = engine.worldGroup?.userData;
  if (userData?.sun) {
    const sun = userData.sun;
    if (sun.castShadow !== quality.shadows) {
      sun.castShadow = quality.shadows;
    }
    if (sun.shadow.mapSize.x !== quality.shadowMap) {
      sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    const shadowDistance = quality.shadowDist;
    Object.assign(sun.shadow.camera, {
      left: -shadowDistance,
      right: shadowDistance,
      top: shadowDistance,
      bottom: -shadowDistance,
    });
    sun.shadow.camera.updateProjectionMatrix();
  }
  WORLD_Q.terrain.splice(0, 2, ...quality.terrain);
  WORLD_Q.trees.splice(0, 2, ...quality.trees);
  if (userData?.lod) {
    userData.lod.refresh(engine.camera.position, 1);
  }
}

export function dynamicResolution(engine, deltaTime) {
  if (!engine.settings.milDynRes) {
    if (engine.resDyn !== 1) {
      engine.resDyn = 1;
      applyQuality(engine);
    }
    return;
  }
  const dynamic = (engine.dynRes ||= { t: 0, n: 0, sum: 0 });
  dynamic.t += deltaTime;
  dynamic.n++;
  dynamic.sum += deltaTime;
  if (dynamic.t < 1.5) {
    return;
  }
  const fps = dynamic.n / dynamic.sum;
  dynamic.t = dynamic.n = dynamic.sum = 0;
  const target = engine.settings.milFpsTarget || 60;
  let scale = engine.resDyn || 1;
  if (fps < target * 0.85 && scale > 0.55) {
    scale = Math.max(0.55, scale - 0.1);
  } else if (fps > target * 1.12 && scale < 1) {
    scale = Math.min(1, scale + 0.05);
  } else {
    return;
  }
  engine.resDyn = scale;
  const quality = engine.gfx;
  engine.renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio) * engine.resUser * scale,
  );
  engine.resize();
}
