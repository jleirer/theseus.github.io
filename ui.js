// ui.js — HUD, minimap, overlays
import { SCREEN_W, SCREEN_H, HALF_W, HALF_H, FOV_TAN, WEAPONS, TECH_PREREQS, TECH_NODE_POS, MINION_STATS } from './constants.js';
import { weaponNodeState } from './weapons.js';
import { hasLOS } from './pathfinding.js';

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
  const { player, enemies, caches, exit } = state;

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

  // --- Bottom-center: weapon ---
  const wname = WEAPONS[player.activeWeapon]?.name || '';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(SCREEN_W/2 - 90, SCREEN_H - 34, 180, 26);
  ctx.fillStyle = '#ffee88';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`[ ${wname} ]`, SCREEN_W / 2, SCREEN_H - 16);
  ctx.textAlign = 'left';

  drawWeaponSprite(ctx, player.activeWeapon, state);

  // --- Top bar: win conditions ---
  const totalEnemies = enemies.length;
  const deadEnemies  = enemies.filter(e => e.dead).length;

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, SCREEN_W, 28);

  ctx.font = '12px monospace';

  // Wave
  ctx.fillStyle = state.wave >= 2 ? '#ff8844' : '#666';
  ctx.fillText(`WAVE ${state.wave}`, SCREEN_W - 70, 18);

  // Domination
  const domDone = deadEnemies === totalEnemies && totalEnemies > 0;
  ctx.fillStyle = domDone ? '#00ff44' : '#ff4444';
  ctx.fillText(`⚔ ${deadEnemies}/${totalEnemies} SLAIN`, 12, 18);

  // Escape
  const nearExit = state.exit &&
    Math.hypot(state.player.x - state.exit.x, state.player.y - state.exit.y) < 1.5;
  ctx.fillStyle = nearExit ? '#00ff44' : '#88aaff';
  ctx.fillText(`⬡ EXIT:${nearExit ? ' [E] FLEE' : ' NOT REACHED'}`, 200, 18);

  // Minion count
  const aliveMins = state.minions.filter(m => !m.dead).length;
  ctx.fillStyle = '#aaddff';
  ctx.fillText(`◉ ALLIES: ${aliveMins}`, 420, 18);
}

