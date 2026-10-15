import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { TICK_RATE } from '../shared/constants.js';
import { attach, setPublicUrl } from './core.js';
import { startTunnel } from './tunnel.js';

const PORT = Number(process.env.PORT) || 3001;
const TUNNEL = process.argv.includes('--tunnel');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp3': 'audio/mpeg',
};

const server = http.createServer((req, result) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.join(DIST, url === '/' ? 'index.html' : url);
  if (!file.startsWith(DIST)) {
    result.writeHead(403);
    return result.end();
  }
  fs.readFile(file, (error, data) => {
    if (!error) {
      result.writeHead(200, {
        'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      });
      return result.end(data);
    }
    fs.readFile(path.join(DIST, 'index.html'), (error, content) => {
      if (error) {
        result.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        return result.end(
          'Game server is running. Run "npm run build" to serve the client, or "npm run dev" for development.',
        );
      }
      result.writeHead(200, { 'content-type': MIME['.html'] });
      result.end(content);
    });
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

const HEARTBEAT_MS = 10000;
setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.alive === false) {
      socket.terminate();
      continue;
    }
    socket.alive = false;
    socket.ping();
  }
}, HEARTBEAT_MS);

wss.on('connection', (socket) => {
  socket.alive = true;
  socket.on('pong', () => {
    socket.alive = true;
  });
  attach(socket);
});

process.on('SIGINT', () => process.exit(0));
server.listen(PORT, () => {
  console.log(`Server at http://localhost:${PORT}  (ws at /ws, ${TICK_RATE} ticks/s)`);
  if (!TUNNEL) {
    return;
  }
  console.log('Opening a public Cloudflare tunnel…');
  startTunnel(PORT).then(
    ({ url }) => {
      setPublicUrl(url);
      const line = '='.repeat(url.length + 4);
      console.log(
        `\n${line}\n  ${url}\n${line}\nOpen this link, click "Host a game" and send the invite link to your friends.\nKeep this window open while you play.\n`,
      );
    },
    (error) =>
      console.log(
        `Tunnel failed: ${error.message}\nYou can still play on your network at http://localhost:${PORT}`,
      ),
  );
});
