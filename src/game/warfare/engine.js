import { canCapture } from '../../../shared/warfare/maps.js';
import * as THREE from 'three';
import { Engine } from '../engine.js';
import { disposeWorld } from '../world.js';
import { rayAABB } from '../../../shared/raycast.js';
import { PLAYER, INTERP_MS } from '../../../shared/constants.js';
import { pelletDirs } from '../../../shared/pellets.js';
import {
  MIL,
  RANKS,
  rankOf,
  VEH_RANK,
  milClass,
  fireModes,
  opticOf,
  primaryFx,
  sanitizeKit,
  defaultKit,
  kitWeight,
  STRUCTS,
  VEHICLES,
  REAR,
  MORTAR,
  ROCKET,
  bearingOf,
  builtInOptic,
  platformVelocity,
  TEAM_NAMES,
  zeroList,
  CLASSES,
} from '../../../shared/warfare/config.js';
import { MW, mwIndex, caliberOf, AMMO, isSilenced } from '../../../shared/warfare/weapons.js';
import {
  ACTIVE_MAP,
  CAPTURE_CHAIN,
  heightAt,
  SECTORS,
  MAIN_BASES,
  SUPPLY_POINTS,
  gridRef,
  surfaceAt,
  waterDepth,
  waterAt,
  SURF,
} from '../../../shared/warfare/terrain.js';
import {
  selectMilMap,
  MAPDATA,
  createWorld,
  addStructure,
  removeStructure,
  rayWorld,
  structureBoxes,
  mountSpot,
  setDoor,
} from '../../../shared/warfare/world.js';
import {
  createMilMoveState,
  stepMil,
  restSeated,
  milSpeedMult,
} from '../../../shared/warfare/movement.js';
import {
  vehicleAABB,
  vehicleParts,
  seatWorld,
  stepCar,
  stepHeli,
  vehicleToWorld,
  groundFor,
} from '../../../shared/warfare/vehicle.js';
import {
  ricochet,
  stepBullet,
  BULLET_DT,
  zeroAngle,
  nadeStartMil,
  stepNadeMil,
  NADE_MIL,
  LEAN_HEAD,
  mortarRange,
  mortarTime,
} from '../../../shared/warfare/ballistics.js';
import { buildMilWorld, disposeMilWorld } from './worldRender.js';
import {
  buildVehicle,
  animateVehicle,
  wreckVehicle,
  buildStructure,
  buildGhost,
  setGhostOk,
  setStructMaterials,
} from './models.js';
import { WarfareViewmodel } from './viewmodel.js';
import { BulletDecals } from './decals.js';
import { MilRemotePlayer } from './players.js';
import { encodeLook } from '../../../shared/look.js';
import {
  encodeGear,
  hasDoor,
  seatYaw,
  isGunner,
  SEATS,
  VEH_GUNS,
  SHELLS,
  seatRole,
} from '../../../shared/warfare/config.js';
import { mw } from '../../../shared/warfare/weapons.js';
import { WarfareAudio } from './audio.js';
import { MilVoice } from './voice.js';
import { MilNet } from './net.js';
import { Crowd, meshLod } from './crowd.js';
import { resolvePreset, applyQuality, dynamicResolution } from './quality.js';
import { PerfHud } from './perfHud.js';
import { registerMilBuilders, MIL_BUILDERS, attachGear, buildBinos } from './items.js';
import { applyMilGear, attachOptic, setScopeTexture } from './gear.js';
import { BUILDERS } from '../guns.js';

const MOUSE_LOCK_SETTLE_MS = 80;

registerMilBuilders();

const FIXED_DT = 1 / 60;
const NO_FX = {
  recV: 1,
  recH: 1,
  spread: 1,
  hip: 1,
  ads: 1,
  move: 1,
  magMult: 1,
  reload: 1,
  vel: 1,
};
const DEGREES_TO_RADIANS = Math.PI / 180;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const KIT_KEY = 'headline-warfare-kit3';
const IDX = {
  knife: mwIndex('knife'),
  he: mwIndex('he'),
  smoke: mwIndex('smoke'),
  mg: mwIndex('m249'),
  rpg: mwIndex('rpg'),
  bandage: mwIndex('bandage'),
  medkit: mwIndex('medkit'),
  shovel: mwIndex('shovel'),
};
const QUARTER_TURN = Math.PI / 2;
const SCOPE_RT_PX = 512;
const SCOPE_APPARENT_FOV = 18;
const PIP_OPTICS = new Set(['x2', 'acog', 'scope8', 'scope12']);
const CAM_WALL_MARGIN_M = 0.16;
const CAM_FLOOR_MARGIN_M = 0.12;
const MG_EYE_BACK_M = 0.62;
const MG_EYE_UP_M = 0.2;
const MG_MUZZLE_Z = -1.36;
const EJECT_DOUBLE_TAP_S = 0.4;
const EXIT_MAX_SPEED = 3;
const CONSTRUCT_REACH_M = 4.5;
const CONSTRUCT_PAD_M = 0.15;
const DECAL_RANGE_M = 400;
const VEHICLE_FIRE_RANGE_M = 900;
const TRAIL_CONVERGE_M = 15;
const VEHICLE_WRECK_SMOKE_MS = 25000;
const UIF = { map: 8, binos: 16, light: 32, using: 64, nvg: 128 };
const TAP = 0.22;
const DAY_CYCLE = 90;
const DAY_KEYS = [
  [0, 'night'],
  [4, 'dusk'],
  [8, 'day'],
  [57, 'day'],
  [61, 'dusk'],
  [65, 'night'],
  [90, 'night'],
];
const TOD = {
  day: [0xc9d6df, 0xc4d0d8, 350, 1500, 2.4, 0xfff1dc, 1.05, 0xffffff],
  dusk: [0xd99a6a, 0xc98f6a, 200, 1100, 1.1, 0xffa060, 0.55, 0xffb48a],
  night: [0x05070d, 0x070a12, 30, 520, 0.12, 0x9fb4ff, 0.1, 0x0b1222],
};
const scratchColorA = new THREE.Color();
const scratchColorB = new THREE.Color();
const VEHICLE_TOUCH_M = 0.7;
const VEHICLE_FACING_RAD = 70 * DEGREES_TO_RADIANS;
const BULLET_GEO = new THREE.BoxGeometry(1, 1, 1);
const HALO_MAT = new THREE.SpriteMaterial({
  color: 0xff8a30,
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  fog: false,
});
const TRAIL_GEO = (() => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-0.5, 0, -1, 0.5, 0, -1, 0.5, 0, 0, -0.5, 0, 0], 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeBoundingSphere();
  return geometry;
})();
const TRAIL_TEX = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const image = context.createImageData(32, 256);
  for (let positionY = 0; positionY < 256; positionY++) {
    const along = positionY / 255;
    const tail = Math.pow(along, 1.6);
    for (let positionX = 0; positionX < 32; positionX++) {
      const across = 1 - Math.abs(positionX - 15.5) / 16;
      const core = Math.pow(Math.max(0, across), 2.2);
      const amount = Math.pow(Math.max(0, across), 1.4) * (0.2 + 0.8 * tail);
      const pixelOffset = ((255 - positionY) * 32 + positionX) * 4;
      const white = Math.pow(core, 4) * along;
      image.data[pixelOffset] = 255;
      image.data[pixelOffset + 1] = Math.round(255 * (0.55 + 0.45 * white));
      image.data[pixelOffset + 2] = Math.round(255 * (0.25 + 0.75 * white));
      image.data[pixelOffset + 3] = Math.round(255 * Math.min(1, amount * 1.4));
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
})();
const TRAIL_MAT = new THREE.MeshBasicMaterial({
  map: TRAIL_TEX,
  color: 0xffb070,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  fog: false,
  side: THREE.DoubleSide,
});
const STREAK2_MAT = new THREE.MeshBasicMaterial({
  map: TRAIL_TEX,
  color: 0x8a8070,
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  fog: false,
  side: THREE.DoubleSide,
});
const GLOW_MAT = new THREE.SpriteMaterial({
  map: (() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,240,210,1)');
    gradient.addColorStop(0.25, 'rgba(255,170,80,0.7)');
    gradient.addColorStop(1, 'rgba(255,120,40,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  })(),
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  fog: false,
});
const OWN_MAT = new THREE.MeshBasicMaterial({
  map: TRAIL_TEX,
  color: 0xd8d0c0,
  transparent: true,
  opacity: 0.8,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  fog: false,
  side: THREE.DoubleSide,
});
const trailX = new THREE.Vector3();
const trailY = new THREE.Vector3();
const trailZ = new THREE.Vector3();
const trailM = new THREE.Matrix4();
const DEBRIS_GEO = new THREE.BoxGeometry(1, 1, 1);
const DEBRIS_CAP = 220;
const UP_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z_CAM = new THREE.Vector3(0, 0, 1);
const DEB_AX = new THREE.Vector3(1, 0, 0);
const debCol = new THREE.Color();
const debrisQuaternion = new THREE.Quaternion();
const debrisMatrix = new THREE.Matrix4();
const debrisScale = new THREE.Vector3();
const debrisPosition = new THREE.Vector3();
const MED_ICON_MAT = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(255,255,255,0.92)';
  context.beginPath();
  context.arc(32, 32, 28, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#d23b2e';
  context.fillRect(26, 12, 12, 40);
  context.fillRect(12, 26, 40, 12);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    transparent: true,
    fog: false,
  });
})();
const SOFT_TEX = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
})();
const PUFF_MAT = new THREE.SpriteMaterial({
  map: SOFT_TEX,
  color: 0xa8987a,
  transparent: true,
  opacity: 0.8,
  depthWrite: false,
});
const SMOKE_MAT = new THREE.SpriteMaterial({
  map: SOFT_TEX,
  color: 0xcfcac0,
  transparent: true,
  opacity: 0.7,
  depthWrite: false,
});
const CRATE_FX = new THREE.MeshStandardMaterial({ color: 0x7d6a43, roughness: 0.9 });
const scratchVector = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchEuler = new THREE.Euler(0, 0, 0, 'YXZ');

function loadKit() {
  try {
    return JSON.parse(localStorage.getItem(KIT_KEY) || 'null');
  } catch {
    return null;
  }
}

export class WarfareEngine extends Engine {
  constructor(canvas, store, settings) {
    super(canvas, store, settings);
    disposeWorld(this.scene, this.worldGroup);
    this.worldGroup = null;
    this.viewmodel = new WarfareViewmodel();
    this.viewmodel.setLook(this.look);
    this.viewmodel.setAspect(window.innerWidth / window.innerHeight);
    this.audio = new WarfareAudio(this.settings.volume);
    this.voice = new MilVoice(this.audio, (message) => this.net?.send(message));
    this.indoor = false;
    this.net.close();
    this.net = new MilNet(
      (message) => this.onMessage(message),
      (state) => this.onStatus(state),
    );
    this.camera.far = 2600;
    this.camera.updateProjectionMatrix();
    this.solids = [];
    this.effects.ground = (positionX, positionZ) => heightAt(positionX, positionZ);
    this.decals = new BulletDecals(this.scene);
    this.game = 'warfare';
    this.world = null;
    this.groundFn = (positionX, positionZ, positionY) =>
      groundFor(this.world, positionX, positionZ, positionY);
    this.tod = 'day';
    this.kit = defaultKit(0);
    this.nextKit = loadKit();
    this.dressLobby();
    this.kg = kitWeight(this.kit);
    this.inv = { loaded: {}, mags: [], items: {} };
    this.ms = createMilMoveState();
    this.ms.px = this.ms.py = this.ms.pz = 0;
    this.zero = {};
    this.modeIdx = {};
    this.ads = 0;
    this.adsOn = false;
    this.focus = false;
    this.lowered = false;
    this.raise = 1;
    this.readyT = 0;
    this.readyLock = true;
    this.readyUntil = 0;
    this.aimOff = { y: 0, p: 0 };
    this.obstruct = 0;
    this.rested = false;
    this.binos = false;
    this.binosT = 0;
    this.scopeZoom = {};
    this.lean = 0;
    this.stance = 'stand';
    this.free = false;
    this.fl = { y: 0, p: 0 };
    this.rec = { p: 0, y: 0 };
    this.sway = { p: 0, y: 0, t: Math.random() * 100, amp: 0.002 };
    this.lag = { p: 0, y: 0 };
    this.breath = 1;
    this.walkToggle = false;
    this.pace = 0;
    this.bulletsFx = [];
    this.rocketsFx = [];
    this.puffs = [];
    this.bleedLv = 0;
    this.wounds = { arms: 0, legs: 0 };
    this.dragging = 0;
    this.downStable = false;
    this.debris = [];
    this.debrisMats = new Map();
    this.crateFx = [];
    this.veh = new Map();
    this.myVeh = null;
    this.vehSim = null;
    this.vehSendAt = 0;
    this.gear = 1;
    this.tp = false;
    this.structs = new Map();
    this.mount = null;
    this.mortar = { az: 0, el: 60 };
    this.sectors = SECTORS.map((state) => ({
      id: state.id,
      owner: -1,
      cap: 0,
      capTeam: -1,
      contested: false,
      n: [0, 0],
    }));
    this.teamState = null;
    this.total = null;
    this.interact = null;
    this.toasts = [];
    this.uiOpen = null;
    this.mapOpen = false;
    this.heliYaw = 0;
    this.lastBreath = 0;
    this.deathPos = null;
    this.downed = false;
    this.using = null;
    this.holdAct = null;
    this.light = false;
    this.nvg = false;
    this.keyAt = {};
    this.slotTap = { slot: -1, t: 0, timer: 0 };
    this.flash = new THREE.SpotLight(0xfff2d6, 0, 70, 0.38, 0.5, 1.4);
    this.flash.visible = false;
    this.scene.add(this.flash, this.flash.target);
    this.h.milWheel = (event) => this.onWheel(event);
    this.h.milUp = (event) => this.onKeyUpMil(event);
    window.addEventListener('wheel', this.h.milWheel, { passive: true });
    window.addEventListener('keyup', this.h.milUp);
    this.audio.onPoison = () => {
      for (const vehicle of this.veh.values()) {
        vehicle.loop?.stop();
        vehicle.loop = null;
      }
      this.voice.resetStreams();
      this.audio.stopWind?.();
      this.audio.startWind?.();
    };
    this.xp = 0;
    try {
      localStorage.removeItem('headline-warfare-xp');
    } catch {}
    this.perfHud = new PerfHud();
    if (new URLSearchParams(location.search).has('perf')) {
      this.perfHud.toggle(true);
    }
    this.resDyn = 1;
    this.applyGfx();
    if (new URLSearchParams(location.search).has('wardebug')) {
      window.__war = Object.assign(this, { dbgHeight: heightAt });
    }
    window.giveXp = (amount = 5000) => {
      if (!this.joined) {
        return 'Enter a Warfare match first.';
      }
      this.net.send({ t: 'devxp', n: Number(amount) });
      return 'Requested ' + amount + ' XP.';
    };
  }
  applyGraphics() {}

  lock() {
    if (this.settings.fullscreen) {
      this.enterFullscreen();
    }
    const retry = () => {
      try {
        this.canvas.requestPointerLock()?.catch?.(() => {});
      } catch {}
    };
    try {
      const lockRequest = this.canvas.requestPointerLock(
        this.settings.rawInput === false ? undefined : { unadjustedMovement: true },
      );
      if (lockRequest?.catch) {
        lockRequest.catch(retry);
      }
    } catch {
      retry();
    }
  }

  applyGfx() {
    if (!this.perfHud) {
      return;
    }
    const key = `${this.settings.milGfx}|${this.settings.milRes}`;
    if (key === this.gfxKey) {
      return;
    }
    this.gfxKey = key;
    this.gfx = resolvePreset(this.settings, this.renderer);
    applyQuality(this);
  }

  dispose() {
    if (window.giveXp) {
      delete window.giveXp;
    }
    this.decals?.dispose(this.scene);
    this.voice?.release();
    this.perfHud?.dispose();
    this.crowd?.dispose(this.scene);
    window.removeEventListener('wheel', this.h.milWheel);
    window.removeEventListener('keyup', this.h.milUp);
    this.audio.stopWind?.();
    this.setNvg(false);
    for (const vehicle of this.veh?.values() || []) {
      vehicle.loop?.stop();
    }
    super.dispose();
  }

  applySettings(state) {
    super.applySettings({ ...state, skins: undefined });
    this.dressLobby();
    this.applyGfx();
  }

  dressLobby() {
    const rig = this.lobby?.rig;
    if (!rig || this.nextKit === undefined) {
      return;
    }
    const team = this.prefTeam === 'CT' ? 1 : 0;
    const classId = CLASSES[this.settings?.warCls]
      ? this.settings.warCls
      : this.nextKit?.cls || 'assault';
    const kit = this.withLook(
      this.nextKit?.cls === classId ? sanitizeKit(this.nextKit, team) : defaultKit(team, classId),
    );
    rig.milGearKey = null;
    applyMilGear(rig, encodeGear(kit), this.look);
    this.lobby.setWeapon(kit.primary.id);
    const weapon = mw(kit.primary.id);
    if (rig.weapon && weapon) {
      const muzzleZ = rig.muzzle ? rig.muzzle.z : -0.6;
      attachOptic(rig.weapon, builtInOptic(weapon, kit.primary.optic) || kit.primary.optic, {
        muzzleZ: muzzleZ,
        builtIn: !!builtInOptic(weapon),
      });
      attachGear(rig.weapon, kit.primary, new THREE.Vector3(0, 0.012, muzzleZ));
    }
    if (!this.lobbyProps) {
      const add = (gun, position, rotation) => {
        gun.position.set(...position);
        gun.rotation.set(...rotation, 'ZYX');
        rig.torso.add(gun);
        return gun;
      };
      this.lobbyProps = {
        assault: add(
          MIL_BUILDERS.rpg(false).group,
          [0.12, 0.32, 0.2],
          [0, Math.PI / 2, 0.85 + Math.PI],
        ),
        engineer: add(MIL_BUILDERS.shovel(false).group, [-0.1, 0.3, 0.2], [0, Math.PI / 2, -0.7]),
        medic: add(MIL_BUILDERS.medkit(false).group, [-0.22, 0.02, -0.02], [0, 0, 0]),
        sniper: add(buildBinos(false), [0.1, 0.38, -0.17], [0, 0, 0]),
      };
    }
    for (const [currentKit, gun] of Object.entries(this.lobbyProps)) {
      gun.visible = currentKit === kit.cls || (currentKit === 'assault' && !!kit.launcher);
    }
  }
  setMap() {}
  setDoors() {}
  radar() {
    return null;
  }

  loadBattlefield(id) {
    selectMilMap(id);
    if (this.world && this.worldMap !== ACTIVE_MAP) {
      this.clearStructs();
      for (const entry of this.doors?.values() || []) {
        this.scene.remove(entry.pivot);
        entry.pivot.traverse((pixelOffset) => {
          pixelOffset.geometry?.dispose();
          if (pixelOffset.material) {
            pixelOffset.material.dispose();
          }
        });
      }
      this.doors = new Map();
      disposeMilWorld(this.scene, this.worldGroup);
      this.decals.clear();
      this.worldGroup = null;
      this.world = null;
    }
    this.ensureWorld();
  }

  ensureWorld() {
    if (this.world) {
      return;
    }
    this.worldMap = ACTIVE_MAP;
    this.world = createWorld();
    this.worldGroup = buildMilWorld(this.scene);
    setStructMaterials(this.worldGroup.userData.mats);
    this.buildDoors();
    if (this.gfx) {
      applyQuality(this);
    }
  }

  nearBoom(position, power = 1) {
    const entry = this.camera.position.distanceTo(position);
    if (entry < 18 * power && this.alive) {
      this.audio.ringing(Math.min(1, (1 - entry / (18 * power)) * 1.2));
    }
  }

