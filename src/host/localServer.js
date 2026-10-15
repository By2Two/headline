import Peer from 'peerjs';

const PEER_PREFIX = 'headline-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;
const CONNECT_TIMEOUT_MS = 15000;
const MAX_CODE_ATTEMPTS = 6;
const CONNECTION_OPTIONS = { serialization: 'raw', reliable: true };

export const normalizeCode = (text) =>
  String(text || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH);

const randomCode = () =>
  Array.from(
    { length: CODE_LENGTH },
    () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
  ).join('');

let worker = null;
let nextSocketId = 1;
const sinks = new Map();

function ensureWorker() {
  if (worker) {
    return worker;
  }
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (event) => {
    const message = event.data;
    const sink = sinks.get(message.c);
    if (!sink) {
      return;
    }
    if (message.k === 'msg') {
      sink.message(message.d);
    } else if (message.k === 'close') {
      sinks.delete(message.c);
      sink.close();
    }
  };
  return worker;
}

function openVirtual(sink) {
  const id = nextSocketId++;
  sinks.set(id, sink);
  ensureWorker().postMessage({ k: 'open', c: id });
  return {
    send: (data) => worker.postMessage({ k: 'msg', c: id, d: data }),
    close: () => {
      if (sinks.delete(id)) {
        worker.postMessage({ k: 'close', c: id });
      }
    },
  };
}

let hosting = null;

function stopHosting(delay = 0) {
  const current = hosting;
  if (!current) {
    return;
  }
  hosting = null;
  setTimeout(() => current.peer.destroy(), delay);
}

function acceptGuest(connection) {
  const virtual = openVirtual({
    message: (data) => connection.open && connection.send(data),
    close: () => connection.close(),
  });
  connection.on('data', (data) => virtual.send(typeof data === 'string' ? data : String(data)));
  connection.on('close', () => virtual.close());
  connection.on('error', () => virtual.close());
}

function startHosting(attempt = 0) {
  stopHosting();
  return new Promise((resolve, reject) => {
    const code = randomCode();
    const peer = new Peer(PEER_PREFIX + code);
    peer.on('open', () => {
      hosting = { peer, code };
      peer.on('connection', acceptGuest);
      peer.on('disconnected', () => {
        if (hosting?.peer === peer && !peer.destroyed) {
          peer.reconnect();
        }
      });
      resolve(code);
    });
    peer.on('error', (error) => {
      if (hosting?.peer === peer) {
        return;
      }
      peer.destroy();
      if (error.type === 'unavailable-id' && attempt < MAX_CODE_ATTEMPTS) {
        startHosting(attempt + 1).then(resolve, reject);
      } else {
        reject(new Error('Could not reach the matchmaking service. Check your connection.'));
      }
    });
  });
}

class BridgeSocket {
  constructor() {
    this.readyState = 0;
    this.bufferedAmount = 0;
    this.virtual = null;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.cleanup = null;
  }

  opened(virtual) {
    this.virtual = virtual;
    this.readyState = 1;
    this.onopen?.();
  }

  failed() {
    if (this.readyState === 3) {
      return;
    }
    const wasOpen = this.readyState === 1;
    this.readyState = 3;
    this.virtual?.close();
    this.cleanup?.();
    (wasOpen ? this.onclose : this.onerror)?.();
  }

  send(data) {
    if (this.readyState === 1) {
      this.virtual.send(data);
    }
  }

  close() {
    if (this.readyState === 3) {
      return;
    }
    this.readyState = 3;
    this.virtual?.close();
    this.cleanup?.();
  }
}

function localSocket(join) {
  const socket = new BridgeSocket();
  const wantRoom = join.mode === 'host';
  if (!wantRoom) {
    stopHosting();
  }
  socket.cleanup = () => {
    if (wantRoom) {
      stopHosting(400);
    }
  };
  (wantRoom ? startHosting() : Promise.resolve(null)).then(
    (code) => {
      if (socket.readyState === 3) {
        return;
      }
      if (code) {
        join.code = code;
      }
      socket.opened(
        openVirtual({
          message: (data) => socket.onmessage?.({ data }),
          close: () => socket.failed(),
        }),
      );
    },
    () => socket.failed(),
  );
  return socket;
}

function guestSocket(code) {
  const socket = new BridgeSocket();
  const timer = setTimeout(() => socket.failed(), CONNECT_TIMEOUT_MS);
  const peer = new Peer();
  socket.cleanup = () => {
    clearTimeout(timer);
    peer.destroy();
  };
  peer.on('error', () => socket.failed());
  peer.on('open', () => {
    const connection = peer.connect(PEER_PREFIX + normalizeCode(code), CONNECTION_OPTIONS);
    connection.on('open', () => {
      clearTimeout(timer);
      if (socket.readyState === 3) {
        return;
      }
      socket.opened({
        send: (data) => connection.open && connection.send(data),
        close: () => connection.close(),
      });
    });
    connection.on('data', (data) => socket.onmessage?.({ data }));
    connection.on('close', () => socket.failed());
    connection.on('error', () => socket.failed());
  });
  return socket;
}

export function openLocalOrPeerSocket(join) {
  return join.mode === 'code' ? guestSocket(join.code) : localSocket(join);
}
