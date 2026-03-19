// mapgen.js — BSP dungeon generator
import { MAP_SIZES, CELL_FLOOR, CELL_WALL } from './constants.js';

class BSPNode {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.left = null; this.right = null; this.room = null;
  }
}

function split(node, minLeaf, depth) {
  if (depth >= 6) return;
  const canSplitH = node.h >= minLeaf * 2;
  const canSplitV = node.w >= minLeaf * 2;
  if (!canSplitH && !canSplitV) return;

  let horiz = canSplitH && canSplitV ? Math.random() < 0.5 : canSplitH;
  if (node.w > node.h * 1.3) horiz = false;
  if (node.h > node.w * 1.3) horiz = true;

  const dim = horiz ? node.h : node.w;
  const pos = minLeaf + Math.floor(Math.random() * (dim - minLeaf * 2 + 1));

  if (horiz) {
    node.left  = new BSPNode(node.x, node.y,         node.w, pos);
    node.right = new BSPNode(node.x, node.y + pos,   node.w, node.h - pos);
  } else {
    node.left  = new BSPNode(node.x,         node.y, pos,         node.h);
    node.right = new BSPNode(node.x + pos,   node.y, node.w - pos, node.h);
  }
  split(node.left,  minLeaf, depth + 1);
  split(node.right, minLeaf, depth + 1);
}

function placeRooms(node, minRoom) {
  if (!node.left && !node.right) {
    const maxW = node.w - 2, maxH = node.h - 2;
    if (maxW < minRoom || maxH < minRoom) return;
    const rw = minRoom + Math.floor(Math.random() * Math.max(1, maxW - minRoom + 1));
    const rh = minRoom + Math.floor(Math.random() * Math.max(1, maxH - minRoom + 1));
    const rx = node.x + 1 + Math.floor(Math.random() * Math.max(1, node.w - rw - 1));
    const ry = node.y + 1 + Math.floor(Math.random() * Math.max(1, node.h - rh - 1));
    node.room = { x: Math.min(rx, node.x + node.w - rw - 1),
                  y: Math.min(ry, node.y + node.h - rh - 1), w: rw, h: rh };
    return;
  }
  if (node.left)  placeRooms(node.left,  minRoom);
  if (node.right) placeRooms(node.right, minRoom);
}

function getRoom(node) {
  if (node.room) return node.room;
  const l = node.left  ? getRoom(node.left)  : null;
  const r = node.right ? getRoom(node.right) : null;
  if (!l) return r; if (!r) return l;
  return Math.random() < 0.5 ? l : r;
}

function collectRooms(node, out) {
  if (node.room) { out.push(node.room); return; }
  if (node.left)  collectRooms(node.left,  out);
  if (node.right) collectRooms(node.right, out);
}

function carveLine(cells, w, h, x1, y1, x2, y2) {
  let x = x1, y = y1;
  while (x !== x2) {
    setFloor(cells, w, h, x, y); setFloor(cells, w, h, x, y+1);
    x += x < x2 ? 1 : -1;
  }
  while (y !== y2) {
    setFloor(cells, w, h, x, y); setFloor(cells, w, h, x+1, y);
    y += y < y2 ? 1 : -1;
  }
  setFloor(cells, w, h, x, y); setFloor(cells, w, h, x+1, y+1);
}

function setFloor(cells, w, h, x, y) {
  if (x > 0 && y > 0 && x < w - 1 && y < h - 1) cells[y * w + x] = CELL_FLOOR;
}

function connectTree(node, cells, w, h) {
  if (!node.left || !node.right) return;
  connectTree(node.left,  cells, w, h);
  connectTree(node.right, cells, w, h);
  const lr = getRoom(node.left), rr = getRoom(node.right);
  if (!lr || !rr) return;
  const lx = lr.x + Math.floor(lr.w / 2), ly = lr.y + Math.floor(lr.h / 2);
  const rx = rr.x + Math.floor(rr.w / 2), ry = rr.y + Math.floor(rr.h / 2);
  if (Math.random() < 0.5) { carveLine(cells, w, h, lx, ly, rx, ly); carveLine(cells, w, h, rx, ly, rx, ry); }
  else                      { carveLine(cells, w, h, lx, ly, lx, ry); carveLine(cells, w, h, lx, ry, rx, ry); }
}

function carveRooms(node, cells, w) {
  if (node.room) {
    const { x, y, w: rw, h: rh } = node.room;
    for (let ry = y; ry < y + rh; ry++)
      for (let rx = x; rx < x + rw; rx++)
        cells[ry * w + rx] = CELL_FLOOR;
    return;
  }
  if (node.left)  carveRooms(node.left,  cells, w);
  if (node.right) carveRooms(node.right, cells, w);
}

