// entities.js — player, enemy, minion, cache entities + update logic
import {
  MOVE_SPEED, ROT_SPEED, ENTITY_RADIUS,
  ENEMY_HEALTH, ENEMY_SPEED, ENEMY_SIGHT, ENEMY_ATTACK_RANGE,
  ENEMY_FIRE_RATE, ENEMY_DAMAGE,
  MINION_STATS, WEAPONS,
} from './constants.js';
import { findPath, hasLOS, randomNearbyFloor } from './pathfinding.js';

// ─── Player ───────────────────────────────────────────────────────────────────

export function createPlayer(startPos) {
  return {
    x: startPos.x, y: startPos.y, angle: startPos.angle || 0,
    health: 100, maxHealth: 100,
    weapons: new Set(['pistol']),
    activeWeapon: 'pistol',
    fireTimer: 0,
    kills: 0,
    isMoving: false,
    bobTimer: 0,
    input: { forward: false, back: false, strafeL: false, strafeR: false, mouseDX: 0 },
  };
}

// ─── Enemy ────────────────────────────────────────────────────────────────────

let eid = 0;
export function createEnemy(x, y, index) {
  return {
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
    isReinforcement: false,
  };
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
  if (input.forward)  { dx += cos * MOVE_SPEED * dt; dy += sin * MOVE_SPEED * dt; }
  if (input.back)     { dx -= cos * MOVE_SPEED * dt; dy -= sin * MOVE_SPEED * dt; }
  if (input.strafeL)  { dx += perpX * MOVE_SPEED * dt; dy += perpY * MOVE_SPEED * dt; }
  if (input.strafeR)  { dx -= perpX * MOVE_SPEED * dt; dy -= perpY * MOVE_SPEED * dt; }

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
  pistol: '#ffff88', shotgun: '#ff8833', smg: '#ffff88',
  rocket: '#ff6600', plasma: '#00bbff', bfg: '#00ff44',
};

export function shootPlayer(state) {
  const p = state.player;
  if (p.fireTimer > 0) return;
  const weapon = WEAPONS[p.activeWeapon];
  p.fireTimer = 1 / weapon.fireRate;

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
          damageEnemy(e, weapon.damage, state);
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
      if (bestE) { alreadyHit.add(bestE.id); damageEnemy(bestE, weapon.damage, state); anyHit = true; }
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
        damageEnemy(e, Math.floor(weapon.damage * falloff), state);
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
    enemy.dead = true;
    state.player.kills++;
    checkDomination(state);
  }
}

function checkDomination(state) {
  if (state.enemies.every(e => e.dead)) triggerVictory(state, 'domination');
}

function triggerVictory(state, type) {
  if (state.phase === 'playing') { state.phase = 'victory'; state.victoryType = type; }
}

// ─── Enemy AI ─────────────────────────────────────────────────────────────────

function updateEnemy(enemy, dt, state) {
  if (enemy.dead) return;
  enemy.fireTimer    -= dt;
  enemy.pathCooldown -= dt;
  if (enemy.hitTimer > 0) enemy.hitTimer = Math.max(0, enemy.hitTimer - dt);

  const { cells, map, player } = state;
  const dx = player.x - enemy.x, dy = player.y - enemy.y;
  const dist = Math.hypot(dx, dy);

  const playerVis = dist < ENEMY_SIGHT &&
    hasLOS(cells, map.w, map.h, enemy.x, enemy.y, player.x, player.y);

  if (playerVis) { enemy.timeSincePlayerSeen = 0; enemy.lastKnownPX = player.x; enemy.lastKnownPY = player.y; }
  else enemy.timeSincePlayerSeen += dt;

  // State transitions
  switch (enemy.aiState) {
    case 'patrol':
      if (playerVis) enemy.aiState = 'chase';
      break;
    case 'alert':
      enemy.alertTimer -= dt;
      if (playerVis)             { enemy.aiState = 'chase'; }
      else if (enemy.alertTimer <= 0) { enemy.aiState = 'patrol'; }
      break;
    case 'chase':
      if (!playerVis && enemy.timeSincePlayerSeen > 3.5) { enemy.aiState = 'alert'; enemy.alertTimer = 3; }
      if (playerVis && dist <= ENEMY_ATTACK_RANGE)        enemy.aiState = 'attack';
      break;
    case 'attack':
      if (!playerVis || dist > ENEMY_ATTACK_RANGE * 1.3) enemy.aiState = 'chase';
      break;
  }

  // State actions
  switch (enemy.aiState) {
    case 'patrol': doEnemyPatrol(enemy, dt, state);  break;
    case 'alert':  enemy.angle += dt * 1.2;          break;
    case 'chase':  doEnemyChase(enemy, dt, state);   break;
    case 'attack': doEnemyAttack(enemy, dt, dist, state); break;
  }

  checkEnemyCacheInteraction(enemy, state);
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
  const e = createEnemy(spawnX, spawnY, state.enemies.length);
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
  walkPath(enemy, dt, ENEMY_SPEED * 0.45, state);
}

function doEnemyChase(enemy, dt, state) {
  const { cells, map } = state;
  if (enemy.pathCooldown <= 0) {
    enemy.path = findPath(cells, map.w, map.h, enemy.x, enemy.y, enemy.lastKnownPX, enemy.lastKnownPY);
    enemy.pathCooldown = 0.5;
  }
  walkPath(enemy, dt, ENEMY_SPEED, state);
}

