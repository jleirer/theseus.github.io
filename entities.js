// entities.js — player, enemy, minion, cache entities + update logic
import {
  MOVE_SPEED, ROT_SPEED, ENTITY_RADIUS,
  ENEMY_HEALTH, ENEMY_SPEED, ENEMY_SIGHT, ENEMY_ATTACK_RANGE,
  ENEMY_FIRE_RATE, ENEMY_DAMAGE,
  MINION_STATS, WEAPONS, ALTAR_GODS,
} from './constants.js';
import { findPath, hasLOS, randomNearbyFloor } from './pathfinding.js';
import { getPlayerWeaponStats } from './weapons.js';
import { playSfx } from './audio.js';

// ─── Player ───────────────────────────────────────────────────────────────────

export function createPlayer(startPos) {
  return {
    x: startPos.x, y: startPos.y, angle: startPos.angle || 0,
    health: 100, maxHealth: 100,
    armor: 0, maxArmor: 100,
    weapons: new Set(['pistol']),
    weaponUpgrades: {},
    activeWeapon: 'pistol',
    fireTimer: 0,
    kills: 0,
    isMoving: false,
    bobTimer: 0,
    input: { forward: false, back: false, strafeL: false, strafeR: false, mouseDX: 0 },
  };
}

export function grantArmor(player, amount = 35) {
  player.armor = Math.min(player.maxArmor || 100, (player.armor || 0) + amount);
  return player.armor;
}

function applyDamageToPlayer(player, amount) {
  const armor = player.armor || 0;
  const absorb = Math.min(armor, Math.ceil(amount * 0.65));
  player.armor = armor - absorb;
  player.health -= amount - absorb;
}

// ─── Enemy ────────────────────────────────────────────────────────────────────

let eid = 0;
export function createEnemy(x, y, index) {
  const enemy = {
    id: eid++, type: 'enemy',
    x, y, angle: Math.random() * Math.PI * 2,
    health: ENEMY_HEALTH, maxHealth: ENEMY_HEALTH,
    dead: false,
    aiState: 'patrol',
    alertTimer: 0,
    fireTimer: (index || 0) * 0.25,   // stagger initial fire timers
    pathCooldown: (index || 0) * 0.12,
    timeSincePlayerSeen: 999,
    lastKnownPX: x, lastKnownPY: y,
    patrolTarget: null,
    path: null,
    spriteId: 0,  // 0 = enemy
    hitTimer: 0,
    weaponTier: 0,
    damageMult: 1.0,
    speedMult: 1.0,
    isReinforcement: false,
    thinkTimer: ((index || 0) % 6) * 0.04,
    variant: 'raider',
  };
  return enemy;
}

const ENEMY_VARIANTS = {
  raider: {
    label: 'RAIDER',
    healthMult: 1.0,
    speedMult: 1.0,
    damageMult: 1.0,
    sightMult: 1.0,
    attackRangeMult: 1.0,
    fireRateMult: 1.0,
  },
  charger: {
    label: 'CHARGER',
    healthMult: 0.85,
    speedMult: 1.45,
    damageMult: 1.15,
    sightMult: 1.1,
    attackRangeMult: 0.7,
    fireRateMult: 1.2,
  },
  sentinel: {
    label: 'SENTINEL',
    healthMult: 1.35,
    speedMult: 0.8,
    damageMult: 1.2,
    sightMult: 1.15,
    attackRangeMult: 1.2,
    fireRateMult: 0.9,
  },
};

function configureEnemyVariant(enemy, variant = 'raider', floor = 1, opts = {}) {
  const cfg = ENEMY_VARIANTS[variant] || ENEMY_VARIANTS.raider;
  const floorScale = 1 + Math.max(0, floor - 1) * 0.18;
  const elite = !!opts.elite;
  enemy.variant = variant;
  enemy.variantLabel = elite ? `ELITE ${cfg.label}` : cfg.label;
  enemy.isElite = elite;
  enemy.health = Math.round(ENEMY_HEALTH * cfg.healthMult * floorScale * (elite ? 1.45 : 1));
  enemy.maxHealth = enemy.health;
  enemy.speedMult *= cfg.speedMult * (elite ? 1.08 : 1);
  enemy.damageMult *= cfg.damageMult * (1 + Math.max(0, floor - 1) * 0.1) * (elite ? 1.22 : 1);
  enemy.sight = ENEMY_SIGHT * cfg.sightMult;
  enemy.attackRange = ENEMY_ATTACK_RANGE * cfg.attackRangeMult;
  enemy.fireRateScale = cfg.fireRateMult * (elite ? 1.08 : 1);
  enemy.spriteScale = (variant === 'sentinel' ? 1.08 : variant === 'charger' ? 0.94 : 1) * (elite ? 1.12 : 1);
  enemy.variantTint = variant === 'sentinel'
    ? [90, 170, 255]
    : variant === 'charger'
      ? [255, 110, 70]
      : [255, 210, 120];
  if (elite) {
    enemy.variantTint = [
      Math.min(255, enemy.variantTint[0] + 20),
      Math.min(255, enemy.variantTint[1] + 18),
      Math.min(255, enemy.variantTint[2] + 10),
    ];
  }
  if (variant === 'charger') enemy.aiState = 'chase';
  if (variant === 'sentinel') enemy.pathCooldown *= 1.25;
  return enemy;
}

// ─── Minion ───────────────────────────────────────────────────────────────────

export function createMinion(type, x, y) {
  const stats = MINION_STATS[type];
  return {
    id: eid++, type: 'minion', minionType: type,
    x, y, angle: 0,
    health: stats.health, maxHealth: stats.health,
    speed: stats.speed,
    attackDamage: stats.attackDamage,
    sight: stats.sight,
    attackRange: stats.attackRange,
    fireRate: stats.fireRate,
    exploreRadius: stats.exploreRadius,
    dead: false,
    aiState: 'explore',  // 'explore' | 'follow' | 'attack'
    targetEnemy: null,
    exploreTarget: null,
    pathCooldown: Math.random() * 0.4,
    fireTimer: 0,
    path: null,
    spriteId: type === 'scout' ? 3 : type === 'guard' ? 4 : 5,
    thinkTimer: Math.random() * 0.12,
  };
}

