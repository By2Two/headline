import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CANDIDATES = [
  'cloudflared',
  'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
  'C:\\Program Files\\cloudflared\\cloudflared.exe',
  '/usr/local/bin/cloudflared',
  '/opt/homebrew/bin/cloudflared',
];

function findBinary() {
  for (const candidate of CANDIDATES) {
    if (candidate === 'cloudflared' || fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return 'cloudflared';
}

export function startTunnel(port) {
  return new Promise((resolve, reject) => {
    const tryBin = (list) => {
      const binaryPath = list[0];
      const child = spawn(
        binaryPath,
        ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let done = false;
      const onData = (buffer) => {
        const message = String(buffer).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (message && !done) {
          done = true;
          resolve({ url: message[0], child });
        }
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      child.on('error', () => {
        if (done) {
          return;
        }
        const rest = list
          .slice(1)
          .filter((candidate) => candidate === 'cloudflared' || fs.existsSync(candidate));
        if (rest.length) {
          tryBin(rest);
        } else {
          reject(
            new Error(
              'cloudflared not found. Install it with: winget install Cloudflare.cloudflared',
            ),
          );
        }
      });
      child.on('exit', (code) => {
        if (!done) {
          reject(new Error(`cloudflared exited (${code}) before giving a link`));
        }
      });
      setTimeout(() => {
        if (!done) {
          done = true;
          child.kill();
          reject(new Error('cloudflared did not give a link in 30 s'));
        }
      }, 30000);
      process.on('exit', () => child.kill());
    };
    tryBin([
      findBinary(),
      ...CANDIDATES.filter((candidate) => candidate !== 'cloudflared' && fs.existsSync(candidate)),
    ]);
  });
}
