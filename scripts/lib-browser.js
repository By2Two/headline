import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

export const delay = (milliseconds) => new Promise((result) => setTimeout(result, milliseconds));

export async function launch({
  port = 3151,
  debugPort = 9251,
  env = {},
  settings = {},
  url = '',
  size = [1280, 720],
} = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fps-wf-'));
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const serverLog = [];
  server.stdout.on('data', (chunk) => serverLog.push(String(chunk)));
  server.stderr.on('data', (chunk) => serverLog.push('ERR ' + String(chunk)));
  spawn(
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    [
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader',
      '--disable-dev-shm-usage',
      `--window-size=${size[0]},${size[1]}`,
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore', windowsHide: true },
  );
  let socket;
  let seq = 0;
  const pending = new Map();
  const exceptions = [];
  const logs = [];
  const retry = async (callback, milliseconds = 30000) => {
    const start = Date.now();
    let error;
    while (Date.now() - start < milliseconds) {
      try {
        const result = await callback();
        if (result) {
          return result;
        }
      } catch (currentError) {
        error = currentError;
      }
      await delay(250);
    }
    throw error || new Error('Timeout');
  };
  const close = async () => {
    try {
      socket?.close();
    } catch {}
    try {
      spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } catch {}
    try {
      spawnSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${path.basename(profile)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
        ],
        { stdio: 'ignore', windowsHide: true },
      );
    } catch {}
    await delay(500);
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {}
  };
  try {
    const targets = await retry(async () =>
      (await fetch(`http://localhost:${debugPort}/json`)).json(),
    );
    socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((result, innerIndex) => {
      socket.once('open', result);
      socket.once('error', innerIndex);
    });
    socket.on('message', (raw) => {
      const message = JSON.parse(raw);
      if (message.id) {
        const currentPending = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) {
          currentPending?.reject(new Error(message.error.message));
        } else {
          currentPending?.resolve(message.result);
        }
      }
      if (message.method === 'Runtime.exceptionThrown') {
        exceptions.push(
          message.params.exceptionDetails.text +
            ' ' +
            (message.params.exceptionDetails.exception?.description || ''),
        );
      }
      if (
        message.method === 'Runtime.consoleAPICalled' &&
        ['error', 'warning'].includes(message.params.type)
      ) {
        logs.push(
          message.params.type +
            ': ' +
            message.params.args.map((arg) => arg.value ?? arg.description).join(' '),
        );
      }
    });
    const call = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++seq;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    const evaluate = async (expression) => {
      const result = await call('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        throw new Error(
          result.exceptionDetails.exception?.description || result.exceptionDetails.text,
        );
      }
      return result.result.value;
    };
    await call('Runtime.enable');
    await call('Page.enable');
    await call('Page.addScriptToEvaluateOnNewDocument', {
      source: `localStorage.setItem('headline-settings',JSON.stringify(${JSON.stringify({
        name: 'Tester',
        fullscreen: false,
        volume: 0,
        milGfx: 'low',
        milRes: 1,
        team: 'T',
        ...settings,
      })}));`,
    });
    await retry(async () => (await fetch(`http://localhost:${port}`)).ok);
    await call('Page.navigate', { url: `http://localhost:${port}/${url}` });
    const screenshot = async (file) => {
      const result = await call('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(result.data, 'base64'));
      return file;
    };
    const key = async (type, code, keyName = code) =>
      call('Input.dispatchKeyEvent', { type, code, key: keyName, windowsVirtualKeyCode: 0 });
    return { call, evaluate, screenshot, key, retry, close, exceptions, logs, serverLog, delay };
  } catch (error) {
    await close();
    throw error;
  }
}
