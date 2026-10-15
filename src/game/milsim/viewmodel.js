import * as THREE from 'three';
import { Viewmodel } from '../viewmodel.js';
import { WEAPONS } from '../../../shared/weapons.js';
import { MW } from '../../../shared/milsim/weapons.js';
import { builtInOptic } from '../../../shared/milsim/config.js';
import { attachOptic, SCOPE_VIEW } from './gear.js';
import { MIL_BUILDERS, attachGear, buildBinos } from './items.js';

const SCOPE_EYE_M = 0.11;

export class MilsimViewmodel extends Viewmodel {
  constructor() {
    super();
    this.mouseSway = true;
    for (let index = WEAPONS.length; index < MW.length; index++) {
      const builder = MIL_BUILDERS[MW[index].id];
      const gun = builder
        ? builder(true)
        : {
            group: new THREE.Group(),
            muzzle: new THREE.Vector3(0, 0, -0.3),
            base: new THREE.Vector3(0.2, -0.2, -0.34),
          };
      gun.group.visible = false;
      this.guns[index] = gun;
      this.root.add(gun.group);
    }
    this.pivot = new THREE.Group();
    this.scene.remove(this.root);
    this.pivot.add(this.root);
    this.scene.add(this.pivot);
    this.wrench = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({
      color: 0x8d9296,
      roughness: 0.35,
      metalness: 0.8,
    });
    const grip = new THREE.MeshStandardMaterial({ color: 0x9a2a1e, roughness: 0.8 });
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.022, 0.32), steel);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.03, 0.13), grip);
    handle.position.z = 0.12;
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.022, 0.05), steel);
    jaw.position.z = -0.17;
    const jaw2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.022, 0.05), steel);
    jaw2.position.set(0.03, 0, -0.21);
    this.wrench.add(shaft, handle, jaw, jaw2);
    this.wrench.visible = false;
    this.scene.add(this.wrench);
    this.binosG = buildBinos(true);
    this.binosG.visible = false;
    this.scene.add(this.binosG);
    this.ads = 0;
    this.lower = 0;
    this.sights = MW.map(() => null);
    this.opticOf = MW.map(() => null);
    this.attOf = MW.map(() => '');
    this.baseMuzzle = this.guns.map((gun) => gun.muzzle.clone());
    this.baseFov = 58;
  }

  setWeapon(index) {
    super.setWeapon(index);
  }

  setOptic(index, optic) {
    const weapon = MW[index];
    const gun = this.guns[index];
    if (!weapon || !gun || weapon.melee || weapon.grenade || weapon.bomb || weapon.item) {
      return;
    }
    const built = builtInOptic(weapon, optic);
    const want = built || optic || 'iron';
    if (this.opticOf[index] === want) {
      return;
    }
    this.opticOf[index] = want;
    this.sights[index] = attachOptic(gun.group, want, {
      muzzleZ: this.baseMuzzle[index].z,
      pistol: weapon.slot === 'secondary',
      builtIn: !!built || weapon.class === 'launcher',
    });
  }

  setAttach(index, attack) {
    const weapon = MW[index];
    const gun = this.guns[index];
    if (!weapon || !gun || weapon.melee || weapon.grenade || weapon.item) {
      return;
    }
    const key = JSON.stringify(attack || {});
    if (this.attOf[index] === key) {
      return;
    }
    this.attOf[index] = key;
    gun.muzzle = attachGear(gun.group, attack, this.baseMuzzle[index], {
      pistol: weapon.slot === 'secondary',
    });
    if (index === this.cur) {
      this.flash.position.copy(gun.muzzle);
    }
  }

  sightInfo() {
    return this.sights[this.cur] || { sightY: 0.06, sightZ: -0.12 };
  }

  update(deltaTime, pose) {
    super.update(deltaTime, pose);
    const weapon = MW[this.cur];
    this.lower += ((pose.lower || 0) - this.lower) * Math.min(1, deltaTime * 7);
    const aimEase = pose.ads * pose.ads * (3 - 2 * pose.ads);
    if (weapon && !weapon.melee && !weapon.grenade && !weapon.item && aimEase > 0.001) {
      const sight = this.sightInfo();
      const pistol = weapon.slot === 'secondary';
      let positionZ = pistol ? -0.42 : weapon.class === 'launcher' ? -0.3 : -0.37;
      if (sight.lens) {
        positionZ = -(sight.lens.z + SCOPE_EYE_M);
      }
      const targetY = -sight.sightY;
      const targetZ = positionZ + (pose.kick || 0) * 0.035;
      const root = this.root;
      root.position.set(
        root.position.x + (0 - root.position.x) * aimEase,
        root.position.y + (targetY - root.position.y) * aimEase,
        root.position.z + (targetZ - root.position.z) * aimEase,
      );
      root.rotation.x += ((pose.kick || 0) * 0.015 - root.rotation.x) * aimEase;
      root.rotation.y *= 1 - aimEase;
      root.rotation.z *= 1 - aimEase;
    }
    const lens = this.sights[this.cur]?.lens;
    if (lens) {
      const on = !!pose.scope;
      lens.mesh.material = on ? SCOPE_VIEW : lens.glass;
      lens.reticle.visible = on;
    }
    if (this.lower > 0.001) {
      const lower = this.lower;
      if (weapon?.slot === 'secondary') {
        this.root.position.y -= 0.09 * lower;
        this.root.position.x -= 0.05 * lower;
        this.root.position.z += 0.08 * lower;
        this.root.rotation.x -= 0.75 * lower;
        this.root.rotation.y += 0.35 * lower;
      } else {
        this.root.position.y -= 0.07 * lower;
        this.root.position.x += 0.02 * lower;
        this.root.position.z += 0.03 * lower;
        this.root.rotation.x -= 0.55 * lower;
        this.root.rotation.y += 0.75 * lower;
        this.root.rotation.z += 0.3 * lower;
      }
    }
    this.obs =
      (this.obs || 0) + ((pose.obstruct || 0) - (this.obs || 0)) * Math.min(1, deltaTime * 10);
    if (this.obs > 0.01) {
      const obstruction = this.obs;
      this.root.position.z += 0.14 * obstruction;
      this.root.position.y -= 0.02 * obstruction;
      this.root.rotation.x += 0.75 * obstruction;
    }
    if (pose.use > 0 && weapon?.item) {
      const bob = Math.sin(pose.use * Math.PI * 10);
      this.root.position.y += 0.02 * bob;
      this.root.rotation.z = 0.25 * bob;
      const roll = this.guns[this.cur].roll;
      if (roll) {
        roll.rotation.x += deltaTime * 9;
      }
    }
    const binocularsAmount = pose.binos || 0;
    if (binocularsAmount > 0) {
      const down = Math.min(1, binocularsAmount * 2);
      this.root.position.y -= 0.45 * down;
      this.root.rotation.x -= 1.1 * down;
      this.root.position.x += 0.15 * down;
      const raise = Math.max(0, (binocularsAmount - 0.45) / 0.55);
      const raiseEase = raise * raise * (3 - 2 * raise);
      this.binosG.visible = raise > 0;
      this.binosG.position.set(0, -0.32 + 0.3 * raiseEase, -0.2 + 0.06 * raiseEase);
      this.binosG.rotation.set(-0.6 * (1 - raiseEase), 0, 0);
    } else {
      this.binosG.visible = false;
    }
    const repair = pose.repair || 0;
    this.repairT =
      (this.repairT || 0) + ((repair ? 1 : 0) - (this.repairT || 0)) * Math.min(1, deltaTime * 8);
    if (this.repairT > 0.02) {
      const repairProgress = this.repairT;
      this.root.position.y -= 0.4 * repairProgress;
      this.wrench.visible = true;
      const phase = performance.now() / 140;
      this.wrench.position.set(0.16, -0.32 + 0.12 * repairProgress + Math.sin(phase) * 0.02, -0.42);
      this.wrench.rotation.set(-0.35 + Math.sin(phase) * 0.25, 0.4, 0.2 + Math.sin(phase) * 0.6);
    } else {
      this.wrench.visible = false;
    }
    if (pose.quiet) {
      this.flash.visible = false;
    }
    this.pivot.rotation.set(pose.aimPitch || 0, pose.aimYaw || 0, 0, 'YXZ');
    this.camera.fov = this.baseFov - aimEase * 10;
    this.camera.updateProjectionMatrix();
    this.root.visible =
      this.root.visible && !pose.hideGun && binocularsAmount < 0.5 && this.repairT < 0.6;
  }
}