// ─── Cache / Exit ─────────────────────────────────────────────────────────────

export function createCache(x, y, id) {
  return { id, type: 'cache', x, y, found: false, spriteId: 1 };
}

export function createExit(x, y) {
  return { type: 'exit', x, y, spriteId: 2 };
}

export function createHealthPack(x, y, size) {
  return { type: 'healthPack', x, y, size, hp: size === 'small' ? 10 : 0, collected: false, spriteId: size === 'small' ? 6 : 7 };
}

export function createAltar(x, y, godId) {
  return { type: 'altar', x, y, godId, used: false, spriteId: 11 };
}

// ─── Collision ────────────────────────────────────────────────────────────────

function solid(cells, mapW, mapH, x, y) {
  const r = ENTITY_RADIUS;
  const corners = [[x-r,y-r],[x+r,y-r],[x-r,y+r],[x+r,y+r]];
  return corners.some(([cx,cy]) => {
    const tx = Math.floor(cx), ty = Math.floor(cy);
    if (tx < 0 || ty < 0 || tx >= mapW || ty >= mapH) return true; // treat out-of-bounds as solid
    return cells[ty * mapW + tx] !== 0;
  });
}

function moveEntity(ent, dx, dy, cells, mapW, mapH) {
  if (!solid(cells, mapW, mapH, ent.x + dx, ent.y))       ent.x += dx;
  if (!solid(cells, mapW, mapH, ent.x,      ent.y + dy))   ent.y += dy;
}

// ─── Player update ────────────────────────────────────────────────────────────

export function updatePlayer(state, dt) {
  const p  = state.player;
  const { cells, map } = state;
  const { input } = p;

  // Rotation: mouse + keyboard
  const mouseRot = input.mouseDX * 0.0022;
  input.mouseDX = 0;
  const keyRot = (state.keys?.ArrowRight ? 1 : 0) - (state.keys?.ArrowLeft ? 1 : 0);
  p.angle += mouseRot + keyRot * ROT_SPEED * dt;

  const cos = Math.cos(p.angle), sin = Math.sin(p.angle);
  const perpX = -sin, perpY = cos;

  let dx = 0, dy = 0;
  const spd = MOVE_SPEED * (p.speedMult || 1);
  if (input.forward)  { dx += cos * spd * dt; dy += sin * spd * dt; }
  if (input.back)     { dx -= cos * spd * dt; dy -= sin * spd * dt; }
  if (input.strafeL)  { dx += perpX * spd * dt; dy += perpY * spd * dt; }
  if (input.strafeR)  { dx -= perpX * spd * dt; dy -= perpY * spd * dt; }

  p.isMoving = (dx !== 0 || dy !== 0);
  if (p.isMoving) p.bobTimer += dt * 8;

  moveEntity(p, dx, dy, cells, map.w, map.h);
  if (p.fireTimer > 0) p.fireTimer -= dt;
}

// ─── Shooting ─────────────────────────────────────────────────────────────────

function rayCircleT(rx, ry, rdx, rdy, cx, cy, radius) {
  const ex = cx - rx, ey = cy - ry;
  const t  = ex * rdx + ey * rdy;
  if (t < 0.1) return null;
  const px = ex - rdx * t, py = ey - rdy * t;
  const d2 = px*px + py*py;
  if (d2 > radius * radius) return null;
  return t - Math.sqrt(radius * radius - d2);
}

const MUZZLE_COLORS = {
  pistol: '#ffeeaa', shotgun: '#ddaa55', smg: '#ffcc88',
  rocket: '#ff5500', plasma: '#ffaa33', bfg: '#ff4400',
};

const PROJECTILE_STATS = {
  rocket: { speed: 23.0, radius: 0.16, life: 1.6, spawnOffset: 0.9, splash: WEAPONS.rocket.splash },
  plasma: { speed: 37.0, radius: 0.11, life: 1.0, spawnOffset: 0.78, splash: 0 },
  bfg:    { speed: 17.2, radius: 0.22, life: 1.5, spawnOffset: 0.95, splash: WEAPONS.bfg.splash },
};

function createProjectile(kind, x, y, angle, owner, damageMult = 1) {
  const stats = PROJECTILE_STATS[kind] || { speed: 8, radius: 0.12, life: 1.0, splash: 0 };
  return {
    type: 'projectile',
    kind,
    owner,
    x,
    y,
    prevX: x,
    prevY: y,
    vx: Math.cos(angle) * stats.speed,
    vy: Math.sin(angle) * stats.speed,
    angle,
    radius: stats.radius,
    life: stats.life,
    splash: stats.splash,
    damage: WEAPONS[kind]?.damage || 0,
    damageMult,
  };
}

