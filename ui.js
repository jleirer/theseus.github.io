// ui.js — HUD, minimap, overlays
import { SCREEN_W, SCREEN_H, HALF_W, HALF_H, FOV_TAN, WEAPONS, TECH_PREREQS, TECH_NODE_POS, MINION_STATS, ALTAR_GODS } from './constants.js';
import { weaponNodeState, canUpgradeWeapon, getPlayerWeaponStats, isTechTreeMaxed } from './weapons.js';
import { hasLOS } from './pathfinding.js';
import { WEAPON_IMGS } from './raycaster.js';

const NODE_W = 120, NODE_H = 48;
// Overlay base offset (centered 700×500 box)
const OVL_X = (SCREEN_W - 700) / 2;
const OVL_Y = 55;

// ─── Crosshair ────────────────────────────────────────────────────────────────

export function renderCrosshair(ctx) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.5;
  const cx = SCREEN_W / 2, cy = SCREEN_H / 2;
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy);
  ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10);
  ctx.stroke();
  ctx.restore();
}

// ─── HUD ──────────────────────────────────────────────────────────────────────

export function renderHUD(ctx, state) {
  const { player, enemies } = state;
  const activeWeapon = getPlayerWeaponStats(player, player.activeWeapon);

  // --- Bottom-right: health ---
  const bx = SCREEN_W - 215, by = SCREEN_H - 48;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(bx - 5, by - 5, 210, 40);

  const hp = Math.max(0, player.health);
  const hpFrac = hp / player.maxHealth;
  const hpColor = hpFrac > 0.5 ? '#22cc44' : hpFrac > 0.25 ? '#ffaa00' : '#ee2222';
  ctx.fillStyle = '#333';
  ctx.fillRect(bx, by, 200, 18);
  ctx.fillStyle = hpColor;
  ctx.fillRect(bx, by, 200 * hpFrac, 18);
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, 200, 18);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(`HP  ${hp}/${player.maxHealth}`, bx + 4, by + 13);

  const armor = Math.max(0, player.armor || 0);
  const armorFrac = armor / (player.maxArmor || 100);
  ctx.fillStyle = '#223';
  ctx.fillRect(bx, by - 20, 200, 12);
  ctx.fillStyle = '#66bbff';
  ctx.fillRect(bx, by - 20, 200 * armorFrac, 12);
  ctx.strokeStyle = '#577';
  ctx.strokeRect(bx, by - 20, 200, 12);
  ctx.fillStyle = '#d8eeff';
  ctx.font = 'bold 10px monospace';
  ctx.fillText(`AR  ${armor}/${player.maxArmor || 100}`, bx + 4, by - 10);

  // --- Bottom-center: weapon ---
  const wname = activeWeapon?.name || '';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(SCREEN_W/2 - 110, SCREEN_H - 46, 220, 38);
  ctx.fillStyle = '#ffee88';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`[ ${wname} ]`, SCREEN_W / 2, SCREEN_H - 28);
  ctx.fillStyle = '#aaa';
  ctx.font = '9px monospace';
  ctx.fillText(`DMG ${activeWeapon.damage}   FR ${activeWeapon.fireRate.toFixed(2)}/s   UPG ${activeWeapon.upgradeLevel}`, SCREEN_W / 2, SCREEN_H - 15);
  ctx.textAlign = 'left';

  drawWeaponSprite(ctx, player.activeWeapon, state);

  // --- Altar prompt ---
  if (state.nearAltar) {
    const god = ALTAR_GODS[state.nearAltar.godId];
    if (god) {
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(SCREEN_W / 2 - 160, SCREEN_H - 112, 320, 64);
      ctx.textAlign = 'center';
      ctx.fillStyle = god.color;
      ctx.font = 'bold 14px monospace';
      ctx.fillText(`ALTAR OF ${god.name.toUpperCase()}`, SCREEN_W / 2, SCREEN_H - 90);
      ctx.fillStyle = '#ccc';
      ctx.font = '12px monospace';
      ctx.fillText(`${god.desc}   [E] to receive blessing`, SCREEN_W / 2, SCREEN_H - 70);
      ctx.textAlign = 'left';
    }
  }

  // --- Top bar ---
  const totalEnemies = enemies.length;
  const deadEnemies  = state.deadEnemyCount ?? enemies.filter(e => e.dead).length;

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, SCREEN_W, 28);
  ctx.font = '12px monospace';

  // Floor + Wave
  const floor = state.floor || 1;
  ctx.fillStyle = '#aaaaff';
  ctx.fillText(`FLOOR ${floor}`, SCREEN_W - 168, 18);
  ctx.fillStyle = state.wave >= 2 ? '#ff8844' : '#666';
  ctx.fillText(`WAVE ${state.wave}`, SCREEN_W - 68, 18);

  // Kills
  const domDone = deadEnemies === totalEnemies && totalEnemies > 0;
  ctx.fillStyle = domDone ? '#00ff44' : '#ff4444';
  ctx.fillText(`⚔ ${deadEnemies}/${totalEnemies} SLAIN`, 12, 18);

  // Exit status
  const nearExit = state.exit &&
    Math.hypot(state.player.x - state.exit.x, state.player.y - state.exit.y) < 1.5;
  const exitOpen = state.exitOpen;
  ctx.fillStyle = nearExit && exitOpen ? '#00ff44' : nearExit ? '#ff6622' : exitOpen ? '#88ffaa' : '#666';
  ctx.fillText(
    nearExit && exitOpen ? '⬡ EXIT: [E] DESCEND' :
    nearExit             ? '⬡ EXIT: LOCKED — DEFEAT THE BOSS' :
    exitOpen             ? '⬡ EXIT: OPEN'                      : '⬡ EXIT: LOCKED',
    200, 18,
  );

  // Minion count
  const aliveMins = state.aliveMinionCount ?? state.minions.filter(m => !m.dead).length;
  ctx.fillStyle = '#aaddff';
  ctx.fillText(`◉ ALLIES: ${aliveMins}`, 430, 18);

  const eliteCount = enemies.filter(e => !e.dead && e.isElite).length;
  if (eliteCount > 0) {
    ctx.fillStyle = '#ffe082';
    ctx.fillText(`✦ ELITES: ${eliteCount}`, 540, 18);
  }
}

