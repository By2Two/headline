import * as THREE from 'three';
import { WEAPONS } from '../../shared/weapons.js';
import { BUILDERS, SKIN, SLEEVE, buildDefuseKit } from './guns.js';
import { outfitOf, skinOf } from '../../shared/look.js';
import { applySkin } from './skins.js';
import { knifeAnim } from './knifeAnims.js';
import {
  buildKatanaFx,
  katanaRestQuat,
  katanaArmDir,
  katanaArm2Dir,
  knifeRestQuat,
  knifeArmDir,
  KNIFE_REST,
  KATANA_REST,
} from './katanaFx.js';

const SLIDE_KICK_M = 0.022;
const SLIDE_RETURN_RATE = 22;

export class Viewmodel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.01, 5);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.3));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(0.5, 1, 0.8);
    this.scene.add(light);

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.guns = WEAPONS.map((weapon) => (BUILDERS[weapon.id] || BUILDERS.rifle)());
    this.guns.forEach((gun, gunIndex) => {
      if (!gun.melee) {
        return;
      }
      const rotation = (positionX, positionY, positionZ, angle) =>
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(positionX, positionY, positionZ),
          angle,
        );
      if (WEAPONS[gunIndex].id === 'axe') {
        gun.group.quaternion
          .copy(rotation(0, 1, 0, Math.PI))
          .multiply(rotation(1, 0, 0, Math.PI / 2 - 0.6));
        gun.base.set(0.18, -0.27, -0.55);
      } else {
        gun.group.quaternion.copy(knifeRestQuat());
        gun.base.copy(KNIFE_REST);
      }
      gun.group.scale.setScalar(0.85);
    });
    const kat = WEAPONS.findIndex((weapon) => weapon.id === 'katana');
    if (kat >= 0) {
      const katanaGun = this.guns[kat];
      katanaGun.group.quaternion.copy(katanaRestQuat());
      katanaGun.base.copy(KATANA_REST);
      this.katanaArm = katanaGun.arm;
      this.katanaArm2 = katanaGun.arm2;
      this.katanaLeft = katanaGun.leftHand;
    }
    this.katanaFx = buildKatanaFx();
    this.scene.add(this.katanaFx.group);
    this.kitG = buildDefuseKit();
    this.kitG.group.visible = false;
    this.scene.add(this.kitG.group);
    this.kit = false;
    this.guns.forEach((gun) => {
      if (gun.bomb) {
        gun.group.scale.setScalar(0.8);
      }
      gun.group.visible = false;
      this.root.add(gun.group);
    });

    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.18),
      new THREE.MeshBasicMaterial({
        color: 0xffd27a,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    this.flash.visible = false;
    this.root.add(this.flash);

    this.cur = 0;
    this.plant = 0;
    this.tapT = 0;
    this.tapKey = 0;
    this.flashT = 0;
    this.swingT = 0;
    this.swingDir = 1;
    this.bobT = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.setWeapon(0);
  }

  setWeapon(index) {
    this.inspecting = false;
    this.cur = index;
    this.curId = WEAPONS[index]?.id;
    this.guns.forEach((gun, blend) => {
      gun.group.visible = blend === index;
    });
    this.flash.position.copy(this.guns[index].muzzle);
  }

  setLook(look) {
    SKIN.color.setHex(skinOf(look).color);
    SLEEVE.color.setHex(outfitOf(look).suit);
  }

  setSkins(map) {
    WEAPONS.forEach((weapon, index) =>
      applySkin(this.guns[index].group, map[weapon.id] || 'default'),
    );
  }

  fire(heavy = false) {
    this.inspecting = false;
    if (this.guns[this.cur].melee && heavy) {
      this.stabT = 1;
      return;
    }
    if (this.guns[this.cur].melee) {
      this.swingT = 1;
      this.swingDir = -this.swingDir;
      return;
    }
    this.flashT = 0.045;
    const gunData = this.guns[this.cur];
    if (gunData.slides) {
      gunData.slides[gunData.muzzle2 && this.altSide ? 1 : 0].position.z = SLIDE_KICK_M;
    }
    if (gunData.muzzle2) {
      this.flash.position.copy(this.altSide ? gunData.muzzle2 : gunData.muzzle);
      gunData.pistols[this.altSide ? 1 : 0].position.z = 0.05;
      this.altSide = !this.altSide;
    }
    if (this.guns[this.cur].pump) {
      this.pumpT = 0;
    }
    if (this.guns[this.cur].cylinder) {
      this.cylSpin = (this.cylSpin || 0) + Math.PI / 4;
    }
    this.flash.rotation.z = Math.random() * 6.28;
    this.flash.scale.setScalar(
      (0.8 + Math.random() * 0.6) * (this.guns[this.cur].silenced ? 0.3 : 1),
    );
  }

  inspect() {
    this.inspectT = 0;
    this.inspecting = true;
  }

  stopInspect() {
    this.inspecting = false;
  }

  tap() {
    this.tapT = 1;
    this.tapKey = Math.floor(Math.random() * 9);
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(deltaTime, pose) {
    this.root.visible = !this.kit;
    this.kitG.group.visible = this.kit;
    if (this.kit) {
      this.kitT = (this.kitT || 0) + deltaTime;
      const blend = this.kitG.group;
      blend.position.set(
        0.04 + Math.sin(this.kitT * 9) * 0.008,
        -0.17 + Math.abs(Math.sin(this.kitT * 6)) * 0.01,
        -0.33,
      );
      blend.rotation.set(0.5 + Math.sin(this.kitT * 7) * 0.08, 0.15, Math.sin(this.kitT * 5) * 0.1);
    }
    const gun = this.guns[this.cur];
    this.bobT += deltaTime * Math.min(pose.speed, 6.5) * 1.6;
    const bobAmt = pose.grounded ? Math.min(pose.speed / 6.2, 1) : 0;
    const bobX = Math.sin(this.bobT) * 0.008 * bobAmt;
    const bobY = Math.abs(Math.cos(this.bobT)) * 0.01 * bobAmt;

    if (this.mouseSway) {
      const blend = Math.min(1, deltaTime * 10);
      this.swayX += (Math.max(-0.03, Math.min(0.03, -pose.lookDX * 0.0006)) - this.swayX) * blend;
      this.swayY += (Math.max(-0.03, Math.min(0.03, pose.lookDY * 0.0006)) - this.swayY) * blend;
    } else {
      this.swayX = 0;
      this.swayY = 0;
    }

    this.root.position.set(
      gun.base.x + bobX + this.swayX,
      gun.base.y - bobY + this.swayY,
      gun.base.z + pose.kick * 0.06,
    );
    this.root.rotation.set(pose.kick * 0.08, 0, 0);

    if (pose.reload >= 0) {
      const reloadWave = Math.sin(pose.reload * Math.PI);
      this.root.position.y -= reloadWave * 0.1;
      this.root.rotation.x -= reloadWave * 0.5;
      this.root.rotation.z = reloadWave * 0.3;
    }
    this.katanaFx.group.visible = false;
    const knifeAnimation = knifeAnim(this.curId);
    if (gun.spin) {
      gun.spin.rotation.set(0, 0, 0);
      gun.spin.position.set(0, -0.06, 0);
    }
    if (this.swingT > 0) {
      this.swingT = Math.max(0, this.swingT - deltaTime * knifeAnimation.swingRate);
      knifeAnimation.swing(this.root, 1 - this.swingT, this.swingDir, gun.spin);
    }
    if (this.stabT > 0) {
      this.stabT = Math.max(0, this.stabT - deltaTime * knifeAnimation.stabRate);
      knifeAnimation.stab(this.root, 1 - this.stabT, gun.spin);
    }
    if (this.inspecting && pose.reload < 0) {
      const currentGun = this.guns[this.cur];
      const DUR = currentGun.melee ? knifeAnimation.inspectDur : 2.2;
      this.inspectT += deltaTime;
      const inspectProgress = Math.min(1, this.inspectT / DUR);
      if (inspectProgress >= 1) {
        this.inspecting = false;
      }
      const ease = (positionX) => positionX * positionX * (3 - 2 * positionX);
      const seg = (start, end) =>
        ease(Math.min(1, Math.max(0, (inspectProgress - start) / (end - start))));
      const inOut = seg(0, 0.18) * (1 - seg(0.82, 1));
      if (currentGun.melee) {
        knifeAnimation.inspect(this.root, inspectProgress, this, gun.spin);
      } else {
        this.root.position.x -= 0.06 * inOut;
        this.root.position.y += 0.03 * inOut;
        this.root.rotation.y -= 0.7 * seg(0.1, 0.35) - 1.1 * seg(0.45, 0.7) + 0.4 * seg(0.82, 1);
        this.root.rotation.z += 0.55 * seg(0.1, 0.35) - 0.9 * seg(0.45, 0.7) + 0.35 * seg(0.82, 1);
        this.root.rotation.x += 0.15 * inOut;
      }
    }
    const drawRemaining = 1 - pose.draw;
    if (drawRemaining > 0) {
      this.root.position.y -= drawRemaining * 0.3;
      this.root.rotation.x -= drawRemaining * 0.7;
    }

    const pistolGun = this.guns[this.cur];
    if (pistolGun.nade) {
      const nadeAnimation = this.nadeAnim || { pin: 0, cock: 0, thr: 0, relAt: 0.3, gone: false };
      const pull = nadeAnimation.pin;
      const away = Math.max(0, (pull - 0.45) / 0.55);
      if (pistolGun.left) {
        pistolGun.left.position.set(
          -0.03 * pull - 0.22 * away,
          0.02 * pull - 0.22 * away,
          0.02 * pull - 0.04 * away,
        );
      }
      pistolGun.ring.position
        .copy(pistolGun.ringBase)
        .add(
          new THREE.Vector3(
            -0.03 * pull - 0.22 * away,
            0.03 * pull - 0.22 * away,
            0.02 * pull - 0.04 * away,
          ),
        );
      pistolGun.ring.visible = !(away >= 1);
      const ease = (positionX) => positionX * positionX * (3 - 2 * positionX);
      const cockEase = ease(nadeAnimation.cock);
      const blend =
        nadeAnimation.thr <= nadeAnimation.relAt
          ? ease(nadeAnimation.thr / nadeAnimation.relAt)
          : 1;
      const after =
        nadeAnimation.thr > nadeAnimation.relAt
          ? (nadeAnimation.thr - nadeAnimation.relAt) / (1 - nadeAnimation.relAt)
          : 0;
      this.root.position.x += 0.05 * cockEase - 0.09 * blend;
      this.root.position.y += 0.07 * cockEase - 0.12 * blend - 0.25 * after;
      this.root.position.z += 0.04 * cockEase - 0.2 * blend;
      this.root.rotation.x += 0.45 * cockEase - 0.95 * blend;
      this.root.rotation.z -= 0.2 * cockEase - 0.2 * blend;
      pistolGun.body.visible = !nadeAnimation.gone;
    }
    if (pistolGun.bomb) {
      const plantProgress = this.plant > 0 ? Math.min(1, this.plant * 4) : 0;
      this.root.position.y -= plantProgress * 0.06;
      this.root.position.z -= plantProgress * 0.04;
      this.root.rotation.x += plantProgress * 0.55;
      this.tapT = Math.max(0, this.tapT - deltaTime * 7);
      if (pistolGun.finger) {
        pistolGun.finger.position.set(
          (this.tapKey % 3) * 0.02 - 0.02,
          -this.tapT * 0.012,
          -Math.floor(this.tapKey / 3) * 0.015,
        );
      }
      pistolGun.keys.forEach((blend, index) => {
        blend.position.y = 0.049 - (index === this.tapKey ? this.tapT * 0.003 : 0);
      });
      pistolGun.led.material.color.setHex(this.tapT > 0.5 ? 0xff2a1a : 0x400000);
    }
    if (pistolGun.pistols) {
      for (const pose of pistolGun.pistols) {
        pose.position.z *= Math.exp(-deltaTime * 14);
      }
    }
    if (pistolGun.slides) {
      for (const slide of pistolGun.slides) {
        slide.position.z *= Math.exp(-deltaTime * SLIDE_RETURN_RATE);
      }
    }
    if (pistolGun.hammer) {
      const primeProgress = this.prime || 0;
      pistolGun.hammer.rotation.x = primeProgress * 0.9;
      pistolGun.cylinder.rotation.z = (this.cylSpin || 0) + primeProgress * (Math.PI / 4);
    }
    if (pistolGun.pump && (this.pumpT ?? null) !== null) {
      this.pumpT += deltaTime;
      const blend =
        this.pumpT < 0.18
          ? 0
          : this.pumpT < 0.4
            ? (this.pumpT - 0.18) / 0.22
            : Math.max(0, 1 - (this.pumpT - 0.4) / 0.2);
      pistolGun.pump.position.z = blend * 0.11;
      this.root.rotation.z += blend * 0.08;
      if (this.pumpT > 0.6) {
        this.pumpT = null;
      }
    }

    if (gun.arm && this.curId !== 'katana') {
      this.root.updateMatrixWorld(true);
      this.placeArm(gun, gun.arm, knifeArmDir(), 0);
    }
    if (this.katanaArm && this.curId === 'katana') {
      this.root.updateMatrixWorld(true);
      this.placeArm(gun, this.katanaArm, katanaArmDir(), -0.03);
      this.placeArm(gun, this.katanaArm2, katanaArm2Dir(), 0.09);
      const away =
        this.inspecting &&
        this.inspectT / knifeAnimation.inspectDur > 0.05 &&
        this.inspectT / knifeAnimation.inspectDur < 0.88;
      this.katanaLeft.visible = this.katanaArm2.visible = !away;
    }

    if (this.flashT > 0) {
      this.flashT -= deltaTime;
      this.flash.visible = this.flashT > 0;
    }
  }

  placeArm(gun, arm, direction, positionZ) {
    const inv = gun.group.getWorldQuaternion(new THREE.Quaternion()).invert();
    arm.quaternion
      .copy(inv)
      .multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction));
    arm.position
      .set(0, -0.06, positionZ)
      .addScaledVector(direction.clone().applyQuaternion(inv), 0.22);
  }

  muzzleView() {
    this.root.updateMatrixWorld(true);
    const gun = this.guns[this.cur];
    const muzzle = gun.muzzle2 && this.altSide ? gun.muzzle2 : gun.muzzle;
    return gun.group.localToWorld(muzzle.clone());
  }

  render(renderer) {
    renderer.render(this.scene, this.camera);
  }
}
