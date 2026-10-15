import * as THREE from 'three';

const MAX_DECALS = 80;

function bloodTexture(seed, wound) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  let randomState = seed;
  const random = () => ((randomState = (randomState * 16807) % 2147483647) - 1) / 2147483646;
  const blob = (positionX, positionY, radius, color) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(positionX, positionY, radius, 0, Math.PI * 2);
    context.fill();
  };
  for (let index = 0; index < 26; index++) {
    const angle = random() * Math.PI * 2;
    const distance = random() * size * 0.42;
    blob(
      size / 2 + Math.cos(angle) * distance,
      size / 2 + Math.sin(angle) * distance,
      2 + random() * 7 * (1 - distance / (size * 0.5)),
      'rgba(120,8,10,0.85)',
    );
  }
  blob(size / 2, size / 2, size * 0.2, 'rgba(110,6,8,0.9)');
  if (wound) {
    blob(size / 2, size / 2, size * 0.09, 'rgba(25,2,3,1)');
    blob(size / 2, size / 2, size * 0.05, 'rgba(8,0,0,1)');
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.sparks = [];
    this.decals = [];
    this.ground = () => 0;
    this.tracerGeo = new THREE.BoxGeometry(0.012, 0.012, 1);
    this.tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffe3a0,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.sparkGeo = new THREE.BoxGeometry(0.03, 0.03, 0.03);
    this.sparkMats = {
      w: new THREE.MeshBasicMaterial({ color: 0xffc46b }),
      p: new THREE.MeshBasicMaterial({ color: 0xc41e1e }),
    };
    this.flashes = [];
    this.smokes = [];
    this.flashMat = new THREE.SpriteMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.drops = [];
    this.gushes = [];
    this.pools = [];
    this.planeGeo = new THREE.PlaneGeometry(1, 1);
    this.dropGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
    this.dropMat = new THREE.MeshBasicMaterial({ color: 0x8a0a0e });
    const bloodMaterial = (seed, wound) =>
      new THREE.MeshBasicMaterial({
        map: bloodTexture(seed, wound),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      });
    this.splatMats = [
      bloodMaterial(11, false),
      bloodMaterial(97, false),
      bloodMaterial(555, false),
    ];
    this.woundMats = [bloodMaterial(23, true), bloodMaterial(321, true)];
    this.decalGeo = new THREE.CircleGeometry(0.06, 8);
    this.decalMat = new THREE.MeshBasicMaterial({
      color: 0x15130f,
      transparent: true,
      opacity: 0.75,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      depthWrite: false,
    });
  }

  tracer(from, target) {
    const length = from.distanceTo(target);
    if (length < 0.5) {
      return;
    }
    const mesh = new THREE.Mesh(this.tracerGeo, this.tracerMat);
    mesh.position.copy(from);
    mesh.lookAt(target);
    this.scene.add(mesh);
    this.tracers.push({
      mesh,
      from: from.clone(),
      dir: target.clone().sub(from).normalize(),
      len: length,
      dist: 0,
      seg: Math.min(length, 3.5),
    });
  }

  smoke(origin, target) {
    const from = origin
      .clone()
      .lerp(target, Math.min(1.5 / Math.max(origin.distanceTo(target), 0.01), 0.5));
    const length = from.distanceTo(target);
    if (length < 0.5) {
      return;
    }
    const material = new THREE.MeshBasicMaterial({
      color: 0xe8ecef,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.tracerGeo, material);
    mesh.position.copy(from).lerp(target, 0.5);
    mesh.lookAt(target);
    mesh.scale.set(2, 2, length / 1);
    this.scene.add(mesh);
    this.smokes.push({ mesh, life: 1.1, max: 1.1 });
  }

  debris(center, size) {
    const material = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.9 });
    for (let index = 0; index < 26; index++) {
      const mesh = new THREE.Mesh(this.sparkGeo, material);
      mesh.position.set(
        center.x + (Math.random() - 0.5) * size.x,
        center.y + (Math.random() - 0.5) * size.y,
        center.z + (Math.random() - 0.5) * size.z,
      );
      mesh.scale.set(1 + Math.random() * 3, 1 + Math.random() * 2, 1 + Math.random() * 4);
      this.scene.add(mesh);
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        1 + Math.random() * 4,
        (Math.random() - 0.5) * 6,
      );
      this.drops.push({ mesh: mesh, v: velocity, life: 1.4 });
    }
  }

  explosion(particle, size = 1) {
    const fire = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshBasicMaterial({
        color: 0xffa53a,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    fire.position.copy(particle);
    this.scene.add(fire);
    const smoke = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0x3a3632,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    );
    smoke.position.copy(particle);
    this.scene.add(smoke);
    (this.booms ||= []).push({ fire, smoke, t: 0, size });
    this.flash(particle, 9 * size);
    const material = new THREE.MeshBasicMaterial({ color: 0xffc06a });
    for (let index = 0; index < 70 * size; index++) {
      const mesh = new THREE.Mesh(this.sparkGeo, material);
      mesh.position.copy(particle);
      mesh.scale.setScalar(1.5 + Math.random() * 2);
      this.scene.add(mesh);
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 30 * size,
        4 + Math.random() * 16 * size,
        (Math.random() - 0.5) * 30 * size,
      );
      this.drops.push({ mesh: mesh, v: velocity, life: 0.8 + Math.random() * 0.8 });
    }
  }

  smokeCloud(particle, durMs) {
    if (!this.smokeTex) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      const context = canvas.getContext('2d');
      const gradient = context.createRadialGradient(64, 64, 6, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(235,235,235,1)');
      gradient.addColorStop(0.55, 'rgba(215,215,215,0.85)');
      gradient.addColorStop(1, 'rgba(200,200,200,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
      this.smokeTex = new THREE.CanvasTexture(canvas);
    }
    const puffs = [];
    for (let index = 0; index < 34; index++) {
      const material = new THREE.SpriteMaterial({
        map: this.smokeTex,
        color: new THREE.Color().setHSL(0, 0, 0.62 + Math.random() * 0.18),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      const randomState = Math.random() * Math.PI * 2;
      const random = Math.sqrt(Math.random()) * 3.2;
      const off = new THREE.Vector3(
        Math.cos(randomState) * random,
        0.6 + Math.random() * 2.4,
        Math.sin(randomState) * random,
      );
      sprite.position.copy(particle).add(off);
      sprite.material.rotation = Math.random() * 6.28;
      this.scene.add(sprite);
      puffs.push({
        sp: sprite,
        off,
        size: 3 + Math.random() * 2.2,
        drift: (Math.random() - 0.5) * 0.15,
      });
    }
    (this.clouds ||= []).push({ p: particle.clone(), puffs, t: 0, dur: durMs / 1000 });
  }

  clearSmoke() {
    for (const cloud of this.clouds || []) {
      for (const puff of cloud.puffs) {
        this.scene.remove(puff.sp);
      }
    }
    this.clouds = [];
  }

  flash(point, size = 0.35) {
    const sprite = new THREE.Sprite(this.flashMat);
    sprite.position.copy(point);
    sprite.scale.setScalar(size * (0.8 + Math.random() * 0.5));
    this.scene.add(sprite);
    this.flashes.push({ sp: sprite, life: 0.05 });
  }

  gib(object, velocity, spin, owner = null) {
    this.scene.add(object);
    (this.gibs ||= []).push({
      obj: object,
      v: velocity,
      spin,
      owner,
      bleed: 1.6,
      acc: 0,
      landed: false,
      life: 600,
    });
  }

  removeGibsOf(owner) {
    this.gibs = (this.gibs || []).filter((gib) => {
      if (gib.owner !== owner) {
        return true;
      }
      this.scene.remove(gib.obj);
      return false;
    });
  }

  clearGibs() {
    for (const gib of this.gibs || []) {
      this.scene.remove(gib.obj);
    }
    this.gibs = [];
  }

  bloodSplat(point, normal, size = 0.5) {
    const vector = new THREE.Vector3(normal[0], normal[1], normal[2]);
    const mesh = new THREE.Mesh(
      this.planeGeo,
      this.splatMats[Math.floor(Math.random() * this.splatMats.length)],
    );
    mesh.position.copy(point).addScaledVector(vector, 0.014);
    mesh.lookAt(point.clone().add(vector));
    mesh.rotateZ(Math.random() * Math.PI * 2);
    mesh.scale.setScalar(size * (0.7 + Math.random() * 0.6));
    this.addDecal(mesh);
  }

  wound(parent, localPoint, localNormal) {
    const mesh = new THREE.Mesh(
      this.planeGeo,
      this.woundMats[Math.floor(Math.random() * this.woundMats.length)],
    );
    mesh.position.copy(localPoint).addScaledVector(localNormal, 0.006);
    mesh.lookAt(mesh.position.clone().add(localNormal));
    mesh.rotateZ(Math.random() * Math.PI * 2);
    mesh.scale.setScalar(0.15 + Math.random() * 0.07);
    parent.add(mesh);
    return mesh;
  }

  gush(source, duration = 1.5, power = 1) {
    this.gushes.push({ source, t: duration, acc: 0, power });
  }

  pool(point) {
    const mesh = new THREE.Mesh(this.planeGeo, this.splatMats[0]);
    mesh.position.set(point.x, point.y + 0.012, point.z);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.random() * Math.PI * 2;
    mesh.scale.setScalar(0.05);
    this.addDecal(mesh);
    this.pools.push({ mesh: mesh, t: 0, size: 1.4 + Math.random() * 0.5 });
  }

  clear() {
    for (const list of [
      this.decals,
      this.tracers.map((texture) => texture.mesh),
      this.sparks.map((positionX) => positionX.mesh),
      this.drops.map((positionX) => positionX.mesh),
      this.smokes.map((positionX) => positionX.mesh),
      this.flashes.map((positionX) => positionX.sp),
    ]) {
      for (const mesh of list) {
        this.scene.remove(mesh);
      }
    }
    this.decals = [];
    this.tracers = [];
    this.sparks = [];
    this.drops = [];
    this.smokes = [];
    this.flashes = [];
    this.pools = [];
    this.gushes = [];
  }

  clearDecalsIn(min, max, pad = 0.05) {
    this.decals = this.decals.filter((distance) => {
      const particle = distance.position;
      const inside =
        particle.x > min[0] - pad &&
        particle.x < max[0] + pad &&
        particle.y > min[1] - pad &&
        particle.y < max[1] + pad &&
        particle.z > min[2] - pad &&
        particle.z < max[2] + pad;
      if (inside) {
        this.scene.remove(distance);
      }
      return !inside;
    });
  }

  addDecal(mesh) {
    this.scene.add(mesh);
    this.decals.push(mesh);
    if (this.decals.length > MAX_DECALS) {
      this.scene.remove(this.decals.shift());
    }
  }

  impact(point, normal, kind = 'w') {
    const vector = new THREE.Vector3(normal[0], normal[1], normal[2]);
    for (let index = 0; index < 6; index++) {
      const mesh = new THREE.Mesh(this.sparkGeo, this.sparkMats[kind]);
      mesh.position.copy(point);
      this.scene.add(mesh);
      const velocity = vector
        .clone()
        .multiplyScalar(1.5 + Math.random() * 2)
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 2.5,
            Math.random() * 2,
            (Math.random() - 0.5) * 2.5,
          ),
        );
      this.sparks.push({ mesh: mesh, v: velocity, life: 0.35 + Math.random() * 0.2 });
    }
    if (kind === 'w' && vector.lengthSq() > 0.5) {
      const distance = new THREE.Mesh(this.decalGeo, this.decalMat);
      distance.position.copy(point).addScaledVector(vector, 0.012);
      distance.lookAt(point.clone().add(vector));
      this.scene.add(distance);
      this.decals.push(distance);
      if (this.decals.length > MAX_DECALS) {
        this.scene.remove(this.decals.shift());
      }
    }
  }

  update(deltaTime) {
    for (let index = (this.gibs || []).length - 1; index >= 0; index--) {
      const gib = this.gibs[index];
      gib.life -= deltaTime;
      const object = gib.obj;
      if (!gib.landed) {
        gib.v.y -= 18 * deltaTime;
        object.position.addScaledVector(gib.v, deltaTime);
        object.rotation.x += gib.spin.x * deltaTime;
        object.rotation.y += gib.spin.y * deltaTime;
        object.rotation.z += gib.spin.z * deltaTime;
        const groundY = this.ground(object.position.x, object.position.z) + 0.08;
        if (object.position.y < groundY) {
          object.position.y = groundY;
          gib.v.y = Math.abs(gib.v.y) * 0.25;
          gib.v.x *= 0.55;
          gib.v.z *= 0.55;
          gib.spin.multiplyScalar(0.5);
          if (Math.hypot(gib.v.x, gib.v.y, gib.v.z) < 0.8) {
            gib.landed = true;
            this.pool(new THREE.Vector3(object.position.x, groundY - 0.08, object.position.z));
          }
        }
      }
      if (gib.bleed > 0) {
        gib.bleed -= deltaTime;
        gib.acc += deltaTime * 40;
        while (gib.acc >= 1) {
          gib.acc -= 1;
          const mesh = new THREE.Mesh(this.dropGeo, this.dropMat);
          mesh.position.copy(object.position);
          this.scene.add(mesh);
          this.drops.push({
            mesh: mesh,
            v: new THREE.Vector3(
              (Math.random() - 0.5) * 1.2,
              Math.random() * 1.2,
              (Math.random() - 0.5) * 1.2,
            ),
            life: 1.4,
          });
        }
      }
      if (gib.life <= 0) {
        this.scene.remove(object);
        this.gibs.splice(index, 1);
      }
    }
    for (let index = (this.clouds || []).length - 1; index >= 0; index--) {
      const cloud = this.clouds[index];
      cloud.t += deltaTime;
      const grow = Math.min(1, cloud.t / 1.2);
      const fade = Math.min(1, Math.max(0, (cloud.dur - cloud.t) / 2.5));
      for (const puff of cloud.puffs) {
        puff.sp.scale.setScalar(puff.size * (0.3 + 0.7 * grow));
        puff.sp.position.set(
          cloud.p.x + puff.off.x * grow,
          cloud.p.y + puff.off.y * (0.5 + 0.5 * grow),
          cloud.p.z + puff.off.z * grow,
        );
        puff.sp.material.rotation += puff.drift * deltaTime;
        puff.sp.material.opacity = 0.92 * Math.min(1, cloud.t / 0.6) * fade;
      }
      if (cloud.t >= cloud.dur) {
        for (const puff of cloud.puffs) {
          this.scene.remove(puff.sp);
          puff.sp.material.dispose();
        }
        this.clouds.splice(index, 1);
      }
    }
    for (let index = (this.booms || []).length - 1; index >= 0; index--) {
      const boom = this.booms[index];
      boom.t += deltaTime;
      const progress = boom.t / 0.9;
      boom.fire.scale.setScalar((1 + Math.min(1, progress * 2) * 9) * boom.size);
      boom.fire.material.opacity = Math.max(0, 1 - progress);
      boom.smoke.scale.setScalar((2 + Math.min(1, boom.t / 3) * 12) * boom.size);
      boom.smoke.position.y += deltaTime * 1.5;
      boom.smoke.material.opacity = Math.max(0, 0.7 * (1 - boom.t / 4));
      if (boom.t > 4) {
        this.scene.remove(boom.fire, boom.smoke);
        boom.fire.geometry.dispose();
        boom.smoke.geometry.dispose();
        this.booms.splice(index, 1);
      }
    }
    for (let index = this.gushes.length - 1; index >= 0; index--) {
      const gush = this.gushes[index];
      gush.t -= deltaTime;
      if (gush.t <= 0) {
        this.gushes.splice(index, 1);
        continue;
      }
      gush.acc += deltaTime * 90 * gush.power * Math.min(1, gush.t);
      const source = gush.source();
      while (gush.acc >= 1 && source) {
        gush.acc -= 1;
        const mesh = new THREE.Mesh(this.dropGeo, this.dropMat);
        mesh.position.copy(source);
        this.scene.add(mesh);
        const progress = 0.5 + gush.power * 0.5;
        const velocity = new THREE.Vector3(
          (Math.random() - 0.5) * 1.6 * progress,
          (1.2 + Math.random() * 1.6) * progress,
          (Math.random() - 0.5) * 1.6 * progress,
        );
        this.drops.push({ mesh: mesh, v: velocity, life: 1.6 });
      }
    }
    for (let index = this.drops.length - 1; index >= 0; index--) {
      const distance = this.drops[index];
      distance.life -= deltaTime;
      distance.v.y -= 9.8 * deltaTime;
      distance.mesh.position.addScaledVector(distance.v, deltaTime);
      const groundY = this.ground(distance.mesh.position.x, distance.mesh.position.z);
      if (distance.mesh.position.y <= groundY + 0.01 || distance.life <= 0) {
        if (distance.mesh.position.y <= groundY + 0.01 && Math.random() < 0.25) {
          this.bloodSplat(
            new THREE.Vector3(distance.mesh.position.x, groundY, distance.mesh.position.z),
            [0, 1, 0],
            0.2,
          );
        }
        this.scene.remove(distance.mesh);
        this.drops.splice(index, 1);
      }
    }
    for (let index = this.pools.length - 1; index >= 0; index--) {
      const particle = this.pools[index];
      particle.t += deltaTime;
      particle.mesh.scale.setScalar(
        0.05 + (particle.size - 0.05) * Math.min(1, particle.t / 3) ** 0.6,
      );
      if (particle.t > 3) {
        this.pools.splice(index, 1);
      }
    }
    for (let index = this.smokes.length - 1; index >= 0; index--) {
      const smoke = this.smokes[index];
      smoke.life -= deltaTime;
      if (smoke.life <= 0) {
        this.scene.remove(smoke.mesh);
        smoke.mesh.material.dispose();
        this.smokes.splice(index, 1);
        continue;
      }
      const progress = smoke.life / smoke.max;
      smoke.mesh.material.opacity = 0.28 * progress * progress;
      const width = 1.5 + (1 - progress) * 4;
      smoke.mesh.scale.x = width;
      smoke.mesh.scale.y = width;
    }
    for (let index = this.flashes.length - 1; index >= 0; index--) {
      const flash = this.flashes[index];
      flash.life -= deltaTime;
      if (flash.life <= 0) {
        this.scene.remove(flash.sp);
        this.flashes.splice(index, 1);
      }
    }
    for (let index = this.tracers.length - 1; index >= 0; index--) {
      const texture = this.tracers[index];
      texture.dist += 220 * deltaTime;
      const head = Math.min(texture.dist, texture.len);
      const tail = Math.max(0, texture.dist - texture.seg);
      if (tail >= texture.len) {
        this.scene.remove(texture.mesh);
        this.tracers.splice(index, 1);
        continue;
      }
      texture.mesh.position.copy(texture.from).addScaledVector(texture.dir, (head + tail) / 2);
      texture.mesh.scale.z = Math.max(0.01, head - tail);
    }
    for (let index = this.sparks.length - 1; index >= 0; index--) {
      const spark = this.sparks[index];
      spark.life -= deltaTime;
      if (spark.life <= 0) {
        this.scene.remove(spark.mesh);
        this.sparks.splice(index, 1);
        continue;
      }
      spark.v.y -= 9 * deltaTime;
      spark.mesh.position.addScaledVector(spark.v, deltaTime);
      spark.mesh.scale.setScalar(Math.max(0.1, spark.life * 2.5));
    }
  }
}
