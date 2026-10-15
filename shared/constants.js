export const TICK_RATE = 30;
export const TICK_MS = 1000 / TICK_RATE;
export const MAX_PLAYERS = 16;
export const MAX_HP = 100;
export const RESPAWN_MS = 5000;
export const KILLS_TO_WIN = 100;
export const WIN_PAUSE_MS = 8000;
export const SPAWN_PROTECT_MS = 1500;
export const INTERP_MS = 100;
export const MAX_REWIND_MS = 350;
export const MAX_RANGE = 250;

export const PLAYER = {
  radius: 0.3,
  height: 1.8,
  crouchHeight: 1.3,
  eye: 1.62,
  crouchEye: 1.15,
  step: 0.45,
};

export const MOVE = {
  run: 6.2,
  walk: 3.2,
  crouch: 2.0,
  accel: 5.5,
  airAccel: 12,
  airCap: 0.75,
  friction: 5.2,
  stopSpeed: 2.5,
  gravity: 20,
  jump: 7.0,
  maxAir: 9.5,
};

export const PART_MULT = { head: 4, body: 1, legs: 0.75 };