export function shootPlayer(state) {
  const p = state.player;
  if (p.fireTimer > 0) return;
  const weapon = getPlayerWeaponStats(p, p.activeWeapon);
  p.fireTimer = 1 / (weapon.fireRate * (p.fireRateMult || 1));
  playSfx(`fire_${p.activeWeapon}`);

  if (PROJECTILE_STATS[p.activeWeapon]) {
    const spread = (Math.random() - 0.5) * weapon.spread;
    const angle = p.angle + spread;
    const spawnOffset = PROJECTILE_STATS[p.activeWeapon].spawnOffset;
    const muzzleX = p.x + Math.cos(angle) * spawnOffset;
    const muzzleY = p.y + Math.sin(angle) * spawnOffset;
    state.projectiles.push(createProjectile(p.activeWeapon, muzzleX, muzzleY, angle, 'player', p.damageMult || 1));
    state.projectiles[state.projectiles.length - 1].damage = weapon.damage;
    if (state.effects) {
      state.effects.push({ type: 'muzzle', timer: 0.12, maxTimer: 0.12, color: MUZZLE_COLORS[p.activeWeapon] || '#ffff88' });
    }
    return;
  }

  const pellets = weapon.pellets || 1;
  const alreadyHit = new Set();
  let anyHit = false;

  for (let pel = 0; pel < pellets; pel++) {
    const spread = (Math.random() - 0.5) * weapon.spread;
    const ang = p.angle + spread;
    const rdx = Math.cos(ang), rdy = Math.sin(ang);

    if (weapon.penetrating) {
      // Rail gun hits ALL enemies along ray
      for (const e of state.enemies) {
        if (e.dead) continue;
        const t = rayCircleT(p.x, p.y, rdx, rdy, e.x, e.y, ENTITY_RADIUS + 0.1);
        if (t !== null && hasLOS(state.cells, state.map.w, state.map.h, p.x, p.y, e.x, e.y)) {
          damageEnemy(e, Math.round(weapon.damage * (p.damageMult || 1)), state);
          anyHit = true;
        }
      }
    } else {
      let bestT = Infinity, bestE = null;
      for (const e of state.enemies) {
        if (e.dead || alreadyHit.has(e.id)) continue;
        const t = rayCircleT(p.x, p.y, rdx, rdy, e.x, e.y, ENTITY_RADIUS + 0.1);
        if (t !== null && t < bestT && hasLOS(state.cells, state.map.w, state.map.h, p.x, p.y, e.x, e.y)) {
          bestT = t; bestE = e;
        }
      }
      if (bestE) { alreadyHit.add(bestE.id); damageEnemy(bestE, Math.round(weapon.damage * (p.damageMult || 1)), state); anyHit = true; }
    }
  }

  // Splash damage
  if (weapon.splash > 0) {
    // Estimate impact point: first enemy hit or wall
    let impactX = p.x + Math.cos(p.angle) * 8;
    let impactY = p.y + Math.sin(p.angle) * 8;
    for (const e of state.enemies) {
      if (e.dead) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 10 && hasLOS(state.cells, state.map.w, state.map.h, p.x, p.y, e.x, e.y)) {
        impactX = e.x; impactY = e.y; break;
      }
    }
    for (const e of state.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - impactX, e.y - impactY);
      if (d <= weapon.splash) {
        const falloff = 1 - d / weapon.splash;
        damageEnemy(e, Math.floor(weapon.damage * (p.damageMult || 1) * falloff), state);
      }
    }
  }

  // Visual effects
  if (state.effects) {
    if (p.activeWeapon === 'railgun') {
      state.effects.push({ type: 'railBeam', timer: 0.18, maxTimer: 0.18, color: '#00ffcc' });
    } else {
      state.effects.push({ type: 'muzzle', timer: 0.12, maxTimer: 0.12, color: MUZZLE_COLORS[p.activeWeapon] || '#ffff88' });
    }
    if (weapon.splash > 0) state.effects.push({ type: 'explode', timer: 0.35, maxTimer: 0.35 });
    if (anyHit) state.effects.push({ type: 'hit', timer: 0.08, maxTimer: 0.08 });
  }
}

function damageEnemy(enemy, dmg, state) {
  enemy.health -= dmg;
  enemy.hitTimer = 0.15;
  if (enemy.health <= 0 && !enemy.dead) {
    playSfx(enemy.isBoss ? 'explosion' : 'enemy_kill');
    enemy.dead = true;
    state.player.kills++;
    if (enemy.isBoss) {
      state.healthPacks.push(createHealthPack(enemy.x, enemy.y, 'large'));
      state.exitOpen = true;
      if (enemy.bossName) (state.defeatedBosses = state.defeatedBosses || []).push(enemy.bossName);
    } else if (Math.random() < 0.3) {
      state.healthPacks.push(createHealthPack(enemy.x, enemy.y, 'small'));
    }
    checkDomination(state);
  } else {
    playSfx('enemy_hit');
  }
}

function explodeProjectile(projectile, x, y, state) {
  const weapon = WEAPONS[projectile.kind];
  if (!weapon) return;
  const damageScale = projectile.damageMult || 1;
  let anyHit = false;
  if (projectile.splash > 0) {
    for (const e of state.enemies) {
      if (e.dead) continue;
      const dx = e.x - x, dy = e.y - y;
      const d = Math.hypot(dx, dy);
      if (d > projectile.splash) continue;
      const falloff = Math.max(0, 1 - d / projectile.splash);
      const dmg = Math.floor(projectile.damage * damageScale * falloff);
      if (dmg <= 0) continue;
      damageEnemy(e, dmg, state);
      anyHit = true;
    }
  } else if (projectile.target && !projectile.target.dead) {
    damageEnemy(projectile.target, Math.round(projectile.damage * damageScale), state);
    anyHit = true;
  }
  state.effects?.push({
    type: projectile.splash > 0 ? 'explode' : 'impact',
    timer: projectile.splash > 0 ? 0.35 : 0.18,
    maxTimer: projectile.splash > 0 ? 0.35 : 0.18,
    worldX: x,
    worldY: y,
    radius: projectile.splash || projectile.radius * 3,
    color: projectile.kind === 'plasma' ? '#55ddff' : projectile.kind === 'bfg' ? '#ff7733' : '#ffbb33',
  });
  playSfx('explosion');
  if (anyHit) state.effects?.push({ type: 'hit', timer: 0.08, maxTimer: 0.08 });
}

