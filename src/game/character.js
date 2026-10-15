import * as THREE from 'three';
import { outfitOf, skinOf, DEFAULT_LOOK } from '../../shared/look.js';
import { WEAPONS } from '../../shared/weapons.js';
import { BUILDERS } from './guns.js';
import { applySkin } from './skins.js';

const createMaterial = (color, roughness = 0.8, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color: color, roughness: roughness, metalness: metalness });
const DARK = createMaterial(0x0d0f12, 0.15, 0.7);
const HAIR = createMaterial(0x2a1d14, 0.9, 0);
const BOOT = createMaterial(0x18191b, 0.8, 0.1);
const KNIT = createMaterial(0x1b1c1e, 0.97, 0);
const RUBBER = createMaterial(0x2b2d2f, 0.7, 0.05);
const BONE = createMaterial(0xe6e0d0, 0.6, 0);
const GLASS = new THREE.MeshStandardMaterial({ color: 0x1c2a33, roughness: 0.1, metalness: 0.6 });
const NVG_LENS = new THREE.MeshStandardMaterial({
  color: 0x0b1a0d,
  emissive: 0x2aff55,
  emissiveIntensity: 0.55,
  roughness: 0.2,
});

let glintTex = null;
function glintMaterial() {
  if (!glintTex) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(200,230,255,0.8)');
    gradient.addColorStop(1, 'rgba(160,200,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = 'rgba(255,255,255,0.7)';
    context.fillRect(0, 30, 64, 4);
    glintTex = new THREE.CanvasTexture(canvas);
  }
  return new THREE.SpriteMaterial({
    map: glintTex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0,
  });
}
const GLOVE = createMaterial(0x1d1f22, 0.8, 0);
const TEAM_HEX = [0xe08a2e, 0x3b82d6];

export function makeLookMats() {
  return {
    suit: createMaterial(0),
    vest: createMaterial(0),
    pouch: createMaterial(0),
    gear: createMaterial(0, 0.55, 0.25),
    skin: createMaterial(0, 0.85),
  };
}

export function applyLookColors(metalness, look) {
  const object = outfitOf(look);
  metalness.suit.color.setHex(object.suit);
  metalness.vest.color.setHex(object.vest);
  metalness.pouch.color.setHex(object.pouch);
  metalness.gear.color.setHex(object.gear);
  metalness.skin.color.setHex(skinOf(look).color);
}

function part(width, height, depth, material, positionX, positionY, positionZ) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(positionX, positionY, positionZ);
  mesh.castShadow = true;
  return mesh;
}

