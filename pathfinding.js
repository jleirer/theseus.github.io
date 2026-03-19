// pathfinding.js — A* on flat Uint8Array grid

export function findPath(cells, mapW, mapH, x1, y1, x2, y2) {
  const sx = Math.floor(x1), sy = Math.floor(y1);
  const gx = Math.floor(x2), gy = Math.floor(y2);
  if (sx === gx && sy === gy) return [];
  if (cells[gy * mapW + gx] !== 0) return [];

  const key  = (x, y) => y * mapW + x;
  const h    = (x, y) => Math.abs(x - gx) + Math.abs(y - gy);
  const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];

  const open    = [{ x: sx, y: sy, g: 0, f: h(sx, sy) }];
  const from    = new Map();
  const gScore  = new Map([[key(sx, sy), 0]]);

  let iter = 0;
  while (open.length > 0 && iter++ < 1500) {
    // Pop lowest f — swap with last then pop (O(1) remove vs O(n) splice)
    let mi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[mi].f) mi = i;
    const cur = open[mi];
    open[mi] = open[open.length - 1];
    open.pop();
    const ck  = key(cur.x, cur.y);

    if (cur.x === gx && cur.y === gy) {
      // Reconstruct path (world-space tile centres)
      const path = [{ x: gx + 0.5, y: gy + 0.5 }];
      let k = ck;
      while (from.has(k)) {
        const p = from.get(k);
        path.unshift({ x: p.x + 0.5, y: p.y + 0.5 });
        k = key(p.x, p.y);
      }
      return path;
    }

    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= mapW || ny >= mapH) continue;
      if (cells[ny * mapW + nx] !== 0) continue;

      const ng = (gScore.get(ck) ?? Infinity) + 1;
      const nk = key(nx, ny);
      if (ng < (gScore.get(nk) ?? Infinity)) {
        from.set(nk, cur);
        gScore.set(nk, ng);
        open.push({ x: nx, y: ny, g: ng, f: ng + h(nx, ny) });
      }
    }
  }
  return []; // no path
}

export function hasLOS(cells, mapW, mapH, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const steps = Math.ceil(Math.hypot(dx, dy) * 3) + 1;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const cx = Math.floor(x1 + dx * t);
    const cy = Math.floor(y1 + dy * t);
    if (cx < 0 || cy < 0 || cx >= mapW || cy >= mapH) return false;
    if (cells[cy * mapW + cx] !== 0) return false;
  }
  return true;
}

// Returns random accessible floor tile within [radius] tiles of (ox, oy)
export function randomNearbyFloor(cells, mapW, mapH, ox, oy, radius) {
  const cx = Math.floor(ox), cy = Math.floor(oy);
  const r  = Math.ceil(radius);
  for (let attempt = 0; attempt < 25; attempt++) {
    const tx = cx + Math.floor(Math.random() * (r * 2 + 1)) - r;
    const ty = cy + Math.floor(Math.random() * (r * 2 + 1)) - r;
    if (tx > 0 && ty > 0 && tx < mapW - 1 && ty < mapH - 1 && cells[ty * mapW + tx] === 0)
      return { x: tx + 0.5, y: ty + 0.5 };
  }
  return { x: cx + 0.5, y: cy + 0.5 };
}