function updateProjectiles(state, dt) {
  if (!state.projectiles || state.projectiles.length === 0) return;
  const { cells, map, enemies } = state;

  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    p.prevX = p.x;
    p.prevY = p.y;
    p.life -= dt;
    if (p.life <= 0) {
      explodeProjectile(p, p.x, p.y, state);
      state.projectiles.splice(i, 1);
      continue;
    }

    const stepDist = Math.max(0.08, p.radius * 0.7);
    const moveX = p.vx * dt;
    const moveY = p.vy * dt;
    const totalDist = Math.hypot(moveX, moveY);
    const steps = Math.max(1, Math.ceil(totalDist / stepDist));
    let hit = false;

    for (let s = 0; s < steps; s++) {
      p.x += moveX / steps;
      p.y += moveY / steps;

      const tx = Math.floor(p.x), ty = Math.floor(p.y);
      if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h || cells[ty * map.w + tx] !== 0) {
        p.x -= moveX / steps;
        p.y -= moveY / steps;
        explodeProjectile(p, p.x, p.y, state);
        hit = true;
        break;
      }

      if (p.owner === 'player') {
        for (const e of enemies) {
          if (e.dead) continue;
          const dx = e.x - p.x, dy = e.y - p.y;
          const hitR = ENTITY_RADIUS + p.radius;
          if (dx*dx + dy*dy <= hitR * hitR) {
            p.target = e;
            explodeProjectile(p, p.x, p.y, state);
            hit = true;
            break;
          }
        }
        if (hit) break;
      }
    }

    if (hit) {
      state.projectiles.splice(i, 1);
      continue;
    }

    p.angle = Math.atan2(p.vy, p.vx);
  }
}

function checkDomination(state) {
  if (!state.enemies.every(e => e.dead)) return;
  if (state.wave >= 3) {
    // exitOpen already set by damageEnemy; just prompt the player
    state.waveMessage = { text: 'THE PATH IS OPEN', subtitle: 'REACH THE EXIT TO DESCEND', timer: 3.5 };
  } else if (state.wave === 2) {
    spawnBoss(state);
  } else {
    spawnNextWave(state);
  }
}

function spawnBoss(state) {
  state.wave = 3;
  const floor = state.floor || 1;

  let bossHealth, bossSpriteId, bossDamageMult, bossSpeedMult, bossScale, bossScaleX, bossText, bossSub, bossName;
  if (floor === 1) {
    bossHealth = 400; bossSpriteId = 9; bossDamageMult = 2.0; bossSpeedMult = 1.4; bossScale = 1.35; bossScaleX = 1.9;
    bossText = 'THE MEGA-TAUR RISES'; bossSub = 'A BEAST WITHOUT EQUAL';
    bossName = 'MEGA-TAUR';
  } else if (floor === 2) {
    bossHealth = 600; bossSpriteId = 8; bossDamageMult = 3.0; bossSpeedMult = 1.2; bossScale = 1.0;
    bossText = 'NERO DESCENDS UPON YOU'; bossSub = 'THE EMPEROR OF ROME HAS COME TO FINISH YOU';
    bossName = 'NERO';
  } else {
    bossHealth = 900; bossSpriteId = 10; bossDamageMult = 4.0; bossSpeedMult = 1.5; bossScale = 1.5;
    bossText = 'HADES WALKS AMONG THE LIVING'; bossSub = 'THE GOD OF THE DEAD CLAIMS HIS DOMAIN';
    bossName = 'HADES';
  }
  state.waveMessage = { text: bossText, subtitle: bossSub, timer: 4.0, isBoss: true };

  const rooms = state.map.rooms;
  if (!rooms || rooms.length === 0) { state.exitOpen = true; return; }
  const px = state.player.x, py = state.player.y;
  let farthest = rooms[0], maxDist = 0;
  for (const r of rooms) {
    const d = Math.hypot(r.x + r.w / 2 - px, r.y + r.h / 2 - py);
    if (d > maxDist) { maxDist = d; farthest = r; }
  }

  const boss = createEnemy(farthest.x + farthest.w / 2 + 0.5, farthest.y + farthest.h / 2 + 0.5, 0);
  boss.health    = bossHealth;
  boss.maxHealth = bossHealth;
  boss.speedMult = bossSpeedMult;
  boss.damageMult = bossDamageMult;
  boss.spriteId  = bossSpriteId;
  boss.spriteScale  = bossScale;
  boss.spriteScaleX = bossScaleX;
  boss.bossName  = bossName;
  boss.isBoss    = true;
  boss.aiState   = 'chase';
  boss.lastKnownPX = px;
  boss.lastKnownPY = py;
  state.enemies.push(boss);
}

function spawnNextWave(state) {
  state.wave = 2;
  state.waveMessage = { text: 'WAVE 2 — THE HORDE AWAKENS', timer: 3.5 };

  const { map } = state;
  const rooms = map.rooms;
  if (!rooms || rooms.length === 0) { triggerVictory(state, 'domination'); return; }
  const numNew = state.settings.numEnemies + 2;

  for (let i = 0; i < numNew; i++) {
    const room = rooms[i % rooms.length];
    const x = room.x + 1 + Math.random() * Math.max(0, room.w - 2) + 0.5;
    const y = room.y + 1 + Math.random() * Math.max(0, room.h - 2) + 0.5;
    const roomType = room.roomType || 'skirmish';
    const variant = roomType === 'chokepoint' ? 'sentinel' : roomType === 'arena' ? 'charger' : roomType === 'cacheGuard' ? 'sentinel' : Math.random() < 0.5 ? 'raider' : 'sentinel';
    const elite = roomType === 'arena' && i === 0;
    const e = createWaveEnemy(x, y, i, state.floor || 1, variant, { elite });
    e.health = Math.round(e.health * 1.2);
    e.maxHealth = e.health;
    e.speedMult *= 1.18;
    e.damageMult *= 1.2;
    e.aiState = 'chase';
    e.lastKnownPX = state.player.x;
    e.lastKnownPY = state.player.y;
    state.enemies.push(e);
  }

  // If every cache has already been found, spawn a fresh wave of caches too
  if (state.caches.length > 0 && state.caches.every(c => c.found)) {
    spawnCacheWave(state);
  }
}