export function buildHeadgear(look, width, height, depth, metalness) {
  const group = new THREE.Group();
  const front = -depth / 2;
  const eyes = () => {
    for (const side of [-1, 1]) {
      group.add(
        part(
          width * 0.14,
          height * 0.08,
          0.02,
          DARK,
          side * width * 0.22,
          height * 0.6,
          front - 0.008,
        ),
      );
    }
  };
  const helmet = () => {
    group.add(
      part(
        width * 1.23,
        height * 0.52,
        depth * 1.2,
        metalness.gear,
        0,
        height * 1.08,
        depth * 0.04,
      ),
    );
    group.add(
      part(
        width * 1.32,
        height * 0.12,
        depth * 1.29,
        metalness.gear,
        0,
        height * 0.84,
        depth * 0.04,
      ),
    );
  };
  const fullFace = look.face === 'balaclava' || look.face === 'gasmask';

  switch (look.head) {
    case 'helmet':
      helmet();
      break;
    case 'nvg':
      helmet();
      group.add(
        part(width * 0.3, height * 0.16, 0.03, DARK, 0, height * 1.02, front - depth * 0.12),
      );
      group.add(
        part(width * 0.12, height * 0.1, 0.05, DARK, 0, height * 1.12, front - depth * 0.2),
      );
      for (const side of [-1, 1]) {
        const tube = new THREE.Mesh(
          new THREE.CylinderGeometry(width * 0.12, width * 0.13, depth * 0.55, 12),
          DARK,
        );
        tube.rotation.x = Math.PI / 2 - 0.5;
        tube.position.set(side * width * 0.17, height * 1.18, front - depth * 0.32);
        group.add(tube);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(width * 0.1, 12), NVG_LENS);
        lens.position.set(side * width * 0.17, height * 1.3, front - depth * 0.55);
        lens.rotation.x = 0.5 + Math.PI;
        group.add(lens);
      }
      group.add(
        part(
          width * 0.16,
          height * 0.1,
          depth * 0.1,
          metalness.pouch,
          0,
          height * 1.1,
          depth * 0.62,
        ),
      );
      break;
    case 'cap':
      group.add(
        part(width * 1.08, height * 0.3, depth * 1.06, metalness.gear, 0, height * 0.95, 0),
      );
      group.add(
        part(
          width * 0.92,
          height * 0.05,
          depth * 0.6,
          metalness.gear,
          0,
          height * 0.82,
          front - depth * 0.22,
        ),
      );
      break;
    case 'beanie':
      group.add(part(width * 1.1, height * 0.42, depth * 1.1, metalness.vest, 0, height * 0.93, 0));
      group.add(
        part(width * 1.15, height * 0.13, depth * 1.15, metalness.pouch, 0, height * 0.74, 0),
      );
      break;
    case 'boonie':
      group.add(part(width * 1.1, height * 0.3, depth * 1.1, metalness.gear, 0, height * 1.0, 0));
      group.add(
        part(width * 1.75, height * 0.04, depth * 1.75, metalness.gear, 0, height * 0.86, 0),
      );
      group.add(
        part(width * 1.12, height * 0.06, depth * 1.12, metalness.vest, 0, height * 0.9, 0),
      );
      break;
    case 'headset':
      if (!fullFace) {
        group.add(
          part(width * 1.05, height * 0.16, depth * 1.05, HAIR, 0, height * 0.97, depth * 0.02),
        );
      }
      group.add(part(width * 0.16, height * 0.08, depth * 0.5, DARK, 0, height * 1.08, 0));
      for (const side of [-1, 1]) {
        group.add(
          part(
            width * 0.14,
            height * 0.3,
            depth * 0.36,
            DARK,
            side * width * 0.58,
            height * 0.6,
            0,
          ),
        );
      }
      group.add(
        part(
          width * 0.04,
          height * 0.04,
          depth * 0.42,
          DARK,
          -width * 0.44,
          height * 0.42,
          front + depth * 0.12,
        ),
      );
      break;
    default:
      if (!fullFace) {
        group.add(
          part(width * 1.05, height * 0.16, depth * 1.05, HAIR, 0, height * 0.97, depth * 0.02),
        );
      }
  }

  switch (look.face) {
    case 'mask':
      group.add(part(width * 0.95, height * 0.22, 0.03, DARK, 0, height * 0.62, front - 0.012));
      group.add(
        part(width * 0.92, height * 0.34, 0.02, metalness.vest, 0, height * 0.2, front - 0.008),
      );
      break;
    case 'glasses':
      group.add(part(width * 0.9, height * 0.12, 0.02, DARK, 0, height * 0.62, front - 0.01));
      break;
    case 'balaclava':
      group.add(part(width * 1.06, height * 0.4, depth * 1.06, KNIT, 0, height * 0.86, 0));
      group.add(part(width * 1.06, height * 0.52, depth * 1.06, KNIT, 0, height * 0.24, 0));
      group.add(
        part(width * 1.06, height * 0.18, depth * 0.86, KNIT, 0, height * 0.58, depth * 0.1),
      );
      eyes();
      break;
    case 'skull':
      group.add(part(width * 0.98, height * 0.8, 0.04, BONE, 0, height * 0.45, front - 0.016));
      for (const side of [-1, 1]) {
        group.add(
          part(
            width * 0.24,
            height * 0.17,
            0.02,
            DARK,
            side * width * 0.21,
            height * 0.6,
            front - 0.04,
          ),
        );
      }
      group.add(part(width * 0.1, height * 0.1, 0.02, DARK, 0, height * 0.42, front - 0.04));
      for (let index = -3; index <= 3; index++) {
        group.add(
          part(
            width * 0.035,
            height * 0.12,
            0.02,
            DARK,
            index * width * 0.09,
            height * 0.18,
            front - 0.04,
          ),
        );
      }
      group.add(part(width * 0.7, height * 0.02, 0.02, DARK, 0, height * 0.18, front - 0.042));
      break;
    case 'gasmask': {
      group.add(part(width * 1.0, height * 0.78, 0.05, RUBBER, 0, height * 0.42, front - 0.02));
      group.add(
        part(
          width * 1.05,
          height * 0.62,
          depth * 0.55,
          RUBBER,
          0,
          height * 0.4,
          front + depth * 0.26,
        ),
      );
      for (const side of [-1, 1]) {
        const ring = new THREE.Mesh(
          new THREE.CylinderGeometry(width * 0.15, width * 0.15, 0.03, 16),
          RUBBER,
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.set(side * width * 0.22, height * 0.6, front - 0.05);
        group.add(ring);
        const glass = new THREE.Mesh(new THREE.CircleGeometry(width * 0.115, 16), GLASS);
        glass.position.set(side * width * 0.22, height * 0.6, front - 0.066);
        glass.rotation.y = Math.PI;
        group.add(glass);
      }
      const filter = new THREE.Mesh(
        new THREE.CylinderGeometry(width * 0.17, width * 0.15, depth * 0.38, 16),
        metalness.gear,
      );
      filter.rotation.x = Math.PI / 2;
      filter.position.set(0, height * 0.2, front - depth * 0.22);
      group.add(filter);
      group.add(part(width * 1.08, height * 0.08, depth * 1.08, RUBBER, 0, height * 0.62, 0));
      if (!['helmet', 'nvg', 'cap', 'beanie', 'boonie'].includes(look.head)) {
        group.add(part(width * 1.06, height * 0.3, depth * 1.06, RUBBER, 0, height * 0.9, 0));
      }
      break;
    }
    case 'bandana':
      eyes();
      group.add(
        part(width * 1.04, height * 0.42, depth * 1.04, metalness.pouch, 0, height * 0.24, 0),
      );
      group.add(
        part(width * 0.5, height * 0.14, 0.03, metalness.pouch, 0, height * 0.0, front - 0.01),
      );
      break;
    case 'goggles':
      group.add(part(width * 1.02, height * 0.18, 0.05, DARK, 0, height * 0.62, front - 0.02));
      for (const side of [-1, 1]) {
        group.add(
          part(
            width * 0.36,
            height * 0.12,
            0.02,
            GLASS,
            side * width * 0.22,
            height * 0.62,
            front - 0.048,
          ),
        );
      }
      group.add(part(width * 1.06, height * 0.07, depth * 1.06, DARK, 0, height * 0.62, 0));
      break;
    case 'respirator':
      eyes();
      group.add(part(width * 0.7, height * 0.36, 0.06, RUBBER, 0, height * 0.26, front - 0.025));
      for (const side of [-1, 1]) {
        const mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(width * 0.11, width * 0.11, 0.05, 14),
          metalness.gear,
        );
        mesh.rotation.x = Math.PI / 2;
        mesh.rotation.z = side * 0.5;
        mesh.position.set(side * width * 0.36, height * 0.24, front - 0.03);
        group.add(mesh);
      }
      group.add(part(width * 1.06, height * 0.05, depth * 1.06, RUBBER, 0, height * 0.34, 0));
      break;
    default:
      eyes();
  }
  return group;
}

