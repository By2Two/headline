import { WEAPONS, KNIFE_VARIANTS } from '../shared/weapons.js';
import { SKINS } from '../shared/skins.js';

const KEY = 'headline-inventory';

export const RARITIES = [
  { id: 'milspec', name: 'Mil-Spec', color: '#4b69ff', chance: 0.7992 },
  { id: 'restricted', name: 'Restricted', color: '#8847ff', chance: 0.1598 },
  { id: 'classified', name: 'Classified', color: '#d32ce6', chance: 0.032 },
  { id: 'covert', name: 'Covert', color: '#eb4b4b', chance: 0.0064 },
  { id: 'gold', name: '★ Rare Special', color: '#e4ae39', chance: 0.0026 },
];
export const rarityOf = (id) => RARITIES.find((rarity) => rarity.id === id) || RARITIES[0];

export const DUP_COINS = {
  milspec: 100,
  restricted: 300,
  classified: 800,
  covert: 2000,
  gold: 8000,
};
export const CASE_PRICE = 1000;

const SKIN_RARITY = {
  arctic: 'milspec',
  jungle: 'milspec',
  carbon: 'milspec',
  tiger: 'restricted',
  toxic: 'restricted',
  ruby: 'restricted',
  neon: 'classified',
  fade: 'classified',
  asiimov: 'covert',
  gilded: 'covert',
  urban: 'milspec',
  sakura: 'restricted',
  damascus: 'restricted',
  marble: 'classified',
  galaxy: 'classified',
  wave: 'covert',
  hellfire: 'covert',
  dragon: 'covert',
};

export const skinRarity = (skinId) => SKIN_RARITY[skinId] || null;

export const CASES = [{ id: 'headline', name: 'Headline Case', color: '#ffd24a' }];

const GUNS = WEAPONS.filter(
  (weapon) => !weapon.disabled && (weapon.slot === 'primary' || weapon.slot === 'secondary'),
);
const POOL = {};
for (const rarity of RARITIES) {
  POOL[rarity.id] = [];
}
for (const weapon of GUNS) {
  for (const skin of SKINS) {
    if (SKIN_RARITY[skin.id]) {
      POOL[SKIN_RARITY[skin.id]].push({
        weapon: weapon.id,
        skin: skin.id,
        rarity: SKIN_RARITY[skin.id],
      });
    }
  }
}
for (const id of KNIFE_VARIANTS) {
  POOL.gold.push({ weapon: id, skin: 'default', rarity: 'gold' });
}

export const itemKey = (item) => `${item.weapon}:${item.skin}`;
export const itemName = (item) => {
  const weapon = WEAPONS.find((positionX) => positionX.id === item.weapon);
  const skin = SKINS.find((positionX) => positionX.id === item.skin);
  return item.skin === 'default' ? `★ ${weapon?.name}` : `${weapon?.name} | ${skin?.name}`;
};

export function rollItem(rand = Math.random, owned = []) {
  let positionX = rand();
  let rarity = RARITIES[0];
  for (const candidate of RARITIES) {
    if (positionX < candidate.chance) {
      rarity = candidate;
      break;
    }
    positionX -= candidate.chance;
  }
  const have = new Set(owned);
  const fresh = POOL[rarity.id].filter((item) => !have.has(itemKey(item)));
  const list = fresh.length ? fresh : POOL[rarity.id];
  return list[Math.floor(rand() * list.length)];
}

export function rollFillerItem(rand = Math.random) {
  let item = rollItem(rand);
  while (item.rarity === 'gold') {
    item = rollItem(rand);
  }
  return item;
}

function load() {
  try {
    const save = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      boxes: save.boxes && typeof save.boxes === 'object' ? save.boxes : {},
      owned: Array.isArray(save.owned)
        ? save.owned.filter((owned) => typeof owned === 'string')
        : [],
      starter: !!save.starter,
      history: Array.isArray(save.history) ? save.history.slice(-20) : [],
      coins: Number.isFinite(save.coins) && save.coins > 0 ? Math.floor(save.coins) : 0,
    };
  } catch {
    return { boxes: {}, owned: [], starter: false, history: [], coins: 0 };
  }
}

let state = load();
const subs = new Set();
function commit(next) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
  subs.forEach((listener) => listener());
}

export const inventory = {
  get: () => state,
  subscribe: (listener) => {
    subs.add(listener);
    return () => subs.delete(listener);
  },
  ensureStarter() {
    if (state.starter) {
      return;
    }
    commit({
      ...state,
      starter: true,
      boxes: { ...state.boxes, headline: (state.boxes.headline || 0) + 1 },
    });
  },
  addBox(id = 'headline', count = 1) {
    commit({ ...state, boxes: { ...state.boxes, [id]: (state.boxes[id] || 0) + count } });
  },
  open(id = 'headline') {
    if (!(state.boxes[id] > 0)) {
      return null;
    }
    const item = rollItem(Math.random, state.owned);
    const key = itemKey(item);
    const dup = state.owned.includes(key);
    const coins = dup ? DUP_COINS[item.rarity] || 0 : 0;
    commit({
      ...state,
      boxes: { ...state.boxes, [id]: state.boxes[id] - 1 },
      owned: dup ? state.owned : [...state.owned, key],
      history: [...state.history, { ...item, at: Date.now() }].slice(-20),
    });
    return dup ? { ...item, dup: true, coins } : item;
  },
  unlockAll() {
    const all = Object.values(POOL).flat().map(itemKey);
    for (const weapon of WEAPONS) {
      if (weapon.slot === 'melee') {
        for (const skin of SKINS) {
          all.push(`${weapon.id}:${skin.id}`);
        }
      }
    }
    commit({ ...state, owned: [...new Set([...state.owned, ...all])] });
    return all.length;
  },
  creditCoins(amount) {
    if (amount > 0) {
      commit({ ...state, coins: (state.coins || 0) + amount });
    }
  },
  buyBox(id = 'headline') {
    if ((state.coins || 0) < CASE_PRICE) {
      return false;
    }
    commit({
      ...state,
      coins: state.coins - CASE_PRICE,
      boxes: { ...state.boxes, [id]: (state.boxes[id] || 0) + 1 },
    });
    return true;
  },
};

export const ownsSkin = (inv, weaponId, skinId) =>
  !skinId || skinId === 'default' || inv.owned.includes(`${weaponId}:${skinId}`);
export const ownsWeapon = (inv, weaponId) =>
  !KNIFE_VARIANTS.includes(weaponId) || inv.owned.includes(`${weaponId}:default`);
export const poolOf = (rarity) => POOL[rarity];

if (typeof window !== 'undefined') {
  window.giveBox = (count = 1) => {
    inventory.addBox('headline', Math.max(1, Math.floor(count) || 1));
    return `+${Math.max(1, Math.floor(count) || 1)} Headline Case`;
  };
  window.unlockAll = () => `${inventory.unlockAll()} itens liberados`;
}
