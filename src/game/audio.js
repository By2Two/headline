import { WEAPONS } from '../../shared/weapons.js';

const SAMPLE_DIR = `${import.meta.env.BASE_URL}sounds/sfx/`;
const NORMALIZE_PEAK = 0.9;
const NORMALIZE_MAX_GAIN = 30;
function normalize(buffer) {
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index++) {
      const sample = Math.abs(data[index]);
      if (sample > peak) {
        peak = sample;
      }
    }
  }
  if (peak <= 0) {
    return buffer;
  }
  const gain = Math.min(NORMALIZE_MAX_GAIN, NORMALIZE_PEAK / peak);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index++) {
      data[index] *= gain;
    }
  }
  return buffer;
}
export const pickVariant = (base, variants) =>
  `${base}_${1 + Math.floor(Math.random() * variants)}`;
export const vary = (amount = 0.05) => 1 + (Math.random() - 0.5) * 2 * amount;
const SHOT_BY_CLASS = {
  rifle: 'shot_rifle',
  smg: 'shot_smg',
  sniper: 'shot_scout',
  pistol: 'shot_pistol',
  shotgun: 'shot_shotgun',
  mg: 'shot_m249',
};
const SILENCED_BY_CLASS = {
  pistol: 'shot_silenced_pistol',
  sniper: 'shot_silenced_sniper',
  smg: 'shot_silenced_smg',
};
const BASE_PRELOAD = [
  'shot_rifle',
  'shot_m4a4',
  'shot_awp',
  'shot_glock',
  'shot_usp',
  'shot_deagle',
  'shot_silenced_rifle',
  'shot_silenced_pistol',
  'step_concrete_1',
  'step_concrete_2',
  'step_concrete_3',
  'land',
  'reload_rifle',
  'weapon_draw',
  'dry_fire',
  'hurt_1',
  'hurt_2',
  'explosion_grenade',
];

