import { inspectKatana } from './katanaFx.js';

const TAU = Math.PI * 2;
const ease = (positionX) => positionX * positionX * (3 - 2 * positionX);
const seg = (progress, start, end) =>
  ease(Math.min(1, Math.max(0, (progress - start) / (end - start))));
const env = (progress) => Math.sin(progress * Math.PI);
const wave = (progress) => Math.sin(progress * TAU);
const inOut = (progress) => seg(progress, 0, 0.18) * (1 - seg(progress, 0.82, 1));
const thrust = (progress) =>
  progress < 0.3
    ? -Math.sin((progress / 0.3) * Math.PI * 0.5) * 0.4
    : Math.sin(((progress - 0.3) / 0.7) * Math.PI);

export const KNIFE_ANIMS = {
  knife: {
    swingRate: 3.2,
    stabRate: 2.3,
    inspectDur: 2.6,
    swing(pose, progress, direction) {
      const stage = env(progress);
      pose.position.x -= stage * 0.12 * direction;
      pose.position.z -= stage * 0.1;
      pose.rotation.y = stage * 0.9 * direction;
      pose.rotation.x -= stage * 0.4;
    },
    stab(pose, progress) {
      const stage = thrust(progress);
      pose.position.z -= stage * 0.24;
      pose.position.x -= stage * 0.07;
      pose.position.y += stage * 0.05;
      pose.rotation.x -= stage * 0.35;
      pose.rotation.y += stage * 0.25;
    },
    inspect(pose, progress) {
      const eased = inOut(progress);
      pose.position.x -= 0.12 * eased;
      pose.position.y += 0.05 * eased;
      pose.position.z += 0.06 * eased;
      pose.rotation.y +=
        1.0 * seg(progress, 0.15, 0.38) -
        1.9 * seg(progress, 0.48, 0.7) +
        0.9 * seg(progress, 0.82, 1);
      pose.rotation.z +=
        0.35 * seg(progress, 0.15, 0.38) -
        0.7 * seg(progress, 0.48, 0.7) +
        0.35 * seg(progress, 0.82, 1);
      pose.rotation.x += 0.2 * eased;
    },
  },

  karambit: {
    swingRate: 4.2,
    stabRate: 2.6,
    inspectDur: 2.8,
    swing(pose, progress, direction) {
      const stage = env(progress);
      pose.position.x -= stage * 0.09 * direction;
      pose.position.z -= stage * 0.08;
      pose.rotation.y = stage * 0.55 * direction;
      pose.rotation.z += stage * 1.5 * direction;
      pose.rotation.x -= stage * 0.3;
    },
    stab(pose, progress) {
      const stage = thrust(progress);
      pose.position.z -= stage * 0.18;
      pose.position.y -= stage * 0.06;
      pose.rotation.x -= stage * 0.95;
      pose.rotation.z += stage * 0.7;
    },
    inspect(pose, progress) {
      const eased = inOut(progress);
      pose.position.x -= 0.1 * eased;
      pose.position.y += 0.05 * eased;
      pose.position.z += 0.07 * eased;
      pose.rotation.z += TAU * seg(progress, 0.2, 0.5) - TAU * seg(progress, 0.55, 0.85);
      pose.rotation.y += 0.5 * env(seg(progress, 0.1, 0.9));
      pose.rotation.x += 0.25 * eased;
    },
  },

  butterfly: {
    swingRate: 4.2,
    stabRate: 2.6,
    inspectDur: 4.4,
    swing(pose, progress, direction, spin) {
      const stage = env(progress);
      pose.position.x -= stage * 0.09 * direction;
      pose.position.z -= stage * 0.06;
      pose.rotation.y = stage * 0.45 * direction;
      spin.rotation.z += stage * 0.7 * direction;
      spin.rotation.x -= stage * 0.25;
    },
    stab(pose, progress, spin) {
      const stage = thrust(progress);
      pose.position.z -= stage * 0.2;
      pose.position.y += stage * 0.02;
      spin.rotation.x -= stage * 0.35;
    },
    inspect(pose, progress, viewmodel, spin) {
      const eased = inOut(progress);
      pose.position.x -= 0.08 * eased;
      pose.position.y += 0.04 * eased;
      pose.position.z += 0.05 * eased;
      spin.rotation.x +=
        TAU * seg(progress, 0.1, 0.28) +
        TAU * seg(progress, 0.3, 0.48) -
        TAU * seg(progress, 0.82, 0.96);
      spin.rotation.y += TAU * seg(progress, 0.5, 0.66);
      spin.rotation.z += TAU * seg(progress, 0.66, 0.82);
      const hop = (start, end) =>
        progress > start && progress < end
          ? Math.sin(((progress - start) / (end - start)) * Math.PI)
          : 0;
      spin.position.y +=
        0.035 * (hop(0.1, 0.28) + hop(0.3, 0.48) + hop(0.5, 0.66) + hop(0.66, 0.82));
    },
  },

  bayonet: {
    swingRate: 3.2,
    stabRate: 2.3,
    inspectDur: 2.4,
    swing(pose, progress, direction) {
      const stage = env(progress);
      pose.position.x -= stage * 0.1 * direction;
      pose.position.z -= stage * 0.1;
      pose.rotation.y = stage * 0.8 * direction;
      pose.rotation.z += stage * 0.5 * direction;
      pose.rotation.x -= stage * 0.5;
    },
    stab(pose, progress) {
      const stage = thrust(progress);
      pose.position.z -= stage * 0.34;
      pose.position.x -= stage * 0.05;
      pose.rotation.x -= stage * 0.2;
      pose.rotation.y += stage * 0.15;
    },
    inspect(pose, progress) {
      const eased = inOut(progress);
      pose.position.x -= 0.13 * eased;
      pose.position.y += 0.06 * eased;
      pose.position.z += 0.08 * eased;
      pose.rotation.y +=
        1.2 * seg(progress, 0.15, 0.4) -
        2.2 * seg(progress, 0.5, 0.72) +
        1.0 * seg(progress, 0.82, 1);
      pose.rotation.z +=
        0.5 * seg(progress, 0.15, 0.4) -
        0.9 * seg(progress, 0.5, 0.72) +
        0.4 * seg(progress, 0.82, 1);
      pose.rotation.x += 0.3 * eased;
    },
  },

  m9: {
    swingRate: 3.0,
    stabRate: 2.2,
    inspectDur: 2.8,
    swing(pose, progress, direction) {
      const stage = env(progress);
      pose.position.x -= stage * 0.18 * direction;
      pose.position.z -= stage * 0.1;
      pose.rotation.y = stage * 1.15 * direction;
      pose.rotation.z += stage * 0.4 * direction;
      pose.rotation.x -= stage * 0.35;
    },
    stab(pose, progress) {
      const stage = thrust(progress);
      pose.position.z -= stage * 0.28;
      pose.position.y += stage * 0.04;
      pose.rotation.x -= stage * 0.3;
      pose.rotation.y += stage * 0.3;
    },
    inspect(pose, progress) {
      const eased = inOut(progress);
      pose.position.x -= 0.12 * eased;
      pose.position.y += 0.05 * eased;
      pose.position.z += 0.07 * eased;
      pose.rotation.y += TAU * seg(progress, 0.2, 0.75);
      pose.rotation.z += 0.4 * env(seg(progress, 0.1, 0.9));
      pose.rotation.x += 0.2 * eased;
    },
  },

  katana: {
    swingRate: 2.2,
    stabRate: 1.0,
    inspectDur: 7.0,
    swing(pose, progress) {
      const wobble =
        -0.5 * seg(progress, 0, 0.25) + 1.5 * seg(progress, 0.25, 0.5) - seg(progress, 0.6, 1);
      const cut = seg(progress, 0.25, 0.5) * (1 - seg(progress, 0.5, 0.7));
      pose.position.x -= wobble * 0.07 + Math.sin(progress * Math.PI) * 0.09;
      pose.position.z -= cut * 0.14;
      pose.rotation.y += wobble * 0.95;
      pose.rotation.x -= wobble * 0.9;
      pose.rotation.z -= wobble * 0.25;
    },
    stab(pose, progress) {
      const raise = seg(progress, 0, 0.4);
      const cut = seg(progress, 0.42, 0.56);
      const back = seg(progress, 0.66, 1);
      pose.rotation.x += 0.9 * raise - 1.9 * cut + 1.0 * back;
      pose.position.y += 0.14 * raise - 0.2 * cut + 0.06 * back;
      pose.position.z += -0.05 * raise - 0.14 * cut + 0.19 * back;
      pose.rotation.z += 0.12 * (raise - cut);
    },
    inspect(pose, progress, viewmodel) {
      inspectKatana(viewmodel, pose, progress);
    },
  },

  machete: {
    swingRate: 2.6,
    stabRate: 2.0,
    inspectDur: 2.8,
    swing(pose, progress, direction) {
      const stage = env(progress);
      const sway = -wave(progress);
      pose.position.x += sway * 0.1 * direction;
      pose.position.y += wave(progress) * 0.04;
      pose.position.z -= stage * 0.1;
      pose.rotation.y += sway * 0.8 * direction;
      pose.rotation.z += sway * 0.7 * direction;
      pose.rotation.x += wave(progress) * 0.45;
    },
    stab(pose, progress) {
      const stage = thrust(progress);
      pose.position.z -= stage * 0.28;
      pose.position.y -= stage * 0.04;
      pose.rotation.x -= stage * 0.5;
      pose.rotation.y += stage * 0.2;
    },
    inspect(pose, progress) {
      const eased = inOut(progress);
      pose.position.x -= 0.12 * eased;
      pose.position.y += 0.05 * eased;
      pose.position.z += 0.07 * eased;
      pose.rotation.z += TAU * seg(progress, 0.25, 0.6);
      pose.rotation.y +=
        0.8 * seg(progress, 0.1, 0.25) -
        1.3 * seg(progress, 0.65, 0.85) +
        0.5 * seg(progress, 0.88, 1);
      pose.rotation.x += 0.2 * eased;
    },
  },

  axe: {
    swingRate: 2.0,
    stabRate: 1.0,
    inspectDur: 3.0,
    swing(pose, progress, direction) {
      const sway = wave(progress);
      pose.position.y += sway * 0.1;
      pose.position.z -= env(progress) * 0.12;
      pose.position.x -= env(progress) * 0.05 * direction;
      pose.rotation.x += sway * 0.9;
      pose.rotation.z += env(progress) * 0.2 * direction;
    },
    stab(pose, progress) {
      const sway = wave(progress);
      pose.position.y += sway * 0.15;
      pose.position.z -= env(progress) * 0.22;
      pose.rotation.x += sway * 1.25;
      pose.rotation.y += env(progress) * 0.2;
    },
    inspect(pose, progress) {
      const eased = inOut(progress);
      pose.position.x -= 0.1 * eased;
      pose.position.y += 0.08 * eased;
      pose.position.z += 0.08 * eased;
      pose.rotation.x += 0.5 * env(seg(progress, 0.08, 0.5));
      pose.rotation.z += TAU * seg(progress, 0.35, 0.75);
      pose.rotation.y += 0.7 * seg(progress, 0.1, 0.35) - 0.9 * seg(progress, 0.78, 1);
    },
  },
};

export const knifeAnim = (id) => KNIFE_ANIMS[id] || KNIFE_ANIMS.knife;