export function disposeGroup(group) {
  group.traverse((object) => {
    if (object.isMesh && object.geometry !== UNIT) {
      object.geometry.dispose();
    }
  });
}

const UNIT = new THREE.BoxGeometry(1, 1, 1);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const GRIP = new THREE.Vector3(0, -0.1, 0.03);
const MELEE_GRIP = new THREE.Vector3(0, -0.06, 0.02);
const NADE_GRIP = new THREE.Vector3(0, -0.02, -0.06);
const SUPPORT_Z = { rifle: -0.35, m4: -0.36, smg: -0.25, awp: -0.4, scout: -0.36, shotgun: -0.36 };
const CHEST = new THREE.Vector3(0, 0.46, 0);
const SH_R = new THREE.Vector3(0.27, 0.48, 0);
const SH_L = new THREE.Vector3(-0.27, 0.48, 0);
const LOW = {
  grenade: {
    q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 0.3, 0, 'YXZ')),
    grip: new THREE.Vector3(0.12, 0.24, -0.27),
  },
  primary: {
    q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0.95, 0.25, 'YXZ')),
    grip: new THREE.Vector3(0.17, 0.16, -0.24),
  },
  secondary: {
    q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.05, 0.25, 0, 'YXZ')),
    grip: new THREE.Vector3(0.06, 0.1, -0.3),
  },
  melee: {
    q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, -0.2, 0, 'YXZ')),
    grip: new THREE.Vector3(0.3, 0.1, -0.2),
  },
};
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const lerp = (from, to, amount) => from + (to - from) * amount;

function block(width, height, depth, material, positionX, positionY, positionZ) {
  const mesh = new THREE.Mesh(UNIT, material);
  mesh.scale.set(width, height, depth);
  mesh.position.set(positionX, positionY, positionZ);
  mesh.castShadow = true;
  return mesh;
}

