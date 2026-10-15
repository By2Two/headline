import * as THREE from 'three';
import { playerHitboxes } from '../../shared/raycast.js';
import { MOVE } from '../../shared/constants.js';
import { WEAPONS } from '../../shared/weapons.js';
import { decodeLook } from '../../shared/look.js';
import { SKINS } from '../../shared/skins.js';
import { CharacterRig } from './character.js';

const unit = new THREE.BoxGeometry(1, 1, 1);
const HITBOX_MAT = new THREE.MeshBasicMaterial({
  color: 0xff3b3b,
  wireframe: true,
  depthTest: false,
  transparent: true,
  opacity: 0.8,
});

export class RemotePlayer {
  constructor(scene, id) {
    this.id = id;
    this.scene = scene;
    this.root = new THREE.Group();
    this.rig = new CharacterRig();
    this.rig.root.scale.setScalar(0.96);
    this.root.add(this.rig.root);

    this.parts = {};
    for (const part of ['head', 'body', 'legs']) {
      const mesh = new THREE.Mesh(unit, HITBOX_MAT);
      mesh.visible = false;
      mesh.renderOrder = 5;
      this.parts[part] = mesh;
      this.root.add(mesh);
    }

    this.team = -1;
    this.lk = null;
    this.px = null;
    this.py = 0;
    this.pz = 0;
    this.speed = 0;
    this.vy = 0;
    this.stepT = 0;
    this.nameSprite = null;
    this.name = '';
    this.wounds = [];
    this.flyOff = new THREE.Vector3();
    this.fly = null;
    this.gibbed = [];
    this.ground = () => 0;
    scene.add(this.root);
  }

  setLook(code) {
    if (code === this.lk) {
      return;
    }
    this.lk = code;
    this.rig.setLook(decodeLook(code));
  }

  setSkin(skin) {
    this.sk = skin || 0;
  }

  setTeam(team) {
    if (team === this.team) {
      return;
    }
    this.team = team;
    this.rig.setTeam(team);
  }

