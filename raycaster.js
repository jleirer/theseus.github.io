// raycaster.js — DDA raycasting renderer
import { SCREEN_W, SCREEN_H, HALF_W, HALF_H, TEX, FOV_TAN } from './constants.js';

// ─── Pixel buffer ─────────────────────────────────────────────────────────────

let imageData, buf32, zBuf;

export function initRenderer(ctx) {
  imageData = ctx.createImageData(SCREEN_W, SCREEN_H);
  buf32     = new Uint32Array(imageData.data.buffer);
  zBuf      = new Float32Array(SCREEN_W);
  generateTextures();
  generateSprites();
}

// ─── Procedural textures ──────────────────────────────────────────────────────

const TEXTURES = [];  // Uint32Array[TEX*TEX] each

function pack(r, g, b) { return (0xFF << 24) | (b << 16) | (g << 8) | r; }

function generateTextures() {
  // Tex 0: limestone blocks (ancient labyrinth)
  const t0 = new Uint32Array(TEX * TEX);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const row  = Math.floor(y / 12);
      const offX = (row % 2) * 10;
      const mortV = ((x + offX) % 20) < 2;
      const mortH = (y % 12) < 2;
      const n = (x * 11 + y * 7 + row * 29) % 28 - 14;
      t0[y * TEX + x] = (mortV || mortH)
        ? pack(75, 65, 50)
        : pack(185 + n, 165 + n, 120 + n);
    }
  }
  TEXTURES.push(t0);

  // Tex 1: rougher stone (darker passages)
  const t1 = new Uint32Array(TEX * TEX);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const block = Math.floor(y / 10);
      const seam  = (y % 10) < 2 || (x % 12) < 2;
      const n = (x * 9 + y * 5 + block * 17) % 22 - 11;
      t1[y * TEX + x] = seam
        ? pack(55, 45, 32)
        : pack(140 + n, 118 + n, 85 + n);
    }
  }
  TEXTURES.push(t1);
}

// ─── Procedural sprite textures (64×64, 0 = transparent) ─────────────────────

const SPRITES = [];

function makeTex(fn) {
  const t = new Uint32Array(TEX * TEX); // 0 = transparent
  const s = (x, y, r, g, b) => {
    if (x >= 0 && x < TEX && y >= 0 && y < TEX) t[y * TEX + x] = pack(r, g, b);
  };
  const rect = (x, y, w, h, r, g, b) => {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) s(x+dx, y+dy, r, g, b);
  };
  const circ = (cx, cy, rad, r, g, b) => {
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++)
      if (dx*dx + dy*dy <= rad*rad) s(cx+dx, cy+dy, r, g, b);
  };
  fn({ rect, circ, s });
  return t;
}