function spawnCacheWave(state) {
  const rooms = state.map.rooms;
  const numNew = Math.max(2, Math.floor(rooms.length / 4));
  const used = new Set([0]); // keep start room clear

  for (const c of state.caches) {
    const ri = rooms.findIndex(r =>
      Math.abs(c.x - (r.x + r.w / 2 + 0.5)) < 1.5 &&
      Math.abs(c.y - (r.y + r.h / 2 + 0.5)) < 1.5
    );
    if (ri >= 0) used.add(ri);
  }

  let nextId = state.caches.reduce((m, c) => Math.max(m, c.id), -1) + 1;
  for (let i = 0; i < numNew; i++) {
    let ri = 0, att = 0;
    while (used.has(ri) && att++ < 30) ri = Math.floor(Math.random() * rooms.length);
    used.add(ri);
    const r = rooms[ri];
    state.caches.push(createCache(r.x + r.w / 2 + 0.5, r.y + r.h / 2 + 0.5, nextId++));
  }
}

function triggerVictory(state, type) {
  if (state.phase === 'playing') { state.phase = 'victory'; state.victoryType = type; }
}

function applyAltarBoon(player, altar, state) {
  const god = ALTAR_GODS[altar.godId];
  if (!god) return;
  let boon = god.boon;
  if (boon === 'random') {
    const options = ['damageMult', 'speedMult', 'fireRateMult', 'heal'];
    boon = options[Math.floor(Math.random() * options.length)];
  }
  if (boon === 'damageMult')   player.damageMult   = (player.damageMult   || 1) * 1.3;
  if (boon === 'speedMult')    player.speedMult    = (player.speedMult    || 1) * 1.3;
  if (boon === 'fireRateMult') player.fireRateMult = (player.fireRateMult || 1) * 1.3;
  if (boon === 'heal')         player.health = player.maxHealth;
  if (boon === 'revealMap') {
    for (let i = 0; i < state.explored.length; i++) {
      if (state.cells[i] === 0) state.explored[i] = 1;
    }
  }
  const boonDescs = {
    damageMult: '+30% Weapon Damage', speedMult: '+30% Movement Speed',
    fireRateMult: '+30% Fire Rate', heal: 'Health Restored', revealMap: 'Labyrinth Revealed',
  };
  state.waveMessage = {
    text: `BLESSED BY ${god.name.toUpperCase()}`,
    subtitle: boonDescs[boon] || '',
    timer: 3.0, isBless: true, godColor: god.color,
  };
  playSfx('altar');
}

// ─── Enemy AI ─────────────────────────────────────────────────────────────────

function updateEnemy(enemy, dt, state) {
  if (enemy.dead) return;
  enemy.fireTimer    -= dt;
  enemy.pathCooldown -= dt;
  enemy.thinkTimer   -= dt;
  if (enemy.hitTimer > 0) enemy.hitTimer = Math.max(0, enemy.hitTimer - dt);

  const { player } = state;
  const dx = player.x - enemy.x, dy = player.y - enemy.y;
  const dist2 = dx*dx + dy*dy;
  const dist = Math.sqrt(dist2);

  if (enemy.thinkTimer <= 0) {
    thinkEnemy(enemy, state, dist, dist2);
    enemy.thinkTimer = enemy.aiState === 'attack' ? 0.08 : enemy.aiState === 'chase' ? 0.14 : 0.22;
  } else if (enemy.aiState === 'alert') {
    enemy.alertTimer -= dt;
    if (enemy.alertTimer <= 0) enemy.aiState = 'patrol';
  }

  doEnemyAction(enemy, dt, dist, state);

  checkEnemyCacheInteraction(enemy, state);
}

function thinkEnemy(enemy, state, dist, dist2) {
  const { cells, map, player } = state;
  const sight = enemy.sight || ENEMY_SIGHT;
  const playerVis = dist2 < sight * sight &&
    hasLOS(cells, map.w, map.h, enemy.x, enemy.y, player.x, player.y);

  if (playerVis) {
    enemy.timeSincePlayerSeen = 0;
    enemy.lastKnownPX = player.x;
    enemy.lastKnownPY = player.y;
  } else {
    enemy.timeSincePlayerSeen += Math.max(0.12, enemy.thinkTimer > 0 ? enemy.thinkTimer : 0.18);
  }

  switch (enemy.aiState) {
    case 'patrol':
      if (playerVis) enemy.aiState = 'chase';
      break;
    case 'alert':
      enemy.alertTimer -= Math.max(0.12, enemy.thinkTimer > 0 ? enemy.thinkTimer : 0.18);
      if (playerVis) enemy.aiState = 'chase';
      else if (enemy.alertTimer <= 0) enemy.aiState = 'patrol';
      break;
    case 'chase':
      if (!playerVis && enemy.timeSincePlayerSeen > 3.5) {
        enemy.aiState = 'alert';
        enemy.alertTimer = 3;
      } else if (playerVis && dist <= (enemy.attackRange || ENEMY_ATTACK_RANGE)) {
        enemy.aiState = 'attack';
      }
      break;
    case 'attack':
      if (!playerVis || dist > (enemy.attackRange || ENEMY_ATTACK_RANGE) * 1.3) enemy.aiState = 'chase';
      break;
  }

  if (enemy.aiState === 'chase' && playerVis && dist < 6) {
    enemy.path = null;
  }
}

function doEnemyAction(enemy, dt, dist, state) {
  switch (enemy.aiState) {
    case 'patrol':
      doEnemyPatrol(enemy, dt, state);
      break;
    case 'alert':
      enemy.angle += dt * 1.2;
      break;
    case 'chase':
      doEnemyChase(enemy, dt, state);
      break;
    case 'attack':
      doEnemyAttack(enemy, dt, dist, state);
      break;
  }
}