  buildDoors() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.85 });
    const knob = new THREE.MeshStandardMaterial({
      color: 0xb9a06a,
      roughness: 0.4,
      metalness: 0.6,
    });
    this.doors = new Map();
    for (const door of MAPDATA.doors || []) {
      const pivot = new THREE.Group();
      pivot.position.set(door.hinge[0], door.y0, door.hinge[1]);
      const leaf = new THREE.Mesh(geometry, material);
      leaf.scale.set(door.len, door.h, 0.06);
      leaf.position.set(door.len / 2, door.h / 2, 0);
      leaf.castShadow = leaf.receiveShadow = true;
      pivot.add(leaf);
      const kit = new THREE.Mesh(geometry, knob);
      kit.scale.set(0.06, 0.06, 0.14);
      kit.position.set(door.len - 0.12, 1.0, 0);
      pivot.add(kit);
      if (door.axis === 'z') {
        pivot.rotation.y = -Math.PI / 2;
      }
      const base = pivot.rotation.y;
      this.scene.add(pivot);
      const open = this.world.doorOpen.get(door.id);
      this.doors.set(door.id, { dr: door, pivot, base, a: open ? 1 : 0, open });
    }
  }

  applyDoor(id, open) {
    if (!this.world) {
      return;
    }
    setDoor(this.world, id, open);
    const entry = this.doors?.get(id);
    if (entry) {
      entry.open = open;
    }
  }

  updateDoors(deltaTime) {
    for (const entry of this.doors?.values() || []) {
      const want = entry.open ? 1 : 0;
      if (Math.abs(entry.a - want) < 0.001) {
        continue;
      }
      entry.a += Math.sign(want - entry.a) * Math.min(Math.abs(want - entry.a), deltaTime * 2.5);
      entry.pivot.rotation.y = entry.base + entry.a * 1.75;
    }
  }

  applyTod(message) {
    const userData = this.worldGroup?.userData;
    if (!userData) {
      return;
    }
    let amount = 'night';
    let nightKey = 'night';
    let kit = 0;
    for (let index = 0; index < DAY_KEYS.length - 1; index++) {
      const [startMinute, startPhase] = DAY_KEYS[index];
      const [endMinute, endPhase] = DAY_KEYS[index + 1];
      if (message >= startMinute && message < endMinute) {
        amount = startPhase;
        nightKey = endPhase;
        kit = (message - startMinute) / (endMinute - startMinute);
        break;
      }
    }
    const fromTod = TOD[amount];
    const toTod = TOD[nightKey];
    const color = (index) =>
      scratchColorA.setHex(fromTod[index]).lerp(scratchColorB.setHex(toTod[index]), kit);
    const num = (index) => fromTod[index] + (toTod[index] - fromTod[index]) * kit;
    this.scene.background.copy(color(0));
    this.scene.fog.color.copy(color(1));
    this.scene.fog.near = num(2);
    this.scene.fog.far = num(3);
    userData.sun.intensity = num(4);
    userData.sun.color.copy(color(5));
    userData.hemi.intensity = num(6);
    userData.skyMesh.material.color.copy(color(7));
    const dark =
      amount === 'night' && nightKey === 'night'
        ? 1
        : amount === 'night' || nightKey === 'night'
          ? 0.5
          : 0;
    this.tod = dark >= 1 ? 'night' : amount === 'day' && nightKey === 'day' ? 'day' : 'dusk';
    this.dayMin = message;
  }

  dayMinute() {
    if ((this.dayT0 ?? null) === null || !this.net.hasOffset) {
      return 20;
    }
    const message = (this.net.serverNow() - this.dayT0) / 60000;
    return ((message % DAY_CYCLE) + DAY_CYCLE) % DAY_CYCLE;
  }

  setNvg(on) {
    this.nvg = on;
    this.canvas.style.filter = on
      ? 'brightness(5.5) contrast(1.15) grayscale(1) sepia(1) hue-rotate(58deg) saturate(3.2)'
      : '';
  }

  connect(name, options = {}) {
    this.store.set({ phase: 'connecting', message: '' });
    const { server = '', ...rest } = options;
    this.server = server;
    const team = this.prefTeam === 'CT' ? 1 : 0;
    const classId = this.settings.warCls;
    if (CLASSES[classId] && this.nextKit?.cls !== classId) {
      this.setClass(classId, team);
    }
    this.xp = 0;
    this.net.connect(
      {
        t: 'join',
        name: name || 'Player',
        team,
        look: this.look,
        kit: this.withLook(this.nextKit || defaultKit(team)),
        ...rest,
        game: 'warfare',
      },
      server,
    );
  }

  resetMatch() {
    this.voice?.release();
    super.resetMatch();
    this.audio.stopWind?.();
    for (const vehicle of this.veh.values()) {
      vehicle.loop?.stop();
      if (vehicle.vm) {
        this.scene.remove(vehicle.vm.group);
      }
    }
    this.veh.clear();
    this.clearStructs();
    for (const box of this.bulletsFx) {
      this.killBullet(box);
    }
    for (const result of this.rocketsFx) {
      this.scene.remove(result.mesh);
    }
    this.bulletsFx = [];
    this.rocketsFx = [];
    this.myVeh = null;
    this.gunnerOn = false;
    this.gunDef = null;
    this.commander = false;
    this.coaxOn = false;
    this.seatFace = 0;
    this.fHold = null;
    this.vehSim = null;
    this.mount = null;
    this.downed = false;
    this.uiOpen = null;
    this.mapOpen = false;
    this.total = null;
    this.teamState = null;
    this.setNvg(false);
    this.light = false;
    if (this.world) {
      this.world.vehicles = [];
    }
  }

  addGadget(gun) {
    this.removeGadget(gun.id);
    const grp = new THREE.Group();
    const olive = new THREE.MeshStandardMaterial({ color: 0x4b5532, roughness: 0.85 });
    const white = new THREE.MeshStandardMaterial({ color: 0xeae6dc, roughness: 0.9 });
    const red = new THREE.MeshStandardMaterial({ color: 0xb02020, roughness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.8 });
    const part = (weapon, height, entry, material, positionX, positionY, positionZ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(weapon, height, entry), material);
      mesh.position.set(positionX, positionY, positionZ);
      mesh.castShadow = true;
      grp.add(mesh);
      return mesh;
    };
    let blink = null;
    if (gun.k === 'ammobag') {
      part(0.6, 0.34, 0.36, olive, 0, 0.17, 0);
      part(0.62, 0.05, 0.38, dark, 0, 0.36, 0);
      part(0.62, 0.06, 0.1, dark, 0, 0.2, 0);
      part(0.16, 0.14, 0.38, new THREE.MeshStandardMaterial({ color: 0xc9a64a }), 0, 0.2, 0);
    } else if (gun.k === 'medbag') {
      part(0.58, 0.34, 0.36, white, 0, 0.17, 0);
      part(0.6, 0.05, 0.38, dark, 0, 0.36, 0);
      part(0.2, 0.06, 0.38, red, 0, 0.2, 0);
      part(0.06, 0.2, 0.38, red, 0, 0.2, 0);
    } else {
      part(0.34, 0.2, 0.34, olive, 0, 0.1, 0);
      const ant = part(0.025, 0.7, 0.025, dark, 0.1, 0.55, 0.1);
      void ant;
      blink = part(0.07, 0.07, 0.07, red, 0.1, 0.92, 0.1);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1.1, 24),
        new THREE.MeshBasicMaterial({
          color: gun.tm === 0 ? 0xe8892b : 0x4a9be8,
          side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      grp.add(ring);
    }
    grp.position.set(gun.p[0], gun.p[1], gun.p[2]);
    grp.rotation.y = gun.yaw || 0;
    this.scene.add(grp);
    (this.gadgets ||= new Map()).set(gun.id, { mesh: grp, blink, k: gun.k });
  }
  removeGadget(id) {
    const pixelOffset = this.gadgets?.get(id);
    if (pixelOffset) {
      this.scene.remove(pixelOffset.mesh);
      this.gadgets.delete(id);
    }
  }
  clearGadgets() {
    for (const id of [...(this.gadgets?.keys() || [])]) {
      this.removeGadget(id);
    }
  }

  clearStructs() {
    for (const [id, structure] of this.structs) {
      this.scene.remove(structure.mesh);
      if (this.world) {
        removeStructure(this.world, id);
      }
    }
    this.structs.clear();
  }

  addStruct(amount) {
    const [id, type, positionX, positionY, positionZ, rotation, team, health, prog = 100] = amount;
    if (this.structs.has(id)) {
      return;
    }
    const state = {
      id,
      type,
      x: positionX,
      y: positionY,
      z: positionZ,
      rot: rotation,
      team,
      hp: health,
      prog: prog / 100,
    };
    addStructure(this.world, state);
    let mesh;
    let ghost = false;
    if (state.prog < 1) {
      mesh = buildGhost(type, rotation);
      setGhostOk(mesh, true);
      mesh.position.set(positionX, positionY, positionZ);
      ghost = true;
    } else {
      mesh = buildStructure(type, positionX, positionY, positionZ, rotation, team);
    }
    this.scene.add(mesh);
    this.structs.set(id, { s: state, mesh, ghost });
    this.structList = null;
  }

  finishStructMesh(structure) {
    this.scene.remove(structure.mesh);
    structure.mesh = buildStructure(
      structure.s.type,
      structure.s.x,
      structure.s.y,
      structure.s.z,
      structure.s.rot,
      structure.s.team,
    );
    this.scene.add(structure.mesh);
    structure.ghost = false;
    if (Math.hypot(structure.s.x - this.ms.x, structure.s.z - this.ms.z) < 30) {
      this.audio.build();
    }
  }
  delStruct(id, boom) {
    const structure = this.structs.get(id);
    if (!structure) {
      return;
    }
    this.scene.remove(structure.mesh);
    this.decals.removeOwner(id);
    removeStructure(this.world, id);
    this.structs.delete(id);
    this.structList = null;
    if (boom) {
      const position = new THREE.Vector3(structure.s.x, structure.s.y + 0.8, structure.s.z);
      this.effects.debris(position, new THREE.Vector3(2, 1.5, 2));
      this.audio.doorBreak(this.spatial(position));
    }
    if (this.mount?.id === id) {
      this.leaveMount(true);
    }
  }

  spatial(position) {
    const center = this.camera.position;
    const currentPosition = Array.isArray(position)
      ? position
      : [position.x, position.y, position.z];
    const entry = Math.hypot(
      currentPosition[0] - center.x,
      currentPosition[1] - center.y,
      currentPosition[2] - center.z,
    );
    let muffled = false;
    if (entry > 0.8 && entry < 250 && this.world) {
      const direction = [
        (currentPosition[0] - center.x) / entry,
        (currentPosition[1] - center.y) / entry,
        (currentPosition[2] - center.z) / entry,
      ];
      muffled = !!rayWorld(this.world, [center.x, center.y, center.z], direction, entry - 0.4, {
        skip: (box) => box.tree,
      });
    }
    return {
      ...this.audio.farParams(currentPosition, [center.x, center.y, center.z], { muffled }),
      muffled,
    };
  }
  earArr() {
    const center = this.camera.position;
    return [center.x, center.y, center.z];
  }
  toast(text, kind = '', duration = 4000) {
    const same = this.toasts.find((positionX) => positionX.text === text);
    if (same) {
      same.until = performance.now() + duration;
      return;
    }
    this.toasts.push({
      id: performance.now() + Math.random(),
      text,
      kind,
      until: performance.now() + duration,
    });
    if (this.toasts.length > 5) {
      this.toasts.shift();
    }
  }

  onMessage(message) {
    switch (message.t) {
      case 'welcome':
        this.loadBattlefield(message.mil?.map);
        this.sectors = SECTORS.map((state) => ({
          id: state.id,
          owner: -1,
          cap: 0,
          capTeam: -1,
          contested: false,
          n: [0, 0],
        }));
        super.onMessage(message);
        this.game = 'warfare';
        this.applyInit(message.mil);
        this.audio.init();
        this.audio.startWind?.();
        this.alive = false;
        this.deadAt = performance.now() - 5000;
        setTimeout(() => document.pointerLockElement && document.exitPointerLock(), 50);
        break;
      case 'mgad':
        this.addGadget(message.g);
        break;
      case 'mgadx':
        this.removeGadget(message.id);
        break;
      case 'mdoor': {
        this.applyDoor(message.id, !!message.o);
        const entry = this.doors?.get(message.id);
        if (
          entry &&
          Math.hypot(entry.dr.hinge[0] - this.ms.x, entry.dr.hinge[1] - this.ms.z) < 25
        ) {
          this.audio.door?.(!!message.o);
        }
        break;
      }
      case 'stprog': {
        const structure = this.structs.get(message.id);
        if (structure) {
          structure.s.prog = message.p / 100;
          structure.s.hp = message.hp;
          if (message.p >= 100 && structure.ghost) {
            this.finishStructMesh(structure);
          }
        }
        break;
      }
      case 'mmarks':
        this.markers = message.l || [];
        break;
      case 'mspot': {
        this.spots = (this.spots || []).filter(
          (positionX) => !(positionX.id === message.id && positionX.k === message.k),
        );
        this.spots.push({
          id: message.id,
          k: message.k,
          x: message.p[0],
          y: message.p[1],
          z: message.p[2],
          until: performance.now() + message.ttl,
          by: message.by,
        });
        if (message.by) {
          this.toast(`${message.by} spotted an enemy`, '', 1200);
        }
        break;
      }
      case 'mros':
        this.net.onRoster(message);
        break;
      case 'mxp': {
        this.xp = message.xp;
        if (message.add) {
          this.toast(
            `${message.add > 0 ? '+' : ''}${message.add}  ${message.why}`,
            message.add > 0 ? 'good' : 'warn',
            1800,
          );
        }
        if ((message.up ?? null) !== null) {
          const unl = Object.entries(VEH_RANK)
            .filter(([, result]) => result === message.up)
            .map(([kit]) => VEHICLES[kit].name);
          this.toast(
            `Promoted to ${RANKS[message.up].name}${unl.length ? `. Unlocked: ${unl.join(', ')}` : ''}`,
            'good',
            5000,
          );
          this.audio.kill?.();
        }
        break;
      }
      case 'mperf':
        this.perfHud.server = message.w;
        break;
      case 'win':
        this.winStats = message.stats || null;
        super.onMessage(message);
        break;
      case 'vox':
        this.voice.onVox(message);
        break;
      case 'voxs':
        this.voice.onVoxState(message);
        break;
      case 'mreset':
        this.clearStructs();
        this.applyInit(message);
        this.toast('New battle. All sectors are neutral.');
        break;
      case 'mdead':
        if (this.alive) {
          this.setDead();
        }
        break;
      case 'mstate':
        message.sec.forEach((amount, index) =>
          Object.assign(this.sectors[index], {
            owner: amount[0],
            cap: amount[1] / 100,
            capTeam: amount[2],
            contested: !!amount[3],
            n: [amount[4], amount[5]],
          }),
        );
        if (message.tk) {
          this.tickets = message.tk;
        }
        break;
      case 'mteam':
        this.teamState = message;
        if (!this.alive) {
          this.respawnAt = performance.now() + message.rs * 1000;
        }
        if (this.downed) {
          this.downedUntil = performance.now() + message.dn * 1000;
        }
        break;
      case 'msec': {
        const state = SECTORS.find((positionX) => positionX.id === message.id);
        this.toast(
          `${TEAM_NAMES[message.by]} ${message.ev === 'captured' ? 'captured' : 'neutralized'} ${message.id} · ${state.name}`,
          message.by === this.team ? 'good' : 'bad',
        );
        this.audio.beepUI();
        break;
      }
      case 'mtotal':
        if (message.on) {
          this.toast(
            `Total control · ${TEAM_NAMES[message.team]} holds every sector`,
            message.team === this.team ? 'good' : 'bad',
            6000,
          );
        } else {
          this.toast(
            'Total control broken. Timer reset.',
            message.team === this.team ? 'bad' : 'good',
            4000,
          );
        }
        break;
      case 'mmsg':
        this.toast(message.m, 'warn');
        this.audio.error();
        break;
      case 'stadd':
        this.addStruct(message.s);
        if (Math.hypot(message.s[2] - this.ms.x, message.s[4] - this.ms.z) < 30) {
          this.audio.build();
        }
        break;
      case 'stdel':
        this.delStruct(message.id, !!message.boom);
        break;
      case 'sthp': {
        const structure = this.structs.get(message.id);
        if (structure) {
          structure.s.hp = message.hp;
        }
        break;
      }
      case 'vin':
        this.enterVeh(message.id, message.s);
        break;
      case 'vout':
        this.exitVeh(message.p);
        break;
      case 'vcorr':
        if (this.vehSim && this.vehSim.id === message.id) {
          [
            this.vehSim.x,
            this.vehSim.y,
            this.vehSim.z,
            this.vehSim.yaw,
            this.vehSim.pitch,
            this.vehSim.roll,
            this.vehSim.v,
            this.vehSim.vx,
            this.vehSim.vy,
            this.vehSim.vz,
            this.vehSim.steer,
            this.vehSim.rotor,
            this.vehSim.coll,
          ] = message.s;
        }
        if (this.vehSim && this.vehSim.id === message.id) {
          this.vehSim.onGround = this.vehSim.y <= heightAt(this.vehSim.x, this.vehSim.z) + 0.3;
          if (this.vehSim.rotor > 0.5) {
            this.engineOn = true;
          }
        }
        break;
      case 'mvspawn':
        this.toast(`${VEHICLES[message.k].name} is ready at the depot.`, 'good');
        this.closeUi();
        break;
      case 'vboom': {
        const position = new THREE.Vector3(message.p[0], message.p[1], message.p[2]);
        this.effects.explosion(position, 1.2);
        this.blast(position, 1.2, 12);
        this.audio.boomFar(message.p, this.earArr(), 1.4);
        this.shake = Math.max(
          this.shake,
          Math.max(0, 1 - this.camera.position.distanceTo(position) / 60),
        );
        const vehicle = this.veh.get(message.id);
        if (vehicle?.vm) {
          wreckVehicle(vehicle.vm);
        }
        break;
      }
      case 'minv':
        if (message.r && this.reloading) {
          this.pendingInv = message;
          break;
        }
        this.applyInv(message);
        if (message.kit) {
          this.setKitLocal(message.kit, message.kg);
        }
        if (message.msg) {
          this.toast(message.msg, 'good');
        }
        if (
          (message.w ?? null) !== null &&
          message.w !== this.cur &&
          this.slots.includes(message.w) &&
          message.kit
        ) {
          this.selectLocal(message.w);
        }
        if (!this.slots.includes(this.cur) && !this.mount) {
          this.selectLocal(this.slots[0]);
        }
        break;
      case 'mheal':
        this.hp = message.hp;
        this.toast(message.by ? `${message.by} treated you.` : 'Treated.', 'good');
        break;
      case 'mdown':
        this.onDowned(message);
        break;
      case 'mmed':
        this.bleedLv = message.b | 0;
        this.wounds = { arms: message.w?.[0] || 0, legs: message.w?.[1] || 0 };
        if ((message.hp ?? null) !== null) {
          this.hp = message.hp;
        }
        this.downStable = !!message.st;
        break;
      case 'mdrag':
        this.dragging = message.id || 0;
        if (message.id) {
          this.adsOn = false;
          this.toast('Dragging · [F] Let go', '', 1800);
        }
        break;
      case 'mrevived':
        this.onRevived(message);
        break;
      case 'downed':
        if (message.v !== this.myId && (message.k === this.myId || message.vt === this.team)) {
          this.toast(
            message.k === this.myId
              ? `You downed ${message.vn}`
              : `${message.vn} is down. Medic needed.`,
            message.k === this.myId ? 'good' : 'warn',
            3000,
          );
        }
        break;
      case 'mknock':
        this.knockUntil = performance.now() + message.ms;
        this.adsOn = false;
        break;
      case 'mmount':
        if (message.id) {
          this.enterMount(message.id, message.k, message.am);
        } else {
          this.leaveMount(true);
        }
        break;
      case 'bhit':
        if (message.v !== this.myId) {
          this.bleed(
            message.v,
            new THREE.Vector3(message.p[0], message.p[1], message.p[2]),
            new THREE.Vector3(message.o[0], message.o[1], message.o[2]),
            !!message.h,
            true,
          );
        }
        break;
      case 'hit':
        this.hitCounter = (this.hitCounter || 0) + 1;
        this.hit = {
          n: this.hitCounter,
          head: message.pt === 'head',
          kill: !!message.kill,
          dmg: message.d,
          t: performance.now(),
        };
        this.audio.hit?.(message.pt === 'head');
        break;
      case 'rocket':
        this.spawnRocket(message.o, message.d, message.i, message.k);
        break;
      case 'rboom': {
        const position = new THREE.Vector3(message.p[0], message.p[1] + 0.2, message.p[2]);
        const smokeFactor = message.s ? 0.4 : 1;
        this.nearBoom(position, smokeFactor);
        this.effects.explosion(position, 1.1 * smokeFactor);
        this.blast(position, 1.3 * smokeFactor, 12 * smokeFactor);
        this.audio.boomFar(message.p, this.earArr(), 1.3 * smokeFactor);
        this.shake = Math.max(
          this.shake,
          Math.max(0, 1 - this.camera.position.distanceTo(position) / (50 * smokeFactor)) *
            smokeFactor,
        );
        let best = null;
        for (const result of this.rocketsFx) {
          if (
            !best ||
            Math.hypot(result.p[0] - message.p[0], result.p[2] - message.p[2]) <
              Math.hypot(best.p[0] - message.p[0], best.p[2] - message.p[2])
          ) {
            best = result;
          }
        }
        if (best) {
          best.dead = true;
        }
        break;
      }
      case 'mfire': {
        this.audio.shotFar('mortar', message.p, this.earArr(), false, false);
        const shell = {
          p: [...message.p],
          v: [...message.v],
          t: 0,
          whistled: false,
          trail: 0,
          mesh: this.mortarShellMesh(),
        };
        this.scene.add(shell.mesh);
        (this.shells ||= []).push(shell);
        const aimPitchOffset = new THREE.Vector3(message.p[0], message.p[1], message.p[2]);
        if (aimPitchOffset.distanceTo(this.camera.position) < 600) {
          this.effects.flash(aimPitchOffset, 0.8);
          for (let kit = 0; kit < 4; kit++) {
            this.smokePuff(
              [
                message.p[0] + (Math.random() - 0.5) * 0.6,
                message.p[1] + kit * 0.3,
                message.p[2] + (Math.random() - 0.5) * 0.6,
              ],
              0.6,
              1.6,
            );
          }
        }
        break;
      }
      case 'mboom': {
        const position = new THREE.Vector3(message.p[0], message.p[1] + 0.3, message.p[2]);
        let near = null;
        for (const shell of this.shells || []) {
          if (
            shell.mesh &&
            (!near ||
              Math.hypot(shell.p[0] - message.p[0], shell.p[2] - message.p[2]) <
                Math.hypot(near.p[0] - message.p[0], near.p[2] - message.p[2]))
          ) {
            near = shell;
          }
        }
        if (near) {
          this.scene.remove(near.mesh);
          near.mesh = null;
          near.t = 99;
        }
        this.effects.explosion(position, 1.5);
        this.blast(position, 1.5, 18);
        this.audio.boomFar(message.p, this.earArr(), 1.6);
        this.shake = Math.max(
          this.shake,
          Math.max(0, 1 - this.camera.position.distanceTo(position) / 70),
        );
        this.shells = (this.shells || []).filter(
          (state) => Math.hypot(state.p[0] - message.p[0], state.p[2] - message.p[2]) > 30,
        );
        break;
      }
      case 'he': {
        this.endNade(message.id);
        const position = new THREE.Vector3(message.p[0], message.p[1] + 0.2, message.p[2]);
        this.blast(position, 0.9, 10);
        this.effects.explosion(position, 0.55);
        this.audio.boomFar(message.p, this.earArr(), 0.8);
        this.shake = Math.max(
          this.shake,
          Math.max(0, 0.7 - this.camera.position.distanceTo(position) / 25),
        );
        break;
      }
      case 'kill':
        if (message.v === this.myId && message.k !== message.v) {
          const killer = this.remotes.get(message.k);
          this.killerPos = killer?.st ? [killer.st.x, killer.st.z] : null;
        }
        super.onMessage(message);
        if (
          (message.w === 'mortar' || message.w === 'vehicle' || message.w === 'rpg') &&
          this.lastBlast
        ) {
          this.remotes
            .get(message.v)
            ?.explode(this.lastBlast.pos, this.lastBlast.power, this.effects);
        }
        break;
      default:
        super.onMessage(message);
    }
  }

  applyInit(position) {
    this.tickets = position.tk || this.tickets || [0, 0];
    this.clearGadgets();
    for (const gun of position.gd || []) {
      this.addGadget(gun);
    }
    for (const state of position.st || []) {
      this.addStruct(state);
    }
    for (const [id, pixelOffset] of position.dr || []) {
      this.applyDoor(id, !!pixelOffset);
    }
    if (position.sec) {
      position.sec.forEach((amount, index) =>
        Object.assign(this.sectors[index], {
          owner: amount[0],
          cap: amount[1] / 100,
          capTeam: amount[2],
          contested: !!amount[3],
          n: [amount[4], amount[5]],
        }),
      );
    }
    if ((position.day ?? null) !== null) {
      this.dayT0 = position.day;
    }
    this.applyTod(this.dayMinute());
  }

  setClass(classId, team = this.team) {
    if (!CLASSES[classId]) {
      return;
    }
    const kit = this.nextKit || {};
    this.setNextKit({
      ...defaultKit(team, classId),
      uniform: kit.uniform,
      helmet: kit.helmet,
      vest: kit.vest,
      pack: kit.pack,
    });
    this.settings.warCls = classId;
  }

  withLook(kit) {
    return kit ? { ...kit, uniform: this.look?.outfit || kit.uniform } : kit;
  }

  setNextKit(kit) {
    this.nextKit = sanitizeKit(this.withLook(kit), this.team);
    try {
      localStorage.setItem(KIT_KEY, JSON.stringify(this.nextKit));
    } catch {}
    if (this.joined) {
      this.net.send({ t: 'kit', kit: this.nextKit });
    }
    this.dressLobby();
  }

  deploy(spawnId) {
    this.audio.init();
    this.net.send({
      t: 'deploy',
      sp: spawnId,
      kit: this.withLook(this.nextKit || defaultKit(this.team)),
    });
  }

  applyInv(message) {
    if (message.sl) {
      this.slots = message.sl;
    }
    if (message.ld) {
      this.inv.loaded = {};
      for (const [weaponIndex, normal, ammo, size] of message.ld) {
        this.inv.loaded[weaponIndex] = { n: normal, ammo, size };
      }
    }
    if (message.mg) {
      this.inv.mags = message.mg.map(([caliber, normal, size, ammo]) => ({
        cal: caliber,
        n: normal,
        size,
        ammo,
      }));
    }
    if (message.it) {
      this.inv.items = { ...message.it };
    }
  }

  setKitLocal(kit, weight) {
    this.kit = kit;
    this.kg = weight ?? kitWeight(kit);
    const primaryIndex = mwIndex(kit.primary.id);
    this.viewmodel.setOptic(primaryIndex, kit.primary.optic);
    this.viewmodel.setAttach(primaryIndex, kit.primary);
    if (kit.secondary) {
      const secondaryIndex = mwIndex(kit.secondary.id);
      this.viewmodel.setOptic(secondaryIndex, 'iron');
      this.viewmodel.setAttach(secondaryIndex, { rail: kit.secondary.rail });
    }
    this.viewmodel.setOptic(IDX.mg, 'iron');
    this.viewmodel.setOptic(IDX.rpg, 'iron');
  }

  magsFor(weaponIndex) {
    const caliber = caliberOf(MW[weaponIndex].id);
    return this.inv.mags.filter((message) => message.cal === caliber);
  }

  onRespawn(message) {
    this.bleedLv = 0;
    this.wounds = { arms: 0, legs: 0 };
    this.deathCam = null;
    const state = this.ms;
    Object.assign(state, createMilMoveState(message.p[0], message.p[1], message.p[2]));
    state.px = state.x;
    state.py = state.y;
    state.pz = state.z;
    this.yaw = message.yaw;
    this.pitch = 0;
    this.punch.pitch = this.punch.yaw = 0;
    this.rec.p = this.rec.y = 0;
    this.lag.p = this.lag.y = 0;
    this.fl.y = this.fl.p = 0;
    this.spawnCount = message.sp;
    this.pending = [];
    this.outbox = [];
    this.corr.set(0, 0, 0);
    this.alive = true;
    this.downed = false;
    this.hp = 100;
    this.applyInv(message);
    this.setKitLocal(message.kit, message.kg);
    this.cur = this.slots[0];
    this.lastWeapon = this.slots[1];
    this.reloading = false;
    this.ads = 0;
    this.adsOn = false;
    this.lowered = false;
    this.readyT = 0;
    this.readyLock = true;
    this.readyUntil = 0;
    this.aimOff = { y: 0, p: 0 };
    this.binos = false;
    this.binosT = 0;
    this.stance = 'stand';
    this.lean = 0;
    this.myVeh = null;
    this.gunnerOn = false;
    this.gunDef = null;
    this.commander = false;
    this.coaxOn = false;
    this.seatFace = 0;
    this.fHold = null;
    this.vehSim = null;
    this.mount = null;
    this.using = null;
    this.holdAct = null;
    this.spec = null;
    this.deadAt = 0;
    this.viewmodel.setWeapon(this.cur);
    const now = performance.now() / 1000;
    this.readyAt = now + MW[this.cur].drawTime * 1.2;
    this.drawStart = now;
    this.nextFire = 0;
    this.lastSend = 0;
    this.uiOpen = null;
    this.mapOpen = false;
    this.store.set({ milUi: null, bigMap: false, milPause: false });
    this.lock();
  }

  setDead() {
    super.setDead();
    this.deathPos = [this.ms.x, this.ms.y, this.ms.z];
    this.startDeathCam();
    this.respawnAt = performance.now() + MIL.respawnMs;
    this.myVeh = null;
    this.gunnerOn = false;
    this.gunDef = null;
    this.commander = false;
    this.coaxOn = false;
    this.seatFace = 0;
    this.fHold = null;
    this.vehSim = null;
    this.mount = null;
    this.binos = false;
    this.ads = 0;
    this.adsOn = false;
    this.downed = false;
    this.using = null;
    this.uiOpen = null;
    this.mapOpen = false;
    this.light = false;
    this.setNvg(false);
    this.store.set({ milUi: null, bigMap: false });
    setTimeout(() => {
      if (!this.alive && document.pointerLockElement) {
        document.exitPointerLock();
      }
    }, 1600);
  }

  startDeathCam() {
    const cam = this.camera;
    const feet = new THREE.Vector3(this.deathPos[0], this.deathPos[1], this.deathPos[2]);
    const height = clamp(cam.position.y - feet.y, 0.25, 1.7);
    let forwardX = Math.sin(this.yaw);
    let forwardZ = Math.cos(this.yaw);
    if (this.killerPos) {
      const deltaX = feet.x - this.killerPos[0];
      const deltaZ = feet.z - this.killerPos[1];
      const distance = Math.hypot(deltaX, deltaZ);
      if (distance > 0.5) {
        forwardX = deltaX / distance;
        forwardZ = deltaZ / distance;
      }
    }
    const result = (Math.random() - 0.5) * 0.5;
    const center = Math.cos(result);
    const state = Math.sin(result);
    [forwardX, forwardZ] = [
      forwardX * center - forwardZ * state,
      forwardX * state + forwardZ * center,
    ];
    this.deathCam = {
      feet,
      h: height,
      a: height < 0.6 ? 1.2 : 0,
      v: 0.6 + Math.random() * 0.6,
      max: 1.42 + Math.random() * 0.1,
      axis: new THREE.Vector3(forwardZ, 0, -forwardX).normalize(),
      look: new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ')),
      roll: (Math.random() - 0.5) * 0.6,
    };
    this.killerPos = null;
  }

  updateDeathCam(deltaTime) {
    const deathCam = this.deathCam;
    const cam = this.camera;
    deathCam.v += 7 * Math.sin(deathCam.a + 0.2) * deltaTime;
    deathCam.a += deathCam.v * deltaTime;
    if (deathCam.a >= deathCam.max) {
      deathCam.a = deathCam.max;
      deathCam.v = Math.abs(deathCam.v) > 0.6 ? -deathCam.v * 0.25 : 0;
      if (deathCam.v && !deathCam.hit) {
        deathCam.hit = true;
        this.shake = Math.max(this.shake, 0.35);
        this.audio.thunk?.();
      }
    }
    const quaternion = scratchQuaternion.setFromAxisAngle(deathCam.axis, deathCam.a);
    cam.position.set(0, deathCam.h, 0).applyQuaternion(quaternion).add(deathCam.feet);
    const gun = heightAt(cam.position.x, cam.position.z) + 0.14;
    if (cam.position.y < gun) {
      cam.position.y = gun;
    }
    const kit = deathCam.a / deathCam.max;
    cam.quaternion
      .copy(quaternion)
      .multiply(deathCam.look)
      .multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_Z_CAM, deathCam.roll * kit));
  }

  onDowned(message) {
    const again = this.downed;
    this.downed = true;
    this.downedUntil = performance.now() + message.until;
    if ((message.giveUp ?? null) !== null) {
      this.giveUpAt = performance.now() + message.giveUp;
    }
    if (message.stable) {
      this.downStable = true;
      this.toast('A teammate stopped your bleeding.', 'good');
    }
    if (again) {
      return;
    }
    this.vehSim = null;
    this.deathPos = [this.ms.x, this.ms.y, this.ms.z];
    this.adsOn = false;
    this.binos = false;
    this.using = null;
    this.mount = null;
    this.closeUi(true);
    this.audio.hurt();
    setTimeout(() => {
      if (this.downed && document.pointerLockElement) {
        document.exitPointerLock();
      }
    }, 1200);
  }

  onRevived(message) {
    this.downed = false;
    this.downStable = false;
    this.hp = message.hp;
    if ((message.st ?? null) !== null) {
      this.ms.st = Math.min(this.ms.st, message.st);
    }
    this.toast(
      message.last
        ? `${message.by} revived you. No more revives this life.`
        : `${message.by} revived you.`,
      message.last ? 'warn' : 'good',
      3500,
    );
    this.stance = 'crouch';
    this.lock();
  }

  placeMarker(kit, positionX, positionZ) {
    this.net.send(
      kit === 'clear'
        ? { t: 'marker', clear: 1 }
        : { t: 'marker', k: kit, x: positionX, z: positionZ },
    );
  }

  giveUp() {
    this.net.send({ t: 'giveup' });
  }

  enterVeh(id, seat) {
    this.myVeh = { id, seat };
    this.binos = false;
    this.adsOn = false;
    this.ads = 0;
    this.fl.y = this.fl.p = 0;
    this.gear = 1;
    const vehicle = this.veh.get(id);
    this.engineOn = vehicle?.st.engine === 2;
    this.gunnerOn = !!vehicle && isGunner(vehicle.st.type, seat);
    this.gunDef = this.gunnerOn ? VEH_GUNS[vehicle.st.type] : null;
    this.commander = !!vehicle && seatRole(vehicle.st.type, seat) === 'commander';
    this.tCur = { y: 0, p: 0 };
    this.seatFace = vehicle ? seatYaw(vehicle.st.type, seat) : 0;
    this.fl.y = this.seatFace;
    this.gunMag = null;
    this.engineStart = 0;
    this.fOpenAt = 0;
    this.fHold = null;
    if (seat === 0 && vehicle && !this.engineOn) {
      this.engineOn = true;
      this.net.send({ t: 'vengine', on: 1 });
    }
    this.coaxOn = false;
    this.coaxMag = null;
    if (seat === 0 && vehicle) {
      const structure = vehicle.st;
      this.vehSim = {
        id,
        type: structure.type,
        team: structure.team,
        x: structure.x,
        y: structure.y,
        z: structure.z,
        yaw: structure.yaw,
        pitch: structure.pitch,
        roll: structure.roll,
        v: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        steer: 0,
        yawRate: 0,
        rotor: structure.rotor || 0,
        coll: 0,
        onGround: true,
        alive: true,
        cargo: structure.cargo,
      };
    } else {
      this.vehSim = null;
    }
    this.audio.thunk();
  }

  myVehSpeed() {
    const structure = this.myVeh && this.veh.get(this.myVeh.id)?.st;
    if (!structure) {
      return 0;
    }
    return VEHICLES[structure.type]?.kind === 'heli'
      ? Math.hypot(structure.vx || 0, structure.vz || 0)
      : Math.abs(structure.v || 0);
  }

  vehF(now) {
    const vehicle = this.veh.get(this.myVeh.id);
    if (!vehicle) {
      return;
    }
    if (now - (this.lastVehF || 0) < EJECT_DOUBLE_TAP_S) {
      this.lastVehF = 0;
      this.fOpenAt = 0;
      this.fHold = null;
      clearTimeout(this.fTimer);
      this.net.send({ t: 'vexit', ej: 1 });
      return;
    }
    this.lastVehF = now;
    const seat = this.myVeh.seat;
    const door = hasDoor(vehicle.st.type, seat);
    const open = door && ((vehicle.st.doors || 0) >> seat) & 1;
    if (door && !open) {
      this.net.send({ t: 'vdoor', open: 1 });
      this.audio.door(true, true);
      this.fOpenAt = now;
      return;
    }
    this.fHold = { t: now, door, done: false };
    clearTimeout(this.fTimer);
    this.fTimer = setTimeout(() => {
      if (this.fHold && this.keys.has('KeyF') && this.fHold.door && this.myVeh) {
        this.fHold.done = true;
        this.net.send({ t: 'vdoor', open: 0 });
        this.audio.door(false, true);
      }
    }, 450);
  }

  updateGunner(currentNow, deltaTime = 1 / 60) {
    const vehicle = this.gunnerOn && this.myVeh && this.veh.get(this.myVeh.id);
    if (!vehicle) {
      return;
    }
    const gun = this.gunDef;
    const aimYaw = gun.yawLimit ? clamp(this.fl.y, -gun.yawLimit, gun.yawLimit) : this.fl.y;
    const aimPitch = clamp(this.fl.p, gun.pitch[0], gun.pitch[1]);
    const step = gun.turn * deltaTime;
    this.tCur.y += clamp(wrap(aimYaw - this.tCur.y), -step, step);
    this.tCur.p += clamp(aimPitch - this.tCur.p, -step * 0.7, step * 0.7);
    const now = performance.now();
    if (now - (this.turretSentAt || 0) > 90) {
      this.turretSentAt = now;
      this.net.send({
        t: 'vturret',
        y: Math.round(this.tCur.y * 1000) / 1000,
        p: Math.round(this.tCur.p * 1000) / 1000,
      });
    }
    const gunnerIndex = vehicle.st.gun || 0;
    if (
      !this.gunMag ||
      (currentNow - (this.gunShotAt || 0) > 0.8 &&
        ((this.gunMag.n <= 0 && gunnerIndex > 0) ||
          gunnerIndex > this.gunMag.n + Math.max(1, gun.mag * 0.2)))
    ) {
      this.gunMag = { n: gunnerIndex, ammo: 'fmj', size: gun.mag };
    }
    const live = this.locked && this.alive && !this.chatting && !this.uiOpen;
    if (gun.coax && this.coaxOn) {
      this.coaxMag ||= { n: gun.coax.mag, ammo: 'tracer', size: gun.coax.mag };
      if (this.coaxMag.n <= 0 && !this.coaxReloadAt) {
        this.coaxReloadAt = currentNow + gun.coax.reload / 1000;
      }
      if (this.coaxReloadAt && currentNow >= this.coaxReloadAt) {
        this.coaxMag.n = gun.coax.mag;
        this.coaxReloadAt = 0;
      }
      if (live && this.mouse.l && currentNow >= this.nextFire && this.coaxMag.n > 0) {
        this.gunShotAt = currentNow;
        this.fire(MW[IDX.mg], this.coaxMag, currentNow);
        this.nextFire = currentNow + gun.coax.interval;
      }
      return;
    }
    if (live && this.mouse.l && currentNow >= this.nextFire && this.gunMag.n > 0) {
      this.gunShotAt = currentNow;
      if (gun.kind === 'mg') {
        this.fire(MW[IDX.mg], this.gunMag, currentNow);
        this.nextFire = currentNow + gun.interval;
      } else {
        this.fireShell(gun, currentNow);
      }
    }
  }

  fireShell(gun, now) {
    this.gunMag.n--;
    this.nextFire = now + gun.interval;
    const cam = this.camera;
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const pixelOffset = [cam.position.x, cam.position.y, cam.position.z];
    const entry = [direction.x, direction.y, direction.z];
    this.net.send({
      t: 'shoot',
      o: pixelOffset.map((vehicle) => Math.round(vehicle * 1000) / 1000),
      d: entry.map((vehicle) => Math.round(vehicle * 100000) / 100000),
      rt: this.net.serverNow() - INTERP_MS,
      w: IDX.mg,
    });
    this.spawnRocket(pixelOffset, entry, this.myId, gun.kind);
    const big = gun.kind === 'cannon';
    this.shake = Math.max(this.shake, big ? 0.6 : 0.15);
    this.tCur.p = clamp(this.tCur.p + (big ? 0.03 : 0.006), gun.pitch[0], gun.pitch[1]);
    this.audio.shot(big ? 'cannon' : 'autocannon');
    if (big) {
      this.audio.boomFar(pixelOffset, this.earArr(), 0.9);
    }
  }

  toggleEngine() {
    if (!this.myVeh || this.myVeh.seat !== 0) {
      return;
    }
    if (this.engineOn) {
      this.engineOn = false;
      this.net.send({ t: 'vengine', on: 0 });
    } else if (!this.engineStart) {
      this.engineStart = performance.now() / 1000;
      this.audio.starter(VEHICLES[this.veh.get(this.myVeh.id)?.st.type]?.kind);
    }
  }

  exitVeh(position) {
    if (this.downed && position) {
      this.deathPos = [position[0], position[1], position[2]];
    }
    this.fHold = null;
    this.gunnerOn = false;
    this.gunDef = null;
    this.commander = false;
    this.seatFace = 0;
    this.engineStart = 0;
    this.myVeh = null;
    this.vehSim = null;
    const state = this.ms;
    Object.assign(state, createMilMoveState(position[0], position[1], position[2]), {
      st: state.st,
    });
    state.onGround = false;
    state.px = state.x;
    state.py = state.y;
    state.pz = state.z;
    this.pending = [];
    this.corr.set(0, 0, 0);
    this.yaw += this.fl.y;
    this.fl.y = this.fl.p = 0;
    this.stance = 'stand';
    this.audio.thunk();
  }

  updateVehicles(deltaTime) {
    const renderTime = this.net.serverNow() - INTERP_MS;
    const list = this.net.interpolateVeh(renderTime);
    const seen = new Set();
    const ear = this.earArr();
    for (const structure of list) {
      seen.add(structure.id);
      let vehicle = this.veh.get(structure.id);
      if (!vehicle) {
        vehicle = { st: structure, vm: null, loop: null, wasAlive: structure.alive };
        this.veh.set(structure.id, vehicle);
      }
      const mine = this.vehSim && this.vehSim.id === structure.id;
      if (mine) {
        this.vehSim.comp = structure.comp;
        this.vehSim.flipped = structure.flipped;
        this.vehSim.burning = !!structure.burning;
      }
      const state = mine
        ? {
            ...structure,
            ...this.vehSim,
            hp: structure.hp,
            alive: structure.alive,
            cargo: structure.cargo,
            loading: structure.loading,
            engine: this.engineOn ? 2 : 0,
            doors: structure.doors,
          }
        : structure;
      vehicle.st = state;
      if (!vehicle.vm) {
        vehicle.vm = buildVehicle(structure.type, structure.team);
        this.scene.add(vehicle.vm.group);
        if (!structure.alive) {
          wreckVehicle(vehicle.vm);
        }
      }
      if (!structure.alive && vehicle.wasAlive) {
        wreckVehicle(vehicle.vm);
      }
      vehicle.wasAlive = structure.alive;
      vehicle.vm.group.position.set(state.x, state.y, state.z);
      const vehicleDefinition = VEHICLES[structure.type];
      if (vehicleDefinition.kind === 'car' && deltaTime > 0) {
        const acceleration =
          (vehicle.lastV ?? null) === null ? 0 : (state.v - vehicle.lastV) / deltaTime;
        const yawRate =
          (vehicle.lastYaw ?? null) === null
            ? 0
            : Math.atan2(
                Math.sin(state.yaw - vehicle.lastYaw),
                Math.cos(state.yaw - vehicle.lastYaw),
              ) / deltaTime;
        vehicle.lastV = state.v;
        vehicle.lastYaw = state.yaw;
        vehicle.accS =
          (vehicle.accS || 0) + (acceleration - (vehicle.accS || 0)) * Math.min(1, deltaTime * 5);
        const soft = vehicleDefinition.tracks ? 0.35 : vehicleDefinition.heavyArmor ? 0.6 : 1;
        const pitchTilt = Math.max(-0.06, Math.min(0.06, vehicle.accS * 0.011)) * soft;
        const rollTilt = Math.max(-0.07, Math.min(0.07, -yawRate * state.v * 0.011)) * soft;
        vehicle.leanP =
          (vehicle.leanP || 0) + (pitchTilt - (vehicle.leanP || 0)) * Math.min(1, deltaTime * 6);
        vehicle.leanR =
          (vehicle.leanR || 0) + (rollTilt - (vehicle.leanR || 0)) * Math.min(1, deltaTime * 6);
      }
      vehicle.vm.group.rotation.set(
        state.pitch + (vehicle.leanP || 0),
        state.yaw,
        state.roll + (vehicle.leanR || 0),
        'YXZ',
      );
      const distance =
        Math.hypot(state.x - this.camera.position.x, state.z - this.camera.position.z) *
        (this.camera.fov / (this.settings.fov || 75));
      meshLod(
        vehicle.vm.group,
        distance < (this.gfx?.vehLod || 70) || (this.myVeh && this.myVeh.id === structure.id),
      );
      animateVehicle(
        vehicle.vm,
        this.gunnerOn && this.myVeh?.id === structure.id
          ? { ...state, tyaw: this.tCur.y, tp: this.tCur.p }
          : state,
        deltaTime,
        this.groundFn,
      );
      const inside = !!this.myVeh && this.myVeh.id === structure.id;
      if (vehicle.vm.disc) {
        vehicle.vm.disc.visible = !vehicle.vm.wrecked && !(inside && !this.tp);
      }
      const definition = VEHICLES[structure.type];
      const entry = Math.hypot(state.x - ear[0], state.z - ear[2]);
      const running =
        structure.alive &&
        (definition.kind === 'heli' ? (state.rotor || 0) > 0.02 : state.engine === 2);
      if (running && entry < (definition.kind === 'heli' ? 1800 : 700)) {
        vehicle.loop ||= this.audio.loop(
          definition.kind === 'heli' ? 'heli' : 'car',
          structure.type,
        );
        const velocityX =
          definition.kind === 'heli' ? state.vx || 0 : -Math.sin(state.yaw) * (state.v || 0);
        const velocityZ =
          definition.kind === 'heli' ? state.vz || 0 : -Math.cos(state.yaw) * (state.v || 0);
        const radial =
          entry > 1
            ? -(velocityX * (state.x - ear[0]) + velocityZ * (state.z - ear[2])) / entry
            : 0;
        vehicle.loop?.update(
          [state.x, state.y + 1.5, state.z],
          ear,
          definition.kind === 'heli' ? state.rotor : 1,
          Math.min(1, Math.abs(state.v || 0) / (definition.vmax || 30)),
          inside && !this.tp,
          inside ? 0 : radial,
        );
      } else if (vehicle.loop) {
        vehicle.loop.stop();
        vehicle.loop = null;
      }
      if (state.loading && entry < 160 && performance.now() - (vehicle.lastCrate || 0) > 420) {
        vehicle.lastCrate = performance.now();
        this.crateHop(state);
      }
      this.vehicleFire(vehicle, state, definition, entry);
    }
    for (const [id, vehicle] of this.veh) {
      if (seen.has(id)) {
        continue;
      }
      vehicle.loop?.stop();
      if (vehicle.vm) {
        this.scene.remove(vehicle.vm.group);
      }
      this.veh.delete(id);
    }
    if (this.world) {
      this.world.vehicles = [...this.veh.values()].map((vehicle) => ({
        box: vehicleAABB(vehicle.st),
        parts: vehicleParts(vehicle.st),
        v: vehicle.st,
      }));
    }
  }

  rearOf(structure) {
    const result = REAR[structure.type] || [0, 1, VEHICLES[structure.type].len / 2];
    return vehicleToWorld({ ...structure, pitch: 0, roll: 0 }, result[0], result[1], result[2]);
  }

  crateHop(structure) {
    const rear = this.rearOf(structure);
    let other = null;
    if (structure.loading === 1) {
      const supplyPoint = SUPPLY_POINTS.find(
        (position) =>
          Math.hypot(position.x - structure.x, position.z - structure.z) < position.r + 12,
      );
      if (supplyPoint) {
        other = [supplyPoint.x, heightAt(supplyPoint.x, supplyPoint.z) + 0.5, supplyPoint.z];
      }
    } else {
      let best = null;
      for (const supplyTent of MAPDATA.supplyTents) {
        if (
          !best ||
          Math.hypot(supplyTent.x - rear[0], supplyTent.z - rear[2]) <
            Math.hypot(best.x - rear[0], best.z - rear[2])
        ) {
          best = supplyTent;
        }
      }
      for (const forward of this.teamState?.fobs || []) {
        if (
          !best ||
          Math.hypot(forward[2] - rear[0], forward[3] - rear[2]) <
            Math.hypot(best.x - rear[0], best.z - rear[2])
        ) {
          best = { x: forward[2], z: forward[3] };
        }
      }
      if (best) {
        other = [best.x, heightAt(best.x, best.z) + 0.5, best.z];
      }
    }
    if (!other) {
      return;
    }
    const from = structure.loading === 1 ? other : rear;
    const target = structure.loading === 1 ? rear : other;
    const mesh = new THREE.Mesh(BULLET_GEO, CRATE_FX);
    mesh.scale.set(0.6, 0.45, 0.5);
    this.scene.add(mesh);
    this.crateFx.push({ mesh, from, to: target, t: 0 });
  }

  stepMyVehicle(deltaTime) {
    const vehicle = this.vehSim;
    if (!vehicle) {
      return;
    }
    const kit = this.keys;
    const live = this.locked && !this.chatting && !this.uiOpen;
    const definition = VEHICLES[vehicle.type];
    const others = [...this.veh.values()]
      .filter((pixelOffset) => pixelOffset.st.id !== vehicle.id && pixelOffset.st.alive)
      .map((pixelOffset) => pixelOffset.st);
    vehicle.rammed = null;
    const nowS = performance.now() / 1000;
    if (this.engineStart && nowS - this.engineStart > 1.1) {
      this.engineStart = 0;
      this.engineOn = true;
      this.net.send({ t: 'vengine', on: 1 });
    }
    if (
      !this.engineOn &&
      live &&
      (kit.has('KeyW') ||
        (definition.kind === 'heli' && (kit.has('ShiftLeft') || kit.has('ShiftRight'))))
    ) {
      this.toggleEngine();
    }
    const eng = this.engineOn;
    let impact;
    if (definition.kind === 'heli') {
      this.heliYaw *= Math.exp(-deltaTime * 6);
      impact = stepHeli(
        vehicle,
        {
          engine: eng,
          assist: true,
          coll:
            live && eng
              ? (kit.has('ShiftLeft') || kit.has('ShiftRight') ? 1 : 0) -
                (kit.has('KeyC') || kit.has('ControlLeft') ? 1 : 0)
              : 0,
          pitch: live ? (kit.has('KeyW') ? 1 : 0) - (kit.has('KeyS') ? 1 : 0) : 0,
          roll: live ? (kit.has('KeyD') ? 1 : 0) - (kit.has('KeyA') ? 1 : 0) : 0,
          yaw: clamp(
            this.heliYaw +
              (live ? ((kit.has('KeyQ') ? 1 : 0) - (kit.has('KeyE') ? 1 : 0)) * 0.9 : 0),
            -1.2,
            1.2,
          ),
        },
        deltaTime,
        this.world,
      );
    } else {
      impact = stepCar(
        vehicle,
        {
          thr: live && eng ? (kit.has('KeyW') ? 1 : 0) - (kit.has('KeyS') ? 1 : 0) : 0,
          steer: live ? (kit.has('KeyD') ? 1 : 0) - (kit.has('KeyA') ? 1 : 0) : 0,
          brake: live && kit.has('Space'),
          boost: live && eng && (kit.has('ShiftLeft') || kit.has('ShiftRight')),
        },
        deltaTime,
        this.world,
        others,
      );
    }
    if (impact > 6) {
      this.shake = Math.max(this.shake, Math.min(1, impact / 25));
    }
    const now = performance.now();
    if (now - this.vehSendAt > 33) {
      this.vehSendAt = now;
      this.net.send({
        t: 'vs',
        id: vehicle.id,
        g: this.gear,
        s: [
          vehicle.x,
          vehicle.y,
          vehicle.z,
          vehicle.yaw,
          vehicle.pitch,
          vehicle.roll,
          vehicle.v,
          vehicle.vx,
          vehicle.vy,
          vehicle.vz,
          vehicle.steer,
          vehicle.rotor,
          vehicle.coll,
        ].map((positionX) => Math.round(positionX * 1000) / 1000),
        ...(vehicle.rammed ? { r: [...new Set(vehicle.rammed)].slice(0, 4) } : null),
      });
    }
  }

  enterMount(id, kind, ammoInfo) {
    const structure = this.structs.get(id);
    if (!structure) {
      return;
    }
    if (this.mount?.id === id) {
      if (kind === 'mg' && ammoInfo) {
        this.inv.loaded[IDX.mg] = { n: ammoInfo[1], ammo: ammoInfo[2], size: ammoInfo[3] };
      }
      return;
    }
    this.mount = { id, kind, yaw0: structure.s.rot * QUARTER_TURN, prevCur: this.cur };
    const [mountX, mountZ] = mountSpot(structure.s);
    this.ms.x = mountX;
    this.ms.z = mountZ;
    this.ms.vx = 0;
    this.ms.vz = 0;
    this.binos = false;
    if (kind === 'mg') {
      if (ammoInfo) {
        this.inv.loaded[IDX.mg] = { n: ammoInfo[1], ammo: ammoInfo[2], size: ammoInfo[3] };
      }
      this.cur = IDX.mg;
      this.viewmodel.setWeapon(IDX.mg);
      this.yaw = this.mount.yaw0;
      this.pitch = 0;
    } else {
      this.mortar.az = Math.round(bearingOf(this.mount.yaw0));
      this.yaw = this.mount.yaw0;
    }
    this.audio.thunk();
  }

  aimMountedGun(cam, yaw, pitch) {
    if (this.mount?.kind !== 'mg') {
      return;
    }
    const structure = this.structs.get(this.mount.id);
    const prop = structure?.mesh.userData.mg;
    if (!prop) {
      return;
    }
    const gun = prop.userData.gun;
    gun.rotation.order = 'YXZ';
    gun.rotation.y = yaw - structure.s.rot * QUARTER_TURN;
    gun.rotation.x = pitch;
    gun.getWorldPosition(scratchVector);
    cam.position.set(
      scratchVector.x + Math.sin(yaw) * MG_EYE_BACK_M,
      scratchVector.y + MG_EYE_UP_M,
      scratchVector.z + Math.cos(yaw) * MG_EYE_BACK_M,
    );
  }

  leaveMount(fromServer = false) {
    if (!this.mount) {
      return;
    }
    const previous = this.mount.prevCur;
    this.mount = null;
    if (!fromServer) {
      this.net.send({ t: 'use', k: 'mount' });
    }
    if ((previous ?? null) !== null && this.slots.includes(previous)) {
      this.selectLocal(previous);
    }
  }

  areaAt(positionX, positionZ, withMain = true) {
    if (withMain) {
      const mainBase = MAIN_BASES[this.team];
      if (Math.hypot(mainBase.x - positionX, mainBase.z - positionZ) < mainBase.r) {
        return { kind: 'main', id: 'main', name: mainBase.name };
      }
    }
    for (let index = 0; index < SECTORS.length; index++) {
      const scopeCamera = SECTORS[index];
      if (
        this.sectors[index].owner === this.team &&
        Math.hypot(scopeCamera.x - positionX, scopeCamera.z - positionZ) < scopeCamera.r
      ) {
        return {
          kind: 'sector',
          id: scopeCamera.id,
          name: `${scopeCamera.id} · ${scopeCamera.name}`,
        };
      }
    }
    return null;
  }

  onKey(event, down) {
    if (!down) {
      return;
    }
    if (this.chatting) {
      return;
    }
    this.audio.ensureRunning?.();
    if (event.code === 'Escape' && this.uiOpen) {
      return this.closeUi();
    }
    if (event.code === 'Tab') {
      event.preventDefault();
      if (this.joined) {
        this.store.set({ board: true });
      }
      return;
    }
    if (event.code === 'KeyM') {
      event.preventDefault();
      if (!event.repeat && this.joined && this.alive && !this.downed) {
        this.toggleMap();
      }
      return;
    }
    if (!this.locked) {
      return;
    }
    if (!['F5', 'F11', 'F12'].includes(event.code)) {
      event.preventDefault();
    }
    if (event.repeat) {
      return;
    }
    const now = performance.now() / 1000;
    this.keys.add(event.code);
    this.keyAt[event.code] = now;
    const center = event.code;
    if (center === 'KeyT' && this.joined) {
      return this.openChat();
    }
    if (
      (center === 'CapsLock' || center === 'KeyJ' || center === 'KeyK') &&
      this.joined &&
      this.alive &&
      !this.downed
    ) {
      const channel = center === 'CapsLock' ? 'l' : center === 'KeyJ' ? 's' : 'c';
      this.voice.start(channel).then((ok) => {
        if (!ok) {
          this.toast(
            this.voice.denied
              ? 'Microphone blocked. Allow it in the browser.'
              : 'No microphone available.',
            'warn',
          );
        }
      });
      return;
    }
    if (center === 'KeyO' && this.joined) {
      return this.toggleSquad();
    }
    if (center === 'F8') {
      return this.perfHud.toggle();
    }
    if (!this.alive || this.downed) {
      return;
    }
    if (this.myVeh) {
      if (center === 'KeyF') {
        this.vehF(now);
      } else if (center === 'KeyX' && this.gunnerOn && this.gunDef?.coax) {
        this.coaxOn = !this.coaxOn;
        this.toast(this.coaxOn ? this.gunDef.coax.name : this.gunDef.name, '', 1200);
        this.audio.fireMode?.();
      } else if (/^Digit[1-9]$/.test(center)) {
        this.net.send({ t: 'vseat', s: Number(center.slice(5)) - 1 });
      } else if (center === 'KeyH') {
        this.tp = !this.tp;
      }
      return;
    }
    if (this.mount) {
      if (center === 'KeyF' || center === 'KeyE') {
        this.leaveMount();
        this.swallowKeyUp = center;
      } else if (center === 'KeyR' && this.mount.kind === 'mg') {
        this.startReload();
      }
      return;
    }
    if (center === 'KeyE' && this.ms.prone) {
      this.rollReq = 1;
      return;
    }
    if (center === 'KeyQ' && !this.ms.prone) {
      this.net.send({ t: 'spot' });
      this.audio.beepUI?.();
    } else if (center === 'KeyR') {
      this.startReload();
    } else if (/^Digit[1-9]$/.test(center)) {
      this.slotKey(Number(center.slice(5)) - 1);
    } else if (center === 'KeyF') {
      this.doInteract(true);
    } else if (center === 'KeyB') {
      this.toggleBinos();
    } else if (center === 'KeyN') {
      this.toggleNvg();
    } else if (center === 'KeyL') {
      this.toggleLight();
    } else if (center === 'PageUp') {
      this.changeZero(1);
    } else if (center === 'PageDown') {
      this.changeZero(-1);
    } else if (center === 'KeyX') {
      this.cycleFireMode();
    } else if (center === 'KeyZ') {
      this.stance = this.stance === 'prone' ? 'crouch' : 'prone';
    } else if (center === 'Space' && this.stance !== 'stand') {
      this.stance = 'stand';
    } else if (
      (center === 'KeyC' ||
        ((center === 'ControlLeft' || center === 'ControlRight') && this.keysLocked)) &&
      this.ms.sprinting &&
      this.stance === 'stand'
    ) {
      this.stance = 'crouch';
      this.slideKey = center;
    } else if (
      center === 'KeyC' ||
      ((center === 'ControlLeft' || center === 'ControlRight') && this.keysLocked)
    ) {
      clearTimeout(this.proneTimer);
      this.proneByHold = false;
      this.proneTimer = setTimeout(
        () => {
          if (this.keys.has(center)) {
            this.stance = 'prone';
            this.proneByHold = true;
          }
        },
        TAP * 1000 + 130,
      );
    } else if (center === 'F2') {
      this.debug = !this.debug;
      this.remotes.forEach((remotePlayer) => remotePlayer.setDebug(this.debug));
      this.store.set({ debug: this.debug });
    }
  }

  onKeyUpMil(event) {
    if (this.chatting) {
      return;
    }
    const center = event.code;
    const now = performance.now() / 1000;
    const held = now - (this.keyAt[center] || 0);
    this.keys.delete(center);
    if (center === 'Tab') {
      this.store.set({ board: false });
    }
    if (center === 'CapsLock' || center === 'KeyJ' || center === 'KeyK') {
      this.voice.stop();
    }
    if (center === 'KeyF' && this.fHold) {
      const holdState = this.fHold;
      this.fHold = null;
      clearTimeout(this.fTimer);
      if (!holdState.done && this.myVeh && held < 0.45) {
        if (this.myVehSpeed() > EXIT_MAX_SPEED) {
          this.toast('Too fast to get out. Double tap F to jump.', 'warn', 2500);
        } else {
          this.net.send({ t: 'vexit' });
        }
      }
    }
    if (!this.locked || !this.alive || this.downed) {
      return;
    }
    if (this.swallowKeyUp === center) {
      this.swallowKeyUp = null;
      return;
    }
    if (center === 'KeyE' && held < TAP && !this.myVeh && !this.ms.prone && !this.mount) {
      this.doInteract();
    }
    if (this.slideKey === center) {
      this.slideKey = null;
    } else if (
      (center === 'KeyC' || center === 'ControlLeft' || center === 'ControlRight') &&
      !this.myVeh
    ) {
      clearTimeout(this.proneTimer);
      if (!this.proneByHold && held < TAP + 0.13) {
        this.stance =
          this.stance === 'prone' ? 'crouch' : this.stance === 'crouch' ? 'stand' : 'crouch';
      }
      this.proneByHold = false;
    }
  }

  slotKey(kit) {
    const index = this.slots[kit];
    if ((index ?? null) === null || index < 0) {
      return;
    }
    const now = performance.now();
    if (index !== this.cur) {
      this.binos = false;
      this.switchTo(index);
      return;
    }
    if (this.slotTap.slot === kit && now - this.slotTap.t < 300) {
      clearTimeout(this.slotTap.timer);
      this.slotTap.slot = -1;
      this.cycleFireMode();
      return;
    }
    this.slotTap = { slot: kit, t: now, timer: 0 };
  }

  onWheel(event) {
    if (!this.locked || this.chatting) {
      return;
    }
    const direction = event.deltaY < 0 ? 1 : -1;
    if (this.keys.has('AltLeft') || this.keys.has('AltRight')) {
      const pixelOffset = opticOf(this.opticNow(MW[this.cur]));
      if (pixelOffset.zoomRange && this.ads > 0.5) {
        const step = pixelOffset.zoom >= 8 ? 1 : 0.5;
        const positionZ = this.scopeZoom[pixelOffset.id] ?? pixelOffset.zoom;
        this.scopeZoom[pixelOffset.id] = clamp(
          Math.round((positionZ + direction * step) / step) * step,
          pixelOffset.zoomRange[0],
          pixelOffset.zoomRange[1],
        );
      }
      return;
    }
    if (this.mount?.kind === 'mortar') {
      this.mortar.el = clamp(this.mortar.el + direction * 0.5, MORTAR.minEl, MORTAR.maxEl);
    }
  }

  toggleBinos() {
    if (this.myVeh || this.downed) {
      return;
    }
    if (!(this.inv.items.binos > 0)) {
      return this.toast('No binoculars in your kit.', 'warn');
    }
    this.binos = !this.binos;
    this.adsOn = false;
    if (this.binos) {
      this.yaw += this.aimOff.y;
      this.pitch = clamp(
        this.pitch + this.aimOff.p,
        -89 * DEGREES_TO_RADIANS,
        89 * DEGREES_TO_RADIANS,
      );
      this.aimOff.y = this.aimOff.p = 0;
    }
    this.audio.draw();
  }

  toggleMap() {
    if (!this.mapOpen && !(this.inv.items.map > 0)) {
      this.toast('No map in your kit.', 'warn');
      this.audio.error();
      return;
    }
    this.mapOpen = !this.mapOpen;
    this.store.set({ bigMap: this.mapOpen });
    if (this.mapOpen) {
      this.uiOpen = 'map';
      this.adsOn = false;
      this.binos = false;
      this.keys.clear();
      document.exitPointerLock?.();
    } else {
      if (this.uiOpen === 'map') {
        this.uiOpen = null;
      }
      this.lock();
    }
  }

  toggleSquad() {
    if (this.uiOpen === 'squad') {
      return this.closeUi();
    }
    if (this.uiOpen) {
      return;
    }
    this.uiOpen = 'squad';
    this.keys.clear();
    this.mouse.l = this.mouse.r = false;
    this.store.set({ milUi: { kind: 'squad' } });
    document.exitPointerLock?.();
  }
  joinSquad(squad) {
    this.net.send({ t: 'squad', sq: squad });
  }
  setLead(on) {
    this.net.send({ t: 'squad', lead: on ? 1 : 0 });
  }

  toggleLight() {
    const has =
      this.inv.items.light > 0 ||
      this.kit.primary?.rail === 'light' ||
      this.kit.secondary?.rail === 'light';
    if (!has) {
      return this.toast('No flashlight in your kit.', 'warn');
    }
    this.light = !this.light;
    this.audio.beepUI();
  }

  toggleNvg() {
    if (!(this.inv.items.nvg > 0)) {
      return this.toast('No night vision in your kit.', 'warn');
    }
    this.setNvg(!this.nvg);
    this.audio.beepUI();
  }

  modes(weapon) {
    return fireModes(weapon);
  }

  modeOf(weapon) {
    const message = this.modes(weapon);
    return message[(this.modeIdx[weapon.id] || 0) % message.length];
  }

  cycleFireMode() {
    const weapon = MW[this.cur];
    const modes = this.modes(weapon);
    if (modes.length < 2) {
      return;
    }
    this.modeIdx[weapon.id] = ((this.modeIdx[weapon.id] || 0) + 1) % modes.length;
    this.toast(`Fire mode: ${modes[this.modeIdx[weapon.id]]}`, '', 1200);
    this.audio.cock();
  }

  fxOf(weapon) {
    return weapon?.slot === 'primary' ? primaryFx(this.kit) : NO_FX;
  }

  opticNow(weapon = MW[this.cur]) {
    if (weapon.slot === 'primary') {
      return builtInOptic(weapon, this.kit.primary?.optic) || this.kit.primary?.optic || 'iron';
    }
    return 'iron';
  }

  changeZero(direction) {
    const weapon = MW[this.cur];
    const list = zeroList(weapon, this.opticNow(weapon));
    if (!list) {
      return;
    }
    const current = this.zero[weapon.id] ?? 0;
    this.zero[weapon.id] = clamp(current + direction, 0, list.length - 1);
    if (this.zero[weapon.id] !== current) {
      this.audio.beepUI();
    }
  }

  zeroRange(weapon) {
    const list = zeroList(weapon, this.opticNow(weapon));
    if (!list) {
      return null;
    }
    return list[Math.min(list.length - 1, this.zero[weapon.id] ?? 0)];
  }

  needsRaise(weapon) {
    return !weapon.melee && !weapon.grenade && !weapon.item;
  }

  onMouse(event, down) {
    if (!this.locked) {
      return;
    }
    this.audio.ensureRunning?.();
    const now = performance.now() / 1000;
    if (event.button === 0) {
      if (down && this.mount?.kind === 'mortar') {
        return this.net.send({ t: 'mfire', az: this.mortar.az, el: this.mortar.el });
      }
      this.mouse.l = down;
      if (!down) {
        if (this.using && !this.using.done) {
          this.cancelUse();
        }
        return;
      }
      const weapon = MW[this.cur];
      this.readyUntil = now + 2.5;
      this.fireQueued = now + 0.03;
      void weapon;
    } else if (event.button === 2) {
      this.mouse.r = down;
      if (this.myVeh || this.mount) {
        this.focus = down;
        return;
      }
      if (down) {
        if (this.canAds()) {
          this.adsOn = true;
        }
      } else {
        this.adsOn = false;
      }
    }
  }

  onMouseMove(event) {
    if (!this.locked) {
      return;
    }
    if (performance.now() - this.lockedAt < MOUSE_LOCK_SETTLE_MS) {
      return;
    }
    const magnitude = Math.max(Math.abs(event.movementX), Math.abs(event.movementY));
    if (magnitude > 300 && magnitude > this.mouseAvg * 5 + 60) {
      return;
    }
    this.mouseAvg += (magnitude - this.mouseAvg) * 0.2;
    this.applyLook(event.movementX, event.movementY);
  }

  applyLook(mouseDeltaX, mouseDeltaY) {
    const fovScale =
      Math.tan((this.currentFov * DEGREES_TO_RADIANS) / 2) /
      Math.tan((this.settings.fov * DEGREES_TO_RADIANS) / 2);
    const kit = (this.settings.sens * 0.022 * DEGREES_TO_RADIANS * fovScale) / (this.pipZoom || 1);
    const deltaX = mouseDeltaX * kit;
    const deltaY = mouseDeltaY * kit;
    const pilot = this.vehSim && VEHICLES[this.vehSim.type].kind === 'heli';
    if (this.myVeh && pilot && !this.tp) {
      this.heliYaw -= mouseDeltaX * 0.012;
      this.fl.p = clamp(this.fl.p - deltaY, -1.2, 1.0);
    } else if (this.myVeh || !this.alive || this.downed) {
      const face = this.myVeh ? this.seatFace || 0 : 0;
      this.fl.y =
        this.myVeh && (this.tp || this.gunnerOn)
          ? this.fl.y - deltaX
          : clamp(this.fl.y - deltaX, face - 1.75, face + 1.75);
      this.fl.p =
        this.gunnerOn && !this.tp
          ? clamp(this.fl.p - deltaY, this.gunDef.pitch[0], this.gunDef.pitch[1])
          : clamp(this.fl.p - deltaY, this.tp ? -0.9 : -1.2, this.tp ? 0.5 : 1.2);
      if (this.gunnerOn && this.gunDef.yawLimit && !this.tp) {
        this.fl.y = clamp(this.fl.y, -this.gunDef.yawLimit, this.gunDef.yawLimit);
      }
    } else {
      this.yaw -= deltaX;
      this.pitch = clamp(this.pitch - deltaY, -89 * DEGREES_TO_RADIANS, 89 * DEGREES_TO_RADIANS);
      if (this.mount?.kind === 'mg') {
        const release = wrap(this.yaw - this.mount.yaw0);
        this.yaw = this.mount.yaw0 + clamp(release, -1.0, 1.0);
        this.pitch = clamp(this.pitch, -0.35, 0.45);
      }
      if (this.ms.prone) {
        this.pitch = clamp(this.pitch, -0.35, 0.6);
      }
      this.lag.y = clamp(this.lag.y + deltaX * 0.05, -0.02, 0.02);
      this.lag.p = clamp(this.lag.p + deltaY * 0.05, -0.015, 0.015);
    }
    this.lookDX += mouseDeltaX;
    this.lookDY += mouseDeltaY;
  }

  lookAtStructure(structure) {
    structure.lookBoxes ||= structureBoxes(
      structure.type,
      structure.x,
      structure.y,
      structure.z,
      structure.rot,
    );
    const center = this.camera.position;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const pixelOffset = [center.x, center.y, center.z];
    const entry = [forward.x, forward.y, forward.z];
    let best = null;
    for (const box of structure.lookBoxes) {
      const min = [box.min[0] - CONSTRUCT_PAD_M, box.min[1], box.min[2] - CONSTRUCT_PAD_M];
      const max = [
        box.max[0] + CONSTRUCT_PAD_M,
        box.max[1] + CONSTRUCT_PAD_M,
        box.max[2] + CONSTRUCT_PAD_M,
      ];
      const hit = rayAABB(pixelOffset, entry, min, max, CONSTRUCT_REACH_M);
      if (hit && (best === null || hit.t < best)) {
        best = hit.t;
      }
    }
    return best;
  }

  facingVehicle(structure, definition) {
    const cos = Math.cos(structure.yaw);
    const sin = Math.sin(structure.yaw);
    const deltaX = this.ms.x - structure.x;
    const deltaZ = this.ms.z - structure.z;
    const localX = clamp(deltaX * cos - deltaZ * sin, -definition.wid / 2, definition.wid / 2);
    const localZ = clamp(deltaX * sin + deltaZ * cos, -definition.len / 2, definition.len / 2);
    const nearX = structure.x + localX * cos + localZ * sin;
    const nearZ = structure.z - localX * sin + localZ * cos;
    const toX = nearX - this.ms.x;
    const toZ = nearZ - this.ms.z;
    const distance = Math.hypot(toX, toZ);
    if (distance < VEHICLE_TOUCH_M) {
      return true;
    }
    const viewYaw = this.yaw + (this.fl?.y || 0);
    const alignment = (-Math.sin(viewYaw) * toX - Math.cos(viewYaw) * toZ) / distance;
    return alignment > Math.cos(VEHICLE_FACING_RAD);
  }

  closeUi(silent = false) {
    if (this.uiOpen === 'map') {
      this.mapOpen = false;
      this.store.set({ bigMap: false });
    }
    this.uiOpen = null;
    this.store.set({ milUi: null });
    if (this.alive && !this.downed && !silent) {
      this.lock();
    }
  }

  scanInteract() {
    this.interact = null;
    if (!this.alive || this.downed || !this.world) {
      return;
    }
    const currentState = this.ms;
    const now = this.team;
    if (this.myVeh) {
      const vehicle = this.veh.get(this.myVeh.id);
      if (!vehicle) {
        return;
      }
      const definition = VEHICLES[vehicle.st.type];
      const door = hasDoor(vehicle.st.type, this.myVeh.seat);
      const open = door && ((vehicle.st.doors || 0) >> this.myVeh.seat) & 1;
      const lines = [
        door && !open ? '[F] Open door' : door ? '[F] Exit  [Hold F] Close door' : '[F] Exit',
        '[F F] Eject',
        `[1-${definition.seats}] Seat`,
        `[H] ${this.tp ? '1st' : '3rd'} person`,
      ];
      const gun = VEH_GUNS[vehicle.st.type];
      const needAmmo = gun && (vehicle.st.gun < gun.mag || vehicle.st.gunSpare < gun.spare);
      if (this.gunnerOn) {
        const rearm =
          Math.abs(vehicle.st.v || 0) < 1.5 &&
          needAmmo &&
          this.areaAt(vehicle.st.x, vehicle.st.z, true);
        const loading =
          (this.gunMag?.n ?? 1) <= 0 ||
          (gun.interval > 1 && performance.now() / 1000 < this.nextFire);
        const coax = this.coaxOn && gun.coax;
        lines.unshift(
          `${coax ? gun.coax.name : gun.name}: ${coax ? (this.coaxMag?.n ?? gun.coax.mag) : (this.gunMag?.n ?? vehicle.st.gun ?? 0)} / ${coax ? '∞' : (vehicle.st.gunSpare ?? 0)}${loading && !coax ? ' · loading…' : ''}${rearm ? ' · rearming at base' : ''}   [Mouse] Turret  [LMB] Fire  [Hold RMB] Optics${gun.coax ? '  [X] Cannon / MG' : ''}`,
        );
      } else if (
        gun &&
        Math.abs(vehicle.st.v || 0) < 1.5 &&
        needAmmo &&
        this.areaAt(vehicle.st.x, vehicle.st.z, true)
      ) {
        lines.unshift('Rearming…');
      }
      if (this.commander) {
        lines.unshift('Commander · [Hold RMB] Periscope');
      }
      if (vehicle.st.flipped) {
        lines.unshift('Vehicle rolled over. An engineer can flip it.');
      }
      if (this.myVeh.seat === 0 && definition.kind === 'car') {
        lines.push('[W/S] Drive', '[A/D] Steer', '[Shift] Boost', '[Space] Handbrake');
      }
      if (this.myVeh.seat === 0 && definition.kind === 'heli') {
        lines.push(
          '[Shift / C] Up / down (holds altitude when released)',
          '[Mouse] or [Q / E] Turn',
          '[W A S D] Fly',
        );
      }
      this.interact = { text: lines.join('   ') };
      return;
    }
    if (this.mount) {
      this.interact = {
        text:
          this.mount.kind === 'mg'
            ? `[E] Leave MG   [R] Reload (${MIL.mgBeltCost} supply)`
            : '[E] Leave mortar',
      };
      return;
    }
    let best = null;
    const consider = (entry, pixelOffset) => {
      if (!best || entry < best.d) {
        best = { d: entry, ...pixelOffset };
      }
    };
    const medic = this.kit.cls === 'medic' && this.inv.items.medkit > 0;
    const eng = this.inv.items.shovel > 0;
    for (const remotePlayer of this.remotes.values()) {
      const structure = remotePlayer.st;
      if (!structure || structure.tm !== now || !structure.a) {
        continue;
      }
      const entry = Math.hypot(structure.x - currentState.x, structure.z - currentState.z);
      if (entry > 2.6) {
        continue;
      }
      const flags = structure.xm?.[4] || 0;
      if (structure.xm?.[1]) {
        continue;
      }
      if (flags & 4) {
        const state = `${structure.n} · DOWNED`;
        if (this.dragging === structure.i) {
          consider(-1, {
            kind: 'drag',
            id: structure.i,
            text: `Dragging ${structure.n}   [F] Let go`,
          });
        } else if (!medic) {
          consider(entry - 1, {
            kind: 'none',
            id: structure.i,
            alt: 'drag',
            text: `${structure.n} · DOWNED · only a medic can revive   [F] Drag`,
          });
        } else {
          consider(entry - 1, {
            kind: 'revive',
            id: structure.i,
            hold: true,
            alt: 'drag',
            text: `${state}   [Hold E] Revive   [F] Drag`,
          });
        }
      } else if (flags & (256 | 512)) {
        const bleeding = !!(flags & 256);
        const label = `${structure.n} · ${bleeding ? 'BLEEDING' : ''}${bleeding && flags & 512 ? ' · ' : ''}${flags & 512 ? 'WOUNDED' : ''}`;
        if (bleeding && this.inv.items.bandage > 0) {
          consider(entry - 0.5, {
            kind: 'bandage',
            id: structure.i,
            hold: true,
            text: `${label}   [Hold E] Bandage${medic ? '   · Medical kit: hold fire' : ''}`,
          });
        } else if (medic) {
          consider(entry - 0.5, {
            kind: 'none',
            id: structure.i,
            text: `${label}   · Medical kit: hold fire`,
          });
        }
      }
    }
    for (const vehicle of this.veh.values()) {
      if (!vehicle.st.alive) {
        continue;
      }
      const definition = VEHICLES[vehicle.st.type];
      const entry = Math.hypot(vehicle.st.x - currentState.x, vehicle.st.z - currentState.z);
      if (entry > definition.len / 2 + 3 || Math.abs(vehicle.st.y - currentState.y) > 4) {
        continue;
      }
      if (!this.facingVehicle(vehicle.st, definition)) {
        continue;
      }
      for (const remotePlayer of this.remotes.values()) {
        const quaternion = remotePlayer.st;
        if (
          quaternion &&
          quaternion.a &&
          quaternion.tm === now &&
          quaternion.xm?.[1] === vehicle.st.id &&
          quaternion.xm[4] & 4
        ) {
          consider(entry - definition.len / 2 - 0.5, {
            kind: 'pullout',
            id: quaternion.i,
            text: `[E] Pull ${quaternion.n} out`,
          });
        }
      }
      if (eng && vehicle.st.hp < definition.hp && vehicle.st.team === now) {
        const fast = !!this.areaAt(vehicle.st.x, vehicle.st.z, true);
        consider(entry - definition.len / 2 + 0.3, {
          kind: 'repair',
          id: vehicle.st.id,
          hold: true,
          text: `[Hold F / torch click] Weld ${definition.name} (${Math.round((vehicle.st.hp / definition.hp) * 100)}%)${fast ? ' · Fast (friendly base)' : ''}`,
        });
      }
      {
        let bestSeat = -1;
        let bestDistance = Infinity;
        const occ = new Set();
        for (const remotePlayer of this.remotes.values()) {
          if (remotePlayer.st?.a && remotePlayer.st.xm?.[1] === vehicle.st.id) {
            occ.add(remotePlayer.st.xm[2] || 0);
          }
        }
        (SEATS[vehicle.st.type] || []).forEach((_, index) => {
          if (occ.has(index)) {
            return;
          }
          if (index === 0 && vehicle.st.driver) {
            return;
          }
          const weapon = seatWorld(vehicle.st, index);
          const distance = Math.hypot(weapon[0] - currentState.x, weapon[2] - currentState.z);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestSeat = index;
          }
        });
        const seatName = (index) => seatRole(vehicle.st.type, index);
        const door = bestSeat >= 0 && hasDoor(vehicle.st.type, bestSeat);
        const open = door && ((vehicle.st.doors || 0) >> bestSeat) & 1;
        if (door && !open) {
          consider(entry - definition.len / 2, {
            kind: 'vdoor',
            id: vehicle.st.id,
            s: bestSeat,
            text: `${definition.name} · ${seatName(bestSeat)}:   [E] Open door`,
          });
        } else {
          consider(entry - definition.len / 2, {
            kind: 'veh',
            id: vehicle.st.id,
            s: bestSeat >= 0 ? bestSeat : undefined,
            alt: door,
            text:
              bestSeat < 0
                ? `${definition.name} is full`
                : `${definition.name} · ${seatName(bestSeat)}:   [E] Get in${door ? '   [F] Close door' : ''}`,
          });
        }
      }
    }
    for (const entry of this.doors?.values() || []) {
      const box = entry.dr.box;
      const centerX = (box.min[0] + box.max[0]) / 2;
      const centerZ = (box.min[2] + box.max[2]) / 2;
      const distance = Math.hypot(centerX - currentState.x, centerZ - currentState.z);
      if (distance < 2.2 && Math.abs(entry.dr.y0 - currentState.y) < 2) {
        consider(distance - 0.2, {
          kind: 'mapdoor',
          id: entry.dr.id,
          text: entry.open ? '[E] Close door' : '[E] Open door',
        });
      }
    }
    this.interact = best;
  }

  doInteract(alt = false) {
    const item = this.interact;
    if (alt && this.dragging) {
      return this.net.send({ t: 'drag', on: 0 });
    }
    if (alt && item?.alt === 'drag') {
      return this.net.send({ t: 'drag', on: 1, id: item.id });
    }
    if (item?.kind === 'pullout') {
      return this.net.send({ t: 'pullout', id: item.id });
    }
    if (item?.kind === 'mapdoor') {
      return this.net.send({ t: 'door', id: item.id });
    }
    if (item?.kind === 'none') {
      return;
    }
    if (!item || item.hold || item.kind === 'revive') {
      return;
    }
    if (alt && (item.kind === 'veh' || item.kind === 'vdoor')) {
      if (item.alt) {
        this.net.send({ t: 'vdoor', id: item.id, s: item.s, open: 0 });
        this.audio.door(false, true);
      }
      return;
    }
    if (item.kind === 'veh') {
      this.net.send({ t: 'venter', id: item.id, s: item.s });
    } else if (item.kind === 'vdoor') {
      this.net.send({ t: 'vdoor', id: item.id, s: item.s, open: 1 });
      this.audio.door(true, true);
    }
  }

  updateHoldAct(now) {
    const item = this.interact;
    const holding =
      this.locked &&
      (this.keys.has('KeyE') ||
        (item?.kind === 'repair' &&
          (this.keys.has('KeyF') || (this.cur === IDX.shovel && this.mouse.l))) ||
        (item?.kind === 'construct' && this.cur === IDX.shovel && this.mouse.l)) &&
      item?.hold;
    if (!holding) {
      if (this.holdAct?.kind === 'revive') {
        this.net.send({ t: 'revive', on: 0 });
      }
      if (this.holdAct?.kind === 'bandage' && !this.holdAct.done) {
        this.net.send({ t: 'item', k: 'bandage', on: 0 });
      }
      this.holdAct = null;
      return;
    }
    if (!this.holdAct || this.holdAct.id !== item.id || this.holdAct.kind !== item.kind) {
      if (this.holdAct?.kind === 'revive') {
        this.net.send({ t: 'revive', on: 0 });
      }
      const medic = this.kit.cls === 'medic' && this.inv.items.medkit > 0;
      this.holdAct = {
        kind: item.kind,
        id: item.id,
        t0: now,
        last: 0,
        dur:
          item.kind === 'bandage'
            ? 4
            : item.kind === 'revive'
              ? (medic ? MIL.reviveMs : MIL.reviveMsBasic) / 1000
              : 0,
      };
      if (item.kind === 'revive') {
        this.net.send({ t: 'revive', on: 1, id: item.id });
      }
      if (item.kind === 'bandage') {
        this.net.send({ t: 'item', k: 'bandage', on: 1, tg: item.id });
      }
    }
    if (item.kind === 'construct' && now - this.holdAct.last > 0.5) {
      this.holdAct.last = now;
      this.net.send({ t: 'construct', id: item.id });
    }
    if (item.kind === 'bandage' && !this.holdAct.done && now - this.holdAct.t0 >= 4) {
      this.holdAct.done = true;
      this.net.send({ t: 'item', k: 'bandage', on: 0, done: 1 });
      this.audio.pickup();
    }
    if (item.kind === 'repair' && now - this.holdAct.last > 1) {
      this.holdAct.last = now;
      this.net.send({ t: 'use', k: 'repair', id: item.id });
    }
  }

  startUse(weapon, now) {
    if (this.using) {
      return;
    }
    const id = weapon.id;
    if (!(this.inv.items[id] > 0)) {
      return;
    }
    let target = this.myId;
    if (id === 'medkit') {
      for (const remotePlayer of this.remotes.values()) {
        const structure = remotePlayer.st;
        if (
          !structure ||
          structure.tm !== this.team ||
          !structure.a ||
          (structure.xm && structure.xm[4] & 4) ||
          structure.hp >= 100
        ) {
          continue;
        }
        if (Math.hypot(structure.x - this.ms.x, structure.z - this.ms.z) < 2.5) {
          target = structure.i;
        }
      }
    }
    this.using = { id, t0: now, dur: weapon.use, target, done: false };
    this.net.send({ t: 'item', k: id, on: 1, tg: target });
  }

  cancelUse() {
    if (!this.using) {
      return;
    }
    this.net.send({ t: 'item', k: this.using.id, on: 0 });
    this.using = null;
  }

  updateUse(now) {
    const useState = this.using;
    if (!useState) {
      return;
    }
    if (this.ms.sprinting || !this.alive || this.downed || MW[this.cur]?.id !== useState.id) {
      return this.cancelUse();
    }
    if (now - useState.t0 >= useState.dur && !useState.done) {
      useState.done = true;
      this.net.send({ t: 'item', k: useState.id, on: 0, done: 1 });
      this.audio.pickup();
      this.using = null;
    }
  }

  getInput() {
    const kit = this.keys;
    const live =
      this.locked &&
      this.alive &&
      !this.downed &&
      !this.chatting &&
      !this.uiOpen &&
      !this.myVeh &&
      !this.mount;
    const ads = this.adsOn && this.canAds();
    const roll = this.rollReq || 0;
    this.rollReq = 0;
    return {
      fwd: live ? (kit.has('KeyW') ? 1 : 0) - (kit.has('KeyS') ? 1 : 0) : 0,
      right: live ? (kit.has('KeyD') ? 1 : 0) - (kit.has('KeyA') ? 1 : 0) : 0,
      jump: live && kit.has('Space') && this.stance === 'stand',
      jumpPress: false,
      walk: live && this.pace > 0,
      pace: live ? this.pace : 0,
      sprint:
        live &&
        (kit.has('ShiftLeft') || kit.has('ShiftRight')) &&
        !ads &&
        !this.binos &&
        !this.using &&
        !this.dragging,
      legWound: this.wounds.legs || 0,
      crouch: this.stance === 'crouch' || this.mount?.kind === 'mortar',
      prone: this.stance === 'prone' || this.downed || this.knocked(),
      roll: live ? roll : 0,
      yaw: Math.round(this.yaw * 100000) / 100000,
      ads,
      holdBreath: live && ads && (kit.has('ShiftLeft') || kit.has('ShiftRight')) && this.breath > 0,
      aim: ads ? 1 : this.readyT > 0.6 ? 2 : 0,
      speedMult: milSpeedMult(
        (MW[this.cur]?.moveMult ?? 1) * this.fxOf(MW[this.cur]).move,
        ads ? 1 : this.readyT > 0.6 ? 2 : 0,
        this.uiFlags(),
        MW[this.cur]?.slot === 'secondary',
        !!this.dragging,
      ),
    };
  }

  uiFlags() {
    return (
      (this.mapOpen ? UIF.map : 0) |
      (this.binos && this.binosT > 0.5 ? UIF.binos : 0) |
      (this.light ? UIF.light : 0) |
      (this.nvg ? UIF.nvg : 0) |
      (this.using ? UIF.using : 0)
    );
  }

  knocked() {
    return (this.knockUntil || 0) > performance.now();
  }

  canAds() {
    const weapon = MW[this.cur];
    return (
      this.alive &&
      !this.downed &&
      !this.dragging &&
      !this.reloading &&
      this.needsRaise(weapon) &&
      !this.ms.sprinting &&
      !this.binos &&
      !this.myVeh &&
      this.raise > 0.4
    );
  }

  fixedUpdate(deltaTime) {
    const state = this.ms;
    state.px = state.x;
    state.py = state.y;
    state.pz = state.z;
    if (!this.joined || !this.alive || !this.world) {
      return;
    }
    if (this.myVeh) {
      this.stepMyVehicle(deltaTime);
      restSeated(state, deltaTime, this.kg);
      return;
    }
    const input = this.getInput();
    const prevG = state.onGround;
    stepMil(state, input, deltaTime, this.world, {
      weight: this.kg,
      frozen: !!this.mount || this.downed || this.mapOpen || this.knocked(),
    });
    if (this.stance === 'prone' && !state.prone && !this.downed) {
      this.stance = state.crouch ? 'crouch' : 'stand';
    }
    const seq = ++this.seq;
    this.pending.push({ seq, inp: input });
    if (this.pending.length > 240) {
      this.pending.shift();
    }
    this.outbox.push([
      seq,
      input.fwd,
      input.right,
      input.jump ? 1 : 0,
      0,
      input.pace,
      input.crouch ? 1 : 0,
      input.yaw,
      Math.round((this.pitch + this.rec.p) * 1000) / 1000,
      input.aim,
      input.sprint ? 1 : 0,
      Math.round(this.lean * 100),
      input.holdBreath ? 1 : 0,
      input.prone ? 1 : 0,
      input.roll,
      this.uiFlags(),
    ]);
    const speed = Math.hypot(state.vx, state.vz);
    this.speedH = speed;
    if (state.onGround && speed > 1.2) {
      this.stepDist += speed * deltaTime;
      if (this.stepDist > (state.sprinting ? 2.0 : 1.7)) {
        this.stepDist = 0;
        this.audio.stepSurf(
          this.stepSurface(state.x, state.y, state.z),
          state.crouch || state.prone ? 0.08 : state.sprinting ? 0.3 : 0.18,
        );
      }
    }
    if (state.justLanded && state.landSpeed > 4 && !prevG) {
      this.audio.land();
    }
  }

  onAck(message) {
    if (!this.alive || message.sp !== this.spawnCount || this.myVeh || !this.world) {
      return;
    }
    this.pending = this.pending.filter((center) => center.seq > message.s);
    const state = this.ms;
    const beforeX = state.x;
    const beforeY = state.y;
    const beforeZ = state.z;
    const vehicle = message.ms;
    Object.assign(state, {
      x: vehicle[0],
      y: vehicle[1],
      z: vehicle[2],
      vx: vehicle[3],
      vy: vehicle[4],
      vz: vehicle[5],
      onGround: !!vehicle[6],
      crouch: !!vehicle[7],
      jumpHeld: !!vehicle[8],
      st: vehicle[9],
      groundTime: vehicle[10],
      prone: !!vehicle[11],
      rollT: vehicle[12] || 0,
      rollDir: vehicle[13] || 0,
      slideT: vehicle[14] || 0,
    });
    for (const center of this.pending) {
      stepMil(state, center.inp, FIXED_DT, this.world, {
        weight: this.kg,
        frozen: !!this.mount || this.downed || this.mapOpen || this.knocked(),
      });
    }
    const deltaX = state.x - beforeX;
    const deltaY = state.y - beforeY;
    const deltaZ = state.z - beforeZ;
    state.px += deltaX;
    state.py += deltaY;
    state.pz += deltaZ;
    if (deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ > 9) {
      this.corr.set(0, 0, 0);
    } else {
      this.corr.sub(new THREE.Vector3(deltaX, deltaY, deltaZ));
    }
  }

  selectLocal(index) {
    const now = performance.now() / 1000;
    this.cur = index;
    this.reloading = false;
    this.viewmodel.setWeapon(index);
    this.readyAt = now + (MW[index]?.drawTime || 0.5) * (MW[index]?.slot === 'secondary' ? 0.7 : 1);
    this.drawStart = now;
  }

  switchTo(index) {
    this.primeStart = 0;
    this.nadeSt = null;
    this.viewmodel.nadeAnim = null;
    if (this.spinStart) {
      this.spinStart = 0;
      this.net.send({ t: 'spin', on: 0 });
    }
    if (this.using) {
      this.cancelUse();
    }
    if (!this.alive || index === this.cur || !MW[index] || index < 0) {
      return;
    }
    this.lastWeapon = this.cur;
    this.adsOn = false;
    this.scope = 0;
    this.spray = 0;
    this.selectLocal(index);
    this.readyAt = performance.now() / 1000 + MW[index].drawTime * 1.2;
    this.audio.draw();
    this.net.send({ t: 'switch', w: index });
  }

  startReload() {
    const index = this.cur;
    const weapon = MW[index];
    const current = this.mount ? this.inv.loaded[IDX.mg] : this.inv.loaded[index];
    const now = performance.now() / 1000;
    if (
      !this.alive ||
      this.downed ||
      this.reloading ||
      !current ||
      weapon.melee ||
      weapon.grenade ||
      weapon.item ||
      now < this.readyAt
    ) {
      return;
    }
    if (!this.mount) {
      const has = weapon.rocket
        ? this.inv.items.rocket > 0 && current.n === 0
        : this.magsFor(index).some((message) => message.n > 0);
      if (!has) {
        this.toast(
          weapon.rocket ? 'No rockets left.' : 'No spare magazines for this weapon.',
          'warn',
          1800,
        );
        return;
      }
    }
    this.reloading = true;
    this.pendingInv = null;
    this.viewmodel.stopInspect();
    this.reloadStart = now;
    this.reloadEnd = now + weapon.reloadTime * 0.8 * this.fxOf(weapon).reload;
    this.adsOn = false;
    this.audio.reloadWeapon(weapon.class);
    this.net.send({ t: 'reload' });
  }

  localReload(index) {
    const weapon = MW[index];
    const current = this.inv.loaded[index];
    if (!current) {
      return;
    }
    if (weapon.rocket) {
      if (this.inv.items.rocket > 0) {
        this.inv.items.rocket--;
        current.n = 1;
      }
      return;
    }
    const caliber = caliberOf(weapon.id);
    let best = -1;
    this.inv.mags.forEach((message, kit) => {
      if (
        message.cal === caliber &&
        message.n > 0 &&
        (best < 0 || message.n > this.inv.mags[best].n)
      ) {
        best = kit;
      }
    });
    if (best < 0) {
      return;
    }
    const next = this.inv.mags.splice(best, 1)[0];
    if (current.n > 0) {
      this.inv.mags.push({ cal: caliber, n: current.n, size: current.size, ammo: current.ammo });
    }
    this.inv.loaded[index] = { n: next.n, size: next.size, ammo: next.ammo };
  }

  updateWeaponMil(deltaTime, now) {
    const weapon = MW[this.cur];
    const weaponIndex = this.mount ? IDX.mg : this.cur;
    const magnitude = this.inv.loaded[weaponIndex] || { n: 0 };
    if (this.reloading && now >= this.reloadEnd) {
      this.reloading = false;
      if (this.pendingInv) {
        this.applyInv(this.pendingInv);
        this.pendingInv = null;
      } else if (!this.mount) {
        this.localReload(this.cur);
      }
      this.audio.reloadEnd();
    }
    this.inacc = Math.max(0, this.inacc - (weapon.inaccDecay || 0.05) * deltaTime);
    const live =
      this.locked &&
      this.alive &&
      !this.downed &&
      !this.dragging &&
      this.joined &&
      !this.chatting &&
      !this.uiOpen &&
      !this.myVeh &&
      !this.binos &&
      this.mount?.kind !== 'mortar';
    if (weapon.grenade) {
      const fake = { mag: this.inv.items[weapon.id === 'he' ? 'he' : 'smoke'] || 0 };
      return this.updateNade(live && !this.ms.sprinting, weapon, fake, now);
    }
    if (weapon.gadget) {
      if (!this.mouse.l) {
        this.gadgetHeld = false;
      } else if (live && !this.gadgetHeld && now >= this.readyAt && now >= (this.gadgetAt || 0)) {
        this.gadgetHeld = true;
        this.gadgetAt = now + 1.6;
        const entry = this.camera.getWorldDirection(new THREE.Vector3());
        this.net.send({ t: 'gadget', k: weapon.id, d: [entry.x, entry.y, entry.z] });
        this.viewmodel.fire?.(false);
        this.audio.thunk();
      }
      return;
    }
    if (weapon.item) {
      if (live && this.mouse.l && !this.using && now >= this.readyAt) {
        this.startUse(weapon, now);
      }
      this.updateUse(now);
      return;
    }
    if (!live || (this.ms.sprinting && !this.mount) || this.raise < 0.8) {
      if (this.spinStart) {
        this.spinGate(weapon, false, now);
      }
      return;
    }
    if (weapon.melee) {
      if (weapon.id === 'shovel' && this.interact?.kind === 'construct') {
        if (this.mouse.l && now >= this.nextFire) {
          this.nextFire = now + 0.65;
          this.viewmodel.fire(false);
          this.audio.dig();
        }
        this.fireQueued = 0;
        return;
      }
      if (this.fireQueued > now && now >= this.nextFire && now >= this.readyAt) {
        this.stab(weapon, now);
      }
      return;
    }
    if (this.knocked() || (!this.mount && (this.readyT < 0.9 || this.obstruct > 0.6))) {
      return;
    }
    const mode = this.mount ? fireModes(weapon)[0] : this.modeOf(weapon);
    let want = mode === 'AUTO' ? this.mouse.l || this.fireQueued > now : this.fireQueued > now;
    if (weapon.spinUp) {
      want = this.spinGate(weapon, want, now);
    }
    if (want && now >= this.nextFire && now >= this.readyAt && !this.reloading) {
      if (magnitude.n > 0) {
        this.fire(MW[weaponIndex], magnitude, now);
      } else {
        this.fireQueued = 0;
        this.nextFire = now + 0.3;
        this.audio.dry();
      }
    }
  }

  shotSoundId(weapon) {
    if (this.gunnerOn) {
      const type = this.veh.get(this.myVeh?.id)?.st.type;
      return type === 'gunship' ? 'minigun' : 'hmg';
    }
    if (this.mount) {
      return 'hmg';
    }
    return weapon.id;
  }

  stepSurface(positionX, positionY, positionZ) {
    if (waterAt(positionX, positionY, positionZ) > 0.1) {
      return 'water';
    }
    if (positionY > heightAt(positionX, positionZ) + 0.25) {
      return 'wood';
    }
    const surface = surfaceAt(positionX, positionZ);
    if (surface === SURF.asphalt) {
      return 'asphalt';
    }
    if (surface === SURF.concrete || surface === SURF.rock) {
      return 'concrete';
    }
    if (surface === SURF.grass || surface === SURF.field || surface === SURF.forest) {
      return 'grass';
    }
    return 'dirt';
  }

  spreadFor(weapon, aimed = this.ads > 0.6) {
    const center = milClass(weapon);
    const moving = Math.min(1, Math.hypot(this.ms.vx, this.ms.vz) / 5);
    const prone = this.ms.prone;
    const bipod = prone && this.kit.primary?.grip === 'bipod' && weapon.slot === 'primary';
    const stance = prone ? 0.5 : this.ms.crouch ? 0.7 : 1;
    const forwardX = this.fxOf(weapon);
    let spread =
      (center.moa * (1 + moving * 5) * stance * (bipod ? 0.7 : 1) + this.inacc * 0.4) *
      forwardX.spread;
    spread += (1 - this.raise) * 0.03;
    if (!aimed) {
      spread += center.hip * (0.55 + moving * 0.9) * stance * forwardX.hip;
    }
    if (this.rested) {
      spread *= 0.8;
    }
    if (!this.ms.onGround) {
      spread += 0.05;
    }
    return spread;
  }

  fire(weapon, magnitude, now) {
    magnitude.n--;
    this.nextFire = now + weapon.interval;
    this.fireQueued = 0;
    this.lastShot = now;
    const center = milClass(weapon);
    const ammo = AMMO[magnitude.ammo] || AMMO.fmj;
    const cam = this.camera;
    const aimed = !!this.mount || !!this.gunnerOn || this.ads > 0.6;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    if (!this.gunnerOn && (Math.abs(this.fl.y) > 0.01 || Math.abs(this.fl.p) > 0.01)) {
      forward.set(
        -Math.sin(this.yaw + this.rec.y) * Math.cos(this.pitch + this.rec.p),
        Math.sin(this.pitch + this.rec.p),
        -Math.cos(this.yaw + this.rec.y) * Math.cos(this.pitch + this.rec.p),
      );
    }
    const zeroRange = aimed ? this.zeroRange(weapon) : null;
    if (zeroRange && center.v) {
      const zeroElevation = zeroAngle(center.v * (ammo.v || 1), center.k, zeroRange, 0);
      const pitch = Math.asin(clamp(forward.y, -1, 1)) + zeroElevation;
      const distance = Math.hypot(forward.x, forward.z) || 1;
      forward.set(
        (forward.x / distance) * Math.cos(pitch),
        Math.sin(pitch),
        (forward.z / distance) * Math.cos(pitch),
      );
    }
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const lift = new THREE.Vector3().crossVectors(right, forward).normalize();
    const prone = this.ms.prone;
    const bipod = prone && this.kit.primary?.grip === 'bipod' && weapon.slot === 'primary';
    let spread = this.spreadFor(weapon, aimed);
    if (this.mount) {
      spread = center.moa * 1.5;
    }
    let platform = null;
    if (this.gunnerOn) {
      const vehicleState = this.veh.get(this.myVeh?.id)?.st;
      platform = vehicleState ? platformVelocity(vehicleState.type, vehicleState) : null;
      const moving = platform ? Math.hypot(platform[0], platform[1], platform[2]) : 0;
      spread =
        ((this.coaxOn && this.gunDef.coax?.spread) ?? this.gunDef.spread ?? center.moa * 1.5) *
        (1 + Math.min(1.5, moving / 30));
    }
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * Math.tan(spread);
    const direction = forward
      .clone()
      .addScaledVector(right, Math.cos(angle) * radius)
      .addScaledVector(lift, Math.sin(angle) * radius)
      .normalize();
    const origin = cam.position.clone();
    const pixelOffset = [origin.x, origin.y, origin.z];
    const entry = [direction.x, direction.y, direction.z];
    const seed = Math.floor(Math.random() * 2 ** 31);
    if (weapon.rocket) {
      this.spawnRocket(pixelOffset, entry, this.myId);
    } else {
      const directions =
        weapon.pellets && !ammo.slug
          ? pelletDirs(entry, seed, weapon.pellets, weapon.pelletSpread * 1.1)
          : [entry];
      const gunnerViewmodel = this.gunnerOn && this.veh.get(this.myVeh?.id)?.vm;
      const mountGun =
        this.mount?.kind === 'mg' && this.structs.get(this.mount.id)?.mesh.userData.mg;
      const muzzle = gunnerViewmodel?.gunTip
        ? gunnerViewmodel.gunTip.getWorldPosition(new THREE.Vector3())
        : mountGun
          ? mountGun.userData.gun.localToWorld(new THREE.Vector3(0, 0.01, MG_MUZZLE_Z))
          : this.ads > 0.6
            ? origin.clone().addScaledVector(direction, 0.7).addScaledVector(lift, -0.06)
            : this.muzzleWorld();
      if (mountGun) {
        this.effects.flash(muzzle, 0.45);
      }
      this.shotCount = (this.shotCount || 0) + 1;
      const belt = caliberOf(weapon.id).includes('belt') || !!this.mount || !!this.gunnerOn;
      for (const distance of directions) {
        this.addBullet(
          pixelOffset,
          distance,
          center,
          weapon,
          true,
          !!ammo.tracer || (belt && this.shotCount % 3 === 0),
          ammo.v || 1,
          platform,
          [muzzle.x, muzzle.y, muzzle.z],
        );
      }
    }
    this.net.send({
      t: 'shoot',
      o: pixelOffset.map((vehicle) => Math.round(vehicle * 1000) / 1000),
      d: entry.map((vehicle) => Math.round(vehicle * 100000) / 100000),
      rt: this.net.serverNow() - INTERP_MS,
      w: this.mount || this.gunnerOn ? IDX.mg : this.cur,
      ...(this.gunnerOn && this.coaxOn ? { cx: 1 } : null),
      ...(weapon.pellets ? { sd: seed } : null),
    });
    const tired = 1 + (1 - this.ms.st) * 0.35;
    this.burstN =
      now - (this.lastBurstShot || 0) < (weapon.slot === 'secondary' ? 0.35 : 0.22)
        ? (this.burstN || 0) + 1
        : 0;
    this.lastBurstShot = now;
    const burst =
      1 + Math.min(0.8, (this.burstN || 0) * (weapon.slot === 'secondary' ? 0.15 : 0.06));
    const forwardX = this.fxOf(weapon);
    const grip = forwardX.recV;
    const kick =
      center.kick *
      (0.85 + Math.random() * 0.3) *
      (prone ? 0.6 : this.ms.crouch ? 0.8 : 1) *
      (bipod ? 0.5 : 1) *
      grip *
      (this.mount || this.gunnerOn ? 0.3 : 1) *
      (this.rested ? 0.6 : 1) *
      tired *
      (this.mount || this.gunnerOn ? 1 : burst) *
      (1 + (this.wounds.arms || 0) * 0.3);
    if (this.gunnerOn) {
      this.tCur.p = clamp(
        this.tCur.p + kick * 0.25 * DEGREES_TO_RADIANS,
        this.gunDef.pitch[0],
        this.gunDef.pitch[1],
      );
    }
    this.rec.p += kick * 0.7 * DEGREES_TO_RADIANS;
    this.pitch = clamp(
      this.pitch + kick * 0.3 * DEGREES_TO_RADIANS,
      -89 * DEGREES_TO_RADIANS,
      89 * DEGREES_TO_RADIANS,
    );
    this.rec.y +=
      (Math.random() - 0.5) *
      2 *
      center.side *
      DEGREES_TO_RADIANS *
      (this.mount ? 0.3 : 1) *
      forwardX.recH;
    this.inacc = Math.min(weapon.inaccMax || 0.02, this.inacc + (weapon.shotInacc || 0.004));
    this.kick = 1;
    this.viewmodel.fire();
    const quiet =
      isSilenced(weapon, weapon.slot === 'primary' ? this.kit.primary : null) || !!ammo.quiet;
    this.lastQuiet = quiet;
    if (quiet) {
      this.audio.shotSilenced(weapon.class);
    } else {
      this.audio.shot(this.shotSoundId(weapon));
    }
    if (this.indoor && !quiet) {
      this.audio.roomEcho(1);
    }
  }

  pixelAt(distance) {
    return (
      (distance * 2 * Math.tan((this.camera.fov * DEGREES_TO_RADIANS) / 2)) /
      Math.max(1, this.renderer.domElement.height)
    );
  }

  addBullet(
    pixelOffset,
    entry,
    center,
    weapon,
    local,
    tracer,
    velocityMultiplier = 1,
    platformVelocity = null,
    drawFrom = null,
  ) {
    const muzzleVelocity = center.v * velocityMultiplier;
    const box = {
      p: [...pixelOffset],
      v: [
        entry[0] * muzzleVelocity + (platformVelocity?.[0] || 0),
        entry[1] * muzzleVelocity + (platformVelocity?.[1] || 0),
        entry[2] * muzzleVelocity + (platformVelocity?.[2] || 0),
      ],
      k: center.k,
      t: 0,
      local,
      tracer,
      cracked: local,
      mesh: null,
      halo: null,
      drawOffset: drawFrom
        ? [drawFrom[0] - pixelOffset[0], drawFrom[1] - pixelOffset[1], drawFrom[2] - pixelOffset[2]]
        : null,
    };
    const cam = this.camera.position;
    if (tracer || local || Math.hypot(pixelOffset[0] - cam.x, pixelOffset[2] - cam.z) < 150) {
      box.mesh = new THREE.Mesh(TRAIL_GEO, tracer ? TRAIL_MAT : local ? OWN_MAT : STREAK2_MAT);
      box.mesh.matrixAutoUpdate = false;
      box.mesh.frustumCulled = false;
      box.o = [...pixelOffset];
      this.scene.add(box.mesh);
      if (tracer) {
        box.halo = new THREE.Sprite(GLOW_MAT);
        this.scene.add(box.halo);
      }
    }
    this.bulletsFx.push(box);
    if (this.bulletsFx.length > 260) {
      this.killBullet(this.bulletsFx.shift());
    }
  }

  killBullet(box) {
    if (box.mesh) {
      this.scene.remove(box.mesh);
    }
    if (box.halo) {
      this.scene.remove(box.halo);
    }
    box.mesh = box.halo = null;
  }

  updateBulletsFx(deltaTime) {
    const cam = this.camera.position;
    const steps = Math.max(1, Math.round(deltaTime / BULLET_DT));
    this.bulletsFx = this.bulletsFx.filter((box) => {
      for (let state = 0; state < steps; state++) {
        const amount = [box.p[0], box.p[1], box.p[2]];
        stepBullet(box, deltaTime / steps);
        const seg = [box.p[0] - amount[0], box.p[1] - amount[1], box.p[2] - amount[2]];
        const length = Math.hypot(seg[0], seg[1], seg[2]);
        const entry = [seg[0] / length, seg[1] / length, seg[2] / length];
        if (!box.cracked) {
          const release = [cam.x - amount[0], cam.y - amount[1], cam.z - amount[2]];
          const kit = clamp(
            release[0] * entry[0] + release[1] * entry[1] + release[2] * entry[2],
            0,
            length,
          );
          const centerX = amount[0] + entry[0] * kit;
          const currentY = amount[1] + entry[1] * kit;
          const centerZ = amount[2] + entry[2] * kit;
          if (
            Math.hypot(cam.x - centerX, cam.y - currentY, cam.z - centerZ) < 6 &&
            kit > 0 &&
            kit < length
          ) {
            box.cracked = true;
            this.audio.crack([centerX, currentY, centerZ]);
            this.suppress = Math.min(1, (this.suppress || 0) + 0.35);
          }
        }
        const hit = rayWorld(this.world, amount, entry, length, { pen: 0.6 });
        if (hit) {
          const impactDistance = Math.hypot(hit.point[0] - cam.x, hit.point[2] - cam.z);
          if (impactDistance < 300) {
            this.effects.impact(new THREE.Vector3(...hit.point), hit.normal, 'w');
          }
          if (impactDistance < DECAL_RANGE_M) {
            this.decals.add(hit);
          }
          if (impactDistance < 900) {
            this.hitDust(hit, impactDistance);
          }
          if (ricochet(box, entry, hit)) {
            if (impactDistance < 60) {
              this.audio._noise?.({ dur: 0.18, freq: 2600, type: 'bandpass', q: 3, gain: 0.12 });
            }
            continue;
          }
          this.killBullet(box);
          return false;
        }
        if (box.t > MIL.maxBulletTime) {
          this.killBullet(box);
          return false;
        }
      }
      if (box.mesh) {
        const supplyPoint = Math.hypot(box.v[0], box.v[1], box.v[2]);
        const distance = Math.hypot(box.p[0] - cam.x, box.p[1] - cam.y, box.p[2] - cam.z);
        if (!box.tracer && !box.local && distance > 150) {
          this.killBullet(box);
          return true;
        }
        const flown = Math.hypot(box.p[0] - box.o[0], box.p[1] - box.o[1], box.p[2] - box.o[2]);
        const tracerLength = Math.max(
          0.2,
          Math.min(supplyPoint * (box.tracer ? 0.045 : 0.02), box.tracer ? 40 : 12, flown),
        );
        const pixelSize =
          (distance * 2 * Math.tan((this.camera.fov * DEGREES_TO_RADIANS) / 2)) /
          Math.max(1, this.renderer.domElement.height);
        const tracerWidth = box.tracer
          ? Math.max(0.025, pixelSize * 3.5)
          : box.local
            ? Math.max(0.006, pixelSize * 1.8)
            : Math.max(0.008, pixelSize * 1.2);
        trailZ.set(box.v[0] / supplyPoint, box.v[1] / supplyPoint, box.v[2] / supplyPoint);
        trailY.set(cam.x - box.p[0], cam.y - box.p[1], cam.z - box.p[2]);
        trailX.crossVectors(trailY, trailZ);
        if (trailX.lengthSq() < 1e-8) {
          trailX.set(1, 0, 0);
        }
        trailX.normalize().multiplyScalar(tracerWidth);
        trailY.crossVectors(trailZ, trailX).normalize();
        trailZ.multiplyScalar(tracerLength);
        const fade = box.drawOffset ? Math.max(0, 1 - flown / TRAIL_CONVERGE_M) : 0;
        const rotationX = box.p[0] + (box.drawOffset?.[0] || 0) * fade;
        const rotationY = box.p[1] + (box.drawOffset?.[1] || 0) * fade;
        const rotationZ = box.p[2] + (box.drawOffset?.[2] || 0) * fade;
        trailM.makeBasis(trailX, trailY, trailZ).setPosition(rotationX, rotationY, rotationZ);
        box.mesh.matrix.copy(trailM);
        box.mesh.matrixWorldNeedsUpdate = true;
        if (box.halo) {
          box.halo.position.set(rotationX, rotationY, rotationZ);
          box.halo.scale.setScalar(Math.max(0.12, pixelSize * 9));
        }
      }
      return true;
    });
  }

  hitDust(hit, distance) {
    const position = hit.point;
    const normal = hit.normal || [0, 1, 0];
    let color = 0x5e4a33;
    let water = false;
    if (hit.terrain) {
      const surface = surfaceAt(position[0], position[2]);
      if (waterDepth(position[0], position[2]) > 0.05 || surface === SURF.water) {
        color = 0xdfe7ea;
        water = true;
      } else if (surface === SURF.asphalt || surface === SURF.concrete) {
        color = 0x3d3a36;
      } else if (surface === SURF.sand) {
        color = 0x9c865c;
      } else if (surface === SURF.grass || surface === SURF.field || surface === SURF.forest) {
        color = 0x4f4630;
      } else if (surface === SURF.rock) {
        color = 0x55524c;
      }
    } else {
      color =
        hit.mat === 'wood' || hit.mat === 'plank' || hit.mat === 'crate' ? 0x5a3f24 : 0x46433e;
    }
    const pixelSize = this.pixelAt(distance);
    const startSize = clamp(pixelSize * 10, 0.18, 6);
    const lift = water ? 1.6 : 1;
    const forwardX = this.gfx?.particles ?? 1;
    const nPuff = forwardX < 0.6 ? 2 : 3;
    for (let kit = 0; kit < nPuff; kit++) {
      const supplyPoint = this.puffSprite('dust');
      supplyPoint.material.color.setHex(color);
      supplyPoint.material.opacity = 0.95;
      supplyPoint.position.set(
        position[0] + normal[0] * 0.15,
        position[1] + normal[1] * 0.15 + kit * startSize * 0.35 * lift,
        position[2] + normal[2] * 0.15,
      );
      supplyPoint.scale.setScalar(startSize * (1 - kit * 0.2));
      this.puffs.push({
        sp: supplyPoint,
        t: -kit * 0.04,
        s0: startSize * (1 - kit * 0.2),
        life: 1.6 + kit * 0.3,
        grow: 1.8,
        rise: (0.6 + kit * 0.5) * lift,
        op: 0.9,
      });
    }
    while (this.puffs.length > 180 * forwardX) {
      this.removePuff(this.puffs.shift());
    }
    if (distance < 50) {
      const kind = water
        ? 'water'
        : hit.terrain
          ? color === 0x3d3a36 || color === 0x55524c
            ? 'concrete'
            : 'dirt'
          : [
                'metal',
                'metalroof',
                'containerR',
                'containerG',
                'containerB',
                'containerY',
                'vehicle',
                'silo',
              ].includes(hit.mat)
            ? 'metal'
            : ['wood', 'plank', 'crate', 'door', 'barn', 'fence'].includes(hit.mat)
              ? 'wood'
              : 'concrete';
      const spatialInfo = this.spatial(position);
      this.audio.impact(kind, spatialInfo.pan);
    }
  }

  puffSprite(kind) {
    const pool = (this.puffPool ||= { dust: [], puff: [], smoke: [] })[kind];
    let supplyPoint = pool.pop();
    if (!supplyPoint) {
      const base = kind === 'smoke' ? SMOKE_MAT : PUFF_MAT;
      const material = base.clone();
      if (kind === 'dust') {
        material.fog = false;
      }
      supplyPoint = new THREE.Sprite(material);
      supplyPoint.userData.pool = kind;
      supplyPoint.userData.col = base.color.getHex();
      this.scene.add(supplyPoint);
    }
    supplyPoint.material.color.setHex(supplyPoint.userData.col);
    supplyPoint.visible = true;
    return supplyPoint;
  }

  puff(position, normal, distance) {
    const supplyPoint = this.puffSprite('puff');
    const startSize = clamp(this.pixelAt(distance) * 8, 0.15, 4);
    supplyPoint.position.set(
      position[0] + normal[0] * 0.15,
      position[1] + normal[1] * 0.15,
      position[2] + normal[2] * 0.15,
    );
    supplyPoint.scale.setScalar(startSize);
    this.puffs.push({ sp: supplyPoint, t: 0, s0: startSize, life: 0.8, grow: 2.2 });
    if (this.puffs.length > 140) {
      this.removePuff(this.puffs.shift());
    }
  }

  removePuff(forward) {
    const supplyPoint = forward.sp;
    const pool = supplyPoint.userData.pool && this.puffPool?.[supplyPoint.userData.pool];
    if (pool && pool.length < 200) {
      supplyPoint.visible = false;
      pool.push(supplyPoint);
    } else {
      this.scene.remove(supplyPoint);
      supplyPoint.material.dispose();
    }
  }

  updatePuffs(deltaTime) {
    if (!this.debrisIM) {
      this.debrisIM = new THREE.InstancedMesh(
        DEBRIS_GEO,
        new THREE.MeshBasicMaterial({ fog: false }),
        DEBRIS_CAP,
      );
      this.debrisIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.debrisIM.setColorAt(0, debCol.setHex(0xffffff));
      this.debrisIM.frustumCulled = false;
      this.debrisIM.count = 0;
      this.scene.add(this.debrisIM);
    }
    const instances = this.debrisIM;
    let normal = 0;
    let weapon = 0;
    const list = this.debris;
    for (let index = 0; index < list.length; index++) {
      const entry = list[index];
      entry.t += deltaTime;
      if (entry.t >= entry.life) {
        continue;
      }
      entry.v[1] -= 14 * deltaTime;
      entry.p[0] += entry.v[0] * deltaTime;
      entry.p[1] += entry.v[1] * deltaTime;
      entry.p[2] += entry.v[2] * deltaTime;
      entry.r += deltaTime * 9;
      list[weapon++] = entry;
      debrisQuaternion.setFromAxisAngle(DEB_AX, entry.r);
      debrisMatrix.compose(
        debrisPosition.set(entry.p[0], entry.p[1], entry.p[2]),
        debrisQuaternion,
        debrisScale.setScalar(entry.s),
      );
      instances.setMatrixAt(normal, debrisMatrix);
      instances.setColorAt(normal, debCol.setHex(entry.c));
      normal++;
    }
    list.length = weapon;
    instances.count = normal;
    if (normal) {
      instances.instanceMatrix.needsUpdate = true;
      instances.instanceColor.needsUpdate = true;
    }
    this.puffs = this.puffs.filter((forward) => {
      forward.t += deltaTime;
      const kit = forward.t / forward.life;
      forward.sp.scale.setScalar(forward.s0 * (1 + kit * forward.grow));
      forward.sp.position.y += deltaTime * (forward.rise ?? 0.4);
      forward.sp.material.opacity = (forward.op || 0.8) * (1 - kit);
      if (kit < 1) {
        return true;
      }
      this.removePuff(forward);
      return false;
    });
    this.crateFx = this.crateFx.filter((center) => {
      center.t += deltaTime * 1.6;
      const kit = Math.min(1, center.t);
      center.mesh.position.set(
        center.from[0] + (center.to[0] - center.from[0]) * kit,
        center.from[1] + (center.to[1] - center.from[1]) * kit + Math.sin(kit * Math.PI) * 1.2,
        center.from[2] + (center.to[2] - center.from[2]) * kit,
      );
      center.mesh.rotation.y += deltaTime * 3;
      if (kit < 1) {
        return true;
      }
      this.scene.remove(center.mesh);
      return false;
    });
  }

  spawnRocket(pixelOffset, entry, owner, kind) {
    const config = SHELLS[kind];
    if (config) {
      const gun = new THREE.Group();
      const glow = new THREE.Sprite(HALO_MAT);
      glow.scale.setScalar(kind === 'cannon' ? 0.7 : 0.35);
      gun.add(glow);
      this.scene.add(gun);
      const position = [
        pixelOffset[0] + entry[0] * 2.5,
        pixelOffset[1] + entry[1] * 2.5,
        pixelOffset[2] + entry[2] * 2.5,
      ];
      this.rocketsFx.push({
        mesh: gun,
        p: position,
        v: entry.map((positionX) => positionX * config.v),
        t: 0,
        smokeT: 0,
        cfg: config,
      });
      if (kind === 'cannon') {
        for (let kit = 0; kit < 8; kit++) {
          this.smokePuff(
            [
              position[0] + (Math.random() - 0.5) * 1.5,
              position[1] + (Math.random() - 0.5) * 0.8,
              position[2] + (Math.random() - 0.5) * 1.5,
            ],
            1.4,
            1.8,
          );
        }
      }
      if (owner !== this.myId) {
        this.audio.shotFar(
          kind === 'cannon' ? 'cannon' : 'autocannon',
          pixelOffset,
          this.earArr(),
          false,
          this.spatial(pixelOffset).muffled,
        );
      }
      return;
    }
    const currentGun = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x3b4a2a }),
    );
    body.rotation.x = Math.PI / 2;
    currentGun.add(body);
    const flame = new THREE.Sprite(HALO_MAT);
    flame.position.z = 0.4;
    flame.scale.setScalar(0.5);
    currentGun.add(flame);
    this.scene.add(currentGun);
    const currentPosition = [
      pixelOffset[0] + entry[0] * 0.8,
      pixelOffset[1] + entry[1] * 0.8,
      pixelOffset[2] + entry[2] * 0.8,
    ];
    this.rocketsFx.push({
      mesh: currentGun,
      p: currentPosition,
      v: entry.map((positionX) => positionX * ROCKET.v),
      t: 0,
      smokeT: 0,
    });
    for (let kit = 0; kit < 6; kit++) {
      this.smokePuff(
        [
          pixelOffset[0] - entry[0] * (1 + kit * 0.4),
          pixelOffset[1] - entry[1] * 0.5,
          pixelOffset[2] - entry[2] * (1 + kit * 0.4),
        ],
        1.2,
        1.4,
      );
    }
    if (owner !== this.myId) {
      this.audio.shotFar(
        'rpg',
        pixelOffset,
        this.earArr(),
        false,
        this.spatial(pixelOffset).muffled,
      );
    }
  }

  vehicleFire(vehicle, state, definition, distance) {
    const now = performance.now();
    if (!state.alive && !vehicle.deadSeen) {
      vehicle.deadSeen = now;
    }
    if (state.alive) {
      vehicle.deadSeen = 0;
    }
    const wreckHot = !state.alive && now - vehicle.deadSeen < VEHICLE_WRECK_SMOKE_MS;
    const damaged = state.alive && state.hp < definition.hp * 0.25;
    const burning = !!state.burning;
    if ((!burning && !damaged && !wreckHot) || distance > VEHICLE_FIRE_RANGE_M) {
      return;
    }
    const every = burning ? 45 : wreckHot ? 120 : 220;
    if (now - (vehicle.lastFireFx || 0) < every) {
      return;
    }
    vehicle.lastFireFx = now;
    const top = [state.x, state.y + (definition.hgt || 2) * 0.7, state.z];
    this.smokePuff(top, burning ? 1.6 : 1.1, burning ? 2.4 : 3.2);
    if (burning || wreckHot || state.hp < definition.hp * 0.1) {
      const supplyPoint = this.puffSprite('puff');
      supplyPoint.material.color.setHex(Math.random() < 0.5 ? 0xff7a1e : 0xffb03a);
      supplyPoint.position.set(
        top[0] + (Math.random() - 0.5) * 0.8,
        top[1] - 0.3,
        top[2] + (Math.random() - 0.5) * 0.8,
      );
      const startSize = burning ? 1.1 : 0.8;
      supplyPoint.scale.setScalar(startSize);
      this.puffs.push({ sp: supplyPoint, t: 0, s0: startSize, life: 0.45, grow: 1.6 });
    }
  }

  smokePuff(position, startSize, life) {
    const supplyPoint = this.puffSprite('smoke');
    supplyPoint.material.opacity = 0.6;
    supplyPoint.position.set(position[0], position[1], position[2]);
    supplyPoint.scale.setScalar(startSize);
    this.puffs.push({ sp: supplyPoint, t: 0, s0: startSize, life, grow: 2.5, op: 0.6 });
  }

  updateRocketsFx(deltaTime) {
    this.rocketsFx = this.rocketsFx.filter((result) => {
      const config = result.cfg || ROCKET;
      result.v[1] -= config.g * deltaTime;
      result.p[0] += result.v[0] * deltaTime;
      result.p[1] += result.v[1] * deltaTime;
      result.p[2] += result.v[2] * deltaTime;
      result.t += deltaTime;
      result.mesh.position.set(result.p[0], result.p[1], result.p[2]);
      scratchVector.set(result.v[0], result.v[1], result.v[2]).normalize();
      result.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), scratchVector);
      result.smokeT += deltaTime;
      if (!result.cfg && result.smokeT > 0.03) {
        result.smokeT = 0;
        this.smokePuff(
          [
            result.p[0] - scratchVector.x * 0.5,
            result.p[1] - scratchVector.y * 0.5,
            result.p[2] - scratchVector.z * 0.5,
          ],
          0.35,
          1.6,
        );
      }
      if (
        result.dead ||
        result.t > config.maxT + 0.5 ||
        result.p[1] < heightAt(result.p[0], result.p[2]) - 1
      ) {
        this.scene.remove(result.mesh);
        return false;
      }
      return true;
    });
  }

  onRemoteShot(message) {
    const weapon = MW[message.w];
    if (!weapon) {
      return;
    }
    if (!message.d) {
      if (!weapon.melee) {
        this.audio.shotFar(
          weapon.id,
          message.o,
          this.earArr(),
          !!message.q,
          this.spatial(message.o).muffled,
        );
      }
      return;
    }
    const remotePlayer = this.remotes.get(message.i);
    remotePlayer?.shot(!!weapon.melee);
    if (weapon.melee) {
      return;
    }
    const center = milClass(weapon);
    const ammo = AMMO[message.a] || AMMO.fmj;
    const directions =
      weapon.pellets && !ammo.slug
        ? pelletDirs(message.d, message.sd, weapon.pellets, weapon.pelletSpread * 1.1)
        : [message.d];
    const muzzle = remotePlayer?.muzzleWorld();
    const pixelOffset = muzzle ? [muzzle.x, muzzle.y, muzzle.z] : message.o;
    this.remoteShotN = (this.remoteShotN || 0) + 1;
    const belt = caliberOf(weapon.id).includes('belt');
    for (const entry of directions) {
      this.addBullet(
        pixelOffset,
        entry,
        center,
        weapon,
        false,
        !!ammo.tracer || (belt && this.remoteShotN % 3 === 0),
        ammo.v || 1,
        message.pv,
      );
    }
    if (muzzle && !message.q && this.camera.position.distanceTo(muzzle) < 400) {
      this.effects.flash(muzzle, 0.35);
    }
    this.audio.shotFar(
      weapon.id,
      message.o,
      this.earArr(),
      !!message.q,
      this.spatial(message.o).muffled,
    );
  }

  bleed(victimId, point, from, heavy = false, splat = true) {
    const remotePlayer = this.remotes.get(victimId);
    const wound = remotePlayer
      ? remotePlayer.addWound(point, point.clone().sub(from), this.effects)
      : null;
    if (wound && heavy) {
      const vehicle = new THREE.Vector3();
      this.effects.gush(() => (wound.parent ? wound.getWorldPosition(vehicle) : null), 0.6, 0.45);
    }
    if (!splat || !this.world) {
      return;
    }
    const direction = point.clone().sub(from).normalize();
    const hit = rayWorld(
      this.world,
      [point.x, point.y, point.z],
      [direction.x, direction.y, direction.z],
      2.5,
    );
    if (hit) {
      this.effects.bloodSplat(
        new THREE.Vector3(...hit.point),
        hit.normal,
        0.45 + Math.random() * 0.3,
      );
    }
  }

  onHit() {}

  spawnNade(message) {
    const weapon = MW[message.w];
    const mesh = (BUILDERS[weapon?.id] || BUILDERS.he)(false).group;
    mesh.scale.setScalar(1.3);
    this.scene.add(mesh);
    this.nades.set(message.id, {
      n: nadeStartMil(message.o, message.d, !!message.lob),
      mesh,
      acc: 0,
    });
    if (message.i !== this.myId) {
      this.remotes.get(message.i)?.shot(true);
      this.audio.throwNade(this.spatial(message.o));
    }
  }

  updateNades(deltaTime) {
    for (const nade of this.nades.values()) {
      nade.acc += deltaTime;
      while (nade.acc >= NADE_MIL.dt) {
        nade.acc -= NADE_MIL.dt;
        if (stepNadeMil(nade.n, this.world)) {
          this.audio.bounce(this.spatial([nade.n.x, nade.n.y, nade.n.z]));
        }
      }
      nade.mesh.position.set(nade.n.x, nade.n.y, nade.n.z);
      if (!nade.n.rest) {
        nade.mesh.rotation.x += deltaTime * 12;
        nade.mesh.rotation.z += deltaTime * 7;
      }
    }
    const now = performance.now();
    if (this.smokes.length) {
      this.smokes = this.smokes.filter((smokeFactor) => smokeFactor.until > now);
    }
    if (this.shells) {
      const cam = this.camera.position;
      this.shells = this.shells.filter((shell) => {
        shell.v[1] -= MIL.gravity * deltaTime;
        shell.p[0] += shell.v[0] * deltaTime;
        shell.p[1] += shell.v[1] * deltaTime;
        shell.p[2] += shell.v[2] * deltaTime;
        shell.t += deltaTime;
        if (!shell.whistled && shell.v[1] < 0) {
          const above = shell.p[1] - heightAt(shell.p[0], shell.p[2]);
          const tLeft = above / Math.max(1, -shell.v[1]);
          if (tLeft < 2.8) {
            shell.whistled = true;
            const land = [
              shell.p[0] + shell.v[0] * tLeft,
              heightAt(shell.p[0], shell.p[2]),
              shell.p[2] + shell.v[2] * tLeft,
            ];
            if (Math.hypot(land[0] - cam.x, land[2] - cam.z) < 260) {
              this.audio.whistle(land, this.earArr(), tLeft);
            }
          }
        }
        if (shell.mesh) {
          shell.mesh.position.set(shell.p[0], shell.p[1], shell.p[2]);
          scratchVector.set(shell.v[0], shell.v[1], shell.v[2]).normalize();
          shell.mesh.quaternion.setFromUnitVectors(UP_Y, scratchVector);
          const distance = Math.hypot(shell.p[0] - cam.x, shell.p[1] - cam.y, shell.p[2] - cam.z);
          shell.mesh.scale.setScalar(Math.max(1, distance / 120));
          shell.trail += deltaTime;
          if (distance < 900 && shell.trail > 0.07) {
            shell.trail = 0;
            this.smokePuff([shell.p[0], shell.p[1], shell.p[2]], 0.25 + distance * 0.002, 1.1);
          }
        }
        const alive = shell.t < 60 && shell.p[1] > heightAt(shell.p[0], shell.p[2]) - 1;
        if (!alive && shell.mesh) {
          this.scene.remove(shell.mesh);
        }
        return alive;
      });
    }
  }

  mortarShellMesh() {
    const gun = new THREE.Group();
    const materials = (this.shellMats ||= {
      body: new THREE.MeshStandardMaterial({ color: 0x3e4a2c, roughness: 0.7 }),
      fin: new THREE.MeshStandardMaterial({ color: 0x2a2a26, roughness: 0.8 }),
    });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.32, 10), materials.body);
    body.position.y = 0.04;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 10), materials.body);
    nose.position.y = 0.26;
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 8), materials.fin);
    tail.position.y = -0.18;
    gun.add(body, nose, tail);
    for (let kit = 0; kit < 4; kit++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.08, 0.09), materials.fin);
      fin.position.set(
        Math.cos((kit * Math.PI) / 2) * 0.04,
        -0.22,
        Math.sin((kit * Math.PI) / 2) * 0.04,
      );
      fin.rotation.y = (-kit * Math.PI) / 2;
      gun.add(fin);
    }
    return gun;
  }

  mortarSolution() {
    const structure = this.mount && this.structs.get(this.mount.id)?.s;
    const state = structure ? { x: structure.x, y: structure.y, z: structure.z } : this.ms;
    const marks = (this.markers || []).filter(
      (marker) => marker[0] === 'mortar' || marker[0] === 'enemy',
    );
    if (!marks.length) {
      return null;
    }
    marks.sort(
      (left, right) =>
        (left[0] === 'mortar' ? 0 : 1) - (right[0] === 'mortar' ? 0 : 1) ||
        Math.hypot(left[1] - state.x, left[2] - state.z) -
          Math.hypot(right[1] - state.x, right[2] - state.z),
    );
    const [kind, targetX, targetZ] = marks[0];
    const key = `${kind}|${targetX}|${targetZ}|${Math.round(state.x)}|${Math.round(state.z)}`;
    if (this.mortarSol?.key === key) {
      return this.mortarSol.sol;
    }
    const deltaX = targetX - state.x;
    const deltaZ = targetZ - state.z;
    const entry = Math.hypot(deltaX, deltaZ);
    const launchY = state.y + 1;
    const heightDifference = heightAt(targetX, targetZ) - launchY;
    const bearing = bearingOf(Math.atan2(-deltaX, -deltaZ));
    const vehicle = MORTAR.v;
    const gun = MIL.gravity;
    const deltaTime = 1 / 30;
    const heightAtRange = (element) => {
      const elevationRadians = element * DEGREES_TO_RADIANS;
      let positionX = 0;
      let positionY = 0;
      const velocityX = vehicle * Math.cos(elevationRadians);
      let velocityY = vehicle * Math.sin(elevationRadians);
      for (let index = 0; index < 3000; index++) {
        velocityY -= gun * deltaTime;
        const nextX = positionX + velocityX * deltaTime;
        const nextY = positionY + velocityY * deltaTime;
        if (nextX >= entry) {
          return positionY + (nextY - positionY) * ((entry - positionX) / (nextX - positionX));
        }
        positionX = nextX;
        positionY = nextY;
        if (positionY < heightDifference - 200) {
          return -Infinity;
        }
      }
      return -Infinity;
    };
    let best = null;
    for (let element = MORTAR.minEl; element <= MORTAR.maxEl + 1e-6; element += 0.5) {
      const error = Math.abs(heightAtRange(element) - heightDifference);
      if (!best || error < best.err) {
        best = { el: element, err: error };
      }
    }
    for (let element = best.el - 0.5; element <= best.el + 0.5; element += 0.02) {
      if (element < MORTAR.minEl || element > MORTAR.maxEl) {
        continue;
      }
      const error = Math.abs(heightAtRange(element) - heightDifference);
      if (error < best.err) {
        best = { el: element, err: error };
      }
    }
    const reach = best.err < 3;
    const sol = {
      kind,
      d: Math.round(entry),
      bearing: Math.round(bearing * 10) / 10,
      el: reach ? Math.round(best.el * 10) / 10 : null,
      dh: Math.round(heightDifference),
    };
    this.mortarSol = { key, sol };
    return sol;
  }

  frameUpdate(deltaTime, now, alpha) {
    if (!this.joined || !this.world) {
      this.lobby.update(deltaTime);
      return;
    }
    const state = this.ms;
    const weapon = MW[this.cur];
    const center = milClass(weapon);
    this.updateVehicles(deltaTime);
    const live = this.locked && this.alive && !this.downed && !this.chatting && !this.uiOpen;

    const acting = !!(this.interact || this.holdAct || this.using || this.dragging);
    const eHeld = !acting && this.keys.has('KeyE') && now - (this.keyAt.KeyE || 0) > 0.18;
    void eHeld;
    let leanT = 0;
    if (leanT !== 0) {
      const rotationX = Math.cos(this.yaw);
      const rotationZ = -Math.sin(this.yaw);
      const head = [state.x, state.y + (state.crouch ? PLAYER.crouchEye : PLAYER.eye), state.z];
      const hit = rayWorld(
        this.world,
        head,
        [rotationX * Math.sign(leanT), 0, rotationZ * Math.sign(leanT)],
        LEAN_HEAD + 0.25,
      );
      if (hit) {
        leanT *= clamp((hit.t - 0.25) / LEAN_HEAD, 0, 1);
      }
    }
    this.lean += (leanT - this.lean) * Math.min(1, deltaTime * 9);
    this.raise = state.sprinting
      ? 0
      : Math.min(1, this.raise + deltaTime / (weapon?.slot === 'secondary' ? 0.12 : 0.2));
    if (state.sprinting || this.reloading) {
      this.adsOn = false;
    }
    const armed = live && this.needsRaise(weapon) && !this.mount && !this.myVeh && !this.binos;
    if (armed && this.mouse.l) {
      this.readyUntil = Math.max(this.readyUntil, now + 2.5);
    }
    const wantReady =
      armed &&
      !state.sprinting &&
      (this.adsOn || this.readyLock || now < this.readyUntil || this.fireQueued > now);
    const adsT = center.ads * this.fxOf(weapon).ads;
    const raiseTime = Math.max(0.1, adsT * 0.8);
    this.readyT = clamp(
      this.readyT + (wantReady ? deltaTime / raiseTime : -deltaTime / (raiseTime * 1.6)),
      0,
      1,
    );
    if (armed) {
      const tracerLength =
        weapon.slot === 'secondary'
          ? 0.5
          : ({ smg: 0.7, sniper: 1.15, mg: 1.1 }[weapon.class] ?? 0.95);
      const aimYaw = this.yaw + this.aimOff.y;
      const aimPitch = this.pitch + this.aimOff.p;
      const aimDirection = [
        -Math.sin(aimYaw) * Math.cos(aimPitch),
        Math.sin(aimPitch),
        -Math.cos(aimYaw) * Math.cos(aimPitch),
      ];
      const eye = [state.x, state.y + this.eyeH - 0.08, state.z];
      const hit = rayWorld(this.world, eye, aimDirection, tracerLength, {
        skip: (box) => box.soft,
      });
      const obstruction = hit ? clamp((tracerLength - hit.t) / (tracerLength * 0.55), 0, 1) : 0;
      this.obstruct += (obstruction - this.obstruct) * Math.min(1, deltaTime * 10);
      let rest = false;
      if (!state.prone && this.readyT > 0.5 && !hit) {
        const distance = Math.hypot(aimDirection[0], aimDirection[2]) || 1;
        rest = !!rayWorld(
          this.world,
          [eye[0], eye[1] - 0.2, eye[2]],
          [aimDirection[0] / distance, 0, aimDirection[2] / distance],
          0.85,
          { skip: (box) => box.soft },
        );
      }
      this.rested = rest;
    } else {
      this.obstruct *= Math.exp(-deltaTime * 10);
      this.rested = false;
    }
    if (this.ads > 0.3 || !armed) {
      const kit = Math.min(1, deltaTime * 10);
      const mouseDeltaY = this.aimOff.y * kit;
      const aimPitchOffset = this.aimOff.p * kit;
      if (armed) {
        this.yaw += mouseDeltaY;
        this.pitch = clamp(
          this.pitch + aimPitchOffset,
          -89 * DEGREES_TO_RADIANS,
          89 * DEGREES_TO_RADIANS,
        );
      }
      this.aimOff.y -= mouseDeltaY;
      this.aimOff.p -= aimPitchOffset;
    }
    const adsWant =
      live && this.adsOn && this.canAds() && this.readyT > 0.7 && this.obstruct < 0.5
        ? 1
        : this.mount?.kind === 'mg' && this.mouse.r
          ? 1
          : 0;
    this.ads = clamp(
      this.ads +
        (adsWant ? 1 : -1) *
          (deltaTime / (adsT * (this.mount ? 0.6 : 1) * (1 + (this.wounds.arms || 0) * 0.4))),
      0,
      1,
    );
    this.binosT = clamp(this.binosT + (this.binos ? 1 : -1) * (deltaTime / 0.7), 0, 1);
    if (!this.free && !this.myVeh && this.mount?.kind !== 'mortar') {
      this.fl.y *= Math.exp(-deltaTime * 10);
      this.fl.p *= Math.exp(-deltaTime * 10);
    }

    const moving = Math.min(1, Math.hypot(state.vx, state.vz) / 3.5);
    const tired = 1 - state.st;
    const holding =
      live &&
      this.ads > 0.5 &&
      (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) &&
      this.breath > 0;
    this.breath = holding
      ? Math.max(0, this.breath - deltaTime / 6)
      : Math.min(1, this.breath + deltaTime / 4);
    const bipod = state.prone && this.kit.primary?.grip === 'bipod' && weapon.slot === 'primary';
    let amplitude =
      0.0019 *
      center.sway *
      (state.prone ? 0.32 : state.crouch ? 0.6 : 1) *
      (bipod ? 0.5 : 1) *
      (1 + tired * tired * 2.2) *
      (1 + moving * 1.4) *
      (this.ads > 0.5 ? 1 : 1.5);
    amplitude *= 0.3;
    if (this.rested) {
      amplitude *= 0.35;
    }
    this.suppress = Math.max(0, (this.suppress || 0) - deltaTime * 0.6);
    amplitude *= 1 + (this.suppress || 0) * 1.2;
    amplitude *= 1 + (this.wounds.arms || 0) * 0.8 + (this.hp < 35 ? 0.3 : 0);
    if (holding) {
      amplitude *= 0.06 + tired * 0.4;
    } else if (this.breath <= 0.02 && this.ads > 0.5) {
      amplitude *= 1.6;
    }
    if (this.mount?.kind === 'mg') {
      amplitude *= 0.15;
    }
    if (this.binos) {
      amplitude *= 0.6;
    }
    this.sway.amp += (amplitude - this.sway.amp) * Math.min(1, deltaTime * (holding ? 8 : 2));
    const breathRate = 0.18 + tired * 0.3;
    this.sway.t += deltaTime;
    const swayTime = this.sway.t;
    const fromTod = this.sway.amp;
    this.sway.y =
      fromTod *
      (Math.sin(swayTime * 0.31 * 6.283) * 0.75 + Math.sin(swayTime * 0.67 * 6.283 + 1.3) * 0.25);
    this.sway.p =
      fromTod *
        (Math.sin(swayTime * 0.62 * 6.283 + 0.5) * 0.35 +
          Math.sin(swayTime * 0.43 * 6.283 + 2.1) * 0.15) +
      fromTod * 0.35 * Math.sin(swayTime * breathRate * 6.283);
    this.rec.p *= Math.exp(-deltaTime * 7.5);
    this.rec.y *= Math.exp(-deltaTime * 6.5);
    this.lag.y *= Math.exp(-deltaTime * 12);
    this.lag.p *= Math.exp(-deltaTime * 12);
    if (
      tired > 0.55 &&
      this.alive &&
      !this.myVeh &&
      performance.now() - this.lastBreath > 1400 - tired * 700
    ) {
      this.lastBreath = performance.now();
      this.audio.breath(tired);
    }

    const eyeTarget = !this.alive
      ? 0.4
      : state.prone || this.downed
        ? 0.32
        : state.crouch
          ? PLAYER.crouchEye
          : PLAYER.eye;
    this.eyeH += (eyeTarget - this.eyeH) * Math.min(1, deltaTime * 8);
    this.corr.multiplyScalar(Math.exp(-deltaTime * 12));
    const pixelSize = state.px + (state.x - state.px) * alpha;
    const interpolatedY = state.py + (state.y - state.py) * alpha;
    const interpolatedZ = state.pz + (state.z - state.pz) * alpha;
    const cam = this.camera;
    const sway2cam = Math.max(this.ads, this.binosT * 0.5);
    let camYaw = this.yaw + this.rec.y + this.fl.y + this.sway.y * sway2cam;
    const camPitch = this.pitch + this.rec.p + this.fl.p + this.sway.p * sway2cam;
    if (this.myVeh) {
      const vehicle = this.veh.get(this.myVeh.id);
      if (vehicle) {
        const camSeat = vehicle.st.type === 'tank' && this.myVeh.seat === 0 ? 1 : this.myVeh.seat;
        const currentSeatWorld = seatWorld(vehicle.st, camSeat);
        this.ms.x = this.ms.px = currentSeatWorld[0];
        this.ms.y = this.ms.py = currentSeatWorld[1] - 1.1;
        this.ms.z = this.ms.pz = currentSeatWorld[2];
        if (this.tp) {
          const definition = VEHICLES[vehicle.st.type];
          const cannonYaw = vehicle.st.yaw + this.fl.y;
          const pitchC = clamp(-0.25 + this.fl.p, -1.0, 0.45);
          const distance = definition.len * 0.9 + 6;
          const target = new THREE.Vector3(
            vehicle.st.x,
            vehicle.st.y + definition.hgt * 0.75,
            vehicle.st.z,
          );
          const off = new THREE.Vector3(
            Math.sin(cannonYaw) * Math.cos(pitchC),
            -Math.sin(pitchC),
            Math.cos(cannonYaw) * Math.cos(pitchC),
          );
          const hit = rayWorld(
            this.world,
            [target.x, target.y, target.z],
            [off.x, off.y, off.z],
            distance,
            { skip: (box) => box.tree },
          );
          const currentDistance = hit ? Math.max(1.5, hit.t - 0.4) : distance;
          cam.position.copy(target).addScaledVector(off, currentDistance);
          const groundY = heightAt(cam.position.x, cam.position.z) + 0.5;
          if (cam.position.y < groundY) {
            cam.position.y = groundY;
          }
          cam.lookAt(target);
        } else {
          cam.position.set(
            currentSeatWorld[0],
            currentSeatWorld[1] + (this.gunnerOn || this.commander ? 0.85 : 0.62),
            currentSeatWorld[2],
          );
          scratchQuaternion.setFromEuler(
            scratchEuler.set(vehicle.st.pitch, vehicle.st.yaw, vehicle.st.roll, 'YXZ'),
          );
          const look = this.gunnerOn ? this.tCur : this.fl;
          cam.quaternion
            .copy(scratchQuaternion)
            .multiply(
              new THREE.Quaternion().setFromEuler(scratchEuler.set(look.p, look.y, 0, 'YXZ')),
            );
        }
      }
    } else if (!this.alive && this.deathCam) {
      this.updateDeathCam(deltaTime);
    } else if (!this.alive && this.deathPos) {
      const [deltaX, deltaY, deltaZ] = this.deathPos;
      const amount = performance.now() / 6000;
      cam.position.set(deltaX + Math.cos(amount) * 6, deltaY + 4, deltaZ + Math.sin(amount) * 6);
      cam.lookAt(deltaX, deltaY + 0.5, deltaZ);
    } else {
      this.feetPos = [
        pixelSize + this.corr.x,
        interpolatedY + this.corr.y,
        interpolatedZ + this.corr.z,
      ];
      cam.position.set(
        pixelSize + this.corr.x,
        interpolatedY + this.eyeH + this.corr.y,
        interpolatedZ + this.corr.z,
      );
      const rotationX = Math.cos(this.yaw);
      const rotationZ = -Math.sin(this.yaw);
      cam.position.x += rotationX * this.lean * LEAN_HEAD * 0.9;
      cam.position.z += rotationZ * this.lean * LEAN_HEAD * 0.9;
      cam.position.y -= Math.abs(this.lean) * 0.06;
      if (state.prone && !this.downed) {
        cam.position.x += -Math.sin(this.yaw) * 0.7;
        cam.position.z += -Math.cos(this.yaw) * 0.7;
      }
      {
        const correctedX = pixelSize + this.corr.x;
        const correctedZ = interpolatedZ + this.corr.z;
        const ddx = cam.position.x - correctedX;
        const ddz = cam.position.z - correctedZ;
        const distance = Math.hypot(ddx, ddz);
        if (distance > 0.02 && this.world) {
          const hit = rayWorld(
            this.world,
            [correctedX, cam.position.y, correctedZ],
            [ddx / distance, 0, ddz / distance],
            distance + CAM_WALL_MARGIN_M,
            { skip: (box) => box.soft || box.tree },
          );
          if (hit) {
            const kit = Math.max(0, hit.t - CAM_WALL_MARGIN_M);
            cam.position.x = correctedX + (ddx / distance) * kit;
            cam.position.z = correctedZ + (ddz / distance) * kit;
          }
        }
        const floorY = heightAt(cam.position.x, cam.position.z) + CAM_FLOOR_MARGIN_M;
        if (cam.position.y < floorY) {
          cam.position.y = floorY;
        }
      }
      if (state.onGround && this.speedH > 0.5 && !this.downed) {
        this.bobT = (this.bobT || 0) + deltaTime * this.speedH * 1.9;
        const bobAmount =
          (state.sprinting ? 0.028 : 0.016) * (1 - this.ads * 0.85) * (state.prone ? 0.3 : 1);
        cam.position.y += Math.abs(Math.sin(this.bobT)) * bobAmount;
        camYaw += Math.sin(this.bobT) * bobAmount * 0.015;
      }
      const roll = this.downed
        ? 0.5
        : -this.lean * 0.2 +
          this.roll +
          (state.rollT > 0 ? state.rollDir * Math.sin((state.rollT / 0.45) * Math.PI) * 0.6 : 0);
      cam.rotation.set(this.downed ? 0.15 : camPitch, camYaw, roll, 'YXZ');
      this.aimMountedGun(cam, camYaw, camPitch);
    }
    if (this.shake > 0) {
      const amount = this.shake * this.shake * 0.12;
      cam.position.x += (Math.random() - 0.5) * amount;
      cam.position.y += (Math.random() - 0.5) * amount;
    }
    this.shake = Math.max(0, this.shake - deltaTime * 1.6);
    const sun = this.worldGroup.userData.sun;
    sun.position.set(cam.position.x + 120, cam.position.y + 220, cam.position.z + 80);
    sun.target.position.copy(cam.position);
    this.worldGroup.userData.skyMesh.position.copy(cam.position);
    this.flash.visible = this.light && this.alive && !this.myVeh;
    if (this.flash.visible) {
      this.flash.intensity = 60;
      this.flash.position
        .copy(cam.position)
        .add(new THREE.Vector3(0.15, -0.15, 0).applyQuaternion(cam.quaternion));
      scratchVector.set(0, 0, -10).applyQuaternion(cam.quaternion).add(cam.position);
      this.flash.target.position.copy(scratchVector);
    }

    const option = opticOf(this.opticNow(weapon));
    let zoom = 1 + (option.zoom - 1) * (this.ads * this.ads);
    const usesPictureInPicture = PIP_OPTICS.has(option.id) && !this.mount && !this.myVeh;
    this.pipOn = usesPictureInPicture;
    this.pipZoom = usesPictureInPicture
      ? 1 + ((this.scopeZoom[option.id] ?? option.zoom) - 1) * this.ads * this.ads
      : 1;
    if (usesPictureInPicture) {
      zoom = 1 + 0.25 * this.ads;
    }
    if (this.mount?.kind === 'mg') {
      zoom = 1 + 0.25 * this.ads;
    }
    if (this.focus && this.gunnerOn) {
      zoom = this.gunDef.zoom;
    } else if (this.focus && this.commander) {
      zoom = 4;
    } else if (this.focus) {
      zoom *= weapon?.slot === 'secondary' ? 1.35 : 1.6;
    }
    if (this.binosT > 0.9) {
      zoom = 7;
    }
    const targetFov = this.settings.fov / zoom;
    this.currentFov += (targetFov - this.currentFov) * Math.min(1, deltaTime * 16);
    if (Math.abs(cam.fov - this.currentFov) > 0.01) {
      cam.fov = this.currentFov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld(true);
    scratchVector.set(0, 0, -1).applyQuaternion(cam.quaternion);
    this.audio.setListener(cam.position, scratchVector);

    this.updateWeaponMil(deltaTime, now);
    this.updateGunner(now, deltaTime);
    this.updateDoors(deltaTime);
    if (
      this.voice.ch &&
      (!this.locked || !this.alive || this.downed || this.uiOpen || !document.hasFocus())
    ) {
      this.voice.stop();
    }
    this.voice.update(
      (id) => {
        const remotePlayer = this.remotes.get(id);
        return remotePlayer
          ? [
              remotePlayer.root.position.x,
              remotePlayer.root.position.y + 1.6,
              remotePlayer.root.position.z,
            ]
          : null;
      },
      (height) => this.spatial(height).muffled,
    );
    if (now - (this.indoorAt || 0) > 0.5 && this.world) {
      this.indoorAt = now;
      const center = this.camera.position;
      this.indoor =
        !this.myVeh &&
        !!rayWorld(this.world, [center.x, center.y, center.z], [0, 1, 0], 8, {
          skip: (box) => box.tree || box.soft,
        });
    }
    this.updateHoldAct(now);
    this.updateNades(deltaTime);
    this.updateBulletsFx(deltaTime);
    this.updateRocketsFx(deltaTime);
    this.updatePuffs(deltaTime);
    if (this.mount?.kind === 'mortar' && live) {
      const fine = this.keys.has('ShiftLeft') ? 0.25 : 1;
      if (this.keys.has('KeyA')) {
        this.mortar.az -= 12 * fine * deltaTime;
      }
      if (this.keys.has('KeyD')) {
        this.mortar.az += 12 * fine * deltaTime;
      }
      if (this.keys.has('KeyW')) {
        this.mortar.el = clamp(this.mortar.el + 4 * fine * deltaTime, MORTAR.minEl, MORTAR.maxEl);
      }
      if (this.keys.has('KeyS')) {
        this.mortar.el = clamp(this.mortar.el - 4 * fine * deltaTime, MORTAR.minEl, MORTAR.maxEl);
      }
      this.mortar.az = ((this.mortar.az % 360) + 360) % 360;
      const structure = this.structs.get(this.mount.id);
      const tube = structure?.mesh.userData.mortar;
      if (tube) {
        tube.rotation.y = -this.mortar.az * DEGREES_TO_RADIANS - structure.s.rot * QUARTER_TURN;
        tube.userData.tube.rotation.x = -(90 - this.mortar.el) * DEGREES_TO_RADIANS;
      }
    }
    if (now - (this.lastTod || 0) > 1) {
      this.lastTod = now;
      this.applyTod(this.dayMinute());
    }
    if (this.alive && this.outbox.length && now - this.lastSend >= 1 / 60) {
      this.lastSend = now;
      this.net.send({ t: 'in', sp: this.spawnCount, c: this.outbox });
      this.outbox = [];
    }
    if (this.alive && this.myVeh && now - this.lastSend >= 0.1) {
      this.lastSend = now;
      this.net.send({
        t: 'in',
        sp: this.spawnCount,
        c: [
          [
            ++this.seq,
            0,
            0,
            0,
            0,
            0,
            1,
            Math.round((this.yaw + this.fl.y) * 1000) / 1000,
            Math.round(this.fl.p * 1000) / 1000,
            0,
            0,
            0,
            0,
            0,
            0,
            this.uiFlags(),
          ],
        ],
      });
    }

    this.updateRemotesMil(deltaTime);
    this.effects.update(deltaTime);
    this.worldGroup.userData.lod.update(
      this.camera.position,
      this.camera.fov / (this.settings.fov || 75),
    );
    if (this.structs.size) {
      const list = (this.structList ||= [...this.structs.values()]);
      for (let kit = 0; kit < 8; kit++) {
        this.structI = ((this.structI || 0) + 1) % list.length;
        const structure = list[this.structI];
        if (structure?.mesh) {
          meshLod(
            structure.mesh,
            structure.mesh.position.distanceTo(this.camera.position) *
              (this.camera.fov / (this.settings.fov || 75)) <
              (this.gfx?.vehLod || 70),
          );
        }
      }
    }
    dynamicResolution(this, deltaTime);
    if (now - (this.audioDogAt || 0) > 1) {
      this.audioDogAt = now;
      this.audio.watchdog?.();
    }
    this.perfHud.frame(deltaTime);
    this.perfHud.update(this);

    const reloadP = this.reloading
      ? clamp((now - this.reloadStart) / (this.reloadEnd - this.reloadStart), 0, 1)
      : -1;
    const drawP = clamp(
      (now - this.drawStart) / Math.max(0.01, this.readyAt - this.drawStart),
      0,
      1,
    );
    const lowerV =
      state.sprinting && !this.mount
        ? 1
        : this.mount || !this.needsRaise(weapon)
          ? 0
          : Math.max(1 - this.raise, (1 - this.readyT) * 0.5);
    this.viewmodel.update(deltaTime, {
      kick: this.kick,
      speed: this.speedH * (1 - this.ads * 0.85),
      grounded: state.onGround,
      reload: reloadP,
      draw: drawP,
      lookDX: this.lookDX * (1 - this.ads),
      lookDY: this.lookDY * (1 - this.ads),
      ads: this.ads,
      lower: lowerV,
      aimYaw: this.sway.y * (1 - sway2cam) + this.lag.y - this.fl.y + this.aimOff.y,
      aimPitch: this.sway.p * (1 - sway2cam) + this.lag.p - this.fl.p + this.aimOff.p,
      obstruct: this.obstruct,
      hideGun: this.downed || this.mapOpen,
      binos: this.binosT,
      use: this.using ? clamp((now - this.using.t0) / this.using.dur, 0, 1) : 0,
      repair: this.holdAct?.kind === 'repair' ? 1 : 0,
      quiet: this.lastQuiet,
      scope: !!this.scopeShown,
    });
    this.lookDX = this.lookDY = 0;
    this.kick = Math.max(0, this.kick - deltaTime * 9);

    if (now - (this.lastScan || 0) > 0.12) {
      this.lastScan = now;
      this.scanInteract();
    }
    if (now - this.lastHud > 0.066) {
      this.lastHud = now;
      this.pushHud(now, reloadP);
    }
  }

  updateRemotesMil(deltaTime) {
    if (!this.net.hasOffset) {
      return;
    }
    const renderTime = this.net.serverNow() - INTERP_MS;
    const states = this.net.interpolate(renderTime, this.myId);
    const seen = new Set();
    const cam = this.camera.position;
    const zoomFactor = this.camera.fov / (this.settings.fov || 75);
    const [lod0, lod1] = this.gfx.charLod;
    this.crowd ||= new Crowd(this.scene);
    this.crowd.begin();
    for (const structure of states) {
      seen.add(structure.i);
      let remotePlayer = this.remotes.get(structure.i);
      if (!remotePlayer) {
        remotePlayer = new MilRemotePlayer(this.scene, structure.i);
        remotePlayer.ground = (positionX, positionZ) => heightAt(positionX, positionZ);
        remotePlayer.setDebug(this.debug);
        this.remotes.set(structure.i, remotePlayer);
      }
      remotePlayer.setTeam(structure.tm);
      remotePlayer.setLook(structure.lk);
      const mate = structure.tm === this.team;
      const entry = Math.hypot(structure.x - cam.x, structure.z - cam.z);
      remotePlayer.setName(structure.n, mate && entry < 45);
      const vehicleId = structure.xm?.[1];
      const vehicleEntry = vehicleId ? this.veh.get(vehicleId) : null;
      const vehicleType = vehicleEntry ? vehicleEntry.st.type : null;
      let resolvedStructure = structure;
      if (vehicleEntry && structure.a) {
        const currentSeatWorld = seatWorld(vehicleEntry.st, structure.xm[2] || 0);
        resolvedStructure = {
          ...structure,
          x: currentSeatWorld[0],
          y: currentSeatWorld[1] - 1.1,
          z: currentSeatWorld[2],
        };
      }
      const stepped = remotePlayer.update(
        resolvedStructure,
        deltaTime,
        vehicleType,
        vehicleEntry ? vehicleEntry.st.yaw + seatYaw(vehicleType, structure.xm[2] || 0) : null,
      );
      const needs = mate && structure.a && (structure.xm?.[4] || 0) & (4 | 256) && entry < 50;
      if (needs && !remotePlayer.medIcon) {
        remotePlayer.medIcon = new THREE.Sprite(MED_ICON_MAT);
        remotePlayer.medIcon.scale.setScalar(0.35);
        remotePlayer.root.add(remotePlayer.medIcon);
      }
      if (remotePlayer.medIcon) {
        remotePlayer.medIcon.visible = !!needs;
        remotePlayer.medIcon.position.set(0, (structure.xm?.[4] || 0) & 4 ? 0.7 : 2.25, 0);
      }
      remotePlayer.st = structure;
      const effectiveDistance =
        Math.hypot(structure.x - cam.x, structure.y - cam.y, structure.z - cam.z) * zoomFactor;
      const height = remotePlayer.lod === 0 ? 1.08 : remotePlayer.lod === 2 ? 0.92 : 1;
      remotePlayer.setLod(
        effectiveDistance < lod0 * height ? 0 : effectiveDistance < lod1 * height ? 1 : 2,
      );
      if (remotePlayer.lod === 2 && remotePlayer.root.visible) {
        const position = remotePlayer.root.position;
        this.crowd.add(
          remotePlayer.crowdPose(),
          position.x,
          position.y,
          position.z,
          remotePlayer.rig.root.rotation.y,
          remotePlayer.rig.m.suit.color,
        );
      }
      if (remotePlayer.reloadStarted && entry < 40) {
        const supplyPoint = this.spatial([structure.x, structure.y + 1, structure.z]);
        this.audio.reload(0.6 * supplyPoint.gain, supplyPoint.pan);
      }
      void stepped;
      if (entry < 45 && structure.a && !structure.xm?.[1]) {
        const flags = structure.xm?.[4] || 0;
        const spatialAudio =
          Math.hypot(
            structure.x - (remotePlayer.lastX ?? structure.x),
            structure.z - (remotePlayer.lastZ ?? structure.z),
          ) / Math.max(deltaTime, 1e-3);
        remotePlayer.lastX = structure.x;
        remotePlayer.lastZ = structure.z;
        if (spatialAudio > 0.5 && spatialAudio < 12) {
          remotePlayer.stepAcc = (remotePlayer.stepAcc || 0) + spatialAudio * deltaTime;
          const stride = flags & 2 ? 0.9 : structure.c ? 0.65 : spatialAudio > 5 ? 1.15 : 0.8;
          if (remotePlayer.stepAcc > stride) {
            remotePlayer.stepAcc = 0;
            const loud =
              (flags & 2
                ? 0.25
                : spatialAudio < 1.2
                  ? 0.2
                  : spatialAudio < 2.5
                    ? 0.45
                    : spatialAudio < 5
                      ? 0.75
                      : 1.05) * (structure.c ? 0.55 : 1);
            const surf = this.stepSurface(structure.x, structure.y, structure.z);
            const spatialPosition = this.spatial([structure.x, structure.y, structure.z]);
            this.audio.stepSurf(surf, 0.75 * loud * spatialPosition.gain, spatialPosition.pan);
          }
        }
      }
    }
    this.crowd.end();
    this.updateSelfBody(deltaTime);
    for (const [id, remotePlayer] of this.remotes) {
      if (!seen.has(id)) {
        remotePlayer.dispose();
        this.remotes.delete(id);
      }
    }
  }

  updateSelfBody(deltaTime) {
    const vehicle = this.myVeh && this.veh.get(this.myVeh.id);
    const show = !!(vehicle && this.tp && this.alive);
    const legs = !this.myVeh && this.alive && !this.downed && !this.deathCam && !!this.feetPos;
    if (!show && !legs) {
      if (this.selfRp) {
        this.selfRp.root.visible = false;
      }
      return;
    }
    if (legs) {
      if (!this.selfRp) {
        this.selfRp = new MilRemotePlayer(this.scene, -1);
        this.selfRp.ground = (positionX, positionZ) => heightAt(positionX, positionZ);
      }
      const remotePlayer = this.selfRp;
      remotePlayer.setTeam(this.team);
      remotePlayer.setLook(encodeLook(this.look));
      remotePlayer.setName('', false);
      if (this.kit !== this.selfKitRef) {
        this.selfKitRef = this.kit;
        this.selfGear = encodeGear(this.kit);
      }
      const state = this.ms;
      const [forwardX, feetY, forwardZ] = this.feetPos;
      const back = state.prone ? 0 : 0.12;
      remotePlayer.update(
        {
          i: -1,
          n: '',
          tm: this.team,
          x: forwardX + Math.sin(this.yaw) * back,
          y: feetY,
          z: forwardZ + Math.cos(this.yaw) * back,
          yaw: this.yaw,
          pitch: 0,
          c: state.crouch ? 1 : 0,
          a: 1,
          s: this.spawnCount,
          w: this.cur,
          ad: 0,
          hp: 100,
          xm: [0, 0, 0, this.selfGear, state.prone ? 2 : 0, 0],
        },
        deltaTime,
      );
      remotePlayer.rig.torso.visible = false;
      for (const center of remotePlayer.rig.pelvis.children) {
        if (center.isMesh) {
          center.visible = false;
        }
      }
      return;
    }
    if (this.selfRp) {
      this.selfRp.rig.torso.visible = true;
      for (const center of this.selfRp.rig.pelvis.children) {
        if (center.isMesh) {
          center.visible = true;
        }
      }
      this.selfRp.root.visible = true;
    }
    if (!this.selfRp) {
      this.selfRp = new MilRemotePlayer(this.scene, -1);
      this.selfRp.ground = (positionX, positionZ) => heightAt(positionX, positionZ);
    }
    const currentRemotePlayer = this.selfRp;
    currentRemotePlayer.setTeam(this.team);
    currentRemotePlayer.setLook(encodeLook(this.look));
    currentRemotePlayer.setName('', false);
    const currentSeatWorld = seatWorld(vehicle.st, this.myVeh.seat);
    currentRemotePlayer.update(
      {
        i: -1,
        n: '',
        tm: this.team,
        x: currentSeatWorld[0],
        y: currentSeatWorld[1] - 1.1,
        z: currentSeatWorld[2],
        yaw: this.yaw + this.fl.y,
        pitch: this.fl.p,
        c: 1,
        a: 1,
        s: this.spawnCount,
        w: this.cur,
        ad: 0,
        hp: 100,
        xm: [0, vehicle.st.id, this.myVeh.seat, encodeGear(this.kit), 0, 0],
      },
      deltaTime,
      vehicle.st.type,
      vehicle.st.yaw + seatYaw(vehicle.st.type, this.myVeh.seat),
    );
  }

  rangefind() {
    if (this.kit.cls !== 'sniper' || this.binosT < 0.9) {
      return null;
    }
    const center = this.camera.position;
    const forward = scratchVector.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const hit = rayWorld(
      this.world,
      [center.x, center.y, center.z],
      [forward.x, forward.y, forward.z],
      2000,
      {
        skip: (box) => box.soft,
      },
    );
    return hit ? Math.round(hit.t) : null;
  }

  spotList(nowMs) {
    this.spots = (this.spots || []).filter((state) => state.until > nowMs);
    const weapon = window.innerWidth;
    const height = window.innerHeight;
    return this.spots.map((state) => {
      const vehicle = new THREE.Vector3(state.x, state.y + 0.6, state.z).project(this.camera);
      const front = vehicle.z < 1;
      return {
        id: state.id,
        k: state.k,
        x: state.x,
        z: state.z,
        sx: front ? ((vehicle.x + 1) / 2) * weapon : null,
        sy: front ? ((1 - vehicle.y) / 2) * height : null,
        dist: Math.round(
          this.camera.position.distanceTo(new THREE.Vector3(state.x, state.y, state.z)),
        ),
        left: Math.max(0, Math.round((state.until - nowMs) / 1000)),
      };
    });
  }

  pushHud(now, reloadP) {
    const state = this.ms;
    const weapon = MW[this.cur];
    const weaponIndex = this.mount ? IDX.mg : this.cur;
    const magnitude = this.inv.loaded[weaponIndex] || { n: 0, size: weapon.mag, ammo: 'fmj' };
    const nowMs = performance.now();
    this.killfeed = this.killfeed.filter((kit) => nowMs - kit.t < 6000);
    const chat = this.chatting
      ? this.chat.slice(-10)
      : this.chat.filter((positionX) => nowMs - positionX.t < 10000).slice(-6);
    this.damage = this.damage.filter((entry) => nowMs - entry.t < 900);
    this.toasts = this.toasts.filter((positionX) => positionX.until > nowMs);
    const players = this.latest
      ? this.latest.players.map((position) => ({
          id: position.i,
          name: position.n,
          team: position.tm,
          kills: position.k,
          deaths: position.d,
          score: position.rk || 0,
          alive: !!position.a,
          bot: !!position.b,
        }))
      : [];
    const crews = new Map();
    for (const remotePlayer of this.remotes.values()) {
      const vehicleId = remotePlayer.st?.a && remotePlayer.st.xm?.[1];
      if (vehicleId) {
        crews.set(vehicleId, (crews.get(vehicleId) || 0) + 1);
      }
    }
    const crewOf = (id) => crews.get(id) || 0;
    const camYaw = this.myVeh
      ? (this.veh.get(this.myVeh.id)?.st.yaw ?? 0) + this.fl.y
      : this.yaw + this.fl.y;
    let here = null;
    for (let index = 0; index < SECTORS.length; index++) {
      const entry = SECTORS[index];
      if (Math.hypot(entry.x - state.x, entry.z - state.z) < entry.r) {
        here = {
          ...this.sectors[index],
          name: entry.name,
          locked: !canCapture(this.sectors, this.team, entry.id, CAPTURE_CHAIN),
        };
      }
    }
    const area = this.alive ? this.areaAt(state.x, state.z) : null;
    let veh = null;
    if (this.myVeh) {
      const vehicle = this.veh.get(this.myVeh.id);
      if (vehicle) {
        const definition = VEHICLES[vehicle.st.type];
        const structure = vehicle.st;
        veh = {
          type: structure.type,
          name: definition.name,
          kind: definition.kind,
          seat: this.myVeh.seat,
          seats: definition.seats,
          driver: this.myVeh.seat === 0,
          speed: Math.round(
            Math.abs(
              definition.kind === 'heli'
                ? Math.hypot(structure.vx || 0, structure.vz || 0)
                : structure.v || 0,
            ) * 3.6,
          ),
          hp: structure.hp,
          maxHp: definition.hp,
          cargo: definition.cargo ? Math.round(structure.cargo || 0) : null,
          cargoMax: definition.cargo || 0,
          loading: structure.loading,
          alt: Math.round(structure.y - heightAt(structure.x, structure.z)),
          vs: Math.round((structure.vy || 0) * 10) / 10,
          coll: Math.round((structure.coll || 0) * 100),
          rotor: Math.round((structure.rotor || 0) * 100),
          gear: this.myVeh.seat === 0 ? this.gear : structure.gear,
          boost: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
          tp: this.tp,
          comp: structure.comp,
          flipped: !!structure.flipped,
          tracks: !!definition.tracks,
          role: seatRole(structure.type, this.myVeh.seat),
        };
      }
    }
    const mortar =
      this.mount?.kind === 'mortar'
        ? {
            az: Math.round(this.mortar.az * 10) / 10,
            el: Math.round(this.mortar.el * 10) / 10,
            mils: Math.round(this.mortar.az * 17.7778),
            range: Math.round(mortarRange(MORTAR.v, this.mortar.el)),
            time: Math.round(mortarTime(MORTAR.v, this.mortar.el) * 10) / 10,
            sol: this.mortarSolution(),
            table: [50, 55, 60, 65, 70, 75, 80, 85].map((element) => [
              element,
              Math.round(mortarRange(MORTAR.v, element)),
            ]),
          }
        : null;
    const option = opticOf(this.opticNow(weapon));
    const caliber = caliberOf(MW[weaponIndex].id);
    const spare = this.inv.mags.filter((message) => message.cal === caliber);
    const allies = [];
    for (const remotePlayer of this.remotes.values()) {
      const structure = remotePlayer.st;
      if (!structure || structure.tm !== this.team || !structure.a) {
        continue;
      }
      allies.push({
        i: structure.i,
        x: structure.x,
        z: structure.z,
        yaw: structure.yaw,
        n: structure.n,
        down: !!(structure.xm && structure.xm[4] & 4),
        veh: !!structure.xm?.[1],
        sq: structure.xm?.[6] ?? -1,
      });
    }
    const quick = this.slots.map((index, kit) => {
      if ((index ?? null) === null || index < 0) {
        return null;
      }
      const weaponDefinition = MW[index];
      let count = null;
      if (
        weaponDefinition.id === 'he' ||
        weaponDefinition.id === 'smoke' ||
        weaponDefinition.id === 'bandage' ||
        weaponDefinition.id === 'medkit' ||
        weaponDefinition.gadget
      ) {
        count = this.inv.items[weaponDefinition.id] || 0;
      } else if (weaponDefinition.id === 'rpg') {
        count = (this.inv.loaded[index]?.n || 0) + (this.inv.items.rocket || 0);
      }
      return { k: kit + 1, name: weaponDefinition.name, on: index === this.cur, count };
    });
    this.store.set({
      hp: Math.max(0, Math.round(this.hp)),
      alive: this.alive,
      weaponId: weapon.id,
      weapon: weapon.name,
      mag: magnitude.n,
      reserve: 0,
      reloading: this.reloading,
      reloadP: Math.max(0, reloadP),
      ping: Math.round(this.net.rtt),
      fps: Math.round(this.fps),
      players,
      game: 'warfare',
      killfeed: this.killfeed.slice(),
      chat,
      damage: this.damage.slice(),
      hit: this.hit || null,
      respawnIn: this.alive ? 0 : Math.max(0, Math.ceil((this.respawnAt - nowMs) / 1000)),
      score: [0, 0],
      win: this.win ?? -1,
      nextMatchIn: this.win >= 0 ? Math.max(0, Math.ceil((this.winEndsAt - nowMs) / 1000)) : 0,
      warfare: true,
      milUiOpen: !!this.uiOpen && this.uiOpen !== 'map',
      mil: {
        bearing: bearingOf(camYaw),
        stamina: state.st,
        breath: this.breath,
        kg: this.kg,
        stance: state.prone ? 'prone' : state.crouch ? 'crouch' : 'stand',
        sprint: state.sprinting,
        walk: this.pace > 0,
        pace: this.pace,
        lean: Math.round(this.lean * 10) / 10,
        free: this.free,
        wstate: this.ads > 0.6 ? 'ADS' : this.ms.sprinting ? 'SPRINT' : 'READY',
        cross: {
          sp: this.spreadFor(weapon, this.ads > 0.6),
          fov: this.camera.fov,
          ads: this.ads,
          sliding: state.slideT > 0,
        },
        gunner: !!this.gunnerOn && !this.tp,
        rested: this.rested,
        weapon: {
          id: weapon.id,
          name: weapon.name,
          mag: magnitude.n,
          magSize: magnitude.size || weapon.mag,
          ammo: AMMO[magnitude.ammo]?.short || '',
          mags: spare.length,
          spare: spare.map((message) => [message.n, message.size, AMMO[message.ammo]?.short || '']),
          mode: this.modeOf(weapon),
          zero: this.zeroRange(weapon),
          optic: option.name,
          melee: !!weapon.melee,
          grenade: !!weapon.grenade,
          item: !!weapon.item,
          count: weapon.item || weapon.grenade ? this.inv.items[weapon.id] || 0 : null,
          zoom:
            PIP_OPTICS.has(option.id) && this.ads > 0.85
              ? Math.round((this.scopeZoom[option.id] ?? option.zoom) * 10) / 10
              : null,
        },
        quick,
        ads: this.ads,
        scope: null,
        binos: this.binosT > 0.9,
        range: this.rangefind(),
        sectors: this.sectors.map((positionX, index) => ({
          ...positionX,
          name: SECTORS[index].name,
          locked: !canCapture(this.sectors, this.team, positionX.id, CAPTURE_CHAIN),
          store: this.teamState?.stores?.[index] ?? -1,
        })),
        total: this.total
          ? {
              team: this.total.team,
              left: Math.max(0, this.total.left - (this.total.paused ? 0 : nowMs - this.total.at)),
              paused: this.total.paused,
            }
          : null,
        here,
        area,
        interact: this.interact?.text || null,
        holding: this.holdAct
          ? {
              kind: this.holdAct.kind,
              name:
                this.holdAct.kind === 'construct'
                  ? STRUCTS[this.structs.get(this.holdAct.id)?.s.type]?.name || ''
                  : '',
              p:
                this.holdAct.kind === 'construct'
                  ? (this.structs.get(this.holdAct.id)?.s.prog ?? null)
                  : this.holdAct.dur
                    ? clamp((now - this.holdAct.t0) / this.holdAct.dur, 0, 1)
                    : null,
            }
          : null,
        markers: this.markers || [],
        voice: {
          tx: this.voice.ch,
          level: this.voice.level,
          list: this.voice.activeList(),
          denied: this.voice.denied,
          vol: { ...this.voice.vol },
          muted: [...this.voice.muted],
        },
        squad: this.teamState
          ? {
              sq: this.teamState.sq ?? 0,
              lead: !!this.teamState.lead,
              squads: this.teamState.squads || [],
            }
          : null,
        prep: this.teamState?.prep || 0,
        rank: (() => {
          const index = rankOf(this.xp);
          const next = RANKS[index + 1]?.xp;
          return {
            i: index,
            name: RANKS[index].name,
            short: RANKS[index].short,
            xp: this.xp,
            next,
            prog: next ? (this.xp - RANKS[index].xp) / (next - RANKS[index].xp) : 1,
          };
        })(),
        dying: !this.alive && !!this.deathCam && nowMs - (this.deadAt || 0) < 4000,
        stats: this.winStats || null,
        suppress: Math.round((this.suppress || 0) * 100) / 100,
        med: {
          bleed: this.bleedLv,
          arms: this.wounds.arms,
          legs: this.wounds.legs,
          dragging: !!this.dragging,
        },
        using: this.using
          ? {
              name: MW[mwIndex(this.using.id)].name,
              p: clamp((now - this.using.t0) / this.using.dur, 0, 1),
            }
          : null,
        veh,
        mortar,
        mount: this.mount?.kind || null,
        spawns: this.teamState?.spawns || [],
        fobs: this.teamState?.fobs || [],
        points: this.teamState?.pts || [],
        main: this.teamState?.main ?? MIL.mainSupply,
        cooldowns: this.teamState?.cd || {},
        fleet: this.teamState?.fl || {},
        respawnIn: this.alive ? 0 : Math.max(0, Math.ceil((this.respawnAt - nowMs) / 1000)),
        downed: this.downed
          ? {
              left: Math.max(0, Math.ceil((this.downedUntil - nowMs) / 1000)),
              stable: this.downStable,
              giveUpIn: Math.max(0, Math.ceil(((this.giveUpAt || 0) - nowMs) / 1000)),
              inVeh: !!this.myVeh,
            }
          : null,
        kit: this.kit,
        cls: CLASSES[this.kit.cls]?.name || 'Assault',
        nextKit: this.nextKit || defaultKit(this.team),
        toasts: this.toasts.map(({ id, text, kind }) => ({ id, text, kind })),
        me: {
          x: state.x,
          z: state.z,
          yaw: camYaw,
          grid: gridRef(state.x, state.z),
          alt: Math.round(state.y),
        },
        allies,
        team: this.team,
        tod: this.tod,
        clock: (() => {
          const message = this.dayMin ?? 20;
          const height = (((message - 4) * 16) / 60 + 6 + 24) % 24;
          return `${String(Math.floor(height)).padStart(2, '0')}:${String(Math.floor((height % 1) * 60)).padStart(2, '0')}`;
        })(),
        nvg: this.nvg,
        light: this.light,
        mapOpen: this.mapOpen,
        spots: this.spotList(nowMs),
        tickets: this.tickets || [0, 0],
        maxTickets: MIL.tickets,
        score: Math.round(this.xp || 0),
        vehicles: [...this.veh.values()]
          .filter((vehicle) => vehicle.st.alive && vehicle.st.team === this.team)
          .map((vehicle) => ({
            id: vehicle.st.id,
            type: vehicle.st.type,
            x: vehicle.st.x,
            z: vehicle.st.z,
            yaw: vehicle.st.yaw,
            crew: crewOf(vehicle.st.id) + (this.myVeh?.id === vehicle.st.id ? 1 : 0),
            seats: VEHICLES[vehicle.st.type].seats,
            heli: VEHICLES[vehicle.st.type].kind === 'heli',
          })),
      },
    });
  }

  renderScopeView(result, zoom) {
    if (!this.scopeRT) {
      this.scopeRT = new THREE.WebGLRenderTarget(SCOPE_RT_PX, SCOPE_RT_PX);
      this.scopeCam = new THREE.PerspectiveCamera(10, 1, 0.1, this.camera.far);
      setScopeTexture(this.scopeRT.texture);
    }
    const scopeCamera = this.scopeCam;
    this.camera.getWorldPosition(scopeCamera.position);
    this.camera.getWorldQuaternion(scopeCamera.quaternion);
    scopeCamera.fov = SCOPE_APPARENT_FOV / Math.max(1, zoom);
    scopeCamera.far = this.camera.far;
    scopeCamera.updateProjectionMatrix();
    scopeCamera.updateMatrixWorld(true);
    const shadows = result.shadowMap.autoUpdate;
    result.shadowMap.autoUpdate = false;
    result.setRenderTarget(this.scopeRT);
    result.clear();
    result.render(this.scene, scopeCamera);
    result.setRenderTarget(null);
    result.shadowMap.autoUpdate = shadows;
  }

  render() {
    const result = this.renderer;
    result.info.autoReset = false;
    this.drawCalls = result.info.render.calls;
    this.drawTris = result.info.render.triangles;
    result.info.reset();
    result.clear();
    if (!this.joined || !this.world) {
      result.render(this.lobby.scene, this.lobby.camera);
      return;
    }
    result.render(this.scene, this.camera);
    const weapon = MW[this.cur];
    const option = opticOf(this.opticNow(weapon));
    const scoped = !!this.pipOn && this.ads > 0.55 && this.alive && !this.downed && !this.mapOpen;
    if (scoped) {
      this.renderScopeView(result, this.scopeZoom[option.id] ?? option.zoom);
    }
    this.scopeShown = scoped;
    if (
      this.alive &&
      !this.downed &&
      !this.myVeh &&
      !this.mount &&
      this.binosT < 0.95 &&
      !this.mapOpen
    ) {
      result.clearDepth();
      this.viewmodel.render(result);
    }
  }
}
