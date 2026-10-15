export class PerfHud {
  constructor() {
    this.el = null;
    this.on = false;
    this.frames = 0;
    this.sum = 0;
    this.worst = 0;
    this.t = 0;
    this.server = null;
  }

  toggle(on = !this.on) {
    this.on = on;
    if (on && !this.el) {
      const element = document.createElement('pre');
      element.className = 'mil-perf';
      Object.assign(element.style, {
        position: 'fixed',
        left: '8px',
        top: '96px',
        zIndex: 60,
        margin: 0,
        padding: '6px 8px',
        background: 'rgba(0,0,0,0.62)',
        color: '#d8f0c8',
        font: '11px/1.35 Consolas, monospace',
        pointerEvents: 'none',
        whiteSpace: 'pre',
      });
      document.body.appendChild(element);
      this.el = element;
    }
    if (this.el) {
      this.el.style.display = on ? 'block' : 'none';
    }
  }

  frame(deltaTime) {
    this.frames++;
    this.sum += deltaTime;
    if (deltaTime > this.worst) {
      this.worst = deltaTime;
    }
    this.t += deltaTime;
  }

  update(engine) {
    if (!this.on || this.t < 0.5) {
      return;
    }
    const info = engine.renderer.info;
    const fps = this.frames / this.sum;
    const milliseconds = (this.sum / this.frames) * 1000;
    const worst = this.worst * 1000;
    const secs = this.t;
    this.frames = 0;
    this.sum = 0;
    this.worst = 0;
    this.t = 0;
    const net = engine.net;
    const rotationX = (net.rx || 0) / 1024 / secs;
    const kilobytesSent = (net.tx || 0) / 1024 / secs;
    net.rx = net.tx = 0;
    const lod = [0, 0, 0];
    for (const remote of engine.remotes.values()) {
      lod[remote.lod || 0]++;
    }
    const worldLod = engine.worldGroup?.userData.lod?.stats() || { items: 0, visible: 0 };
    const heap = performance.memory
      ? `${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)} MB`
      : 'n/a';
    const server = this.server;
    const lines = [
      `FPS ${fps.toFixed(0)}  ${milliseconds.toFixed(1)} ms (worst ${worst.toFixed(0)})  ${engine.gfx?.label || ''} · res ${Math.round((engine.resUser || 1) * (engine.resDyn || 1) * 100)}%`,
      `draw ${engine.drawCalls ?? info.render.calls}  tris ${((engine.drawTris ?? info.render.triangles) / 1000).toFixed(0)}k  geo ${info.memory.geometries}  tex ${info.memory.textures}  heap ${heap}`,
      `net in ${rotationX.toFixed(1)} KB/s  out ${kilobytesSent.toFixed(1)} KB/s  ping ${Math.round(net.rtt || 0)} ms`,
      `players ${engine.remotes.size} (full ${lod[0]} · mid ${lod[1]} · far ${lod[2]})  vehicles ${engine.veh.size}  regions ${worldLod.visible}/${worldLod.items}`,
      `sounds ${engine.audio.active ?? 'n/a'}  fx ${engine.effects?.count?.() ?? 'n/a'}  structs ${engine.structs?.size ?? 0}`,
      server
        ? `server tick ${server.tick} ms (max ${server.max}) slow ${server.slow}/s  out ${server.kbps} KB/s  ents ${server.players}p ${server.veh}v ${server.structs}s`
        : 'server …',
    ];
    if (server?.sec) {
      lines.push(
        '  ' +
          Object.entries(server.sec)
            .map(([name, value]) => `${name} ${value[0]}`)
            .join('  '),
      );
    }
    this.el.textContent = lines.join('\n');
    if (performance.now() - (this.askedAt || 0) > 2000) {
      this.askedAt = performance.now();
      net.send({ t: 'mperf' });
    }
  }

  dispose() {
    this.el?.remove();
    this.el = null;
  }
}
