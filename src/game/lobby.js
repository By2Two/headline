import * as THREE from 'three';
import { DEFAULT_LOOK } from '../../shared/look.js';
import { CharacterRig } from './character.js';

function gradientTexture(draw, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class Lobby {
  constructor(weaponId, look = DEFAULT_LOOK) {
    const scene = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);

    scene.background = gradientTexture(
      (context, width, height) => {
        const lin = context.createLinearGradient(0, 0, 0, height);
        lin.addColorStop(0, '#1c2226');
        lin.addColorStop(0.62, '#121619');
        lin.addColorStop(1, '#090b0c');
        context.fillStyle = lin;
        context.fillRect(0, 0, width, height);
        const gradient = context.createRadialGradient(
          width / 2,
          height * 0.52,
          0,
          width / 2,
          height * 0.52,
          width * 0.42,
        );
        gradient.addColorStop(0, 'rgba(255,190,90,0.22)');
        gradient.addColorStop(1, 'rgba(255,190,90,0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
      },
      1024,
      512,
    );
    scene.fog = new THREE.Fog(0x0d1012, 7, 16);

    const shadowFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.ShadowMaterial({ opacity: 0.5 }),
    );
    shadowFloor.rotation.x = -Math.PI / 2;
    shadowFloor.receiveShadow = true;
    scene.add(shadowFloor);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 64),
      new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        map: gradientTexture(
          (context, width, height) => {
            const gradient = context.createRadialGradient(
              width / 2,
              height / 2,
              0,
              width / 2,
              height / 2,
              width / 2,
            );
            gradient.addColorStop(0, 'rgba(255,214,140,0.28)');
            gradient.addColorStop(0.55, 'rgba(255,214,140,0.08)');
            gradient.addColorStop(1, 'rgba(255,214,140,0)');
            context.fillStyle = gradient;
            context.fillRect(0, 0, width, height);
          },
          256,
          256,
        ),
      }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.002;
    scene.add(disc);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 1.02, 96),
      new THREE.MeshBasicMaterial({
        color: 0xffd24a,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.004;
    scene.add(ring);

    scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x1a140f, 0.55));
    const key = new THREE.DirectionalLight(0xffe3bd, 2.6);
    key.position.set(-2.2, 4.5, 3.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, {
      left: -2,
      right: 2,
      top: 3,
      bottom: -1,
      near: 0.5,
      far: 12,
    });
    key.shadow.bias = -0.0005;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x5aa6ff, 3.2);
    rim.position.set(2.5, 2.6, -3);
    scene.add(rim);
    const rim2 = new THREE.DirectionalLight(0xffa64a, 1.4);
    rim2.position.set(-3, 1.5, -2.5);
    scene.add(rim2);

    const count = 160;
    const position = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) {
      position[index * 3] = (Math.random() - 0.5) * 6;
      position[index * 3 + 1] = Math.random() * 3.2;
      position[index * 3 + 2] = (Math.random() - 0.5) * 4 - 0.5;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    this.dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        color: 0xffdcaa,
        size: 0.018,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    scene.add(this.dust);

    this.rig = new CharacterRig(look, { lowReady: true });
    scene.add(this.rig.root);

    this.t = 0;
    this.mx = 0;
    this.my = 0;
    this.turn = 0;
    this.headYaw = 0;
    this.dragYaw = 0;
    this.dragging = false;
    this.onPointer = (event) => {
      this.mx = (event.clientX / window.innerWidth) * 2 - 1;
      this.my = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', this.onPointer);
    this.setWeapon(weaponId);
    this.setAspect(1.6);
  }

  drag(dxPixels) {
    this.dragging = true;
    this.dragYaw += dxPixels * 0.012;
  }

  release() {
    this.dragging = false;
  }

  setLook(look) {
    this.rig.setLook(look);
  }

  setWeapon(id) {
    this.weaponId = id;
    this.refreshWeapon();
  }

  setSkins(map) {
    this.skins = map;
    this.refreshWeapon();
  }

  preview(id) {
    this.previewId = id;
    this.refreshWeapon();
  }

  refreshWeapon() {
    const id = this.previewId || this.weaponId;
    if (!id) {
      return;
    }
    this.rig.setWeapon(id);
    this.rig.setSkin((this.skins || {})[id] || 'default');
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    const distance = aspect < 1 ? 9 : 5.7;
    this.camera.position.set(0, 1.3, distance);
    this.camera.lookAt(0, 0.88, 0);
    this.camera.updateProjectionMatrix();
  }

  update(deltaTime) {
    this.t += deltaTime;
    const time = this.t;
    this.turn += (this.mx * 0.35 - this.turn) * Math.min(1, deltaTime * 2.5);
    if (!this.dragging) {
      this.dragYaw *= Math.exp(-deltaTime * 5);
    }
    this.rig.root.rotation.y = Math.PI - 0.55 + this.turn + this.dragYaw;
    this.headYaw +=
      (this.mx * 0.3 + Math.sin(time * 0.4) * 0.06 - this.headYaw) * Math.min(1, deltaTime * 3);
    this.rig.update(deltaTime, { pitch: -this.my * 0.2, headYaw: this.headYaw });

    const texture = this.dust.geometry.attributes.position;
    for (let index = 0; index < texture.count; index++) {
      let positionY = texture.getY(index) + deltaTime * 0.06;
      if (positionY > 3.2) {
        positionY = 0;
      }
      texture.setY(index, positionY);
      texture.setX(index, texture.getX(index) + Math.sin(time * 0.5 + index) * deltaTime * 0.02);
    }
    texture.needsUpdate = true;
  }

  dispose() {
    window.removeEventListener('pointermove', this.onPointer);
    this.rig.dispose();
  }
}