function doEnemyAttack(enemy, dt, dist, state) {
  const { player } = state;
  const dx = player.x - enemy.x, dy = player.y - enemy.y;
  enemy.angle = Math.atan2(dy, dx);
  if (enemy.fireTimer > 0) return;
  enemy.fireTimer = ENEMY_FIRE_RATE;
  const hitChance = Math.max(0.15, 1 - dist / (ENEMY_ATTACK_RANGE * 1.5));
  if (Math.random() < hitChance) {
    state.player.health -= Math.round(ENEMY_DAMAGE * enemy.damageMult);
    if (state.player.health <= 0) { state.player.health = 0; state.phase = 'gameOver'; }
    state.effects?.push({ type: 'playerHit', timer: 0.25, maxTimer: 0.25 });
  }
}

// ─── Minion AI ────────────────────────────────────────────────────────────────

function updateMinion(minion, dt, state) {
  if (minion.dead) return;
  minion.fireTimer    -= dt;
  minion.pathCooldown -= dt;

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
    const d = Math.hypot(e.x - minion.x, e.y - minion.y);
    if (d < minion.sight && d < bestD && hasLOS(state.cells, state.map.w, state.map.h, minion.x, minion.y, e.x, e.y)) {
      bestD = d; best = e;
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
    enemy.health -= minion.attackDamage;
    if (enemy.health <= 0 && !enemy.dead) {
      enemy.dead = true;
      state.player.kills++;
      checkDomination(state);
    }
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
  if (!minion.exploreTarget || minion.pathCooldown <= 0 ||
      Math.hypot(minion.x - minion.exploreTarget.x, minion.y - minion.exploreTarget.y) < 0.4) {
    minion.exploreTarget = findFrontierTile(explored, cells, map.w, map.h, minion.x, minion.y);
    minion.path = minion.exploreTarget
      ? findPath(cells, map.w, map.h, minion.x, minion.y, minion.exploreTarget.x, minion.exploreTarget.y)
      : null;
    minion.pathCooldown = 1.2;
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
  if (distToPlayer > 3.0 && minion.pathCooldown <= 0) {
    minion.path = findPath(cells, map.w, map.h, minion.x, minion.y, player.x, player.y);
    minion.pathCooldown = 0.7;
  }
  walkPath(minion, dt, minion.speed, state);
}

function updateHunter(minion, dt, state) {
  const { cells, map, player } = state;
  const enemy = nearestEnemy(minion, state);

  if (enemy) {
    minion.targetEnemy = enemy;
    walkToward(minion, dt, enemy.x, enemy.y, minion.speed, state);
    minionAttack(minion, enemy, dt, state);
    return;
  }

  // Seek any living enemy by pathfinding
  if (minion.pathCooldown <= 0) {
    const livingEnemies = state.enemies.filter(e => !e.dead);
    if (livingEnemies.length > 0) {
      const target = livingEnemies.reduce((a, b) =>
        Math.hypot(a.x - minion.x, a.y - minion.y) < Math.hypot(b.x - minion.x, b.y - minion.y) ? a : b);
      minion.path = findPath(cells, map.w, map.h, minion.x, minion.y, target.x, target.y);
    } else {
      // No enemies left, stay near player
      if (Math.hypot(player.x - minion.x, player.y - minion.y) > 8)
        minion.path = findPath(cells, map.w, map.h, minion.x, minion.y, player.x, player.y);
    }
    minion.pathCooldown = 0.6;
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
  revealAround(explored, map.w, map.h, player.x, player.y, 4);
  for (const m of minions) {
    if (!m.dead) revealAround(explored, map.w, map.h, m.x, m.y, m.exploreRadius);
  }
}

function revealAround(explored, mapW, mapH, cx, cy, radius) {
  const tx = Math.floor(cx), ty = Math.floor(cy);
  const r  = Math.ceil(radius);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx*dx + dy*dy > radius*radius) continue;
      const nx = tx + dx, ny = ty + dy;
      if (nx >= 0 && ny >= 0 && nx < mapW && ny < mapH) explored[ny * mapW + nx] = 1;
    }
  }
}

// ─── Cache / exit detection ───────────────────────────────────────────────────

export function checkInteractions(state) {
  if (state.phase !== 'playing') return;
  const p = state.player;

  // Health pack pickup
  for (const hp of (state.healthPacks || [])) {
    if (!hp.collected && Math.hypot(p.x - hp.x, p.y - hp.y) < 0.8) {
      hp.collected = true;
      p.health = hp.size === 'large' ? p.maxHealth : Math.min(p.maxHealth, p.health + hp.hp);
    }
  }

  // Cache proximity
  for (let i = 0; i < state.caches.length; i++) {
    const c = state.caches[i];
    if (!c.found && Math.hypot(p.x - c.x, p.y - c.y) < 0.9) {
      c.found = true;
      state.phase = 'cachePrompt';
      state.pendingCacheIdx = i;
      return;
    }
  }

  // Exit proximity + interact key
  if (state.exit && state.keys?.KeyE &&
      Math.hypot(p.x - state.exit.x, p.y - state.exit.y) < 1.2) {
    triggerVictory(state, 'escape');
  }

  // Exploration victory: player found all caches enemies haven't looted
  const playerCaches = state.caches.filter(c => !c.enemyLooted);
  if (playerCaches.length > 0 && playerCaches.every(c => c.found) && state.phase === 'playing') {
    triggerVictory(state, 'exploration');
  }
}

// ─── Main update dispatcher ───────────────────────────────────────────────────

export function updateEntities(state, dt) {
  updatePlayer(state, dt);
  for (const e of state.enemies) updateEnemy(e, dt, state);
  for (const m of state.minions) updateMinion(m, dt, state);
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