function generateSprites() {
  // 0: Minotaur (bull-headed humanoid)
  SPRITES.push(makeTex(({ rect, circ, s }) => {
    // Horns (sweeping upward)
    rect(16, 1, 6, 16, 195, 155, 80);  rect(42, 1, 6, 16, 195, 155, 80);
    rect(14, 5, 4, 10, 215, 175, 95);  rect(46, 5, 4, 10, 215, 175, 95);
    // Head (large, bull-like)
    circ(32, 16, 13, 145, 102, 58);
    // Ears
    circ(18, 12, 5, 160, 115, 65);  circ(46, 12, 5, 160, 115, 65);
    circ(18, 12, 3, 185, 130, 95);  circ(46, 12, 3, 185, 130, 95);
    // Eyes (dark, angry red glint)
    rect(24, 10, 6, 5, 12, 4, 0);  rect(34, 10, 6, 5, 12, 4, 0);
    s(26, 12, 140, 15, 15);  s(36, 12, 140, 15, 15);
    // Snout / muzzle
    circ(32, 21, 7, 162, 115, 70);
    rect(28, 17, 4, 5, 22, 8, 2);  rect(36, 17, 4, 5, 22, 8, 2);  // nostrils
    // Neck
    rect(25, 28, 14, 8, 125, 85, 45);
    // Torso (wide, muscular)
    rect(14, 36, 36, 20, 118, 78, 40);
    // Arms (thick, powerful)
    rect(2, 36, 12, 20, 105, 68, 34);  rect(50, 36, 12, 20, 105, 68, 34);
    circ(7, 56, 6, 88, 55, 28);  circ(57, 56, 6, 88, 55, 28);  // fists
    // Legs
    rect(16, 56, 13, 7, 105, 68, 34);  rect(35, 56, 13, 7, 105, 68, 34);
    // Hooves
    rect(15, 61, 14, 3, 38, 24, 8);  rect(35, 61, 14, 3, 38, 24, 8);
  }));

  // 1: Cache (gold chest)
  SPRITES.push(makeTex(({ rect }) => {
    rect(14, 26, 36, 22, 210, 170, 25); // chest body
    rect(14, 18, 36,  9, 230, 195, 40); // lid
    rect(14, 26, 36,  2, 110,  90,  8); // seam
    rect(30, 18,  4, 30, 110,  90,  8); // clasp
    rect(29, 33,  6,  6,  55,  45,  4); // keyhole
  }));

  // 2: Exit portal (bright green rings)
  SPRITES.push(makeTex(({ circ, rect }) => {
    circ(32, 34, 20, 20, 180, 40);
    circ(32, 34, 16,  20, 220,  60);
    circ(32, 34, 11,  30, 255,  90);
    circ(32, 34,  6, 200, 255, 150);
    rect(28,  8,  8, 12,  20, 230,  70); // arrow
    rect(24, 12, 16,  4,  20, 230,  70);
  }));

  // 3: Scout (cyan)
  SPRITES.push(makeTex(({ rect, circ }) => {
    circ(32, 13, 7, 40, 220, 220);
    rect(25, 22, 14, 18, 30, 180, 180);
    rect(16, 23,  9, 10, 20, 150, 150); rect(39, 23,  9, 10, 20, 150, 150);
    rect(25, 40,  5, 13, 20, 130, 130); rect(34, 40,  5, 13, 20, 130, 130);
  }));

  // 4: Guard (blue, bulkier)
  SPRITES.push(makeTex(({ rect, circ }) => {
    circ(32, 13, 9, 50, 80, 230);
    rect(20, 23, 24, 22, 40, 60, 200);
    rect(10, 23, 10, 16, 30, 50, 175); rect(44, 23, 10, 16, 30, 50, 175);
    rect(20, 45,  9, 14, 25, 40, 160); rect(35, 45,  9, 14, 25, 40, 160);
  }));

  // 5: Hunter (purple)
  SPRITES.push(makeTex(({ rect, circ }) => {
    circ(32, 13, 8, 160, 40, 220);
    rect(24, 22, 16, 20, 130, 30, 185);
    rect(15, 23, 9,  13, 105, 25, 155); rect(40, 23, 9, 13, 105, 25, 155);
    rect(24, 42, 6, 14,  95, 20, 140); rect(34, 42, 6, 14,  95, 20, 140);
  }));

  // 6: Small health pack (pink heart, +10 HP)
  SPRITES.push(makeTex(({ s }) => {
    for (let py = 0; py < TEX; py++) {
      for (let px = 0; px < TEX; px++) {
        const nx = (px - 32) / 11;
        const ny = -(py - 38) / 11;
        const v = Math.pow(nx*nx + ny*ny - 1, 3) - nx*nx * ny*ny*ny;
        if (v <= 0) s(px, py, 230, 90, 130);
      }
    }
  }));

  // 7: Large health pack (bright red heart + white cross, full HP restore)
  SPRITES.push(makeTex(({ s, rect }) => {
    for (let py = 0; py < TEX; py++) {
      for (let px = 0; px < TEX; px++) {
        const nx = (px - 32) / 16;
        const ny = -(py - 40) / 16;
        const v = Math.pow(nx*nx + ny*ny - 1, 3) - nx*nx * ny*ny*ny;
        if (v <= 0) s(px, py, 255, 40, 60);
      }
    }
    rect(30, 24, 4, 13, 255, 255, 255);  // white cross vertical
    rect(24, 29, 16, 4, 255, 255, 255);  // white cross horizontal
  }));

  // 8: Nero (Roman Emperor boss — laurel crown, purple toga, torch)
  SPRITES.push(makeTex(({ rect, circ, s }) => {
    // Laurel crown (gold band + leaf clusters)
    rect(14, 4, 36, 4, 200, 165, 0);
    rect(10, 1, 7, 7, 185, 150, 0);   rect(22, 0, 6, 5, 195, 160, 0);
    rect(36, 0, 6, 5, 195, 160, 0);   rect(47, 1, 7, 7, 185, 150, 0);
    // Head (pale Roman skin)
    circ(32, 16, 11, 218, 182, 140);
    // Dark beard
    rect(22, 19, 20, 7, 55, 38, 22);  rect(24, 25, 16, 4, 40, 28, 15);
    // Eyes (dark, intense)
    rect(26, 13, 4, 3, 18, 12, 6);    rect(34, 13, 4, 3, 18, 12, 6);
    s(27, 14, 210, 160, 80);          s(35, 14, 210, 160, 80);
    // Neck
    rect(28, 27, 8, 5, 205, 168, 128);
    // Purple toga body (wide, imperial)
    rect(8, 32, 48, 24, 105, 12, 155);
    rect(8, 32, 48, 2, 200, 162, 0);   // gold top trim
    rect(8, 54, 48, 2, 200, 162, 0);   // gold bottom trim
    // Left arm + fist
    rect(4, 34, 8, 20, 92, 10, 138);
    circ(8, 56, 5, 195, 160, 125);
    // Right arm (raised — holding torch)
    rect(52, 28, 8, 16, 92, 10, 138);
    circ(56, 27, 5, 195, 160, 125);
    // Torch handle
    rect(54, 10, 4, 20, 115, 75, 35);
    // Torch flame (orange + yellow core)
    rect(51, 2, 10, 9, 240, 110, 10);
    rect(53, 0, 6, 6, 255, 210, 20);
    s(56, 0, 255, 255, 120);
    // Legs (toga)
    rect(14, 56, 12, 8, 88, 8, 128);   rect(38, 56, 12, 8, 88, 8, 128);
    // Sandals (gold straps)
    rect(12, 62, 16, 2, 160, 120, 55); rect(36, 62, 16, 2, 160, 120, 55);
  }));
}

