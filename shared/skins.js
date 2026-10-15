export const SKINS = [
  { id: 'default', name: 'Factory', swatch: 'linear-gradient(135deg, #3a3e44 0 55%, #7a4f2a 55%)' },
  {
    id: 'asiimov',
    name: 'Asiimov',
    swatch:
      'linear-gradient(120deg, #f2efe8 0 38%, #ff6a1a 38% 58%, #141414 58% 64%, #f2efe8 64% 80%, #ff6a1a 80%)',
    body: { tex: 'asiimov', colors: ['#f2efe8', '#ff6a1a', '#141414', '#c9c6c0'], rough: 0.45 },
    dark: { color: 0x1c1c1c, rough: 0.5 },
    wood: { tex: 'asiimov', colors: ['#ff6a1a', '#f2efe8', '#141414', '#e0580f'], rough: 0.45 },
    blade: {
      tex: 'asiimov',
      colors: ['#f2efe8', '#ff6a1a', '#141414', '#c9c6c0'],
      rough: 0.3,
      metal: 0.4,
    },
  },
  {
    id: 'gilded',
    name: 'Gilded',
    swatch: 'url(skins/gilded.jpg) center / 180%',
    body: { img: 'gilded', rough: 0.25, metal: 0.9, tile: 0.18 },
    dark: { color: 0x2a1d0e, rough: 0.4, metal: 0.6 },
    wood: { img: 'gilded', rough: 0.25, metal: 0.9, tile: 0.18 },
    blade: { color: 0xffdf80, rough: 0.12, metal: 1 },
  },
  {
    id: 'neon',
    name: 'Neon Rider',
    swatch: 'url(skins/neon.jpg) center / 180%',
    body: { img: 'neon', rough: 0.35, metal: 0.3, tile: 0.3, glow: 0.8 },
    dark: { color: 0xff2bd6, emissive: 0xff2bd6, glow: 1.1 },
    wood: { img: 'neon', rough: 0.35, metal: 0.3, tile: 0.3, glow: 0.8 },
    blade: { color: 0x22e4ff, emissive: 0x22e4ff, glow: 0.7, metal: 0.5 },
  },
  {
    id: 'fade',
    name: 'Fade',
    swatch: 'linear-gradient(135deg, #ffd23f, #ff5fa2 50%, #7b4dff)',
    body: { tex: 'fade', colors: ['#ffd23f', '#ff5fa2', '#7b4dff'], rough: 0.2, metal: 0.8 },
    dark: { color: 0x202024, rough: 0.35, metal: 0.6 },
    wood: { tex: 'fade', colors: ['#ff5fa2', '#7b4dff', '#3b2bff'], rough: 0.2, metal: 0.8 },
    blade: { tex: 'fade', colors: ['#ffd23f', '#ff5fa2', '#7b4dff'], rough: 0.12, metal: 0.9 },
  },
  {
    id: 'arctic',
    name: 'Arctic Camo',
    swatch: 'url(skins/arctic.jpg) center / 180%',
    body: { img: 'arctic', rough: 0.8, metal: 0.1, tile: 0.3 },
    dark: { color: 0x3a4048, rough: 0.6 },
    wood: { img: 'arctic', rough: 0.8, metal: 0.1, tile: 0.3 },
    blade: { color: 0xd8dee4, rough: 0.3, metal: 0.7 },
  },
  {
    id: 'jungle',
    name: 'Jungle',
    swatch: 'url(skins/jungle.jpg) center / 180%',
    body: { img: 'jungle', rough: 0.85, metal: 0.05, tile: 0.3 },
    dark: { color: 0x1d2412, rough: 0.7 },
    wood: { img: 'jungle', rough: 0.85, metal: 0.05, tile: 0.3 },
    blade: { color: 0x5b6346, rough: 0.5, metal: 0.4 },
  },
  {
    id: 'tiger',
    name: 'Blood Tiger',
    swatch: 'url(skins/tiger.jpg) center / 180%',
    body: { img: 'tiger', rough: 0.4, metal: 0.4, tile: 0.3 },
    dark: { color: 0x120707, rough: 0.5 },
    wood: { img: 'tiger', rough: 0.4, metal: 0.4, tile: 0.3 },
    blade: { img: 'tiger', rough: 0.25, metal: 0.6, tile: 0.3 },
  },
  {
    id: 'carbon',
    name: 'Carbon',
    swatch: 'url(skins/carbon.jpg) center / 180%',
    body: { img: 'carbon', rough: 0.35, metal: 0.4, tile: 0.12 },
    dark: { color: 0x0c0c0d, rough: 0.45 },
    wood: { img: 'carbon', rough: 0.35, metal: 0.4, tile: 0.12 },
    blade: { color: 0x30343a, rough: 0.18, metal: 0.95 },
  },
  {
    id: 'toxic',
    name: 'Toxic',
    swatch: 'url(skins/toxic.jpg) center / 180%',
    body: { img: 'toxic', rough: 0.5, metal: 0.1, tile: 0.3, glow: 0.35 },
    dark: { color: 0x6bff3a, emissive: 0x3aff1a, glow: 0.6 },
    wood: { img: 'toxic', rough: 0.5, metal: 0.1, tile: 0.3, glow: 0.35 },
    blade: { img: 'toxic', rough: 0.25, metal: 0.6, tile: 0.3 },
  },
  {
    id: 'ruby',
    name: 'Ruby',
    swatch: 'linear-gradient(135deg, #ff3b5c, #9b0f2b 55%, #2a0710)',
    body: { color: 0xc8173a, rough: 0.14, metal: 0.9 },
    dark: { color: 0x2a0710, rough: 0.3, metal: 0.6 },
    wood: { color: 0x8a1026, rough: 0.3, metal: 0.6 },
    blade: { color: 0xff2d55, rough: 0.06, metal: 1 },
  },
  {
    id: 'urban',
    name: 'Urban Digital',
    swatch: 'url(skins/urban.jpg) center / 180%',
    body: { img: 'urban', rough: 0.75, metal: 0.1, tile: 0.26 },
    dark: { color: 0x16171a, rough: 0.5 },
    wood: { img: 'urban', rough: 0.75, metal: 0.1, tile: 0.26 },
    blade: { color: 0x9aa0a6, rough: 0.3, metal: 0.7 },
  },
  {
    id: 'sakura',
    name: 'Sakura',
    swatch: 'url(skins/sakura.jpg) center / 180%',
    body: { img: 'sakura', rough: 0.45, metal: 0.2, tile: 0.32 },
    dark: { color: 0x141a33, rough: 0.5 },
    wood: { img: 'sakura', rough: 0.45, metal: 0.2, tile: 0.32 },
    blade: { color: 0xffb7d0, rough: 0.2, metal: 0.6 },
  },
  {
    id: 'damascus',
    name: 'Damascus',
    swatch: 'url(skins/damascus.jpg) center / 180%',
    body: { img: 'damascus', rough: 0.25, metal: 0.85, tile: 0.3 },
    dark: { color: 0x111214, rough: 0.4, metal: 0.6 },
    wood: { img: 'damascus', rough: 0.25, metal: 0.85, tile: 0.3 },
    blade: { img: 'damascus', rough: 0.25, metal: 0.6, tile: 0.3 },
  },
  {
    id: 'marble',
    name: 'Marble Fade',
    swatch: 'url(skins/marble.jpg) center / 180%',
    body: { img: 'marble', rough: 0.2, metal: 0.6, tile: 0.45 },
    dark: { color: 0x14161c, rough: 0.35, metal: 0.6 },
    wood: { img: 'marble', rough: 0.2, metal: 0.6, tile: 0.45 },
    blade: { img: 'marble', rough: 0.25, metal: 0.6, tile: 0.45 },
  },
  {
    id: 'galaxy',
    name: 'Galaxy',
    swatch: 'url(skins/galaxy.jpg) center / 180%',
    body: { img: 'galaxy', rough: 0.3, metal: 0.4, tile: 0.45, glow: 0.45 },
    dark: { color: 0x0b0716, rough: 0.4 },
    wood: { img: 'galaxy', rough: 0.3, metal: 0.4, tile: 0.45, glow: 0.45 },
    blade: { img: 'galaxy', rough: 0.25, metal: 0.6, tile: 0.45 },
  },
  {
    id: 'wave',
    name: 'Great Wave',
    swatch: 'url(skins/wave.jpg) center / 180%',
    body: { img: 'wave', rough: 0.45, metal: 0.2, tile: 0.5 },
    dark: { color: 0x0e1a33, rough: 0.5 },
    wood: { img: 'wave', rough: 0.45, metal: 0.2, tile: 0.5 },
    blade: { color: 0xe8f0f5, rough: 0.2, metal: 0.7 },
  },
  {
    id: 'hellfire',
    name: 'Hellfire',
    swatch: 'url(skins/hellfire.jpg) center / 180%',
    body: { img: 'hellfire', rough: 0.4, metal: 0.3, tile: 0.42, glow: 0.55 },
    dark: { color: 0x0b0806, rough: 0.5 },
    wood: { img: 'hellfire', rough: 0.4, metal: 0.3, tile: 0.42, glow: 0.55 },
    blade: { img: 'hellfire', rough: 0.25, metal: 0.6, tile: 0.42 },
  },
  {
    id: 'dragon',
    name: 'Dragon Scale',
    swatch: 'url(skins/dragon.jpg) center / 180%',
    body: { img: 'dragon', rough: 0.3, metal: 0.6, tile: 0.2 },
    dark: { color: 0x2a0a08, rough: 0.4, metal: 0.5 },
    wood: { img: 'dragon', rough: 0.3, metal: 0.6, tile: 0.2 },
    blade: { color: 0xe0b04a, rough: 0.15, metal: 1 },
  },
];

export const skinIndex = (id) =>
  Math.max(
    0,
    SKINS.findIndex((skin) => skin.id === id),
  );
export const skinOfId = (id) => SKINS.find((skin) => skin.id === id) || SKINS[0];

export function sanitizeSkins(object, weaponIds) {
  const out = {};
  if (!object || typeof object !== 'object') {
    return out;
  }
  for (const weaponId of weaponIds) {
    const id = object[weaponId] === 'vortex' ? 'asiimov' : object[weaponId];
    if (SKINS.some((skin) => skin.id === id && skin.id !== 'default')) {
      out[weaponId] = id;
    }
  }
  return out;
}
