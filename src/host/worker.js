import { attach } from '../../server/core.js';

const socks = new Map();

class VirtualSocket {
  constructor(id) {
    this.id = id;
    this.readyState = 1;
    this.bufferedAmount = 0;
    this.handlers = {};
  }

  on(event, callback) {
    this.handlers[event] = callback;
  }

  send(data) {
    if (this.readyState === 1) {
      postMessage({ k: 'msg', c: this.id, d: data });
    }
  }

  close() {
    if (this.readyState !== 1) {
      return;
    }
    this.readyState = 3;
    socks.delete(this.id);
    postMessage({ k: 'close', c: this.id });
    this.handlers.close?.();
  }
}

self.onmessage = (event) => {
  const message = event.data;
  if (message.k === 'open') {
    const sock = new VirtualSocket(message.c);
    socks.set(message.c, sock);
    attach(sock);
    return;
  }
  const sock = socks.get(message.c);
  if (!sock) {
    return;
  }
  if (message.k === 'msg') {
    sock.handlers.message?.(message.d);
  } else if (message.k === 'close' && sock.readyState === 1) {
    sock.readyState = 3;
    socks.delete(message.c);
    sock.handlers.close?.();
  }
};
