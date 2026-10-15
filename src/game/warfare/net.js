import { Net } from '../net.js';

const lerp = (from, to, amount) => from + (to - from) * amount;
const wrapA = (difference) =>
  ((((difference + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
const lerpAngle = (from, to, amount) => from + wrapA(to - from) * amount;
const BUF = 10;
const MAX_EXTRA = 0.6;

function sampleAt(buffer, renderTime) {
  const count = buffer.length;
  if (count === 1 || renderTime <= buffer[0].time) {
    return { a: buffer[0], b: buffer[0], f: 0 };
  }
  for (let index = count - 1; index > 0; index--) {
    const olderSample = buffer[index - 1];
    const newerSample = buffer[index];
    if (renderTime >= olderSample.time && renderTime <= newerSample.time) {
      return {
        a: olderSample,
        b: newerSample,
        f: (renderTime - olderSample.time) / Math.max(1, newerSample.time - olderSample.time),
      };
    }
  }
  const secondLastSample = buffer[count - 2];
  const lastSample = buffer[count - 1];
  const span = Math.max(1, lastSample.time - secondLastSample.time);
  const over = Math.min(renderTime - lastSample.time, MAX_EXTRA * 1000, span * 1.5);
  return { a: secondLastSample, b: lastSample, f: 1 + over / span };
}

export class MilNet extends Net {
  constructor(...sample) {
    super(...sample);
    this.resetState();
  }

  resetState() {
    this.ents = new Map();
    this.vehs = new Map();
    this.plist = [];
    this.listDirty = true;
    this.rx = 0;
  }

  close() {
    super.close();
    this.resetState();
  }

  connect(join, server) {
    super.connect(join, server);
    const socket = this.ws;
    const previous = socket.onmessage;
    socket.onmessage = (event) => {
      this.rx += typeof event.data === 'string' ? event.data.length : event.data.byteLength || 0;
      previous(event);
    };
  }

  send(object) {
    if (this.ws && this.ws.readyState === 1) {
      const text = JSON.stringify(object);
      this.tx = (this.tx || 0) + text.length;
      this.ws.send(text);
    }
  }

  ent(id) {
    let entity = this.ents.get(id);
    if (!entity) {
      entity = { ro: null, buf: [], err: [0, 0, 0], last: null };
      this.ents.set(id, entity);
      this.listDirty = true;
    }
    return entity;
  }

  onRoster(message) {
    if (message.all) {
      for (const id of this.ents.keys()) {
        if (!message.l.some((row) => row[0] === id)) {
          this.ents.delete(id);
        }
      }
      this.listDirty = true;
    }
    for (const row of message.l || []) {
      this.ent(row[0]).ro = row;
    }
    for (const id of message.rm || []) {
      this.ents.delete(id);
      this.listDirty = true;
    }
    this.rebuildList();
  }

  onSnap(message) {
    if (!message.P) {
      return super.onSnap(message);
    }
    if (!this.hasOffset) {
      this.offset = message.time - performance.now() + 20;
      this.hasOffset = true;
    }
    const amount = message.time;
    for (const row of message.P) {
      const entity = this.ent(row[0]);
      const flags = row[6];
      const sample = {
        time: amount,
        x: row[1] / 100,
        y: row[2] / 100,
        z: row[3] / 100,
        yaw: row[4] / 1000,
        pitch: row[5] / 1000,
        fl: flags,
        hp: row[7],
        w: row[8],
        lean: row[9] / 100,
        veh: row[10],
        seat: row[11],
        mount: row[12],
        s: row[13],
      };
      const keep =
        entity.last && entity.buf.length && entity.buf[entity.buf.length - 1].s === sample.s;
      entity.buf.push(sample);
      if (keep) {
        const position = this.posAt(entity, entity.last.rt);
        const errorX = entity.last.x - position.x;
        const errorY = entity.last.y - position.y;
        const errorZ = entity.last.z - position.z;
        entity.err =
          errorX * errorX + errorY * errorY + errorZ * errorZ < 9
            ? [errorX, errorY, errorZ]
            : [0, 0, 0];
      } else {
        entity.err = [0, 0, 0];
      }
      if (entity.buf.length > BUF) {
        entity.buf.shift();
      }
      entity.cur = sample;
    }
    for (const vehicleRow of message.V || []) {
      let entity = this.vehs.get(vehicleRow[0]);
      if (!entity) {
        this.vehs.set(vehicleRow[0], (entity = { buf: [] }));
      }
      vehicleRow.time = amount;
      entity.buf.push(vehicleRow);
      if (entity.buf.length > BUF) {
        entity.buf.shift();
      }
    }
    for (const id of message.vr || []) {
      this.vehs.delete(id);
    }
    if (message.va) {
      for (const id of this.vehs.keys()) {
        if (!message.va.includes(id)) {
          this.vehs.delete(id);
        }
      }
    }
    this.rebuildList();
    message.players = this.plist;
    this.onMessage(message);
  }

  rebuildList() {
    if (this.listDirty) {
      this.plist = [];
      this.listDirty = false;
    }
    const out = this.plist;
    out.length = 0;
    for (const [id, entity] of this.ents) {
      if (!entity.ro || !entity.cur) {
        continue;
      }
      const roster = entity.ro;
      const current = entity.cur;
      out.push({
        i: id,
        n: roster[1],
        tm: roster[2],
        k: roster[3],
        d: roster[4],
        lk: roster[5],
        b: roster[8] ? 1 : 0,
        rk: roster[9] || 0,
        hp: current.hp,
        a: current.fl & 16384 ? 1 : 0,
        s: current.s,
        w: current.w,
        p: [current.x, current.y, current.z],
      });
    }
  }

  posAt(entity, renderTime) {
    const { a: older, b: newer, f: fraction } = sampleAt(entity.buf, renderTime);
    if (older.s !== newer.s) {
      return { x: newer.x, y: newer.y, z: newer.z };
    }
    return {
      x: lerp(older.x, newer.x, fraction),
      y: lerp(older.y, newer.y, fraction),
      z: lerp(older.z, newer.z, fraction),
    };
  }

  interpolate(renderTime, exceptId) {
    const out = [];
    const now = performance.now();
    for (const [id, entity] of this.ents) {
      if (id === exceptId || !entity.ro || !entity.buf.length) {
        continue;
      }
      const { a: older, b: newer, f: fraction } = sampleAt(entity.buf, renderTime);
      const same = older.s === newer.s;
      const blend = same ? fraction : 1;
      const factor = Math.min(blend, 1);
      let positionX = lerp(older.x, newer.x, blend);
      let positionY = lerp(older.y, newer.y, blend);
      let positionZ = lerp(older.z, newer.z, blend);
      if (blend > 1 && (newer.veh || !(newer.fl & 16384))) {
        positionX = newer.x;
        positionY = newer.y;
        positionZ = newer.z;
      }
      const deltaTime = entity.last ? Math.min(0.1, (now - entity.last.at) / 1000) : 0;
      const smoothing = Math.exp(-deltaTime * 9);
      entity.err[0] *= smoothing;
      entity.err[1] *= smoothing;
      entity.err[2] *= smoothing;
      positionX += entity.err[0];
      positionY += entity.err[1];
      positionZ += entity.err[2];
      entity.last = { x: positionX, y: positionY, z: positionZ, rt: renderTime, at: now };
      const roster = entity.ro;
      const flags = newer.fl;
      out.push({
        i: id,
        n: roster[1],
        tm: roster[2],
        k: roster[3],
        d: roster[4],
        lk: roster[5],
        b: roster[8] ? 1 : 0,
        rk: roster[9] || 0,
        x: positionX,
        y: positionY,
        z: positionZ,
        yaw: same ? lerpAngle(older.yaw, newer.yaw, factor) : newer.yaw,
        pitch: same ? lerp(older.pitch, newer.pitch, factor) : newer.pitch,
        c: flags & 2048 ? 1 : 0,
        ad: flags & 4096 ? 1 : 0,
        rl: flags & 8192 ? 1 : 0,
        a: flags & 16384 ? 1 : 0,
        hp: newer.hp,
        w: newer.w,
        s: newer.s,
        xm: [
          same ? lerp(older.lean, newer.lean, factor) : newer.lean,
          newer.veh,
          newer.seat,
          roster[6],
          flags & 2047,
          newer.mount,
          roster[7],
        ],
      });
    }
    return out;
  }

  interpolateVeh(renderTime) {
    const out = [];
    for (const entity of this.vehs.values()) {
      const { a: older, b: newer, f: fraction } = sampleAt(entity.buf, renderTime);
      const blend = Math.min(fraction, 1.5);
      const clampedFraction = Math.min(fraction, 1);
      out.push({
        id: newer[0],
        type: newer[1],
        team: newer[2],
        x: lerp(older[3], newer[3], blend) / 100,
        y: lerp(older[4], newer[4], blend) / 100,
        z: lerp(older[5], newer[5], blend) / 100,
        yaw: lerpAngle(older[6] / 1000, newer[6] / 1000, blend),
        pitch: lerp(older[7], newer[7], clampedFraction) / 1000,
        roll: lerp(older[8], newer[8], clampedFraction) / 1000,
        hp: newer[9],
        alive: !!newer[10],
        driver: newer[11],
        cargo: newer[12],
        rotor: lerp(older[13], newer[13], clampedFraction) / 100,
        v: newer[14] / 100,
        loading: newer[15] || 0,
        steer: (newer[16] || 0) / 100,
        gear: newer[17] || 1,
        engine: newer[18] || 0,
        doors: newer[19] || 0,
        tyaw: lerpAngle((older[20] || 0) / 1000, (newer[20] || 0) / 1000, clampedFraction),
        tp: lerp(older[21] || 0, newer[21] || 0, clampedFraction) / 1000,
        gun: newer[22] || 0,
        gunSpare: newer[23] || 0,
        comp: {
          engine: (newer[24] ?? 100) / 100,
          wheels: (newer[25] ?? 100) / 100,
          rotor: (newer[26] ?? 100) / 100,
          tail: (newer[27] ?? 100) / 100,
        },
        flipped: newer[28] || 0,
        burning: newer[29] || 0,
      });
    }
    return out;
  }
}