const scratchDirection = new THREE.Vector3();
function stretch(metalness, start, end, thickness) {
  scratchDirection.subVectors(end, start);
  const length = scratchDirection.length() || 1e-4;
  metalness.position.copy(start).addScaledVector(scratchDirection, 0.5);
  metalness.scale.set(thickness, thickness, length + thickness * 0.4);
  metalness.quaternion.setFromUnitVectors(AXIS_Z, scratchDirection.multiplyScalar(1 / length));
}

export class CharacterRig {
  constructor(look = DEFAULT_LOOK, { lowReady = false } = {}) {
    this.lowReady = lowReady;
    this.m = makeLookMats();
    this.teamMat = createMaterial(0x888888, 0.7, 0.1);
    const { suit, vest, pouch, skin } = this.m;

    const root = (this.root = new THREE.Group());
    const pelvis = (this.pelvis = new THREE.Group());
    pelvis.position.y = 0.95;
    pelvis.add(block(0.42, 0.2, 0.24, suit, 0, -0.03, 0));
    pelvis.add(block(0.44, 0.05, 0.26, BOOT, 0, 0.03, 0));
    this.legs = [-1, 1].map((side) => {
      const thigh = new THREE.Group();
      thigh.position.set(side * 0.12, -0.05, 0);
      thigh.add(block(0.17, 0.47, 0.2, suit, 0, -0.22, 0));
      thigh.add(block(0.18, 0.12, 0.17, pouch, 0, -0.3, -0.03));
      const knee = new THREE.Group();
      knee.position.y = -0.45;
      knee.add(block(0.16, 0.42, 0.19, suit, 0, -0.2, 0));
      knee.add(block(0.19, 0.13, 0.29, BOOT, 0, -0.4, -0.04));
      thigh.add(knee);
      pelvis.add(thigh);
      return { thigh, knee };
    });

    const torso = (this.torso = new THREE.Group());
    torso.add(block(0.44, 0.5, 0.24, suit, 0, 0.3, 0));
    torso.add(block(0.5, 0.42, 0.31, vest, 0, 0.3, 0));
    for (const positionX of [-0.14, 0, 0.14]) {
      torso.add(block(0.11, 0.13, 0.06, pouch, positionX, 0.18, -0.17));
    }
    torso.add(block(0.12, 0.08, 0.12, skin, 0, 0.58, 0));
    this.pads = [
      block(0.17, 0.11, 0.21, this.teamMat, 0.29, 0.53, 0),
      block(0.17, 0.11, 0.21, this.teamMat, -0.29, 0.53, 0),
    ];
    this.pads.forEach((pad) => {
      pad.visible = false;
      torso.add(pad);
    });
    const head = (this.head = new THREE.Group());
    head.position.y = 0.6;
    head.add(block(0.22, 0.25, 0.24, skin, 0, 0.13, 0));
    this.gear = new THREE.Group();
    this.gear.position.y = 0.005;
    head.add(this.gear);
    torso.add(head);

    this.arm = [0, 1, 2, 3].map((index) => {
      const metalness = new THREE.Mesh(UNIT, suit);
      metalness.castShadow = true;
      metalness.userData.w = index % 2 === 0 ? 0.12 : 0.1;
      torso.add(metalness);
      return metalness;
    });
    this.gloves = [0, 1].map(() => {
      const group = block(0.08, 0.08, 0.1, GLOVE, 0, 0, 0);
      torso.add(group);
      return group;
    });
    this.weaponHolder = new THREE.Group();
    torso.add(this.weaponHolder);
    pelvis.add(torso);
    this.tilt = new THREE.Group();
    this.tilt.add(pelvis);
    root.add(this.tilt);

    this.weaponId = null;
    this.mode = 'primary';
    this.lookKey = '';
    this.t = Math.random() * 10;
    this.phase = 0;
    this.cr = 0;
    this.air = 0;
    this.kick = 0;
    this.swingT = 0;
    this.swingDir = 1;
    this.aimT = 0;
    this.aimHold = 0;
    this.scopeT = 0;
    this.relT = 0;
    this.dead = false;
    this.skinId = 'default';
    this.setLook(look);
  }

  setLook(look) {
    const key = JSON.stringify(look);
    if (key === this.lookKey) {
      return;
    }
    this.lookKey = key;
    applyLookColors(this.m, look);
    disposeGroup(this.gear);
    this.gear.clear();
    this.gear.add(buildHeadgear(look, 0.22, 0.25, 0.24, this.m));
  }

