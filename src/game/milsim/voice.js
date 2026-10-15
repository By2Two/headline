const RATE = 12000;
const FRAME = 1200;

function muEncode(positionX) {
  const BIAS = 0x84;
  let sample = Math.max(-1, Math.min(1, positionX)) * 32767;
  const sign = sample < 0 ? 0x80 : 0;
  if (sample < 0) {
    sample = -sample;
  }
  sample = Math.min(32635, sample + BIAS);
  let exponent = 7;
  for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; mask >>= 1) {
    exponent--;
  }
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}
const MU_TABLE = (() => {
  const now = new Float32Array(256);
  for (let index = 0; index < 256; index++) {
    const encoded = ~index & 0xff;
    const sign = encoded & 0x80;
    const exponent = (encoded >> 4) & 0x07;
    const mantissa = encoded & 0x0f;
    let sample = ((mantissa << 3) + 0x84) << exponent;
    sample -= 0x84;
    now[index] = (sign ? -sample : sample) / 32768;
  }
  return now;
})();

export class MilVoice {
  constructor(audio, send) {
    this.audio = audio;
    this.send = send;
    this.ch = null;
    this.stream = null;
    this.denied = false;
    this.streams = new Map();
    this.muted = new Set();
    this.speaking = new Map();
    this.level = 0;
    try {
      const volumes = JSON.parse(localStorage.getItem('headline-milsim-voice') || 'null');
      this.vol = { local: volumes?.local ?? 1, radio: volumes?.radio ?? 1 };
      for (const id of volumes?.muted || []) {
        this.muted.add(id);
      }
    } catch {
      this.vol = { local: 1, radio: 1 };
    }
  }

  saveSettings() {
    try {
      localStorage.setItem(
        'headline-milsim-voice',
        JSON.stringify({ ...this.vol, muted: [...this.muted] }),
      );
    } catch {}
  }

  setVolume(kind, volumes) {
    this.vol[kind] = Math.max(0, Math.min(2, volumes));
    for (const stream of this.streams.values()) {
      stream.vol.gain.value = stream.radio ? this.vol.radio : this.vol.local;
    }
    this.saveSettings();
  }

  toggleMute(id) {
    if (this.muted.has(id)) {
      this.muted.delete(id);
    } else {
      this.muted.add(id);
    }
    this.saveSettings();
  }

  async ensureMic() {
    if (this.stream) {
      return true;
    }
    if (this.denied || !navigator.mediaDevices?.getUserMedia || !this.audio.ctx) {
      return false;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      this.denied = true;
      return false;
    }
    const context = this.audio.ctx;
    const source = context.createMediaStreamSource(this.stream);
    const proc = context.createScriptProcessor(4096, 1, 1);
    this.buf = new Float32Array(FRAME);
    this.bi = 0;
    const ratio = context.sampleRate / RATE;
    let accumulator = 0;
    let sum = 0;
    let count = 0;
    proc.onaudioprocess = (event) => {
      if (!this.ch) {
        return;
      }
      const input = event.inputBuffer.getChannelData(0);
      for (let index = 0; index < input.length; index++) {
        sum += input[index];
        count++;
        accumulator += 1;
        if (accumulator >= ratio) {
          accumulator -= ratio;
          this.buf[this.bi++] = sum / count;
          sum = 0;
          count = 0;
          if (this.bi >= FRAME) {
            this.flush();
          }
        }
      }
    };
    source.connect(proc);
    this.src = source;
    const sink = context.createGain();
    sink.gain.value = 0;
    proc.connect(sink);
    sink.connect(context.destination);
    this.proc = proc;
    return true;
  }

  flush() {
    const count = this.bi;
    if (!count || !this.ch) {
      return;
    }
    let binary = '';
    let sum = 0;
    for (let index = 0; index < count; index++) {
      binary += String.fromCharCode(muEncode(this.buf[index]));
      sum += this.buf[index] * this.buf[index];
    }
    this.bi = 0;
    this.level = Math.sqrt(sum / count);
    this.send({ t: 'vox', ch: this.ch, d: btoa(binary) });
  }

  async start(channel) {
    if (this.ch === channel) {
      return true;
    }
    if (this.ch) {
      this.stop();
    }
    const ok = await this.ensureMic();
    if (!ok) {
      return false;
    }
    this.ch = channel;
    this.bi = 0;
    if (channel !== 'l') {
      this.send({ t: 'voxs', ch: channel, on: 1 });
      this.radioClick(true);
    }
    return true;
  }

  release() {
    if (this.ch) {
      this.stop();
    }
    if (!this.stream) {
      return;
    }
    for (const track of this.stream.getTracks()) {
      track.stop();
    }
    try {
      this.proc?.disconnect();
      this.src?.disconnect();
    } catch {}
    this.stream = null;
    this.proc = null;
    this.src = null;
  }

  stop() {
    this.idleAt = performance.now();
    if (!this.ch) {
      return;
    }
    if (this.bi > 240) {
      this.flush();
    }
    const channel = this.ch;
    this.ch = null;
    this.bi = 0;
    this.level = 0;
    if (channel !== 'l') {
      this.send({ t: 'voxs', ch: channel, on: 0 });
      this.radioClick(false);
    }
  }

  radioClick(on) {
    this.audio._tone?.({
      from: on ? 1900 : 1400,
      to: on ? 1700 : 1100,
      dur: 0.035,
      gain: 0.08,
      type: 'square',
    });
    this.audio._noise?.({ dur: 0.06, freq: 2600, type: 'bandpass', q: 1.5, gain: 0.05 });
  }

