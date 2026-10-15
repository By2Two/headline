export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set: (patch) => {
      state = { ...state, ...patch };
      subs.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      subs.add(listener);
      return () => subs.delete(listener);
    },
  };
}

export const store = createStore({
  phase: 'menu',
  message: '',
  locked: false,
  board: false,
  hp: 100,
  alive: true,
  weaponId: 'rifle',
  weapon: 'AK-47',
  mag: 30,
  reserve: 90,
  melee: false,
  equipped: null,
  reloading: false,
  reloadP: 0,
  scope: 0,
  ping: 0,
  fps: 0,
  myId: null,
  room: null,
  score: [0, 0],
  goal: 100,
  win: -1,
  game: 'tdm',
  gg: { level: 0, kills: 0 },
  winId: null,
  winName: '',
  nextMatchIn: 0,
  team: 0,
  players: [],
  killfeed: [],
  chat: [],
  chatOpen: false,
  damage: [],
  hit: null,
  respawnIn: 0,
  debug: false,
});