function findNearbyCache(enemy, state, radius = 15) {
  let best = null, bestD = Infinity;
  for (const c of state.caches) {
    if (c.found) continue;
    const d = Math.hypot(c.x - enemy.x, c.y - enemy.y);
    if (d < radius && d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function checkEnemyCacheInteraction(enemy, state) {
  for (const c of state.caches) {
    if (c.found) continue;
    if (Math.hypot(enemy.x - c.x, enemy.y - c.y) >= 0.9) continue;
    c.found = true;
    c.enemyLooted = true;
    const reinforcements = state.enemies.filter(e => e.isReinforcement && !e.dead).length;
    if (reinforcements < state.settings.numEnemies && Math.random() < 0.35) {
      spawnEnemyReinforcement(state, enemy.x, enemy.y);
    } else {
      enemy.weaponTier = Math.min(3, enemy.weaponTier + 1);
      enemy.damageMult = 1 + enemy.weaponTier * 0.5;
    }
    return;
  }
}

function spawnEnemyReinforcement(state, x, y) {
  const { cells, map } = state;
  let spawnX = x, spawnY = y;
  const angles = [0, Math.PI/2, Math.PI, 3*Math.PI/2, Math.PI/4, 3*Math.PI/4, 5*Math.PI/4, 7*Math.PI/4];
  for (const a of angles) {
    const nx = x + Math.cos(a) * 1.8, ny = y + Math.sin(a) * 1.8;
    const tx = Math.floor(nx), ty = Math.floor(ny);
    if (tx >= 0 && ty >= 0 && tx < map.w && ty < map.h && cells[ty * map.w + tx] === 0) {
      spawnX = nx; spawnY = ny; break;
    }
  }
  const e = createWaveEnemy(spawnX, spawnY, state.enemies.length, state.floor || 1, Math.random() < 0.5 ? 'raider' : 'charger');
  e.isReinforcement = true;
  e.aiState = 'chase';
  e.lastKnownPX = state.player.x;
  e.lastKnownPY = state.player.y;
  state.enemies.push(e);
}

function doEnemyPatrol(enemy, dt, state) {
  const { cells, map } = state;
  const nearCache = findNearbyCache(enemy, state);
  if (nearCache) {
    // Head toward cache
    if (enemy.pathCooldown <= 0) {
      enemy.patrolTarget = nearCache;
      enemy.path = findPath(cells, map.w, map.h, enemy.x, enemy.y, nearCache.x, nearCache.y);
      enemy.pathCooldown = 1.0;
    }
  } else {
    if (!enemy.patrolTarget ||
        (Math.abs(enemy.x - enemy.patrolTarget.x) < 0.3 &&
         Math.abs(enemy.y - enemy.patrolTarget.y) < 0.3)) {
      enemy.patrolTarget = randomNearbyFloor(cells, map.w, map.h, enemy.x, enemy.y, 8);
      enemy.path = null;
    }
    if (enemy.pathCooldown <= 0 && enemy.patrolTarget) {
      enemy.path = findPath(cells, map.w, map.h, enemy.x, enemy.y, enemy.patrolTarget.x, enemy.patrolTarget.y);
      enemy.pathCooldown = 1.5;
    }
  }
  walkPath(enemy, dt, ENEMY_SPEED * 0.45 * enemy.speedMult, state);
}

function doEnemyChase(enemy, dt, state) {
  const { cells, map, player } = state;
  if (hasLOS(cells, map.w, map.h, enemy.x, enemy.y, player.x, player.y)) {
    walkToward(enemy, dt, player.x, player.y, ENEMY_SPEED * enemy.speedMult, state);
    return;
  }
  if (enemy.pathCooldown <= 0 || !enemy.path || enemy.path.length === 0) {
    enemy.path = findPath(cells, map.w, map.h, enemy.x, enemy.y, enemy.lastKnownPX, enemy.lastKnownPY);
    enemy.pathCooldown = 0.9;
  }
  walkPath(enemy, dt, ENEMY_SPEED * enemy.speedMult, state);
}

function doEnemyAttack(enemy, dt, dist, state) {
  const { player } = state;
  const dx = player.x - enemy.x, dy = player.y - enemy.y;
  enemy.angle = Math.atan2(dy, dx);
  if (enemy.fireTimer > 0) return;
  enemy.fireTimer = ENEMY_FIRE_RATE / (enemy.fireRateScale || 1);
  const hitChance = Math.max(0.15, 1 - dist / ((enemy.attackRange || ENEMY_ATTACK_RANGE) * 1.5));
  if (Math.random() < hitChance) {
    applyDamageToPlayer(state.player, Math.round(ENEMY_DAMAGE * enemy.damageMult));
    if (state.player.health <= 0) { state.player.health = 0; state.phase = 'gameOver'; }
    state.effects?.push({ type: 'playerHit', timer: 0.25, maxTimer: 0.25 });
    playSfx('player_hit');
  }
}

// ─── Minion AI ────────────────────────────────────────────────────────────────

function updateMinion(minion, dt, state) {
  if (minion.dead) return;
  minion.fireTimer    -= dt;
  minion.pathCooldown -= dt;
  minion.thinkTimer   -= dt;

  switch (minion.minionType) {
    case 'scout':  updateScout(minion, dt, state);  break;
    case 'guard':  updateGuard(minion, dt, state);  break;
    case 'hunter': updateHunter(minion, dt, state); break;
  }
}

function nearestEnemy(minion, state) {
  let best = null, bestD = Infinity;
  for (const e of state.enemies) {
    if (e.dead) continue;
    const dx = e.x - minion.x, dy = e.y - minion.y;
    const d2 = dx*dx + dy*dy;
    if (d2 < minion.sight * minion.sight && d2 < bestD &&
        hasLOS(state.cells, state.map.w, state.map.h, minion.x, minion.y, e.x, e.y)) {
      bestD = d2; best = e;
    }
  }
  return best;
}

function minionAttack(minion, enemy, dt, state) {
  const d = Math.hypot(enemy.x - minion.x, enemy.y - minion.y);
  if (d > minion.attackRange) return;
  minion.angle = Math.atan2(enemy.y - minion.y, enemy.x - minion.x);
  if (minion.fireTimer > 0) return;
  minion.fireTimer = minion.fireRate;
  if (Math.random() < 0.7) {
    damageEnemy(enemy, minion.attackDamage, state);
  }
}

function updateScout(minion, dt, state) {
  const { cells, map, explored } = state;
  const enemy = nearestEnemy(minion, state);

  if (enemy) {
    // Attack mode
    minion.aiState = 'attack';
    walkToward(minion, dt, enemy.x, enemy.y, minion.speed, state);
    minionAttack(minion, enemy, dt, state);
    return;
  }
  // Explore: seek nearest unexplored floor tile
  minion.aiState = 'explore';
  if (!minion.exploreTarget || (minion.thinkTimer <= 0 && minion.pathCooldown <= 0) ||
      Math.hypot(minion.x - minion.exploreTarget.x, minion.y - minion.exploreTarget.y) < 0.4) {
    minion.exploreTarget = findFrontierTile(explored, cells, map.w, map.h, minion.x, minion.y);
    minion.path = minion.exploreTarget
      ? findPath(cells, map.w, map.h, minion.x, minion.y, minion.exploreTarget.x, minion.exploreTarget.y)
      : null;
    minion.pathCooldown = 1.2;
    minion.thinkTimer = 0.18;
  }
  walkPath(minion, dt, minion.speed, state);
}

function updateGuard(minion, dt, state) {
  const { player, cells, map } = state;
  const enemy = nearestEnemy(minion, state);

  if (enemy) {
    minionAttack(minion, enemy, dt, state);
    if (Math.hypot(enemy.x - minion.x, enemy.y - minion.y) > minion.attackRange) {
      walkToward(minion, dt, enemy.x, enemy.y, minion.speed, state);
    }
    return;
  }
  // Follow player
  const distToPlayer = Math.hypot(player.x - minion.x, player.y - minion.y);
  if (distToPlayer > 3.0) {
    if (hasLOS(cells, map.w, map.h, minion.x, minion.y, player.x, player.y)) {
      walkToward(minion, dt, player.x, player.y, minion.speed, state);
      return;
    }
    if (minion.thinkTimer <= 0 && minion.pathCooldown <= 0) {
      minion.path = findPath(cells, map.w, map.h, minion.x, minion.y, player.x, player.y);
      minion.pathCooldown = 1.0;
      minion.thinkTimer = 0.16;
    }
  }
  walkPath(minion, dt, minion.speed, state);
}

function updateHunter(minion, dt, state) {
  const { cells, map, player } = state;
  const enemy = nearestEnemy(minion, state);
  let target = minion.targetEnemy && !minion.targetEnemy.dead ? minion.targetEnemy : null;

  if (enemy) {
    minion.targetEnemy = enemy;
    walkToward(minion, dt, enemy.x, enemy.y, minion.speed, state);
    minionAttack(minion, enemy, dt, state);
    return;
  }

  // Seek any living enemy by pathfinding
  if (minion.thinkTimer <= 0 && minion.pathCooldown <= 0) {
    target = null;
    let bestD2 = Infinity;
    for (const e of state.enemies) {
      if (e.dead) continue;
      const dx = e.x - minion.x, dy = e.y - minion.y;
      const d2 = dx*dx + dy*dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        target = e;
      }
    }
    if (target) {
      minion.path = hasLOS(cells, map.w, map.h, minion.x, minion.y, target.x, target.y)
        ? null
        : findPath(cells, map.w, map.h, minion.x, minion.y, target.x, target.y);
    } else {
      const dx = player.x - minion.x, dy = player.y - minion.y;
      if (dx*dx + dy*dy > 64) {
        minion.path = hasLOS(cells, map.w, map.h, minion.x, minion.y, player.x, player.y)
          ? null
          : findPath(cells, map.w, map.h, minion.x, minion.y, player.x, player.y);
      }
    }
    minion.pathCooldown = 0.9;
    minion.thinkTimer = 0.14;
    minion.targetEnemy = target;
  }
  if (target && hasLOS(cells, map.w, map.h, minion.x, minion.y, target.x, target.y)) {
    walkToward(minion, dt, target.x, target.y, minion.speed, state);
    minion.angle = Math.atan2(target.y - minion.y, target.x - minion.x);
    return;
  }
  walkPath(minion, dt, minion.speed, state);
}

// ─── Path/movement helpers ────────────────────────────────────────────────────

function walkPath(ent, dt, speed, state) {
  if (!ent.path || ent.path.length === 0) return;
  const tgt = ent.path[0];
  const dx = tgt.x - ent.x, dy = tgt.y - ent.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.15) { ent.path.shift(); return; }
  const nx = dx / d, ny = dy / d;
  ent.angle = Math.atan2(dy, dx);
  moveEntity(ent, nx * speed * dt, ny * speed * dt, state.cells, state.map.w, state.map.h);
}

function walkToward(ent, dt, tx, ty, speed, state) {
  const dx = tx - ent.x, dy = ty - ent.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.1) return;
  ent.angle = Math.atan2(dy, dx);
  moveEntity(ent, (dx/d) * speed * dt, (dy/d) * speed * dt, state.cells, state.map.w, state.map.h);
}