// ─── Shade / distance fog ─────────────────────────────────────────────────────

function shadeColor(color, dist, sideY) {
  let s = Math.min(1.0, 5.5 / (dist + 0.8));
  if (sideY) s *= 0.55;
  const r = ((color & 0xFF) * s) | 0;
  const g = (((color >> 8) & 0xFF) * s) | 0;
  const b = (((color >> 16) & 0xFF) * s) | 0;
  return (0xFF << 24) | (b << 16) | (g << 8) | r;
}

// ─── Main render ──────────────────────────────────────────────────────────────

export function renderScene(ctx, state) {
  if (!imageData) initRenderer(ctx);

  const { cells, map, player } = state;
  const { w: mapW, h: mapH } = map;

  // Pre-fill ceiling and floor (ancient stone labyrinth)
  const CEIL  = pack(14, 11, 7);
  const FLOOR = pack(58, 47, 28);
  buf32.fill(CEIL,  0,                SCREEN_W * HALF_H);
  buf32.fill(FLOOR, SCREEN_W * HALF_H, SCREEN_W * SCREEN_H);

  const posX = player.x, posY = player.y;
  const dirX = Math.cos(player.angle), dirY = Math.sin(player.angle);
  const plX  = -dirY * FOV_TAN,        plY  = dirX * FOV_TAN;

  // ── Wall pass ──
  for (let col = 0; col < SCREEN_W; col++) {
    const camX   = (2 * col / SCREEN_W) - 1;
    const rayDX  = dirX + plX * camX;
    const rayDY  = dirY + plY * camX;

    let mapX = Math.floor(posX), mapY = Math.floor(posY);

    const ddX = rayDX === 0 ? 1e30 : Math.abs(1 / rayDX);
    const ddY = rayDY === 0 ? 1e30 : Math.abs(1 / rayDY);

    const stepX = rayDX < 0 ? -1 : 1;
    const stepY = rayDY < 0 ? -1 : 1;

    let sideX = rayDX < 0 ? (posX - mapX) * ddX : (mapX + 1 - posX) * ddX;
    let sideY = rayDY < 0 ? (posY - mapY) * ddY : (mapY + 1 - posY) * ddY;

    let side = 0, hit = false;
    let safety = 0;
    while (!hit && safety++ < 96) {
      if (sideX < sideY) { sideX += ddX; mapX += stepX; side = 0; }
      else               { sideY += ddY; mapY += stepY; side = 1; }
      if (mapX < 0 || mapY < 0 || mapX >= mapW || mapY >= mapH) { hit = true; break; }
      if (cells[mapY * mapW + mapX] !== 0) hit = true;
    }

    const perp = side === 0 ? sideX - ddX : sideY - ddY;
    zBuf[col] = perp;

    const lineH = Math.floor(SCREEN_H / Math.max(perp, 0.01));
    const yTop  = Math.max(0,          HALF_H - (lineH >> 1));
    const yBot  = Math.min(SCREEN_H-1, HALF_H + (lineH >> 1));

    // Texture column
    let wallX = side === 0
      ? posY + perp * rayDY
      : posX + perp * rayDX;
    wallX -= Math.floor(wallX);
    let texCol = Math.floor(wallX * TEX);
    if (side === 0 && rayDX > 0) texCol = TEX - texCol - 1;
    if (side === 1 && rayDY < 0) texCol = TEX - texCol - 1;

    // Alternate texture by map region for variety
    const texIdx = ((Math.floor(mapX / 8) + Math.floor(mapY / 8)) % 2);
    const tex = TEXTURES[texIdx];
    const step   = TEX / lineH;
    let texPos   = (yTop - HALF_H + lineH / 2) * step;

    for (let y = yTop; y <= yBot; y++) {
      const ty  = Math.floor(texPos) & (TEX - 1);
      texPos += step;
      buf32[y * SCREEN_W + col] = shadeColor(tex[ty * TEX + texCol], perp, side === 1);
    }
  }

  // ── Sprite pass ──
  const sprites = collectSprites(state);
  sprites.sort((a, b) => b.dist2 - a.dist2);

  for (const spr of sprites) {
    const sx = spr.x - posX, sy = spr.y - posY;
    const invDet = 1 / (plX * dirY - dirX * plY);
    const tX     = invDet * (dirY * sx  - dirX * sy);
    const tY     = invDet * (-plY * sx  + plX  * sy);
    if (tY <= 0.2) continue;

    const screenX = Math.floor(HALF_W * (1 + tX / tY));
    const sprH    = Math.abs(Math.floor(SCREEN_H / tY));
    const sprW    = sprH;

    const drawY0 = Math.max(0, HALF_H - (sprH >> 1));
    const drawY1 = Math.min(SCREEN_H - 1, HALF_H + (sprH >> 1));
    const drawX0 = Math.max(0, screenX - (sprW >> 1));
    const drawX1 = Math.min(SCREEN_W - 1, screenX + (sprW >> 1));

    const tex = SPRITES[spr.spriteId] || SPRITES[0];
    const shade = Math.min(1.0, 5.5 / (tY + 0.8));

    for (let sx2 = drawX0; sx2 <= drawX1; sx2++) {
      if (zBuf[sx2] < tY) continue;  // behind wall
      const texX2 = Math.floor((sx2 - (screenX - sprW / 2)) * TEX / sprW);
      const flash = spr.hitTimer > 0 ? Math.min(1, spr.hitTimer * 8) : 0;
      const bloodFrac = (spr.health != null) ? Math.max(0, 1 - spr.health / spr.maxHealth) : 0;
      for (let sy2 = drawY0; sy2 <= drawY1; sy2++) {
        const texY = Math.floor((sy2 - (HALF_H - sprH / 2)) * TEX / sprH);
        const raw  = tex[texY * TEX + texX2];
        if (!raw) continue; // transparent
        let r = ((raw & 0xFF) * shade) | 0;
        let g = (((raw >> 8) & 0xFF) * shade) | 0;
        let b = (((raw >> 16) & 0xFF) * shade) | 0;
        if (bloodFrac > 0) {
          const bf2 = bloodFrac * bloodFrac;
          r = Math.min(255, r + ((190 * bf2) | 0));
          g = Math.max(0, (g * (1 - bloodFrac * 0.65)) | 0);
          b = Math.max(0, (b * (1 - bloodFrac * 0.75)) | 0);
        }
        if (flash > 0) {
          r = Math.min(255, r + (((255 - r) * flash) | 0));
          g = Math.min(255, g + (((255 - g) * flash) | 0));
          b = Math.min(255, b + (((255 - b) * flash) | 0));
        }
        buf32[sy2 * SCREEN_W + sx2] = (0xFF << 24) | (b << 16) | (g << 8) | r;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function collectSprites(state) {
  const { player } = state;
  const sprites = [];

  for (const e of state.enemies) {
    if (e.dead) continue;
    sprites.push({ x: e.x, y: e.y, spriteId: e.spriteId,
      dist2: Math.hypot(e.x - player.x, e.y - player.y),
      hitTimer: e.hitTimer, health: e.health, maxHealth: e.maxHealth });
  }
  for (const m of state.minions) {
    if (m.dead) continue;
    sprites.push({ x: m.x, y: m.y, spriteId: m.spriteId,
      dist2: Math.hypot(m.x - player.x, m.y - player.y) });
  }
  for (const c of state.caches) {
    if (c.found) continue;
    sprites.push({ x: c.x, y: c.y, spriteId: 1,
      dist2: Math.hypot(c.x - player.x, c.y - player.y) });
  }
  if (state.exit) {
    sprites.push({ x: state.exit.x, y: state.exit.y, spriteId: 2,
      dist2: Math.hypot(state.exit.x - player.x, state.exit.y - player.y) });
  }
  for (const hp of (state.healthPacks || [])) {
    if (hp.collected) continue;
    sprites.push({ x: hp.x, y: hp.y, spriteId: hp.spriteId,
      dist2: Math.hypot(hp.x - player.x, hp.y - player.y) });
  }
  return sprites;
}
