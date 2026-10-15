import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
const delay = (milliseconds) => new Promise((result) => setTimeout(result, milliseconds));
const port = 3141;
const debugPort = 9237;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fps-mil-browser-'));
const server = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore',
  windowsHide: true,
});
const browser = spawn(
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
    '--window-size=1440,900',
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
async function retry(callback, milliseconds = 30000) {
  const start = Date.now();
  let error;
  while (Date.now() - start < milliseconds) {
    try {
      const result = await callback();
      if (result) {
        return result;
      }
    } catch (failure) {
      error = failure;
    }
    await delay(250);
  }
  throw error || new Error('Timeout');
}
try {
  const targets = await retry(async () => {
    const result = await fetch(`http://localhost:${debugPort}/json`);
    return result.json();
  });
  socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((result, innerIndex) => {
    socket.once('open', result);
    socket.once('error', innerIndex);
  });
  socket.on('message', (raw) => {
    const message = JSON.parse(raw);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        request?.reject(new Error(message.error.message));
      } else {
        request?.resolve(message.result);
      }
    }
    if (message.method === 'Runtime.exceptionThrown') {
      exceptions.push(
        message.params.exceptionDetails.text +
          ' ' +
          (message.params.exceptionDetails.exception?.description || ''),
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
    source: `localStorage.setItem('headline-settings',JSON.stringify({genre:'milsim',name:'Ground Check',fullscreen:false,volume:0,milGfx:'low',milRes:1,team:'T'}));`,
  });
  await retry(async () => (await fetch(`http://localhost:${port}`)).ok);
  await call('Page.navigate', { url: `http://localhost:${port}/?mildebug` });
  await retry(() => evaluate('!!window.__mil'));
  assert.equal(await evaluate('!!__mil.world'), false, 'lobby must not prebuild a battlefield');
  const inspect = () =>
    evaluate(`(() => {
    const e=__mil;let vertices=0,maxError=0,chunks=0;
    e.worldGroup.traverse(o=>{const a=o.geometry?.attributes?.position;if(a?.count!==4481)return;chunks++;for(let i=0;i<65*65;i++){maxError=Math.max(maxError,Math.abs(a.getY(i)-e.dbgHeight(a.getX(i),a.getZ(i))));vertices++;}});
    const bots=(e.latest?.players||[]).filter(p=>p.b&&p.a).map(p=>({id:p.i,gap:p.p[1]-e.dbgHeight(p.p[0],p.p[2])}));
    const vehicles=[...e.veh.values()].filter(v=>v.st.alive).map(v=>({type:v.st.type,gap:v.st.y-e.dbgHeight(v.st.x,v.st.z)}));
    return {map:e.worldMap,chunks,vertices,maxError,bots,vehicles};
  })()`);
  for (const map of ['ironpass', 'kestrel', 'ironpass']) {
    if (await evaluate('!!__mil.joined')) {
      await evaluate('__mil.leave()');
      await delay(300);
    }
    await evaluate(
      `__mil.connect('Ground Check',{mode:'quick',game:'milsim',map:'${map}',bots:6})`,
    );
    await retry(() =>
      evaluate(
        `__mil.joined && __mil.worldMap==='${map}' && __mil.sectors.length===${map === 'ironpass' ? 7 : 4}`,
      ),
    );
    await delay(4000);
    const stats = await inspect();
    assert.equal(stats.chunks, 64);
    assert.ok(stats.maxError < 0.0001, JSON.stringify(stats));
    assert.ok(stats.bots.length > 0, 'bots must have spawned');
    assert.ok(
      stats.bots.every((request) => Math.abs(request.gap) < 0.8),
      JSON.stringify(stats.bots),
    );
    console.log('OK browser map + collision + bots:', JSON.stringify(stats));
  }
  await evaluate("__mil.deploy('main')");
  await retry(() => evaluate('__mil.alive'));
  await evaluate(`(() => {const e=__mil; e.testInput=e.getInput;
    e.getInput=function(){const input=this.testInput();if(!this.testTarget)return input;
    const dx=this.testTarget.x-this.ms.x,dz=this.testTarget.z-this.ms.z,d=Math.hypot(dx,dz);
    this.yaw=Math.atan2(-dx,-dz);return {...input,fwd:d>2.5?1:0,right:0,yaw:this.yaw,sprint:d>5};};
  })()`);
  for (const request of [
    { x: -658, z: -760 },
    { x: -650, z: -716 },
  ]) {
    await evaluate(`__mil.testTarget=${JSON.stringify(request)}`);
    await retry(
      () => evaluate('Math.hypot(__mil.ms.x-__mil.testTarget.x,__mil.ms.z-__mil.testTarget.z)<3.5'),
      30000,
    );
  }
  await evaluate(
    '__mil.testTarget=null; __mil.getInput=__mil.testInput; __mil.spawnVehicle(0,"jeep")',
  );
  await retry(() => evaluate('__mil.veh.size>0'));
  await delay(1500);
  const vehicleStats = await inspect();
  assert.ok(
    vehicleStats.vehicles.some(
      (vehicle) => vehicle.type === 'jeep' && Math.abs(vehicle.gap) < 0.12,
    ),
    JSON.stringify(vehicleStats),
  );
  console.log('OK browser real jeep spawned through tent:', JSON.stringify(vehicleStats.vehicles));
  await evaluate(`(() => {
    const e=__mil;cancelAnimationFrame(e.raf);e.alive=false;
    const style=document.createElement('style');style.textContent='body .app > :not(canvas) { display:none !important; }';document.head.append(style);
    e.scene.fog.near=1200;e.scene.fog.far=3200;
    e.camera.position.set(-700,510,730);e.camera.lookAt(0,65,0);e.camera.updateMatrixWorld();
    e.worldGroup.userData.lod.items.forEach(i=>i.apply(0,true));
    e.renderer.setPixelRatio(1);e.renderer.setSize(1440,900);e.renderer.clear();e.renderer.render(e.scene,e.camera);
  })()`);
  const shot = await call('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync('artifacts/ironpass-overview.png', Buffer.from(shot.data, 'base64'));
  await evaluate(`(() => {const e=__mil; const v=[...e.veh.values()].find(v=>v.st.type==='jeep').st;
    e.camera.position.set(v.x+16,v.y+8,v.z+20);e.camera.lookAt(v.x,v.y+1,v.z);e.camera.updateMatrixWorld();
    e.renderer.clear();e.renderer.render(e.scene,e.camera);
  })()`);
  const detail = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('artifacts/ironpass-ground-check.png', Buffer.from(detail.data, 'base64'));
  assert.equal(exceptions.length, 0, exceptions.join('\n'));
  console.log(
    'OK browser: map changes rebuild scene + collision together, 270400 terrain vertices/map, no JS exceptions. Screenshot artifacts/ironpass-overview.png',
  );
} finally {
  socket?.close();
  browser.kill();
  server.kill();
}
