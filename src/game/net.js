import { openLocalOrPeerSocket } from '../host/localServer.js';

const lerp = (from, to, amount) => from + (to - from) * amount;
const lerpAngle = (from, to, amount) => {
  const difference =
    ((((to - from + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  return from + difference * amount;
};

const conv = (player) => ({
  i: player.i,
  n: player.n,
  tm: player.tm,
  x: player.p[0],
  y: player.p[1],
  z: player.p[2],
  yaw: player.y,
  pitch: player.pt,
  c: player.c,
  ad: player.ad,
  hp: player.hp,
  a: player.a,
  w: player.w,
  k: player.k,
  d: player.d,
  s: player.s,
  lk: player.lk,
  sk: player.sk,
  rl: player.rl,
  pl: player.pl,
  ar: player.ar,
});

export function wsUrl(server) {
  const raw = String(server || '').trim();
  if (!raw) {
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  }
  let url = raw.replace(/\/+$/, '');
  if (/^https?:\/\//i.test(url)) {
    url = url.replace(/^http/i, 'ws');
  } else if (!/^wss?:\/\//i.test(url)) {
    url = `${location.protocol === 'https:' || !/^[\d.:]+$|^localhost/.test(url) ? 'wss' : 'ws'}://${url}`;
  }
  return /\/ws$/.test(url) ? url : `${url}/ws`;
}

export class Net {
  constructor(onMessage, onStatus) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.ws = null;
    this.snaps = [];
    this.offset = 0;
    this.hasOffset = false;
    this.hasPong = false;
    this.rtt = 0;
    this.pingTimer = null;
  }

  connect(join, server = '') {
    const socket = server ? new WebSocket(wsUrl(server)) : openLocalOrPeerSocket(join);
    this.ws = socket;
    socket.onopen = () => {
      this.send(join);
      this.onStatus('open');
      this.ping();
      this.pingTimer = setInterval(() => this.ping(), 1000);
    };
    socket.onmessage = (event) => {
      if (socket !== this.ws) {
        return;
      }
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.t === 'pong') {
        this.onPong(message);
      } else if (message.t === 'snap') {
        this.onSnap(message);
      } else {
        this.onMessage(message);
      }
    };
    socket.onclose = () => {
      if (socket !== this.ws) {
        return;
      }
      clearInterval(this.pingTimer);
      this.onStatus('closed');
    };
    socket.onerror = () => {
      if (socket === this.ws) {
        this.onStatus('error');
      }
    };
  }

  close() {
    clearInterval(this.pingTimer);
    const socket = this.ws;
    this.ws = null;
    if (socket) {
      socket.close();
    }
    this.snaps = [];
    this.hasOffset = this.hasPong = false;
    this.rtt = 0;
  }

  send(object) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(object));
    }
  }

  ping() {
    this.send({ t: 'ping', c: performance.now() });
  }

  onPong(message) {
    const nowMs = performance.now();
    const rtt = nowMs - message.c;
    this.rtt = this.hasPong ? lerp(this.rtt, rtt, 0.3) : rtt;
    const sample = message.s + rtt / 2 - nowMs;
    this.offset = this.hasPong ? lerp(this.offset, sample, 0.2) : sample;
    this.hasPong = true;
    this.hasOffset = true;
  }

  onSnap(message) {
    if (!this.hasOffset) {
      this.offset = message.time - performance.now() + 20;
      this.hasOffset = true;
    }
    message.map = new Map(message.players.map((player) => [player.i, player]));
    this.snaps.push(message);
    while (this.snaps.length > 40) {
      this.snaps.shift();
    }
    this.onMessage(message);
  }

  serverNow() {
    return performance.now() + this.offset;
  }

  interpolate(renderTime, exceptId) {
    const snapshots = this.snaps;
    if (!snapshots.length) {
      return [];
    }
    let from = null;
    let to = null;
    for (let index = snapshots.length - 1; index >= 0; index--) {
      if (snapshots[index].time <= renderTime) {
        from = snapshots[index];
        to = snapshots[index + 1] || null;
        break;
      }
    }
    if (!from) {
      from = snapshots[0];
      to = null;
    }
    const fraction = to ? (renderTime - from.time) / (to.time - from.time) : 0;
    const source = to || from;
    const out = [];
    for (const player of source.players) {
      if (player.i === exceptId) {
        continue;
      }
      const playerA = to ? from.map.get(player.i) : null;
      if (playerA && playerA.s === player.s) {
        out.push({
          i: player.i,
          n: player.n,
          tm: player.tm,
          x: lerp(playerA.p[0], player.p[0], fraction),
          y: lerp(playerA.p[1], player.p[1], fraction),
          z: lerp(playerA.p[2], player.p[2], fraction),
          yaw: lerpAngle(playerA.y, player.y, fraction),
          pitch: lerp(playerA.pt, player.pt, fraction),
          c: fraction < 0.5 ? playerA.c : player.c,
          ad: player.ad,
          hp: player.hp,
          a: player.a,
          w: player.w,
          k: player.k,
          d: player.d,
          s: player.s,
          lk: player.lk,
          sk: player.sk,
          rl: player.rl,
          pl: player.pl,
          ar: player.ar,
        });
      } else {
        out.push(conv(player));
      }
    }
    return out;
  }
}
