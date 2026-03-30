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

function roomCenter(room) {
  return { x: room.x + room.w / 2 + 0.5, y: room.y + room.h / 2 + 0.5 };
}

function classifyRooms(rooms, startRoom, exitRoom) {
  return rooms.map((room, index) => {
    if (room === startRoom) return { ...room, roomType: 'start', roomIndex: index };
    if (room === exitRoom) return { ...room, roomType: 'boss', roomIndex: index };

    const area = room.w * room.h;
    let roomType = 'skirmish';
    if (area >= 55) roomType = 'arena';
    else if (Math.min(room.w, room.h) <= 4) roomType = 'chokepoint';
    else if (Math.random() < 0.28) roomType = 'guarded';
    return { ...room, roomType, roomIndex: index };
  });
}

function pickEncounterVariant(roomType, floor) {
  const roll = Math.random();
  if (roomType === 'cacheGuard') return roll < 0.7 ? 'sentinel' : 'raider';
  if (roomType === 'chokepoint') return roll < 0.65 ? 'sentinel' : 'raider';
  if (roomType === 'arena') return floor >= 2 && roll < 0.55 ? 'charger' : roll < 0.82 ? 'raider' : 'sentinel';
  if (roomType === 'guarded') return floor >= 2 && roll < 0.45 ? 'sentinel' : 'raider';
  if (floor >= 3 && roll < 0.38) return 'charger';
  if (floor >= 2 && roll < 0.22) return 'sentinel';
  return 'raider';
}

function buildCombatRoomPool(rooms) {
  const pool = [];
  for (const room of rooms) {
    if (room.roomType === 'start' || room.roomType === 'boss') continue;
    const weight = room.roomType === 'arena'
      ? 3
      : room.roomType === 'cacheGuard'
        ? 3
        : room.roomType === 'guarded'
          ? 2
          : room.roomType === 'chokepoint'
            ? 1
            : 2;
    for (let i = 0; i < weight; i++) pool.push(room);
  }
  return pool.length > 0 ? pool : rooms.filter(r => r.roomType !== 'start' && r.roomType !== 'boss');
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isFarEnough(pos, others, minDist) {
  return others.every(other => dist(pos, other) >= minDist);
}

export function generateMap(sizeKey, numEnemies, floor = 1) {
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

  const typedRooms = classifyRooms(rooms, startRoom, exitRoom);
  const startRoomData = typedRooms.find(r => r.x === startRoom.x && r.y === startRoom.y && r.w === startRoom.w && r.h === startRoom.h) || typedRooms[0];
  const exitRoomData = typedRooms.find(r => r.x === exitRoom.x && r.y === exitRoom.y && r.w === exitRoom.w && r.h === exitRoom.h) || typedRooms[typedRooms.length - 1];

  const startPos = { ...roomCenter(startRoomData), angle: Math.random() * Math.PI * 2 };
  const exitPos  = roomCenter(exitRoomData);

  // Caches — one per ~3 rooms, min 2, not in start room
  const numCaches = Math.max(2, Math.floor(typedRooms.length / 3));
  const cachePositions = [];
  const usedIdx = new Set([0]);
  for (let i = 0; i < numCaches; i++) {
    let ri = 0, attempts = 0;
    while (usedIdx.has(ri) && attempts++ < 30) ri = Math.floor(Math.random() * typedRooms.length);
    usedIdx.add(ri);
    const room = typedRooms[ri];
    if (room.roomType === 'skirmish' || room.roomType === 'guarded') room.roomType = 'cacheGuard';
    cachePositions.push({ ...roomCenter(room), roomIndex: room.roomIndex });
  }

  // Enemies — weighted toward arenas / guarded rooms to create more intentional packs
  const enemyPositions = [];
  const combatRoomPool = buildCombatRoomPool(typedRooms);
  const eliteCandidates = typedRooms.filter(r => ['arena', 'guarded', 'cacheGuard'].includes(r.roomType));
  const eliteRoomIndex = floor >= 2 && eliteCandidates.length > 0
    ? eliteCandidates[Math.floor(Math.random() * eliteCandidates.length)].roomIndex
    : -1;
  for (let i = 0; i < numEnemies; i++) {
    const room = combatRoomPool[Math.floor(Math.random() * combatRoomPool.length)] || typedRooms[Math.min(i + 1, typedRooms.length - 1)];
    const variant = pickEncounterVariant(room.roomType, floor);
    const elite = room.roomIndex === eliteRoomIndex && !enemyPositions.some(e => e.elite);
    enemyPositions.push({
      x: room.x + 1 + Math.random() * Math.max(0, room.w - 2) + 0.5,
      y: room.y + 1 + Math.random() * Math.max(0, room.h - 2) + 0.5,
      variant,
      elite,
      roomType: room.roomType,
      roomIndex: room.roomIndex,
    });
  }

  // Health packs — small packs in some rooms, 1 large pack
  const numSmallPacks = Math.max(1, Math.floor(typedRooms.length / 4));
  const healthPackPositions = [];
  const hpUsed = new Set([0]);

  for (let i = 0; i < numSmallPacks; i++) {
    let ri = 0, att = 0;
    while (hpUsed.has(ri) && att++ < 30) ri = Math.floor(Math.random() * typedRooms.length);
    hpUsed.add(ri);
    const r = typedRooms[ri];
    healthPackPositions.push({ x: r.x + r.w * 0.25 + 0.5, y: r.y + r.h * 0.75 + 0.5, size: 'small' });
  }

  // Large pack: its own room, offset from center so it doesn't overlap with a cache
  let largeRi = 0, latt = 0;
  while (hpUsed.has(largeRi) && latt++ < 30) largeRi = Math.floor(Math.random() * typedRooms.length);
  const lr = typedRooms[largeRi];
  healthPackPositions.push({ x: lr.x + lr.w / 2 + 0.5, y: lr.y + lr.h / 2 + 0.5, size: 'large' });

  // Altars — 2-3 per floor in unique rooms (not start room)
  const altarGodIds = ['mars', 'mercury', 'vulcan', 'apollo', 'minerva', 'fortuna'];
  const numAltars = 2 + Math.floor(Math.random() * 2);
  const altarPositions = [];
  const altarUsed = new Set([0, ...cachePositions.map(p => p.roomIndex)]);
  const MIN_CACHE_ALTAR_DIST = 8;
  for (let i = 0; i < numAltars; i++) {
    let ri = 0, att = 0, chosen = null;
    while (att++ < 40) {
      ri = Math.floor(Math.random() * typedRooms.length);
      if (altarUsed.has(ri)) continue;
      const r = typedRooms[ri];
      const pos = { x: r.x + r.w / 2 + 0.5, y: r.y + r.h / 2 + 0.5, roomIndex: ri };
      if (!isFarEnough(pos, cachePositions, MIN_CACHE_ALTAR_DIST)) continue;
      if (!isFarEnough(pos, altarPositions, 6)) continue;
      chosen = pos;
      break;
    }
    if (!chosen) continue;
    altarUsed.add(chosen.roomIndex);
    const godId = altarGodIds[Math.floor(Math.random() * altarGodIds.length)];
    altarPositions.push({ x: chosen.x, y: chosen.y, godId });
  }

  return { cells, w, h, rooms: typedRooms, startPos, exitPos, enemyPositions, cachePositions, healthPackPositions, altarPositions };
}
