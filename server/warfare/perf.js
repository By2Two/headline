export function createPerf() {
  return {
    sec: Object.create(null),
    t0: 0,
    last: 0,
    ticks: 0,
    slow: 0,
    tickSum: 0,
    tickMax: 0,
    bytes: 0,
    msgs: 0,
    win: null,
    winAt: 0,
  };
}

export function perfBegin(perf) {
  perf.t0 = perf.last = performance.now();
}

export function perfMark(perf, name) {
  const ticks = performance.now();
  const duration = ticks - perf.last;
  perf.last = ticks;
  const section = perf.sec[name] || (perf.sec[name] = [0, 0]);
  section[0] += duration;
  if (duration > section[1]) {
    section[1] = duration;
  }
}

export function perfEnd(perf, budgetMs, now, extra) {
  const duration = performance.now() - perf.t0;
  perf.ticks++;
  perf.tickSum += duration;
  if (duration > perf.tickMax) {
    perf.tickMax = duration;
  }
  if (duration > budgetMs) {
    perf.slow++;
  }
  if (now - perf.winAt < 1000) {
    return null;
  }
  const ticks = perf.ticks || 1;
  const sec = {};
  for (const name in perf.sec) {
    sec[name] = [+(perf.sec[name][0] / ticks).toFixed(2), +perf.sec[name][1].toFixed(1)];
  }
  perf.win = {
    tick: +(perf.tickSum / ticks).toFixed(2),
    max: +perf.tickMax.toFixed(1),
    slow: perf.slow,
    kbps: +(perf.bytes / 1024).toFixed(1),
    msgs: perf.msgs,
    sec,
    ...extra,
  };
  perf.winAt = now;
  perf.sec = Object.create(null);
  perf.ticks = perf.slow = perf.msgs = perf.bytes = 0;
  perf.tickSum = perf.tickMax = 0;
  return perf.win;
}
