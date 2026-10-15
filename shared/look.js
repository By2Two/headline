export const HEADGEAR = [
  { id: 'helmet', name: 'Helmet' },
  { id: 'cap', name: 'Cap' },
  { id: 'beanie', name: 'Beanie' },
  { id: 'none', name: 'None' },
  { id: 'nvg', name: 'Helmet + NVG' },
  { id: 'boonie', name: 'Boonie hat' },
  { id: 'headset', name: 'Headset' },
];

export const OUTFITS = [
  { id: 'forest', name: 'Forest', suit: 0x3d4636, vest: 0x262b24, pouch: 0x323a2e, gear: 0x485140 },
  { id: 'desert', name: 'Desert', suit: 0x9c8762, vest: 0x6e5d40, pouch: 0x857150, gear: 0xa89470 },
  { id: 'urban', name: 'Urban', suit: 0x5b6066, vest: 0x2e3135, pouch: 0x44484d, gear: 0x6a7077 },
  { id: 'night', name: 'Night', suit: 0x1f2226, vest: 0x131517, pouch: 0x26292d, gear: 0x2a2d31 },
  { id: 'arctic', name: 'Arctic', suit: 0xc9cdd1, vest: 0x8e959c, pouch: 0xa9afb5, gear: 0xdde0e3 },
];

export const FACES = [
  { id: 'mask', name: 'Mask + goggles' },
  { id: 'glasses', name: 'Sunglasses' },
  { id: 'none', name: 'None' },
  { id: 'balaclava', name: 'Balaclava' },
  { id: 'skull', name: 'Skull mask' },
  { id: 'gasmask', name: 'Gas mask' },
  { id: 'bandana', name: 'Bandana' },
  { id: 'goggles', name: 'Tactical goggles' },
  { id: 'respirator', name: 'Respirator' },
];

export const SKINS = [
  { id: 'light', name: 'Light', color: 0xe8bf9a },
  { id: 'tan', name: 'Tan', color: 0xc99a72 },
  { id: 'brown', name: 'Brown', color: 0x8d5b3a },
  { id: 'dark', name: 'Dark', color: 0x5a3824 },
];

export const DEFAULT_LOOK = { head: 'helmet', outfit: 'forest', face: 'mask', skin: 'tan' };

const pick = (list, id, definition) =>
  list.some((options) => options.id === id) ? id : definition;

const MOVED = {
  balaclava: ['none', 'balaclava'],
  helmbala: ['helmet', 'balaclava'],
  skull: ['none', 'skull'],
  gasmask: ['none', 'gasmask'],
};

export function sanitizeLook(look) {
  let options = look && typeof look === 'object' ? look : {};
  if (MOVED[options.head]) {
    options = { ...options, head: MOVED[options.head][0], face: MOVED[options.head][1] };
  }
  return {
    head: pick(HEADGEAR, options.head, DEFAULT_LOOK.head),
    outfit: pick(OUTFITS, options.outfit, DEFAULT_LOOK.outfit),
    face: pick(FACES, options.face, DEFAULT_LOOK.face),
    skin: pick(SKINS, options.skin, DEFAULT_LOOK.skin),
  };
}

export const outfitOf = (look) =>
  OUTFITS.find((options) => options.id === look.outfit) || OUTFITS[0];
export const skinOf = (look) => SKINS.find((skin) => skin.id === look.skin) || SKINS[1];

const LISTS = [
  ['head', HEADGEAR],
  ['outfit', OUTFITS],
  ['face', FACES],
  ['skin', SKINS],
];
export const encodeLook = (look) =>
  LISTS.map(([listKey, list]) =>
    Math.max(
      0,
      list.findIndex((options) => options.id === look[listKey]),
    ),
  ).join('');
export function decodeLook(code) {
  const out = { ...DEFAULT_LOOK };
  LISTS.forEach(([listKey, list], index) => {
    const options = list[Number(String(code || '')[index])];
    if (options) {
      out[listKey] = options.id;
    }
  });
  return out;
}