// Simple weapon sprite at bottom-center
function drawWeaponSprite(ctx, weaponId, state) {
  const bob = state.player.isMoving ? Math.sin(state.player.bobTimer) * 9 : 0;

  const img = WEAPON_IMGS[weaponId];
  if (img) {
    const w = 240, h = 200;
    const x = SCREEN_W / 2 - w / 2 + bob * 0.5;
    const y = SCREEN_H - h + Math.abs(bob);
    ctx.drawImage(img, x, y, w, h);
    return;
  }

  // Fallback: procedural drawing (used until PNG is placed in Images/)
  const wx  = SCREEN_W / 2 + bob * 0.5;
  const wy  = SCREEN_H - 100 + Math.abs(bob);

  ctx.save();
  ctx.lineWidth = 2;

  switch (weaponId) {
    case 'pistol': { // Pilum — Roman javelin
      // Wooden shaft
      ctx.fillStyle = '#7b4a1e';
      ctx.fillRect(wx - 22, wy + 5, 52, 7);
      // Iron shank (soft iron section that bends on impact)
      ctx.fillStyle = '#808080';
      ctx.fillRect(wx + 28, wy + 3, 24, 11);
      // Iron tip
      ctx.fillStyle = '#c8c8c8';
      ctx.beginPath();
      ctx.moveTo(wx + 52, wy + 9);
      ctx.lineTo(wx + 44, wy + 3);
      ctx.lineTo(wx + 44, wy + 14);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'shotgun': { // Funda — Roman sling
      // Leather cords
      ctx.strokeStyle = '#8b6914';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(wx - 16, wy);
      ctx.quadraticCurveTo(wx + 4, wy - 14, wx + 24, wy);
      ctx.stroke();
      // Leather pouch
      ctx.fillStyle = '#7a4a1e';
      ctx.beginPath(); ctx.ellipse(wx + 4, wy + 14, 18, 11, 0, 0, Math.PI * 2); ctx.fill();
      // Stones
      ctx.fillStyle = '#888';
      ctx.beginPath(); ctx.arc(wx + 2, wy + 12, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#777';
      ctx.beginPath(); ctx.arc(wx + 14, wy + 18, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#666';
      ctx.beginPath(); ctx.arc(wx - 8, wy + 18, 4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'smg': { // Arcus — Roman composite bow
      // Bow stave (C-shape opening right)
      ctx.strokeStyle = '#6b3a1f';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(wx - 8, wy + 8, 28, -Math.PI / 3, Math.PI / 3);
      ctx.stroke();
      // Bowstring
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(wx + 6, wy - 16);
      ctx.lineTo(wx + 6, wy + 32);
      ctx.stroke();
      // Arrow shaft
      ctx.strokeStyle = '#9b5a2b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(wx - 20, wy + 8);
      ctx.lineTo(wx + 42, wy + 8);
      ctx.stroke();
      // Arrowhead
      ctx.fillStyle = '#bbb';
      ctx.beginPath();
      ctx.moveTo(wx + 44, wy + 8);
      ctx.lineTo(wx + 32, wy + 3);
      ctx.lineTo(wx + 32, wy + 13);
      ctx.closePath(); ctx.fill();
      // Fletching
      ctx.fillStyle = '#cc3333';
      ctx.beginPath();
      ctx.moveTo(wx - 20, wy + 8);
      ctx.lineTo(wx - 12, wy + 2);
      ctx.lineTo(wx - 8, wy + 8);
      ctx.lineTo(wx - 12, wy + 14);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'rocket': { // Onager — Roman torsion catapult
      // Wooden frame body
      ctx.fillStyle = '#6b3a1f';
      ctx.fillRect(wx - 14, wy + 2, 32, 24);
      // Throwing arm
      ctx.fillStyle = '#9b5a2b';
      ctx.save();
      ctx.translate(wx + 2, wy + 6);
      ctx.rotate(-0.45);
      ctx.fillRect(-3, -22, 6, 28);
      ctx.restore();
      // Fire pot at top of arm
      ctx.fillStyle = '#cc4400';
      ctx.beginPath(); ctx.arc(wx + 16, wy - 4, 10, 0, Math.PI * 2); ctx.fill();
      // Outer flame
      ctx.fillStyle = '#ff8800';
      ctx.beginPath();
      ctx.moveTo(wx + 10, wy - 8);
      ctx.quadraticCurveTo(wx + 16, wy - 22, wx + 22, wy - 8);
      ctx.closePath(); ctx.fill();
      // Inner flame
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath();
      ctx.moveTo(wx + 13, wy - 10);
      ctx.quadraticCurveTo(wx + 16, wy - 19, wx + 19, wy - 10);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'plasma': { // Scorpio — Roman ballista
      // Wooden frame base
      ctx.fillStyle = '#6b3a1f';
      ctx.fillRect(wx - 10, wy + 6, 55, 12);
      // Bronze torsion arm frame
      ctx.fillStyle = '#b87333';
      ctx.fillRect(wx + 6, wy - 8, 10, 32);
      // Golden spring caps
      ctx.fillStyle = '#daa520';
      ctx.fillRect(wx + 5, wy - 10, 12, 7);
      ctx.fillRect(wx + 5, wy + 24, 12, 7);
      // Steel bolt in groove
      ctx.fillStyle = '#aaa';
      ctx.fillRect(wx + 15, wy + 9, 36, 4);
      // Bolt tip
      ctx.fillStyle = '#ddd';
      ctx.beginPath();
      ctx.moveTo(wx + 51, wy + 11);
      ctx.lineTo(wx + 42, wy + 6);
      ctx.lineTo(wx + 42, wy + 16);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'bfg': { // Falarica — Roman fire javelin
      // Heavy wooden shaft
      ctx.fillStyle = '#5a3010';
      ctx.fillRect(wx - 20, wy + 4, 44, 12);
      // Bronze collar at the head
      ctx.fillStyle = '#b87333';
      ctx.fillRect(wx + 22, wy + 2, 8, 16);
      // Outer fire mass
      ctx.fillStyle = '#cc3300';
      ctx.beginPath(); ctx.arc(wx + 46, wy + 10, 16, 0, Math.PI * 2); ctx.fill();
      // Mid flame
      ctx.fillStyle = '#ff6600';
      ctx.beginPath(); ctx.arc(wx + 46, wy + 10, 11, 0, Math.PI * 2); ctx.fill();
      // Bright inner core
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath(); ctx.arc(wx + 46, wy + 10, 6, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'railgun': { // Hasta — Roman long thrusting spear (penetrating)
      // Long wooden shaft
      ctx.fillStyle = '#7b4a1e';
      ctx.fillRect(wx - 26, wy + 5, 70, 8);
      // Leaf-shaped iron spearhead (broad)
      ctx.fillStyle = '#909090';
      ctx.beginPath();
      ctx.moveTo(wx + 54, wy + 9);   // tip
      ctx.lineTo(wx + 38, wy + 2);   // upper edge
      ctx.lineTo(wx + 32, wy + 5);   // upper base
      ctx.lineTo(wx + 32, wy + 13);  // lower base
      ctx.lineTo(wx + 38, wy + 16);  // lower edge
      ctx.closePath(); ctx.fill();
      // Highlight ridge on spearhead
      ctx.fillStyle = '#d0d0d0';
      ctx.beginPath();
      ctx.moveTo(wx + 54, wy + 9);
      ctx.lineTo(wx + 38, wy + 4);
      ctx.lineTo(wx + 34, wy + 9);
      ctx.closePath(); ctx.fill();
      // Butt spike (sauroter) at rear
      ctx.fillStyle = '#777';
      ctx.beginPath();
      ctx.moveTo(wx - 30, wy + 9);
      ctx.lineTo(wx - 26, wy + 5);
      ctx.lineTo(wx - 26, wy + 13);
      ctx.closePath(); ctx.fill();
      break;
    }
    default:
      ctx.fillStyle = '#aaa';
      ctx.fillRect(wx - 10, wy, 28, 18);
  }
  ctx.restore();
}

// ─── Minimap ──────────────────────────────────────────────────────────────────

export function renderMinimap(ctx, state) {
  const { map, explored, player, enemies, minions, caches, exit } = state;
  const scale = Math.max(1, Math.min(4, Math.floor(200 / Math.max(map.w, map.h))));
  const mw = map.w * scale, mh = map.h * scale;
  const mx = 10, my = SCREEN_H - mh - 10;

  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(mx - 2, my - 2, mw + 4, mh + 4);

  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      if (!explored[ty * map.w + tx]) continue;
      ctx.fillStyle = map.cells[ty * map.w + tx] !== 0 ? '#555' : '#1a1a1a';
      ctx.fillRect(mx + tx * scale, my + ty * scale, scale, scale);
    }
  }

  // Health packs
  for (const hp of (state.healthPacks || [])) {
    if (hp.collected) continue;
    if (explored[Math.floor(hp.y) * map.w + Math.floor(hp.x)]) {
      ctx.fillStyle = hp.size === 'large' ? '#ff4466' : '#ff88aa';
      ctx.beginPath();
      ctx.arc(mx + hp.x * scale, my + hp.y * scale, Math.max(2, scale * 0.8), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Caches (unfound)
  for (const c of caches) {
    if (c.found) continue;
    if (explored[Math.floor(c.y) * map.w + Math.floor(c.x)]) {
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(mx + c.x * scale - 2, my + c.y * scale - 2, 4, 4);
    }
  }

  // Exit
  if (exit && explored[Math.floor(exit.y) * map.w + Math.floor(exit.x)]) {
    ctx.fillStyle = '#00ff66';
    ctx.fillRect(mx + exit.x * scale - 3, my + exit.y * scale - 3, 6, 6);
  }

  // Enemies
  for (const e of enemies) {
    if (e.dead) continue;
    if (explored[Math.floor(e.y) * map.w + Math.floor(e.x)]) {
      ctx.fillStyle = VARIANT_BAR_COLORS[e.variant] || '#ff3333';
      ctx.beginPath();
      ctx.arc(mx + e.x * scale, my + e.y * scale, Math.max(2, scale), 0, Math.PI * 2);
      ctx.fill();
      if (e.isElite) {
        ctx.strokeStyle = '#fff2a8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(mx + e.x * scale, my + e.y * scale, Math.max(3, scale + 1), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  // Minions
  const minionColors = { scout: '#00eeff', guard: '#4466ff', hunter: '#bb44ff' };
  for (const m of minions) {
    if (m.dead) continue;
    ctx.fillStyle = minionColors[m.minionType] || '#44aaff';
    ctx.beginPath();
    ctx.arc(mx + m.x * scale, my + m.y * scale, Math.max(2, scale), 0, Math.PI * 2);
    ctx.fill();
  }

  // Player arrow
  const px = mx + player.x * scale, py = my + player.y * scale;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(player.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(7, 0); ctx.lineTo(-5, -3); ctx.lineTo(-5, 3);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // Minimap legend
  const legendX = mx;
  const legendY = my - 30;
  if (legendY > 8) {
    ctx.fillStyle = 'rgba(0,0,0,0.68)';
    ctx.fillRect(legendX - 2, legendY - 12, 166, 20);
    ctx.font = '9px monospace';
    ctx.fillStyle = VARIANT_BAR_COLORS.raider;
    ctx.fillText('R', legendX + 2, legendY);
    ctx.fillStyle = VARIANT_BAR_COLORS.charger;
    ctx.fillText('C', legendX + 18, legendY);
    ctx.fillStyle = VARIANT_BAR_COLORS.sentinel;
    ctx.fillText('S', legendX + 34, legendY);
    ctx.fillStyle = '#fff2a8';
    ctx.fillText('◌ ELITE', legendX + 52, legendY);
  }
}

// ─── Cache prompt ─────────────────────────────────────────────────────────────

// Returns { type: 'weapon'|'minion', id } for a click at (cx, cy), or null
export function hitTestCachePrompt(cx, cy, state) {
  const owned = state.player.weapons;

  // Weapon nodes
  for (const [id, pos] of Object.entries(TECH_NODE_POS)) {
    const nx = OVL_X + pos.x - NODE_W / 2;
    const ny = OVL_Y + pos.y - NODE_H / 2;
    if (cx >= nx && cx <= nx + NODE_W && cy >= ny && cy <= ny + NODE_H) {
      if (weaponNodeState(id, owned) === 'available') return { type: 'weapon', id };
      if (canUpgradeWeapon(state.player, id)) return { type: 'weaponUpgrade', id };
    }
  }

  // Reward buttons
  const rewardTypes = ['scout', 'guard', 'hunter', 'armor'];
  const mBY = OVL_Y + 415;
  for (let i = 0; i < 4; i++) {
    const bx = OVL_X + 28 + i * 166;
    if (cx >= bx && cx <= bx + 150 && cy >= mBY && cy <= mBY + 70) {
      return rewardTypes[i] === 'armor' ? { type: 'armor' } : { type: 'minion', id: rewardTypes[i] };
    }
  }
  return null;
}

export function renderCachePrompt(ctx, state, mouse, keyboardSel) {
  // Dim overlay
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  ctx.fillStyle = 'rgba(10,15,10,0.95)';
  ctx.fillRect(OVL_X - 10, OVL_Y - 15, 720, 510);
  ctx.strokeStyle = '#00ff44';
  ctx.lineWidth = 2;
  ctx.strokeRect(OVL_X - 10, OVL_Y - 15, 720, 510);

  ctx.fillStyle = '#00ff44';
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('RELIC CHAMBER — CHOOSE YOUR REWARD', SCREEN_W / 2, OVL_Y + 14);

  ctx.fillStyle = '#666';
  ctx.font = '12px monospace';
  ctx.fillText(isTechTreeMaxed(state.player.weapons) ? 'WEAPON TECH TREE  ·  UPGRADES ONLINE' : 'WEAPON TECH TREE', SCREEN_W / 2, OVL_Y + 34);
  ctx.textAlign = 'left';

  const owned = state.player.weapons;

  // Draw connector lines first
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1.5;
  const edges = [
    ['pistol','shotgun'],['pistol','smg'],
    ['shotgun','rocket'],['smg','plasma'],
    ['rocket','bfg'],['plasma','railgun'],
  ];
  for (const [a, b] of edges) {
    const pa = TECH_NODE_POS[a], pb = TECH_NODE_POS[b];
    ctx.beginPath();
    ctx.moveTo(OVL_X + pa.x, OVL_Y + pa.y + NODE_H / 2);
    ctx.lineTo(OVL_X + pb.x, OVL_Y + pb.y - NODE_H / 2);
    ctx.stroke();
  }

  // Draw weapon nodes
  for (const [id, pos] of Object.entries(TECH_NODE_POS)) {
    const ns0 = weaponNodeState(id, owned);
    const ns  = ns0 === 'owned' && canUpgradeWeapon(state.player, id) ? 'upgrade' : ns0;
    const nx  = OVL_X + pos.x - NODE_W / 2;
    const ny  = OVL_Y + pos.y - NODE_H / 2;
    const hov = mouse && mx_in(mouse, nx, ny, NODE_W, NODE_H) && (ns === 'available' || ns === 'upgrade');
    const ksel = keyboardSel === id;

    ctx.save();
    if (ns === 'owned')          { ctx.fillStyle = '#0d2e12'; ctx.strokeStyle = '#00cc44'; }
    else if (ns === 'upgrade')   { ctx.fillStyle = hov || ksel ? '#14220a' : '#101a08'; ctx.strokeStyle = hov || ksel ? '#8dff6a' : '#55cc44'; }
    else if (ns === 'available') { ctx.fillStyle = hov || ksel ? '#3a3a00' : '#222200'; ctx.strokeStyle = hov || ksel ? '#ffff66' : '#dddd00'; }
    else                         { ctx.fillStyle = ksel ? '#1a1400' : '#111'; ctx.strokeStyle = ksel ? '#886600' : '#333'; }

    if (hov || ksel) { ctx.shadowBlur = 12; ctx.shadowColor = '#ffff00'; }
    if (ksel) { ctx.lineWidth = 2.5; }

    ctx.lineWidth = 2;
    ctx.fillRect(nx, ny, NODE_W, NODE_H);
    ctx.strokeRect(nx, ny, NODE_W, NODE_H);
    ctx.shadowBlur = 0;

    const w = getPlayerWeaponStats(state.player, id);
    ctx.fillStyle = ns === 'locked' ? '#555' : ns === 'owned' ? '#00cc44' : ns === 'upgrade' ? '#8dff6a' : '#ffee44';
    ctx.font = `bold 11px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(w.name, OVL_X + pos.x, ny + 18);
    ctx.fillStyle = ns === 'locked' ? '#444' : '#aaa';
    ctx.font = '9px monospace';
    ctx.fillText(`DMG:${w.damage}  ${w.fireRate}/s`, OVL_X + pos.x, ny + 34);
    if (ns === 'owned')      ctx.fillText('✓ OWNED',     OVL_X + pos.x, ny + 44);
    else if (ns === 'upgrade') ctx.fillText(`▲ UPG ${w.upgradeLevel}`, OVL_X + pos.x, ny + 44);
    else if (ns === 'locked') ctx.fillText('🔒 LOCKED',   OVL_X + pos.x, ny + 44);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  // Divider
  ctx.strokeStyle = '#333';
  ctx.beginPath();
  ctx.moveTo(OVL_X - 10, OVL_Y + 395);
  ctx.lineTo(OVL_X + 710, OVL_Y + 395);
  ctx.stroke();

  ctx.fillStyle = '#666';
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('— OR REINFORCE YOURSELF —', SCREEN_W / 2, OVL_Y + 408);
  ctx.textAlign = 'left';

  // Reward buttons
  const mBY = OVL_Y + 415;
  const rewardIds = ['scout', 'guard', 'hunter', 'armor'];
  for (let i = 0; i < 4; i++) {
    const bx  = OVL_X + 28 + i * 166;
    const isArmor = rewardIds[i] === 'armor';
    const st  = isArmor ? null : MINION_STATS[rewardIds[i]];
    const hov  = mouse && mx_in(mouse, bx, mBY, 150, 70);
    const ksel = keyboardSel === (isArmor ? 'armor' : `minion${i}`);
    const [cr, cg, cb] = isArmor ? [110, 190, 255] : st.color;

    ctx.save();
    ctx.fillStyle = hov || ksel ? `rgba(${cr},${cg},${cb},0.22)` : `rgba(${cr},${cg},${cb},0.08)`;
    ctx.strokeStyle = ksel ? '#ffffff' : `rgb(${cr},${cg},${cb})`;
    ctx.lineWidth = hov || ksel ? 2 : 1;
    if (hov || ksel) { ctx.shadowBlur = 10; ctx.shadowColor = ksel ? '#ffffff' : `rgb(${cr},${cg},${cb})`; }
    ctx.fillRect(bx, mBY, 150, 70);
    ctx.strokeRect(bx, mBY, 150, 70);
    ctx.shadowBlur = 0;

    ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    if (isArmor) {
      ctx.fillText('ARMOR', bx + 75, mBY + 18);
      ctx.fillStyle = '#b9ddff';
      ctx.font = '9px monospace';
      ctx.fillText('+35 AR', bx + 75, mBY + 34);
      ctx.fillText('Absorbs incoming damage', bx + 75, mBY + 48);
      ctx.fillText('(Click to fortify)', bx + 75, mBY + 62);
    } else {
      ctx.fillText(rewardIds[i].toUpperCase(), bx + 75, mBY + 18);
      ctx.fillStyle = '#aaa';
      ctx.font = '9px monospace';
      ctx.fillText(`HP:${st.health}  SPD:${st.speed}`, bx + 75, mBY + 34);
      ctx.fillText(st.desc, bx + 75, mBY + 48);
      ctx.fillText('(Click to spawn)', bx + 75, mBY + 62);
    }
    ctx.restore();
    ctx.textAlign = 'left';
  }

  ctx.fillStyle = '#555';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Click or use Arrow Keys + Enter/Space to select. Highlighted nodes are available or upgradeable.', SCREEN_W/2, OVL_Y + 494);
  ctx.textAlign = 'left';
}

function mx_in(m, x, y, w, h) {
  return m && m.x >= x && m.x <= x + w && m.y >= y && m.y <= y + h;
}

// ─── Weapon / hit effects ─────────────────────────────────────────────────────

export function renderEffects(ctx, state) {
  if (!state.effects) return;
  for (const eff of state.effects) {
    const frac = eff.timer / eff.maxTimer; // 1 = fresh, 0 = expired
    ctx.save();
    switch (eff.type) {
      case 'muzzle': {
        const alpha = frac * 0.9;
        ctx.globalAlpha = alpha;
        const mx = SCREEN_W / 2 + 38, my = SCREEN_H - 78;
        ctx.fillStyle = eff.color || '#ffff88';
        ctx.beginPath();
        ctx.ellipse(mx, my, 22 * frac, 10 * frac, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(mx, my, 7 * frac, 5 * frac, -0.3, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'hit': {
        ctx.globalAlpha = frac * 0.9;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        const cx = SCREEN_W / 2, cy = SCREEN_H / 2;
        const r = 14 * (1 - frac);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
          ctx.lineTo(cx + Math.cos(a) * (r + 10), cy + Math.sin(a) * (r + 10));
          ctx.stroke();
        }
        break;
      }
      case 'explode': {
        ctx.globalAlpha = frac * 0.72;
        const proj = eff.worldX != null && eff.worldY != null ? projectWorld(eff.worldX, eff.worldY, state.player) : null;
        const cx = proj ? proj.screenX : SCREEN_W / 2;
        const cy = proj ? proj.topY + proj.sprH * 0.5 : SCREEN_H / 2 - 20;
        const maxR = 90;
        const r = maxR * (1 - frac);
        ctx.strokeStyle = '#ff6600';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'impact': {
        ctx.globalAlpha = frac * 0.85;
        const proj = eff.worldX != null && eff.worldY != null ? projectWorld(eff.worldX, eff.worldY, state.player) : null;
        const cx = proj ? proj.screenX : SCREEN_W / 2;
        const cy = proj ? proj.topY + proj.sprH * 0.5 : SCREEN_H / 2;
        const r = 18 * (1 - frac) + 5;
        ctx.strokeStyle = eff.color || '#55ddff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = eff.color || '#55ddff';
        ctx.globalAlpha = frac * 0.4;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'railBeam': {
        ctx.globalAlpha = frac * 0.85;
        ctx.strokeStyle = eff.color || '#00ffcc';
        ctx.lineWidth = 3;
        ctx.shadowBlur = 14;
        ctx.shadowColor = eff.color || '#00ffcc';
        ctx.beginPath();
        ctx.moveTo(SCREEN_W / 2, SCREEN_H - 55);
        ctx.lineTo(SCREEN_W / 2, 0);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.globalAlpha = frac * 0.4;
        ctx.beginPath();
        ctx.moveTo(SCREEN_W / 2 - 12, SCREEN_H - 55);
        ctx.lineTo(SCREEN_W / 2 - 12, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(SCREEN_W / 2 + 12, SCREEN_H - 55);
        ctx.lineTo(SCREEN_W / 2 + 12, 0);
        ctx.stroke();
        break;
      }
      case 'playerHit': {
        ctx.globalAlpha = frac * 0.55;
        const grd = ctx.createRadialGradient(
          SCREEN_W / 2, SCREEN_H / 2, SCREEN_H * 0.22,
          SCREEN_W / 2, SCREEN_H / 2, SCREEN_H * 0.78);
        grd.addColorStop(0, 'rgba(180,0,0,0)');
        grd.addColorStop(1, 'rgba(220,0,0,0.9)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
        break;
      }
    }
    ctx.restore();
  }
}

export function renderProjectiles(ctx, state) {
  if (!state.projectiles || state.projectiles.length === 0) return;
  ctx.save();
  for (const proj of state.projectiles) {
    const dx = proj.x - state.player.x, dy = proj.y - state.player.y;
    const minVisibleDist = proj.kind === 'bfg' ? 0.55 : 0.7;
    if (dx*dx + dy*dy < minVisibleDist * minVisibleDist) continue;
    if (!hasLOS(state.cells, state.map.w, state.map.h, state.player.x, state.player.y, proj.x, proj.y)) continue;
    const screen = projectWorld(proj.x, proj.y, state.player);
    if (!screen) continue;
    const px = screen.screenX;
    const py = screen.topY + screen.sprH * 0.5;
    if (px < -40 || px > SCREEN_W + 40 || py < -40 || py > SCREEN_H + 40) continue;

    const prev = projectWorld(proj.prevX, proj.prevY, state.player);
    const stroke = proj.kind === 'rocket'
      ? 'rgba(255,160,40,0.75)'
      : proj.kind === 'plasma'
        ? 'rgba(80,220,255,0.8)'
        : 'rgba(255,120,40,0.85)';
    const glow = proj.kind === 'rocket'
      ? '#ff8800'
      : proj.kind === 'plasma'
        ? '#55ddff'
        : '#ff6622';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(2, screen.sprH * 0.08);
    ctx.shadowBlur = 10;
    ctx.shadowColor = glow;
    if (prev) {
      ctx.beginPath();
      ctx.moveTo(prev.screenX, prev.topY + prev.sprH * 0.5);
      ctx.lineTo(px, py);
      ctx.stroke();
    }

    const rad = proj.kind === 'bfg'
      ? Math.max(5, Math.min(26, screen.sprH * 0.22))
      : Math.max(3, Math.min(18, screen.sprH * 0.16));
    const grd = ctx.createRadialGradient(px, py, rad * 0.2, px, py, rad);
    if (proj.kind === 'plasma') {
      grd.addColorStop(0, '#f3ffff');
      grd.addColorStop(0.45, '#55ddff');
      grd.addColorStop(1, 'rgba(60,180,255,0)');
    } else if (proj.kind === 'bfg') {
      grd.addColorStop(0, '#fff4cc');
      grd.addColorStop(0.35, '#ff9944');
      grd.addColorStop(0.7, '#ff4400');
      grd.addColorStop(1, 'rgba(255,60,0,0)');
    } else {
      grd.addColorStop(0, '#fff7cc');
      grd.addColorStop(0.4, '#ffbb33');
      grd.addColorStop(1, 'rgba(255,80,0,0)');
    }
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ─── Enemy health bars ────────────────────────────────────────────────────────

function projectWorld(ex, ey, player) {
  const dirX = Math.cos(player.angle), dirY = Math.sin(player.angle);
  const plX  = -dirY * FOV_TAN,        plY  = dirX * FOV_TAN;
  const sx = ex - player.x, sy = ey - player.y;
  const invDet = 1 / (plX * dirY - dirX * plY);
  const tX = invDet * (dirY * sx - dirX * sy);
  const tY = invDet * (-plY * sx + plX * sy);
  if (tY <= 0.25) return null;
  const screenX = HALF_W * (1 + tX / tY);
  const sprH    = SCREEN_H / tY;
  const topY    = HALF_H - sprH / 2;
  return { screenX, topY, sprH, tY };
}

function projectEnemy(ex, ey, player) {
  return projectWorld(ex, ey, player);
}

const VARIANT_BAR_COLORS = {
  raider: '#ffcc66',
  charger: '#ff6a3d',
  sentinel: '#66bbff',
};

export function renderEnemyHealthBars(ctx, state) {
  const { player, enemies, map } = state;
  ctx.save();
  for (const e of enemies) {
    if (e.dead) continue;
    if (!hasLOS(state.cells, map.w, map.h, player.x, player.y, e.x, e.y)) continue;
    const proj = projectEnemy(e.x, e.y, player);
    if (!proj) continue;
    const { screenX, topY, sprH } = proj;
    if (screenX < 20 || screenX > SCREEN_W - 20) continue;

    const barW = Math.max(24, Math.min(72, sprH * 0.75));
    const barH = 5;
    const bx   = screenX - barW / 2;
    const by   = topY - barH - 4;
    if (by < 4) continue;

    const frac   = Math.max(0, e.health / e.maxHealth);
    const baseCol = VARIANT_BAR_COLORS[e.variant] || '#dddddd';
    const barCol = frac > 0.5 ? baseCol : frac > 0.25 ? '#ffaa00' : '#ee2222';

    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
    ctx.fillStyle = '#222';
    ctx.fillRect(bx, by, barW, barH);
    ctx.fillStyle = barCol;
    ctx.fillRect(bx, by, barW * frac, barH);
    if (sprH > 80 && e.variantLabel) {
      ctx.fillStyle = baseCol;
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(e.variantLabel, screenX, by - 3);
      ctx.textAlign = 'left';
    }
  }
  ctx.restore();
}

// ─── Wave announcement ────────────────────────────────────────────────────────

export function renderWaveMessage(ctx, waveMessage) {
  const maxTimer = waveMessage.isBoss ? 4.0 : 3.5;
  const frac  = Math.min(1, waveMessage.timer / maxTimer);
  const alpha = frac < 0.25 ? frac / 0.25 : frac > 0.75 ? (frac - 0.75) / 0.25 : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, SCREEN_H / 2 - 50, SCREEN_W, 80);
  ctx.textAlign = 'center';
  if (waveMessage.isBoss) {
    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 40px monospace';
    ctx.fillText(waveMessage.text, SCREEN_W / 2, SCREEN_H / 2 + 3);
    ctx.fillStyle = '#aa6600';
    ctx.font = '15px monospace';
    ctx.fillText(waveMessage.subtitle || 'PREPARE YOURSELF', SCREEN_W / 2, SCREEN_H / 2 + 24);
  } else if (waveMessage.isBless) {
    ctx.fillStyle = waveMessage.godColor || '#ffdd44';
    ctx.font = 'bold 36px monospace';
    ctx.fillText(waveMessage.text, SCREEN_W / 2, SCREEN_H / 2 + 3);
    ctx.fillStyle = '#dddddd';
    ctx.font = '14px monospace';
    ctx.fillText(waveMessage.subtitle || '', SCREEN_W / 2, SCREEN_H / 2 + 24);
  } else {
    ctx.fillStyle = waveMessage.subtitle ? '#88ffaa' : '#ff6622';
    ctx.font = 'bold 36px monospace';
    ctx.fillText(waveMessage.text, SCREEN_W / 2, SCREEN_H / 2 + 3);
    ctx.fillStyle = '#cc4400';
    ctx.font = '14px monospace';
    ctx.fillText(waveMessage.subtitle || 'FASTER · STRONGER · ANGRIER', SCREEN_W / 2, SCREEN_H / 2 + 22);
  }
  ctx.textAlign = 'left';
  ctx.restore();
}

export function renderBossHealthBar(ctx, boss) {
  const frac = Math.max(0, boss.health / boss.maxHealth);
  const barW = 420, barH = 18;
  const bx = SCREEN_W / 2 - barW / 2;
  const by = 36;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(bx - 10, by - 18, barW + 20, barH + 26);
  ctx.fillStyle = '#ffcc00';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  const bossLabel = boss.bossName ? `⚡ ${boss.bossName} ⚡` : '⚡ BOSS ⚡';
  ctx.fillText(bossLabel, SCREEN_W / 2, by - 4);
  ctx.fillStyle = '#1a0000';
  ctx.fillRect(bx, by, barW, barH);
  const barCol = frac > 0.6 ? '#cc9900' : frac > 0.3 ? '#dd4400' : '#cc0000';
  ctx.fillStyle = barCol;
  ctx.fillRect(bx, by, barW * frac, barH);
  ctx.strokeStyle = '#ffcc00';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx, by, barW, barH);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(`${boss.health} / ${boss.maxHealth}`, SCREEN_W / 2, by + 13);
  ctx.textAlign = 'left';
  ctx.restore();
}

// ─── Victory / Game Over ──────────────────────────────────────────────────────

const VICTORY_MSGS = {
  domination: { title: 'HADES IS VANQUISHED', sub: 'The God of the Dead has been cast back to the underworld.', color: '#ccaaff' },
  escape:      { title: 'THESEUS ESCAPES', sub: 'You fled the labyrinth and lived to tell it.', color: '#00ff88' },
};

// Shared bounds for the "MAIN MENU" button on end screens
export const MENU_BTN = { x: SCREEN_W / 2 - 100, y: SCREEN_H / 2 + 132, w: 200, h: 40 };

export function hitTestMenuButton(mx, my) {
  return mx >= MENU_BTN.x && mx <= MENU_BTN.x + MENU_BTN.w &&
         my >= MENU_BTN.y && my <= MENU_BTN.y + MENU_BTN.h;
}

function drawMenuButton(ctx) {
  ctx.fillStyle = 'rgba(0,255,68,0.12)';
  ctx.strokeStyle = '#00ff44';
  ctx.lineWidth = 1.5;
  ctx.fillRect(MENU_BTN.x, MENU_BTN.y, MENU_BTN.w, MENU_BTN.h);
  ctx.strokeRect(MENU_BTN.x, MENU_BTN.y, MENU_BTN.w, MENU_BTN.h);
  ctx.fillStyle = '#00ff44';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('MAIN MENU', SCREEN_W / 2, MENU_BTN.y + 26);
}

export function renderVictory(ctx, state) {
  const info = VICTORY_MSGS[state.victoryType] || VICTORY_MSGS.escape;
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  ctx.textAlign = 'center';
  ctx.fillStyle = info.color;
  ctx.font = 'bold 56px monospace';
  ctx.fillText(info.title, SCREEN_W / 2, SCREEN_H / 2 - 40);

  ctx.fillStyle = '#ccc';
  ctx.font = '22px monospace';
  ctx.fillText(info.sub, SCREEN_W / 2, SCREEN_H / 2 + 10);

  // List defeated bosses
  const defeated = state.defeatedBosses || [];
  if (defeated.length > 0) {
    ctx.fillStyle = '#ffaa44';
    ctx.font = '14px monospace';
    ctx.fillText(`Bosses slain: ${defeated.join('  ·  ')}`, SCREEN_W / 2, SCREEN_H / 2 + 48);
  }

  ctx.fillStyle = '#888';
  ctx.font = '16px monospace';
  ctx.fillText(`Enemies slain: ${state.player.kills}`, SCREEN_W / 2, SCREEN_H / 2 + 75);
  ctx.fillText('R — enter the labyrinth again  ·  Enter — main menu', SCREEN_W / 2, SCREEN_H / 2 + 108);
  ctx.textAlign = 'left';
  drawMenuButton(ctx);
}

export function renderClickToPlay(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#00ff44';
  ctx.font = 'bold 30px monospace';
  ctx.fillText('CLICK TO ENTER THE LABYRINTH', SCREEN_W / 2, SCREEN_H / 2 - 10);
  ctx.fillStyle = '#557755';
  ctx.font = '14px monospace';
  ctx.fillText('Locks mouse for look controls', SCREEN_W / 2, SCREEN_H / 2 + 22);
  ctx.fillText('WASD move  ·  Space shoot  ·  E interact', SCREEN_W / 2, SCREEN_H / 2 + 44);
  ctx.textAlign = 'left';
}

export function renderGameOver(ctx, state) {
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#cc0000';
  ctx.font = 'bold 60px monospace';
  ctx.fillText('CONSUMED BY THE LABYRINTH', SCREEN_W / 2, SCREEN_H / 2 - 30);

  ctx.fillStyle = '#888';
  ctx.font = '18px monospace';
  ctx.fillText(`Minotaurs slain: ${state.player.kills}`, SCREEN_W / 2, SCREEN_H / 2 + 20);
  ctx.fillText('Press R to enter the labyrinth again', SCREEN_W / 2, SCREEN_H / 2 + 55);
  ctx.textAlign = 'left';
  drawMenuButton(ctx);
}

export function renderFloorTransition(ctx, state) {
  const floor = state.floor || 1;
  const timer = state.floorAdvanceTimer ?? 2.5;
  const alpha = timer <= 0.5 ? timer / 0.5 : 1;
  const defeated = state.defeatedBosses || [];
  // The boss slain to reach this floor is the last entry in defeatedBosses
  const slain = defeated[defeated.length - 1];
  const slainLine = slain ? `${slain} HAS FALLEN` : '';
  const subtitles = { 2: 'NERO AWAITS IN THE DEPTHS', 3: 'HADES STIRS BELOW' };
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  ctx.textAlign = 'center';
  if (slainLine) {
    ctx.fillStyle = '#ff4422';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(slainLine, SCREEN_W / 2, SCREEN_H / 2 - 56);
  }
  ctx.fillStyle = '#ccaaff';
  ctx.font = 'bold 52px monospace';
  ctx.fillText(`FLOOR  ${floor}`, SCREEN_W / 2, SCREEN_H / 2 - 10);
  ctx.fillStyle = '#998866';
  ctx.font = '18px monospace';
  ctx.fillText(subtitles[floor] || '', SCREEN_W / 2, SCREEN_H / 2 + 28);
  ctx.textAlign = 'left';
  ctx.restore();
}

export function renderPauseOverlay(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  ctx.fillStyle = 'rgba(0,18,0,0.92)';
  ctx.strokeStyle = '#00ff44';
  ctx.lineWidth = 2;
  ctx.fillRect(SCREEN_W / 2 - 200, SCREEN_H / 2 - 90, 400, 180);
  ctx.strokeRect(SCREEN_W / 2 - 200, SCREEN_H / 2 - 90, 400, 180);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#00ff44';
  ctx.font = 'bold 40px monospace';
  ctx.fillText('PAUSED', SCREEN_W / 2, SCREEN_H / 2 - 24);

  ctx.fillStyle = '#99cc99';
  ctx.font = '16px monospace';
  ctx.fillText('P or Esc to resume', SCREEN_W / 2, SCREEN_H / 2 + 14);
  ctx.fillText('M toggles audio while paused', SCREEN_W / 2, SCREEN_H / 2 + 40);
  ctx.textAlign = 'left';
}
