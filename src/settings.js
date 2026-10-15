import { DEFAULT_LOOK } from '../shared/look.js';
import { MAPS } from '../shared/map.js';
import { DEFAULT_LOADOUTS, sanitizeLoadout } from '../shared/weapons.js';

const KEY = 'headline-settings';
const OLD_KEY = 'strike-web-settings';

export const DEFAULT_CROSS = {
  color: '#7dffd8',
  size: 9,
  thick: 2,
  gap: 4,
  outline: true,
  dot: false,
  dynamic: true,
  alpha: 1,
};

export const DEFAULT_SETTINGS = {
  name: '',
  sens: 1.5,
  tacGfx: 'high',
  rawInput: true,
  fov: 80,
  volume: 0.7,
  fullscreen: true,
  team: 'T',
  loadouts: { T: { ...DEFAULT_LOADOUTS.T }, CT: { ...DEFAULT_LOADOUTS.CT } },
  look: { ...DEFAULT_LOOK },
  cross: { ...DEFAULT_CROSS },
  skins: {},
  map: 'arena',
  game: 'tdm',
  bots: 5,
  skill: 'normal',
  hostBots: 0,
  code: '',
  server: '',
};

export const SENS_MIN = 0.1;
export const SENS_MAX = 10;

const num = (value, min, max, definition) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : definition;
const text = (value, definition, max = 200) =>
  typeof value === 'string' ? value.slice(0, max) : definition;

function sanitize(settings) {
  const defaults = DEFAULT_SETTINGS;
  return {
    ...settings,
    name: text(settings.name, defaults.name, 16),
    sens: num(settings.sens, SENS_MIN, SENS_MAX, defaults.sens),
    rawInput: typeof settings.rawInput === 'boolean' ? settings.rawInput : defaults.rawInput,
    tacGfx: ['low', 'medium', 'high'].includes(settings.tacGfx) ? settings.tacGfx : defaults.tacGfx,
    fov: num(settings.fov, 60, 110, defaults.fov),
    volume: num(settings.volume, 0, 1, defaults.volume),
    fullscreen:
      typeof settings.fullscreen === 'boolean' ? settings.fullscreen : defaults.fullscreen,
    bots: Math.round(num(settings.bots, 1, 10, defaults.bots)),
    skill: ['easy', 'normal', 'hard'].includes(settings.skill) ? settings.skill : defaults.skill,
    map: MAPS.some((map) => map.id === settings.map) ? settings.map : defaults.map,
    game: settings.game === 'gungame' ? 'gungame' : 'tdm',
    team: settings.team === 'CT' ? 'CT' : 'T',
    loadouts: {
      T: sanitizeLoadout(settings.loadouts?.T ?? settings.loadout, 'T'),
      CT: sanitizeLoadout(settings.loadouts?.CT ?? settings.loadout, 'CT'),
    },
    hostBots: Math.round(num(settings.hostBots, 0, 10, defaults.hostBots)),
    code: text(settings.code, defaults.code, 4),
    skins: settings.skins && typeof settings.skins === 'object' ? settings.skins : {},
    server: text(settings.server, defaults.server),
    cross: {
      ...settings.cross,
      color: /^#[0-9a-f]{6}$/i.test(settings.cross?.color)
        ? settings.cross.color
        : DEFAULT_CROSS.color,
      size: num(settings.cross?.size, 0, 20, DEFAULT_CROSS.size),
      thick: num(settings.cross?.thick, 1, 6, DEFAULT_CROSS.thick),
      gap: num(settings.cross?.gap, 0, 16, DEFAULT_CROSS.gap),
      alpha: num(settings.cross?.alpha, 0.2, 1, DEFAULT_CROSS.alpha),
    },
  };
}

export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY) || '{}');
    const settings = raw && typeof raw === 'object' ? raw : {};
    return sanitize({
      ...DEFAULT_SETTINGS,
      ...settings,
      look: { ...DEFAULT_SETTINGS.look, ...settings.look },
      cross: { ...DEFAULT_CROSS, ...settings.cross },
    });
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {}
}