  setName(name, show) {
    if (name !== this.name) {
      this.name = name;
      if (this.nameSprite) {
        this.nameSprite.material.map.dispose();
        this.nameSprite.material.dispose();
        this.root.remove(this.nameSprite);
        this.nameSprite = null;
      }
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const context = canvas.getContext('2d');
      context.font = 'bold 34px system-ui, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.lineWidth = 6;
      context.strokeStyle = 'rgba(0,0,0,0.85)';
      context.strokeText(name, 128, 32);
      context.fillStyle = '#ffffff';
      context.fillText(name, 128, 32);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }),
      );
      sprite.scale.set(1.2, 0.3, 1);
      sprite.renderOrder = 10;
      this.nameSprite = sprite;
      this.root.add(sprite);
    }
    if (this.nameSprite) {
      this.nameSprite.visible = show;
    }
  }

  setDebug(on) {
    for (const factor of ['head', 'body', 'legs']) {
      this.parts[factor].visible = on;
    }
  }

  addWound(point, shotDir, effects) {
    const rig = this.rig;
    this.root.updateMatrixWorld(true);
    const meshes = [];
    rig.root.traverse((object) => {
      if (object.isMesh && !object.userData.wound && object.visible) {
        meshes.push(object);
      }
    });
    const weapon = new Set();
    rig.weaponHolder.traverse((object) => weapon.add(object));
    const targets = meshes.filter((object) => !weapon.has(object));
    const ray = new THREE.Raycaster();
    const tryRay = (from, direction) => {
      ray.set(from, direction);
      ray.far = 2;
      return ray.intersectObjects(targets, false)[0] || null;
    };
    const currentDirection = shotDir.clone().normalize();
    let hit = tryRay(point.clone().addScaledVector(currentDirection, -0.4), currentDirection);
    if (!hit) {
      const center = rig.torso.localToWorld(new THREE.Vector3(0, 0.3, 0));
      if (point.y > center.y + 0.3) {
        rig.head.localToWorld(center.set(0, 0.13, 0));
      }
      hit = tryRay(point, center.sub(point).normalize());
    }
    if (!hit || !hit.face) {
      return null;
    }

    const parent = hit.object.parent;
    const nWorld = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
    const local = parent.worldToLocal(hit.point.clone());
    const nLocal = nWorld.transformDirection(inv);
    const mesh = effects.wound(parent, local, nLocal);
    mesh.userData.wound = true;
    this.wounds.push(mesh);
    if (this.wounds.length > 24) {
      const old = this.wounds.shift();
      old.parent?.remove(old);
    }
    return mesh;
  }

  clearWounds() {
    for (const weapon of this.wounds) {
      weapon.parent?.remove(weapon);
    }
    this.wounds = [];
  }

  bleedPoint(head) {
    const bodyPart = head ? this.rig.head : this.rig.torso;
    return bodyPart.localToWorld(new THREE.Vector3(0, head ? 0.05 : 0.35, -0.1));
  }

  bodyPoint() {
    const point = this.rig.torso.localToWorld(new THREE.Vector3(0, 0.25, 0));
    return new THREE.Vector3(point.x, this.root.position.y, point.z);
  }

  muzzleWorld() {
    return this.rig.muzzleWorld();
  }

  die(fromX, fromZ, head) {
    let deltaX = this.root.position.x - fromX;
    let deltaZ = this.root.position.z - fromZ;
    if (!Number.isFinite(deltaX) || Math.hypot(deltaX, deltaZ) < 0.01) {
      deltaX = Math.sin(this.rig.root.rotation.y);
      deltaZ = Math.cos(this.rig.root.rotation.y);
    }
    const yaw = this.rig.root.rotation.y;
    const localX = deltaX * Math.cos(yaw) - deltaZ * Math.sin(yaw);
    const localZ = deltaX * Math.sin(yaw) + deltaZ * Math.cos(yaw);
    this.rig.die(localX, localZ, head ? 1.6 : 1);
    const distance = Math.hypot(deltaX, deltaZ) || 1;
    const push = head ? 2.4 : 1.7;
    this.fly = { v: new THREE.Vector3((deltaX / distance) * push, 0, (deltaZ / distance) * push) };
  }

  explode(center, power, effects) {
    const point = this.root.position;
    const vector = new THREE.Vector3(point.x - center.x, 0, point.z - center.z);
    const distance = vector.length() || 0.5;
    vector.normalize();
    const factor = power * Math.max(0.35, 1 - distance / 14);
    this.fly = { v: new THREE.Vector3(vector.x * 9 * factor, 5.5 * factor, vector.z * 9 * factor) };
    if (!effects || factor < 0.45) {
      return;
    }
    const rig = this.rig;
    const parts = [];
    if (Math.random() < 0.55 * factor) {
      parts.push(rig.head);
    }
    rig.legs.forEach((leg) => Math.random() < 0.5 * factor && parts.push(leg.thigh));
    if (Math.random() < 0.6 * factor) {
      parts.push(rig.arm[0], rig.arm[1], rig.gloves[0]);
    }
    if (Math.random() < 0.6 * factor) {
      parts.push(rig.arm[2], rig.arm[3], rig.gloves[1]);
    }
    const scratch = new THREE.Vector3();
    for (const part of parts) {
      if (!part || !part.visible) {
        continue;
      }
      part.updateWorldMatrix(true, true);
      const clone = part.clone(true);
      part.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
      const away = clone.position.clone().sub(center).setY(0).normalize();
      const velocity = new THREE.Vector3(
        away.x * (6 + Math.random() * 6) * factor,
        (5 + Math.random() * 6) * factor,
        away.z * (6 + Math.random() * 6) * factor,
      );
      effects.gib(
        clone,
        velocity,
        new THREE.Vector3(
          (Math.random() - 0.5) * 18,
          (Math.random() - 0.5) * 18,
          (Math.random() - 0.5) * 18,
        ),
        this,
      );
      this.gibFx = effects;
      part.visible = false;
      this.gibbed.push(part);
    }
    if (parts.length) {
      effects.gush(
        () => this.rig.torso.getWorldPosition(scratch).add(new THREE.Vector3(0, 0.35, 0)),
        2.2,
        1.3,
      );
    }
  }

  corpseHit(direction) {
    const velocity = this.fly ? this.fly.v : new THREE.Vector3();
    velocity.x += direction.x * 0.9;
    velocity.z += direction.z * 0.9;
    this.fly = { v: velocity };
    this.rig.twitch?.();
  }

  shot(melee, heavy = false) {
    if (melee && heavy) {
      this.rig.stab();
    } else if (melee) {
      this.rig.swing();
    } else {
      this.rig.recoil();
    }
  }

  update(state, deltaTime) {
    if (state.s !== this.spawnSeen) {
      if ((this.spawnSeen ?? null) !== null && this.rig.dead) {
        this.rig.revive();
        this.clearWounds();
        this.flyOff.set(0, 0, 0);
        this.fly = null;
        for (const point of this.gibbed) {
          point.visible = true;
        }
        this.gibbed = [];
        this.gibFx?.removeGibsOf(this);
      }
      this.spawnSeen = state.s;
    }
    const alive = !!state.a && !this.rig.dead;
    this.root.position.set(state.x, state.y, state.z);
    if (this.rig.dead && this.fly) {
      const velocity = this.fly.v;
      velocity.y -= 20 * deltaTime;
      this.flyOff.addScaledVector(velocity, deltaTime);
      const worldX = state.x + this.flyOff.x;
      const worldZ = state.z + this.flyOff.z;
      const groundY = this.ground(worldX, worldZ);
      if (state.y + this.flyOff.y <= groundY) {
        this.flyOff.y = groundY - state.y;
        velocity.y = Math.abs(velocity.y) > 3 ? Math.abs(velocity.y) * 0.2 : 0;
        const decay = Math.exp(-deltaTime * 7);
        velocity.x *= decay;
        velocity.z *= decay;
        if (Math.hypot(velocity.x, velocity.z) < 0.05 && velocity.y === 0) {
          this.fly = null;
        }
      }
    }
    if (this.rig.dead) {
      this.root.position.add(this.flyOff);
    }
    const hitboxes = playerHitboxes([0, 0, 0], !!state.c);
    for (const hitbox of hitboxes) {
      const mesh = this.parts[hitbox.part];
      mesh.scale.set(
        hitbox.max[0] - hitbox.min[0],
        hitbox.max[1] - hitbox.min[1],
        hitbox.max[2] - hitbox.min[2],
      );
      mesh.position.set(
        (hitbox.max[0] + hitbox.min[0]) / 2,
        (hitbox.max[1] + hitbox.min[1]) / 2,
        (hitbox.max[2] + hitbox.min[2]) / 2,
      );
    }

    let stepped = false;
    if (this.px !== null) {
      const deltaX = state.x - this.px;
      const deltaZ = state.z - this.pz;
      const deltaY = state.y - this.py;
      const distance = Math.hypot(deltaX, deltaZ);
      const idt = 1 / Math.max(deltaTime, 1e-3);
      if (distance < 1.5) {
        const factor = Math.min(1, deltaTime * 12);
        this.speed += (distance * idt - this.speed) * factor;
        this.vy += (deltaY * idt - this.vy) * factor;
      }
      if (distance < 1.5 && alive) {
        this.stepT += distance;
        if (
          this.stepT > 2.3 &&
          distance * idt > MOVE.walk + 0.6 &&
          !state.c &&
          Math.abs(deltaY) < 0.02
        ) {
          this.stepT = 0;
          stepped = true;
        }
      }
    }
    this.px = state.x;
    this.py = state.y;
    this.pz = state.z;

    if (!state.a && !this.rig.dead) {
      this.die(NaN, NaN, false);
    }
    const weapon = WEAPONS[state.w];
    const defusing = alive && !!state.pl && state.tm === 1;
    if (defusing) {
      this.rig.setWeapon('defkit');
    } else if (weapon) {
      this.rig.setWeapon(weapon.id);
    }
    this.busyTick = false;
    if (alive && state.pl) {
      this.busyT = (this.busyT || 0) + deltaTime;
      if (this.busyT > 0.45) {
        this.busyT = 0;
        this.busyTick = defusing ? 'defuse' : 'plant';
      }
    } else {
      this.busyT = 0.3;
    }
    this.rig.setSkin(SKINS[this.sk || 0]?.id || 'default');
    this.rig.setWeaponVisible(alive);
    if (alive) {
      this.rig.root.rotation.y = state.yaw;
    }
    this.rig.update(deltaTime, {
      pitch: alive ? state.pitch : 0,
      crouch: !!state.c,
      speed: alive ? this.speed : 0,
      air: alive && Math.abs(this.vy) > 1.2,
      aiming: alive && !!state.ad,
      reloading: alive && !!state.rl,
      typing: alive && !!state.pl,
    });
    this.reloadStarted = alive && !!state.rl && !this.wasReloading;
    this.wasReloading = alive && !!state.rl;

    if (this.nameSprite) {
      this.nameSprite.position.set(0, (state.c ? 1.3 : 1.8) + 0.4, 0);
      if (!alive) {
        this.nameSprite.visible = false;
      }
    }
    return stepped;
  }

  dispose() {
    this.gibFx?.removeGibsOf(this);
    this.scene.remove(this.root);
    this.rig.dispose();
    if (this.nameSprite) {
      this.nameSprite.material.map.dispose();
      this.nameSprite.material.dispose();
    }
  }
}
