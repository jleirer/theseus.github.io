// raycaster.js — DDA raycasting renderer
import { SCREEN_W, SCREEN_H, HALF_W, HALF_H, TEX, FOV_TAN } from './constants.js';

// ─── Pixel buffer ─────────────────────────────────────────────────────────────

let imageData, buf32, zBuf;

export function initRenderer(ctx) {
  imageData = ctx.createImageData(SCREEN_W, SCREEN_H);
  buf32     = new Uint32Array(imageData.data.buffer);
  zBuf      = new Float32Array(SCREEN_W);
}

export async function loadAssets() {
  const offscreen = document.createElement('canvas');
  offscreen.width  = TEX;
  offscreen.height = TEX;
  const octx = offscreen.getContext('2d', { willReadFrequently: true });

  function imgToTex(img, transparent) {
    octx.clearRect(0, 0, TEX, TEX);
    octx.drawImage(img, 0, 0, TEX, TEX);
    const { data } = octx.getImageData(0, 0, TEX, TEX);
    const buf = new Uint32Array(TEX * TEX);
    for (let i = 0; i < buf.length; i++) {
      const r = data[i*4], g = data[i*4+1], b = data[i*4+2], a = data[i*4+3];
      buf[i] = (transparent && a < 128) ? 0 : (0xFF << 24) | (b << 16) | (g << 8) | r;
    }
    return buf;
  }

  function loadImg(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload  = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load ${src}`));
      img.src = src;
    });
  }

  const [s0,s1,s2,s3,s4,s5,s6,s7,s8,w1,w2] = await Promise.all([
    loadImg('Images/Sprite0.png'), loadImg('Images/Sprite1.png'),
    loadImg('Images/Sprite2.png'), loadImg('Images/Sprite3.png'),
    loadImg('Images/Sprite4.png'), loadImg('Images/Sprite5.png'),
    loadImg('Images/Sprite6.png'), loadImg('Images/Sprite7.png'),
    loadImg('Images/Sprite8.png'),
    loadImg('Images/Wall1.png'),   loadImg('Images/Wall2.png'),
  ]);

  SPRITES.length = 0;
  SPRITES.push(
    imgToTex(s0,true), imgToTex(s1,true), imgToTex(s2,true),
    imgToTex(s3,true), imgToTex(s4,true), imgToTex(s5,true),
    imgToTex(s6,true), imgToTex(s7,true), imgToTex(s8,true),
  );
  TEXTURES.length = 0;
  TEXTURES.push(imgToTex(w1,false), imgToTex(w2,false));
}

// ─── Sprite and texture buffers (populated by loadAssets) ────────────────────

const TEXTURES = [];  // Uint32Array[TEX*TEX] each
const SPRITES  = [];  // Uint32Array[TEX*TEX] each, 0 = transparent

function pack(r, g, b) { return (0xFF << 24) | (b << 16) | (g << 8) | r; }

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
