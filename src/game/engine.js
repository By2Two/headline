import * as THREE from 'three';
import { getMap, DEFAULT_MAP, solidsOf, groundAt } from '../../shared/map.js';
import { PLAYER, MOVE, INTERP_MS, MAX_RANGE, RESPAWN_MS } from '../../shared/constants.js';
import { createMoveState, stepPlayer, solidsWithBodies } from '../../shared/movement.js';
import { raycastWorld, traceShot } from '../../shared/raycast.js';
import { pelletDirs } from '../../shared/pellets.js';
import {
  WEAPONS,
  DEFAULT_LOADOUTS,
  loadoutSlots,
  sanitizeLoadout,
  teamKey,
  C4,
} from '../../shared/weapons.js';
import { COMP, siteAt, nearSite } from '../../shared/comp.js';
import { ECON, PRICES } from '../../shared/econ.js';
import { allowedFor } from '../../shared/weapons.js';
import { buildC4, BUILDERS } from './guns.js';
import { NADE, nadeStart, stepNade, smokeBlocks } from '../../shared/nade.js';
import { buildWorld, disposeWorld } from './world.js';
import { Effects } from './effects.js';
import { Viewmodel } from './viewmodel.js';
import { RemotePlayer } from './players.js';
import { Net } from './net.js';
import { GameAudio } from './audio.js';
import { Lobby } from './lobby.js';
import { CharacterRig } from './character.js';
import { sanitizeLook, decodeLook } from '../../shared/look.js';
import { sanitizeSkins, SKINS } from '../../shared/skins.js';
import { applySkin } from './skins.js';

const GRAPHICS = {
  high: { shadows: true, shadowType: THREE.PCFSoftShadowMap, shadowSize: 2048 },
  medium: { shadows: true, shadowType: THREE.PCFShadowMap, shadowSize: 1024 },
  low: { shadows: false, shadowType: THREE.PCFShadowMap, shadowSize: 1024 },
};

const MOUSE_LOCK_SETTLE_MS = 80;

const FIXED_DT = 1 / 60;
const HEAVY_GUNS = new Set(['awp', 'deagle', 'shotgun']);
const DEGREES_TO_RADIANS = Math.PI / 180;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const LOCK_KEYS = [
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyR',
  'KeyC',
  'KeyH',
  'KeyT',
  'KeyN',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'KeyG',
  'KeyE',
  'KeyB',
  'KeyF',
  'Space',
  'Tab',
  'KeyM',
  'ControlLeft',
  'ControlRight',
];
const freshAmmo = () => WEAPONS.map((weapon) => ({ mag: weapon.mag, reserve: weapon.reserve }));