// Simple weapon sprite at bottom-center
function drawWeaponSprite(ctx, weaponId, state) {
  const bob = state.player.isMoving ? Math.sin(state.player.bobTimer) * 9 : 0;
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
      ctx.fillStyle = '#ff3333';
      ctx.beginPath();
      ctx.arc(mx + e.x * scale, my + e.y * scale, Math.max(2, scale), 0, Math.PI * 2);
      ctx.fill();
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
    }
  }

  // Minion buttons
  const minionTypes = ['scout', 'guard', 'hunter'];
  const mBY = OVL_Y + 415;
  for (let i = 0; i < 3; i++) {
    const bx = OVL_X + 70 + i * 195;
    if (cx >= bx && cx <= bx + 170 && cy >= mBY && cy <= mBY + 70) {
      return { type: 'minion', id: minionTypes[i] };
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
  ctx.fillText('WEAPON TECH TREE', SCREEN_W / 2, OVL_Y + 34);
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
    const ns  = weaponNodeState(id, owned);
    const nx  = OVL_X + pos.x - NODE_W / 2;
    const ny  = OVL_Y + pos.y - NODE_H / 2;
    const hov = mouse && mx_in(mouse, nx, ny, NODE_W, NODE_H) && ns === 'available';
    const ksel = keyboardSel === id;

    ctx.save();
    if (ns === 'owned')          { ctx.fillStyle = '#0d2e12'; ctx.strokeStyle = '#00cc44'; }
    else if (ns === 'available') { ctx.fillStyle = hov || ksel ? '#3a3a00' : '#222200'; ctx.strokeStyle = hov || ksel ? '#ffff66' : '#dddd00'; }
    else                         { ctx.fillStyle = ksel ? '#1a1400' : '#111'; ctx.strokeStyle = ksel ? '#886600' : '#333'; }

    if (hov || ksel) { ctx.shadowBlur = 12; ctx.shadowColor = '#ffff00'; }
    if (ksel) { ctx.lineWidth = 2.5; }

    ctx.lineWidth = 2;
    ctx.fillRect(nx, ny, NODE_W, NODE_H);
    ctx.strokeRect(nx, ny, NODE_W, NODE_H);
    ctx.shadowBlur = 0;

    const w = WEAPONS[id];
    ctx.fillStyle = ns === 'locked' ? '#555' : ns === 'owned' ? '#00cc44' : '#ffee44';
    ctx.font = `bold 11px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(w.name, OVL_X + pos.x, ny + 18);
    ctx.fillStyle = ns === 'locked' ? '#444' : '#aaa';
    ctx.font = '9px monospace';
    ctx.fillText(`DMG:${w.damage}  ${w.fireRate}/s`, OVL_X + pos.x, ny + 34);
    if (ns === 'owned')      ctx.fillText('✓ OWNED',     OVL_X + pos.x, ny + 44);
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
  ctx.fillText('— OR SPAWN A MINION —', SCREEN_W / 2, OVL_Y + 408);
  ctx.textAlign = 'left';

  // Minion buttons
  const mBY = OVL_Y + 415;
  const mTypes = ['scout', 'guard', 'hunter'];
  for (let i = 0; i < 3; i++) {
    const bx  = OVL_X + 70 + i * 195;
    const st  = MINION_STATS[mTypes[i]];
    const hov  = mouse && mx_in(mouse, bx, mBY, 170, 70);
    const ksel = keyboardSel === `minion${i}`;
    const [cr, cg, cb] = st.color;

    ctx.save();
    ctx.fillStyle = hov || ksel ? `rgba(${cr},${cg},${cb},0.22)` : `rgba(${cr},${cg},${cb},0.08)`;
    ctx.strokeStyle = ksel ? '#ffffff' : `rgb(${cr},${cg},${cb})`;
    ctx.lineWidth = hov || ksel ? 2 : 1;
    if (hov || ksel) { ctx.shadowBlur = 10; ctx.shadowColor = ksel ? '#ffffff' : `rgb(${cr},${cg},${cb})`; }
    ctx.fillRect(bx, mBY, 170, 70);
    ctx.strokeRect(bx, mBY, 170, 70);
    ctx.shadowBlur = 0;

    ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(mTypes[i].toUpperCase(), bx + 85, mBY + 18);
    ctx.fillStyle = '#aaa';
    ctx.font = '9px monospace';
    ctx.fillText(`HP:${st.health}  SPD:${st.speed}`, bx + 85, mBY + 34);
    ctx.fillText(st.desc, bx + 85, mBY + 48);
    ctx.fillText('(Click to spawn)', bx + 85, mBY + 62);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  ctx.fillStyle = '#555';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Click or use Arrow Keys + Enter/Space to select. Highlighted nodes are available.', SCREEN_W/2, OVL_Y + 494);
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
        const cx = SCREEN_W / 2, cy = SCREEN_H / 2 - 20;
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

// ─── Enemy health bars ────────────────────────────────────────────────────────

function projectEnemy(ex, ey, player) {
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
    const barCol = frac > 0.5 ? '#22cc44' : frac > 0.25 ? '#ffaa00' : '#ee2222';

    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
    ctx.fillStyle = '#222';
    ctx.fillRect(bx, by, barW, barH);
    ctx.fillStyle = barCol;
    ctx.fillRect(bx, by, barW * frac, barH);
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
    ctx.fillText('THE EMPEROR OF ROME HAS COME TO FINISH YOU', SCREEN_W / 2, SCREEN_H / 2 + 24);
  } else {
    ctx.fillStyle = '#ff6622';
    ctx.font = 'bold 36px monospace';
    ctx.fillText(waveMessage.text, SCREEN_W / 2, SCREEN_H / 2 + 3);
    ctx.fillStyle = '#cc4400';
    ctx.font = '14px monospace';
    ctx.fillText('FASTER · STRONGER · ANGRIER', SCREEN_W / 2, SCREEN_H / 2 + 22);
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
  ctx.fillText('⚡ NERO — EMPEROR OF ROME ⚡', SCREEN_W / 2, by - 4);
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
  domination: { title: 'NERO IS DEAD', sub: 'The Emperor has fallen. Rome will never forget.', color: '#ffcc00' },
  escape:      { title: 'THESEUS ESCAPES', sub: 'You fled the labyrinth and lived to tell it.', color: '#00ff88' },
};

// Shared bounds for the "MAIN MENU" button on end screens
export const MENU_BTN = { x: SCREEN_W / 2 - 100, y: SCREEN_H / 2 + 110, w: 200, h: 40 };

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

  ctx.fillStyle = '#888';
  ctx.font = '16px monospace';
  ctx.fillText(`Minotaurs slain: ${state.player.kills}`,
    SCREEN_W / 2, SCREEN_H / 2 + 50);
  ctx.fillText('R — enter the labyrinth again  ·  Enter — main menu', SCREEN_W / 2, SCREEN_H / 2 + 85);
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