const CLASS_SOUND = {
  pistol: { f: 3600, d: 0.11, lo: 150 },
  smg: { f: 3600, d: 0.09, lo: 150 },
  rifle: { f: 2800, d: 0.16, lo: 110 },
  sniper: { f: 1900, d: 0.34, lo: 72 },
  shotgun: { f: 1600, d: 0.32, lo: 60 },
  mg: { f: 2500, d: 0.15, lo: 95 },
};
export class GameAudio {
  constructor(volume = 0.7) {
    this.volume = volume;
    this.ctx = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }
    this.ctx = new AudioContextClass();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    const length = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const channelData = buffer.getChannelData(0);
    for (let index = 0; index < length; index++) {
      channelData[index] = Math.random() * 2 - 1;
    }
    this.noise = buffer;
    this.samples = new Map();
    for (const name of [...BASE_PRELOAD, ...this.preloadList()]) {
      this.loadSample(name);
    }
  }

  preloadList() {
    return [];
  }

  loadSample(name) {
    if (!this.ctx || !this.samples) {
      return null;
    }
    if (this.samples.has(name)) {
      return this.samples.get(name);
    }
    const entry = { buffer: null, failed: false };
    this.samples.set(name, entry);
    fetch(`${SAMPLE_DIR}${name}.mp3`)
      .then((result) =>
        result.ok ? result.arrayBuffer() : Promise.reject(new Error(result.status)),
      )
      .then((data) => this.ctx.decodeAudioData(data))
      .then((buffer) => {
        entry.buffer = normalize(buffer);
      })
      .catch(() => {
        entry.failed = true;
      });
    return entry;
  }

  bufferOf(name) {
    return this.loadSample(name)?.buffer || null;
  }

  sample(name, { gain = 1, pan = 0, rate = 1 } = {}) {
    const buffer = this.bufferOf(name);
    if (!buffer || !this.ctx) {
      return false;
    }
    const gainNode = Number.isFinite(gain) ? gain : 0;
    if (gainNode < 0.003) {
      return true;
    }
    const run = () => {
      const context = this.ctx;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = Number.isFinite(rate) ? rate : 1;
      const amplitude = context.createGain();
      amplitude.gain.value = Math.min(1.5, gainNode);
      source.connect(amplitude);
      amplitude.connect(this._out(pan));
      source.start();
    };
    if (this.play) {
      this.play(
        { gain: gainNode },
        buffer.duration / Math.max(0.25, rate) + (pan?.delay || 0),
        run,
      );
    } else {
      run();
    }
    return true;
  }

  shotFile(id) {
    const weaponDefinition = WEAPONS.find((weapon) => weapon.id === id);
    if (weaponDefinition?.silenced || id === 'm4') {
      return SILENCED_BY_CLASS[weaponDefinition?.class] || 'shot_silenced_rifle';
    }
    const own = `shot_${id}`;
    if (this.bufferOf(own) || !this.samples?.get(own)?.failed) {
      return own;
    }
    return SHOT_BY_CLASS[weaponDefinition?.class] || 'shot_rifle';
  }

  setVolume(sample) {
    this.volume = sample;
    if (this.master) {
      this.master.gain.value = sample;
    }
  }

  setListener(panner, filter) {
    if (!this.ctx) {
      return;
    }
    const listener = this.ctx.listener;
    const now = this.ctx.currentTime;
    if (listener.positionX) {
      listener.positionX.setValueAtTime(panner.x, now);
      listener.positionY.setValueAtTime(panner.y, now);
      listener.positionZ.setValueAtTime(panner.z, now);
      listener.forwardX.setValueAtTime(filter.x, now);
      listener.forwardY.setValueAtTime(filter.y, now);
      listener.forwardZ.setValueAtTime(filter.z, now);
      listener.upX.setValueAtTime(0, now);
      listener.upY.setValueAtTime(1, now);
      listener.upZ.setValueAtTime(0, now);
    } else {
      listener.setPosition(panner.x, panner.y, panner.z);
      listener.setOrientation(filter.x, filter.y, filter.z, 0, 1, 0);
    }
  }

  _out(pan) {
    if (pan && typeof pan === 'object') {
      const context = this.ctx;
      const panner = context.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 4;
      panner.rolloffFactor = 0.9;
      panner.maxDistance = 150;
      const [positionX, positionY, positionZ] = pan.pos;
      if (panner.positionX) {
        panner.positionX.value = positionX;
        panner.positionY.value = positionY;
        panner.positionZ.value = positionZ;
      } else {
        panner.setPosition(positionX, positionY, positionZ);
      }
      panner.connect(this.master);
      if (!pan.muffled) {
        return panner;
      }
      const lowpass = context.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 750;
      lowpass.Q.value = 0.7;
      lowpass.connect(panner);
      return lowpass;
    }
    if (!pan || !this.ctx.createStereoPanner) {
      return this.master;
    }
    const currentPanner = this.ctx.createStereoPanner();
    currentPanner.pan.value = Math.max(-1, Math.min(1, pan));
    currentPanner.connect(this.master);
    return currentPanner;
  }

  _noise({
    dur: duration = 0.1,
    freq: frequency = 2000,
    type = 'lowpass',
    q: resonance = 0.7,
    gain = 0.5,
    pan = 0,
    attack = 0.002,
  }) {
    if (!this.ctx) {
      return;
    }
    const context = this.ctx;
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = resonance;
    const gainNode = context.createGain();
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(gain, now + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this._out(pan));
    source.start(now, Math.random() * 0.5);
    source.stop(now + duration + 0.05);
  }

  _tone({
    from = 440,
    to: toFrequency = 440,
    dur: duration = 0.1,
    gain = 0.3,
    type = 'sine',
    pan = 0,
    delay = 0,
  }) {
    if (!this.ctx) {
      return;
    }
    const context = this.ctx;
    const now = context.currentTime + delay;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, toFrequency), now + duration);
    const gainNode = context.createGain();
    gainNode.gain.setValueAtTime(gain, now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gainNode);
    gainNode.connect(this._out(pan));
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  shot(id, { gain = 1, pan = 0 } = {}) {
    const weaponDefinition = WEAPONS.find((weapon) => weapon.id === id);
    if (this.sample(this.shotFile(id), { gain: 0.9 * gain, pan, rate: vary(0.04) })) {
      if (id === 'shotgun' || id === 'sawedoff') {
        setTimeout(() => this.pump(gain, pan), 230);
      }
      return;
    }
    if (weaponDefinition?.silenced) {
      const pitchBoost = weaponDefinition.class === 'pistol' ? 1.4 : 1;
      this._noise({
        dur: 0.08,
        freq: 1300 * pitchBoost,
        type: 'lowpass',
        q: 0.8,
        gain: 0.45 * gain,
        pan,
        attack: 0.004,
      });
      this._noise({
        dur: 0.05,
        freq: 2200 * pitchBoost,
        type: 'bandpass',
        q: 0.9,
        gain: 0.12 * gain,
        pan,
      });
      this._tone({
        from: 240 * pitchBoost,
        to: 90 * pitchBoost,
        dur: 0.07,
        gain: 0.3 * gain,
        type: 'sine',
        pan,
      });
      return;
    }
    if (id === 'm4') {
      this._noise({
        dur: 0.08,
        freq: 1300,
        type: 'lowpass',
        q: 0.8,
        gain: 0.45 * gain,
        pan,
        attack: 0.004,
      });
      this._noise({
        dur: 0.05,
        freq: 2200,
        type: 'bandpass',
        q: 0.9,
        gain: 0.12 * gain,
        pan,
      });
      this._tone({
        from: 240,
        to: 90,
        dur: 0.07,
        gain: 0.3 * gain,
        type: 'sine',
        pan,
      });
      return;
    }
    const currentGain = {
      rifle: { f: 2800, d: 0.16, lo: 110 },
      smg: { f: 3800, d: 0.09, lo: 150 },
      awp: { f: 1800, d: 0.4, lo: 70 },
      scout: { f: 2200, d: 0.28, lo: 85 },
      pistol: { f: 3800, d: 0.1, lo: 160 },
      deagle: { f: 2300, d: 0.2, lo: 90 },
      shotgun: { f: 1600, d: 0.32, lo: 60 },
      r8: { f: 2000, d: 0.28, lo: 72 },
    }[id] ||
      CLASS_SOUND[weaponDefinition?.class] || { f: 2800, d: 0.15, lo: 110 };
    this._noise({ dur: currentGain.d, freq: currentGain.f, gain: 0.8 * gain, pan });
    this._tone({
      from: currentGain.lo * 1.6,
      to: currentGain.lo * 0.4,
      dur: currentGain.d,
      gain: 0.7 * gain,
      type: 'triangle',
      pan,
    });
    if (id === 'awp') {
      this._noise({ dur: 0.9, freq: 500, gain: 0.5 * gain, pan });
    }
    if (weaponDefinition?.class === 'sniper' && id !== 'awp' && id !== 'scout') {
      this._noise({ dur: 0.45, freq: 600, gain: 0.3 * gain, pan });
    }
    if (weaponDefinition?.pellets && weaponDefinition.id !== 'shotgun') {
      this._noise({ dur: 0.4, freq: 450, gain: 0.4 * gain, pan });
    }
    if (id === 'shotgun' || id === 'sawedoff') {
      this._noise({ dur: 0.5, freq: 450, gain: 0.45 * gain, pan });
      setTimeout(() => this.pump(gain, pan), 230);
    }
    if (id === 'scout') {
      this._noise({ dur: 0.5, freq: 650, gain: 0.35 * gain, pan });
    }
  }

  headshotKill() {
    this._tone({ from: 2400, to: 2200, dur: 0.18, gain: 0.22, type: 'sine' });
    this._tone({ from: 3600, to: 3300, dur: 0.12, gain: 0.12, type: 'sine', delay: 0.02 });
    this._noise({ dur: 0.06, freq: 4000, type: 'highpass', gain: 0.25 });
    this._tone({ from: 900, to: 900, dur: 0.08, gain: 0.15, type: 'square', delay: 0.12 });
  }

  noscopeKill() {
    [660, 880, 1100, 1320].forEach((filter, index) =>
      this._tone({
        from: filter,
        to: filter * 1.02,
        dur: 0.12,
        gain: 0.16,
        type: 'triangle',
        delay: index * 0.07,
      }),
    );
    this._noise({ dur: 0.35, freq: 2500, type: 'bandpass', q: 0.8, gain: 0.12, attack: 0.05 });
  }

  levelUp() {
    [523, 784, 1047].forEach((filter, index) =>
      this._tone({
        from: filter,
        to: filter,
        dur: 0.14,
        gain: 0.14,
        type: 'square',
        delay: index * 0.07,
      }),
    );
  }

  pin() {
    this._tone({ from: 2400, to: 1800, dur: 0.05, gain: 0.15, type: 'triangle' });
    this._noise({ dur: 0.06, freq: 4000, type: 'highpass', gain: 0.12, delay: 0 });
  }

  throwNade({ gain = 1, pan = 0 } = {}) {
    if (this.sample('grenade_throw', { gain: 0.5 * gain, pan })) {
      return;
    }
    this._noise({
      dur: 0.22,
      freq: 1400,
      type: 'bandpass',
      q: 0.8,
      gain: 0.25 * gain,
      pan,
      attack: 0.04,
    });
  }

  bounce({ gain = 1, pan = 0 } = {}) {
    if (this.sample('grenade_bounce', { gain: 0.5 * gain, pan, rate: vary(0.08) })) {
      return;
    }
    this._tone({ from: 1700, to: 1300, dur: 0.05, gain: 0.18 * gain, type: 'triangle', pan });
    this._noise({ dur: 0.04, freq: 3000, type: 'highpass', gain: 0.12 * gain, pan });
  }

  heBoom({ gain = 1, pan = 0 } = {}) {
    if (this.sample('explosion_grenade', { gain: gain, pan, rate: vary(0.05) })) {
      return;
    }
    this._noise({ dur: 1.1, freq: 700, type: 'lowpass', gain: 1.0 * gain, pan, attack: 0.003 });
    this._noise({ dur: 0.3, freq: 2400, type: 'lowpass', gain: 0.6 * gain, pan });
    this._tone({ from: 120, to: 35, dur: 0.8, gain: 0.6 * gain, type: 'sine', pan });
  }

  smokePop({ gain = 1, pan = 0 } = {}) {
    this._noise({ dur: 2.4, freq: 2600, type: 'highpass', gain: 0.35 * gain, pan, attack: 0.05 });
    this._noise({ dur: 0.15, freq: 600, type: 'lowpass', gain: 0.3 * gain, pan });
  }

  error() {
    this._tone({ from: 180, to: 160, dur: 0.12, gain: 0.25, type: 'square' });
    this._tone({ from: 180, to: 160, dur: 0.12, gain: 0.25, type: 'square', delay: 0.15 });
  }

  plantKey(currentGain = 1, { gain = 1, pan = 0 } = {}) {
    this._tone({
      from: 1300 + (currentGain % 3) * 160,
      to: 1300 + (currentGain % 3) * 160,
      dur: 0.07,
      gain: 0.18 * gain,
      type: 'square',
      pan,
    });
  }

  bombBeep({ gain = 1, pan = 0 } = {}, urgent = false) {
    this._tone({
      from: urgent ? 2300 : 1900,
      to: urgent ? 2300 : 1900,
      dur: 0.09,
      gain: 0.35 * gain,
      type: 'sine',
      pan,
    });
  }

  planted() {
    for (let index = 0; index < 3; index++) {
      this._tone({
        from: 880,
        to: 880,
        dur: 0.12,
        gain: 0.22,
        type: 'square',
        delay: index * 0.16,
      });
    }
  }

  defuseTick({ gain = 1, pan = 0 } = {}) {
    this._noise({ dur: 0.05, freq: 3500, type: 'bandpass', q: 3, gain: 0.25 * gain, pan });
    this._tone({ from: 900, to: 700, dur: 0.04, gain: 0.08 * gain, type: 'square', pan });
  }

  defuseStart({ gain = 1, pan = 0 } = {}) {
    this._noise({ dur: 0.18, freq: 3200, type: 'bandpass', q: 2, gain: 0.3 * gain, pan });
    this._tone({ from: 600, to: 900, dur: 0.15, gain: 0.15 * gain, type: 'triangle', pan });
  }

  defused() {
    this._tone({ from: 700, to: 1400, dur: 0.35, gain: 0.3, type: 'triangle' });
    this._tone({ from: 1400, to: 1400, dur: 0.3, gain: 0.2, type: 'sine', delay: 0.3 });
  }

  explosion({ gain = 1, pan = 0 } = {}) {
    if (this.sample('explosion_big', { gain: 1.1 * gain, pan })) {
      return;
    }
    this._noise({ dur: 2.2, freq: 500, type: 'lowpass', gain: 1.1 * gain, pan, attack: 0.005 });
    this._noise({ dur: 0.6, freq: 2000, type: 'lowpass', gain: 0.7 * gain, pan });
    this._tone({ from: 90, to: 28, dur: 1.6, gain: 0.8 * gain, type: 'sine', pan });
  }

  drop({ gain = 1, pan = 0 } = {}) {
    this._noise({ dur: 0.1, freq: 900, type: 'lowpass', gain: 0.4 * gain, pan });
  }

  cash() {
    this._tone({ from: 1500, to: 1500, dur: 0.06, gain: 0.12, type: 'triangle' });
    this._tone({ from: 2000, to: 2000, dur: 0.08, gain: 0.1, type: 'triangle', delay: 0.07 });
  }

  pickup() {
    if (this.sample('pickup_item', { gain: 0.5 })) {
      return;
    }
    this._tone({ from: 500, to: 800, dur: 0.12, gain: 0.2, type: 'triangle' });
  }

  roundStart() {
    this._tone({ from: 440, to: 440, dur: 0.12, gain: 0.15, type: 'triangle' });
  }

  go() {
    this._tone({ from: 660, to: 990, dur: 0.18, gain: 0.2, type: 'triangle' });
  }

  roundEnd(won) {
    const notes = won ? [523, 659, 784] : [392, 330, 262];
    notes.forEach((filter, index) =>
      this._tone({
        from: filter,
        to: filter,
        dur: 0.25,
        gain: 0.22,
        type: 'triangle',
        delay: index * 0.15,
      }),
    );
  }

  doorBreak({ gain = 1, pan = 0 } = {}) {
    if (this.sample('door_break', { gain: 0.7 * gain, pan })) {
      return;
    }
    this._noise({ dur: 0.35, freq: 900, type: 'lowpass', gain: 0.6 * gain, pan });
    this._noise({ dur: 0.18, freq: 2600, type: 'bandpass', q: 1.5, gain: 0.35 * gain, pan });
    this._tone({ from: 160, to: 60, dur: 0.25, gain: 0.35 * gain, type: 'triangle', pan });
  }

  spin(duration = 0.4) {
    this._tone({ from: 90, to: 260, dur: duration + 0.05, gain: 0.12, type: 'sawtooth' });
    this._noise({
      dur: duration + 0.05,
      freq: 900,
      type: 'bandpass',
      q: 2,
      gain: 0.08,
      attack: duration * 0.6,
    });
  }

  tick() {
    this.init();
    this._tone({ from: 1800, to: 1500, dur: 0.025, gain: 0.08, type: 'square' });
  }

  reveal(amount = 0) {
    const notes = [523, 659, 784, 1047, 1319].slice(0, 2 + amount);
    notes.forEach((filter, index) =>
      this._tone({
        from: filter,
        to: filter,
        dur: 0.22,
        gain: 0.14,
        type: 'triangle',
        delay: index * 0.09,
      }),
    );
    if (amount >= 3) {
      this._noise({ dur: 0.8, freq: 3500, type: 'bandpass', q: 0.6, gain: 0.12, attack: 0.1 });
    }
  }

  cock() {
    this._noise({ dur: 0.03, freq: 3200, type: 'bandpass', q: 4, gain: 0.25 });
    setTimeout(
      () => this._noise({ dur: 0.04, freq: 2100, type: 'bandpass', q: 4, gain: 0.3 }),
      260,
    );
  }

  pump(gain = 1, pan = 0) {
    if (this.sample('shotgun_pump', { gain: 0.5 * gain, pan })) {
      return;
    }
    this._noise({ dur: 0.05, freq: 1400, type: 'bandpass', q: 2.5, gain: 0.4 * gain, pan });
    setTimeout(
      () =>
        this._noise({ dur: 0.06, freq: 1100, type: 'bandpass', q: 2.5, gain: 0.45 * gain, pan }),
      170,
    );
  }

  knife({ gain = 1, pan = 0 } = {}, id = 'knife', heavy = false) {
    const currentGain = {
      knife: [3200, 0.14],
      machete: [2500, 0.18],
      axe: [1500, 0.26],
      katana: [4000, 0.2],
    }[id] || [3200, 0.14];
    this._noise({
      dur: currentGain[1],
      freq: currentGain[0],
      type: 'bandpass',
      q: 1.2,
      gain: 0.4 * gain,
      pan,
      attack: 0.04,
    });
    if (heavy) {
      this._tone({
        from: 260,
        to: 90,
        dur: 0.18,
        gain: 0.25 * gain,
        type: 'triangle',
        pan,
        delay: 0.05,
      });
    }
  }

  chat() {
    this._tone({ from: 880, to: 880, dur: 0.06, gain: 0.08, type: 'sine' });
  }

  hit(head) {
    this._tone({
      from: head ? 1900 : 1300,
      to: head ? 1500 : 1000,
      dur: 0.07,
      gain: 0.25,
      type: 'square',
    });
    if (head) {
      this._noise({ dur: 0.08, freq: 3000, type: 'highpass', gain: 0.3 });
    }
  }

  kill() {
    this._tone({ from: 900, to: 900, dur: 0.08, gain: 0.2, type: 'square' });
    this._tone({
      from: 1350,
      to: 1350,
      dur: 0.12,
      gain: 0.2,
      type: 'square',
      delay: 0.08,
    });
  }

  hurt() {
    if (this.sample(pickVariant('hurt', 2), { gain: 0.5, rate: vary(0.05) })) {
      return;
    }
    this._tone({ from: 160, to: 60, dur: 0.18, gain: 0.6, type: 'sine' });
    this._noise({ dur: 0.1, freq: 600, gain: 0.3 });
  }

  step(gain = 0.25, pan = 0) {
    if (this.sample(pickVariant('step_concrete', 3), { gain: gain * 1.4, pan, rate: vary(0.06) })) {
      return;
    }
    this._noise({ dur: 0.07, freq: 500 + Math.random() * 200, gain, pan });
  }

  land() {
    if (this.sample('land', { gain: 0.5, rate: vary(0.05) })) {
      return;
    }
    this._noise({ dur: 0.12, freq: 350, gain: 0.35 });
  }

  reload(gain = 1, pan = 0) {
    if (this.sample('reload_rifle', { gain: 0.6 * gain, pan })) {
      return;
    }
    this._noise({ dur: 0.04, freq: 2500, type: 'bandpass', q: 3, gain: 0.35 * gain, pan });
    this._noise({ dur: 0.05, freq: 1800, type: 'bandpass', q: 3, gain: 0.4 * gain, pan });
  }

  reloadEnd() {
    this._noise({ dur: 0.05, freq: 1500, type: 'bandpass', q: 3, gain: 0.45 });
  }

  dry() {
    if (this.sample('dry_fire', { gain: 0.5 })) {
      return;
    }
    this._noise({ dur: 0.03, freq: 3000, type: 'bandpass', q: 5, gain: 0.3 });
  }

  draw() {
    if (this.sample('weapon_draw', { gain: 0.4, rate: vary(0.05) })) {
      return;
    }
    this._noise({ dur: 0.06, freq: 2200, type: 'bandpass', q: 2, gain: 0.25 });
  }
}
