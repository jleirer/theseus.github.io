// constants.js — shared game constants

export const SCREEN_W  = 960;
export const SCREEN_H  = 540;
export const HALF_W    = SCREEN_W / 2;
export const HALF_H    = SCREEN_H / 2;
export const TEX       = 64;       // texture / sprite size in pixels
export const FOV_TAN   = 0.66;     // tan(~33°) → ~66° horizontal FOV

export const MOVE_SPEED    = 3.5;  // tiles / second
export const ROT_SPEED     = 2.2;  // radians / second (keyboard turn)
export const ENTITY_RADIUS = 0.28;

export const MAP_SIZES = {
  small:  { w: 32, h: 32 },
  medium: { w: 48, h: 48 },
  large:  { w: 64, h: 64 },
};

// Flat cell values
export const CELL_FLOOR = 0;
export const CELL_WALL  = 1;

// Enemy constants
export const ENEMY_HEALTH       = 80;
export const ENEMY_SPEED        = 2.4;
export const ENEMY_SIGHT        = 12;   // tiles
export const ENEMY_ATTACK_RANGE = 7;    // tiles
export const ENEMY_FIRE_RATE    = 1.4;  // seconds between shots
export const ENEMY_DAMAGE       = 9;

// Minion stat blocks
export const MINION_STATS = {
  scout: {
    health: 60, speed: 4.5, attackDamage: 12, sight: 10,
    attackRange: 6, fireRate: 0.9, exploreRadius: 5,
    color: [40, 220, 220],  // cyan
    desc: 'Fast. Reveals the map. Light combat.',
  },
  guard: {
    health: 180, speed: 2.0, attackDamage: 22, sight: 8,
    attackRange: 5, fireRate: 1.1, exploreRadius: 3,
    color: [50, 80, 230],   // blue
    desc: 'Slow. High health. Stays near you.',
  },
  hunter: {
    health: 100, speed: 3.5, attackDamage: 18, sight: 14,
    attackRange: 7, fireRate: 0.8, exploreRadius: 3,
    color: [150, 40, 210],  // purple
    desc: 'Seeks and destroys enemies.',
  },
};

// Weapons (unlimited ammo)
export const WEAPONS = {
  pistol:  { name: 'Pilum',    damage: 22,  fireRate: 1.5, spread: 0.02,  pellets: 1, splash: 0,   penetrating: false, color: '#909090', tier: 0 },
  shotgun: { name: 'Funda',    damage: 16,  fireRate: 0.9, spread: 0.18,  pellets: 6, splash: 0,   penetrating: false, color: '#8b6914', tier: 1 },
  smg:     { name: 'Arcus',    damage: 11,  fireRate: 7.5, spread: 0.09,  pellets: 1, splash: 0,   penetrating: false, color: '#6b3a1f', tier: 1 },
  rocket:  { name: 'Onager',   damage: 90,  fireRate: 0.5, spread: 0.005, pellets: 1, splash: 2.2, penetrating: false, color: '#8b4513', tier: 2 },
  plasma:  { name: 'Scorpio',  damage: 38,  fireRate: 4.0, spread: 0.01,  pellets: 1, splash: 0,   penetrating: false, color: '#b87333', tier: 2 },
  bfg:     { name: 'Falarica', damage: 320, fireRate: 0.3, spread: 0,     pellets: 1, splash: 4.5, penetrating: false, color: '#cc4400', tier: 3 },
  railgun: { name: 'Hasta',    damage: 190, fireRate: 0.6, spread: 0,     pellets: 1, splash: 0,   penetrating: true,  color: '#909090', tier: 3 },
};

// Tech tree prerequisites
export const TECH_PREREQS = {
  pistol:  [],
  shotgun: ['pistol'],
  smg:     ['pistol'],
  rocket:  ['shotgun'],
  plasma:  ['smg'],
  bfg:     ['rocket'],
  railgun: ['plasma'],
};

// Tech tree node screen positions (for the cache-prompt UI, relative to overlay)
// Overlay is 700×460, centered on screen
export const TECH_NODE_POS = {
  pistol:  { x: 350, y:  60 },
  shotgun: { x: 175, y: 150 },
  smg:     { x: 525, y: 150 },
  rocket:  { x: 175, y: 250 },
  plasma:  { x: 525, y: 250 },
  bfg:     { x: 175, y: 350 },
  railgun: { x: 525, y: 350 },
};