// Find an unexplored floor tile near the minion (BFS-ish: random sample of frontier)
function findFrontierTile(explored, cells, mapW, mapH, ox, oy) {
  const cx = Math.floor(ox), cy = Math.floor(oy);
  const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
  const candidates = [];
  const r = 12;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 1 || y < 1 || x >= mapW-1 || y >= mapH-1) continue;
      if (cells[y * mapW + x] !== 0) continue;
      if (!explored[y * mapW + x]) continue;  // must be explored (scout follows explored path)
      // But should be adjacent to unexplored
      for (const [ddx, ddy] of DIRS) {
        const nx = x + ddx, ny = y + ddy;
        if (nx >= 0 && ny >= 0 && nx < mapW && ny < mapH &&
            cells[ny * mapW + nx] === 0 && !explored[ny * mapW + nx]) {
          candidates.push({ x: x + 0.5, y: y + 0.5 });
          break;
        }
      }
    }
  }
  if (candidates.length === 0) return randomNearbyFloor(cells, mapW, mapH, ox, oy, 10);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ─── Exploration reveal ───────────────────────────────────────────────────────

export function updateExploration(state) {
  const { map, explored, player, minions } = state;
  revealAround(explored, map.w, map.h, player, 4);
  for (const m of minions) {
    if (!m.dead) revealAround(explored, map.w, map.h, m, m.exploreRadius);
  }
}

