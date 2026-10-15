import { GameAudio, pickVariant, vary } from '../audio.js';
import { MW } from '../../../shared/milsim/weapons.js';

const SOUND_SPEED = 343;

const fin = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const MAX_VOICES = 64;

const PRELOAD = [
  'engine_jeep',
  'engine_truck',
  'engine_tank',
  'engine_apc',
  'rotor_heli',
  'wind',
  'breath_tired',
  'bullet_crack_1',
  'bullet_crack_2',
  'far_rifle',
  'far_sniper',
  'far_mg',
  'far_pistol',
  'far_shotgun',
  'explosion_big',
  'explosion_far',
  'explosion_grenade',
  ...['grass', 'dirt', 'concrete', 'wood', 'metal', 'water'].flatMap((surface) =>
    [1, 2, 3].map((variant) => `step_${surface}_${variant}`),
  ),
  ...['dirt', 'concrete', 'metal', 'wood'].map((variant) => `impact_${variant}`),
];
const SHOT_BY_CLASS = {
  rifle: 'shot_rifle',
  smg: 'shot_smg',
  sniper: 'shot_scout',
  pistol: 'shot_pistol',
  shotgun: 'shot_shotgun',
  mg: 'shot_m249',
};
const FAR_BY_CLASS = {
  sniper: 'far_sniper',
  mg: 'far_mg',
  pistol: 'far_pistol',
  shotgun: 'far_shotgun',
};
const NEAR_FAR_START_M = 60;
const NEAR_FAR_SPAN_M = 300;
const MINIGUN_SOUND_GAP_S = 0.1;
const LOOP_FILES = {
  heli: 'rotor_heli',
  jeep: 'engine_jeep',
  mjeep: 'engine_jeep',
  truck: 'engine_truck',
  transport: 'engine_truck',
  apc: 'engine_apc',
  ifv: 'engine_tank',
  tank: 'engine_tank',
};
const STEP_FILES = {
  grass: 'grass',
  dirt: 'dirt',
  gravel: 'gravel',
  asphalt: 'asphalt',
  concrete: 'concrete',
  wood: 'wood',
  metal: 'metal',
  water: 'water',
};
const IMPACT_FILES = { metal: 'metal', concrete: 'concrete', wood: 'wood', flesh: 'flesh' };
const BREATH_HOLD_MS = 2600;
const WIND_ENABLED = false;
const WIND_GAIN = 0.1;
const weaponClass = (id) => MW.find((weapon) => weapon?.id === id)?.class;
const VEHICLE_SHOTS = new Set(['minigun', 'hmg', 'autocannon', 'cannon', 'rpg']);

export class MilsimAudio extends GameAudio {
  init() {
    const had = !!this.ctx;
    super.init();
    if (!had && this.ctx) {
      this.master.disconnect();
      this.buildOut();
    }
  }

  preloadList() {
    return PRELOAD;
  }

  shotSample(id) {
    if (id === 'mortar') {
      return 'mortar_launch';
    }
    if (VEHICLE_SHOTS.has(id)) {
      return `shot_${id}`;
    }
    const own = `shot_${id}`;
    if (this.bufferOf(own) || !this.samples.get(own)?.failed) {
      return own;
    }
    return SHOT_BY_CLASS[weaponClass(id)] || 'shot_rifle';
  }

  shot(id, { gain = 1, pan = 0 } = {}) {
    if (id === 'minigun') {
      const now = this.ctx?.currentTime ?? 0;
      if (now - (this.minigunAt || 0) < MINIGUN_SOUND_GAP_S) {
        return;
      }
      this.minigunAt = now;
    }
    if (this.sample(this.shotSample(id), { gain: gain * 0.9, pan, rate: vary(0.04) })) {
      return;
    }
    super.shot(id === 'rpg' || id === 'cannon' ? 'awp' : id, { gain, pan });
  }

  shotSilenced(classId, { gain = 1, pan = 0 } = {}) {
    const name =
      classId === 'pistol'
        ? 'shot_silenced_pistol'
        : classId === 'sniper'
          ? 'shot_silenced_sniper'
          : classId === 'smg'
            ? 'shot_silenced_smg'
            : 'shot_silenced_rifle';
    if (!this.sample(name, { gain: gain * 0.7, pan, rate: vary(0.04) })) {
      this._noise({ dur: 0.08, freq: 1800, type: 'bandpass', q: 1.2, gain: 0.18 * gain, pan });
    }
  }