function roomDist(a, b) {
  return Math.hypot(a.x + a.w/2 - b.x - b.w/2, a.y + a.h/2 - b.y - b.h/2);
}

export function generateMap(sizeKey, numEnemies) {
  const { w, h } = MAP_SIZES[sizeKey];
  const cells = new Uint8Array(w * h).fill(CELL_WALL);

  const root = new BSPNode(1, 1, w - 2, h - 2);
  split(root, 7, 0);
  placeRooms(root, 4);
  carveRooms(root, cells, w);
  connectTree(root, cells, w, h);

  const rooms = [];
  collectRooms(root, rooms);

  // Fallback if BSP produced nothing
  if (rooms.length === 0) {
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) cells[y * w + x] = CELL_FLOOR;
    rooms.push({ x: 2, y: 2, w: w - 4, h: h - 4 });
  }

  // Shuffle (keep start room at index 0 after choosing it)
  rooms.sort(() => Math.random() - 0.5);
  const startRoom = rooms[0];

  // Exit: room farthest from start
  let exitRoom = rooms[0];
  let maxDist = 0;
  for (const r of rooms) {
    const d = roomDist(startRoom, r);
    if (d > maxDist) { maxDist = d; exitRoom = r; }
  }

  const rc = (r) => ({ x: r.x + r.w / 2 + 0.5, y: r.y + r.h / 2 + 0.5 });

  const startPos = { ...rc(startRoom), angle: Math.random() * Math.PI * 2 };
  const exitPos  = rc(exitRoom);

  // Enemies — spread across rooms away from start
  const enemyPositions = [];
  for (let i = 0; i < numEnemies; i++) {
    const ri = 1 + (i % Math.max(1, rooms.length - 1));
    const room = rooms[Math.min(ri, rooms.length - 1)];
    enemyPositions.push({
      x: room.x + 1 + Math.random() * Math.max(0, room.w - 2) + 0.5,
      y: room.y + 1 + Math.random() * Math.max(0, room.h - 2) + 0.5,
    });
  }

  // Caches — one per ~3 rooms, min 2, not in start room
  const numCaches = Math.max(2, Math.floor(rooms.length / 3));
  const cachePositions = [];
  const usedIdx = new Set([0]);
  for (let i = 0; i < numCaches; i++) {
    let ri = 0, attempts = 0;
    while (usedIdx.has(ri) && attempts++ < 30) ri = Math.floor(Math.random() * rooms.length);
    usedIdx.add(ri);
    cachePositions.push(rc(rooms[ri]));
  }

  // Health packs — small packs in some rooms, 1 large pack
  const numSmallPacks = Math.max(1, Math.floor(rooms.length / 4));
  const healthPackPositions = [];
  const hpUsed = new Set([0]);

  for (let i = 0; i < numSmallPacks; i++) {
    let ri = 0, att = 0;
    while (hpUsed.has(ri) && att++ < 30) ri = Math.floor(Math.random() * rooms.length);
    hpUsed.add(ri);
    const r = rooms[ri];
    healthPackPositions.push({ x: r.x + r.w * 0.25 + 0.5, y: r.y + r.h * 0.75 + 0.5, size: 'small' });
  }

  // Large pack: its own room, offset from center so it doesn't overlap with a cache
  let largeRi = 0, latt = 0;
  while (hpUsed.has(largeRi) && latt++ < 30) largeRi = Math.floor(Math.random() * rooms.length);
  const lr = rooms[largeRi];
  healthPackPositions.push({ x: lr.x + lr.w / 2 + 0.5, y: lr.y + lr.h / 2 + 0.5, size: 'large' });

  // Altars — 2-3 per floor in unique rooms (not start room)
  const altarGodIds = ['mars', 'mercury', 'vulcan', 'apollo', 'minerva', 'fortuna'];
  const numAltars = 2 + Math.floor(Math.random() * 2);
  const altarPositions = [];
  const altarUsed = new Set([0]);
  for (let i = 0; i < numAltars; i++) {
    let ri = 0, att = 0;
    while (altarUsed.has(ri) && att++ < 30) ri = Math.floor(Math.random() * rooms.length);
    altarUsed.add(ri);
    const r = rooms[ri];
    const godId = altarGodIds[Math.floor(Math.random() * altarGodIds.length)];
    altarPositions.push({ x: r.x + r.w / 2 + 0.5, y: r.y + r.h / 2 + 0.5, godId });
  }

  return { cells, w, h, rooms, startPos, exitPos, enemyPositions, cachePositions, healthPackPositions, altarPositions };
}