  setTeam(team) {
    const on = team === 0 || team === 1;
    this.pads.forEach((pad) => {
      pad.visible = on;
    });
    if (on) {
      this.teamMat.color.setHex(TEAM_HEX[team]);
    }
  }

  setWeapon(id) {
    if (!BUILDERS[id] || id === this.weaponId) {
      return;
    }
    this.weaponId = id;
    disposeGroup(this.weaponHolder);
    this.weaponHolder.clear();
    const built = BUILDERS[id](false);
    const group = built.group;
    this.muzzle = built.muzzle.clone();
    this.supportZ = built.support ?? SUPPORT_Z[id] ?? null;
    this.leftGrip = built.leftGrip || null;
    this.muzzle2 = built.muzzle2 || null;
    this.altSide = false;
    group.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
      }
    });
    if (WEAPONS.find((width) => width.id === id)?.grenade) {
      group.scale.setScalar(1.6);
    }
    this.weapon = group;
    this.weaponHolder.add(group);
    applySkin(group, this.skinId);
    const definition = WEAPONS.find((width) => width.id === id);
    this.slot = definition?.slot || 'primary';
    this.mode = this.lowReady
      ? 'low'
      : this.slot === 'c4' || id === 'defkit'
        ? 'secondary'
        : this.slot;
    this.swingT = 0;
    this.glint = null;
    if (definition?.scope) {
      this.glint = new THREE.Sprite(glintMaterial());
      this.glint.position.set(0, 0.074, -0.3);
      this.glint.scale.setScalar(0.22);
      group.add(this.glint);
    }
  }

  die(deltaX = 0, deltaZ = 1, strength = 1) {
    if (this.dead) {
      return;
    }
    this.dead = true;
    const distance = Math.hypot(deltaX, deltaZ) || 1;
    this.fallAxis = new THREE.Vector3(deltaZ / distance, 0, -deltaX / distance);
    this.fallA = 0;
    this.fallV = 0.8 + strength * 1.2;
    const roughness = () => Math.random() - 0.5;
    this.limp = {
      thigh: [0.5 + roughness() * 0.8, 0.3 + roughness() * 0.8],
      knee: [-1.1 + roughness() * 0.8, -0.6 + roughness() * 0.8],
      torso: roughness() * 0.6,
      headX: roughness() * 1.2,
      headZ: roughness() * 1.4,
      handR: new THREE.Vector3(
        0.45 + roughness() * 0.3,
        0.2 + roughness() * 0.4,
        roughness() * 0.5,
      ),
      handL: new THREE.Vector3(
        -0.45 + roughness() * 0.3,
        0.2 + roughness() * 0.4,
        roughness() * 0.5,
      ),
    };
    const makeSpring = (positionX) => ({ x: positionX, v: 0 });
    this.spr = {
      thigh: this.legs.map((group) => makeSpring(group.thigh.rotation.x)),
      knee: this.legs.map((group) => makeSpring(group.knee.rotation.x)),
      pelvis: makeSpring(this.pelvis.position.y),
      torso: makeSpring(this.torso.rotation.x),
      headX: makeSpring(this.head.rotation.x),
      headZ: makeSpring(this.head.rotation.z),
      hand: [this.gloves[0].position.clone(), this.gloves[1].position.clone()],
      handV: [new THREE.Vector3(), new THREE.Vector3()],
    };
    this.weaponHolder.visible = false;
  }

  setVest(on) {
    if (this.vestOn === on) {
      return;
    }
    this.vestOn = on;
    for (const color of this.torso.children) {
      if (!color.isMesh) {
        continue;
      }
      if (color.material === this.m.vest || color.material === this.m.pouch) {
        color.visible = on;
      }
    }
  }

  twitch() {
    const springs = this.spr;
    if (!springs) {
      return;
    }
    const roughness = () => (Math.random() - 0.5) * 9;
    springs.thigh.forEach((object) => (object.v += roughness()));
    springs.knee.forEach((object) => (object.v += roughness()));
    springs.torso.v += roughness() * 0.5;
    springs.headX.v += roughness();
    springs.headZ.v += roughness();
  }

  revive() {
    this.dead = false;
    this.tilt.quaternion.identity();
    this.weaponHolder.visible = true;
  }

  updateDead(deltaTime) {
    const LYING = 1.45;
    this.fallV += 7 * Math.sin(this.fallA + 0.2) * deltaTime;
    this.fallA += this.fallV * deltaTime;
    if (this.fallA >= LYING) {
      this.fallA = LYING;
      this.fallV = Math.abs(this.fallV) > 0.6 ? -this.fallV * 0.25 : 0;
    }
    this.tilt.quaternion.setFromAxisAngle(this.fallAxis, this.fallA);

    const spring = (object, target, stiffness = 70, damp = 9) => {
      object.v += (target - object.x) * stiffness * deltaTime;
      object.v *= Math.exp(-damp * deltaTime);
      object.x += object.v * deltaTime;
      return object.x;
    };
    const limp = this.limp;
    const springs = this.spr;
    this.legs.forEach(({ thigh, knee }, index) => {
      thigh.rotation.x = spring(springs.thigh[index], limp.thigh[index]);
      knee.rotation.x = spring(springs.knee[index], limp.knee[index]);
    });
    this.pelvis.position.y = spring(
      springs.pelvis,
      0.95 - 0.3 * Math.min(1, this.fallA / LYING),
      40,
      7,
    );
    this.torso.rotation.x = spring(springs.torso, limp.torso, 40, 6);
    this.head.rotation.x = spring(springs.headX, limp.headX, 50, 5);
    this.head.rotation.z = spring(springs.headZ, limp.headZ, 50, 5);
    this.head.rotation.y = 0;

    const targets = [limp.handR, limp.handL];
    const shoulders = [SH_R, SH_L];
    for (let index = 0; index < 2; index++) {
      const height = springs.hand[index];
      const handVelocity = springs.handV[index];
      handVelocity
        .addScaledVector(targets[index].clone().sub(height), 60 * deltaTime)
        .multiplyScalar(Math.exp(-7 * deltaTime));
      height.addScaledVector(handVelocity, deltaTime);
      const element = shoulders[index]
        .clone()
        .lerp(height, 0.5)
        .add(new THREE.Vector3(index ? -0.08 : 0.08, -0.06, 0.06));
      stretch(this.arm[index * 2], shoulders[index], element, this.arm[index * 2].userData.w);
      stretch(this.arm[index * 2 + 1], element, height, this.arm[index * 2 + 1].userData.w);
      this.gloves[index].position.copy(height);
    }
  }

  setSkin(id = 'default') {
    if (id === this.skinId) {
      return;
    }
    this.skinId = id;
    applySkin(this.weapon, id);
  }

  recoil() {
    this.kick = 1;
    if (this.muzzle2) {
      this.altSide = !this.altSide;
    }
    this.aimHold = 1.2;
    this.aimT = 1;
    this.update(0, this.lastO);
  }

  muzzleWorld() {
    if (!this.weapon || this.mode === 'melee') {
      return null;
    }
    this.weapon.updateWorldMatrix(true, false);
    return this.weapon.localToWorld(
      (this.muzzle2 && this.altSide ? this.muzzle2 : this.muzzle).clone(),
    );
  }

  swing() {
    this.swingT = 1;
    this.swingDir = -this.swingDir;
  }

  stab() {
    this.stabT = 1;
  }

  update(deltaTime, object = {}) {
    this.lastO = object;
    if (this.dead) {
      this.updateDead(deltaTime);
      return;
    }
    this.t += deltaTime;
    const rate = (roughness) => Math.min(1, deltaTime * roughness);
    this.cr += ((object.crouch ? 1 : 0) - this.cr) * rate(10);
    this.air += ((object.air ? 1 : 0) - this.air) * rate(8);
    this.kick = Math.max(0, this.kick - deltaTime * 8);
    this.swingT = Math.max(0, this.swingT - deltaTime * 3.5);
    this.aimHold = Math.max(0, this.aimHold - deltaTime);
    this.relT += ((object.reloading ? 1 : 0) - this.relT) * rate(8);
    const release = this.relT;
    this.aimT +=
      ((!object.reloading && (object.aiming || this.aimHold > 0) ? 1 : 0) - this.aimT) * rate(9);
    this.scopeT +=
      ((!object.reloading && object.aiming && this.mode === 'primary' ? 1 : 0) - this.scopeT) *
      rate(7);
    const aim = this.aimT;
    const scopeAmount = this.scopeT;
    if (this.glint) {
      this.glint.material.opacity =
        scopeAmount > 0.6 ? (scopeAmount - 0.6) * 2.5 * (0.75 + Math.sin(this.t * 7) * 0.25) : 0;
    }
    const crouchAmount = this.cr;
    const air = this.air;
    const speed = object.speed || 0;

    const amplitude = Math.min(1, speed / 6) * 0.55 * (1 - air);
    this.phase += speed * deltaTime * 2.1;
    this.legs.forEach(({ thigh, knee }, index) => {
      const stepPhase = this.phase + (index ? Math.PI : 0);
      thigh.rotation.x =
        lerp(0, 1.25, crouchAmount) +
        Math.sin(stepPhase) * amplitude * (1 - crouchAmount * 0.5) +
        air * 0.55;
      knee.rotation.x =
        lerp(0, -2.2, crouchAmount) -
        Math.max(0, -Math.cos(stepPhase)) * amplitude * 1.2 -
        air * 1.0;
    });
    this.pelvis.position.y =
      lerp(0.95, 0.45, crouchAmount) - Math.abs(Math.sin(this.phase)) * 0.06 * amplitude;

    if (object.typing) {
      this.kick = 0.25 + Math.sin(this.t * 15) * 0.25;
    }
    const pitch = clamp(object.typing ? -1.1 : object.pitch || 0, -1.3, 1.3);
    const breathe = Math.sin(this.t * 1.6);
    this.torso.rotation.x =
      pitch * 0.25 - crouchAmount * 0.3 + breathe * 0.01 * (1 - scopeAmount) - scopeAmount * 0.12;
    const pitchDelta = pitch - this.torso.rotation.x;
    this.head.rotation.x = clamp(pitchDelta * 0.8, -0.8, 0.8);
    this.head.rotation.y = object.headYaw || 0;
    const cheek = this.mode === 'primary' ? aim : 0;
    this.head.rotation.x -= cheek * 0.12 + scopeAmount * 0.1;
    this.head.rotation.z = cheek * 0.15 + scopeAmount * 0.2;
    if (!this.weapon) {
      return;
    }

    const width = this.weapon;
    const quaternion = new THREE.Quaternion();
    let gripLocal = GRIP;
    if (this.mode === 'low') {
      const pose = LOW[this.slot] || LOW.primary;
      gripLocal = this.slot === 'melee' ? MELEE_GRIP : this.slot === 'grenade' ? NADE_GRIP : GRIP;
      quaternion.copy(pose.q);
      width.quaternion.copy(quaternion);
      width.position.copy(pose.grip).sub(gripLocal.clone().applyQuaternion(quaternion));
      width.position.y += breathe * 0.006;
    } else if (this.mode === 'grenade') {
      const swing = this.swingT > 0 ? 1 - this.swingT : 0;
      const ready = new THREE.Vector3(0.14, 0.4 + pitchDelta * 0.12, -0.3);
      const back = new THREE.Vector3(0.27, 0.76, 0.12);
      const forward = new THREE.Vector3(0.1, 0.5 + pitchDelta * 0.15, -0.6);
      const hand =
        swing === 0
          ? ready
          : swing < 0.35
            ? ready.clone().lerp(back, swing / 0.35)
            : back.clone().lerp(forward, (swing - 0.35) / 0.65);
      hand.y += breathe * 0.004;
      width.quaternion.setFromEuler(new THREE.Euler(-0.3 - swing * 1.4, 0.2, 0, 'YXZ'));
      gripLocal = NADE_GRIP;
      width.position.copy(hand).sub(NADE_GRIP.clone().applyQuaternion(width.quaternion));
    } else if (this.mode === 'melee') {
      const swing = this.swingT > 0 ? 1 - this.swingT : 0;
      const sweep = Math.sin(swing * Math.PI);
      const yaw = this.swingT > 0 ? this.swingDir * (0.8 - 1.6 * swing) : 0.15;
      this.stabT = Math.max(0, (this.stabT || 0) - deltaTime * 2.3);
      const thrust = this.stabT > 0 ? Math.sin((1 - this.stabT) * Math.PI) : 0;
      quaternion.setFromEuler(
        new THREE.Euler(pitchDelta - sweep * 0.4, yaw * (1 - thrust), 0, 'YXZ'),
      );
      const hand = new THREE.Vector3(
        0.18 - 0.1 * thrust,
        -0.12 + 0.1 * thrust,
        -0.38 - 0.32 * thrust,
      )
        .applyQuaternion(quaternion)
        .add(CHEST);
      width.quaternion
        .copy(quaternion)
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.9 - sweep * 0.7, 0, 0)));
      gripLocal = MELEE_GRIP;
      width.position.copy(hand).sub(MELEE_GRIP.clone().applyQuaternion(width.quaternion));
    } else {
      const down = (1 - aim) * 0.45 + release * 0.5;
      quaternion.setFromEuler(
        new THREE.Euler(
          pitchDelta * (1 - release * 0.7) - down + this.kick * 0.12,
          (1 - aim) * 0.25 + release * 0.35,
          release * 0.7,
          'YXZ',
        ),
      );
      const sec = this.mode === 'secondary';
      const off = sec
        ? new THREE.Vector3(
            lerp(0.06, 0.04, aim),
            lerp(-0.06, 0.1, aim),
            lerp(-0.38, -0.48, aim) + this.kick * 0.05,
          )
        : new THREE.Vector3(
            lerp(0.15, 0.12, aim) - scopeAmount * 0.03,
            lerp(-0.02, 0.12, aim) + scopeAmount * 0.05,
            -0.27 + scopeAmount * 0.06 + this.kick * 0.06,
          );
      off.lerp(
        sec ? new THREE.Vector3(0.05, -0.08, -0.3) : new THREE.Vector3(0.08, -0.06, -0.22),
        release,
      );
      width.quaternion.copy(quaternion);
      width.position.copy(off.applyQuaternion(quaternion)).add(CHEST);
    }

    if (this.leftGrip) {
      width.position.add(new THREE.Vector3(0.12, 0, 0).applyQuaternion(width.quaternion));
    }

    const handR = gripLocal.clone().applyQuaternion(width.quaternion).add(width.position);
    let handL;
    const holdsLongGun =
      this.mode === 'primary' || (this.mode === 'low' && this.slot === 'primary')
        ? this.supportZ
        : null;
    if (this.mode === 'low' && (this.slot === 'melee' || this.slot === 'grenade')) {
      handL = new THREE.Vector3(-0.27, 0.04 + breathe * 0.006, -0.04);
    } else if (this.mode === 'grenade') {
      handL =
        this.swingT > 0
          ? new THREE.Vector3(-0.2, 0.44, -0.42)
          : new THREE.Vector3(-0.02, 0.43 + pitchDelta * 0.12, -0.31);
    } else if (this.mode === 'melee') {
      handL = new THREE.Vector3(
        -0.26,
        0.14 + Math.abs(Math.sin(this.phase)) * 0.03 * amplitude,
        -0.1,
      );
    } else if (this.leftGrip) {
      handL = this.leftGrip.clone().applyQuaternion(width.quaternion).add(width.position);
    } else if ((holdsLongGun ?? null) !== null) {
      handL = new THREE.Vector3(-0.01, -0.045, holdsLongGun)
        .applyQuaternion(width.quaternion)
        .add(width.position);
    } else {
      handL = new THREE.Vector3(-0.045, -0.1, 0.05)
        .applyQuaternion(width.quaternion)
        .add(width.position);
    }
    if (release > 0.01 && this.mode !== 'melee') {
      const magnitude = new THREE.Vector3(
        -0.02,
        -0.16 + Math.sin(this.t * 9) * 0.03 * release,
        this.mode === 'secondary' ? 0.0 : -0.15,
      )
        .applyQuaternion(width.quaternion)
        .add(width.position);
      handL.lerp(magnitude, release);
    }
    const elR = SH_R.clone()
      .lerp(handR, 0.5)
      .add(new THREE.Vector3(0.1, -0.1, 0.08));
    const elL = SH_L.clone()
      .lerp(handL, 0.5)
      .add(new THREE.Vector3(-0.1, -0.1, 0.05));
    const [firstUpperArm, firstForearm, secondUpperArm, secondForearm] = this.arm;
    stretch(firstUpperArm, SH_R, elR, firstUpperArm.userData.w);
    stretch(firstForearm, elR, handR, firstForearm.userData.w);
    stretch(secondUpperArm, SH_L, elL, secondUpperArm.userData.w);
    stretch(secondForearm, elL, handL, secondForearm.userData.w);
    this.gloves[0].position.copy(handR);
    this.gloves[1].position.copy(handL);
  }

  setWeaponVisible(visible) {
    this.weaponHolder.visible = visible && !this.dead;
  }

  dispose() {
    disposeGroup(this.gear);
    disposeGroup(this.weaponHolder);
    Object.values(this.m).forEach((metalness) => metalness.dispose());
    this.teamMat.dispose();
  }
}