  buildOut() {
    const context = this.ctx;
    this.comp = context.createDynamicsCompressor();
    this.master.connect(this.comp);
    this.comp.connect(context.destination);
    this.meter = context.createAnalyser();
    this.meter.fftSize = 256;
    this.meterBuf = new Float32Array(256);
    this.comp.connect(this.meter);
  }

  play(oscillator, duration, callback) {
    const context = this.ctx;
    this.sweep();
    const live = (this.live ||= []);
    if (live.length >= MAX_VOICES || this.busy(oscillator.gain ?? 0.4)) {
      return;
    }
    const bus = context.createGain();
    bus.connect(this.master);
    const real = this.master;
    this.master = bus;
    try {
      callback();
    } catch {
    } finally {
      this.master = real;
    }
    live.push({ bus, end: context.currentTime + duration + 0.4 });
  }

  sweep() {
    const live = this.live;
    if (!live?.length) {
      return;
    }
    const now = this.ctx.currentTime;
    let weapon = 0;
    for (let index = 0; index < live.length; index++) {
      const value = live[index];
      if (value.end > now) {
        live[weapon++] = value;
      } else {
        value.bus.disconnect();
      }
    }
    live.length = weapon;
  }

  _noise(oscillator) {
    if (!this.ctx) {
      return;
    }
    const gain = oscillator.gain ?? 0.5;
    if (
      !Number.isFinite(gain) ||
      gain <= 0.0005 ||
      !Number.isFinite(oscillator.dur ?? 0.1) ||
      !Number.isFinite(oscillator.freq ?? 2000)
    ) {
      return;
    }
    this.play(
      oscillator,
      (oscillator.dur ?? 0.1) + (oscillator.attack || 0) + (oscillator.pan?.delay || 0),
      () => super._noise(oscillator),
    );
  }

  _tone(oscillator) {
    if (!this.ctx) {
      return;
    }
    const gain = oscillator.gain ?? 0.3;
    if (
      !Number.isFinite(gain) ||
      gain <= 0.0005 ||
      !Number.isFinite(oscillator.from ?? 440) ||
      !Number.isFinite(oscillator.to ?? 440)
    ) {
      return;
    }
    this.play(
      oscillator,
      (oscillator.dur || 0.1) + (oscillator.delay || 0) + (oscillator.pan?.delay || 0),
      () => super._tone(oscillator),
    );
  }

  busy(gain) {
    const value = this.live?.length || 0;
    return (value > MAX_VOICES * 0.6 && gain < 0.08) || (value > MAX_VOICES * 0.8 && gain < 0.2);
  }

  get active() {
    return this.live?.length || 0;
  }

  ensureRunning() {
    if (this.ctx && this.ctx.state !== 'running') {
      this.ctx.resume().catch(() => {});
    }
  }