  makeStream(key, radio) {
    const context = this.audio.ctx;
    const volume = context.createGain();
    volume.gain.value = radio ? this.vol.radio : this.vol.local;
    const head = volume;
    const stream = { key, radio, vol: volume, next: 0, pos: null, id: 0, lp: null, panner: null };
    if (radio) {
      const health = context.createBiquadFilter();
      health.type = 'highpass';
      health.frequency.value = 420;
      const lowpass = context.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 2900;
      const shaper = context.createWaveShaper();
      const curve = new Float32Array(256);
      for (let index = 0; index < 256; index++) {
        const positionX = (index / 255) * 2 - 1;
        curve[index] = Math.tanh(positionX * 2.2) / Math.tanh(2.2);
      }
      shaper.curve = curve;
      const gain = context.createGain();
      gain.gain.value = 1.3;
      head.connect(health);
      health.connect(shaper);
      shaper.connect(lowpass);
      lowpass.connect(gain);
      gain.connect(this.audio.master);
      const noiseSource = context.createBufferSource();
      noiseSource.buffer = this.audio.longNoise?.() || null;
      noiseSource.loop = true;
      const noiseFilter = context.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 1800;
      noiseFilter.Q.value = 0.7;
      const noiseGain = context.createGain();
      noiseGain.gain.value = 0;
      if (noiseSource.buffer) {
        noiseSource.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.audio.master);
        noiseSource.start();
      }
      stream.noise = noiseGain;
      stream.noiseSrc = noiseSource;
    } else {
      const lowpass = context.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 16000;
      const panner = context.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'linear';
      panner.refDistance = 4;
      panner.maxDistance = 50;
      panner.rolloffFactor = 1;
      head.connect(lowpass);
      lowpass.connect(panner);
      panner.connect(this.audio.master);
      stream.lp = lowpass;
      stream.panner = panner;
    }
    this.streams.set(key, stream);
    return stream;
  }

  onVox(mask) {
    const context = this.audio.ctx;
    if (!context || this.muted.has(mask.i) || typeof mask.d !== 'string') {
      return;
    }
    const radio = mask.ch !== 'l';
    const key = `${mask.i}:${radio ? 'r' : 'l'}`;
    const stream = this.streams.get(key) || this.makeStream(key, radio);
    stream.id = mask.i;
    stream.lastAt = performance.now();
    if (mask.p) {
      stream.pos = mask.p;
    }
    let binary;
    try {
      binary = atob(mask.d);
    } catch {
      return;
    }
    const count = binary.length;
    if (!count) {
      return;
    }
    const buffer = context.createBuffer(1, count, RATE);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < count; index++) {
      data[index] = MU_TABLE[binary.charCodeAt(index) & 0xff];
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(stream.vol);
    const now = context.currentTime;
    if (stream.next < now + 0.04) {
      stream.next = now + 0.12;
    }
    source.start(stream.next);
    stream.next += buffer.duration;
    if (stream.noise) {
      stream.noise.gain.setTargetAtTime(0.018 * this.vol.radio, now, 0.05);
    }
    this.speaking.set(key, {
      n: mask.n || '',
      ch: mask.ch,
      sq: mask.sq || '',
      until: performance.now() + 350 + (stream.next - now) * 1000,
    });
  }

  onVoxState(mask) {
    if (this.muted.has(mask.i)) {
      return;
    }
    this.radioClick(!!mask.on);
    const stream = this.streams.get(`${mask.i}:r`);
    if (!mask.on && stream?.noise) {
      stream.noise.gain.setTargetAtTime(0, this.audio.ctx.currentTime + 0.2, 0.08);
    }
  }

  update(headOf, occluded) {
    const context = this.audio.ctx;
    if (!context) {
      return;
    }
    const currentNow = context.currentTime;
    for (const stream of this.streams.values()) {
      if (stream.radio) {
        if (stream.noise && stream.next < currentNow - 0.3) {
          stream.noise.gain.setTargetAtTime(0, currentNow, 0.1);
        }
        continue;
      }
      const headPosition = headOf(stream.id) || stream.pos;
      if (!headPosition) {
        continue;
      }
      stream.pos = headPosition;
      if (stream.panner.positionX) {
        stream.panner.positionX.setTargetAtTime(headPosition[0], currentNow, 0.05);
        stream.panner.positionY.setTargetAtTime(headPosition[1], currentNow, 0.05);
        stream.panner.positionZ.setTargetAtTime(headPosition[2], currentNow, 0.05);
      } else {
        stream.panner.setPosition(headPosition[0], headPosition[1], headPosition[2]);
      }
      stream.lp.frequency.setTargetAtTime(occluded(headPosition) ? 1100 : 16000, currentNow, 0.15);
    }
    const now = performance.now();
    for (const [key, sample] of this.speaking) {
      if (now > sample.until) {
        this.speaking.delete(key);
      }
    }
    for (const [key, stream] of this.streams) {
      if (now - (stream.lastAt || 0) > 30000) {
        this.dropStream(key, stream);
      }
    }
    if (!this.ch && this.stream && now - (this.idleAt || 0) > 15000) {
      this.release();
    }
  }

  dropStream(key, stream) {
    try {
      stream.noiseSrc?.stop();
    } catch {}
    stream.vol.disconnect();
    stream.noise?.disconnect();
    stream.panner?.disconnect();
    this.streams.delete(key);
  }

  resetStreams() {
    for (const [key, stream] of this.streams) {
      this.dropStream(key, stream);
    }
  }

  activeList() {
    return [...this.speaking.values()].map((sample) => ({
      n: sample.n,
      ch: sample.ch,
      sq: sample.sq,
    }));
  }
}