const LOBBY_ORBIT_SPEED = 0.06;
const LOBBY_ORBIT_RADIUS = 0.85;
const LOBBY_ORBIT_HEIGHT_M = 26;
export class Engine {
  constructor(canvas, store, settings) {
    this.canvas = canvas;
    this.store = store;
    this.settings = { ...settings };

    const renderer = (this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.autoClear = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 300);
    this.camera.rotation.order = 'YXZ';
    this.map = getMap(DEFAULT_MAP);
    this.game = 'tdm';
    this.gg = { level: 0, kills: 0 };
    this.broken = new Set();
    this.solids = solidsOf(this.map, this.broken);
    this.worldGroup = buildWorld(this.scene, this.map.id);
    this.effects = new Effects(this.scene);
    this.effects.ground = (positionX, positionZ) => groundAt(this.map, positionX, positionZ);
    this.comp = null;
    this.nades = new Map();
    this.drops = new Map();
    this.dropTarget = null;
    this.money = 0;
    this.moneyFx = [];
    this.buyOpen = false;
    this.outlineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide });
    this.smokes = [];
    this.planting = 0;
    this.defusing = 0;
    this.shake = 0;
    const bomb = buildC4(false);
    this.bombProp = bomb.group;
    this.bombProp.scale.setScalar(1.5);
    this.bombLed = bomb.led;
    this.bombProp.visible = false;
    this.scene.add(this.bombProp);
    this.viewmodel = new Viewmodel();
    this.audio = new GameAudio(settings.volume);
    this.net = new Net(
      (message) => this.onMessage(message),
      (state) => this.onStatus(state),
    );
    this.remotes = new Map();

    this.joined = false;
    this.alive = false;
    this.myId = null;
    this.team = 0;
    this.spawnCount = 0;
    this.hp = 100;
    this.yaw = 0;
    this.pitch = 0;
    this.punch = { pitch: 0, yaw: 0 };
    this.ms = createMoveState(0, 0, 0);
    this.ms.px = this.ms.py = this.ms.pz = 0;
    this.eyeH = PLAYER.eye;
    this.roll = 0;
    this.speedH = 0;
    this.stepDist = 0;

    this.keys = new Set();
    this.mouse = { l: false, r: false };
    this.locked = false;
    this.keysLocked = false;
    this.jumpPress = false;
    this.lockedAt = 0;
    this.mouseAvg = 0;
    this.lookDX = 0;
    this.lookDY = 0;

    this.prefTeam = settings.team === 'CT' ? 'CT' : 'T';
    this.loadouts = {
      T: sanitizeLoadout(settings.loadouts?.T, 'T'),
      CT: sanitizeLoadout(settings.loadouts?.CT, 'CT'),
    };
    this.loadout = this.loadouts[this.prefTeam];
    this.slots = loadoutSlots(this.loadout, this.prefTeam);
    this.cur = this.slots[0];
    this.lastWeapon = this.slots[1];
    this.look = sanitizeLook(settings.look);
    this.lobby = new Lobby(this.loadout.primary, this.look);
    this.selfBody = new CharacterRig(this.look);
    this.viewmodel.setLook(this.look);
    this.selfBody.torso.visible = false;
    this.selfBody.pelvis.children.forEach((competitive) => {
      if (competitive.isMesh) {
        competitive.visible = false;
      }
    });
    this.selfBody.root.visible = false;
    this.scene.add(this.selfBody.root);
    this.ammo = freshAmmo();
    this.reloading = false;
    this.reloadStart = 0;
    this.reloadEnd = 0;
    this.nextFire = 0;
    this.readyAt = 0;
    this.drawStart = 0;
    this.fireQueued = 0;
    this.lastShot = -10;
    this.spray = 0;
    this.inacc = 0;
    this.scope = 0;
    this.kick = 0;
    this.crossGap = 8;
    this.currentFov = settings.fov;

    this.killfeed = [];
    this.damage = [];
    this.chat = [];
    this.chatting = false;
    this.hitCounter = 0;
    this.hit = null;
    this.latest = null;
    this.respawnAt = 0;
    this.debug = false;

    this.acc = 0;
    this.lastFrame = performance.now() / 1000;
    this.fps = 60;
    this.lastSend = 0;
    this.lastHud = 0;
    this.seq = 0;
    this.pending = [];
    this.outbox = [];
    this.corr = new THREE.Vector3();

    this.bind();
    this.resize();
    this.applySettings(settings);
    this.raf = requestAnimationFrame(this.loop);
  }

  bind() {
    this.h = {
      keydown: (event) => this.onKey(event, true),
      keyup: (event) => this.onKey(event, false),
      mousedown: (event) => this.onMouse(event, true),
      mouseup: (event) => this.onMouse(event, false),
      mousemove: (event) => this.onMouseMove(event),
      resize: () => this.resize(),
      blur: () => {
        this.keys.clear();
        this.mouse.l = this.mouse.r = false;
      },
      plock: () => this.onLockChange(),
      fs: () => {
        if (!document.fullscreenElement) {
          this.keysLocked = false;
        }
      },
      ctx: (event) => event.preventDefault(),
      wheel: (event) => {
        if (this.locked && !this.chatting) {
          this.jumpPress = true;
        }
      },
    };
    window.addEventListener('keydown', this.h.keydown);
    window.addEventListener('keyup', this.h.keyup);
    window.addEventListener('mousedown', this.h.mousedown);
    window.addEventListener('mouseup', this.h.mouseup);
    window.addEventListener('mousemove', this.h.mousemove);
    window.addEventListener('resize', this.h.resize);
    window.addEventListener('blur', this.h.blur);
    window.addEventListener('contextmenu', this.h.ctx);
    window.addEventListener('wheel', this.h.wheel, { passive: true });
    document.addEventListener('pointerlockchange', this.h.plock);
    document.addEventListener('fullscreenchange', this.h.fs);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.h.keydown);
    window.removeEventListener('keyup', this.h.keyup);
    window.removeEventListener('mousedown', this.h.mousedown);
    window.removeEventListener('mouseup', this.h.mouseup);
    window.removeEventListener('mousemove', this.h.mousemove);
    window.removeEventListener('resize', this.h.resize);
    window.removeEventListener('blur', this.h.blur);
    window.removeEventListener('contextmenu', this.h.ctx);
    window.removeEventListener('wheel', this.h.wheel);
    document.removeEventListener('pointerlockchange', this.h.plock);
    document.removeEventListener('fullscreenchange', this.h.fs);
    this.net.close();
    this.lobby.dispose();
    this.selfBody.dispose();
    this.renderer.dispose();
  }

  applyGraphics() {
    const preset = GRAPHICS[this.settings.tacGfx] ?? GRAPHICS.high;
    const renderer = this.renderer;
    const changed =
      renderer.shadowMap.enabled !== preset.shadows ||
      renderer.shadowMap.type !== preset.shadowType;
    renderer.shadowMap.enabled = preset.shadows;
    renderer.shadowMap.type = preset.shadowType;
    this.worldGroup?.traverse((object) => {
      if (
        object.isDirectionalLight &&
        object.shadow &&
        object.shadow.mapSize.x !== preset.shadowSize
      ) {
        object.shadow.mapSize.set(preset.shadowSize, preset.shadowSize);
        object.shadow.map?.dispose();
        object.shadow.map = null;
      }
    });
    if (changed) {
      this.scene.traverse((object) => {
        for (const material of [].concat(object.material ?? [])) {
          material.needsUpdate = true;
        }
      });
    }
  }

  applySettings(state) {
    this.settings = { ...this.settings, ...state };
    this.applyGraphics();
    this.audio.setVolume(this.settings.volume);
    if (state.team) {
      this.prefTeam = state.team === 'CT' ? 'CT' : 'T';
    }
    if (state.loadouts) {
      this.loadouts = {
        T: sanitizeLoadout(state.loadouts.T, 'T'),
        CT: sanitizeLoadout(state.loadouts.CT, 'CT'),
      };
      this.setLoadout(this.loadouts[this.teamNow()]);
      this.lobby.setWeapon(this.loadout.primary);
    }
    this.lobby.rig.setTeam(this.prefTeam === 'CT' ? 1 : 0);
    if (state.skins) {
      const next = sanitizeSkins(
        state.skins,
        WEAPONS.map((weapon) => weapon.id),
      );
      if (JSON.stringify(next) !== JSON.stringify(this.skins)) {
        this.skins = next;
        this.viewmodel.setSkins(next);
        this.lobby.setSkins(next);
        if (this.joined) {
          this.net.send({ t: 'skins', s: next });
        }
      }
    }
    if (state.look) {
      this.look = sanitizeLook(state.look);
      this.lobby.setLook(this.look);
      this.selfBody.setLook(this.look);
      this.viewmodel.setLook(this.look);
    }
  }

  teamNow() {
    return this.joined ? teamKey(this.team) : this.prefTeam;
  }

  setLoadout(loadout) {
    const next = { ...DEFAULT_LOADOUTS[this.teamNow()], ...loadout };
    if (
      next.primary === this.loadout.primary &&
      next.secondary === this.loadout.secondary &&
      next.melee === this.loadout.melee
    ) {
      return;
    }
    this.loadout = next;
    if (this.joined) {
      this.net.send({ t: 'loadout', lo: next });
    }
  }

  resize() {
    const weapon = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(weapon, height, false);
    this.camera.aspect = weapon / height;
    this.camera.updateProjectionMatrix();
    this.viewmodel.setAspect(weapon / height);
    this.lobby.setAspect(weapon / height);
  }

  connect(name, options = {}) {
    this.store.set({ phase: 'connecting', message: '' });
    const { server = '', ...rest } = options;
    this.server = server;
    this.loadout = this.loadouts[this.prefTeam];
    this.net.connect(
      {
        t: 'join',
        name: name || 'Player',
        team: this.prefTeam === 'CT' ? 1 : 0,
        lo: this.loadout,
        look: this.look,
        skins: this.skins,
        ...rest,
      },
      server,
    );
  }

  previewWeapon(id) {
    this.lobby.preview(id);
  }

  rotateLobby(deltaX) {
    if ((deltaX ?? null) === null) {
      this.lobby.release();
    } else {
      this.lobby.drag(deltaX);
    }
  }

  setMap(id) {
    const map = getMap(id);
    if (map === this.map) {
      return;
    }
    this.map = map;
    this.broken = new Set();
    this.solids = solidsOf(map, this.broken);
    disposeWorld(this.scene, this.worldGroup);
    this.worldGroup = buildWorld(this.scene, map.id);
    this.applyGraphics();
    this.effects.clear();
  }

  onGunGame(message) {
    this.gg = {
      level: message.gl,
      kills: message.gk,
      down: message.dn ? Date.now() : this.gg?.down,
    };
    if (!message.up || !Array.isArray(message.sl)) {
      return;
    }
    const now = performance.now() / 1000;
    this.slots = message.sl;
    this.cur = message.sl[0];
    this.lastWeapon = message.sl[2];
    const weapon = WEAPONS[this.cur];
    this.ammo[this.cur] = { mag: weapon.mag, reserve: weapon.reserve };
    this.reloading = false;
    this.scope = 0;
    this.spinStart = 0;
    this.primeStart = 0;
    this.readyAt = now + weapon.drawTime;
    this.drawStart = now;
    this.viewmodel.setWeapon(this.cur);
    this.audio.levelUp();
  }

  breakDoor(id, withEffects = true) {
    if (this.broken.has(id)) {
      return;
    }
    this.broken.add(id);
    this.solids = solidsOf(this.map, this.broken);
    const box = this.map.doors[id];
    if (box) {
      this.effects.clearDecalsIn(box.min, box.max);
    }
    const mesh = this.worldGroup.userData.doors?.get(id);
    if (mesh) {
      mesh.visible = false;
      if (withEffects) {
        this.effects.debris(mesh.position, mesh.scale);
        this.audio.doorBreak(
          this.spatial({ x: mesh.position.x, y: mesh.position.y, z: mesh.position.z }),
        );
      }
    }
  }

  setDoors(list) {
    this.broken = new Set();
    this.worldGroup.userData.doors?.forEach((message) => {
      message.visible = true;
    });
    for (const id of list || []) {
      this.breakDoor(id, false);
    }
    this.solids = solidsOf(this.map, this.broken);
  }

  updateSpotted() {
    const now = performance.now();
    if (now - (this.spotAt || 0) < 120) {
      return;
    }
    this.spotAt = now;
    const ffa = this.game === 'gungame';
    const eyes = [];
    if (this.alive) {
      eyes.push([this.ms.x, this.ms.y + PLAYER.eye, this.ms.z]);
    }
    const enemies = [];
    for (const remotePlayer of this.remotes.values()) {
      const snapshotState = remotePlayer.st;
      if (!snapshotState || !snapshotState.a || remotePlayer.rig.dead) {
        continue;
      }
      if (!ffa && snapshotState.tm === this.team) {
        eyes.push([snapshotState.x, snapshotState.y + PLAYER.eye, snapshotState.z]);
      } else {
        enemies.push(remotePlayer);
      }
    }
    for (const remotePlayer of enemies) {
      const snapshotState = remotePlayer.st;
      const targets = [
        [snapshotState.x, snapshotState.y + 1.65, snapshotState.z],
        [snapshotState.x, snapshotState.y + 1.0, snapshotState.z],
      ];
      const seenNow = eyes.some((origin) =>
        targets.some((press) => {
          const direction = [press[0] - origin[0], press[1] - origin[1], press[2] - origin[2]];
          const length = Math.hypot(direction[0], direction[1], direction[2]);
          if (length < 0.5) {
            return true;
          }
          if (length > 120) {
            return false;
          }
          return (
            !raycastWorld(
              origin,
              [direction[0] / length, direction[1] / length, direction[2] / length],
              length - 0.3,
              this.solids,
            ) && !smokeBlocks(this.smokes, origin, press)
          );
        }),
      );
      if (seenNow) {
        remotePlayer.spottedUntil = now + 1000;
      }
    }
  }

  radar() {
    if (!this.joined) {
      return null;
    }
    const ffa = this.game === 'gungame';
    const now = performance.now();
    const players = [];
    for (const remotePlayer of this.remotes.values()) {
      const snapshotState = remotePlayer.st;
      if (!snapshotState || !snapshotState.a || remotePlayer.rig.dead) {
        continue;
      }
      const mate = !ffa && snapshotState.tm === this.team;
      if (!mate && !(remotePlayer.spottedUntil > now)) {
        continue;
      }
      players.push({
        x: snapshotState.x,
        z: snapshotState.z,
        yaw: snapshotState.yaw,
        team: snapshotState.tm,
        mate,
        i: snapshotState.i,
      });
    }
    const color = ffa ? '#ffffff' : this.team === 0 ? '#e8a64a' : '#5b9cf0';
    let bomb = null;
    const competitive = this.comp;
    if (competitive && (competitive.b === 'planted' || competitive.b === 'defused')) {
      bomb = { x: competitive.bp[0], z: competitive.bp[2], planted: true };
    } else if (competitive && this.team === 0 && competitive.b === 'dropped' && competitive.bp) {
      bomb = { x: competitive.bp[0], z: competitive.bp[2] };
    } else if (competitive && this.team === 0 && competitive.b === 'carried') {
      bomb = { carrier: competitive.bc };
    }
    if (this.spec) {
      const snapshotState = this.spec.st;
      return {
        bomb,
        myId: this.spec.id,
        me: {
          x: snapshotState.x,
          z: snapshotState.z,
          yaw: snapshotState.yaw,
          alive: true,
          color: snapshotState.tm === 0 ? '#e8a64a' : snapshotState.tm === 1 ? '#5b9cf0' : '#fff',
        },
        players: players.filter((press) => press.i !== this.spec.id),
      };
    }
    return {
      bomb,
      myId: this.myId,
      me: { x: this.ms.x, z: this.ms.z, yaw: this.yaw, alive: this.alive, color },
      players,
    };
  }

  solidsNow(state) {
    const bodies = [];
    for (const remotePlayer of this.remotes.values()) {
      const snapshotState = remotePlayer.st;
      if (snapshotState && snapshotState.a) {
        bodies.push({
          x: snapshotState.x,
          y: snapshotState.y,
          z: snapshotState.z,
          crouch: !!snapshotState.c,
        });
      }
    }
    return solidsWithBodies(this.solids, state, bodies);
  }

  roomCommand(message) {
    this.net.send(message);
  }

  releaseForLobby(room) {
    this.inLobby = !!room?.lobby;
    if (room?.lobby && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  orbitMap(now) {
    const angle = now * LOBBY_ORBIT_SPEED;
    const radius = Math.max(this.map.hx, this.map.hz) * LOBBY_ORBIT_RADIUS;
    this.camera.position.set(
      Math.cos(angle) * radius,
      LOBBY_ORBIT_HEIGHT_M,
      Math.sin(angle) * radius,
    );
    this.camera.lookAt(0, 0, 0);
  }

  backToMenu(message) {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    this.net.close();
    this.resetMatch();
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    this.store.set({
      phase: message ? 'error' : 'menu',
      message: message || '',
      board: false,
      bigMap: false,
      room: null,
    });
  }

  enterFullscreen() {
    const element = document.documentElement;
    const lockKeys = () => {
      if (!navigator.keyboard?.lock) {
        return;
      }
      navigator.keyboard
        .lock(LOCK_KEYS)
        .then(() => {
          this.keysLocked = true;
        })
        .catch(() => {});
    };
    if (document.fullscreenElement) {
      return lockKeys();
    }
    if (element.requestFullscreen) {
      element
        .requestFullscreen({ navigationUI: 'hide' })
        .then(lockKeys)
        .catch(() => {});
    }
  }

  leave() {
    this.backToMenu('');
  }

  resetMatch() {
    this.inLobby = false;
    this.joined = false;
    this.alive = false;
    this.myId = null;
    this.latest = null;
    this.killfeed = [];
    this.damage = [];
    this.hit = null;
    this.chat = [];
    this.chatting = false;
    this.store.set({ chatOpen: false, chat: [] });
    this.remotes.forEach((remotePlayer) => remotePlayer.dispose());
    this.remotes.clear();
    for (const id of [...this.drops.keys()]) {
      this.removeDrop(id);
    }
    this.clearNades();
    this.effects.clearGibs();
    this.comp = null;
    this.planting = this.defusing = 0;
    this.bombAnim = null;
    this.siteFlash = null;
  }

  lock() {
    if (this.settings.fullscreen) {
      this.enterFullscreen();
    }
    try {
      const press = this.canvas.requestPointerLock(
        this.settings.rawInput === false ? undefined : { unadjustedMovement: true },
      );
      if (press && press.catch) {
        press.catch(() => this.canvas.requestPointerLock());
      }
    } catch {
      this.canvas.requestPointerLock();
    }
  }

  onLockChange() {
    this.locked = document.pointerLockElement === this.canvas;
    this.lockedAt = performance.now();
    this.mouseAvg = 0;
    if (!this.locked && this.chatting) {
      this.closeChat();
    }
    if (!this.locked) {
      this.keys.clear();
      this.mouse.l = this.mouse.r = false;
    }
    this.store.set({ locked: this.locked });
  }

  onStatus(state) {
    if (state === 'closed' || state === 'error') {
      this.joined = false;
      this.alive = false;
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
      this.resetMatch();
      this.store.set({
        phase: 'error',
        message: 'Connection lost. Make sure the server is running.',
      });
    }
  }

  onKey(event, down) {
    if (this.chatting) {
      return;
    }
    if (
      this.buyOpen &&
      down &&
      !event.repeat &&
      (event.code === 'KeyB' || event.code === 'Escape')
    ) {
      event.preventDefault();
      this.closeBuy();
      return;
    }
    if (event.code === 'Tab') {
      event.preventDefault();
      if (this.joined) {
        this.store.set({ board: down });
      }
      return;
    }
    if (event.code === 'KeyM') {
      event.preventDefault();
      if (this.joined && !event.repeat) {
        this.store.set({ bigMap: down });
      }
      return;
    }
    if (!this.locked) {
      return;
    }
    if (!['F5', 'F11', 'F12'].includes(event.code)) {
      event.preventDefault();
    }
    if (down) {
      if (event.repeat) {
        return;
      }
      this.keys.add(event.code);
      if (event.code === 'KeyT' && this.joined) {
        this.openChat();
      } else if (event.code === 'KeyR') {
        this.startReload();
      } else if (event.code === 'KeyF' && this.alive && !this.reloading && !this.planting) {
        this.viewmodel.inspect();
      } else if (event.code === 'Digit1') {
        this.switchTo(this.slots[0]);
      } else if (event.code === 'Digit2') {
        this.switchTo(this.slots[1]);
      } else if (event.code === 'Digit3') {
        this.switchTo(this.slots[2]);
      } else if (
        event.code === 'Digit4' &&
        (this.slots[3] ?? null) !== null &&
        this.ammo[this.slots[3]]?.mag > 0
      ) {
        this.switchTo(this.slots[3]);
      } else if (event.code === 'Digit5' && (this.slots[4] ?? null) !== null) {
        this.switchTo(this.slots[4]);
      } else if (event.code === 'KeyG' && this.game === 'comp') {
        this.net.send({ t: this.cur === C4 ? 'drop' : 'dropw' });
      } else if (event.code === 'KeyB' && (this.game === 'comp' || this.game === 'tdm')) {
        this.openBuy();
      } else if (event.code === 'KeyE' && !this.canDefuse && this.dropTarget) {
        this.net.send({ t: 'pick', id: this.dropTarget.id });
      } else if (event.code === 'KeyQ') {
        this.switchTo(this.quickSwitchTarget());
      } else if (event.code === 'KeyH') {
        this.debug = !this.debug;
        this.remotes.forEach((remotePlayer) => remotePlayer.setDebug(this.debug));
        this.store.set({ debug: this.debug });
      }
    } else {
      this.keys.delete(event.code);
    }
  }

  openChat() {
    this.chatting = true;
    this.keys.clear();
    this.mouse.l = this.mouse.r = false;
    this.store.set({ chatOpen: true });
  }

  closeChat() {
    this.chatting = false;
    this.store.set({ chatOpen: false });
  }

  sendChat(text) {
    const message = text.trim().slice(0, 120);
    if (message) {
      this.net.send({ t: 'chat', m: message });
    }
    this.closeChat();
  }

  onMouse(event, down) {
    if (!this.locked) {
      return;
    }
    const now = performance.now() / 1000;
    if (event.button === 0) {
      this.mouse.l = down;
      if (down) {
        this.fireQueued = now + 0.12;
      }
    } else if (event.button === 2) {
      if (down && !this.alive && this.spec) {
        this.specNext = true;
      }
      this.mouse.r = down;
      if (down) {
        this.toggleScope();
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
    const sensitivity = this.settings.sens * 0.022 * DEGREES_TO_RADIANS * fovScale;
    this.yaw -= mouseDeltaX * sensitivity;
    this.pitch = clamp(
      this.pitch - mouseDeltaY * sensitivity,
      -89.5 * DEGREES_TO_RADIANS,
      89.5 * DEGREES_TO_RADIANS,
    );
    this.lookDX += mouseDeltaX;
    this.lookDY += mouseDeltaY;
  }

  takeJumpPress() {
    const press = this.jumpPress;
    this.jumpPress = false;
    return press;
  }

  getInput() {
    const keys = this.keys;
    const busy = !!this.planting || !!this.defusing;
    const live = this.locked && this.alive && !this.chatting && !busy && this.comp?.ph !== 'freeze';
    const weapon = WEAPONS[this.cur];
    let speedMult = weapon.moveMult;
    if (weapon.scope && this.scope > 0) {
      speedMult *= weapon.scopedMove;
    }
    return {
      fwd: live ? (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) : 0,
      right: live ? (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) : 0,
      jump: live && keys.has('Space'),
      jumpPress: this.takeJumpPress() && live,
      walk: live && (keys.has('ShiftLeft') || keys.has('ShiftRight')),
      crouch:
        busy || (live && (keys.has('KeyC') || keys.has('ControlLeft') || keys.has('ControlRight'))),
      yaw: Math.round(this.yaw * 100000) / 100000,
      speedMult,
      ad: this.scope > 0 ? 1 : 0,
    };
  }

  onMessage(message) {
    switch (message.t) {
      case 'welcome':
        this.myId = message.id;
        this.team = message.team;
        this.joined = true;
        this.setLoadout(this.loadouts[teamKey(message.team)]);
        if (message.room?.map) {
          this.setMap(message.room.map);
        }
        this.game = message.room?.game || 'tdm';
        this.setDoors(message.room?.doors);
        this.store.set({
          phase: 'playing',
          myId: message.id,
          team: message.team,
          room: message.room || null,
        });
        this.releaseForLobby(message.room);
        break;
      case 'room':
        if (message.map) {
          this.setMap(message.map);
        }
        if (message.doors) {
          this.setDoors(message.doors);
        }
        this.store.set({ room: { ...message, t: undefined } });
        this.releaseForLobby(message);
        break;
      case 'closed':
        this.backToMenu(message.m || 'The room was closed.');
        break;
      case 'error':
        this.backToMenu(message.m || 'Could not join.');
        break;
      case 'respawn':
        this.onRespawn(message);
        break;
      case 'ack':
        this.onAck(message);
        break;
      case 'correct':
        this.ms.x = message.p[0];
        this.ms.y = message.p[1];
        this.ms.z = message.p[2];
        this.ms.px = message.p[0];
        this.ms.py = message.p[1];
        this.ms.pz = message.p[2];
        this.ms.vx = this.ms.vy = this.ms.vz = 0;
        break;
      case 'snap':
        this.onSnap(message);
        break;
      case 'shot':
        this.onRemoteShot(message);
        break;
      case 'hit':
        this.onHit(message);
        break;
      case 'hurt':
        this.onHurt(message);
        break;
      case 'chat':
        this.chat.push({
          id: performance.now() + Math.random(),
          n: message.n,
          tm: message.tm,
          m: message.m,
          mine: message.i === this.myId,
          t: performance.now(),
        });
        if (this.chat.length > 30) {
          this.chat.shift();
        }
        this.audio.chat();
        break;
      case 'door':
        this.breakDoor(message.id);
        break;
      case 'gg':
        this.onGunGame(message);
        break;
      case 'doors':
        this.setDoors(message.broken);
        break;
      case 'win':
        if (message.team === this.team) {
          this.audio.kill();
        }
        break;
      case 'team':
        this.team = message.team;
        this.setLoadout(this.loadouts[teamKey(message.team)]);
        this.store.set({ team: message.team });
        break;
      case 'money':
        this.money = message.m;
        if (message.d) {
          this.moneyFx.push({
            id: performance.now() + Math.random(),
            d: message.d,
            why: message.why,
            t: performance.now(),
          });
        }
        if (message.d > 0) {
          this.audio.cash();
        }
        break;
      case 'inv':
        this.applyInv(message);
        break;
      case 'armor':
        this.armor = message.a;
        break;
      case 'wdrop':
        this.addDrop(message);
        break;
      case 'wpick':
        this.removeDrop(message.id);
        if (message.i === this.myId) {
          this.audio.pickup();
        }
        break;
      case 'bomb':
        this.slots = message.sl;
        if (!this.slots.includes(this.cur)) {
          this.planting = 0;
          const now = performance.now() / 1000;
          this.cur = message.w ?? this.slots[0];
          this.viewmodel.setWeapon(this.cur);
          this.readyAt = now + WEAPONS[this.cur].drawTime;
          this.drawStart = now;
        }
        if (this.lastWeapon === C4 && !this.slots.includes(C4)) {
          this.lastWeapon = this.slots[1];
        }
        break;
      case 'nade':
        this.spawnNade(message);
        break;
      case 'he': {
        this.endNade(message.id);
        const position = new THREE.Vector3(message.p[0], message.p[1] + 0.2, message.p[2]);
        this.blast(position, 0.8, 9);
        this.effects.explosion(position, 0.45);
        this.audio.heBoom(this.spatial({ x: position.x, y: position.y, z: position.z }));
        this.shake = Math.max(
          this.shake,
          Math.max(0, 0.7 - this.camera.position.distanceTo(position) / 25),
        );
        break;
      }
      case 'smoke':
        this.endNade(message.id);
        this.effects.smokeCloud(
          new THREE.Vector3(message.p[0], message.p[1], message.p[2]),
          NADE.smokeMs,
        );
        this.smokes.push({ p: message.p, until: performance.now() + NADE.smokeMs });
        this.audio.smokePop(
          this.spatial({ x: message.p[0], y: message.p[1] + 0.3, z: message.p[2] }),
        );
        break;
      case 'round':
        this.clearNades();
        this.effects.clearGibs();
        for (const id of [...this.drops.keys()]) {
          this.removeDrop(id);
        }
        this.planting = this.defusing = 0;
        this.bombAnim = null;
        this.siteFlash = null;
        this.compBanner = { kind: 'round', r: message.r, at: performance.now() };
        this.audio.roundStart();
        break;
      case 'live':
        if (this.comp) {
          this.comp.liveAt = performance.now();
        }
        if (this.buyOpen && !this.canBuyNow()) {
          this.closeBuy();
        }
        this.audio.go();
        break;
      case 'rend':
        this.compBanner = { kind: 'end', w: message.w, why: message.why, at: performance.now() };
        this.audio.roundEnd(message.w === this.team);
        break;
      case 'half':
        this.compBanner = { kind: 'half', at: performance.now() };
        break;
      case 'planted':
        this.compBanner = { kind: 'planted', site: message.s, at: performance.now() };
        if (this.comp) {
          Object.assign(this.comp, {
            b: 'planted',
            bp: message.p,
            bs: message.s,
            explodeAt: performance.now() + message.ex,
          });
        }
        this.nextBeep = 0;
        this.audio.planted();
        break;
      case 'defused':
        if (this.comp) {
          this.comp.b = 'defused';
        }
        this.audio.defused();
        break;
      case 'dfs':
        this.audio.defuseStart(this.spatial({ x: message.p[0], y: message.p[1], z: message.p[2] }));
        if (message.i !== this.myId) {
          this.otherDefuser = message.i;
        }
        break;
      case 'dfx':
        if (this.otherDefuser === message.i) {
          this.otherDefuser = null;
        }
        break;
      case 'boom':
        if (this.comp) {
          this.comp.b = 'exploded';
        }
        this.onBoom(message.p);
        break;
      case 'bdrop':
        this.bombAnim = { from: message.from, to: message.p, t0: performance.now() };
        if (this.comp) {
          Object.assign(this.comp, { b: 'dropped', bp: message.p, bc: undefined });
        }
        this.audio.drop(this.spatial({ x: message.p[0], y: message.p[1], z: message.p[2] }));
        break;
      case 'bpick':
        this.bombAnim = null;
        if (this.comp) {
          Object.assign(this.comp, { b: 'carried', bc: message.i });
        }
        if (message.i === this.myId) {
          this.audio.pickup();
        }
        break;
      case 'kill':
        this.onKill(message);
        break;
      case 'full':
        this.store.set({ phase: 'error', message: 'Server is full.' });
        break;
      default:
    }
  }

  onRespawn(message) {
    const state = this.ms;
    Object.assign(state, createMoveState(message.p[0], message.p[1], message.p[2]));
    state.px = state.x;
    state.py = state.y;
    state.pz = state.z;
    this.yaw = message.yaw;
    this.pitch = 0;
    this.punch.pitch = this.punch.yaw = 0;
    this.spawnCount = message.sp;
    this.jumpPress = false;
    if ((message.gl ?? null) !== null) {
      this.gg = { level: message.gl, kills: message.gk || 0 };
    }
    this.pending = [];
    this.outbox = [];
    this.corr.set(0, 0, 0);
    this.alive = true;
    this.hp = 100;
    this.ammo = Array.isArray(message.am)
      ? message.am.map(([magnitude, reserve]) => ({ mag: magnitude, reserve }))
      : freshAmmo();
    this.armor = message.ar || 0;
    if (message.ws || this.wskin) {
      this.wskin = message.ws || {};
      this.applyWeaponSkins();
    }
    this.slots = Array.isArray(message.sl)
      ? message.sl
      : loadoutSlots(this.loadout, this.teamNow());
    this.cur = this.slots[0];
    this.lastWeapon = this.slots[1];
    this.reloading = false;
    this.scope = 0;
    this.inacc = 0;
    this.spray = 0;
    this.eyeH = PLAYER.eye;
    this.roll = 0;
    this.spec = null;
    this.deadAt = 0;
    this.updateSpectate();
    this.viewmodel.setWeapon(this.cur);
    const now = performance.now() / 1000;
    this.readyAt = now + WEAPONS[this.cur].drawTime;
    this.drawStart = now;
    this.nextFire = 0;
    this.lastSend = 0;
  }

  onAck(message) {
    if (!this.alive || message.sp !== this.spawnCount) {
      return;
    }
    this.pending = this.pending.filter((competitive) => competitive.seq > message.s);
    const state = this.ms;
    const beforeX = state.x;
    const beforeY = state.y;
    const beforeZ = state.z;
    const value = message.ms;
    Object.assign(state, {
      x: value[0],
      y: value[1],
      z: value[2],
      vx: value[3],
      vy: value[4],
      vz: value[5],
      onGround: !!value[6],
      crouch: !!value[7],
      jumpHeld: !!value[8],
      jumpBuf: value[9],
      groundTime: value[10],
    });
    const solids = this.solidsNow(state);
    for (const competitive of this.pending) {
      stepPlayer(state, competitive.inp, FIXED_DT, solids);
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

  onSnap(message) {
    this.latest = message;
    this.score = message.sc || [0, 0];
    this.game = message.gm || 'tdm';
    if (message.cp) {
      const nowMs = performance.now();
      const competitive = (this.comp ||= {});
      competitive.ph = message.cp.ph;
      competitive.round = message.cp.r;
      competitive.b = message.cp.b;
      competitive.bc = message.cp.bc;
      competitive.bp = message.cp.bp;
      competitive.bs = message.cp.bs;
      const endAt = nowMs + message.cp.te;
      if (!competitive.endAt || Math.abs(competitive.endAt - endAt) > 250) {
        competitive.endAt = endAt;
      }
      if ((message.cp.ex ?? null) !== null) {
        const expiresAt = nowMs + message.cp.ex;
        if (!competitive.explodeAt || Math.abs(competitive.explodeAt - expiresAt) > 250) {
          competitive.explodeAt = expiresAt;
        }
      } else {
        competitive.explodeAt = 0;
      }
    } else {
      this.comp = null;
    }
    this.winId = message.wid ?? null;
    this.winName = message.wn || '';
    this.goal = message.goal || 100;
    this.win = message.win ?? -1;
    this.winEndsAt = (message.win ?? null) !== null ? performance.now() + (message.ne || 0) : 0;
    const self = message.players.find((press) => press.i === this.myId);
    if (self) {
      this.hp = self.hp;
      if (!self.a && this.alive) {
        this.setDead();
      }
    }
  }

  setDead() {
    this.deadAt = performance.now();
    this.alive = false;
    this.planting = this.defusing = 0;
    this.scope = 0;
    this.reloading = false;
    this.respawnAt = performance.now() + RESPAWN_MS;
  }

  spatial(position) {
    const competitive = this.camera.position;
    const deltaX = position.x - competitive.x;
    const deltaY = position.y - competitive.y;
    const deltaZ = position.z - competitive.z;
    const distance = Math.hypot(deltaX, deltaY, deltaZ) || 1;
    const hit =
      distance > 0.5
        ? raycastWorld(
            [competitive.x, competitive.y, competitive.z],
            [deltaX / distance, deltaY / distance, deltaZ / distance],
            distance - 0.3,
            this.solids,
          )
        : null;
    const muffled = !!hit && hit.normal[1] !== 1;
    return { gain: muffled ? 0.7 : 1, pan: { pos: [position.x, position.y, position.z], muffled } };
  }

  updateSpectate() {
    const hideOld = () => {
      if (this.specLookKey) {
        this.specLookKey = null;
        this.viewmodel.setLook(this.look);
        this.viewmodel.setSkins(this.skins || {});
      }
      if (this.specHidden) {
        const old = this.remotes.get(this.specHidden);
        if (old) {
          old.root.visible = true;
        }
        this.specHidden = null;
      }
    };
    const ready =
      this.joined && !this.alive && this.deadAt && performance.now() - this.deadAt > 1800;
    if (!ready) {
      hideOld();
      this.spec = null;
      return null;
    }
    const ffa = this.game === 'gungame';
    const alive = [...this.remotes.values()]
      .filter((remotePlayer) => remotePlayer.st && remotePlayer.st.a && !remotePlayer.rig.dead)
      .sort((left, right) => left.id - right.id);
    const mates = ffa ? [] : alive.filter((remotePlayer) => remotePlayer.st.tm === this.team);
    const list = mates.length ? mates : alive;
    if (!list.length) {
      hideOld();
      this.spec = null;
      return null;
    }
    let index = Math.max(
      0,
      list.findIndex((remotePlayer) => remotePlayer.id === this.spec?.id),
    );
    if (this.specNext) {
      this.specNext = false;
      index = (index + 1) % list.length;
    }
    const currentRemotePlayer = list[index];
    if (this.specHidden !== currentRemotePlayer.id) {
      hideOld();
      currentRemotePlayer.root.visible = false;
      this.specHidden = currentRemotePlayer.id;
    }
    if (this.spec?.id !== currentRemotePlayer.id || this.spec?.w !== currentRemotePlayer.st.w) {
      this.viewmodel.setWeapon(currentRemotePlayer.st.w);
    }
    const lookKey = `${currentRemotePlayer.id}|${currentRemotePlayer.lk}|${currentRemotePlayer.st.w}|${currentRemotePlayer.st.sk || 0}`;
    if (lookKey !== this.specLookKey) {
      this.specLookKey = lookKey;
      if (currentRemotePlayer.lk) {
        this.viewmodel.setLook(decodeLook(currentRemotePlayer.lk));
      }
      applySkin(
        this.viewmodel.guns[currentRemotePlayer.st.w]?.group,
        SKINS[currentRemotePlayer.st.sk || 0]?.id || 'default',
      );
    }
    const busy = !!currentRemotePlayer.st.pl;
    this.viewmodel.kit = busy && currentRemotePlayer.st.tm === 1;
    this.viewmodel.plant = busy && currentRemotePlayer.st.tm === 0 ? 0.5 : 0;
    if (busy && currentRemotePlayer.busyTick && currentRemotePlayer.st.tm === 0) {
      this.viewmodel.tap();
    }
    this.spec = {
      id: currentRemotePlayer.id,
      w: currentRemotePlayer.st.w,
      st: currentRemotePlayer.st,
      name: currentRemotePlayer.st.n,
      hp: currentRemotePlayer.st.hp,
      team: currentRemotePlayer.st.tm,
      count: list.length,
    };
    return this.spec;
  }

  onRemoteShot(message) {
    if (this.spec && message.i === this.spec.id && !WEAPONS[message.w]?.melee) {
      this.viewmodel.fire();
    }
    const origin = new THREE.Vector3(message.o[0], message.o[1], message.o[2]);
    const event = new THREE.Vector3(message.e[0], message.e[1], message.e[2]);
    const remotePlayer = this.remotes.get(message.i);
    remotePlayer?.shot(!!WEAPONS[message.w]?.melee, !!message.hy);
    if (WEAPONS[message.w]?.melee) {
      if (message.k === 'p') {
        this.effects.impact(event, [0, 1, 0], 'p');
      }
      this.audio.knife(
        this.spatial({ x: origin.x, y: origin.y, z: origin.z }),
        WEAPONS[message.w].id,
        !!message.hy,
      );
      return;
    }
    const muzzle = remotePlayer?.muzzleWorld();
    const start =
      muzzle ||
      origin.clone().lerp(event, Math.min(0.5 / Math.max(origin.distanceTo(event), 0.01), 1));
    this.effects.tracer(start, event);
    if (WEAPONS[message.w]?.id === 'awp') {
      this.effects.smoke(start, event);
    }
    const byVictim = new Map();
    for (const entry of message.hv || []) {
      if (!byVictim.has(entry[0])) {
        byVictim.set(entry[0], []);
      }
      byVictim.get(entry[0]).push(entry.slice(1));
    }
    for (const [vehicleId, points] of byVictim) {
      this.bleedAll(vehicleId, points, origin, WEAPONS[message.w]?.id);
    }
    for (const pelletEntry of message.pe || []) {
      const hitPoint = new THREE.Vector3(pelletEntry[0], pelletEntry[1], pelletEntry[2]);
      this.effects.tracer(start, hitPoint);
      if (pelletEntry[3] === 2) {
        this.effects.impact(hitPoint, [pelletEntry[4], pelletEntry[5], pelletEntry[6]], 'w');
      } else if (pelletEntry[3] === 1) {
        this.effects.impact(hitPoint, [0, 1, 0], 'p');
      }
    }
    for (const hole of message.hl || []) {
      this.effects.impact(
        new THREE.Vector3(hole[0], hole[1], hole[2]),
        [hole[3], hole[4], hole[5]],
        'w',
      );
    }
    if (muzzle) {
      this.effects.flash(muzzle, WEAPONS[message.w]?.silenced ? 0.12 : 0.35);
    }
    if (message.k === 'w' && message.n) {
      this.effects.impact(event, message.n, 'w');
    } else if (message.k === 'p') {
      this.effects.impact(event, [0, 1, 0], 'p');
    }
    const spatial = this.spatial({ x: origin.x, y: origin.y, z: origin.z });
    this.audio.shot(WEAPONS[message.w]?.id || 'rifle', spatial);
  }

  bleed(victimId, point, from, heavy = false, splat = true) {
    const remotePlayer = this.remotes.get(victimId);
    const wound = remotePlayer
      ? remotePlayer.addWound(point, point.clone().sub(from), this.effects)
      : null;
    if (wound && heavy) {
      const value = new THREE.Vector3();
      this.effects.gush(() => (wound.parent ? wound.getWorldPosition(value) : null), 0.6, 0.45);
    }
    if (!splat) {
      return;
    }
    const direction = point.clone().sub(from).normalize();
    const hit = raycastWorld(
      [point.x, point.y, point.z],
      [direction.x, direction.y, direction.z],
      2.5,
      this.solids,
    );
    if (hit) {
      this.effects.bloodSplat(
        new THREE.Vector3(...hit.point),
        hit.normal,
        0.45 + Math.random() * 0.3,
      );
    }
  }

  bleedAll(victimId, points, from, weaponId) {
    const heavyGun = HEAVY_GUNS.has(weaponId);
    points.forEach((press, index) =>
      this.bleed(
        victimId,
        new THREE.Vector3(press[0], press[1], press[2]),
        from,
        heavyGun || press[3] === 1,
        index < 3,
      ),
    );
  }

  onHit(message) {
    this.hitCounter++;
    this.hit = {
      n: this.hitCounter,
      head: message.pt === 'head',
      kill: message.kill,
      dmg: message.d,
    };
    this.effects.impact(
      new THREE.Vector3(message.pos[0], message.pos[1], message.pos[2]),
      [0, 1, 0],
      'p',
    );
    this.bleedAll(
      message.v,
      message.pts || [[...message.pos, message.pt === 'head' ? 1 : 0]],
      this.camera.position,
      WEAPONS[this.cur].id,
    );
    this.audio.hit(message.pt === 'head');
  }

  onHurt(message) {
    this.hp = message.hp;
    const deltaX = message.o[0] - this.ms.x;
    const deltaZ = message.o[2] - this.ms.z;
    const distance = Math.hypot(deltaX, deltaZ) || 1;
    const directionX = deltaX / distance;
    const directionZ = deltaZ / distance;
    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rotationX = Math.cos(this.yaw);
    const rotationZ = -Math.sin(this.yaw);
    const angle =
      Math.atan2(
        directionX * rotationX + directionZ * rotationZ,
        directionX * forwardX + directionZ * forwardZ,
      ) *
      (180 / Math.PI);
    this.damage.push({ id: performance.now() + Math.random(), angle, t: performance.now() });
  }

  blast(position, power, radius) {
    this.lastBlast = { pos: position, power, t: performance.now() };
    for (const remotePlayer of this.remotes.values()) {
      if (remotePlayer.rig.dead && remotePlayer.root.position.distanceTo(position) < radius) {
        remotePlayer.explode(position, power * 0.7, null);
      }
    }
  }

  shootCorpses(origin, direction, maxT) {
    const ray = new THREE.Ray(new THREE.Vector3(...origin), new THREE.Vector3(...direction));
    const box = new THREE.Box3();
    let best = null;
    for (const remotePlayer of this.remotes.values()) {
      if (!remotePlayer.rig.dead) {
        continue;
      }
      box.setFromObject(remotePlayer.rig.root);
      const hitPoint = ray.intersectBox(box, new THREE.Vector3());
      if (!hitPoint) {
        continue;
      }
      const now = hitPoint.distanceTo(ray.origin);
      if (now < maxT && (!best || now < best.t)) {
        best = { rp: remotePlayer, pt: hitPoint, t: now };
      }
    }
    if (!best) {
      return;
    }
    this.effects.impact(best.pt, [0, 1, 0], 'p');
    this.bleed(best.rp.id, best.pt, ray.origin, false, true);
    best.rp.corpseHit(ray.direction);
  }

  onKill(message) {
    if (message.k === this.myId && message.v !== this.myId) {
      if (message.ns) {
        this.audio.noscopeKill();
      } else if (message.h) {
        this.audio.headshotKill();
      } else {
        this.audio.kill();
      }
    }
    const victim = this.remotes.get(message.v);
    if (victim) {
      let from = null;
      if (message.k === this.myId) {
        from = [this.ms.x, this.ms.z];
      } else {
        const keys = this.latest?.players.find((press) => press.i === message.k);
        if (keys) {
          from = [keys.p[0], keys.p[2]];
        }
      }
      victim.die(from ? from[0] : NaN, from ? from[1] : NaN, message.h);
      const lastBlast = this.lastBlast;
      if (
        (message.w === 'he' || message.w === 'c4') &&
        lastBlast &&
        performance.now() - lastBlast.t < 1500
      ) {
        victim.explode(lastBlast.pos, lastBlast.power, this.effects);
      }
      if (message.g) {
        this.effects.gush(() => victim.bleedPoint(message.h), 1.5);
        setTimeout(
          () => this.remotes.get(message.v) === victim && this.effects.pool(victim.bodyPoint()),
          900,
        );
      }
    }
    this.killfeed.push({
      id: performance.now() + Math.random(),
      kn: message.kn,
      kt: message.kt,
      vn: message.vn,
      vt: message.vt,
      w: message.w,
      h: message.h,
      ns: !!message.ns,
      mine: message.k === this.myId,
      died: message.v === this.myId,
      t: performance.now(),
    });
    if (this.killfeed.length > 6) {
      this.killfeed.shift();
    }
    if (message.v === this.myId) {
      this.audio.hurt();
      this.setDead();
    }
  }

  currentSpread(weapon) {
    const spread = weapon.spread;
    const speed = Math.hypot(this.ms.vx, this.ms.vz);
    const base = weapon.scope && this.scope > 0 ? weapon.scopedBase : spread.base;
    const maxSpeed = MOVE.run * weapon.moveMult;
    const moveFactor = clamp((speed - maxSpeed * 0.34) / (maxSpeed * 0.5), 0, 1);
    let value = base + spread.move * moveFactor + (this.ms.onGround ? 0 : spread.air) + this.inacc;
    if (this.ms.crouch && this.ms.onGround) {
      value *= spread.crouchMult;
    }
    return value;
  }

  quickSwitchTarget() {
    const ok = (index) =>
      (index ?? null) !== null &&
      index !== this.cur &&
      this.slots.includes(index) &&
      !(WEAPONS[index]?.grenade && !(this.ammo[index]?.mag > 0));
    if (ok(this.lastWeapon)) {
      return this.lastWeapon;
    }
    return this.cur !== this.slots[2] ? this.slots[2] : this.slots[0];
  }

  switchTo(index) {
    this.primeStart = 0;
    this.nadeSt = null;
    this.viewmodel.nadeAnim = null;
    if (this.planting) {
      this.cancelPlant();
    }
    if (this.spinStart) {
      this.spinStart = 0;
      this.net.send({ t: 'spin', on: 0 });
    }
    this.viewmodel.prime = 0;
    if (!this.alive || index === this.cur || !WEAPONS[index]) {
      return;
    }
    const now = performance.now() / 1000;
    this.lastWeapon = this.cur;
    this.cur = index;
    this.reloading = false;
    this.scope = 0;
    this.spray = 0;
    this.readyAt = now + WEAPONS[index].drawTime;
    this.drawStart = now;
    this.viewmodel.setWeapon(index);
    this.audio.draw();
    this.net.send({ t: 'switch', w: index });
  }

  toggleScope() {
    const weapon = WEAPONS[this.cur];
    if (!weapon.scope || !this.alive || this.reloading) {
      return;
    }
    this.scope = (this.scope + 1) % (weapon.scopeFov.length + 1);
    this.audio.draw();
  }

  startReload() {
    const weapon = WEAPONS[this.cur];
    const minimum = this.ammo[this.cur];
    const now = performance.now() / 1000;
    if (
      !this.alive ||
      this.reloading ||
      minimum.mag >= weapon.mag ||
      minimum.reserve <= 0 ||
      now < this.readyAt
    ) {
      return;
    }
    this.reloading = true;
    this.viewmodel.stopInspect();
    this.reloadStart = now;
    this.reloadEnd = now + weapon.reloadTime;
    this.scope = 0;
    this.audio.reload();
    this.net.send({ t: 'reload' });
  }

  updateWeapon(deltaTime, now) {
    const weapon = WEAPONS[this.cur];
    const minimum = this.ammo[this.cur];
    if (this.reloading && now >= this.reloadEnd) {
      const take = Math.min(weapon.mag - minimum.mag, minimum.reserve);
      minimum.mag += take;
      minimum.reserve -= take;
      this.reloading = false;
      this.audio.reloadEnd();
    }
    this.inacc = Math.max(0, this.inacc - weapon.inaccDecay * deltaTime);

    const live =
      this.locked &&
      this.alive &&
      this.joined &&
      !this.chatting &&
      this.comp?.ph !== 'freeze' &&
      !this.defusing;
    if (!live || !weapon.primeTime) {
      this.primeStart = 0;
    }
    if (weapon.bomb) {
      this.updatePlant(live, now);
    } else if (weapon.grenade) {
      this.updateNade(live, weapon, minimum, now);
    } else if (live && weapon.primeTime) {
      this.updateRevolver(weapon, minimum, now);
    } else if (live) {
      const rEdge = this.mouse.r && !this.rHeld;
      this.rHeld = this.mouse.r;
      if (weapon.melee && rEdge && now >= this.nextFire && now >= this.readyAt) {
        this.stab(weapon, now, true);
      }
      let want = weapon.auto ? this.mouse.l : this.fireQueued > now;
      if (weapon.spinUp) {
        want = this.spinGate(weapon, want, now);
      }
      if (want && now >= this.nextFire && now >= this.readyAt && !this.reloading) {
        if (weapon.melee) {
          this.stab(weapon, now);
        } else if (minimum.mag > 0) {
          this.fire(weapon, minimum, now);
        } else {
          this.fireQueued = 0;
          this.nextFire = now + 0.25;
          this.audio.dry();
          if (minimum.reserve > 0) {
            this.startReload();
          }
        }
      }
    }

    {
      const keys = Math.exp(-deltaTime * 6);
      this.punch.pitch *= keys;
      this.punch.yaw *= keys;
      const lin = 4 * deltaTime;
      this.punch.pitch =
        Math.abs(this.punch.pitch) < lin ? 0 : this.punch.pitch - Math.sign(this.punch.pitch) * lin;
      this.punch.yaw =
        Math.abs(this.punch.yaw) < lin ? 0 : this.punch.yaw - Math.sign(this.punch.yaw) * lin;
    }
    this.kick = Math.max(0, this.kick - deltaTime * 9);
  }

  updatePlant(live, now) {
    const competitive = this.comp;
    if (live && this.mouse.l) {
      const state = this.ms;
      const ok =
        !!competitive &&
        competitive.ph === 'live' &&
        state.onGround &&
        !!siteAt(this.map, state.x, state.z);
      if (!this.plantHeld && !ok) {
        this.audio.error();
        const near = nearSite(this.map, state.x, state.z, 25);
        if (near && competitive?.ph === 'live') {
          this.siteFlash = { name: near.name, at: performance.now() };
        }
      }
      this.plantHeld = true;
      if (ok && !this.planting) {
        this.planting = now;
        this.plantKeys = 0;
        state.vx = state.vz = 0;
        this.net.send({ t: 'plant', on: 1 });
      }
    }
    if (!this.mouse.l || !live) {
      this.plantHeld = false;
      if (this.planting) {
        this.cancelPlant();
      }
    }
    if (this.planting) {
      const press = (now - this.planting) / (COMP.plantMs / 1000);
      const keys = Math.min(7, Math.floor(press * 7.5));
      if (keys > this.plantKeys) {
        this.plantKeys = keys;
        this.audio.plantKey(keys);
        this.viewmodel.tap();
      }
      if (press > 1.6) {
        this.cancelPlant();
      }
    }
    this.viewmodel.plant = this.planting
      ? clamp((now - this.planting) / (COMP.plantMs / 1000), 0, 1)
      : 0;
  }

  updateNade(live, weapon, minimum, now) {
    const PIN = 0.32;
    const COCK = 0.22;
    const REL = 0.13;
    const END = 0.45;
    let snapshotState = this.nadeSt;
    if (!live) {
      this.nadeSt = null;
      this.viewmodel.nadeAnim = null;
      return;
    }
    if (
      !snapshotState &&
      now >= this.readyAt &&
      minimum.mag > 0 &&
      (this.mouse.l || this.mouse.r)
    ) {
      snapshotState = this.nadeSt = { t0: now, btn: this.mouse.l ? 'l' : 'r', rel: 0, sent: false };
      this.audio.pin();
    }
    if (!snapshotState) {
      this.viewmodel.nadeAnim = null;
      return;
    }
    const held = snapshotState.btn === 'l' ? this.mouse.l : this.mouse.r;
    const pin = Math.min(1, (now - snapshotState.t0) / PIN);
    if (!held && !snapshotState.rel) {
      snapshotState.rel = Math.max(now, snapshotState.t0 + PIN);
    }
    const cock =
      snapshotState.rel && now >= snapshotState.rel
        ? 1
        : Math.min(1, Math.max(0, (now - snapshotState.t0 - PIN * 0.6) / COCK));
    const throttleInput =
      snapshotState.rel && now >= snapshotState.rel
        ? Math.min(1, (now - snapshotState.rel) / END)
        : 0;
    if (snapshotState.rel && now >= snapshotState.rel + REL && !snapshotState.sent) {
      snapshotState.sent = true;
      const vector = [
        -Math.sin(this.yaw) * Math.cos(this.pitch),
        Math.sin(this.pitch),
        -Math.cos(this.yaw) * Math.cos(this.pitch),
      ];
      const competitive = this.camera.position;
      this.net.send({
        t: 'nade',
        w: this.cur,
        o: [competitive.x, competitive.y, competitive.z],
        d: vector,
        lob: snapshotState.btn === 'r' ? 1 : 0,
      });
      minimum.mag--;
      this.audio.throwNade();
    }
    this.viewmodel.nadeAnim = {
      pin,
      cock,
      thr: throttleInput,
      relAt: REL / END,
      gone: snapshotState.sent,
    };
    if (throttleInput >= 1) {
      this.nadeSt = null;
      this.viewmodel.nadeAnim = null;
      const back =
        this.slots.includes(this.lastWeapon) &&
        this.lastWeapon !== this.cur &&
        !WEAPONS[this.lastWeapon]?.grenade
          ? this.lastWeapon
          : this.slots[0];
      this.switchTo(back);
    }
  }

  spawnNade(message) {
    const weapon = WEAPONS[message.w];
    const mesh = (BUILDERS[weapon?.id] || BUILDERS.he)(false).group;
    mesh.scale.setScalar(1.3);
    this.scene.add(mesh);
    this.nades.set(message.id, { n: nadeStart(message.o, message.d, !!message.lob), mesh, acc: 0 });
    if (message.i !== this.myId) {
      this.remotes.get(message.i)?.shot(true);
      this.audio.throwNade(this.spatial({ x: message.o[0], y: message.o[1], z: message.o[2] }));
    }
  }

  endNade(id) {
    const nade = this.nades.get(id);
    if (!nade) {
      return;
    }
    this.scene.remove(nade.mesh);
    this.nades.delete(id);
  }

  clearNades() {
    for (const id of [...this.nades.keys()]) {
      this.endNade(id);
    }
    this.smokes = [];
    this.effects.clearSmoke();
  }

  updateNades(deltaTime) {
    for (const nade of this.nades.values()) {
      nade.acc += deltaTime;
      while (nade.acc >= NADE.dt) {
        nade.acc -= NADE.dt;
        if (stepNade(nade.n, this.solids)) {
          this.audio.bounce(this.spatial({ x: nade.n.x, y: nade.n.y, z: nade.n.z }));
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
      this.smokes = this.smokes.filter((smoke) => smoke.until > now);
    }
  }

  applyWeaponSkins() {
    this.viewmodel.setSkins(this.skins || {});
    for (const [index, skin] of Object.entries(this.wskin || {})) {
      applySkin(this.viewmodel.guns[index]?.group, skin);
    }
  }

  applyInv(message) {
    if (message.ws) {
      this.wskin = message.ws;
      this.applyWeaponSkins();
    }
    for (const [index, magnitude, reserve] of message.am || []) {
      this.ammo[index] = { mag: magnitude, reserve };
    }
    this.slots = message.sl;
    if ((message.w ?? null) !== null && message.w !== this.cur) {
      const now = performance.now() / 1000;
      this.lastWeapon = this.slots.includes(this.cur) ? this.cur : this.slots[1];
      this.cur = message.w;
      this.reloading = false;
      this.scope = 0;
      this.viewmodel.setWeapon(this.cur);
      this.readyAt = now + WEAPONS[this.cur].drawTime;
      this.drawStart = now;
      this.audio.draw();
    }
  }

  canBuyNow() {
    if (this.game === 'tdm') {
      return this.alive && this.win < 0;
    }
    const competitive = this.comp;
    if (!competitive || !this.alive || this.win >= 0) {
      return false;
    }
    const inTime =
      competitive.ph === 'freeze' ||
      (competitive.ph === 'live' && performance.now() - (competitive.liveAt || 0) < ECON.buyMs);
    if (!inTime) {
      return false;
    }
    const positionZ = this.map.spawn[teamKey(this.team)];
    const deltaX = Math.max(positionZ.x[0] - this.ms.x, 0, this.ms.x - positionZ.x[1]);
    const deltaZ = Math.max(positionZ.z[0] - this.ms.z, 0, this.ms.z - positionZ.z[1]);
    return Math.hypot(deltaX, deltaZ) < 8;
  }

  openBuy() {
    if (!this.canBuyNow()) {
      this.audio.error();
      return;
    }
    this.buyOpen = true;
    this.keys.clear();
    this.mouse.l = this.mouse.r = false;
    this.store.set({ buyOpen: true });
    document.exitPointerLock?.();
  }

  closeBuy() {
    if (!this.buyOpen) {
      return;
    }
    this.buyOpen = false;
    this.store.set({ buyOpen: false });
    this.lock();
  }

  buy(id) {
    this.net.send({ t: 'buy', w: id });
  }

  buyInfo() {
    const key = teamKey(this.team);
    const free = this.game !== 'comp';
    return Object.fromEntries(
      Object.keys(PRICES).map((id) => {
        if (id === 'vest') {
          return [
            id,
            {
              price: free ? 0 : PRICES.vest,
              side: true,
              owned: (this.armor || 0) >= ECON.vestArmor,
              afford: free || this.money >= PRICES.vest,
            },
          ];
        }
        const index = WEAPONS.findIndex((weapon) => weapon.id === id);
        const currentWeapon = WEAPONS[index];
        const owned =
          currentWeapon.slot === 'grenade'
            ? this.slots[3] === index && this.ammo[index]?.mag > 0
            : this.slots.slice(0, 2).includes(index) && currentWeapon.slot !== 'melee';
        return [
          id,
          {
            price: free ? 0 : PRICES[id],
            side: allowedFor(currentWeapon, key),
            owned,
            afford: free || this.money >= PRICES[id],
          },
        ];
      }),
    );
  }

  addDrop(message) {
    const weapon = WEAPONS[message.w];
    if (!weapon) {
      return;
    }
    const group = (BUILDERS[weapon.id] || BUILDERS.rifle)(false).group;
    applySkin(group, SKINS[message.sk || 0]?.id || 'default');
    const outline = group.clone(true);
    outline.traverse((object) => {
      if (object.isMesh) {
        object.material = this.outlineMat;
        object.scale.multiplyScalar(1.18);
      }
    });
    outline.visible = false;
    const root = new THREE.Group();
    root.add(group, outline);
    root.position.set(message.p[0], message.p[1] + 0.05, message.p[2]);
    root.rotation.set(0, message.ry, Math.PI / 2);
    this.scene.add(root);
    this.drops.set(message.id, { id: message.id, w: message.w, p: message.p, mesh: root, outline });
  }

  removeDrop(id) {
    const drop = this.drops.get(id);
    if (!drop) {
      return;
    }
    this.scene.remove(drop.mesh);
    this.drops.delete(id);
    if (this.dropTarget?.id === id) {
      this.dropTarget = null;
    }
  }

  updateDrops() {
    let best = null;
    let bestA = 0.45;
    if (this.alive && this.drops.size) {
      const competitive = this.camera.position;
      const vector = new THREE.Vector3(
        -Math.sin(this.yaw) * Math.cos(this.pitch),
        Math.sin(this.pitch),
        -Math.cos(this.yaw) * Math.cos(this.pitch),
      );
      for (const direction of this.drops.values()) {
        const currentVector = new THREE.Vector3(
          direction.p[0] - competitive.x,
          direction.p[1] + 0.08 - competitive.y,
          direction.p[2] - competitive.z,
        );
        const distance = currentVector.length();
        if (Math.hypot(direction.p[0] - this.ms.x, direction.p[2] - this.ms.z) > 2.3) {
          continue;
        }
        const angle = currentVector.normalize().angleTo(vector);
        if (distance < 3.2 && angle < bestA) {
          bestA = angle;
          best = direction;
        }
      }
    }
    for (const direction of this.drops.values()) {
      direction.outline.visible = direction === best;
    }
    this.dropTarget = best;
  }

  cancelPlant() {
    this.planting = 0;
    this.viewmodel.plant = 0;
    this.net.send({ t: 'plant', on: 0 });
  }

  updateDefuse(now) {
    const competitive = this.comp;
    const state = this.ms;
    const can =
      !!competitive &&
      competitive.ph === 'live' &&
      competitive.b === 'planted' &&
      this.team === 1 &&
      this.alive &&
      !!competitive.bp &&
      Math.hypot(state.x - competitive.bp[0], state.z - competitive.bp[2]) < COMP.defuseRange &&
      Math.abs(state.y - competitive.bp[1]) < 1.6 &&
      !this.otherDefuser;
    if (competitive?.b !== 'planted') {
      this.otherDefuser = null;
    }
    this.canDefuse = can;
    const want = can && this.locked && !this.chatting && this.keys.has('KeyE');
    if (want && !this.defusing) {
      this.defusing = now;
      this.ms.vx = this.ms.vz = 0;
      this.net.send({ t: 'defuse', on: 1 });
    } else if (!want && this.defusing) {
      this.defusing = 0;
      this.net.send({ t: 'defuse', on: 0 });
    }
  }

  updateBomb(deltaTime) {
    const competitive = this.comp;
    const prop = this.bombProp;
    const nowMs = performance.now();
    const show =
      !!competitive &&
      !!competitive.bp &&
      (competitive.b === 'dropped' || competitive.b === 'planted' || competitive.b === 'defused');
    prop.visible = show;
    if (show) {
      const minimum = this.bombAnim;
      const keys = minimum ? Math.min(1, (nowMs - minimum.t0) / 450) : 1;
      if (minimum && keys < 1) {
        prop.position.set(
          minimum.from[0] + (minimum.to[0] - minimum.from[0]) * keys,
          minimum.from[1] +
            (minimum.to[1] - minimum.from[1]) * keys +
            Math.sin(keys * Math.PI) * 0.6 +
            0.04,
          minimum.from[2] + (minimum.to[2] - minimum.from[2]) * keys,
        );
        prop.rotation.set(keys * 5, 0, keys * 2);
      } else {
        prop.position.set(competitive.bp[0], competitive.bp[1] + 0.04, competitive.bp[2]);
        prop.rotation.set(0, competitive.b === 'planted' ? 0.6 : 1.2, 0);
      }
    }
    let led = false;
    if (competitive && competitive.b === 'planted' && competitive.explodeAt) {
      const left = competitive.explodeAt - nowMs;
      if (left > 0 && nowMs >= (this.nextBeep || 0)) {
        this.nextBeep = nowMs + Math.max(90, 120 + 880 * (left / COMP.bombMs));
        this.beepAt = nowMs;
        this.audio.bombBeep(
          this.spatial({ x: competitive.bp[0], y: competitive.bp[1] + 0.2, z: competitive.bp[2] }),
          left < 3000,
        );
      }
      led = nowMs - (this.beepAt || 0) < 90;
    }
    this.bombLed.material.color.setHex(led ? 0xff2a1a : 0x400000);
    const glows = this.worldGroup.userData.siteGlow;
    if (glows) {
      for (const [name, message] of glows) {
        const vector =
          this.siteFlash && this.siteFlash.name === name
            ? 1 - (nowMs - this.siteFlash.at) / 3000
            : 0;
        message.material.opacity = Math.max(0, vector) * 0.16;
        message.visible = vector > 0;
      }
    }
    this.shake = Math.max(0, this.shake - deltaTime * 1.6);
  }

  onBoom(press) {
    const position = new THREE.Vector3(press[0], press[1] + 0.3, press[2]);
    this.blast(position, 1.4, 22);
    this.effects.explosion(position);
    this.audio.explosion(this.spatial({ x: position.x, y: position.y, z: position.z }));
    const direction = this.camera.position.distanceTo(position);
    this.shake = Math.max(this.shake, Math.max(0, 1 - direction / 60));
  }

  spinGate(weapon, want, now) {
    const minimum = this.ammo[this.cur];
    const can = want && !this.reloading && now >= this.readyAt && minimum.mag > 0;
    if (can && !this.spinStart) {
      this.spinStart = now;
      this.net.send({ t: 'spin', on: 1 });
      this.audio.spin(weapon.spinUp);
    } else if (!can && this.spinStart) {
      this.spinStart = 0;
      this.net.send({ t: 'spin', on: 0 });
    }
    return can && now - this.spinStart >= weapon.spinUp;
  }

  updateRevolver(weapon, minimum, now) {
    const ready = now >= this.nextFire && now >= this.readyAt && !this.reloading;
    if (ready && minimum.mag <= 0 && (this.mouse.l || this.mouse.r)) {
      this.primeStart = 0;
      this.nextFire = now + 0.25;
      this.audio.dry();
      if (minimum.reserve > 0) {
        this.startReload();
      }
    } else if (ready && this.mouse.r) {
      this.primeStart = 0;
      this.fire(weapon, minimum, now, true);
    } else if (ready && this.mouse.l) {
      if (!this.primeStart) {
        this.primeStart = now;
        this.audio.cock();
      }
      if (now - this.primeStart >= weapon.primeTime) {
        this.primeStart = 0;
        this.fire(weapon, minimum, now, false);
      }
    } else if (!this.mouse.l) {
      this.primeStart = 0;
    }
    this.viewmodel.prime = this.primeStart
      ? clamp((now - this.primeStart) / weapon.primeTime, 0, 1)
      : 0;
  }

  fire(weapon, minimum, now, fan = false) {
    minimum.mag--;
    this.nextFire = now + (fan ? weapon.fanInterval : weapon.interval);
    this.fireQueued = 0;
    if (now - this.lastShot > weapon.recoilReset) {
      this.spray = 0;
    }
    this.lastShot = now;

    const yaw = this.yaw + this.punch.yaw * DEGREES_TO_RADIANS;
    const pitch = this.pitch + this.punch.pitch * DEGREES_TO_RADIANS;
    const vector = new THREE.Vector3(
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    );
    const right = new THREE.Vector3().crossVectors(vector, new THREE.Vector3(0, 1, 0)).normalize();
    const currentVector = new THREE.Vector3().crossVectors(right, vector).normalize();
    const spread = this.currentSpread(weapon) + (fan ? weapon.fanSpread : 0);
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * Math.tan(spread);
    const direction = vector
      .clone()
      .addScaledVector(right, Math.cos(angle) * radius)
      .addScaledVector(currentVector, Math.sin(angle) * radius)
      .normalize();
    const origin = this.camera.position.clone();

    const currentOrigin = [origin.x, origin.y, origin.z];
    const currentDirection = [direction.x, direction.y, direction.z];
    const seed = Math.floor(Math.random() * 2 ** 31);
    const directions = weapon.pellets
      ? pelletDirs(currentDirection, seed, weapon.pellets, weapon.pelletSpread)
      : [currentDirection];
    const ends = directions.map((direction) => {
      const trace = traceShot(
        currentOrigin,
        direction,
        MAX_RANGE,
        this.solids,
        weapon.wallPen || 0,
      );
      const event = trace.normal
        ? new THREE.Vector3(...trace.point)
        : origin.clone().add(new THREE.Vector3(...direction).multiplyScalar(150));
      this.shootCorpses(currentOrigin, direction, trace.normal ? trace.t : MAX_RANGE);
      if (trace.normal) {
        this.effects.impact(event, trace.normal, 'w');
      }
      for (const hole of trace.holes) {
        this.effects.impact(new THREE.Vector3(...hole.point), hole.normal, 'w');
      }
      return event;
    });
    const end = ends[0];

    let muzzle;
    if (this.scope > 0 || !this.alive) {
      muzzle = origin.clone().addScaledVector(direction, 0.6).addScaledVector(currentVector, -0.1);
    } else {
      muzzle = this.muzzleWorld();
    }
    for (const event of ends) {
      this.effects.tracer(muzzle, event);
    }
    if (weapon.id === 'awp') {
      this.effects.smoke(muzzle, end);
    }

    this.net.send({
      t: 'shoot',
      o: currentOrigin.map((value) => Math.round(value * 1000) / 1000),
      d: currentDirection.map((value) => Math.round(value * 100000) / 100000),
      rt: this.net.serverNow() - INTERP_MS,
      w: this.cur,
      ...(weapon.pellets ? { sd: seed } : null),
      ...(this.scope > 0 ? { sc: 1 } : null),
      ...(fan ? { fn: 1 } : null),
    });

    const pat = weapon.pattern[Math.min(this.spray, weapon.pattern.length - 1)];
    const crouchMultiplier = this.ms.crouch ? 0.85 : 1;
    this.pitch = clamp(
      this.pitch + pat[0] * crouchMultiplier * DEGREES_TO_RADIANS,
      -89.5 * DEGREES_TO_RADIANS,
      89.5 * DEGREES_TO_RADIANS,
    );
    this.yaw += (pat[1] * crouchMultiplier + (Math.random() - 0.5) * 0.1) * DEGREES_TO_RADIANS;
    this.spray++;
    this.inacc = Math.min(weapon.inaccMax, this.inacc + weapon.shotInacc);
    this.kick = 1;
    this.viewmodel.fire();
    this.audio.shot(weapon.id);
  }

  stab(weapon, now, heavy = false) {
    this.nextFire = now + weapon.interval * (heavy ? 2.2 : 1);
    this.fireQueued = 0;
    this.lastShot = now;
    const vector = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    const origin = this.camera.position;
    const currentOrigin = [origin.x, origin.y, origin.z];
    const direction = [vector.x, vector.y, vector.z];
    const hit = raycastWorld(currentOrigin, direction, weapon.reach, this.solids);
    if (hit) {
      this.effects.impact(
        new THREE.Vector3(hit.point[0], hit.point[1], hit.point[2]),
        hit.normal,
        'w',
      );
    }
    this.net.send({
      t: 'shoot',
      o: currentOrigin.map((value) => Math.round(value * 1000) / 1000),
      d: direction.map((value) => Math.round(value * 100000) / 100000),
      rt: this.net.serverNow() - INTERP_MS,
      w: this.cur,
      ...(heavy ? { hy: 1 } : null),
    });
    this.viewmodel.fire(heavy);
    this.audio.knife(undefined, weapon.id, heavy);
  }

  muzzleWorld() {
    const value = this.viewmodel.muzzleView().project(this.viewmodel.camera);
    this.camera.updateMatrixWorld(true);
    const press = new THREE.Vector3(value.x, value.y, 0.5).unproject(this.camera);
    return this.camera.position
      .clone()
      .add(press.sub(this.camera.position).normalize().multiplyScalar(0.9));
  }

  loop = (timestamp) => {
    this.raf = requestAnimationFrame(this.loop);
    const now = timestamp / 1000;
    const deltaTime = Math.min(now - this.lastFrame, 0.1);
    this.lastFrame = now;
    if (deltaTime > 0) {
      this.fps += (1 / deltaTime - this.fps) * 0.05;
    }

    this.acc += deltaTime;
    while (this.acc >= FIXED_DT) {
      this.fixedUpdate(FIXED_DT);
      this.acc -= FIXED_DT;
    }
    this.frameUpdate(deltaTime, now, this.acc / FIXED_DT);
    this.render();
  };

  fixedUpdate(deltaTime) {
    const state = this.ms;
    state.px = state.x;
    state.py = state.y;
    state.pz = state.z;
    if (!this.joined || !this.alive) {
      return;
    }
    const input = this.getInput();
    stepPlayer(state, input, deltaTime, this.solidsNow(state));
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
      input.jumpPress ? 1 : 0,
      input.walk ? 1 : 0,
      input.crouch ? 1 : 0,
      input.yaw,
      Math.round(this.pitch * 1000) / 1000,
      input.ad,
    ]);
    const speed = Math.hypot(state.vx, state.vz);
    this.speedH = speed;
    if (state.onGround && !state.crouch && speed > MOVE.walk + 0.3) {
      this.stepDist += speed * deltaTime;
      if (this.stepDist > 2.3) {
        this.stepDist = 0;
        this.audio.step(0.12);
      }
    }
    if (state.justLanded && state.landSpeed > 4) {
      this.audio.land();
    }
  }

  frameUpdate(deltaTime, now, alpha) {
    if (!this.joined) {
      this.lobby.update(deltaTime);
      return;
    }
    const state = this.ms;
    const weapon = WEAPONS[this.cur];

    const interpolatedX = state.px + (state.x - state.px) * alpha;
    const interpolatedY = state.py + (state.y - state.py) * alpha;
    const interpolatedZ = state.pz + (state.z - state.pz) * alpha;
    const eyeTarget = this.alive ? (state.crouch ? PLAYER.crouchEye : PLAYER.eye) : 0.3;
    this.eyeH += (eyeTarget - this.eyeH) * Math.min(1, deltaTime * (this.alive ? 18 : 4));
    this.roll += ((this.alive ? 0 : 0.9) - this.roll) * Math.min(1, deltaTime * 3);
    this.corr.multiplyScalar(Math.exp(-deltaTime * 12));
    this.camera.position.set(
      interpolatedX + this.corr.x,
      interpolatedY + this.eyeH + this.corr.y,
      interpolatedZ + this.corr.z,
    );
    if (this.shake > 0) {
      const minimum = this.shake * this.shake * 0.12;
      this.camera.position.x += (Math.random() - 0.5) * minimum;
      this.camera.position.y += (Math.random() - 0.5) * minimum;
    }

    const body = this.selfBody;
    body.root.visible = this.alive && this.scope === 0;
    if (body.root.visible) {
      const back = 0.12;
      body.root.position.set(
        interpolatedX + Math.sin(this.yaw) * back,
        interpolatedY,
        interpolatedZ + Math.cos(this.yaw) * back,
      );
      body.root.rotation.y = this.yaw;
      body.update(deltaTime, {
        crouch: state.crouch,
        speed: state.onGround ? Math.hypot(state.vx, state.vz) : 0,
        air: !state.onGround,
      });
    }
    this.camera.rotation.set(
      this.pitch + this.punch.pitch * DEGREES_TO_RADIANS,
      this.yaw + this.punch.yaw * DEGREES_TO_RADIANS,
      this.roll,
    );
    const spec = this.inLobby ? null : this.updateSpectate();
    if (this.inLobby) {
      this.orbitMap(now);
    } else if (spec) {
      const snapshotState = spec.st;
      this.camera.position.set(
        snapshotState.x,
        snapshotState.y + (snapshotState.c ? PLAYER.crouchEye : PLAYER.eye),
        snapshotState.z,
      );
      this.camera.rotation.set(snapshotState.pitch || 0, snapshotState.yaw, 0);
    }

    const scopeWeapon = spec && WEAPONS[spec.st.w];
    const targetFov = spec
      ? scopeWeapon?.scope && spec.st.ad
        ? scopeWeapon.scopeFov[0]
        : this.settings.fov
      : weapon.scope && this.scope > 0
        ? weapon.scopeFov[this.scope - 1]
        : this.settings.fov;
    this.currentFov += (targetFov - this.currentFov) * Math.min(1, deltaTime * 18);
    if (Math.abs(this.camera.fov - this.currentFov) > 0.01) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld(true);
    const lookPitch = this.pitch;
    this.audio.setListener(this.camera.position, {
      x: -Math.sin(this.yaw) * Math.cos(lookPitch),
      y: Math.sin(lookPitch),
      z: -Math.cos(this.yaw) * Math.cos(lookPitch),
    });

    this.updateWeapon(deltaTime, now);
    this.updateDefuse(now);
    this.updateBomb(deltaTime);
    this.updateNades(deltaTime);
    this.updateDrops();

    if (this.joined && this.alive && this.outbox.length && now - this.lastSend >= 1 / 60) {
      this.lastSend = now;
      this.net.send({ t: 'in', sp: this.spawnCount, c: this.outbox });
      this.outbox = [];
    }

    this.updateRemotes(deltaTime);
    this.effects.update(deltaTime);

    const reloadP = this.reloading
      ? clamp((now - this.reloadStart) / (this.reloadEnd - this.reloadStart), 0, 1)
      : -1;
    if (!this.spec) {
      this.viewmodel.kit = !!this.defusing;
    }
    const drawP = clamp(
      (now - this.drawStart) / Math.max(0.01, this.readyAt - this.drawStart),
      0,
      1,
    );
    this.viewmodel.update(deltaTime, {
      kick: this.kick,
      speed: this.speedH,
      grounded: state.onGround,
      reload: reloadP,
      draw: drawP,
      lookDX: this.spec ? 0 : this.lookDX,
      lookDY: this.spec ? 0 : this.lookDY,
    });
    this.lookDX = this.lookDY = 0;

    const spread = this.currentSpread(weapon);
    const gap =
      (Math.tan(spread) / Math.tan((this.currentFov * DEGREES_TO_RADIANS) / 2)) *
      (window.innerHeight / 2);
    this.crossGap += (clamp(gap + 3, 4, 90) - this.crossGap) * Math.min(1, deltaTime * 20);

    if (now - this.lastHud > 0.066) {
      this.lastHud = now;
      this.pushHud(now, reloadP);
    }
  }

  updateRemotes(deltaTime) {
    if (!this.net.hasOffset) {
      return;
    }
    const renderTime = this.net.serverNow() - INTERP_MS;
    const states = this.net.interpolate(renderTime, this.myId);
    const seen = new Set();
    for (const snapshotState of states) {
      seen.add(snapshotState.i);
      let remotePlayer = this.remotes.get(snapshotState.i);
      if (!remotePlayer) {
        remotePlayer = new RemotePlayer(this.scene, snapshotState.i);
        remotePlayer.ground = (positionX, positionZ) => groundAt(this.map, positionX, positionZ);
        remotePlayer.setDebug(this.debug);
        this.remotes.set(snapshotState.i, remotePlayer);
      }
      remotePlayer.setTeam(this.game === 'gungame' ? -1 : snapshotState.tm);
      remotePlayer.setLook(snapshotState.lk);
      remotePlayer.setSkin(snapshotState.sk);
      remotePlayer.rig.setVest(this.game === 'comp' ? !!snapshotState.ar : true);
      remotePlayer.setName(
        snapshotState.n,
        this.game !== 'gungame' && snapshotState.tm === this.team,
      );
      const stepped = remotePlayer.update(snapshotState, deltaTime);
      remotePlayer.st = snapshotState;
      if (remotePlayer.busyTick) {
        const spatial = this.spatial({
          x: snapshotState.x,
          y: snapshotState.y + 0.4,
          z: snapshotState.z,
        });
        if (remotePlayer.busyTick === 'plant') {
          this.audio.plantKey(1 + Math.floor(Math.random() * 7), spatial);
        } else {
          this.audio.defuseTick(spatial);
        }
      }
      if (remotePlayer.reloadStarted) {
        const spatial = this.spatial({
          x: snapshotState.x,
          y: snapshotState.y,
          z: snapshotState.z,
        });
        this.audio.reload(0.7 * spatial.gain, spatial.pan);
      }
      if (stepped) {
        const spatial = this.spatial({
          x: snapshotState.x,
          y: snapshotState.y,
          z: snapshotState.z,
        });
        this.audio.step(0.9 * spatial.gain, spatial.pan);
      }
    }
    this.updateSpotted();
    for (const [id, remotePlayer] of this.remotes) {
      if (!seen.has(id)) {
        remotePlayer.dispose();
        this.remotes.delete(id);
      }
    }
  }

  pushHud(now, reloadP) {
    const nowMs = performance.now();
    this.killfeed = this.killfeed.filter((keys) => nowMs - keys.t < 6000);
    const chat = this.chatting
      ? this.chat.slice(-10)
      : this.chat.filter((competitive) => nowMs - competitive.t < 10000).slice(-6);
    this.damage = this.damage.filter((direction) => nowMs - direction.t < 900);
    const weapon = WEAPONS[this.cur];
    const minimum = this.ammo[this.cur];
    const players = this.latest
      ? this.latest.players.map((press) => ({
          id: press.i,
          name: press.n,
          team: press.tm,
          kills: press.k,
          deaths: press.d,
          alive: !!press.a,
          bot: !!press.b,
          level: press.gl ?? null,
        }))
      : [];
    this.store.set({
      hp: Math.max(0, Math.round(this.hp)),
      alive: this.alive,
      weaponId: weapon.id,
      weapon: weapon.name,
      melee: !!weapon.melee || !!weapon.bomb || !!weapon.grenade,
      nade:
        (this.slots[3] ?? null) !== null &&
        this.ammo[this.slots[3]]?.mag > 0 &&
        this.cur !== this.slots[3]
          ? WEAPONS[this.slots[3]].name
          : null,
      equipped: {
        primary: WEAPONS[this.slots[0]].id,
        secondary: WEAPONS[this.slots[1]].id,
        melee: WEAPONS[this.slots[2]].id,
        grenade: WEAPONS[this.slots[3]]?.id,
      },
      mag: minimum.mag,
      reserve: minimum.reserve,
      reloading: this.reloading,
      reloadP: Math.max(0, reloadP),
      scope: this.scope,
      scopeType: weapon.scopeType || 'sniper',
      ping: Math.round(this.net.rtt),
      fps: Math.round(this.fps),
      players,
      game: this.game,
      gg: this.gg,
      winId: this.winId,
      winName: this.winName,
      killfeed: this.killfeed.slice(),
      chat,
      damage: this.damage.slice(),
      hit: this.hit,
      respawnIn: this.alive ? 0 : Math.max(0, Math.ceil((this.respawnAt - nowMs) / 1000)),
      score: this.score || [0, 0],
      goal: this.goal || 100,
      win: this.win ?? -1,
      nextMatchIn: this.win >= 0 ? Math.max(0, Math.ceil((this.winEndsAt - nowMs) / 1000)) : 0,
      money: this.money,
      armor: this.alive ? this.armor || 0 : 0,
      moneyFx: (this.moneyFx = this.moneyFx.filter(
        (positionX) => nowMs - positionX.t < 2200,
      )).slice(-4),
      canBuy: (this.game === 'comp' || this.game === 'tdm') && this.canBuyNow(),
      buyOpen: this.buyOpen,
      pickName: this.dropTarget ? WEAPONS[this.dropTarget.w].name : null,
      spectating: this.spec
        ? (() => {
            const scopeWeapon = WEAPONS[this.spec.st.w];
            return {
              name: this.spec.name,
              hp: this.spec.hp,
              team: this.spec.team,
              more: this.spec.count > 1,
              scoped: !!(scopeWeapon?.scope && this.spec.st.ad),
              scopeType: scopeWeapon?.scopeType || 'sniper',
            };
          })()
        : null,
      comp: this.comp
        ? {
            ph: this.comp.ph,
            round: this.comp.round,
            timeLeft: Math.max(0, (this.comp.endAt - nowMs) / 1000),
            bomb: this.comp.b,
            bombLeft:
              this.comp.b === 'planted' ? Math.max(0, (this.comp.explodeAt - nowMs) / 1000) : null,
            site: this.comp.bs,
            hasBomb: this.slots.includes(C4),
            plantP: this.planting ? clamp((now - this.planting) / (COMP.plantMs / 1000), 0, 1) : 0,
            defuseP: this.defusing
              ? clamp((now - this.defusing) / (COMP.defuseMs / 1000), 0, 1)
              : 0,
            canDefuse: !!this.canDefuse,
            banner: this.compBanner && nowMs - this.compBanner.at < 4500 ? this.compBanner : null,
          }
        : null,
    });
    void now;
  }

  render() {
    const renderer = this.renderer;
    renderer.clear();
    if (!this.joined) {
      renderer.render(this.lobby.scene, this.lobby.camera);
      return;
    }
    renderer.render(this.scene, this.camera);
    const specScoped = this.spec && WEAPONS[this.spec.st.w]?.scope && this.spec.st.ad;
    if (
      this.joined &&
      !this.inLobby &&
      ((this.scope === 0 && this.alive) || (this.spec && !specScoped))
    ) {
      renderer.clearDepth();
      this.viewmodel.render(renderer);
    }
  }
}