  longNoise() {
    if (this._long) {
      return this._long;
    }
    const context = this.ctx;
    const length = context.sampleRate * 12;
    const fade = context.sampleRate * 1;
    const buffer = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const fallback = buffer.getChannelData(channel);
      for (let index = 0; index < length; index++) {
        fallback[index] = Math.random() * 2 - 1;
      }
      for (let index = 0; index < fade; index++) {
        const variant = index / fade;
        fallback[index] =
          fallback[index] * variant + fallback[length - fade + index] * (1 - variant);
      }
    }
    this._long = buffer;
    return buffer;
  }

  _out(pan) {
    if (!pan || typeof pan !== 'object' || !pan.far) {
      return super._out(pan);
    }
    const context = this.ctx;
    const panner = context.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'linear';
    panner.rolloffFactor = 0;
    const [positionX, positionY, positionZ] = pan.pos.map((value) => fin(value));
    if (panner.positionX) {
      panner.positionX.value = positionX;
      panner.positionY.value = positionY;
      panner.positionZ.value = positionZ;
    } else {
      panner.setPosition(positionX, positionY, positionZ);
    }
    panner.connect(this.master);
    let head = panner;
    if (pan.delay > 0.01) {
      const fallback = context.createDelay(6);
      fallback.delayTime.value = Math.min(5.5, fin(pan.delay));
      fallback.connect(head);
      head = fallback;
    }
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = Math.max(80, Math.min(20000, fin(pan.lp, 18000)));
    lowpass.Q.value = 0.5;
    lowpass.connect(head);
    return lowpass;
  }

  farParams(position, ear, { loud = 1, muffled = false } = {}) {
    const fallback = fin(
      Math.hypot(position[0] - ear[0], position[1] - ear[1], position[2] - ear[2]),
      2000,
    );
    const gain = Math.min(1.2, loud * (1 / (1 + fallback / 28)) * (muffled ? 0.55 : 1));
    const lowpass = Math.max(320, 16000 / (1 + fallback / 90)) * (muffled ? 0.35 : 1);
    return {
      d: fallback,
      gain,
      pan: { far: true, pos: position, delay: fallback / SOUND_SPEED, lp: lowpass },
    };
  }

  shotFar(id, position, ear, silenced = false, muffled = false) {
    if (!this.ctx) {
      return;
    }
    const {
      d: fallback,
      gain,
      pan,
    } = this.farParams(position, ear, { loud: silenced ? 0.35 : 1.6, muffled });
    if (gain < 0.004) {
      return;
    }
    const farMix = Math.max(0, Math.min(1, (fallback - NEAR_FAR_START_M) / NEAR_FAR_SPAN_M));
    const classId = weaponClass(id);
    if (silenced) {
      this.shotSilenced(classId, { gain: gain * 1.6, pan });
      return;
    }
    const nearName = this.shotSample(id);
    const farName = FAR_BY_CLASS[classId] || 'far_rifle';
    if (this.bufferOf(nearName) && this.bufferOf(farName)) {
      this.sample(nearName, { gain: gain * 0.9 * (1 - farMix), pan, rate: vary(0.04) });
      this.sample(farName, { gain: Math.min(1.2, gain * 2.2) * farMix, pan, rate: vary(0.05) });
      return;
    }
    this.shot(id, { gain, pan });
    if (fallback > 120 && !silenced) {
      const echo = {
        ...pan,
        delay: pan.delay + 0.25 + Math.min(1.4, fallback / 600),
        lp: Math.min(pan.lp, 900),
      };
      this._noise({
        dur: 0.9,
        freq: 260,
        type: 'lowpass',
        q: 0.4,
        gain: gain * 0.5,
        pan: echo,
        attack: 0.03,
      });
    }
  }

  boomFar(position, ear, big = 1) {
    if (!this.ctx) {
      return;
    }
    const { d: fallback, gain, pan } = this.farParams(position, ear, { loud: 2.2 * big });
    const nearName = big >= 1.2 ? 'explosion_big' : 'explosion_grenade';
    if (this.bufferOf(nearName) && this.bufferOf('explosion_far')) {
      const farMix = Math.max(0, Math.min(1, (fallback - NEAR_FAR_START_M) / NEAR_FAR_SPAN_M));
      this.sample(nearName, {
        gain: Math.min(1.3, gain * 1.2) * (1 - farMix),
        pan,
        rate: vary(0.05),
      });
      this.sample('explosion_far', {
        gain: Math.min(1.3, gain * 2) * farMix,
        pan,
        rate: vary(0.05),
      });
      return;
    }
    this._noise({
      dur: 1.2,
      freq: 900,
      type: 'lowpass',
      q: 0.6,
      gain: Math.min(1.3, gain * 1.2),
      pan,
    });
    this._tone({ from: 70, to: 28, dur: 0.9, gain: Math.min(0.9, gain * 0.9), type: 'sine', pan });
    const echo = { ...pan, delay: pan.delay + 0.6, lp: 380 };
    this._noise({
      dur: 2.2,
      freq: 200,
      type: 'lowpass',
      q: 0.4,
      gain: gain * 0.45,
      pan: echo,
      attack: 0.15,
    });
  }

  crack(position) {
    if (!this.ctx) {
      return;
    }
    const near = { far: true, pos: position, delay: 0, lp: 18000 };
    if (this.sample(pickVariant('bullet_crack', 2), { gain: 0.6, pan: near, rate: vary(0.08) })) {
      return;
    }
    this._noise({
      dur: 0.05,
      freq: 3800,
      type: 'highpass',
      q: 0.9,
      gain: 0.55,
      pan: { far: true, pos: position, delay: 0, lp: 18000 },
    });
    this._noise({
      dur: 0.12,
      freq: 1200,
      type: 'bandpass',
      q: 1.5,
      gain: 0.18,
      pan: { far: true, pos: position, delay: 0.02, lp: 6000 },
    });
  }

  whistle(position, ear, duration = 2.6) {
    if (!this.ctx) {
      return;
    }
    const { gain, pan } = this.farParams(position, ear, { loud: 1.2 });
    this._tone({
      from: 1900,
      to: 520,
      dur: duration,
      gain: Math.min(0.25, gain * 0.5),
      type: 'sine',
      pan: { ...pan, delay: 0 },
    });
  }

  loop(kind, type = '') {
    if (!this.ctx) {
      return null;
    }
    const VEHICLE_PROFILES = {
      jeep: [38, 70, 220, 25],
      mjeep: [36, 66, 210, 27],
      truck: [26, 42, 130, 45],
      transport: [25, 40, 125, 45],
      apc: [22, 34, 110, 60, 0.12],
      ifv: [20, 32, 100, 70, 0.16],
      tank: [15, 24, 85, 110, 0.24],
    };
    const [baseFrequency, maxFrequency, nband, range, clatter = 0] = VEHICLE_PROFILES[type] || [
      32, 55, 160, 25,
    ];
    const recorded = this.bufferOf(LOOP_FILES[kind === 'heli' ? 'heli' : type] || 'engine_jeep');
    if (recorded) {
      return this.recordedLoop(kind, recorded, range);
    }
    const context = this.ctx;
    const out = context.createGain();
    out.gain.value = 0;
    const panner = context.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'linear';
    panner.rolloffFactor = 0;
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 2000;
    out.connect(lowpass);
    lowpass.connect(panner);
    panner.connect(this.master);
    const nodes = [];
    let oscillator = null;
    let amplitudeModulator = null;
    if (kind === 'heli') {
      const source = context.createBufferSource();
      source.buffer = this.longNoise();
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      const gain = context.createGain();
      gain.gain.value = 0.25;
      amplitudeModulator = context.createOscillator();
      amplitudeModulator.frequency.value = 6;
      const gainNode = context.createGain();
      gainNode.gain.value = 0.22;
      amplitudeModulator.connect(gainNode);
      gainNode.connect(gain.gain);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      oscillator = context.createOscillator();
      oscillator.type = 'sawtooth';
      oscillator.frequency.value = 90;
      const outputGain = context.createGain();
      outputGain.gain.value = 0.08;
      oscillator.connect(outputGain);
      outputGain.connect(out);
      source.start();
      amplitudeModulator.start();
      oscillator.start();
      nodes.push(source, amplitudeModulator, oscillator);
    } else {
      oscillator = context.createOscillator();
      oscillator.type = 'sawtooth';
      oscillator.frequency.value = baseFrequency;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 300;
      oscillator.connect(filter);
      const gain = context.createGain();
      gain.gain.value = 0.35;
      filter.connect(gain);
      gain.connect(out);
      const source = context.createBufferSource();
      source.buffer = this.longNoise();
      source.loop = true;
      const noiseFilter = context.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = nband;
      const noiseGain = context.createGain();
      noiseGain.gain.value = 0.25;
      source.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(out);
      oscillator.start();
      source.start();
      nodes.push(oscillator, source);
      if (clatter > 0) {
        const clatterSource = context.createBufferSource();
        clatterSource.buffer = this.longNoise();
        clatterSource.loop = true;
        const clatterFilter = context.createBiquadFilter();
        clatterFilter.type = 'bandpass';
        clatterFilter.frequency.value = 750;
        clatterFilter.Q.value = 1.4;
        const clatterGain = context.createGain();
        clatterGain.gain.value = 0;
        amplitudeModulator = context.createOscillator();
        amplitudeModulator.type = 'square';
        amplitudeModulator.frequency.value = 4;
        const gainNode = context.createGain();
        gainNode.gain.value = clatter;
        amplitudeModulator.connect(gainNode);
        gainNode.connect(clatterGain.gain);
        clatterSource.connect(clatterFilter);
        clatterFilter.connect(clatterGain);
        clatterGain.connect(out);
        clatterSource.start();
        amplitudeModulator.start();
        nodes.push(clatterSource, amplitudeModulator);
      }
      oscillator.userData = { f0: baseFrequency, fm: maxFrequency };
    }
    return {
      update: (position, ear, power, load, inside = false, radial = 0) => {
        power = Math.max(0, Math.min(1, fin(power)));
        load = Math.max(0, Math.min(1, fin(load)));
        const fallback = fin(
          Math.hypot(position[0] - ear[0], position[1] - ear[1], position[2] - ear[2]),
          1000,
        );
        const now = context.currentTime;
        const base = kind === 'heli' ? 0.5 : 0.32;
        let gain =
          power <= 0
            ? 0
            : Math.min(0.35, base * power * (1 / (1 + fallback / (kind === 'heli' ? 70 : range))));
        const dopplerShift = Math.max(
          0.86,
          Math.min(1.16, 343 / (343 - Math.max(-60, Math.min(60, fin(radial))))),
        );
        if (inside) {
          gain = Math.min(gain, kind === 'heli' ? 0.11 : 0.09);
        }
        out.gain.setTargetAtTime(fin(gain), now, 0.15);
        lowpass.frequency.setTargetAtTime(
          inside ? 700 : Math.max(250, 9000 / (1 + fallback / 60)),
          now,
          0.2,
        );
        if (panner.positionX) {
          panner.positionX.setTargetAtTime(fin(position[0]), now, 0.05);
          panner.positionY.setTargetAtTime(fin(position[1]), now, 0.05);
          panner.positionZ.setTargetAtTime(fin(position[2]), now, 0.05);
        }
        if (kind === 'heli') {
          amplitudeModulator.frequency.setTargetAtTime((3 + 4.5 * power) * dopplerShift, now, 0.3);
          oscillator.frequency.setTargetAtTime((60 + 50 * power) * dopplerShift, now, 0.3);
        } else {
          oscillator.frequency.setTargetAtTime(
            (baseFrequency + maxFrequency * load) * dopplerShift,
            now,
            0.15,
          );
          if (amplitudeModulator) {
            amplitudeModulator.frequency.setTargetAtTime(2 + 22 * load, now, 0.2);
          }
        }
      },
      stop: () => {
        out.gain.setTargetAtTime(0, context.currentTime, 0.1);
        setTimeout(() => {
          for (const node of nodes) {
            try {
              node.stop();
            } catch {}
          }
          panner.disconnect();
        }, 600);
      },
    };
  }

  recordedLoop(kind, buffer, range) {
    const context = this.ctx;
    const out = context.createGain();
    out.gain.value = 0;
    const panner = context.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'linear';
    panner.rolloffFactor = 0;
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 9000;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(out);
    out.connect(lowpass);
    lowpass.connect(panner);
    panner.connect(this.master);
    source.start(0, Math.random() * buffer.duration);
    const heli = kind === 'heli';
    return {
      update: (position, ear, power, load, inside = false, radial = 0) => {
        power = Math.max(0, Math.min(1, fin(power)));
        load = Math.max(0, Math.min(1, fin(load)));
        const fallback = fin(
          Math.hypot(position[0] - ear[0], position[1] - ear[1], position[2] - ear[2]),
          1000,
        );
        const now = context.currentTime;
        let gain =
          power <= 0
            ? 0
            : Math.min(
                0.6,
                (heli ? 0.8 : 0.55) * power * (1 / (1 + fallback / (heli ? 70 : range))),
              );
        if (inside) {
          gain = Math.min(gain, heli ? 0.2 : 0.16);
        }
        const doppler = Math.max(
          0.86,
          Math.min(1.16, 343 / (343 - Math.max(-60, Math.min(60, fin(radial))))),
        );
        const rate = (heli ? 0.75 + 0.3 * power : 0.85 + 0.55 * load) * doppler;
        out.gain.setTargetAtTime(fin(gain), now, 0.15);
        source.playbackRate.setTargetAtTime(fin(rate, 1), now, 0.2);
        lowpass.frequency.setTargetAtTime(
          inside ? 900 : Math.max(300, 12000 / (1 + fallback / 80)),
          now,
          0.2,
        );
        if (panner.positionX) {
          panner.positionX.setTargetAtTime(fin(position[0]), now, 0.05);
          panner.positionY.setTargetAtTime(fin(position[1]), now, 0.05);
          panner.positionZ.setTargetAtTime(fin(position[2]), now, 0.05);
        }
      },
      stop: () => {
        out.gain.setTargetAtTime(0, context.currentTime, 0.1);
        setTimeout(() => {
          try {
            source.stop();
          } catch {}
          panner.disconnect();
        }, 600);
      },
    };
  }

  startWind() {
    if (!WIND_ENABLED || !this.ctx || this.wind) {
      return;
    }
    const context = this.ctx;
    const recorded = this.bufferOf('wind');
    if (recorded) {
      const source = context.createBufferSource();
      source.buffer = recorded;
      source.loop = true;
      const out = context.createGain();
      out.gain.setValueAtTime(0, context.currentTime);
      out.gain.linearRampToValueAtTime(WIND_GAIN, context.currentTime + 3);
      source.connect(out);
      out.connect(this.master);
      source.start(0, Math.random() * recorded.duration);
      this.wind = { src: source, lfos: [], out };
      return;
    }
    const now = context.currentTime;
    const currentSource = context.createBufferSource();
    currentSource.buffer = this.longNoise();
    currentSource.loop = true;
    currentSource.playbackRate.value = 0.9 + Math.random() * 0.2;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 380;
    filter.Q.value = 0.6;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.03, now + 3);
    const out = context.createGain();
    out.gain.value = 1;
    const lfos = [];
    const lowFrequencyOscillator = (frequency, amount, param) => {
      const oscillator = context.createOscillator();
      oscillator.frequency.value = frequency;
      const variant = context.createGain();
      variant.gain.value = amount;
      oscillator.connect(variant);
      variant.connect(param);
      oscillator.start();
      lfos.push(oscillator);
    };
    lowFrequencyOscillator(0.071, 0.014, gain.gain);
    lowFrequencyOscillator(0.023, 0.01, gain.gain);
    lowFrequencyOscillator(0.043, 160, filter.frequency);
    lowFrequencyOscillator(0.017, 90, filter.frequency);
    currentSource.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    out.connect(this.master);
    currentSource.start(now, Math.random() * 10);
    this.wind = { src: currentSource, lfos, out };
  }

  stopWind() {
    const weapon = this.wind;
    if (!weapon || !this.ctx) {
      return;
    }
    this.wind = null;
    const now = this.ctx.currentTime;
    weapon.out.gain.setValueAtTime(weapon.out.gain.value, now);
    weapon.out.gain.linearRampToValueAtTime(0, now + 0.4);
    setTimeout(() => {
      for (const node of [weapon.src, ...weapon.lfos]) {
        try {
          node.stop();
        } catch {}
      }
      weapon.out.disconnect();
    }, 500);
  }

  breath(strength = 1) {
    if (!this.ctx) {
      return;
    }
    const buffer = this.bufferOf('breath_tired');
    if (buffer) {
      const context = this.ctx;
      if (!this.panting) {
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const out = context.createGain();
        out.gain.value = 0;
        source.connect(out);
        out.connect(this.master);
        source.start(0, Math.random() * buffer.duration);
        this.panting = { src: source, out };
      }
      const now = context.currentTime;
      const level = Math.min(0.32, 0.12 + 0.2 * fin(strength));
      this.panting.out.gain.setTargetAtTime(level, now, 0.4);
      this.panting.until = performance.now() + BREATH_HOLD_MS;
      clearTimeout(this.panting.timer);
      this.panting.timer = setTimeout(() => this.stopPanting(), BREATH_HOLD_MS);
      return;
    }
    this._noise({
      dur: 0.45,
      freq: 900,
      type: 'bandpass',
      q: 0.8,
      gain: 0.05 * strength,
      attack: 0.12,
    });
  }

  stepSurf(surf, gain = 0.3, pan = 0) {
    const file = STEP_FILES[surf] || 'dirt';
    if (this.sample(pickVariant(`step_${file}`, 3), { gain: gain * 1.4, pan, rate: vary(0.06) })) {
      return;
    }
    const SURFACES = {
      grass: [380, 0.8, 'lowpass'],
      dirt: [520, 0.9, 'lowpass'],
      concrete: [1500, 1.6, 'bandpass'],
      wood: [700, 2.2, 'bandpass'],
      metal: [2300, 4, 'bandpass'],
      water: [900, 0.6, 'highpass'],
    };
    const [frequency, resonance, type] = SURFACES[surf] || SURFACES.dirt;
    this._noise({
      dur: surf === 'water' ? 0.16 : 0.06,
      freq: frequency * (0.9 + Math.random() * 0.2),
      type,
      q: resonance,
      gain,
      pan,
    });
    if (surf === 'metal') {
      this._tone({ from: 1800, to: 1500, dur: 0.05, gain: gain * 0.3, type: 'triangle', pan });
    }
  }
  impact(kind, pan) {
    const file = kind === 'water' ? 'step_water_1' : `impact_${IMPACT_FILES[kind] || 'dirt'}`;
    const loud = kind === 'metal' ? 0.45 : 0.55;
    if (this.sample(file, { gain: loud, pan, rate: vary(0.1) })) {
      return;
    }
    if (kind === 'metal') {
      this._tone({ from: 2600, to: 2100, dur: 0.18, gain: 0.12, type: 'triangle', pan });
      this._noise({ dur: 0.04, freq: 3500, type: 'highpass', q: 1, gain: 0.15, pan });
    } else if (kind === 'concrete') {
      this._noise({ dur: 0.07, freq: 1600, type: 'bandpass', q: 1.2, gain: 0.3, pan });
    } else if (kind === 'wood') {
      this._noise({ dur: 0.06, freq: 800, type: 'bandpass', q: 2.5, gain: 0.3, pan });
    } else if (kind === 'water') {
      this._noise({ dur: 0.2, freq: 1200, type: 'highpass', q: 0.7, gain: 0.2, pan });
    } else {
      this._noise({ dur: 0.08, freq: 420, type: 'lowpass', q: 0.8, gain: 0.32, pan });
    }
  }
  roomEcho(gain = 1) {
    this._noise({
      dur: 0.25,
      freq: 900,
      type: 'bandpass',
      q: 0.6,
      gain: 0.35 * gain,
      attack: 0.01,
    });
    setTimeout(
      () =>
        this._noise({
          dur: 0.35,
          freq: 650,
          type: 'lowpass',
          q: 0.5,
          gain: 0.22 * gain,
          attack: 0.02,
        }),
      70,
    );
  }
  ringing(variant = 1) {
    if (!this.ctx) {
      return;
    }
    this._tone({ from: 3700, to: 3600, dur: 1.8 * variant, gain: 0.028 * variant, type: 'sine' });
    const gain = this.master.gain;
    const currentNow = this.ctx.currentTime;
    const value = Number.isFinite(this.volume) ? this.volume : 0.7;
    const now = Number.isFinite(gain.value) ? Math.min(gain.value, value) : value;
    gain.cancelScheduledValues(currentNow);
    gain.setValueAtTime(now, currentNow);
    gain.linearRampToValueAtTime(value * (1 - 0.45 * Math.min(1, variant)), currentNow + 0.05);
    gain.linearRampToValueAtTime(value, currentNow + 1.6 * variant);
    this.ringUntil = performance.now() + 1700 * variant;
  }

  setListener(panner, filter) {
    if (![panner.x, panner.y, panner.z, filter.x, filter.y, filter.z].every(Number.isFinite)) {
      return;
    }
    super.setListener(panner, filter);
  }

  watchdog() {
    if (!this.ctx || !this.master) {
      return;
    }
    this.ensureRunning();
    this.sweep();
    if (this.meter) {
      this.meter.getFloatTimeDomainData(this.meterBuf);
      let failed = false;
      for (let index = 0; index < this.meterBuf.length; index += 8) {
        if (!Number.isFinite(this.meterBuf[index])) {
          failed = true;
        }
      }
      if (failed) {
        console.warn('[milsim audio] invalid value in the output — rebuilding the audio output');
        for (const value of this.live || []) {
          value.bus.disconnect();
        }
        this.live = [];
        this.master.disconnect();
        this.comp.disconnect();
        this.onPoison?.();
        this.buildOut();
      }
    }
    if (this.ctx.state !== 'running' && !this.warnedState) {
      this.warnedState = true;
      console.warn(
        `[milsim audio] audio context is ${this.ctx.state} — click or press a key to resume`,
      );
    } else if (this.ctx.state === 'running') {
      this.warnedState = false;
    }
    const gain = this.master.gain;
    if (
      performance.now() > (this.ringUntil || 0) &&
      (!Number.isFinite(gain.value) || Math.abs(gain.value - this.volume) > 0.01)
    ) {
      gain.cancelScheduledValues(this.ctx.currentTime);
      gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  stopPanting() {
    const panner = this.panting;
    if (!panner || !this.ctx) {
      return;
    }
    this.panting = null;
    panner.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
    setTimeout(() => {
      try {
        panner.src.stop();
      } catch {}
      panner.out.disconnect();
    }, 2500);
  }

  land() {
    if (!this.sample('land', { gain: 0.5, rate: vary(0.05) })) {
      super.land();
    }
  }
  hurt() {
    if (!this.sample(pickVariant('hurt', 2), { gain: 0.5, rate: vary(0.05) })) {
      super.hurt();
    }
  }
  reloadWeapon(classId, gain = 1, pan = 0) {
    const name =
      classId === 'pistol'
        ? 'reload_pistol'
        : classId === 'mg'
          ? 'reload_mg'
          : classId === 'shotgun'
            ? 'reload_shotgun_shell'
            : 'reload_rifle';
    if (!this.sample(name, { gain: 0.6 * gain, pan })) {
      super.reload(gain, pan);
    }
  }
  reload(gain = 1, pan = 0) {
    this.reloadWeapon('rifle', gain, pan);
  }
  dry() {
    if (!this.sample('dry_fire', { gain: 0.5 })) {
      super.dry();
    }
  }
  draw() {
    if (!this.sample('weapon_draw', { gain: 0.4, rate: vary(0.05) })) {
      super.draw();
    }
  }
  cock() {
    if (!this.sample('fire_mode', { gain: 0.5 })) {
      super.cock();
    }
  }
  throwNade(oscillator = {}) {
    if (
      !this.sample('grenade_throw', {
        gain: 0.5 * (oscillator.gain ?? 1),
        pan: oscillator.pan ?? 0,
      })
    ) {
      super.throwNade(oscillator);
    }
  }
  bounce(oscillator = {}) {
    if (
      !this.sample('grenade_bounce', {
        gain: 0.5 * (oscillator.gain ?? 1),
        pan: oscillator.pan ?? 0,
      })
    ) {
      super.bounce(oscillator);
    }
  }
  pickup() {
    if (!this.sample('pickup_item', { gain: 0.5 })) {
      super.pickup();
    }
  }
  doorBreak(oscillator = {}) {
    if (
      !this.sample('door_break', { gain: 0.7 * (oscillator.gain ?? 1), pan: oscillator.pan ?? 0 })
    ) {
      super.doorBreak(oscillator);
    }
  }
  dig() {
    if (!this.sample(pickVariant('shovel_dig', 2), { gain: 0.55, rate: vary(0.06) })) {
      this._noise({ dur: 0.14, freq: 420, type: 'lowpass', q: 0.7, gain: 0.3 });
    }
  }
  vehicleShot(kind) {
    this.shot(kind);
  }

  starter(kind = 'car') {
    if (this.sample(kind === 'heli' ? 'engine_start_heli' : 'engine_start_car', { gain: 0.5 })) {
      return;
    }
    for (let index = 0; index < 4; index++) {
      setTimeout(
        () =>
          this._noise({ dur: 0.16, freq: 180 + index * 15, type: 'bandpass', q: 2, gain: 0.22 }),
        index * 200,
      );
    }
    this._tone({ from: 40, to: 70, dur: 0.5, gain: 0.25, type: 'sawtooth', delay: 0.85 });
  }
  door(open, vehicle = false) {
    const name = vehicle
      ? open
        ? 'vehicle_door_open'
        : 'vehicle_door_close'
      : open
        ? 'door_open'
        : 'door_close';
    if (this.sample(name, { gain: 0.5, rate: vary(0.04) })) {
      return;
    }
    this._noise({ dur: 0.07, freq: open ? 900 : 600, type: 'bandpass', q: 1.5, gain: 0.25 });
    setTimeout(() => this._noise({ dur: 0.12, freq: 300, type: 'lowpass', gain: 0.22 }), 50);
  }
  thunk() {
    this._noise({ dur: 0.12, freq: 500, type: 'lowpass', gain: 0.25 });
  }
  build() {
    if (this.sample('build_done', { gain: 0.6 })) {
      return;
    }
    this._noise({ dur: 0.08, freq: 1400, type: 'bandpass', q: 1.2, gain: 0.25 });
    this._noise({ dur: 0.1, freq: 700, type: 'lowpass', gain: 0.2, pan: 0 });
  }
  beepUI() {
    this._tone({ from: 880, to: 880, dur: 0.06, gain: 0.08, type: 'square' });
  }
}