function revealAround(explored, mapW, mapH, entity, radius) {
  const tx = Math.floor(entity.x), ty = Math.floor(entity.y);
  // Skip if entity hasn't moved to a new tile since last reveal
  if (entity._revealTX === tx && entity._revealTY === ty) return;
  entity._revealTX = tx;
  entity._revealTY = ty;
  const r  = Math.ceil(radius);
  const r2 = radius * radius;
  for (let dy = -r; dy <= r; dy++) {
    const ny = ty + dy;
    if (ny < 0 || ny >= mapH) continue;
    const row = ny * mapW;
    for (let dx = -r; dx <= r; dx++) {
      if (dx*dx + dy*dy > r2) continue;
      const nx = tx + dx;
      if (nx >= 0 && nx < mapW) explored[row + nx] = 1;
    }
  }
}

// ─── Cache / exit detection ───────────────────────────────────────────────────

export function checkInteractions(state) {
  if (state.phase !== 'playing') return;
  const p = state.player;

  // Health pack pickup
  for (const hp of (state.healthPacks || [])) {
    if (!hp.collected && p.health < p.maxHealth && Math.hypot(p.x - hp.x, p.y - hp.y) < 0.8) {
      hp.collected = true;
      p.health = hp.size === 'large' ? p.maxHealth : Math.min(p.maxHealth, p.health + hp.hp);
      playSfx('pickup');
    }
  }

  // Cache proximity
  for (let i = 0; i < state.caches.length; i++) {
    const c = state.caches[i];
    if (!c.found && Math.hypot(p.x - c.x, p.y - c.y) < 0.9) {
      c.found = true;
      state.phase = 'cachePrompt';
      state.pendingCacheIdx = i;
      state.cacheSelection = null;
      playSfx('cache_open');
      return;
    }
  }

  // Altar proximity + interact
  let foundAltar = null;
  for (const altar of (state.altars || [])) {
    if (!altar.used && Math.hypot(p.x - altar.x, p.y - altar.y) < 1.2) {
      foundAltar = altar; break;
    }
  }
  state.nearAltar = foundAltar;
  if (foundAltar && state.keys?.KeyE) {
    applyAltarBoon(p, foundAltar, state);
    foundAltar.used = true;
    state.keys.KeyE = false;
    return;
  }

  // Exit — only open after floor boss is defeated
  if (state.exit && state.exitOpen && state.keys?.KeyE &&
      Math.hypot(p.x - state.exit.x, p.y - state.exit.y) < 1.2) {
    state.keys.KeyE = false;
    if ((state.floor || 1) >= 3) {
      triggerVictory(state, 'domination');
    } else {
      state.phase = 'floorAdvance';
    }
  }
}

// ─── Main update dispatcher ───────────────────────────────────────────────────

export function updateEntities(state, dt) {
  updatePlayer(state, dt);
  updateProjectiles(state, dt);
  let deadEnemies = 0;
  let aliveMinions = 0;
  let activeBoss = null;
  for (const e of state.enemies) {
    updateEnemy(e, dt, state);
    if (e.dead) deadEnemies++;
    else if (e.isBoss && !activeBoss) activeBoss = e;
  }
  for (const m of state.minions) {
    updateMinion(m, dt, state);
    if (!m.dead) aliveMinions++;
  }
  state.liveEnemyCount = state.enemies.length - deadEnemies;
  state.deadEnemyCount = deadEnemies;
  state.aliveMinionCount = aliveMinions;
  state.activeBoss = activeBoss;
}

export function spawnMinion(state, type) {
  const p = state.player;
  // Try positions around player
  const angles = [0, Math.PI/2, Math.PI, 3*Math.PI/2, Math.PI/4, 3*Math.PI/4];
  for (const a of angles) {
    const mx = p.x + Math.cos(a) * 1.5, my = p.y + Math.sin(a) * 1.5;
    const tx = Math.floor(mx), ty = Math.floor(my);
    if (state.cells[ty * state.map.w + tx] === 0) {
      state.minions.push(createMinion(type, mx, my));
      return;
    }
  }
  // Fallback: spawn at player
  state.minions.push(createMinion(type, p.x + 0.5, p.y));
}

export function createConfiguredEnemy(spawn, index, floor = 1) {
  const enemy = createEnemy(spawn.x, spawn.y, index);
  return configureEnemyVariant(enemy, spawn.variant || 'raider', floor, { elite: spawn.elite });
}

export function createWaveEnemy(x, y, index, floor = 1, variant = null, opts = {}) {
  const v = variant || (floor >= 3 && Math.random() < 0.34 ? 'charger' : floor >= 2 && Math.random() < 0.3 ? 'sentinel' : 'raider');
  const enemy = createEnemy(x, y, index);
  return configureEnemyVariant(enemy, v, floor, opts);
}
